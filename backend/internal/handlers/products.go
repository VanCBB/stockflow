package handlers

import (
    "encoding/json"
    "errors"
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

func internalError(w http.ResponseWriter, op string, err error) {
    log.Printf("%s: %v", op, err)
    httpx.Error(w, http.StatusInternalServerError, "INTERNAL", "internal server error", nil)
}

func decodeJSON(w http.ResponseWriter, r *http.Request, v any) bool {
    if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(v); err != nil {
        httpx.Error(w, http.StatusBadRequest, "INVALID_JSON", "request body must be valid JSON with correctly typed fields", nil)
        return false
    }
    return true
}

func validationError(w http.ResponseWriter, details map[string]string) {
    httpx.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "validation failed", map[string]any{"details": details})
}

func pathID(w http.ResponseWriter, r *http.Request) (int, bool) {
    id, err := strconv.Atoi(r.PathValue("id"))
    if err != nil || id <= 0 {
        httpx.Error(w, http.StatusBadRequest, "INVALID_ID", "id must be a positive integer", nil)
        return 0, false
    }
    return id, true
}

func (h *Handler) ListProducts(w http.ResponseWriter, r *http.Request) {
    q := r.URL.Query()
    page := intParam(q.Get("page"), 1, 1, 1000000)
    limit := intParam(q.Get("limit"), 10, 1, 100)
    search := strings.TrimSpace(q.Get("search"))
    status := q.Get("status")
    switch status {
    case "", "all", "active", "inactive", "low":
    default:
        httpx.Error(w, http.StatusBadRequest, "VALIDATION_ERROR", "status must be one of: all, active, inactive, low", nil)
        return
    }

    data, total, err := h.Store.ListProducts(r.Context(), search, status, page, limit)
    if err != nil {
        internalError(w, "list products", err)
        return
    }
    httpx.JSON(w, http.StatusOK, map[string]any{"data": data, "page": page, "limit": limit, "total": total})
}

type productInput struct {
    SKU      *string `json:"sku"`
    Name     *string `json:"name"`
    Price    *int    `json:"price"`
    IsActive *bool   `json:"is_active"`
}

func (h *Handler) CreateProduct(w http.ResponseWriter, r *http.Request) {
    var in productInput
    if !decodeJSON(w, r, &in) {
        return
    }
    details := map[string]string{}
    sku, name := "", ""
    if in.SKU == nil || strings.TrimSpace(*in.SKU) == "" {
        details["sku"] = "sku is required"
    } else {
        sku = strings.TrimSpace(*in.SKU)
    }
    if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
        details["name"] = "name is required"
    } else {
        name = strings.TrimSpace(*in.Name)
    }
    if in.Price == nil {
        details["price"] = "price is required and must be an integer"
    } else if *in.Price < 0 {
        details["price"] = "price must be >= 0"
    }
    if len(details) > 0 {
        validationError(w, details)
        return
    }

    p, err := h.Store.CreateProduct(r.Context(), sku, name, *in.Price)
    if errors.Is(err, store.ErrDuplicateSKU) {
        httpx.Error(w, http.StatusConflict, "SKU_EXISTS", "a product with this sku already exists", map[string]any{"sku": sku})
        return
    }
    if err != nil {
        internalError(w, "create product", err)
        return
    }
    httpx.JSON(w, http.StatusCreated, p)
}

func (h *Handler) UpdateProduct(w http.ResponseWriter, r *http.Request) {
    id, ok := pathID(w, r)
    if !ok {
        return
    }
    var in productInput
    if !decodeJSON(w, r, &in) {
        return
    }
    details := map[string]string{}
    name := ""
    if in.Name == nil || strings.TrimSpace(*in.Name) == "" {
        details["name"] = "name is required"
    } else {
        name = strings.TrimSpace(*in.Name)
    }
    if in.Price == nil {
        details["price"] = "price is required and must be an integer"
    } else if *in.Price < 0 {
        details["price"] = "price must be >= 0"
    }
    if len(details) > 0 {
        validationError(w, details)
        return
    }

    p, err := h.Store.UpdateProduct(r.Context(), id, name, *in.Price, in.IsActive)
    if errors.Is(err, store.ErrNotFound) {
        httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "product not found", nil)
        return
    }
    if err != nil {
        internalError(w, "update product", err)
        return
    }
    httpx.JSON(w, http.StatusOK, p)
}

func (h *Handler) DeleteProduct(w http.ResponseWriter, r *http.Request) {
    id, ok := pathID(w, r)
    if !ok {
        return
    }
    err := h.Store.DeleteProduct(r.Context(), id)
    switch {
    case errors.Is(err, store.ErrNotFound):
        httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "product not found", nil)
    case errors.Is(err, store.ErrHasHistory):
        httpx.Error(w, http.StatusConflict, "PRODUCT_HAS_HISTORY", "product has movement history and cannot be deleted; deactivate it instead", nil)
    case err != nil:
        internalError(w, "delete product", err)
    default:
        w.WriteHeader(http.StatusNoContent)
    }
}