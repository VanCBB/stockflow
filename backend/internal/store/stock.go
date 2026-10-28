package store

import (
    "context"
    "errors"
    "time"

    "github.com/jackc/pgx/v5"
)

type Movement struct {
    ID        int       `json:"id"`
    ProductID int       `json:"product_id"`
    Type      string    `json:"type"`
    Qty       int       `json:"qty"`
    Note      *string   `json:"note"`
    CreatedAt time.Time `json:"created_at"`
}

// InsufficientStockError is returned when a decrement would take stock below zero.
type InsufficientStockError struct {
    SKU       string
    Available int
}

func (e *InsufficientStockError) Error() string { return "insufficient stock for " + e.SKU }

// AdjustStock changes stock and writes the movement row in ONE transaction.
// The overdraw guard is inside the UPDATE (stock >= qty), never SELECT-then-UPDATE:
// Postgres locks the row, and a concurrent writer re-evaluates the WHERE after the lock is released.
func (s *Store) AdjustStock(ctx context.Context, id int, typ string, qty int, note *string) (Product, error) {
    tx, err := s.pool.Begin(ctx)
    if err != nil {
        return Product{}, err
    }
    defer tx.Rollback(ctx)

    query := `UPDATE products SET stock = stock + $2 WHERE id = $1 RETURNING sku`
    if typ == "out" {
        query = `UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING sku`
    }

    var sku string
    err = tx.QueryRow(ctx, query, id, qty).Scan(&sku)
    if errors.Is(err, pgx.ErrNoRows) {
        // Either the product does not exist, or (for "out") there is not enough stock.
        var available int
        e2 := tx.QueryRow(ctx, `SELECT sku, stock FROM products WHERE id = $1`, id).Scan(&sku, &available)
        if errors.Is(e2, pgx.ErrNoRows) {
            return Product{}, ErrNotFound
        }
        if e2 != nil {
            return Product{}, e2
        }
        return Product{}, &InsufficientStockError{SKU: sku, Available: available}
    }
    if err != nil {
        return Product{}, err
    }

    if _, err := tx.Exec(ctx,
        `INSERT INTO stock_movements (product_id, type, qty, note) VALUES ($1, $2, $3, $4)`,
        id, typ, qty, note); err != nil {
        return Product{}, err
    }
    if err := tx.Commit(ctx); err != nil {
        return Product{}, err
    }
    return s.GetProduct(ctx, id)
}

// ListMovements returns history newest first.
func (s *Store) ListMovements(ctx context.Context, productID int) ([]Movement, error) {
    var exists bool
    if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists); err != nil {
        return nil, err
    }
    if !exists {
        return nil, ErrNotFound
    }

    rows, err := s.pool.Query(ctx,
        `SELECT id, product_id, type, qty, note, created_at FROM stock_movements
         WHERE product_id = $1 ORDER BY created_at DESC, id DESC`, productID)
    if err != nil {
        return nil, err
    }
    defer rows.Close()

    out := make([]Movement, 0)
    for rows.Next() {
        var m Movement
        if err := rows.Scan(&m.ID, &m.ProductID, &m.Type, &m.Qty, &m.Note, &m.CreatedAt); err != nil {
            return nil, err
        }
        out = append(out, m)
    }
    return out, rows.Err()
}