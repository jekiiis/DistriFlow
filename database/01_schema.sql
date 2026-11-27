-- =====================================================================
-- DistriFlow - 01_schema.sql
-- Skema basis data sesuai DPPL 3.4 (MySQL 8, InnoDB, utf8mb4).
-- Jalankan di HeidiSQL (Laragon): File > Run SQL file..., lalu 02_seed.sql.
-- =====================================================================
CREATE DATABASE IF NOT EXISTS distriflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE distriflow;

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS sessions, stock_movements, payments, sales_order_items, sales_orders, products, customers, users;
SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE users (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(100) NOT NULL,
  username        VARCHAR(50)  NOT NULL UNIQUE,
  password        VARCHAR(255) NOT NULL,                 -- hash bcrypt
  role            ENUM('ADMIN','SALES','KASIR','GUDANG') NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until    DATETIME NULL,
  last_login_at   DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE customers (
  id                BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code              VARCHAR(20)  NOT NULL UNIQUE,
  name              VARCHAR(100) NOT NULL,
  address           VARCHAR(255) NULL,
  phone             VARCHAR(20)  NULL,
  price_level       ENUM('RETAIL','GROSIR') NOT NULL DEFAULT 'RETAIL',
  credit_limit      DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  payment_term_days SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE products (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code            VARCHAR(20)  NOT NULL UNIQUE,
  name            VARCHAR(100) NOT NULL,
  unit            VARCHAR(20)  NOT NULL,
  price_retail    DECIMAL(15,2) NOT NULL CHECK (price_retail > 0),
  price_wholesale DECIMAL(15,2) NOT NULL CHECK (price_wholesale > 0),
  stock           INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  min_stock       INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE sales_orders (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_no      VARCHAR(30) NOT NULL UNIQUE,              -- SO-YYYYMMDD-NNN
  order_date    DATE NOT NULL,
  customer_id   BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,                 -- Sales/Admin pembuat order
  subtotal      DECIMAL(15,2) NOT NULL,
  discount      DECIMAL(15,2) NOT NULL DEFAULT 0,
  total         DECIMAL(15,2) NOT NULL,
  payment_type  ENUM('TUNAI','KREDIT') NULL,
  status        ENUM('DRAFT','LUNAS','PIUTANG','BATAL') NOT NULL DEFAULT 'DRAFT',
  due_date      DATE NULL,
  cancel_reason VARCHAR(255) NULL,
  cancelled_by  BIGINT UNSIGNED NULL,                     -- Admin yang membatalkan
  cancelled_at  DATETIME NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id)  REFERENCES customers(id),
  FOREIGN KEY (user_id)      REFERENCES users(id),
  FOREIGN KEY (cancelled_by) REFERENCES users(id),
  INDEX idx_so_date_status (order_date, status)
) ENGINE=InnoDB;

CREATE TABLE sales_order_items (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sales_order_id BIGINT UNSIGNED NOT NULL,
  product_id     BIGINT UNSIGNED NOT NULL,
  qty            INT NOT NULL CHECK (qty > 0),
  unit_price     DECIMAL(15,2) NOT NULL,                  -- salinan harga saat transaksi
  discount       DECIMAL(15,2) NOT NULL DEFAULT 0,
  line_total     DECIMAL(15,2) NOT NULL,
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id)     REFERENCES products(id)
) ENGINE=InnoDB;

CREATE TABLE payments (
  id             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sales_order_id BIGINT UNSIGNED NOT NULL,
  user_id        BIGINT UNSIGNED NOT NULL,                -- Kasir
  paid_at        DATETIME NOT NULL,
  amount         DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  change_amount  DECIMAL(15,2) NOT NULL DEFAULT 0,
  method         ENUM('TUNAI','TRANSFER') NOT NULL,
  note           VARCHAR(255) NULL,
  idempotency_key VARBINARY(512) NULL,              -- REF:<referensi> atau AUTO:<sha256>
  request_hash   BINARY(32) NULL,                   -- sidik jari payload untuk deteksi konflik
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id),
  FOREIGN KEY (user_id)        REFERENCES users(id),
  UNIQUE KEY uq_payments_order_idem (sales_order_id, idempotency_key)
) ENGINE=InnoDB;

CREATE TABLE stock_movements (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  user_id    BIGINT UNSIGNED NOT NULL,                    -- pencatat
  type       ENUM('MASUK','KELUAR','BATAL') NOT NULL,
  qty        INT NOT NULL CHECK (qty > 0),
  reference  VARCHAR(50) NULL,                            -- no. order atau no. surat jalan
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id)    REFERENCES users(id)
) ENGINE=InnoDB;

-- Tabel sesi untuk express-mysql-session (DPPL 2.2); dihapus per pengguna saat
-- akun dinonaktifkan atau password-nya direset (User.hapusSesi).
CREATE TABLE sessions (
  session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
  expires    INT UNSIGNED NOT NULL,
  data       MEDIUMTEXT COLLATE utf8mb4_bin
) ENGINE=InnoDB;
