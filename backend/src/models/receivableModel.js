'use strict';

const { getExecutor } = require('../config/db');

const DATE_FORMAT = '%Y-%m-%d';
const DATETIME_FORMAT = '%Y-%m-%d %H:%i:%s';

function assertTransaction(connection, functionName) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(`${functionName} memerlukan koneksi transaksi`);
  }

  return connection;
}

function buildFilters(filters = {}) {
  const clauses = ['1 = 1'];
  const params = [];

  const search = filters.search === undefined || filters.search === null
    ? ''
    : String(filters.search).trim();
  if (search !== '') {
    clauses.push('(so.order_no LIKE ? OR c.code LIKE ? OR c.name LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%', '%' + search + '%');
  }

  if (filters.dateFrom) {
    clauses.push('so.order_date >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push('so.order_date <= ?');
    params.push(filters.dateTo);
  }
  if (filters.status) {
    clauses.push('so.status = ?');
    params.push(filters.status);
  }

  return { where: 'WHERE ' + clauses.join(' AND '), params };
}

// Agregat dibaca dari DECIMAL database, tidak dari floating point JavaScript.
const PAID_AGGREGATE = `SELECT sales_order_id,
      SUM(amount - change_amount) AS total_paid, COUNT(*) AS payment_count
    FROM payments
    GROUP BY sales_order_id`;

// FR-22 memakai total piutang pelanggan, bukan piutang satu order saja.
const CUSTOMER_OUTSTANDING = `LEFT JOIN (
    SELECT so2.customer_id,
        SUM(so2.total - COALESCE(paid2.total_paid, 0)) AS total_outstanding
    FROM sales_orders so2
    LEFT JOIN (
      SELECT sales_order_id, SUM(amount - change_amount) AS total_paid
      FROM payments
      GROUP BY sales_order_id
    ) paid2 ON paid2.sales_order_id = so2.id
    WHERE so2.status = 'PIUTANG'
    GROUP BY so2.customer_id
  ) customer_piutang ON customer_piutang.customer_id = so.customer_id`;

const RECEIVABLE_SELECT = `SELECT so.id, so.order_no,
    DATE_FORMAT(so.order_date, ?) AS order_date,
    so.customer_id, c.code AS customer_code, c.name AS customer_name,
    so.total, COALESCE(order_paid.total_paid, 0) AS paid,
    so.total - COALESCE(order_paid.total_paid, 0) AS outstanding,
    DATE_FORMAT(so.due_date, ?) AS due_date,
    so.status, COALESCE(order_paid.payment_count, 0) AS payment_count,
    c.credit_limit,
    COALESCE(customer_piutang.total_outstanding, 0) AS customer_outstanding
  FROM sales_orders so
  INNER JOIN customers c ON c.id = so.customer_id
  LEFT JOIN (${PAID_AGGREGATE}) order_paid ON order_paid.sales_order_id = so.id
  ${CUSTOMER_OUTSTANDING}`;

const PAYMENT_COLUMNS = `id, sales_order_id, user_id,
    DATE_FORMAT(paid_at, ?) AS paid_at,
    amount, change_amount, method, note`;

async function findMany(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildFilters(filters);
  const limit = filters.limit || 10;
  const offset = filters.offset || 0;
  const sql = `${RECEIVABLE_SELECT}
    ${where}
    ORDER BY so.order_date DESC, so.id DESC
    LIMIT ? OFFSET ?`;
  const [rows] = await run(sql, [DATE_FORMAT, DATE_FORMAT].concat(params, [limit, offset]));

  return rows;
}

async function countAll(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildFilters(filters);
  const sql = `SELECT COUNT(*) AS total
    FROM sales_orders so
    INNER JOIN customers c ON c.id = so.customer_id
    ${where}`;
  const [rows] = await run(sql, params);

  return Number(rows[0].total);
}

async function findById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `${RECEIVABLE_SELECT}
    WHERE so.id = ?
    LIMIT 1`;
  const [rows] = await run(sql, [DATE_FORMAT, DATE_FORMAT, id]);

  return rows[0] || null;
}

/** Riwayat pembayaran hasil penyelesaian piutang (termasuk yang lama). */
async function findPaymentsByOrderId(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${PAYMENT_COLUMNS}
    FROM payments
    WHERE sales_order_id = ?
    ORDER BY id ASC`;
  const [rows] = await run(sql, [DATETIME_FORMAT, id]);

  return rows;
}

/** Kunci baris order sebelum saldo dihitung ulang di dalam transaksi. */
async function lockForUpdate(id, connection) {
  const tx = assertTransaction(connection, 'lockForUpdate');
  const run = getExecutor(tx);
  const sql = `SELECT so.id, so.order_no, so.customer_id, so.total, so.status,
      DATE_FORMAT(so.due_date, ?) AS due_date
    FROM sales_orders so
    WHERE so.id = ?
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [DATE_FORMAT, id]);

  return rows[0] || null;
}

async function sumPaidByOrderId(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COALESCE(SUM(amount - change_amount), 0) AS total_paid,
      COUNT(*) AS payment_count
    FROM payments
    WHERE sales_order_id = ?`;
  const [rows] = await run(sql, [id]);

  return rows[0] || { total_paid: 0, payment_count: 0 };
}

/**
 * Idempotency utama: kunci biner unik per order. SELECT ini memakai FOR UPDATE
 * agar dua request bersamaan tidak membaca snapshot lama sebelum UNIQUE
 * constraint menjadi pertahanan kedua.
 */
async function findPaymentByKey(connection, input) {
  const tx = assertTransaction(connection, 'findPaymentByKey');
  const run = getExecutor(tx);
  const sql = `SELECT ${PAYMENT_COLUMNS}, request_hash
    FROM payments
    WHERE sales_order_id = ?
      AND idempotency_key = ?
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [DATETIME_FORMAT, input.orderId, input.key]);

  return rows[0] || null;
}

/**
 * Kompatibilitas untuk baris lama yang dibuat sebelum kolom idempotency
 * ditambahkan. Hanya dipakai dalam jendela 60 detik seperti perilaku lama;
 * baris baru selalu memiliki idempotency_key dan dicek lewat findPaymentByKey.
 */
async function findRecentPayment(connection, input) {
  const tx = assertTransaction(connection, 'findRecentPayment');
  const run = getExecutor(tx);
  const prefix = input.prefix;
  const sql = `SELECT ${PAYMENT_COLUMNS}
    FROM payments
    WHERE sales_order_id = ?
      AND amount = ?
      AND change_amount = ?
      AND method = ?
      AND SUBSTRING(note, 1, CHAR_LENGTH(?)) = ?
      AND paid_at >= DATE_SUB(NOW(), INTERVAL 60 SECOND)
      AND idempotency_key IS NULL
    ORDER BY id DESC
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [
    DATETIME_FORMAT,
    input.orderId,
    input.amount,
    input.changeAmount,
    input.method,
    prefix,
    prefix
  ]);

  return rows[0] || null;
}

async function insertPayment(connection, payment) {
  const tx = assertTransaction(connection, 'insertPayment');
  const run = getExecutor(tx);
  const sql = `INSERT INTO payments
    (sales_order_id, user_id, paid_at, amount, change_amount, method, note,
      idempotency_key, request_hash)
    VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?)`;
  const [result] = await run(sql, [
    payment.orderId,
    payment.userId,
    payment.amount,
    payment.changeAmount,
    payment.method,
    payment.note || null,
    payment.idempotencyKey,
    payment.requestHash
  ]);

  return Number(result.insertId);
}

/** Status hanya diubah saat saldo baru tepat nol. */
async function markSettled(id, connection) {
  const tx = assertTransaction(connection, 'markSettled');
  const run = getExecutor(tx);
  const sql = `UPDATE sales_orders
    SET status = 'LUNAS'
    WHERE id = ? AND status = 'PIUTANG'`;
  const [result] = await run(sql, [id]);

  return Number(result.affectedRows);
}

async function findPaymentById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT p.id, p.sales_order_id, p.user_id,
      DATE_FORMAT(p.paid_at, ?) AS paid_at,
      p.amount, p.change_amount, p.method, p.note,
      so.order_no, DATE_FORMAT(so.order_date, ?) AS order_date,
      so.customer_id, so.total, so.status,
      c.code AS customer_code, c.name AS customer_name
    FROM payments p
    INNER JOIN sales_orders so ON so.id = p.sales_order_id
    INNER JOIN customers c ON c.id = so.customer_id
    WHERE p.id = ?
    LIMIT 1`;
  const [rows] = await run(sql, [DATETIME_FORMAT, DATE_FORMAT, id]);

  return rows[0] || null;
}

/** Total pembayaran yang terpakai sampai pembayaran ini (running total). */
async function sumAppliedUpToPayment(orderId, paymentId, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT COALESCE(SUM(amount - change_amount), 0) AS total_paid,
      COUNT(*) AS payment_count
    FROM payments
    WHERE sales_order_id = ? AND id <= ?`;
  const [rows] = await run(sql, [orderId, paymentId]);

  return rows[0] || { total_paid: 0, payment_count: 0 };
}

module.exports = {
  DATE_FORMAT,
  DATETIME_FORMAT,
  findMany,
  countAll,
  findById,
  findPaymentsByOrderId,
  lockForUpdate,
  sumPaidByOrderId,
  findPaymentByKey,
  findRecentPayment,
  insertPayment,
  markSettled,
  findPaymentById,
  sumAppliedUpToPayment
};
