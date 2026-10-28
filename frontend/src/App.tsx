import { useCallback, useEffect, useState } from "react";
import {
  type Product,
  type Movement,
  type Order,
  type Summary,
  ApiError,
} from "./types.ts";
import { api } from "./api.ts";
import { formatIDR, formatDate, formatDateTime, timeAgo } from "./utils.ts";
import { useDebounce } from "./hooks/useDebounce.ts";

// ── Toast Notification ─────────────────────────────────────────────────────
interface ToastMsg {
  id: number;
  msg: string;
  type: "success" | "error";
}

function Toast({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.type === "success" ? "✓" : "✕"}</span>
          {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Modal Dialog Wrapper ───────────────────────────────────────────────────
function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Dashboard Page ─────────────────────────────────────────────────────────
function DashboardPage({
  onToast,
}: {
  onToast: (msg: string, type?: "success" | "error") => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [recentProducts, setRecentProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, prods] = await Promise.all([
        api.getSummary(),
        api.listProducts({ limit: 5 }),
      ]);
      setSummary(sum);
      setRecentProducts(prods.data);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal memuat ringkasan";
      setError(msg);
      onToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [onToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const statCards = summary
    ? [
        {
          label: "Total Produk",
          value: summary.total_products,
          icon: "📦",
          color: "var(--blue)",
          bg: "var(--blue-bg)",
        },
        {
          label: "Produk Aktif",
          value: summary.active_products,
          icon: "✅",
          color: "var(--green)",
          bg: "var(--green-bg)",
        },
        {
          label: "Stok Menipis",
          value: summary.low_stock_count,
          icon: "⚠️",
          color: "var(--yellow)",
          bg: "var(--yellow-bg)",
        },
        {
          label: "Nilai Stok Total",
          value: formatIDR(summary.total_stock_value),
          icon: "💰",
          color: "var(--accent)",
          bg: "var(--accent-bg)",
        },
      ]
    : [];

  return (
    <div>
      <div className="page-title">Dashboard</div>
      <div className="page-subtitle">Ringkasan inventaris & status gudang</div>

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Memuat data dashboard...</p>
      ) : error ? (
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button className="btn btn-outline" onClick={() => void load()}>
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="stats-grid">
          {statCards.map((s) => (
            <div className="stat-card" key={s.label}>
              <div
                className="stat-icon"
                style={{ background: s.bg, color: s.color }}
              >
                {s.icon}
              </div>
              <div className="stat-info">
                <div className="stat-label">{s.label}</div>
                <div className="stat-value">{s.value}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>
          Produk Terbaru
        </div>
        <div className="table-wrap" style={{ border: "none" }}>
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>SKU</th>
                <th>Stok</th>
                <th>Harga</th>
                <th>Terakhir Bergerak</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentProducts.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      padding: 24,
                    }}
                  >
                    Belum ada produk
                  </td>
                </tr>
              ) : (
                recentProducts.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <span className="td-sku">{p.sku}</span>
                    </td>
                    <td>
                      <span
                        className={
                          p.stock <= 10
                            ? "badge badge-yellow"
                            : "badge badge-green"
                        }
                      >
                        {p.stock <= 10 && "⚠ "}
                        {p.stock}
                      </span>
                    </td>
                    <td>{formatIDR(p.price)}</td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {timeAgo(p.last_movement_at)}
                    </td>
                    <td>
                      <span
                        className={
                          p.is_active ? "badge badge-green" : "badge badge-gray"
                        }
                      >
                        {p.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Product Form Modal ─────────────────────────────────────────────────────
function ProductFormModal({
  product,
  onClose,
  onSaved,
}: {
  product?: Product;
  onClose: () => void;
  onSaved: (p: Product) => void;
}) {
  const editing = !!product;
  const [form, setForm] = useState({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    price: product?.price?.toString() ?? "",
    is_active: product?.is_active ?? true,
  });
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<Record<string, string>>({});

  const set = (k: string, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.sku.trim()) errs.sku = "SKU wajib diisi";
    if (!form.name.trim()) errs.name = "Nama wajib diisi";
    if (!form.price || isNaN(Number(form.price)) || Number(form.price) < 0) {
      errs.price = "Harga harus angka ≥ 0";
    }
    if (Object.keys(errs).length) {
      setErr(errs);
      return;
    }

    setLoading(true);
    try {
      let saved: Product;
      if (editing && product) {
        saved = await api.updateProduct(product.id, {
          sku: form.sku.trim(),
          name: form.name.trim(),
          price: Number(form.price),
          is_active: form.is_active,
        });
      } else {
        saved = await api.createProduct({
          sku: form.sku.trim(),
          name: form.name.trim(),
          price: Number(form.price),
        });
      }
      onSaved(saved);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.details) {
        setErr(e.details);
      } else if (e instanceof Error) {
        setErr({ _: e.message });
      } else {
        setErr({ _: "Gagal menyimpan produk" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={editing ? "Edit Produk" : "Tambah Produk"} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">SKU</label>
            <input
              className={`form-input ${err.sku ? "input-error" : ""}`}
              value={form.sku}
              onChange={(e) => set("sku", e.target.value)}
              placeholder="mis. PRD-001"
              disabled={editing}
            />
            {err.sku && <div className="form-error">{err.sku}</div>}
          </div>
          <div className="form-group">
            <label className="form-label">Nama Produk</label>
            <input
              className={`form-input ${err.name ? "input-error" : ""}`}
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="mis. Baju Kaos"
            />
            {err.name && <div className="form-error">{err.name}</div>}
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">Harga (Rp)</label>
          <input
            className={`form-input ${err.price ? "input-error" : ""}`}
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => set("price", e.target.value)}
            placeholder="50000"
          />
          {err.price && <div className="form-error">{err.price}</div>}
        </div>
        {editing && (
          <div className="form-group">
            <label className="toggle">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
              />
              <div className="toggle-track">
                <div className="toggle-thumb" />
              </div>
              <span className="toggle-label">
                {form.is_active ? "Aktif" : "Nonaktif"}
              </span>
            </label>
          </div>
        )}
        {err._ && (
          <div className="form-error" style={{ marginBottom: 8 }}>
            ⚠ {err._}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Batal
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Menyimpan..." : editing ? "Simpan" : "Tambah"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Stock Adjust Modal ─────────────────────────────────────────────────────
function StockModal({
  product,
  onClose,
  onDone,
}: {
  product: Product;
  onClose: () => void;
  onDone: () => void;
}) {
  const [type, setType] = useState<"in" | "out">("in");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qty || isNaN(Number(qty)) || Number(qty) <= 0) {
      setErr("Qty harus angka > 0");
      return;
    }
    setLoading(true);
    setErr("");
    try {
      await api.adjustStock(product.id, {
        type,
        qty: Number(qty),
        note: note.trim() || undefined,
      });
      onDone();
    } catch (e: unknown) {
      if (e instanceof ApiError && e.code === "INSUFFICIENT_STOCK") {
        setErr(`Stok tidak mencukupi (Tersedia: ${e.available ?? product.stock})`);
      } else if (e instanceof Error) {
        setErr(e.message);
      } else {
        setErr("Gagal menyesuaikan stok");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title={`Sesuaikan Stok — ${product.name}`} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["in", "out"] as const).map((t) => (
            <button
              type="button"
              key={t}
              className={`btn ${type === t ? "btn-primary" : "btn-outline"}`}
              style={
                type === t && t === "out" ? { background: "var(--red)" } : {}
              }
              onClick={() => setType(t)}
            >
              {t === "in" ? "📥 Masuk" : "📤 Keluar"}
            </button>
          ))}
          <span
            style={{
              marginLeft: "auto",
              color: "var(--text-muted)",
              fontSize: 13,
              alignSelf: "center",
            }}
          >
            Stok saat ini:{" "}
            <strong style={{ color: "var(--text)" }}>{product.stock}</strong>
          </span>
        </div>
        <div className="form-group">
          <label className="form-label">Jumlah (Qty)</label>
          <input
            className="form-input"
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="0"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Catatan (opsional)</label>
          <input
            className="form-input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="mis. Restok dari supplier"
          />
        </div>
        {err && (
          <div className="form-error" style={{ marginBottom: 8 }}>
            ⚠ {err}
          </div>
        )}
        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Batal
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={type === "out" ? { background: "var(--red)" } : {}}
          >
            {loading
              ? "Menyimpan..."
              : type === "in"
              ? "Tambah Stok"
              : "Kurangi Stok"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Movements Modal ────────────────────────────────────────────────────────
function MovementsModal({
  product,
  onClose,
}: {
  product: Product;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .listMovements(product.id)
      .then((d) => setMovements(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [product.id]);

  return (
    <Modal title={`Riwayat Stok — ${product.name}`} onClose={onClose}>
      {loading ? (
        <p
          style={{
            color: "var(--text-muted)",
            textAlign: "center",
            padding: 24,
          }}
        >
          Memuat...
        </p>
      ) : movements.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <p>Belum ada riwayat pergerakan stok</p>
        </div>
      ) : (
        <div className="movements-list">
          {movements.map((m) => (
            <div className="movement-row" key={m.id}>
              <div className={`movement-dot ${m.type}`} />
              <div className="movement-info">
                <div className="movement-note">
                  {m.note ??
                    (m.type === "in" ? "Stok masuk" : "Stok keluar")}
                </div>
              </div>
              <div className={`movement-qty ${m.type}`}>
                {m.type === "in" ? "+" : "−"}
                {m.qty}
              </div>
              <div className="movement-date">
                {formatDateTime(m.created_at)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Products Page ──────────────────────────────────────────────────────────
function ProductsPage({
  refreshKey,
  onToast,
  onStockChanged,
}: {
  refreshKey: number;
  onToast: (msg: string, type?: "success" | "error") => void;
  onStockChanged: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [movProduct, setMovProduct] = useState<Product | null>(null);

  const debouncedSearch = useDebounce(searchInput, 300);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listProducts({
        page,
        limit,
        search: debouncedSearch.trim() || undefined,
        status: status || undefined,
      });
      setProducts(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal memuat daftar produk";
      setError(msg);
      onToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, status, onToast]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const handleDelete = async (p: Product) => {
    if (!confirm(`Hapus produk "${p.name}"?`)) return;
    try {
      await api.deleteProduct(p.id);
      onToast("Produk berhasil dihapus", "success");
      onStockChanged();
      void load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menghapus produk";
      onToast(msg, "error");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div>
      <div className="page-title">Produk</div>
      <div className="page-subtitle">Kelola produk dan stok inventaris</div>

      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Cari nama atau SKU..."
          />
        </div>
        <div className="filter-pills">
          {[
            { label: "Semua", val: "" },
            { label: "Aktif", val: "active" },
            { label: "Nonaktif", val: "inactive" },
            { label: "⚠ Menipis", val: "low" },
          ].map((f) => (
            <button
              key={f.val}
              className={`pill ${status === f.val ? "active" : ""}`}
              onClick={() => {
                setStatus(f.val);
                setPage(1);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          className="btn btn-primary"
          id="add-product-btn"
          onClick={() => setShowAdd(true)}
        >
          + Tambah Produk
        </button>
      </div>

      {error ? (
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <p>{error}</p>
          <button className="btn btn-outline" onClick={() => void load()}>
            Coba Lagi
          </button>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>SKU</th>
                <th>Stok</th>
                <th>Harga</th>
                <th>Status</th>
                <th>Terakhir Bergerak</th>
                <th>Dibuat</th>
                <th style={{ textAlign: "right" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className="loading-row">
                  <td colSpan={8}>Memuat data produk...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">
                      <div className="empty-icon">📦</div>
                      <p>Produk tidak ditemukan</p>
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((p) => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.name}</td>
                    <td>
                      <span className="td-sku">{p.sku}</span>
                    </td>
                    <td>
                      {p.stock <= 10 ? (
                        <span className="badge badge-yellow">⚠ {p.stock}</span>
                      ) : (
                        <span className="badge badge-green">{p.stock}</span>
                      )}
                    </td>
                    <td>{formatIDR(p.price)}</td>
                    <td>
                      <span
                        className={
                          p.is_active ? "badge badge-green" : "badge badge-gray"
                        }
                      >
                        {p.is_active ? "Aktif" : "Nonaktif"}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {timeAgo(p.last_movement_at)}
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {formatDate(p.created_at)}
                    </td>
                    <td>
                      <div
                        style={{
                          display: "flex",
                          gap: 4,
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Riwayat stok"
                          onClick={() => setMovProduct(p)}
                        >
                          📋
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Sesuaikan stok"
                          onClick={() => setStockProduct(p)}
                        >
                          📦
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Edit"
                          onClick={() => setEditProduct(p)}
                        >
                          ✏️
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          title="Hapus"
                          style={{ color: "var(--red)" }}
                          onClick={() => void handleDelete(p)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="pagination">
        <span className="pagination-info">{total} produk ditemukan</span>
        <button
          className="btn btn-outline btn-sm"
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
        >
          ‹ Prev
        </button>
        <span
          style={{
            fontSize: 12,
            color: "var(--text-muted)",
            padding: "0 8px",
          }}
        >
          {page} / {totalPages}
        </span>
        <button
          className="btn btn-outline btn-sm"
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
        >
          Next ›
        </button>
      </div>

      {(showAdd || editProduct) && (
        <ProductFormModal
          product={editProduct ?? undefined}
          onClose={() => {
            setShowAdd(false);
            setEditProduct(null);
          }}
          onSaved={() => {
            setShowAdd(false);
            setEditProduct(null);
            onToast("Produk disimpan ✓", "success");
            onStockChanged();
            void load();
          }}
        />
      )}
      {stockProduct && (
        <StockModal
          product={stockProduct}
          onClose={() => setStockProduct(null)}
          onDone={() => {
            setStockProduct(null);
            onToast("Stok diperbarui ✓", "success");
            onStockChanged();
            void load();
          }}
        />
      )}
      {movProduct && (
        <MovementsModal
          product={movProduct}
          onClose={() => setMovProduct(null)}
        />
      )}
    </div>
  );
}

// ── Create Order Modal (with 409 & 400 Field-Level Handling) ───────────────
interface OrderLineInput {
  sku: string;
  qty: string;
}

function CreateOrderModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (o: Order) => void;
}) {
  const [customer, setCustomer] = useState("");
  const [lines, setLines] = useState<OrderLineInput[]>([{ sku: "", qty: "" }]);
  const [loading, setLoading] = useState(false);
  const [generalError, setGeneralError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [insufficientStock, setInsufficientStock] = useState<{
    sku: string;
    available: number;
  } | null>(null);

  const addLine = () => setLines((l) => [...l, { sku: "", qty: "" }]);
  const removeLine = (i: number) =>
    setLines((l) => l.filter((_, idx) => idx !== i));
  const setLine = (i: number, k: keyof OrderLineInput, v: string) => {
    setLines((l) =>
      l.map((row, idx) => (idx === i ? { ...row, [k]: v } : row))
    );
    // Clear field-specific error when user modifies line
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`items[${i}].sku`];
      delete next[`items[${i}].qty`];
      return next;
    });
    if (insufficientStock) {
      setInsufficientStock(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError("");
    setFieldErrors({});
    setInsufficientStock(null);

    const clientErrors: Record<string, string> = {};
    if (!customer.trim()) {
      clientErrors["customer"] = "Nama pelanggan wajib diisi";
    }

    const items = lines.map((l) => ({
      sku: l.sku.trim(),
      qty: Number(l.qty),
    }));

    lines.forEach((l, i) => {
      if (!l.sku.trim()) {
        clientErrors[`items[${i}].sku`] = "SKU wajib diisi";
      }
      if (!l.qty || isNaN(Number(l.qty)) || Number(l.qty) <= 0) {
        clientErrors[`items[${i}].qty`] = "Qty harus > 0";
      }
    });

    if (Object.keys(clientErrors).length > 0) {
      setFieldErrors(clientErrors);
      return;
    }

    setLoading(true);
    try {
      const order = await api.createOrder({
        customer: customer.trim(),
        items,
      });
      onCreated(order);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.code === "INSUFFICIENT_STOCK") {
          // Spec requirement: visually highlight which SKU failed + available qty
          setInsufficientStock({
            sku: err.sku ?? "",
            available: err.available ?? 0,
          });
          setGeneralError(
            `Stok untuk SKU "${err.sku}" tidak mencukupi (Tersedia: ${err.available ?? 0})`
          );
        } else if (err.code === "VALIDATION_ERROR" && err.details) {
          // Spec requirement: per-field validation error
          setFieldErrors(err.details);
          if (err.details["items"]) {
            setGeneralError(err.details["items"]);
          }
        } else {
          setGeneralError(err.message);
        }
      } else if (err instanceof Error) {
        setGeneralError(err.message);
      } else {
        setGeneralError("Terjadi kesalahan saat memproses order");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal title="Buat Order Baru" onClose={onClose}>
      <form onSubmit={(e) => void submit(e)}>
        <div className="form-group">
          <label className="form-label">Nama Pelanggan</label>
          <input
            className={`form-input ${fieldErrors["customer"] ? "input-error" : ""}`}
            value={customer}
            onChange={(e) => {
              setCustomer(e.target.value);
              setFieldErrors((prev) => {
                const next = { ...prev };
                delete next["customer"];
                return next;
              });
            }}
            placeholder="mis. Budi Santoso"
            autoFocus
          />
          {fieldErrors["customer"] && (
            <div className="form-error">{fieldErrors["customer"]}</div>
          )}
        </div>

        <div className="form-label" style={{ marginBottom: 8 }}>
          Items
        </div>
        {lines.map((line, i) => {
          const isFailingSku =
            insufficientStock &&
            line.sku.trim().toUpperCase() ===
              insufficientStock.sku.trim().toUpperCase();

          const skuErr = fieldErrors[`items[${i}].sku`];
          const qtyErr = fieldErrors[`items[${i}].qty`];

          return (
            <div key={i} style={{ marginBottom: 12 }}>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <div style={{ flex: 2 }}>
                  <input
                    className={`form-input ${
                      skuErr || isFailingSku ? "input-error" : ""
                    }`}
                    value={line.sku}
                    onChange={(e) => setLine(i, "sku", e.target.value)}
                    placeholder="SKU (mis. PRD-001)"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <input
                    className={`form-input ${qtyErr ? "input-error" : ""}`}
                    type="number"
                    min="1"
                    value={line.qty}
                    onChange={(e) => setLine(i, "qty", e.target.value)}
                    placeholder="Qty"
                  />
                </div>
                {lines.length > 1 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ color: "var(--red)", flexShrink: 0 }}
                    onClick={() => removeLine(i)}
                    aria-label="Hapus baris item"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Per-field error messages */}
              {skuErr && <div className="form-error">{skuErr}</div>}
              {qtyErr && <div className="form-error">{qtyErr}</div>}

              {/* Visual 409 highlight with available qty */}
              {isFailingSku && (
                <div className="stock-hint">
                  ⚠ Stok tidak mencukupi. Tersedia:{" "}
                  <strong>{insufficientStock.available}</strong>
                </div>
              )}
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={addLine}
          style={{ marginBottom: 16 }}
        >
          + Tambah Item
        </button>

        {generalError && (
          <div className="form-error" style={{ marginBottom: 12 }}>
            ⚠ {generalError}
          </div>
        )}

        <div className="form-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Batal
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
          >
            {loading ? "Memproses..." : "Buat Order"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ── Orders Page ────────────────────────────────────────────────────────────
function OrdersPage({
  onToast,
  onStockChanged,
}: {
  onToast: (msg: string, type?: "success" | "error") => void;
  onStockChanged: () => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [viewOrder, setViewOrder] = useState<Order | null>(null);
  const [orderId, setOrderId] = useState("");
  const [searching, setSearching] = useState(false);

  const searchOrder = async () => {
    if (!orderId.trim()) return;
    setSearching(true);
    try {
      const o = await api.getOrder(Number(orderId.trim()));
      setViewOrder(o);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Order tidak ditemukan";
      onToast(msg, "error");
    } finally {
      setSearching(false);
    }
  };

  const cancelOrder = async (id: number) => {
    if (!confirm(`Batalkan order #${id}? Stok produk akan dikembalikan.`)) return;
    try {
      const o = await api.cancelOrder(id);
      setViewOrder(o);
      onToast(`Order #${id} berhasil dibatalkan, stok dipulihkan ✓`, "success");
      // Spec requirement: automatically refresh products list to show restored stock
      onStockChanged();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal membatalkan order";
      onToast(msg, "error");
    }
  };

  return (
    <div>
      <div className="page-title">Orders</div>
      <div className="page-subtitle">Buat dan pantau pesanan penjualan</div>

      <div className="toolbar">
        <div className="search-box">
          <span className="search-icon">🔍</span>
          <input
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void searchOrder()}
            placeholder="Cari berdasar ID order (mis. 1)..."
          />
        </div>
        <button
          className="btn btn-outline"
          disabled={searching}
          onClick={() => void searchOrder()}
        >
          {searching ? "Mencari..." : "Cari"}
        </button>
        <button
          className="btn btn-primary"
          id="create-order-btn"
          onClick={() => setShowCreate(true)}
        >
          + Buat Order
        </button>
      </div>

      {viewOrder && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                Order #{viewOrder.id}
              </span>
              <span
                className={`badge ${
                  viewOrder.status === "CREATED"
                    ? "badge-green"
                    : "badge-red"
                }`}
                style={{ marginLeft: 10 }}
              >
                {viewOrder.status}
              </span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {viewOrder.status === "CREATED" && (
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() => void cancelOrder(viewOrder.id)}
                >
                  Batalkan Order
                </button>
              )}
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setViewOrder(null)}
              >
                ✕
              </button>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            <div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  marginBottom: 2,
                }}
              >
                PELANGGAN
              </div>
              <strong>{viewOrder.customer}</strong>
            </div>
            <div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  marginBottom: 2,
                }}
              >
                TANGGAL
              </div>
              {formatDateTime(viewOrder.created_at)}
            </div>
            <div>
              <div
                style={{
                  color: "var(--text-muted)",
                  fontSize: 11,
                  marginBottom: 2,
                }}
              >
                TOTAL
              </div>
              <strong style={{ color: "var(--accent)" }}>
                {formatIDR(viewOrder.total)}
              </strong>
            </div>
          </div>
          <div className="order-items-list">
            {viewOrder.items.map((it) => (
              <div className="order-item-row" key={it.sku}>
                <div>
                  <span style={{ fontWeight: 600 }}>{it.name}</span>
                  <span className="td-sku" style={{ marginLeft: 8 }}>
                    {it.sku}
                  </span>
                </div>
                <div className="order-item-meta">
                  {it.qty} × {formatIDR(it.unit_price)} ={" "}
                  <strong style={{ color: "var(--text)" }}>
                    {formatIDR(it.qty * it.unit_price)}
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>
          Panduan Manajemen Order
        </div>
        <ol
          style={{
            color: "var(--text-muted)",
            fontSize: 13,
            paddingLeft: 18,
            lineHeight: 2,
          }}
        >
          <li>
            Klik <strong style={{ color: "var(--text)" }}>+ Buat Order</strong>{" "}
            untuk memulai transaksi penjualan.
          </li>
          <li>
            Masukkan nama pelanggan dan daftar SKU beserta jumlah unit yang dibeli.
          </li>
          <li>
            Database melakukan verifikasi stok dan pengurangan secara aman
            (atomic locking).
          </li>
          <li>
            Bila stok tidak cukup, sistem menandai SKU yang bermasalah dan
            menampilkan sisa stok tersedia.
          </li>
          <li>
            Membatalkan order akan mengembalikan stok produk ke inventaris secara
            otomatis.
          </li>
        </ol>
      </div>

      {showCreate && (
        <CreateOrderModal
          onClose={() => setShowCreate(false)}
          onCreated={(o) => {
            setShowCreate(false);
            setViewOrder(o);
            onToast(`Order #${o.id} berhasil dibuat ✓`, "success");
            onStockChanged();
          }}
        />
      )}
    </div>
  );
}

// ── Root Application Component ─────────────────────────────────────────────
type Page = "dashboard" | "products" | "orders";

export default function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const triggerStockChanged = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const addToast = useCallback(
    (msg: string, type: "success" | "error" = "success") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, msg, type }]);
      setTimeout(() => {
        setToasts((t) => t.filter((x) => x.id !== id));
      }, 3500);
    },
    []
  );

  const navItems: { id: Page; icon: string; label: string }[] = [
    { id: "dashboard", icon: "📊", label: "Dashboard" },
    { id: "products", icon: "📦", label: "Produk" },
    { id: "orders", icon: "🛒", label: "Orders" },
  ];

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">📦</div>
          <span>StockFlow</span>
        </div>
        {navItems.map((n) => (
          <button
            key={n.id}
            className={`nav-item ${page === n.id ? "active" : ""}`}
            onClick={() => setPage(n.id)}
          >
            <span className="nav-icon">{n.icon}</span>
            {n.label}
          </button>
        ))}
      </aside>

      <main className="main">
        {page === "dashboard" && <DashboardPage onToast={addToast} />}
        {page === "products" && (
          <ProductsPage
            refreshKey={refreshKey}
            onToast={addToast}
            onStockChanged={triggerStockChanged}
          />
        )}
        {page === "orders" && (
          <OrdersPage
            onToast={addToast}
            onStockChanged={triggerStockChanged}
          />
        )}
      </main>

      <Toast toasts={toasts} />
    </div>
  );
}
