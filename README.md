# StockFlow

StockFlow adalah aplikasi manajemen inventaris dan pemrosesan sales order full-stack yang dirancang untuk supervisor gudang. Dibangun dengan Go, PostgreSQL, React, dan TypeScript dengan penekanan pada konsistensi data (ACID), penanganan konkurensi tingkat tinggi, serta kontrak error API lintas-stack.

---

## Daftar Isi

1. [Arsitektur & Tech Stack](#arsitektur--tech-stack)
2. [Prasyarat](#prasyarat)
3. [Panduan Menjalankan Aplikasi](#panduan-menjalankan-aplikasi)
4. [Contoh cURL untuk Semua Endpoint](#contoh-curl-untuk-semua-endpoint)
5. [Keputusan Desain Rekayasa (Design Decisions)](#keputusan-desain-rekayasa-design-decisions)
6. [Pengujian (Testing)](#pengujian-testing)
7. [Hal yang Akan Ditingkatkan (Future Improvements)](#hal-yang-akan-ditingkatkan-future-improvements)
8. [Estimasi Waktu Pengerjaan (Hours Spent)](#estimasi-waktu-pengerjaan-hours-spent)

---

## Arsitektur & Tech Stack

```
stockflow/
├── backend/                  # Go service (Go 1.23+, pgx/v5)
│   ├── cmd/api/main.go       # Entrypoint HTTP server (net/http mux)
│   ├── internal/
│   │   ├── handlers/         # HTTP handlers & validasi input
│   │   ├── httpx/            # Standard JSON & error response envelopes
│   │   └── store/            # Data access layer & transaksi PostgreSQL
│   ├── migrations/           # Skema DDL & seed dataset awal
│   └── go.mod
├── frontend/                 # React 19 + TypeScript (Vite bundler)
│   ├── src/
│   │   ├── hooks/            # Custom hooks (useDebounce)
│   │   ├── api.ts            # Typed API client & ApiError handler
│   │   ├── types.ts          # Shared TypeScript domain contracts
│   │   ├── utils.ts          # Formatters (IDR, relative timeAgo)
│   │   ├── utils.test.ts     # Vitest unit test suite
│   │   ├── App.tsx           # Dashboard, Products, Orders UI
│   │   └── index.css         # Dark theme design system
│   ├── package.json
│   ├── tsconfig.app.json     # TypeScript strict mode enabled
│   └── vite.config.ts        # Proxy /api -> localhost:8080
├── docker-compose.yml        # PostgreSQL 16 dengan auto-migration & seed
└── README.md
```

- **Backend**: Go (standard library `net/http`, zero heavy framework), database driver `jackc/pgx/v5` dengan pool koneksi.
- **Database**: PostgreSQL 16 (port mapping `15432:5432`).
- **Frontend**: React 19, TypeScript (strict mode), Vite 6, Vitest.
- **Styling**: Vanilla CSS terkurasi dengan sistem token dark-theme, responsif, dan zero dependency overhead.

---

## Prasyarat

- Docker & Docker Compose
- Go 1.23 atau lebih baru
- Node.js 20+ & npm

---

## Panduan Menjalankan Aplikasi

### 1. Jalankan Database PostgreSQL

```bash
docker compose up -d
```

Database otomatis menginisialisasi skema tabel (`001_create_tables.sql`) dan data seed awal (`002_seed.sql`) pada port host **15432**.

### 2. Jalankan Backend API

```bash
cd backend
go run ./cmd/api
```

Server HTTP akan berjalan di `http://localhost:8080`.

### 3. Jalankan Frontend React

```bash
cd frontend
npm install
npm run dev
```

Aplikasi web dapat diakses di `http://localhost:5173`. Vite secara otomatis meneruskan permintaan `/api/*` ke backend `http://localhost:8080`.

---

## Contoh cURL untuk Semua Endpoint

### 1. Health Check
```bash
curl -s http://localhost:8080/api/health
```
*Respons:* `{"status":"ok"}`

### 2. Dashboard Summary
```bash
curl -s http://localhost:8080/api/summary
```
*Respons:*
```json
{
  "total_products": 13,
  "active_products": 12,
  "total_stock_value": 7520000,
  "low_stock_count": 3
}
```

### 3. List & Search Products
```bash
# Semua produk dengan pagination
curl -s "http://localhost:8080/api/products?page=1&limit=10"

# Pencarian berdasarkan SKU atau Nama
curl -s "http://localhost:8080/api/products?search=kaos"

# Filter berdasarkan status: 'active', 'inactive', 'low'
curl -s "http://localhost:8080/api/products?status=low"
```

### 4. Create Product
```bash
curl -s -X POST http://localhost:8080/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "sku": "PRD-TSHIRT-01",
    "name": "Kaos Polos Premium",
    "price": 85000
  }'
```

### 5. Update Product
```bash
curl -s -X PUT http://localhost:8080/api/products/1 \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Kaos Polos Katun Combed 30s",
    "price": 90000,
    "is_active": true
  }'
```

### 6. Delete Product
```bash
curl -s -X DELETE http://localhost:8080/api/products/99
```
*Catatan: Produk yang memiliki riwayat pergerakan stok tidak dapat dihapus (`400 HAS_HISTORY`).*

### 7. Penyesuaian Stok (Stock-In / Stock-Out)
```bash
# Tambah stok masuk (+20)
curl -s -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{
    "type": "in",
    "qty": 20,
    "note": "Restok pengiriman supplier PO-102"
  }'

# Kurangi stok keluar (-5)
curl -s -X POST http://localhost:8080/api/products/1/stock \
  -H "Content-Type: application/json" \
  -d '{
    "type": "out",
    "qty": 5,
    "note": "Penyesuaian barang rusak / afkir"
  }'
```

### 8. Riwayat Pergerakan Stok Produk
```bash
curl -s http://localhost:8080/api/products/1/movements
```

### 9. Buat Sales Order
```bash
curl -s -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer": "PT Maju Sejahtera",
    "items": [
      { "sku": "TSHIRT-BLK-M", "qty": 2 },
      { "sku": "HOODIE-GRY-L", "qty": 1 }
    ]
  }'
```
*Bila stok tidak mencukupi, API mengembalikan respons 409:*
```json
{
  "error": {
    "code": "INSUFFICIENT_STOCK",
    "message": "not enough stock",
    "sku": "TSHIRT-BLK-M",
    "available": 1
  }
}
```

### 10. Detail Order
```bash
curl -s http://localhost:8080/api/orders/1
```

### 11. Batalkan Sales Order (Restorasi Stok)
```bash
curl -s -X POST http://localhost:8080/api/orders/1/cancel
```
*Order yang berstatus CANCELLED tidak dapat dibatalkan ulang (`409 ORDER_ALREADY_CANCELLED`). Stok semua item pesanan otomatis dikembalikan secara transaksional.*

---

## Keputusan Desain Rekayasa (Design Decisions)

1. **SKU-Order Locking untuk Mencegah Deadlock pada Transaksi Konkuren**:
   - Ketika dua transaksi sales order masuk secara bersamaan memesan kombinasi item yang sama (misal Transaksi A memesan SKU-1 lalu SKU-2; Transaksi B memesan SKU-2 lalu SKU-1), deadlock pada database level dapat terjadi.
   - Solusi: Array SKU yang dipesan diurutkan secara deterministik (`sort.Slice(lines, ...)`) sebelum dilakukan penguncian baris di PostgreSQL (`SELECT ... FOR UPDATE`). Dengan urutan penguncian yang konsisten, siklus wait-for-graph dieliminasi sepenuhnya.

2. **Atomic UPDATE Guard (`WHERE stock >= qty`) vs SELECT-then-UPDATE**:
   - Membaca stok (`SELECT stock`), memeriksa di kode Go (`if stock >= qty`), lalu melakukan `UPDATE products SET stock = stock - qty` rentan terhadap *time-of-check to time-of-use (TOCTOU) race conditions*.
   - Solusi: Validasi pengurangan stok langsung dieksekusi di dalam klausul klausa SQL:
     ```sql
     UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING sku;
     ```
     Bila stok tidak mencukupi saat baris dikunci oleh PostgreSQL, kueri mengembalikan 0 baris terpengaruh (`pgx.ErrNoRows`), sehingga rollback langsung dilakukan tanpa risiko *overdraw*.

3. **`last_movement_at` Dihitung Dinamis Melalui Subquery**:
   - Kolom `last_movement_at` tidak disimpan redundan di tabel `products` untuk menghindari desinkronisasi data akibat write amplification atau transaksi gagal.
   - Kueri `ListProducts` mengevaluasi `(SELECT MAX(created_at) FROM stock_movements WHERE product_id = p.id)`. Di frontend, waktu ini diformat secara relatif ("2h ago", "just now", atau "Never").

4. **Representasi Uang dalam Integer IDR**:
   - Tipe data `FLOAT` atau `DOUBLE` memiliki kelemahan *floating-point arithmetic precision error* (misal `0.1 + 0.2 != 0.3`).
   - Seluruh harga (`price`, `total`, `unit_price`) disimpan dalam bentuk bilangan bulat integer IDR (Rupiah tidak memiliki subunit desimal aktif).

5. **Kontrak Error API Konsisten & Cross-Stack Validation**:
   - Backend memancarkan amplop seragam: `{"error": {"code": "...", "message": "...", ...}}`.
   - Frontend memiliki custom class `ApiError` yang mengekstrak field `code`, `sku`, `available`, dan `details` untuk memberikan feedback visual langsung (border merah pada input SKU yang kehabisan stok serta pesan error inline per-kolom).

---

## Pengujian (Testing)

### Backend Tests (Unit, Integration & Concurrency Race Detector)
```bash
cd backend
go test -v ./internal/store -count=1 -race
```
Mencakup pengujian integrasi PostgreSQL:
- `TestCreateOrder_InsufficientStock` (verifikasi status 409 saat qty melebihi stok)
- `TestCreateOrder_HappyPath` (verifikasi perhitungan total harga & pemotongan stok)
- `TestCancelOrder` (verifikasi pengembalian stok & idempotency pembatalan)
- `TestAdjustStock_OverdrawFails` (pencegahan overdraw stok negatif)
- `TestCreateOrder_ConcurrentRace` (menjalankan 10 goroutine serentak memperebutkan stok terbatas, memastikan 0 overselling)

### Frontend Tests (Vitest)
```bash
cd frontend
npm test
```
Mencakup pengujian fungsi murni (`timeAgo`, `formatIDR`, `formatDate`, `formatDateTime`, `ApiError`).

### Pemeriksaan Tipe TypeScript (Strict Mode)
```bash
cd frontend
npx tsc --noEmit
```

---

## Hal yang Akan Ditingkatkan (Future Improvements)

1. **Idempotency Keys**: Menambahkan header `Idempotency-Key` pada `POST /api/orders` dengan penyimpanan status request di Redis/PostgreSQL untuk mencegah double-order akibat koneksi jaringan yang drop saat klik submit.
2. **Cursor-based Pagination**: Mengganti offset-limit pagination pada produk & movements dengan cursor timestamp/ID untuk skalabilitas jutaan baris data inventaris.
3. **Autentikasi & RBAC (Role-Based Access Control)**: Memisahkan peran Staff Gudang (hanya bisa stock-in/stock-out) dan Warehouse Manager (bisa mengubah harga dan membatalkan pesanan) menggunakan JWT / session cookie.
4. **Audit Logging & Event Streaming**: Mengimplementasikan Change Data Capture (CDC) atau Outbox pattern ke Kafka/RabbitMQ untuk pelacakan analitik dan integrasi ERP eksternal.

---

## Estimasi Waktu Pengerjaan (Hours Spent)

| Tahapan Pengerjaan | Waktu |
|---|---|
| Analisis kebutuhan, perancangan skema DB, transaksi & locking strategy | 1.5 jam |
| Implementasi backend Go (store, handler, summary service, HTTP mux) | 2.5 jam |
| Pengujian integrasi backend & concurrency race test | 1.0 jam |
| Setup frontend React + TypeScript strict mode, API client & error handling | 2.0 jam |
| Implementasi UI/UX (Dashboard, Products, Orders, Modal, feedback visual 409/400) | 2.5 jam |
| Pengujian unit frontend dengan Vitest & audit kesesuaian spesifikasi | 1.0 jam |
| Penyusunan dokumentasi komprehensif & contoh cURL | 0.5 jam |
| **Total** | **~11 jam** |
