'use strict';

const { getExecutor } = require('../config/db');

const PRODUCT_COLUMNS = 'id, code, name, unit, price_retail, price_wholesale, stock, min_stock, is_active';
// Kolom yang boleh ditulis lewat master produk. stock sengaja tidak termasuk:
// stok awal dan perubahannya hanya berasal dari barang masuk (FR-14).
const WRITABLE_COLUMNS = ['code', 'name', 'unit', 'price_retail', 'price_wholesale', 'min_stock'];

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
  const sql = `SELECT ${PRODUCT_COLUMNS}
    FROM products
    ${where}
    ORDER BY name ASC, id ASC
    LIMIT ? OFFSET ?`;
  const [rows] = await run(sql, params.concat([limit, offset]));

  return rows;
}

async function countAll(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildActiveFilters(filters);
  const sql = `SELECT COUNT(*) AS total FROM products ${where}`;
  const [rows] = await run(sql, params);

  return Number(rows[0].total);
}

async function findActiveByCode(code, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${PRODUCT_COLUMNS}
    FROM products
    WHERE code = ? AND is_active = TRUE
    LIMIT 1`;
  const [rows] = await run(sql, [code]);

  return rows[0] || null;
}

/** Dipakai Admin untuk detail/edit; sengaja tidak menyaring is_active. */
async function findById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${PRODUCT_COLUMNS}
    FROM products
    WHERE id = ?
    LIMIT 1`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

async function create(data, connection = null) {
  const run = getExecutor(connection);
  const sql = `INSERT INTO products
    (code, name, unit, price_retail, price_wholesale, min_stock)
    VALUES (?, ?, ?, ?, ?, ?)`;
  const [result] = await run(sql, [
    data.code,
    data.name,
    data.unit,
    data.price_retail,
    data.price_wholesale,
    data.min_stock
  ]);

  return Number(result.insertId);
}

/** Hanya kolom master yang diizinkan; stock tidak pernah masuk ke UPDATE. */
async function update(id, data, connection = null) {
  const fields = WRITABLE_COLUMNS.filter((column) => data[column] !== undefined);
  if (fields.length === 0) {
    throw new Error('Tidak ada field produk yang dapat diperbarui');
  }

  const set = fields.map((column) => `${column} = ?`).join(', ');
  const params = fields.map((column) => data[column]).concat([id]);
  const run = getExecutor(connection);
  const sql = `UPDATE products SET ${set} WHERE id = ?`;
  const [result] = await run(sql, params);

  return result;
}

/** Toggle status tanpa menyentuh kolom stock. */
async function setActive(id, isActive, connection = null) {
  const run = getExecutor(connection);
  const sql = 'UPDATE products SET is_active = ? WHERE id = ?';
  const [result] = await run(sql, [isActive ? 1 : 0, id]);

  return result;
}

module.exports = {
  findMany,
  countAll,
  findActiveByCode,
  findById,
  create,
  update,
  setActive,
  // Alias mengikuti konvensi model lain (insertUser/updateUser).
  insertProduct: create,
  updateProduct: update
};
