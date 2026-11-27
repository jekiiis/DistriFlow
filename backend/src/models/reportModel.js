'use strict';

const { getExecutor } = require('../config/db');

const DATE_FORMAT = '%Y-%m-%d';

// Pembayaran yang benar-benar terpakai adalah amount dikurangi kembalian.
// Subquery dibuat sekali per order agar join tidak menggandakan baris order.
const PAID_SQL = `LEFT JOIN (
    SELECT sales_order_id, SUM(amount - change_amount) AS total_paid
    FROM payments
    GROUP BY sales_order_id
  ) paid ON paid.sales_order_id = so.id`;

const PAID_OUTSTANDING_SQL = 'so.total - COALESCE(paid.total_paid, 0)';

/**
 * FR-19/FR-20: seluruh agregasi terjadi di database memakai aritmetika DECIMAL.
 * Model hanya menjalankan query; aturan bisnis dan format ada di service.
 */

/** Ringkasan omzet dan komposisi pembayaran untuk satu rentang tanggal order. */
async function aggregateSales(period, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT
      COALESCE(SUM(CASE WHEN so.status IN ('LUNAS', 'PIUTANG') THEN so.total ELSE 0 END), 0) AS omzet,
      COALESCE(SUM(CASE WHEN so.status IN ('LUNAS', 'PIUTANG') THEN 1 ELSE 0 END), 0) AS total_orders,
      COALESCE(SUM(CASE WHEN so.status = 'LUNAS' AND so.payment_type = 'TUNAI' THEN so.total ELSE 0 END), 0) AS cash_total,
      COALESCE(SUM(CASE WHEN so.status IN ('LUNAS', 'PIUTANG') AND so.payment_type = 'KREDIT' THEN so.total ELSE 0 END), 0) AS credit_total,
      COALESCE(SUM(CASE WHEN so.status = 'PIUTANG' THEN ${PAID_OUTSTANDING_SQL} ELSE 0 END), 0) AS receivables_total
    FROM sales_orders so
    ${PAID_SQL}
    WHERE so.order_date >= ? AND so.order_date <= ?`;
  const [rows] = await run(sql, [period.from, period.to]);

  return rows[0] || {};
}

/** Penjualan per produk sudah digrup di database; tidak ada batas 100 order. */
async function aggregateProducts(period, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT p.code, p.name, p.unit,
      SUM(i.qty) AS qty,
      SUM(i.line_total) AS sales
    FROM sales_order_items i
    INNER JOIN sales_orders so ON so.id = i.sales_order_id
    INNER JOIN products p ON p.id = i.product_id
    WHERE so.order_date >= ? AND so.order_date <= ?
      AND so.status IN ('LUNAS', 'PIUTANG')
    GROUP BY p.id, p.code, p.name, p.unit
    ORDER BY sales DESC, qty DESC, p.code ASC`;
  const [rows] = await run(sql, [period.from, period.to]);

  return rows;
}

/** Total unit terjual dihitung terpisah agar tidak dobel karena join items. */
async function sumProductsSold(period, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COALESCE(SUM(i.qty), 0) AS total_qty
    FROM sales_order_items i
    INNER JOIN sales_orders so ON so.id = i.sales_order_id
    WHERE so.order_date >= ? AND so.order_date <= ?
      AND so.status IN ('LUNAS', 'PIUTANG')`;
  const [rows] = await run(sql, [period.from, period.to]);

  return rows[0] ? rows[0].total_qty : 0;
}

/** Omzet harian memakai status yang sama dengan omzet keseluruhan. */
async function dailySales(period, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT DATE_FORMAT(so.order_date, ?) AS date,
      COUNT(*) AS orders,
      COALESCE(SUM(so.total), 0) AS omzet
    FROM sales_orders so
    WHERE so.order_date >= ? AND so.order_date <= ?
      AND so.status IN ('LUNAS', 'PIUTANG')
    GROUP BY so.order_date
    ORDER BY so.order_date ASC`;
  const [rows] = await run(sql, [DATE_FORMAT, period.from, period.to]);

  return rows;
}

/** KPI hari ini memakai tanggal database, bukan clock browser. */
async function todaySummary(connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT
      COALESCE(SUM(CASE WHEN so.order_date = CURDATE() AND so.status IN ('LUNAS', 'PIUTANG') THEN so.total ELSE 0 END), 0) AS omzet_today,
      COALESCE(SUM(CASE WHEN so.order_date = CURDATE() AND so.status <> 'BATAL' THEN 1 ELSE 0 END), 0) AS orders_today,
      COALESCE(SUM(CASE WHEN so.status = 'PIUTANG' AND so.due_date < CURDATE()
        THEN ${PAID_OUTSTANDING_SQL} ELSE 0 END), 0) AS overdue_total
    FROM sales_orders so
    ${PAID_SQL}
    WHERE so.order_date = CURDATE()
      OR (so.status = 'PIUTANG' AND so.due_date < CURDATE())`;
  const [rows] = await run(sql);

  return rows[0] || {};
}

async function countLowStock(connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COUNT(*) AS total
    FROM products
    WHERE is_active = TRUE AND stock <= min_stock`;
  const [rows] = await run(sql);

  return rows[0] ? rows[0].total : 0;
}

/**
 * FR-21: butuh restock bila stok <= min_stock ATAU estimasi hari habis <= 7.
 * Rata-rata pemakaian harian dihitung dari qty LUNAS+PIUTANG 30 hari terakhir
 * (30 hari kalender penuh, termasuk hari tanpa transaksi).
 */
async function countNeedRestock(urgentDays, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COUNT(*) AS total
    FROM products p
    LEFT JOIN (
      SELECT i.product_id, SUM(i.qty) AS qty_30d
      FROM sales_order_items i
      INNER JOIN sales_orders so ON so.id = i.sales_order_id
      WHERE so.status IN ('LUNAS', 'PIUTANG')
        AND so.order_date >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
        AND so.order_date <= CURDATE()
      GROUP BY i.product_id
    ) sold ON sold.product_id = p.id
    WHERE p.is_active = TRUE
      AND (p.stock <= p.min_stock
        OR (COALESCE(sold.qty_30d, 0) > 0
          AND (p.stock * 30 / sold.qty_30d) <= ?))`;
  const [rows] = await run(sql, [urgentDays]);

  return rows[0] ? rows[0].total : 0;
}

async function findLowStock(limit, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT code, name, stock, min_stock, unit
    FROM products
    WHERE is_active = TRUE AND stock <= min_stock
    ORDER BY (min_stock - stock) DESC, name ASC, id ASC
    LIMIT ?`;
  const [rows] = await run(sql, [limit]);

  return rows;
}

module.exports = {
  DATE_FORMAT,
  aggregateSales,
  aggregateProducts,
  sumProductsSold,
  dailySales,
  todaySummary,
  countLowStock,
  countNeedRestock,
  findLowStock
};
