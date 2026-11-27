'use strict';

const { getExecutor } = require('../config/db');
const customerModel = require('./customerModel');
const productModel = require('./productModel');

const STATUS_DRAFT = 'DRAFT';
const STATUS_PIUTANG = 'PIUTANG';
const STATUS_BATAL = 'BATAL';
// FR-09: hanya DRAFT dan PIUTANG yang boleh dibatalkan Admin.
const CANCELLABLE_STATUSES = [STATUS_DRAFT, STATUS_PIUTANG];
// Format tampilan tanggal header adalah YYYY-MM-DD.
const DATE_FORMAT = '%Y-%m-%d';
// Nomor order memakai YYYYMMDD sesuai konvensi SO-YYYYMMDD-NNN.
const ORDER_DATE_FORMAT = '%Y%m%d';

// users.id adalah BIGINT UNSIGNED AUTO_INCREMENT, sehingga 0 aman sebagai
// batas bawah untuk memilih satu baris mutex yang sama pada setiap transaksi.
const MUTEX_MIN_USER_ID = 0;

function assertTransaction(connection, functionName) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(`${functionName} memerlukan koneksi transaksi`);
  }

  return connection;
}

/** Pelanggan aktif dipakai ulang dari model Task 2.1 agar kolomnya konsisten. */
async function findActiveCustomerById(id, connection = null) {
  return customerModel.findActiveById(id, connection);
}

/** Produk aktif dipakai ulang dari model Task 2.1 agar kolomnya konsisten. */
async function findActiveProductByCode(code, connection = null) {
  return productModel.findActiveByCode(code, connection);
}

/** Tanggal order berasal dari database, bukan dari clock/browser client. */
async function getOrderDate(connection = null) {
  const run = getExecutor(connection);
  const sql = 'SELECT DATE_FORMAT(CURDATE(), ?) AS order_date';
  const [rows] = await run(sql, [ORDER_DATE_FORMAT]);

  return rows[0] ? rows[0].order_date : null;
}

/**
 * Mengunci satu baris users sebagai mutex global nomor order. Kunci ini
 * diambil sebelum query nomor terakhir; SELECT MAX(order_no) FOR UPDATE saja
 * tidak cukup karena tidak mengunci apa pun bila belum ada order hari itu.
 */
async function lockOrderNumberMutex(connection) {
  const tx = assertTransaction(connection, 'lockOrderNumberMutex');
  const run = getExecutor(tx);
  const sql = `SELECT id
    FROM users
    WHERE id > ?
    ORDER BY id ASC
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [MUTEX_MIN_USER_ID]);

  if (!rows[0]) {
    throw new Error('Baris mutex nomor order tidak tersedia');
  }

  return rows[0].id;
}

/**
 * Nomor terakhir diurutkan berdasarkan suffix numerik, bukan lexicographic,
 * agar 1000 tidak dianggap lebih kecil dari 999.
 */
async function findLastOrderNo(orderDate, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT order_no
    FROM sales_orders
    WHERE order_date = ? AND order_no LIKE ?
    ORDER BY CAST(SUBSTRING_INDEX(order_no, '-', -1) AS UNSIGNED) DESC
    LIMIT 1`;
  const [rows] = await run(sql, [orderDate, `SO-${orderDate}-%`]);

  return rows[0] ? rows[0].order_no : null;
}

/** Header selalu DRAFT; payment_type dan due_date belum diisi pada task ini. */
async function insertHeader(header, connection = null) {
  const run = getExecutor(connection);
  const sql = `INSERT INTO sales_orders
    (order_no, order_date, customer_id, user_id, subtotal, discount, total, status, payment_type, due_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  const params = [
    header.orderNo,
    header.orderDate,
    header.customerId,
    header.userId,
    header.subtotal,
    header.discount,
    header.total,
    STATUS_DRAFT,
    null,
    null
  ];
  const [result] = await run(sql, params);

  return Number(result.insertId);
}

/** Nilai uang diharapkan sudah berupa string desimal dua angka dari service. */
async function insertItems(orderId, items, connection = null) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('insertItems memerlukan minimal satu item');
  }

  const run = getExecutor(connection);
  const placeholders = items.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
  const params = [];

  for (const item of items) {
    params.push(
      orderId,
      item.productId,
      item.qty,
      item.unitPrice,
      item.discount,
      item.lineTotal
    );
  }

  const sql = `INSERT INTO sales_order_items
    (sales_order_id, product_id, qty, unit_price, discount, line_total)
    VALUES ${placeholders}`;
  const [result] = await run(sql, params);

  return result.affectedRows;
}

const DETAIL_HEADER_SQL = `SELECT so.id, so.order_no,
    DATE_FORMAT(so.order_date, ?) AS order_date,
    so.customer_id, c.code AS customer_code, c.name AS customer_name,
    c.address AS customer_address, c.phone AS customer_phone,
    so.user_id, u.name AS user_name,
    so.subtotal, so.discount, so.total, so.status, so.payment_type,
    DATE_FORMAT(so.due_date, ?) AS due_date,
    so.cancel_reason, so.cancelled_by, so.cancelled_at, so.created_at
  FROM sales_orders so
  INNER JOIN customers c ON c.id = so.customer_id
  INNER JOIN users u ON u.id = so.user_id`;

function buildOrderFilters(filters = {}) {
  const clauses = ['1 = 1'];
  const params = [];

  const search = filters.search === undefined || filters.search === null
    ? ''
    : String(filters.search).trim();
  if (search !== '') {
    clauses.push('(so.order_no LIKE ? OR c.name LIKE ?)');
    params.push('%' + search + '%', '%' + search + '%');
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
  if (filters.userId) {
    clauses.push('so.user_id = ?');
    params.push(filters.userId);
  }

  return { where: 'WHERE ' + clauses.join(' AND '), params };
}

/** Daftar order memakai join untuk identitas, tanpa kolom sensitif users. */
async function findMany(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildOrderFilters(filters);
  const limit = filters.limit || 10;
  const offset = filters.offset || 0;
  const sql = `${DETAIL_HEADER_SQL}
    ${where}
    ORDER BY so.order_date DESC, so.id DESC
    LIMIT ? OFFSET ?`;
  const [rows] = await run(sql, [DATE_FORMAT, DATE_FORMAT].concat(params, [limit, offset]));

  return rows;
}

async function countAll(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildOrderFilters(filters);
  const sql = `SELECT COUNT(*) AS total
    FROM sales_orders so
    INNER JOIN customers c ON c.id = so.customer_id
    ${where}`;
  const [rows] = await run(sql, params);

  return Number(rows[0].total);
}

/** Lock header pembayaran agar dua kasir tidak lolos pemeriksaan status bersamaan. */
async function lockForUpdate(id, connection) {
  const tx = assertTransaction(connection, 'lockForUpdate');
  const run = getExecutor(tx);
  const sql = `SELECT so.id, so.order_no, so.customer_id, so.total, so.status
    FROM sales_orders so
    WHERE so.id = ?
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

/** Item dibaca setelah header dikunci; harga di sini adalah salinan saat order. */
async function findItemsByOrderId(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT i.id, i.sales_order_id, i.product_id,
      p.code, p.name, i.qty, i.unit_price, i.discount, i.line_total
    FROM sales_order_items i
    INNER JOIN products p ON p.id = i.product_id
    WHERE i.sales_order_id = ?
    ORDER BY i.id ASC`;
  const [rows] = await run(sql, [id]);

  return rows;
}

async function findPaymentsByOrderId(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT id, user_id,
      DATE_FORMAT(paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at,
      amount, change_amount, method, note
    FROM payments
    WHERE sales_order_id = ?
    ORDER BY id ASC`;
  const [rows] = await run(sql, [id]);

  return rows;
}

/** Mengembalikan header beserta item, customer, sales, dan pembayaran. */
async function findDetailById(id, connection = null) {
  const run = getExecutor(connection);
  const headerSql = `${DETAIL_HEADER_SQL}
    WHERE so.id = ?
    LIMIT 1`;
  const [headers] = await run(headerSql, [DATE_FORMAT, DATE_FORMAT, id]);

  if (!headers[0]) {
    return null;
  }

  const items = await findItemsByOrderId(id, connection);
  const payments = await findPaymentsByOrderId(id, connection);

  return { ...headers[0], items, payments };
}

/** Lock produk sebelum stok dibaca/diubah. Urutan lock ditentukan service. */
async function lockProductById(id, connection) {
  const tx = assertTransaction(connection, 'lockProductById');
  const run = getExecutor(tx);
  const sql = `SELECT id, code, stock
    FROM products
    WHERE id = ?
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
}

/** Pengembalian stok: hanya menambah, tidak pernah mengurangi. */
async function returnStock(connection, productId, qty) {
  const tx = assertTransaction(connection, 'returnStock');
  const run = getExecutor(tx);
  const sql = `UPDATE products
    SET stock = stock + ?
    WHERE id = ?`;
  const [result] = await run(sql, [qty, productId]);

  return Number(result.affectedRows);
}

/** Satu pergerakan BATAL per produk; stok sudah dikunci oleh service. */
async function insertCancelMovement(connection, movement) {
  const tx = assertTransaction(connection, 'insertCancelMovement');
  const run = getExecutor(tx);
  const sql = `INSERT INTO stock_movements
    (product_id, user_id, type, qty, reference)
    VALUES (?, ?, 'BATAL', ?, ?)`;
  const [result] = await run(sql, [
    movement.productId,
    movement.userId,
    movement.qty,
    movement.reference
  ]);

  return Number(result.insertId);
}

/** Status hanya diubah dari dua status yang diizinkan FR-09. */
async function cancelOrder(connection, id, update) {
  const tx = assertTransaction(connection, 'cancelOrder');
  const run = getExecutor(tx);
  const sql = `UPDATE sales_orders
    SET status = ?, cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW()
    WHERE id = ? AND status IN (?, ?)`;
  const [result] = await run(sql, [
    STATUS_BATAL,
    update.reason,
    update.cancelledBy,
    id,
    CANCELLABLE_STATUSES[0],
    CANCELLABLE_STATUSES[1]
  ]);

  return Number(result.affectedRows);
}

module.exports = {
  STATUS_DRAFT,
  STATUS_PIUTANG,
  STATUS_BATAL,
  CANCELLABLE_STATUSES,
  findActiveCustomerById,
  findActiveProductByCode,
  getOrderDate,
  lockOrderNumberMutex,
  findLastOrderNo,
  insertHeader,
  insertItems,
  findMany,
  countAll,
  lockForUpdate,
  findItemsByOrderId,
  findPaymentsByOrderId,
  findDetailById,
  lockProductById,
  returnStock,
  insertCancelMovement,
  cancelOrder
};
