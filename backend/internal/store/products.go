package store

import (
    "context"
    "strings"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"
)

type Store struct{ pool *pgxpool.Pool }

func New(pool *pgxpool.Pool) *Store { return &Store{pool: pool} }

type Product struct {
    ID             int        `json:"id"`
    SKU            string     `json:"sku"`
    Name           string     `json:"name"`
    Price          int        `json:"price"`
    Stock          int        `json:"stock"`
    IsActive       bool       `json:"is_active"`
    CreatedAt      time.Time  `json:"created_at"`
    LastMovementAt *time.Time `json:"last_movement_at"`
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

// ListProducts matches sku or name case-insensitively. last_movement_at is
// derived from stock_movements (MAX(created_at)), not stored on the row.
func (s *Store) ListProducts(ctx context.Context, search string, page, limit int) ([]Product, int, error) {
    pattern := "%" + likeEscaper.Replace(search) + "%"

    var total int
    err := s.pool.QueryRow(ctx,
        `SELECT COUNT(*) FROM products WHERE sku ILIKE $1 OR name ILIKE $1`, pattern).Scan(&total)
    if err != nil {
        return nil, 0, err
    }

    rows, err := s.pool.Query(ctx, `
        SELECT p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at,
               (SELECT MAX(m.created_at) FROM stock_movements m WHERE m.product_id = p.id)
        FROM products p
        WHERE p.sku ILIKE $1 OR p.name ILIKE $1
        ORDER BY p.id
        LIMIT $2 OFFSET $3`, pattern, limit, (page-1)*limit)
    if err != nil {
        return nil, 0, err
    }
    defer rows.Close()

    products := make([]Product, 0)
    for rows.Next() {
        var p Product
        if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt, &p.LastMovementAt); err != nil {
            return nil, 0, err
        }
        products = append(products, p)
    }
    return products, total, rows.Err()
}