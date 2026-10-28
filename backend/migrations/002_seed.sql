INSERT INTO products (sku, name, price, stock, is_active) VALUES
('WH-001', 'Beras Premium 5kg',        72000,  50, TRUE),
('WH-002', 'Minyak Goreng 2L',         38000,  80, TRUE),
('WH-003', 'Gula Pasir 1kg',           17500, 100, TRUE),
('WH-004', 'Telur Ayam 1kg',           31000,  40, TRUE),
('WH-005', 'Indomie Goreng Dus',      112000,  30, TRUE),
('WH-006', 'Kopi Bubuk 200g',          24500,   8, TRUE),
('WH-007', 'Teh Celup 25s',             9500, 200, TRUE),
('WH-008', 'Sabun Cuci Piring 800ml',  18000,  60, TRUE),
('WH-009', 'Deterjen Bubuk 1kg',       29000,  45, TRUE),
('WH-010', 'Susu UHT 1L',              19500,   5, TRUE),
('WH-011', 'Tepung Terigu 1kg',        13000,  90, TRUE),
('WH-012', 'Kecap Manis 600ml',        21000,   0, FALSE),
('WH-013', 'Air Mineral Galon 19L',    22000,  10, TRUE);

-- Stok awal tercatat sebagai movement 'in' (kecuali yang stoknya 0)
INSERT INTO stock_movements (product_id, type, qty, note)
SELECT id, 'in', stock, 'initial stock' FROM products WHERE stock > 0;

-- Sample order 1 & 2
INSERT INTO sales_orders (customer, total) VALUES
('Toko Makmur Jaya', 740000),
('Warung Bu Sari',   399000);

INSERT INTO sales_order_items (order_id, sku, qty, unit_price) VALUES
(1, 'WH-001',  5, 72000),
(1, 'WH-002', 10, 38000),
(2, 'WH-003', 20, 17500),
(2, 'WH-006',  2, 24500);

-- Order mengurangi stok + nulis movement, sama seperti logic API nanti
UPDATE products p SET stock = p.stock - i.qty
FROM sales_order_items i WHERE i.sku = p.sku;

INSERT INTO stock_movements (product_id, type, qty, note)
SELECT p.id, 'out', i.qty, 'order #' || i.order_id
FROM sales_order_items i JOIN products p ON p.sku = i.sku;