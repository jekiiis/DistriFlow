-- =====================================================================
-- DistriFlow - 02_seed.sql
-- Data awal pengguna, barang, dan pelanggan (DPPL 2.3) sesuai DUPL Tabel 7,
-- ditambah riwayat transaksi yang dibutuhkan contoh FR-21 dan FR-22 (SKPL 4.5)
-- dan order Draft untuk pengujian UC-04. Jalankan setelah 01_schema.sql.
-- Password awal semua akun: Rahasia123 (hash bcrypt, cost 10).
-- Tanggal transaksi relatif terhadap CURDATE() supaya contoh tetap berlaku
-- kapan pun seed dijalankan.
-- =====================================================================
USE distriflow;

INSERT INTO users (id, name, username, password, role) VALUES
  (1, 'Devrosan', 'admin.devrosan', '$2b$10$he4mJNC.fE7rvSApTo0VB.gEdQCfnGJ3Cvy/0n7ALn4RVMbkFabXy', 'ADMIN'),
  (2, 'Raihan Haryo', 'sales.raihan', '$2b$10$0rnSgAOtGQnvS4/NQzTm..zcadBSncfnwcZsczqd.sg23WOkjWo8W', 'SALES'),
  (3, 'Zuriel Egan', 'kasir.zuriel', '$2b$10$blt57iTmCTyPKzDoLkFfqez13zUJEWRMJQLZJ8EtziMxHuX/LXkbq', 'KASIR'),
  (4, 'Jeki', 'gudang.jeki', '$2b$10$T9pPQb5voUIz51/OszrkIubkaUuyDp1m95LN.3yOJ9rgRsc24dtXa', 'GUDANG');

INSERT INTO customers (id, code, name, address, phone, price_level, credit_limit, payment_term_days) VALUES
  (1, 'PLG-001', 'Toko Makmur', 'Jl. Sukabirus No. 12, Bandung', '081200000001', 'GROSIR', 2500000, 30),
  (2, 'PLG-007', 'Toko Berkah', 'Jl. Telekomunikasi No. 7, Bandung', '081200000007', 'RETAIL', 5000000, 14);

INSERT INTO products (id, code, name, unit, price_retail, price_wholesale, stock, min_stock) VALUES
  (1, 'BRS-05', 'Beras Premium 5 kg', 'karung', 75000, 72000, 30, 50),
  (2, 'MYK-01', 'Minyak Goreng 1 L', 'liter', 18000, 17000, 120, 60),
  (3, 'SBN-08', 'Sabun Cuci 800 g', 'pcs', 15000, 14000, 9, 10),
  (4, 'KCP-01', 'Kecap Manis 600 ml', 'pcs', 22000, 20000, 75, 30);

-- Riwayat sales order 45 hari terakhir (contoh FR-21 dan FR-22) dan order Draft hari ini (UC-04).
-- user_id 2 = sales.raihan
SET @no1 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 45 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (1, @no1, CURDATE() - INTERVAL 45 DAY, 2, 2, 290000, 0, 290000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 45 DAY + INTERVAL 9 HOUR);
SET @no2 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 40 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (2, @no2, CURDATE() - INTERVAL 40 DAY, 1, 2, 2000000, 0, 2000000, 'KREDIT', 'PIUTANG', CURDATE() - INTERVAL 10 DAY, CURDATE() - INTERVAL 40 DAY + INTERVAL 9 HOUR);
SET @no3 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 28 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (3, @no3, CURDATE() - INTERVAL 28 DAY, 2, 2, 858000, 0, 858000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 28 DAY + INTERVAL 9 HOUR);
SET @no4 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 27 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (4, @no4, CURDATE() - INTERVAL 27 DAY, 2, 2, 1200000, 0, 1200000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 27 DAY + INTERVAL 9 HOUR);
SET @no5 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 24 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (5, @no5, CURDATE() - INTERVAL 24 DAY, 2, 2, 858000, 0, 858000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 24 DAY + INTERVAL 9 HOUR);
SET @no6 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 21 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (6, @no6, CURDATE() - INTERVAL 21 DAY, 2, 2, 1200000, 0, 1200000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 21 DAY + INTERVAL 9 HOUR);
SET @no7 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 20 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (7, @no7, CURDATE() - INTERVAL 20 DAY, 2, 2, 903000, 0, 903000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 20 DAY + INTERVAL 9 HOUR);
SET @no8 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 16 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (8, @no8, CURDATE() - INTERVAL 16 DAY, 2, 2, 858000, 0, 858000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 16 DAY + INTERVAL 9 HOUR);
SET @no9 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 14 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (9, @no9, CURDATE() - INTERVAL 14 DAY, 2, 2, 1200000, 0, 1200000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 14 DAY + INTERVAL 9 HOUR);
SET @no10 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 12 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (10, @no10, CURDATE() - INTERVAL 12 DAY, 2, 2, 858000, 0, 858000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 12 DAY + INTERVAL 9 HOUR);
SET @no11 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 8 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (11, @no11, CURDATE() - INTERVAL 8 DAY, 2, 2, 903000, 0, 903000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 8 DAY + INTERVAL 9 HOUR);
SET @no12 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 7 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (12, @no12, CURDATE() - INTERVAL 7 DAY, 2, 2, 1200000, 0, 1200000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 7 DAY + INTERVAL 9 HOUR);
SET @no13 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 4 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (13, @no13, CURDATE() - INTERVAL 4 DAY, 2, 2, 858000, 0, 858000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 4 DAY + INTERVAL 9 HOUR);
SET @no14 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 3 DAY, '%Y%m%d'), '-001');
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (14, @no14, CURDATE() - INTERVAL 3 DAY, 2, 2, 1200000, 0, 1200000, 'TUNAI', 'LUNAS', NULL, CURDATE() - INTERVAL 3 DAY + INTERVAL 9 HOUR);
SET @no15 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 0 DAY, '%Y%m%d'), '-001');  -- P5/P7/P8: total Rp750.000
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (15, @no15, CURDATE() - INTERVAL 0 DAY, 2, 2, 750000, 0, 750000, NULL, 'DRAFT', NULL, CURDATE() - INTERVAL 0 DAY + INTERVAL 9 HOUR);
SET @no16 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 0 DAY, '%Y%m%d'), '-002');  -- 3b: kredit melebihi limit
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (16, @no16, CURDATE() - INTERVAL 0 DAY, 1, 2, 720000, 0, 720000, NULL, 'DRAFT', NULL, CURDATE() - INTERVAL 0 DAY + INTERVAL 9 HOUR);
SET @no17 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 0 DAY, '%Y%m%d'), '-003');  -- 3c: kredit dibayar penuh
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (17, @no17, CURDATE() - INTERVAL 0 DAY, 2, 2, 134000, 0, 134000, NULL, 'DRAFT', NULL, CURDATE() - INTERVAL 0 DAY + INTERVAL 9 HOUR);
SET @no18 = CONCAT('SO-', DATE_FORMAT(CURDATE() - INTERVAL 0 DAY, '%Y%m%d'), '-004');  -- 4a: stok sudah berkurang (stok 9)
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date, created_at) VALUES (18, @no18, CURDATE() - INTERVAL 0 DAY, 2, 2, 180000, 0, 180000, NULL, 'DRAFT', NULL, CURDATE() - INTERVAL 0 DAY + INTERVAL 9 HOUR);

INSERT INTO sales_order_items (id, sales_order_id, product_id, qty, unit_price, discount, line_total) VALUES
  (1, 1, 4, 5, 22000, 0, 110000),
  (2, 1, 2, 10, 18000, 0, 180000),
  (3, 2, 1, 25, 72000, 0, 1800000),
  (4, 2, 4, 10, 20000, 0, 200000),
  (5, 3, 1, 10, 75000, 0, 750000),
  (6, 3, 2, 6, 18000, 0, 108000),
  (7, 4, 1, 16, 75000, 0, 1200000),
  (8, 5, 1, 10, 75000, 0, 750000),
  (9, 5, 2, 6, 18000, 0, 108000),
  (10, 6, 1, 16, 75000, 0, 1200000),
  (11, 7, 1, 10, 75000, 0, 750000),
  (12, 7, 2, 6, 18000, 0, 108000),
  (13, 7, 3, 3, 15000, 0, 45000),
  (14, 8, 1, 10, 75000, 0, 750000),
  (15, 8, 2, 6, 18000, 0, 108000),
  (16, 9, 1, 16, 75000, 0, 1200000),
  (17, 10, 1, 10, 75000, 0, 750000),
  (18, 10, 2, 6, 18000, 0, 108000),
  (19, 11, 1, 10, 75000, 0, 750000),
  (20, 11, 2, 6, 18000, 0, 108000),
  (21, 11, 3, 3, 15000, 0, 45000),
  (22, 12, 1, 16, 75000, 0, 1200000),
  (23, 13, 1, 10, 75000, 0, 750000),
  (24, 13, 2, 6, 18000, 0, 108000),
  (25, 14, 1, 16, 75000, 0, 1200000),
  (26, 15, 1, 10, 75000, 0, 750000),
  (27, 16, 1, 10, 72000, 0, 720000),
  (28, 17, 2, 5, 18000, 0, 90000),
  (29, 17, 4, 2, 22000, 0, 44000),
  (30, 18, 3, 12, 15000, 0, 180000);

-- Pembayaran dicatat oleh kasir.zuriel (user_id 3)
INSERT INTO payments (id, sales_order_id, user_id, paid_at, amount, change_amount, method) VALUES
  (1, 1, 3, CURDATE() - INTERVAL 45 DAY + INTERVAL 11 HOUR, 300000, 10000, 'TUNAI'),
  (2, 3, 3, CURDATE() - INTERVAL 28 DAY + INTERVAL 11 HOUR, 900000, 42000, 'TUNAI'),
  (3, 4, 3, CURDATE() - INTERVAL 27 DAY + INTERVAL 11 HOUR, 1200000, 0, 'TUNAI'),
  (4, 5, 3, CURDATE() - INTERVAL 24 DAY + INTERVAL 11 HOUR, 900000, 42000, 'TUNAI'),
  (5, 6, 3, CURDATE() - INTERVAL 21 DAY + INTERVAL 11 HOUR, 1200000, 0, 'TUNAI'),
  (6, 7, 3, CURDATE() - INTERVAL 20 DAY + INTERVAL 11 HOUR, 950000, 47000, 'TUNAI'),
  (7, 8, 3, CURDATE() - INTERVAL 16 DAY + INTERVAL 11 HOUR, 900000, 42000, 'TUNAI'),
  (8, 9, 3, CURDATE() - INTERVAL 14 DAY + INTERVAL 11 HOUR, 1200000, 0, 'TUNAI'),
  (9, 10, 3, CURDATE() - INTERVAL 12 DAY + INTERVAL 11 HOUR, 900000, 42000, 'TUNAI'),
  (10, 11, 3, CURDATE() - INTERVAL 8 DAY + INTERVAL 11 HOUR, 950000, 47000, 'TUNAI'),
  (11, 12, 3, CURDATE() - INTERVAL 7 DAY + INTERVAL 11 HOUR, 1200000, 0, 'TUNAI'),
  (12, 13, 3, CURDATE() - INTERVAL 4 DAY + INTERVAL 11 HOUR, 900000, 42000, 'TUNAI'),
  (13, 14, 3, CURDATE() - INTERVAL 3 DAY + INTERVAL 11 HOUR, 1200000, 0, 'TUNAI');

-- Mutasi stok: stok awal (MASUK 90 hari lalu oleh gudang.jeki) lalu KELUAR per order yang sudah dibayar
INSERT INTO stock_movements (product_id, user_id, type, qty, reference, created_at) VALUES
  (1, 4, 'MASUK', 205, 'SA-AWAL', CURDATE() - INTERVAL 90 DAY + INTERVAL 8 HOUR),
  (2, 4, 'MASUK', 172, 'SA-AWAL', CURDATE() - INTERVAL 90 DAY + INTERVAL 8 HOUR),
  (3, 4, 'MASUK', 15, 'SA-AWAL', CURDATE() - INTERVAL 90 DAY + INTERVAL 8 HOUR),
  (4, 4, 'MASUK', 90, 'SA-AWAL', CURDATE() - INTERVAL 90 DAY + INTERVAL 8 HOUR);

INSERT INTO stock_movements (product_id, user_id, type, qty, reference, created_at) VALUES
  (4, 3, 'KELUAR', 5, @no1, CURDATE() - INTERVAL 45 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 10, @no1, CURDATE() - INTERVAL 45 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 25, @no2, CURDATE() - INTERVAL 40 DAY + INTERVAL 10 HOUR),
  (4, 3, 'KELUAR', 10, @no2, CURDATE() - INTERVAL 40 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no3, CURDATE() - INTERVAL 28 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no3, CURDATE() - INTERVAL 28 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 16, @no4, CURDATE() - INTERVAL 27 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no5, CURDATE() - INTERVAL 24 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no5, CURDATE() - INTERVAL 24 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 16, @no6, CURDATE() - INTERVAL 21 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no7, CURDATE() - INTERVAL 20 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no7, CURDATE() - INTERVAL 20 DAY + INTERVAL 10 HOUR),
  (3, 3, 'KELUAR', 3, @no7, CURDATE() - INTERVAL 20 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no8, CURDATE() - INTERVAL 16 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no8, CURDATE() - INTERVAL 16 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 16, @no9, CURDATE() - INTERVAL 14 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no10, CURDATE() - INTERVAL 12 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no10, CURDATE() - INTERVAL 12 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no11, CURDATE() - INTERVAL 8 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no11, CURDATE() - INTERVAL 8 DAY + INTERVAL 10 HOUR),
  (3, 3, 'KELUAR', 3, @no11, CURDATE() - INTERVAL 8 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 16, @no12, CURDATE() - INTERVAL 7 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 10, @no13, CURDATE() - INTERVAL 4 DAY + INTERVAL 10 HOUR),
  (2, 3, 'KELUAR', 6, @no13, CURDATE() - INTERVAL 4 DAY + INTERVAL 10 HOUR),
  (1, 3, 'KELUAR', 16, @no14, CURDATE() - INTERVAL 3 DAY + INTERVAL 10 HOUR);

