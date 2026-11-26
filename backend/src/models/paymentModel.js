'use strict';

const { getExecutor } = require('../config/db');

function assertTransaction(connection, functionName) {
  if (!connection || typeof connection.execute !== 'function') {
    throw new Error(`${functionName} memerlukan koneksi transaksi`);
  }
  return connection;
}

/** Lock pelanggan sebelum limit piutang dibaca kembali di dalam transaksi. */
async function lockCustomerById(id, connection) {
  const tx = assertTransaction(connection, 'lockCustomerById');
  const run = getExecutor(tx);
  const sql = `SELECT id, code, credit_limit, payment_term_days
    FROM customers
    WHERE id = ?
    LIMIT 1
    FOR UPDATE`;
  const [rows] = await run(sql, [id]);

  return rows[0] || null;
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

/** UPDATE bersyarat: gagal bila stok berubah menjadi kurang setelah lock. */
async function decrementStock(connection, productId, qty) {
  const tx = assertTransaction(connection, 'decrementStock');
  const run = getExecutor(tx);
  const sql = `UPDATE products
    SET stock = stock - ?
    WHERE id = ? AND stock >= ?`;
  const [result] = await run(sql, [qty, productId, qty]);

  return Number(result.affectedRows);
}

async function hasOutMovement(connection, productId, reference) {
  const tx = assertTransaction(connection, 'hasOutMovement');
  const run = getExecutor(tx);
  const sql = `SELECT COUNT(*) AS total
    FROM stock_movements
    WHERE reference = ? AND type = 'KELUAR' AND product_id = ?`;
  const [rows] = await run(sql, [reference, productId]);

  return Number(rows[0].total) > 0;
}

async function insertMovement(connection, movement) {
  const tx = assertTransaction(connection, 'insertMovement');
  const run = getExecutor(tx);
  const sql = `INSERT INTO stock_movements
    (product_id, user_id, type, qty, reference)
    VALUES (?, ?, 'KELUAR', ?, ?)`;
  const [result] = await run(sql, [
    movement.productId,
    movement.userId,
    movement.qty,
    movement.reference
  ]);

  return Number(result.insertId);
}

async function insertPayment(connection, payment) {
  const tx = assertTransaction(connection, 'insertPayment');
  const run = getExecutor(tx);
  const sql = `INSERT INTO payments
    (sales_order_id, user_id, paid_at, amount, change_amount, method, note)
    VALUES (?, ?, NOW(), ?, ?, ?, ?)`;
  const [result] = await run(sql, [
    payment.orderId,
    payment.userId,
    payment.amount,
    payment.changeAmount,
    payment.method,
    payment.note || null
  ]);

  return Number(result.insertId);
}

/**
 * Status hanya diubah dari DRAFT. dueDateDays NULL menghasilkan due_date NULL
 * lewat DATE_ADD(CURDATE(), INTERVAL NULL DAY).
 */
async function updateOrderAfterPayment(connection, orderId, update) {
  const tx = assertTransaction(connection, 'updateOrderAfterPayment');
  const run = getExecutor(tx);
  const sql = `UPDATE sales_orders
    SET status = ?, payment_type = ?, due_date = DATE_ADD(CURDATE(), INTERVAL ? DAY)
    WHERE id = ? AND status = 'DRAFT'`;
  const [result] = await run(sql, [
    update.status,
    update.paymentType,
    update.dueDateDays,
    orderId
  ]);

  return Number(result.affectedRows);
}

module.exports = {
  lockCustomerById,
  lockProductById,
  decrementStock,
  hasOutMovement,
  insertMovement,
  insertPayment,
  updateOrderAfterPayment
};
