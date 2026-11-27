'use strict';

const { getExecutor } = require('../config/db');

// FR-21: rata-rata penjualan memakai jendela 30 hari dan hanya order yang
// benar-benar terjual (LUNAS/PIUTANG).
const SALES_WINDOW_DAYS = 30;
const RESTOCK_STATUSES = ['LUNAS', 'PIUTANG'];

/**
 * Mengambil produk aktif yang perlu restock. Filter dan urutan urgensi
 * dihitung di database agar batas 100 baris tidak memotong baris penting.
 */
async function findNeedRestock(horizonDays = 7, limit = 100, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT id, code, name, unit, stock, min_stock, avg_daily
    FROM (
      SELECT p.id, p.code, p.name, p.unit, p.stock, p.min_stock,
        COALESCE(s.avg_daily, 0) AS avg_daily
      FROM products p
      LEFT JOIN (
        SELECT i.product_id, SUM(i.qty) / ? AS avg_daily
        FROM sales_order_items i
        INNER JOIN sales_orders so ON so.id = i.sales_order_id
        WHERE so.status IN (?, ?)
          AND so.order_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        GROUP BY i.product_id
      ) s ON s.product_id = p.id
      WHERE p.is_active = TRUE
    ) candidate
    WHERE candidate.stock <= candidate.min_stock
      OR (candidate.avg_daily > 0 AND FLOOR(candidate.stock / candidate.avg_daily) <= ?)
    ORDER BY
      (candidate.stock <= candidate.min_stock) DESC,
      (candidate.avg_daily > 0) DESC,
      FLOOR(candidate.stock / NULLIF(candidate.avg_daily, 0)) ASC,
      (candidate.min_stock - candidate.stock) DESC,
      candidate.id ASC
    LIMIT ?`;
  const [rows] = await run(sql, [
    SALES_WINDOW_DAYS,
    RESTOCK_STATUSES[0],
    RESTOCK_STATUSES[1],
    SALES_WINDOW_DAYS,
    horizonDays,
    limit
  ]);

  return rows;
}

module.exports = {
  SALES_WINDOW_DAYS,
  RESTOCK_STATUSES,
  findNeedRestock,
  findRestockProducts: findNeedRestock
};
