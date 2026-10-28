package store

import "context"

type Summary struct {
    TotalProducts  int   `json:"total_products"`
    ActiveProducts int   `json:"active_products"`
    TotalStockValue int64 `json:"total_stock_value"`
    LowStockCount  int   `json:"low_stock_count"`
}

func (s *Store) GetSummary(ctx context.Context) (Summary, error) {
    var summary Summary

    err := s.pool.QueryRow(ctx, `
        SELECT
            COUNT(*),
            COUNT(*) FILTER (WHERE is_active),
            COALESCE(SUM(price::bigint * stock), 0),
            COUNT(*) FILTER (WHERE stock <= $1)
        FROM products
    `, LowStockThreshold).Scan(
        &summary.TotalProducts,
        &summary.ActiveProducts,
        &summary.TotalStockValue,
        &summary.LowStockCount,
    )

    return summary, err
}