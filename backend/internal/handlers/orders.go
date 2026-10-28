package handlers

import (
    "errors"
    "fmt"
    "net/http"
    "strings"

    "stockflow/internal/httpx"
    "stockflow/internal/store"
)

const maxOrderItems = 100

type orderItemInput struct {
    SKU *string `json:"sku"`
    Qty *int    `json:"qty"`
}

type orderInput struct {
    Customer *string          `json:"customer"`
    Items    []orderItemInput `json:"items"`
}

func (h *Handler) CreateOrder(w http.ResponseWriter, r *http.Request) {
    var in orderInput
    if !decodeJSON(w, r, &in) {
        return
    }

    details := map[string]string{}
    customer := ""
    if in.Customer == nil || strings.TrimSpace(*in.Customer) == "" {
        details["customer"] = "customer is required"
    } else if customer = strings.TrimSpace(*in.Customer); len(customer) > 200 {
        details["customer"] = "customer must be at most 200 characters"
    }
    if len(in.Items) == 0 {
        details["items"] = "items must contain at least one item"
    } else if len(in.Items) > maxOrderItems {
        details["items"] = fmt.Sprintf("items must contain at most %d entries", maxOrderItems)
    }

    lines := make([]store.OrderLine, 0, len(in.Items))
    seen := map[string]int{}
    for i, it := range in.Items {
        key := fmt.Sprintf("items[%d]", i)
        sku := ""
        if it.SKU == nil || strings.TrimSpace(*it.SKU) == "" {
            details[key+".sku"] = "sku is required"
        } else {
            sku = strings.TrimSpace(*it.SKU)
            if first, dup := seen[sku]; dup {
                details[key+".sku"] = fmt.Sprintf("duplicate sku %s (already in items[%d])", sku, first)
            } else {
                seen[sku] = i
            }
        }
        qty := 0
        if it.Qty == nil {
            details[key+".qty"] = "qty is required and must be an integer"
        } else if *it.Qty <= 0 {
            details[key+".qty"] = "qty must be greater than 0"
        } else if *it.Qty > maxQty {
            details[key+".qty"] = "qty is too large"
        } else {
            qty = *it.Qty
        }
        lines = append(lines, store.OrderLine{SKU: sku, Qty: qty})
    }
    if len(details) > 0 {
        validationError(w, details)
        return
    }

    o, err := h.Store.CreateOrder(r.Context(), customer, lines)
    var ise *store.InsufficientStockError
    var iie *store.InvalidItemsError
    switch {
    case errors.As(err, &ise):
        httpx.Error(w, http.StatusConflict, "INSUFFICIENT_STOCK", "not enough stock", map[string]any{
            "sku": ise.SKU, "available": ise.Available,
        })
    case errors.As(err, &iie):
        bad := map[string]string{}
        for _, s := range iie.Unknown {
            bad[s] = "unknown sku"
        }
        for _, s := range iie.Inactive {
            bad[s] = "product is inactive"
        }
        d := map[string]string{}
        for i, l := range lines {
            if msg, ok := bad[l.SKU]; ok {
                d[fmt.Sprintf("items[%d].sku", i)] = msg
            }
        }
        validationError(w, d)
    case errors.Is(err, store.ErrTotalTooLarge):
        validationError(w, map[string]string{"items": "order total is too large"})
    case err != nil:
        internalError(w, "create order", err)
    default:
        httpx.JSON(w, http.StatusCreated, o)
    }
}

func (h *Handler) GetOrder(w http.ResponseWriter, r *http.Request) {
    id, ok := pathID(w, r)
    if !ok {
        return
    }
    o, err := h.Store.GetOrder(r.Context(), id)
    if errors.Is(err, store.ErrNotFound) {
        httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "order not found", nil)
        return
    }
    if err != nil {
        internalError(w, "get order", err)
        return
    }
    httpx.JSON(w, http.StatusOK, o)
}

func (h *Handler) CancelOrder(w http.ResponseWriter, r *http.Request) {
    id, ok := pathID(w, r)
    if !ok {
        return
    }
    o, err := h.Store.CancelOrder(r.Context(), id)
    switch {
    case errors.Is(err, store.ErrNotFound):
        httpx.Error(w, http.StatusNotFound, "NOT_FOUND", "order not found", nil)
    case errors.Is(err, store.ErrAlreadyCancelled):
        httpx.Error(w, http.StatusConflict, "ORDER_ALREADY_CANCELLED", "order is already cancelled", nil)
    case err != nil:
        internalError(w, "cancel order", err)
    default:
        httpx.JSON(w, http.StatusOK, o)
    }
}