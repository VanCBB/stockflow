package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "time"

    "github.com/jackc/pgx/v5/pgxpool"

    "stockflow/internal/handlers"
    "stockflow/internal/store"
)

func main() {
    dsn := os.Getenv("DATABASE_URL")
    if dsn == "" {
        dsn = "postgres://stockflow:stockflow@localhost:15432/stockflow?sslmode=disable"
    }

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    pool, err := pgxpool.New(ctx, dsn)
    if err != nil {
        log.Fatalf("connect db: %v", err)
    }
    defer pool.Close()

    if err := pool.Ping(ctx); err != nil {
        log.Fatalf("ping db: %v", err)
    }

    h := &handlers.Handler{Store: store.New(pool)}

    mux := http.NewServeMux()
    mux.HandleFunc("GET /api/health", func(w http.ResponseWriter, r *http.Request) {
        w.Header().Set("Content-Type", "application/json")
        w.Write([]byte(`{"status":"ok"}`))
    })
    mux.HandleFunc("GET /api/products", h.ListProducts)
    mux.HandleFunc("POST /api/products", h.CreateProduct)
    mux.HandleFunc("PUT /api/products/{id}", h.UpdateProduct)
    mux.HandleFunc("DELETE /api/products/{id}", h.DeleteProduct)
    mux.HandleFunc("POST /api/products/{id}/stock", h.AdjustStock)
    mux.HandleFunc("GET /api/products/{id}/movements", h.ListMovements)
    mux.HandleFunc("POST /api/orders", h.CreateOrder)
    mux.HandleFunc("GET /api/orders/{id}", h.GetOrder)
    mux.HandleFunc("POST /api/orders/{id}/cancel", h.CancelOrder)

    addr := ":8080"
    log.Printf("listening on %s", addr)
    log.Fatal(http.ListenAndServe(addr, mux))
}