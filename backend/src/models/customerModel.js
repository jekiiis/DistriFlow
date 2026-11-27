'use strict';

const { getExecutor } = require('../config/db');

const CUSTOMER_COLUMNS = 'id, code, name, address, phone, price_level, credit_limit, payment_term_days, is_active';
const WRITABLE_COLUMNS = ['code', 'name', 'address', 'phone', 'price_level', 'credit_limit', 'payment_term_days'];

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

/** Dipakai Admin untuk detail/edit; piutang lama tetap terbaca walau nonaktif. */
async function findById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${CUSTOMER_COLUMNS}
    FROM customers
    WHERE id = ?
    LIMIT 1`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

async function create(data, connection = null) {
  const run = getExecutor(connection);
  const sql = `INSERT INTO customers
    (code, name, address, phone, price_level, credit_limit, payment_term_days)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const [result] = await run(sql, [
    data.code,
    data.name,
    data.address,
    data.phone,
    data.price_level,
    data.credit_limit,
    data.payment_term_days
  ]);

  return Number(result.insertId);
}

async function update(id, data, connection = null) {
  const fields = WRITABLE_COLUMNS.filter((column) => data[column] !== undefined);
  if (fields.length === 0) {
    throw new Error('Tidak ada field pelanggan yang dapat diperbarui');
  }

  const set = fields.map((column) => `${column} = ?`).join(', ');
  const params = fields.map((column) => data[column]).concat([id]);
  const run = getExecutor(connection);
  const sql = `UPDATE customers SET ${set} WHERE id = ?`;
  const [result] = await run(sql, params);

  return result;
}

async function setActive(id, isActive, connection = null) {
  const run = getExecutor(connection);
  const sql = 'UPDATE customers SET is_active = ? WHERE id = ?';
  const [result] = await run(sql, [isActive ? 1 : 0, id]);

  return result;
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
  findById,
  create,
  update,
  setActive,
  sumOutstanding,
  // Alias mengikuti konvensi model lain (insertUser/updateUser).
  insertCustomer: create,
  updateCustomer: update
};
