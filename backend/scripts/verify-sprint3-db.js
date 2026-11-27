'use strict';

/**
 * Verifikasi integrasi Sprint 3 memakai database isolasi baru.
 * Database utama `distriflow` tidak disentuh; tidak ada reset/seed ulang,
 * tidak ada perubahan akun, dan tidak ada kredensial yang dicetak.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const request = require('supertest');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const ROOT = path.resolve(__dirname, '../..');
const DB_NAME = 'test_verify_sprint3_' + Date.now();

if (!/^[A-Za-z0-9_]+$/.test(DB_NAME)) {
  throw new Error('Nama database isolasi tidak aman');
}

process.env.NODE_ENV = 'test';
process.env.DB_NAME = DB_NAME;

const dbConfig = {
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD || ''
};

const steps = [];
function pass(label) {
  steps.push(label);
  console.log('  OK  ' + label);
}

function sqlStatements(filename) {
  const file = path.join(ROOT, 'database', filename);
  let sql = fs.readFileSync(file, 'utf8');

  // Jangan pernah menjalankan CREATE DATABASE distriflow dari skrip isolasi.
  sql = sql.replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+distriflow[^;]*;/gi, '');
  sql = sql.replace(/USE\s+distriflow\s*;/gi, 'USE `' + DB_NAME + '`;');

  // Komentar dibuang sebelum split: ada titik koma di dalam teks komentar.
  return sql
    .replace(/--[^\r\n]*/g, '')
    .split(';')
    .map((chunk) => chunk.trim())
    .filter(Boolean);
}

async function buildDatabase() {
  const root = await mysql.createConnection(dbConfig);
  try {
    await root.query(
      'CREATE DATABASE `' + DB_NAME + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } finally {
    await root.end();
  }

  const connection = await mysql.createConnection(Object.assign({}, dbConfig, { database: DB_NAME }));
  try {
    for (const statement of sqlStatements('01_schema.sql')) {
      await connection.query(statement);
    }
    for (const statement of sqlStatements('02_seed.sql')) {
      await connection.query(statement);
    }
  } finally {
    await connection.end();
  }
  pass('database isolasi dibuat dari schema + seed (db: ' + DB_NAME + ')');
}

async function dropDatabase() {
  const root = await mysql.createConnection(dbConfig);
  try {
    await root.query('DROP DATABASE IF EXISTS `' + DB_NAME + '`');
  } finally {
    await root.end();
  }
}

async function readStock(connection, productId) {
  const [rows] = await connection.execute('SELECT stock FROM products WHERE id = ?', [productId]);
  return Number(rows[0].stock);
}

async function login(app, username) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login')
    .send({ username, password: 'Rahasia123' });
  assert.strictEqual(response.status, 200, 'login gagal untuk ' + username + ': ' + response.text);
  return agent;
}

async function main() {
  await buildDatabase();

  // env dibaca setelah DB_NAME isolasi ditetapkan.
  const app = require('../src/app');
  const connection = await mysql.createConnection(Object.assign({}, dbConfig, { database: DB_NAME }));

  try {
    const admin = await login(app, 'admin.devrosan');
    const sales = await login(app, 'sales.raihan');
    const kasir = await login(app, 'kasir.zuriel');
    const gudang = await login(app, 'gudang.jeki');
    pass('empat peran dapat login memakai sesi MySQL');

    // ---- RBAC nyata ----
    assert.strictEqual((await sales.post('/api/products').send({})).status, 403);
    assert.strictEqual((await gudang.get('/api/reports/sales?date_from=2026-01-01&date_to=2026-01-02')).status, 403);
    assert.strictEqual((await admin.post('/api/receivables/2/pay').send({ nominal: '1.00', method: 'TUNAI' })).status, 403);
    assert.strictEqual((await request(app).get('/api/dashboard/kpi')).status, 401);
    pass('RBAC backend menolak peran yang tidak berhak (401/403)');

    // ---- FR-13 / FR-15: master produk ----
    const productPayload = {
      code: 'INT-001',
      name: 'Produk Integrasi Sprint 3',
      unit: 'pcs',
      price_retail: '10000.00',
      price_wholesale: '9000.00',
      min_stock: 5
    };
    const created = await admin.post('/api/products').send(productPayload);
    assert.strictEqual(created.status, 201, created.text);
    const productId = Number(created.body.data.product.id);
    assert.strictEqual(await readStock(connection, productId), 0);
    assert.strictEqual((await admin.post('/api/products').send(productPayload)).status, 409);
    assert.strictEqual((await admin.post('/api/products')
      .send(Object.assign({}, productPayload, { code: 'INT-002', stock: 99 }))).status, 400);
    const updated = await admin.put('/api/products/' + productId).send(Object.assign({}, productPayload, {
      name: 'Produk Integrasi Diubah',
      price_retail: '11000.00'
    }));
    assert.strictEqual(updated.status, 200, updated.text);
    const deactivated = await admin.patch('/api/products/' + productId).send({ is_active: false });
    assert.strictEqual(deactivated.status, 200);
    const hidden = await admin.get('/api/products?search=INT-001');
    assert.strictEqual(hidden.body.data.pagination.total, 0);
    assert.strictEqual((await admin.patch('/api/products/' + productId).send({ is_active: true })).status, 200);
    pass('produk dibuat tanpa stok awal, duplikat 409, field stock ditolak, update/nonaktif berfungsi');

    // ---- FR-14: barang masuk + konfirmasi duplikat ----
    const beforeStock = await readStock(connection, productId);
    const stockPayload = {
      product_id: productId,
      qty: 12,
      document_no: 'SJ-INT-001',
      invoice_match: true,
      note: 'Catatan tidak dipersisten (skema tidak memiliki kolom note)'
    };
    const stockIn = await gudang.post('/api/stock-in').send(stockPayload);
    assert.strictEqual(stockIn.status, 201, stockIn.text);
    assert.strictEqual(stockIn.body.data.movement.stock_after, beforeStock + 12);
    const duplicate = await gudang.post('/api/stock-in').send(stockPayload);
    assert.strictEqual(duplicate.status, 409);
    assert.strictEqual(duplicate.body.needConfirm, true);
    const confirmed = await gudang.post('/api/stock-in')
      .send(Object.assign({}, stockPayload, { confirm_duplicate: true }));
    assert.strictEqual(confirmed.status, 201, confirmed.text);
    assert.strictEqual(await readStock(connection, productId), beforeStock + 24);
    const history = await gudang.get('/api/stock-in?search=SJ-INT-001');
    assert.strictEqual(history.status, 200);
    assert.strictEqual(history.body.data.movements.length, 2);
    pass('barang masuk menambah stok secara atomik; duplikat butuh konfirmasi; riwayat terbaca');

    // ---- FR-17/18/22: piutang, pelunasan, bukti PDF ----
    const receivableList = await kasir.get('/api/receivables?status=PIUTANG');
    assert.strictEqual(receivableList.status, 200);
    assert.ok(receivableList.body.data.receivables.length >= 1);
    const detail = await kasir.get('/api/receivables/2');
    assert.strictEqual(detail.status, 200, detail.text);
    assert.strictEqual(detail.body.data.receivable.outstanding, '2000000.00');
    assert.ok(['Aman', 'Berisiko'].includes(detail.body.data.receivable.risk));
    const overpayment = await kasir.post('/api/receivables/2/pay')
      .send({ nominal: '3000000.00', method: 'TRANSFER' });
    assert.strictEqual(overpayment.status, 400);

    const payPayload = { nominal: '100000.00', method: 'TRANSFER', reference: 'DB-INT-001' };
    const paid = await kasir.post('/api/receivables/2/pay').send(payPayload);
    assert.strictEqual(paid.status, 201, paid.text);
    const paymentId = Number(paid.body.data.payment.id);
    const replay = await kasir.post('/api/receivables/2/pay').send(payPayload);
    assert.strictEqual(replay.status, 201);
    assert.match(replay.body.message, /sudah tercatat/);
    assert.strictEqual(Number(replay.body.data.payment.id), paymentId);

    // Setelah jendela lama 60 detik, kunci UNIQUE tetap menahan duplikasi.
    await connection.execute(
      'UPDATE payments SET paid_at = DATE_SUB(paid_at, INTERVAL 61 SECOND) WHERE id = ?',
      [paymentId]
    );
    const lateReplay = await kasir.post('/api/receivables/2/pay').send(payPayload);
    assert.strictEqual(lateReplay.status, 201, lateReplay.text);
    assert.match(lateReplay.body.message, /sudah tercatat/);
    assert.strictEqual(Number(lateReplay.body.data.payment.id), paymentId);
    const [[paymentCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM payments WHERE sales_order_id = 2 AND note LIKE ?',
      ['REF:DB-INT-001|%']
    );
    assert.strictEqual(Number(paymentCount.total), 1);

    const receipt = await kasir.get('/api/payments/' + paymentId + '/receipt.pdf');
    assert.strictEqual(receipt.status, 200);
    assert.match(receipt.headers['content-type'], /application\/pdf/);
    assert.ok(receipt.body.length > 0);
    pass('piutang dibaca Kasir, pembayaran sebagian/idempotent, kelebihan bayar ditolak, bukti PDF sah');

    // ---- FR-09: pembatalan order ----
    const draftStockBefore = await readStock(connection, 3);
    assert.strictEqual((await sales.post('/api/orders/18/cancel').send({ reason: 'tidak berhak' })).status, 403);
    const draftCancel = await admin.post('/api/orders/18/cancel').send({ reason: 'Integrasi: DRAFT dibatalkan' });
    assert.strictEqual(draftCancel.status, 200, draftCancel.text);
    assert.strictEqual(draftCancel.body.data.order.status, 'BATAL');
    assert.strictEqual(await readStock(connection, 3), draftStockBefore);
    assert.strictEqual((await admin.post('/api/orders/18/cancel').send({ reason: 'dua kali' })).status, 409);
    pass('pembatalan DRAFT oleh Admin tidak mengubah stok dan idempoten');

    const [[piutangOrder]] = await connection.execute('SELECT order_no FROM sales_orders WHERE id = 2');
    const stock1Before = await readStock(connection, 1);
    const stock4Before = await readStock(connection, 4);
    const piutangCancel = await admin.post('/api/orders/2/cancel')
      .send({ reason: 'Integrasi: order Piutang dibatalkan' });
    assert.strictEqual(piutangCancel.status, 200, piutangCancel.text);
    assert.strictEqual(piutangCancel.body.data.order.status, 'BATAL');
    assert.strictEqual(await readStock(connection, 1), stock1Before + 25);
    assert.strictEqual(await readStock(connection, 4), stock4Before + 10);
    const [[moves]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM stock_movements WHERE type = ? AND reference = ?',
      ['BATAL', piutangOrder.order_no]
    );
    assert.strictEqual(Number(moves.total), 2);
    pass('pembatalan PIUTANG mengembalikan stok dan menulis movement BATAL dalam transaksi');

    // ---- FR-19/20/21: laporan, PDF, KPI, restock ----
    const [[dates]] = await connection.query(
      "SELECT DATE_FORMAT(CURDATE() - INTERVAL 45 DAY, '%Y-%m-%d') AS from_date, "
      + "DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS to_date"
    );
    const period = 'date_from=' + dates.from_date + '&date_to=' + dates.to_date;
    const report = await admin.get('/api/reports/sales?' + period);
    assert.strictEqual(report.status, 200, report.text);
    const [[expectedOrders]] = await connection.execute(
      "SELECT COUNT(*) AS total FROM sales_orders WHERE status IN ('LUNAS','PIUTANG') "
      + 'AND order_date BETWEEN ? AND ?',
      [dates.from_date, dates.to_date]
    );
    assert.strictEqual(Number(report.body.data.summary.totalOrders), Number(expectedOrders.total));
    const reportPdf = await admin.get('/api/reports/sales.pdf?' + period);
    assert.strictEqual(reportPdf.status, 200);
    assert.match(reportPdf.headers['content-type'], /application\/pdf/);
    assert.ok(reportPdf.body.length > 0);

    const kpiAdmin = await admin.get('/api/dashboard/kpi');
    assert.strictEqual(kpiAdmin.status, 200);
    assert.strictEqual(typeof kpiAdmin.body.data.omzetHariIni, 'string');
    const kpiGudang = await gudang.get('/api/dashboard/kpi');
    assert.strictEqual(kpiGudang.status, 200);
    assert.strictEqual(kpiGudang.body.data.omzetHariIni, '0.00');
    assert.strictEqual(kpiGudang.body.data.piutangJatuhTempo, '0.00');

    const restock = await gudang.get('/api/products/restock');
    assert.strictEqual(restock.status, 200);
    assert.ok(restock.body.data.products.some((item) => item.code === 'SBN-08'));
    pass('laporan & PDF mengecualikan BATAL, KPI Gudang tanpa angka keuangan, restock dari data nyata');

    console.log('\nSprint 3 database integration: ' + steps.length + ' kelompok pemeriksaan lulus.');
  } finally {
    await connection.end();
  }
}

main()
  .then(async () => {
    await dropDatabase();
    console.log('Database isolasi dibersihkan.');
    process.exit(0);
  })
  .catch(async (error) => {
    console.error('GAGAL: ' + (error && error.message ? error.message : String(error)));
    try {
      await dropDatabase();
      console.log('Database isolasi dibersihkan setelah kegagalan.');
    } catch (cleanupError) {
      console.error('Pembersihan gagal: ' + cleanupError.message);
    }
    process.exit(1);
  });
