package store

import (
    "context"
    "errors"
    "strings"
    "time"

    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgconn"
    "github.com/jackc/pgx/v5/pgxpool"
)

var (
    ErrNotFound     = errors.New("not found")
    ErrDuplicateSKU = errors.New("duplicate sku")
    ErrHasHistory   = errors.New("product has history")
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

// last_movement_at is derived from stock_movements (MAX(created_at)), never stored on the row.
const productCols = `p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at,
    (SELECT MAX(m.created_at) FROM stock_movements m WHERE m.product_id = p.id)`

func scanProduct(row pgx.Row) (Product, error) {
    var p Product
    err := row.Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt, &p.LastMovementAt)
    return p, err
}

func pgCode(err error) string {
    var pe *pgconn.PgError
    if errors.As(err, &pe) {
        return pe.Code
    }
    return ""
}

var likeEscaper = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)

const LowStockThreshold = 10

// status: "", "all", "active", "inactive", "low". Filtering is server-side so total/pagination stay correct.
func (s *Store) ListProducts(ctx context.Context, search, status string, page, limit int) ([]Product, int, error) {
    pattern := "%" + likeEscaper.Replace(search) + "%"
    where := "(p.sku ILIKE $1 OR p.name ILIKE $1)"
    switch status {
    case "active":
        where += " AND p.is_active"
    case "inactive":
        where += " AND NOT p.is_active"
    case "low":
        where += " AND p.stock <= 10"
    }

    var total int
    if err := s.pool.QueryRow(ctx, `SELECT COUNT(*) FROM products p WHERE `+where, pattern).Scan(&total); err != nil {
        return nil, 0, err
    }

    rows, err := s.pool.Query(ctx,
        `SELECT `+productCols+` FROM products p WHERE `+where+` ORDER BY p.id LIMIT $2 OFFSET $3`,
        pattern, limit, (page-1)*limit)
    if err != nil {
        return nil, 0, err
    }
    defer rows.Close()

    products := make([]Product, 0)
    for rows.Next() {
        p, err := scanProduct(rows)
        if err != nil {
            return nil, 0, err
        }
        products = append(products, p)
    }
    return products, total, rows.Err()
}

func (s *Store) GetProduct(ctx context.Context, id int) (Product, error) {
    p, err := scanProduct(s.pool.QueryRow(ctx, `SELECT `+productCols+` FROM products p WHERE p.id = $1`, id))
    if errors.Is(err, pgx.ErrNoRows) {
        return Product{}, ErrNotFound
    }
    return p, err
}

func (s *Store) CreateProduct(ctx context.Context, sku, name string, price int) (Product, error) {
    var id int
    err := s.pool.QueryRow(ctx,
        `INSERT INTO products (sku, name, price) VALUES ($1, $2, $3) RETURNING id`, sku, name, price).Scan(&id)
    if err != nil {
        if pgCode(err) == "23505" {
            return Product{}, ErrDuplicateSKU
        }
        return Product{}, err
    }
    return s.GetProduct(ctx, id)
}

// UpdateProduct changes name, price and (optionally) is_active.
// SKU and stock are deliberately not editable here: SKU is referenced by order items,
// and stock only changes through stock movements or orders.
func (s *Store) UpdateProduct(ctx context.Context, id int, name string, price int, isActive *bool) (Product, error) {
    tag, err := s.pool.Exec(ctx,
        `UPDATE products SET name = $2, price = $3, is_active = COALESCE($4, is_active) WHERE id = $1`,
        id, name, price, isActive)
    if err != nil {
        return Product{}, err
    }
    if tag.RowsAffected() == 0 {
        return Product{}, ErrNotFound
    }
    return s.GetProduct(ctx, id)
}

// DeleteProduct refuses when the product has movement history (history is never deleted).
// The guard lives inside the DELETE itself, with the FK as a second safety net.
func (s *Store) DeleteProduct(ctx context.Context, id int) error {
    tag, err := s.pool.Exec(ctx,
        `DELETE FROM products p WHERE p.id = $1
         AND NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.product_id = p.id)`, id)
    if err != nil {
        if pgCode(err) == "23503" {
            return ErrHasHistory
        }
        return err
    }
    if tag.RowsAffected() > 0 {
        return nil
    }
    var exists bool
    if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM products WHERE id = $1)`, id).Scan(&exists); err != nil {
        return err
    }
    if exists {
        return ErrHasHistory
    }
    return ErrNotFound
}