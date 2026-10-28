export interface Product {
  id: number;
  sku: string;
  name: string;
  price: number;
  stock: number;
  is_active: boolean;
  created_at: string;
  last_movement_at: string | null;
}

export type MovementType = "in" | "out";

export interface Movement {
  id: number;
  product_id: number;
  type: MovementType;
  qty: number;
  note: string | null;
  created_at: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  qty: number;
  unit_price: number;
}

export type OrderStatus = "CREATED" | "CANCELLED";

export interface Order {
  id: number;
  customer: string;
  status: OrderStatus;
  total: number;
  created_at: string;
  cancelled_at: string | null;
  items: OrderItem[];
}

export interface Summary {
  total_products: number;
  active_products: number;
  total_stock_value: number;
  low_stock_count: number;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message?: string;
    sku?: string;
    available?: number;
    details?: Record<string, string>;
    [key: string]: unknown;
  };
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly sku?: string;
  readonly available?: number;
  readonly details?: Record<string, string>;

  constructor(
    message: string,
    code: string,
    status: number,
    opts?: {
      sku?: string;
      available?: number;
      details?: Record<string, string>;
    }
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.sku = opts?.sku;
    this.available = opts?.available;
    this.details = opts?.details;
  }
}

export interface CreateProductInput {
  sku: string;
  name: string;
  price: number;
}

export interface UpdateProductInput {
  sku?: string;
  name?: string;
  price?: number;
  is_active?: boolean;
}

export interface AdjustStockInput {
  type: MovementType;
  qty: number;
  note?: string;
}

export interface CreateOrderItemInput {
  sku: string;
  qty: number;
}

export interface CreateOrderInput {
  customer: string;
  items: CreateOrderItemInput[];
}

export interface ProductListResponse {
  data: Product[];
  total: number;
  limit: number;
  offset: number;
}

export interface ProductQueryParams {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}
