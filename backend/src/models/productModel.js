'use strict';

const { getExecutor } = require('../config/db');

const PRODUCT_COLUMNS = 'id, code, name, unit, price_retail, price_wholesale, stock, min_stock, is_active';

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

module.exports = {
  findMany,
  countAll,
  findActiveByCode
};
