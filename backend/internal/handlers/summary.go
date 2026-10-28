package handlers

import (
	"net/http"

	"stockflow/internal/httpx"
)

func (h *Handler) GetSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.Store.GetSummary(r.Context())
	if err != nil {
		internalError(w, "get summary", err)
		return
	}
	httpx.JSON(w, http.StatusOK, summary)
}
