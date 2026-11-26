'use strict';

const { getExecutor } = require('../config/db');

const CUSTOMER_COLUMNS = 'id, code, name, address, phone, price_level, credit_limit, payment_term_days, is_active';

function buildActiveFilters(filters = {}) {
  const search = filters.search || '';
  const where = `WHERE is_active = TRUE
    AND (? = '' OR code LIKE ? OR name LIKE ?)`;
  const params = [search, '%' + search + '%', '%' + search + '%'];

  return { where, params };
}

async function findMany(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildActiveFilters(filters);
  const limit = filters.limit || 10;
  const offset = filters.offset || 0;
  const sql = `SELECT ${CUSTOMER_COLUMNS}
    FROM customers
    ${where}
    ORDER BY name ASC, id ASC
    LIMIT ? OFFSET ?`;
  const [rows] = await run(sql, params.concat([limit, offset]));

  return rows;
}

async function countAll(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildActiveFilters(filters);
  const sql = `SELECT COUNT(*) AS total FROM customers ${where}`;
  const [rows] = await run(sql, params);

  return Number(rows[0].total);
}

async function findActiveById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${CUSTOMER_COLUMNS}
    FROM customers
    WHERE id = ? AND is_active = TRUE
    LIMIT 1`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

/**
 * Piutang = total order PIUTANG dikurangi nominal pembayaran yang terpakai.
 * payments.amount adalah uang diterima kasir, jadi yang dikurangi adalah
 * amount - change_amount. Agregat dilakukan di database agar presisi DECIMAL
 * tidak berubah menjadi floating point JavaScript.
 */
async function sumOutstanding(customerId, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COALESCE(SUM(so.total - COALESCE(paid.total_paid, 0)), 0) AS outstanding
    FROM sales_orders so
    LEFT JOIN (
      SELECT sales_order_id, SUM(amount - change_amount) AS total_paid
      FROM payments
      GROUP BY sales_order_id
    ) paid ON paid.sales_order_id = so.id
    WHERE so.customer_id = ? AND so.status = 'PIUTANG'`;
  const [rows] = await run(sql, [customerId]);

  return rows[0] ? rows[0].outstanding : '0.00';
}

module.exports = {
  findMany,
  countAll,
  findActiveById,
  sumOutstanding
};
