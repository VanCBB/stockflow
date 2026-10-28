package store

import (
	"context"
	"errors"
	"os"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Integration tests against a real PostgreSQL (the docker-compose db on host port 15432).
// They use a separate database, stockflow_test, so dev data is never touched.
const (
    adminDSN = "postgres://stockflow:stockflow@localhost:15432/postgres?sslmode=disable"
    testDSN  = "postgres://stockflow:stockflow@localhost:15432/stockflow_test?sslmode=disable"
)

func newTestStore(t *testing.T) (*Store, *pgxpool.Pool) {
    t.Helper()
    ctx := context.Background()

    admin, err := pgxpool.New(ctx, adminDSN)
    if err != nil {
        t.Fatalf("connect admin db (is docker compose up?): %v", err)
    }
    var exists bool
    if err := admin.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'stockflow_test')`).Scan(&exists); err != nil {
        admin.Close()
        t.Fatalf("check test db (is docker compose up?): %v", err)
    }
    if !exists {
        if _, err := admin.Exec(ctx, `CREATE DATABASE stockflow_test`); err != nil {
            admin.Close()
            t.Fatalf("create test db: %v", err)
        }
    }
    admin.Close()

    pool, err := pgxpool.New(ctx, testDSN)
    if err != nil {
        t.Fatalf("connect test db: %v", err)
    }
    t.Cleanup(pool.Close)

    schema, err := os.ReadFile("../../migrations/001_create_tables.sql")
    if err != nil {
        t.Fatalf("read migration: %v", err)
    }
    if _, err := pool.Exec(ctx, `DROP SCHEMA public CASCADE; CREATE SCHEMA public;`); err != nil {
        t.Fatalf("reset schema: %v", err)
    }
    if _, err := pool.Exec(ctx, string(schema)); err != nil {
        t.Fatalf("apply migration: %v", err)
    }
    return New(pool), pool
}

func seedProduct(t *testing.T, pool *pgxpool.Pool, sku, name string, price, stock int) {
    t.Helper()
    if _, err := pool.Exec(context.Background(),
        `INSERT INTO products (sku, name, price, stock) VALUES ($1, $2, $3, $4)`, sku, name, price, stock); err != nil {
        t.Fatalf("seed %s: %v", sku, err)
    }
}

func scalar(t *testing.T, pool *pgxpool.Pool, query string, args ...any) int {
    t.Helper()
    var n int
    if err := pool.QueryRow(context.Background(), query, args...).Scan(&n); err != nil {
        t.Fatalf("query %q: %v", query, err)
    }
    return n
}

func stockOf(t *testing.T, pool *pgxpool.Pool, sku string) int {
    t.Helper()
    return scalar(t, pool, `SELECT stock FROM products WHERE sku = $1`, sku)
}

// (a) Insufficient stock is rejected and NOTHING is written, even for items that were
// processed before the failing one (A-1 sorts first, so it is decremented, then B-1 fails).
func TestCreateOrder_InsufficientStock_WritesNothing(t *testing.T) {
    s, pool := newTestStore(t)
    seedProduct(t, pool, "A-1", "Alpha", 1000, 5)
    seedProduct(t, pool, "B-1", "Beta", 2000, 1)

    _, err := s.CreateOrder(context.Background(), "Cust", []OrderLine{
        {SKU: "A-1", Qty: 2},
        {SKU: "B-1", Qty: 5},
    })

    var ise *InsufficientStockError
    if !errors.As(err, &ise) {
        t.Fatalf("expected InsufficientStockError, got %v", err)
    }
    if ise.SKU != "B-1" || ise.Available != 1 {
        t.Errorf("got sku=%s available=%d, want B-1 / 1", ise.SKU, ise.Available)
    }
    if got := stockOf(t, pool, "A-1"); got != 5 {
        t.Errorf("A-1 stock = %d, want 5 (rolled back)", got)
    }
    if got := stockOf(t, pool, "B-1"); got != 1 {
        t.Errorf("B-1 stock = %d, want 1", got)
    }
    for _, table := range []string{"sales_orders", "sales_order_items", "stock_movements"} {
        if n := scalar(t, pool, `SELECT COUNT(*) FROM `+table); n != 0 {
            t.Errorf("%s has %d rows, want 0", table, n)
        }
    }
}

// (b) Happy path: stock decremented, movements written, prices and total computed server-side.
func TestCreateOrder_HappyPath(t *testing.T) {
    s, pool := newTestStore(t)
    seedProduct(t, pool, "A-1", "Alpha", 1500, 10)
    seedProduct(t, pool, "B-1", "Beta", 2500, 4)

    o, err := s.CreateOrder(context.Background(), "Cust", []OrderLine{
        {SKU: "A-1", Qty: 3},
        {SKU: "B-1", Qty: 2},
    })
    if err != nil {
        t.Fatalf("create order: %v", err)
    }
    if o.Status != "CREATED" || o.Total != 3*1500+2*2500 {
        t.Errorf("status=%s total=%d, want CREATED / %d", o.Status, o.Total, 3*1500+2*2500)
    }
    if len(o.Items) != 2 || o.Items[0].UnitPrice != 1500 || o.Items[1].UnitPrice != 2500 {
        t.Errorf("unexpected items: %+v", o.Items)
    }
    if got := stockOf(t, pool, "A-1"); got != 7 {
        t.Errorf("A-1 stock = %d, want 7", got)
    }
    if got := stockOf(t, pool, "B-1"); got != 2 {
        t.Errorf("B-1 stock = %d, want 2", got)
    }
    if n := scalar(t, pool, `SELECT COUNT(*) FROM stock_movements WHERE type = 'out'`); n != 2 {
        t.Errorf("out movements = %d, want 2", n)
    }
}

func TestCancelOrder_RestoresStock_AndRejectsSecondCancel(t *testing.T) {
    s, pool := newTestStore(t)
    seedProduct(t, pool, "A-1", "Alpha", 1500, 10)

    o, err := s.CreateOrder(context.Background(), "Cust", []OrderLine{{SKU: "A-1", Qty: 4}})
    if err != nil {
        t.Fatalf("create order: %v", err)
    }
    if got := stockOf(t, pool, "A-1"); got != 6 {
        t.Fatalf("stock after order = %d, want 6", got)
    }

    c, err := s.CancelOrder(context.Background(), o.ID)
    if err != nil {
        t.Fatalf("cancel: %v", err)
    }
    if c.Status != "CANCELLED" || c.CancelledAt == nil {
        t.Errorf("status=%s cancelled_at=%v", c.Status, c.CancelledAt)
    }
    if got := stockOf(t, pool, "A-1"); got != 10 {
        t.Errorf("stock after cancel = %d, want 10", got)
    }
    if n := scalar(t, pool, `SELECT COUNT(*) FROM stock_movements WHERE type = 'in'`); n != 1 {
        t.Errorf("in movements = %d, want 1", n)
    }

    if _, err := s.CancelOrder(context.Background(), o.ID); !errors.Is(err, ErrAlreadyCancelled) {
        t.Errorf("second cancel: got %v, want ErrAlreadyCancelled", err)
    }
    if got := stockOf(t, pool, "A-1"); got != 10 {
        t.Errorf("stock after second cancel = %d, want still 10", got)
    }
}

func TestAdjustStock_Overdraw_WritesNothing(t *testing.T) {
    s, pool := newTestStore(t)
    seedProduct(t, pool, "A-1", "Alpha", 1500, 3)
    id := scalar(t, pool, `SELECT id FROM products WHERE sku = 'A-1'`)

    _, err := s.AdjustStock(context.Background(), id, "out", 5, nil)
    var ise *InsufficientStockError
    if !errors.As(err, &ise) || ise.Available != 3 {
        t.Fatalf("expected InsufficientStockError{available:3}, got %v", err)
    }
    if got := stockOf(t, pool, "A-1"); got != 3 {
        t.Errorf("stock = %d, want 3", got)
    }
    if n := scalar(t, pool, `SELECT COUNT(*) FROM stock_movements`); n != 0 {
        t.Errorf("movements = %d, want 0", n)
    }
}

// Concurrency: 40 simultaneous orders of qty 1 against stock 10.
// Exactly 10 may succeed, 30 must get INSUFFICIENT_STOCK, and stock must end at exactly 0.
func TestCreateOrder_Concurrent_NeverOversells(t *testing.T) {
    s, pool := newTestStore(t)
    seedProduct(t, pool, "HOT-1", "Hot item", 1000, 10)

    const workers = 40
    var ok, insufficient, other atomic.Int32
    var wg sync.WaitGroup
    start := make(chan struct{})

    for i := 0; i < workers; i++ {
        wg.Add(1)
        go func() {
            defer wg.Done()
            <-start
            _, err := s.CreateOrder(context.Background(), "Cust", []OrderLine{{SKU: "HOT-1", Qty: 1}})
            var ise *InsufficientStockError
            switch {
            case err == nil:
                ok.Add(1)
            case errors.As(err, &ise):
                insufficient.Add(1)
            default:
                other.Add(1)
                t.Errorf("unexpected error: %v", err)
            }
        }()
    }
    close(start)
    wg.Wait()

    if ok.Load() != 10 || insufficient.Load() != workers-10 || other.Load() != 0 {
        t.Errorf("ok=%d insufficient=%d other=%d, want 10 / %d / 0", ok.Load(), insufficient.Load(), other.Load(), workers-10)
    }
    if got := stockOf(t, pool, "HOT-1"); got != 0 {
        t.Errorf("final stock = %d, want 0", got)
    }
    if n := scalar(t, pool, `SELECT COUNT(*) FROM sales_orders`); n != 10 {
        t.Errorf("orders = %d, want 10", n)
    }
    if n := scalar(t, pool, `SELECT COUNT(*) FROM stock_movements WHERE type = 'out'`); n != 10 {
        t.Errorf("out movements = %d, want 10", n)
    }
}

// Orders touching the same two SKUs in opposite request order must not deadlock
// (CreateOrder locks rows in SKU order) and must all succeed when stock is plentiful.
func TestCreateOrder_Concurrent_OppositeItemOrder_NoDeadlock(t *testing.T) {
    s, pool := newTestStore(t)
    seedProduct(t, pool, "X-1", "X", 1000, 1000)
    seedProduct(t, pool, "Y-1", "Y", 1000, 1000)

    const perSide = 20
    var failed atomic.Int32
    var wg sync.WaitGroup
    start := make(chan struct{})

    run := func(lines []OrderLine) {
        defer wg.Done()
        <-start
        if _, err := s.CreateOrder(context.Background(), "Cust", lines); err != nil {
            failed.Add(1)
            t.Errorf("order failed: %v", err)
        }
    }
    for i := 0; i < perSide; i++ {
        wg.Add(2)
        go run([]OrderLine{{SKU: "X-1", Qty: 1}, {SKU: "Y-1", Qty: 1}})
        go run([]OrderLine{{SKU: "Y-1", Qty: 1}, {SKU: "X-1", Qty: 1}})
    }
    close(start)
    wg.Wait()

    if failed.Load() != 0 {
        t.Fatalf("%d orders failed", failed.Load())
    }
    if got := stockOf(t, pool, "X-1"); got != 1000-2*perSide {
        t.Errorf("X-1 stock = %d, want %d", got, 1000-2*perSide)
    }
    if got := stockOf(t, pool, "Y-1"); got != 1000-2*perSide {
        t.Errorf("Y-1 stock = %d, want %d", got, 1000-2*perSide)
    }
}