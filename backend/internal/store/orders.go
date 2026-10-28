package store

import (
    "context"
    "errors"
    "fmt"
    "math"
    "sort"
    "time"

    "github.com/jackc/pgx/v5"
)

var (
    ErrAlreadyCancelled = errors.New("order already cancelled")
    ErrTotalTooLarge    = errors.New("order total too large")
)

type OrderItem struct {
    SKU       string `json:"sku"`
    Name      string `json:"name"`
    Qty       int    `json:"qty"`
    UnitPrice int    `json:"unit_price"`
}

type Order struct {
    ID          int         `json:"id"`
    Customer    string      `json:"customer"`
    Status      string      `json:"status"`
    Total       int         `json:"total"`
    CreatedAt   time.Time   `json:"created_at"`
    CancelledAt *time.Time  `json:"cancelled_at"`
    Items       []OrderItem `json:"items"`
}

type OrderLine struct {
    SKU string
    Qty int
}

// InvalidItemsError: SKUs that do not exist or are inactive (reported as 400, nothing written).
type InvalidItemsError struct {
    Unknown  []string
    Inactive []string
}

func (e *InvalidItemsError) Error() string { return "invalid order items" }

// CreateOrder decrements stock for ALL items atomically in one transaction.
// Each decrement is a guarded UPDATE (stock >= qty), never SELECT-then-UPDATE.
// Lines are processed in SKU order so concurrent orders lock rows in the same order (no deadlocks).
// unit_price comes from the products row returned by the same UPDATE that decrements stock.
func (s *Store) CreateOrder(ctx context.Context, customer string, lines []OrderLine) (Order, error) {
    sorted := make([]OrderLine, len(lines))
    copy(sorted, lines)
    sort.Slice(sorted, func(i, j int) bool { return sorted[i].SKU < sorted[j].SKU })

    skus := make([]string, len(sorted))
    for i, l := range sorted {
        skus[i] = l.SKU
    }

    // Validate before writing anything: unknown / inactive SKUs.
    active := map[string]bool{}
    rows, err := s.pool.Query(ctx, `SELECT sku, is_active FROM products WHERE sku = ANY($1)`, skus)
    if err != nil {
        return Order{}, err
    }
    for rows.Next() {
        var sku string
        var a bool
        if err := rows.Scan(&sku, &a); err != nil {
            rows.Close()
            return Order{}, err
        }
        active[sku] = a
    }
    rows.Close()
    if err := rows.Err(); err != nil {
        return Order{}, err
    }
    var bad InvalidItemsError
    for _, sku := range skus {
        a, ok := active[sku]
        if !ok {
            bad.Unknown = append(bad.Unknown, sku)
        } else if !a {
            bad.Inactive = append(bad.Inactive, sku)
        }
    }
    if len(bad.Unknown)+len(bad.Inactive) > 0 {
        return Order{}, &bad
    }

    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return Order{}, err
    }
    defer tx.Rollback(ctx)

    type priced struct{ productID, price int }
    items := make([]priced, 0, len(sorted))
    total := 0

    for _, l := range sorted {
        var pid, price int
        err := tx.QueryRow(ctx,
            `UPDATE products SET stock = stock - $2
             WHERE sku = $1 AND is_active AND stock >= $2
             RETURNING id, price`, l.SKU, l.Qty).Scan(&pid, &price)
        if errors.Is(err, pgx.ErrNoRows) {
            var available int
            var isActive bool
            e2 := tx.QueryRow(ctx, `SELECT stock, is_active FROM products WHERE sku = $1`, l.SKU).Scan(&available, &isActive)
            if errors.Is(e2, pgx.ErrNoRows) {
                return Order{}, &InvalidItemsError{Unknown: []string{l.SKU}}
            }
            if e2 != nil {
                return Order{}, e2
            }
            if !isActive {
                return Order{}, &InvalidItemsError{Inactive: []string{l.SKU}}
            }
            return Order{}, &InsufficientStockError{SKU: l.SKU, Available: available}
        }
        if err != nil {
            return Order{}, err
        }
        items = append(items, priced{pid, price})
        total += l.Qty * price
        if total > math.MaxInt32 {
            return Order{}, ErrTotalTooLarge
        }
    }

    var orderID int
    if err := tx.QueryRow(ctx,
        `INSERT INTO sales_orders (customer, total) VALUES ($1, $2) RETURNING id`, customer, total).Scan(&orderID); err != nil {
        return Order{}, err
    }
    note := fmt.Sprintf("order #%d", orderID)
    for i, l := range sorted {
        if _, err := tx.Exec(ctx,
            `INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES ($1, $2, $3, $4)`,
            orderID, l.SKU, l.Qty, items[i].price); err != nil {
            return Order{}, err
        }
        if _, err := tx.Exec(ctx,
            `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, 'out', $2, $3)`,
            items[i].productID, l.Qty, note); err != nil {
            return Order{}, err
        }
    }
    if err := tx.Commit(ctx); err != nil {
        return Order{}, err
    }
    return s.GetOrder(ctx, orderID)
}

func (s *Store) GetOrder(ctx context.Context, id int) (Order, error) {
    var o Order
    err := s.pool.QueryRow(ctx,
        `SELECT id, customer, status, total, created_at, cancelled_at FROM sales_orders WHERE id = $1`, id).
        Scan(&o.ID, &o.Customer, &o.Status, &o.Total, &o.CreatedAt, &o.CancelledAt)
    if errors.Is(err, pgx.ErrNoRows) {
        return Order{}, ErrNotFound
    }
    if err != nil {
        return Order{}, err
    }

    rows, err := s.pool.Query(ctx,
        `SELECT i.sku, p.name, i.qty, i.unit_price
         FROM sales_order_items i JOIN products p ON p.sku = i.sku
         WHERE i.order_id = $1 ORDER BY i.id`, id)
    if err != nil {
        return Order{}, err
    }
    defer rows.Close()
    o.Items = make([]OrderItem, 0)
    for rows.Next() {
        var it OrderItem
        if err := rows.Scan(&it.SKU, &it.Name, &it.Qty, &it.UnitPrice); err != nil {
            return Order{}, err
        }
        o.Items = append(o.Items, it)
    }
    return o, rows.Err()
}

// CancelOrder flips status and restores stock in one transaction.
// The status flip is a guarded UPDATE (status = 'CREATED'), so concurrent double-cancels
// cannot both succeed: the second one waits on the row lock, re-checks, and gets ErrAlreadyCancelled.
func (s *Store) CancelOrder(ctx context.Context, id int) (Order, error) {
    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return Order{}, err
    }
    defer tx.Rollback(ctx)

    var got int
    err = tx.QueryRow(ctx,
        `UPDATE sales_orders SET status = 'CANCELLED', cancelled_at = now()
         WHERE id = $1 AND status = 'CREATED' RETURNING id`, id).Scan(&got)
    if errors.Is(err, pgx.ErrNoRows) {
        var exists bool
        if e2 := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sales_orders WHERE id = $1)`, id).Scan(&exists); e2 != nil {
            return Order{}, e2
        }
        if !exists {
            return Order{}, ErrNotFound
        }
        return Order{}, ErrAlreadyCancelled
    }
    if err != nil {
        return Order{}, err
    }

    rows, err := tx.Query(ctx, `SELECT sku, qty FROM sales_order_items WHERE order_id = $1 ORDER BY sku`, id)
    if err != nil {
        return Order{}, err
    }
    var lines []OrderLine
    for rows.Next() {
        var l OrderLine
        if err := rows.Scan(&l.SKU, &l.Qty); err != nil {
            rows.Close()
            return Order{}, err
        }
        lines = append(lines, l)
    }
    rows.Close()
    if err := rows.Err(); err != nil {
        return Order{}, err
    }

    note := fmt.Sprintf("cancel order #%d", id)
    for _, l := range lines {
        var pid int
        if err := tx.QueryRow(ctx,
            `UPDATE products SET stock = stock + $2 WHERE sku = $1 RETURNING id`, l.SKU, l.Qty).Scan(&pid); err != nil {
            return Order{}, err
        }
        if _, err := tx.Exec(ctx,
            `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, 'in', $2, $3)`,
            pid, l.Qty, note); err != nil {
            return Order{}, err
        }
    }
    if err := tx.Commit(ctx); err != nil {
        return Order{}, err
    }
    return s.GetOrder(ctx, id)
}