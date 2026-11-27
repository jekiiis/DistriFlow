'use strict';

const { getExecutor } = require('../config/db');

// Identitas produk diambil dari products agar tidak perlu tabel master baru.
const MOVEMENT_COLUMNS = `sm.id, sm.product_id, p.code AS product_code, p.name AS product_name,
  sm.qty, sm.reference, sm.type, sm.user_id,
  DATE_FORMAT(sm.created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
  p.stock AS stock_after`;

function assertTransaction(connection, functionName) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(`${functionName} memerlukan koneksi transaksi`);
  }
  return connection;
}

/** Lock barang sebelum stok dibaca/diubah di dalam transaksi barang masuk. */
async function lockProductById(id, connection) {
  const tx = assertTransaction(connection, 'lockProductById');
  const run = getExecutor(tx);
  const sql = `SELECT id, code, name, stock, is_active
    FROM products
    WHERE id = ?
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

/** Pemeriksaan duplikat nomor dokumen (peringatan, bukan pemblokiran). */
async function hasReference(reference, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COUNT(*) AS total
    FROM stock_movements
    WHERE reference = ?`;
  const [rows] = await run(sql, [reference]);

  return Number(rows[0].total) > 0;
}

/** Catatan: schema v1.0 tidak memiliki kolom note pada stock_movements. */
async function insertInMovement(connection, movement) {
  const tx = assertTransaction(connection, 'insertInMovement');
  const run = getExecutor(tx);
  const sql = `INSERT INTO stock_movements
    (product_id, user_id, type, qty, reference)
    VALUES (?, ?, 'MASUK', ?, ?)`;
  const [result] = await run(sql, [
    movement.productId,
    movement.userId,
    movement.qty,
    movement.reference
  ]);

  return Number(result.insertId);
}

async function increaseStock(connection, productId, qty) {
  const tx = assertTransaction(connection, 'increaseStock');
  const run = getExecutor(tx);
  const sql = `UPDATE products
    SET stock = stock + ?
    WHERE id = ?`;
  const [result] = await run(sql, [qty, productId]);

  return Number(result.affectedRows);
}

async function findById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${MOVEMENT_COLUMNS}
    FROM stock_movements sm
    INNER JOIN products p ON p.id = sm.product_id
    WHERE sm.id = ? AND sm.type = 'MASUK'
    LIMIT 1`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

function buildHistoryFilters(filters = {}) {
  const clauses = ["sm.type = 'MASUK'"];
  const params = [];

  const search = filters.search === undefined || filters.search === null
    ? ''
    : String(filters.search).trim();
  if (search !== '') {
    clauses.push('(sm.reference LIKE ? OR p.code LIKE ? OR p.name LIKE ?)');
    const pattern = '%' + search + '%';
    params.push(pattern, pattern, pattern);
  }

  if (filters.dateFrom) {
    clauses.push('sm.created_at >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    // Tanggal akhir mencakup seluruh hari yang diminta.
    clauses.push('DATE(sm.created_at) <= DATE(?)');
    params.push(filters.dateTo);
  }

  return { where: 'WHERE ' + clauses.join(' AND '), params };
}

async function findMasukMany(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildHistoryFilters(filters);
  const limit = filters.limit || 10;
  const offset = filters.offset || 0;
  const sql = `SELECT ${MOVEMENT_COLUMNS}
    FROM stock_movements sm
    INNER JOIN products p ON p.id = sm.product_id
    ${where}
    ORDER BY sm.created_at DESC, sm.id DESC
    LIMIT ? OFFSET ?`;
  const [rows] = await run(sql, params.concat([limit, offset]));

  return rows;
}

async function countMasuk(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildHistoryFilters(filters);
  const sql = `SELECT COUNT(*) AS total
    FROM stock_movements sm
    INNER JOIN products p ON p.id = sm.product_id
    ${where}`;
  const [rows] = await run(sql, params);

  return Number(rows[0].total);
}

module.exports = {
  lockProductById,
  hasReference,
  insertInMovement,
  increaseStock,
  findById,
  findMasukMany,
  countMasuk,
  buildHistoryFilters
};
