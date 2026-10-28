package handlers

import (
    "errors"
    "net/http"
    "strings"

    "stockflow/internal/httpx"
    "stockflow/internal/store"
)

const maxQty = 1000000

type stockInput struct {
    Type *string `json:"type"`
    Qty  *int    `json:"qty"`
    Note *string `json:"note"`
}

func (h *Handler) AdjustStock(w http.ResponseWriter, r *http.Request) {
    id, ok := pathID(w, r)
    if !ok {
        return
    }
    var in stockInput
    if !decodeJSON(w, r, &in) {
        return
    }

    details := map[string]string{}
    typ := ""
    if in.Type == nil || (*in.Type != "in" && *in.Type != "out") {
        details["type"] = `type must be "in" or "out"`
    } else {
        typ = *in.Type
    }
    if in.Qty == nil {
        details["qty"] = "qty is required and must be an integer"
    } else if *in.Qty <= 0 {
        details["qty"] = "qty must be greater than 0"
    } else if *in.Qty > maxQty {
        details["qty"] = "qty is too large"
    }
    var note *string
    if in.Note != nil {
        n := strings.TrimSpace(*in.Note)
        if len(n) > 500 {
            details["note"] = "note must be at most 500 characters"
        } else if n != "" {
            note = &n
        }
    }
    if len(details) > 0 {
        validationError(w, details)
        return
    }

    p, err := h.Store.AdjustStock(r.Context(), id, typ, *in.Qty, note)
    var ise *store.InsufficientStockError
    switch {
    case errors.As(err, &ise):
        httpx.Error(w, http.StatusConflict, "INSUFFICIENT_STOCK", "not enough stock", map[string]any{
            "sku": ise.SKU, "available": ise.Available,
        })
    case errors.Is(err, store.ErrNotFound):
        httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "product not found", nil)
    case err != nil:
        internalError(w, "adjust stock", err)
    default:
        httpx.JSON(w, http.StatusOK, p)
    }
}

func (h *Handler) ListMovements(w http.ResponseWriter, r *http.Request) {
    id, ok := pathID(w, r)
    if !ok {
        return
    }
    data, err := h.Store.ListMovements(r.Context(), id)
    if errors.Is(err, store.ErrNotFound) {
        httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "product not found", nil)
        return
    }
    if err != nil {
        internalError(w, "list movements", err)
        return
    }
    httpx.JSON(w, http.StatusOK, map[string]any{"data": data})
}