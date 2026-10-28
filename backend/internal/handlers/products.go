package handlers

import (
    "log"
    "net/http"
    "strconv"
    "strings"

    "stockflow/internal/httpx"
    "stockflow/internal/store"
)

type Handler struct{ Store *store.Store }

func intParam(raw string, def, min, max int) int {
    n, err := strconv.Atoi(raw)
    if err != nil {
        return def
    }
    if n < min {
        return min
    }
    if n > max {
        return max
    }
    return n
}

func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query()
    page := intParam(q.Get("page"), 1, 1, 1000000)
    limit := intParam(q.Get("limit"), 10, 1, 100)
    search := strings.TrimSpace(q.Get("search"))

    data, total, err := h.Store.ListProducts(r.Context(), search, page, limit)
    if err != nil {
        log.Printf("list products: %v", err)
        httpx.Error(w, http.StatusInternalServerError, "INTERNAL", "internal server error", nil)
        return
    }
    httpx.JSON(w, http.StatusOK, map[string]any{
        "data": data, "page": page, "limit": limit, "total": total,
    })
}