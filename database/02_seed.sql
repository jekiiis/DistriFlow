-- DistriFlow - Sprint 0 seed data
-- Data kanonik disepakati dalam analisis visual Figma (Revisi C).
-- Password akun demo disimpan dalam bentuk hash bcrypt cost 10.
-- Tanggal referensi data contoh: 12/11/2026.
-- SO-20261112-001: DRAFT saat dibuat, lalu LUNAS setelah pembayaran tunai Rp800.000
--                  dengan kembalian Rp50.000. Tidak ada baris "dibayar tetapi masih DRAFT".
-- FR-22: PLG-001 outstanding Rp2.000.000 >= 80% x Rp2.500.000 = Rp2.000.000 => Berisiko.
--        PLG-004 credit_limit = 0 => kondisi rasio dilewati (tanpa pembagian dengan nol).

USE distriflow;

-- ---------------------------------------------------------------------------
-- 1. users (4 akun demo, satu per peran)
-- ---------------------------------------------------------------------------
INSERT INTO users (id, name, username, password, role, is_active) VALUES
(1, 'Devrosan', 'devrosan', '$2b$10$VqLZZKvrX1o9Vjb5EyDx2O1YJWuFkZEy8vV5ccDj80CBlJh4sb1NS', 'ADMIN', TRUE),
(2, 'Raihan Haryo', 'raihan', '$2b$10$VqLZZKvrX1o9Vjb5EyDx2O1YJWuFkZEy8vV5ccDj80CBlJh4sb1NS', 'SALES', TRUE),
(3, 'Zuriel Egan', 'zuriel', '$2b$10$VqLZZKvrX1o9Vjb5EyDx2O1YJWuFkZEy8vV5ccDj80CBlJh4sb1NS', 'KASIR', TRUE),
(4, 'Jeki', 'jeki', '$2b$10$VqLZZKvrX1o9Vjb5EyDx2O1YJWuFkZEy8vV5ccDj80CBlJh4sb1NS', 'GUDANG', TRUE);

-- ---------------------------------------------------------------------------
-- 2. customers (8 pelanggan, campuran RETAIL/GROSIR, termasuk limit 0)
-- ---------------------------------------------------------------------------
INSERT INTO customers (id, code, name, address, phone, price_level, credit_limit, payment_term_days, is_active) VALUES
(1, 'PLG-001', 'Toko Makmur', 'Jl. Sudirman No. 12, Bandung', '022-4200110', 'GROSIR', 2500000.00, 14, TRUE),
(2, 'PLG-002', 'Toko Sumber Reje', 'Jl. Ahmad Yani No. 8, Bandung', '022-4200111', 'RETAIL', 1000000.00, 14, TRUE),
(3, 'PLG-003', 'CV Sinar Abadi', 'Jl. Gatot Subroto No. 21, Bandung', '022-4200112', 'GROSIR', 5000000.00, 30, TRUE),
(4, 'PLG-004', 'Toko Melati', 'Jl. Cihampelas No. 5, Bandung', '022-4200113', 'RETAIL', 0.00, 0, TRUE),
(5, 'PLG-005', 'Toko Rizky', 'Jl. Dago No. 33, Bandung', '022-4200114', 'RETAIL', 750000.00, 7, TRUE),
(6, 'PLG-006', 'PT Maju Jaya', 'Jl. Pasteur No. 17, Bandung', '022-4200115', 'GROSIR', 10000000.00, 30, TRUE),
(7, 'PLG-007', 'Toko Berkah', 'Jl. Cibadak No. 44, Bandung', '022-4200116', 'RETAIL', 5000000.00, 14, TRUE),
(8, 'PLG-008', 'Toko Baru', 'Jl. Braga No. 9, Bandung', '022-4200117', 'RETAIL', 500000.00, 14, TRUE);

-- ---------------------------------------------------------------------------
-- 3. products (20 barang; tanpa kolom kategori/rak sesuai DPPL)
-- ---------------------------------------------------------------------------
INSERT INTO products (id, code, name, unit, price_retail, price_wholesale, stock, min_stock, is_active) VALUES
(1,  'BRS-05', 'Beras Premium 5 kg', 'karung', 75000.00, 72000.00, 30, 50, TRUE),
(2,  'SBN-08', 'Sabun Cuci 800 g', 'pcs', 15000.00, 14000.00, 9, 10, TRUE),
(3,  'MYK-01', 'Minyak Goreng 1 L', 'pcs', 18000.00, 17000.00, 48, 20, TRUE),
(4,  'KCP-01', 'Kecap Manis 600 ml', 'botol', 22000.00, 20000.00, 36, 12, TRUE),
(5,  'GUL-01', 'Gula Pasir 1 kg', 'karung', 16000.00, 15000.00, 60, 25, TRUE),
(6,  'TPG-01', 'Tepung Terigu 1 kg', 'karung', 14000.00, 13000.00, 55, 25, TRUE),
(7,  'AIR-01', 'Air Mineral 600 ml', 'dus', 24000.00, 22000.00, 40, 15, TRUE),
(8,  'KPI-01', 'Kopi Instant 10 sachet', 'renceng', 12000.00, 11000.00, 80, 30, TRUE),
(9,  'THT-01', 'Teh Hitam 25 sachet', 'renceng', 10000.00, 9000.00, 70, 25, TRUE),
(10, 'MIE-01', 'Mi Instan 5 pcs', 'renceng', 11000.00, 10000.00, 90, 30, TRUE),
(11, 'SUS-01', 'Susu Kental Manis 370 g', 'kaleng', 18000.00, 17000.00, 45, 15, TRUE),
(12, 'ROK-01', 'Rokok Filter 16 batang', 'bungkus', 28000.00, 27000.00, 100, 40, TRUE),
(13, 'OLI-01', 'Oli Mesin 350 ml', 'botol', 35000.00, 33000.00, 25, 10, TRUE),
(14, 'BTR-01', 'Baterai AA 4 pcs', 'pak', 20000.00, 18000.00, 50, 20, TRUE),
(15, 'SAB-01', 'Sampo 170 ml', 'botol', 15000.00, 14000.00, 60, 20, TRUE),
(16, 'PGT-01', 'Pasta Gigi 100 g', 'tube', 12000.00, 11000.00, 75, 25, TRUE),
(17, 'LAM-01', 'Lampu LED 5 W', 'pcs', 18000.00, 16000.00, 30, 12, TRUE),
(18, 'KER-01', 'Kertas Tissue 200 lembar', 'pak', 22000.00, 20000.00, 35, 15, TRUE),
(19, 'KRM-01', 'Krim Sehat 30 g', 'tube', 16000.00, 15000.00, 40, 15, TRUE),
(20, 'BSK-01', 'Biskuit 200 g', 'bungkus', 14000.00, 13000.00, 85, 30, TRUE);

-- ---------------------------------------------------------------------------
-- 4. sales_orders
-- ---------------------------------------------------------------------------
-- SO-20261112-001: sudah melalui pembayaran => status akhir LUNAS.
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date) VALUES
(1, 'SO-20261112-001', '2026-11-12', 7, 2, 750000.00, 0.00, 750000.00, 'TUNAI', 'LUNAS', NULL);

-- SO-20261003-001: kredit jatuh tempo 17/10/2026, belum lunas => piutang Rp2.000.000.
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date) VALUES
(2, 'SO-20261003-001', '2026-10-03', 1, 2, 2000000.00, 0.00, 2000000.00, 'KREDIT', 'PIUTANG', '2026-10-17');

-- SO-20261112-002: contoh order DRAFT (belum ada pembayaran).
INSERT INTO sales_orders (id, order_no, order_date, customer_id, user_id, subtotal, discount, total, payment_type, status, due_date) VALUES
(3, 'SO-20261112-002', '2026-11-12', 2, 2, 150000.00, 0.00, 150000.00, NULL, 'DRAFT', NULL);

-- ---------------------------------------------------------------------------
-- 5. sales_order_items
-- ---------------------------------------------------------------------------
INSERT INTO sales_order_items (sales_order_id, product_id, qty, unit_price, discount, line_total) VALUES
(1, 1, 10, 75000.00, 0.00, 750000.00),
(2, 1, 25, 72000.00, 0.00, 1800000.00),
(2, 4, 10, 20000.00, 0.00, 200000.00),
(3, 2, 10, 15000.00, 0.00, 150000.00);

-- ---------------------------------------------------------------------------
-- 6. payments
-- ---------------------------------------------------------------------------
-- Pembayaran tunai Rp800.000, kembalian Rp50.000.
INSERT INTO payments (sales_order_id, user_id, paid_at, amount, change_amount, method, note) VALUES
(1, 3, '2026-11-12 14:32:08', 800000.00, 50000.00, 'TUNAI', 'Pembayaran di loket kasir');

-- ---------------------------------------------------------------------------
-- 7. stock_movements (sengaja kosong pada seed awal)
-- ---------------------------------------------------------------------------
-- Baris movement dibuat oleh fitur UC-05 pada Sprint 3, bukan oleh seed Sprint 0.
