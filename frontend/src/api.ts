import {
  ApiError,
  type ApiErrorResponse,
  type Product,
  type Movement,
  type Order,
  type Summary,
  type CreateProductInput,
  type UpdateProductInput,
  type AdjustStockInput,
  type CreateOrderInput,
  type ProductListResponse,
  type ProductQueryParams,
} from "./types.ts";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let errCode = "UNKNOWN_ERROR";
    let message = `Request failed with status ${response.status}`;
    let sku: string | undefined;
    let available: number | undefined;
    let details: Record<string, string> | undefined;

    try {
      const body = (await response.json()) as ApiErrorResponse;
      if (body?.error) {
        errCode = body.error.code ?? errCode;
        message = body.error.message ?? message;
        sku = typeof body.error.sku === "string" ? body.error.sku : undefined;
        available = typeof body.error.available === "number" ? body.error.available : undefined;
        details = body.error.details;
      }
    } catch {
      // Body is not JSON
    }

    throw new ApiError(message, errCode, response.status, {
      sku,
      available,
      details,
    });
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export const api = {
  getSummary(): Promise<Summary> {
    return request<Summary>("/api/summary");
  },

  listProducts(params?: ProductQueryParams & { page?: number; limit?: number }): Promise<ProductListResponse> {
    const sp = new URLSearchParams();
    if (params?.search) sp.set("search", params.search);
    if (params?.status) sp.set("status", params.status);
    if (params?.page) sp.set("page", String(params.page));
    if (params?.limit) sp.set("limit", String(params.limit));

    const qs = sp.toString();
    return request<ProductListResponse>(qs ? `/api/products?${qs}` : "/api/products");
  },

  createProduct(data: CreateProductInput): Promise<Product> {
    return request<Product>("/api/products", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  updateProduct(id: number, data: UpdateProductInput): Promise<Product> {
    return request<Product>(`/api/products/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  deleteProduct(id: number): Promise<void> {
    return request<void>(`/api/products/${id}`, {
      method: "DELETE",
    });
  },

  adjustStock(id: number, data: AdjustStockInput): Promise<Product> {
    return request<Product>(`/api/products/${id}/stock`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  async listMovements(productId: number): Promise<Movement[]> {
    const res = await request<{ data: Movement[] }>(`/api/products/${productId}/movements`);
    return res.data;
  },

  getOrder(id: number): Promise<Order> {
    return request<Order>(`/api/orders/${id}`);
  },

  createOrder(data: CreateOrderInput): Promise<Order> {
    return request<Order>("/api/orders", {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  cancelOrder(id: number): Promise<Order> {
    return request<Order>(`/api/orders/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
