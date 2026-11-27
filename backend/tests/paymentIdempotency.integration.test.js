'use strict';

/**
 * Integrasi nyata (MySQL terisolasi) untuk idempotency pembayaran FR-18.
 * Database utama `distriflow` tidak pernah dipakai atau diubah.
 */

const isolatedDb = require('./helpers/isolatedDb');

const DB_NAME = isolatedDb.databaseName('test_payment_idem_');
process.env.NODE_ENV = 'test';
process.env.DB_NAME = DB_NAME;
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret-not-for-production';
}

const { pool } = require('../src/config/db');
const { settleReceivable } = require('../src/services/receivableService');
const receivableModel = require('../src/models/receivableModel');

jest.setTimeout(30000);

const KASIR_ID = 3;
const PRODUCT_ID = 1;
let db;
let orderCounter = 0;

async function createPiutangOrder(total = '200000.00') {
  orderCounter += 1;
  const orderNo = 'TP' + Date.now() + '_' + orderCounter;
  await db.execute(
    `INSERT INTO sales_orders
      (order_no, order_date, customer_id, user_id, subtotal, discount, total,
        payment_type, status, due_date)
     VALUES (?, CURDATE(), 1, 2, ?, 0, ?, 'KREDIT', 'PIUTANG', CURDATE() + INTERVAL 14 DAY)`,
    [orderNo, total, total]
  );
  const [rows] = await db.execute('SELECT id FROM sales_orders WHERE order_no = ?', [orderNo]);
  return Number(rows[0].id);
}

async function paymentRows(orderId) {
  const [rows] = await db.execute(
    `SELECT id, amount, note, idempotency_key, request_hash, paid_at
       FROM payments WHERE sales_order_id = ? ORDER BY id ASC`,
    [orderId]
  );
  return rows;
}

async function orderStatus(orderId) {
  const [rows] = await db.execute('SELECT status FROM sales_orders WHERE id = ?', [orderId]);
  return rows[0].status;
}

async function paidTotal(orderId) {
  const [rows] = await db.execute(
    'SELECT COALESCE(SUM(amount - change_amount), 0) AS paid FROM payments WHERE sales_order_id = ?',
    [orderId]
  );
  return String(rows[0].paid);
}

async function productStock() {
  const [rows] = await db.execute('SELECT stock FROM products WHERE id = ?', [PRODUCT_ID]);
  return Number(rows[0].stock);
}

function payload(nominal, reference, note = '') {
  return { nominal, method: 'TRANSFER', reference, note };
}

beforeAll(async () => {
  await isolatedDb.createDatabase(DB_NAME);
  db = await isolatedDb.connect(DB_NAME);
});

afterAll(async () => {
  // service memakai pool modul db.js; tutup lebih dulu supaya Jest tidak
  // meninggalkan koneksi MySQL terbuka setelah suite selesai.
  await pool.end();
  if (db) {
    await db.end();
  }
  await isolatedDb.dropDatabase(DB_NAME);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('idempotency pembayaran piutang (database isolasi)', () => {
  test('retry identik dalam jendela 60 detik mengembalikan payment yang sama', async () => {
    const orderId = await createPiutangOrder();
    const input = payload('50000.00', 'INT-WINDOW-001');

    const first = await settleReceivable(orderId, input, KASIR_ID);
    const replay = await settleReceivable(orderId, input, KASIR_ID);

    expect(first.duplicate).toBe(false);
    expect(replay.duplicate).toBe(true);
    expect(Number(replay.payment.id)).toBe(Number(first.payment.id));

    const rows = await paymentRows(orderId);
    expect(rows).toHaveLength(1);
    expect(Buffer.isBuffer(rows[0].idempotency_key)).toBe(true);
    expect(Buffer.isBuffer(rows[0].request_hash)).toBe(true);
    expect(String(rows[0].note)).toContain('REF:INT-WINDOW-001|');
    expect(await orderStatus(orderId)).toBe('PIUTANG');
  });

  test('retry identik setelah lebih dari 60 detik tetap tidak membuat payment kedua', async () => {
    const orderId = await createPiutangOrder();
    const input = payload('50000.00', 'INT-LATE-001');
    const first = await settleReceivable(orderId, input, KASIR_ID);

    await db.execute(
      'UPDATE payments SET paid_at = DATE_SUB(paid_at, INTERVAL 61 SECOND) WHERE id = ?',
      [first.payment.id]
    );
    const replay = await settleReceivable(orderId, input, KASIR_ID);

    expect(replay.duplicate).toBe(true);
    expect(Number(replay.payment.id)).toBe(Number(first.payment.id));
    expect(await paymentRows(orderId)).toHaveLength(1);
    expect(await orderStatus(orderId)).toBe('PIUTANG');
  });

  test('payload tanpa reference juga aman setelah lebih dari 60 detik', async () => {
    const orderId = await createPiutangOrder();
    const input = payload('50000.00', '');
    const first = await settleReceivable(orderId, input, KASIR_ID);

    await db.execute(
      'UPDATE payments SET paid_at = DATE_SUB(paid_at, INTERVAL 61 SECOND) WHERE id = ?',
      [first.payment.id]
    );
    const replay = await settleReceivable(orderId, input, KASIR_ID);

    expect(replay.duplicate).toBe(true);
    expect(Number(replay.payment.id)).toBe(Number(first.payment.id));
    expect(await paymentRows(orderId)).toHaveLength(1);
  });

  test('dua request identik bersamaan menghasilkan satu payment', async () => {
    const orderId = await createPiutangOrder();
    const input = payload('50000.00', 'INT-CONCURRENT-001');

    const results = await Promise.all([
      settleReceivable(orderId, input, KASIR_ID),
      settleReceivable(orderId, input, KASIR_ID)
    ]);

    expect(results.filter((result) => result.duplicate)).toHaveLength(1);
    expect(new Set(results.map((result) => Number(result.payment.id))).size).toBe(1);
    expect(await paymentRows(orderId)).toHaveLength(1);
    expect(await paidTotal(orderId)).toBe('50000.00');
  });

  test('dua reference berbeda menghasilkan dua payment parsial yang valid', async () => {
    const orderId = await createPiutangOrder();
    const stockBefore = await productStock();

    const first = await settleReceivable(orderId, payload('50000.00', 'INT-REF-A'), KASIR_ID);
    const second = await settleReceivable(orderId, payload('50000.00', 'INT-REF-B'), KASIR_ID);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(false);
    expect(Number(second.payment.id)).not.toBe(Number(first.payment.id));

    const rows = await paymentRows(orderId);
    expect(rows).toHaveLength(2);
    expect(Buffer.from(rows[0].idempotency_key).toString()).toBe('REF:INT-REF-A');
    expect(Buffer.from(rows[1].idempotency_key).toString()).toBe('REF:INT-REF-B');
    expect(await paidTotal(orderId)).toBe('100000.00');
    expect(await orderStatus(orderId)).toBe('PIUTANG');
    expect(await productStock()).toBe(stockBefore);
  });

  test('reference sama dengan payload berbeda ditolak 409', async () => {
    const orderId = await createPiutangOrder();
    await settleReceivable(orderId, payload('50000.00', 'INT-CONFLICT-001'), KASIR_ID);

    await expect(
      settleReceivable(orderId, payload('60000.00', 'INT-CONFLICT-001'), KASIR_ID)
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'Referensi pembayaran sudah dipakai untuk nominal atau metode berbeda'
    });

    expect(await paymentRows(orderId)).toHaveLength(1);
    expect(await paidTotal(orderId)).toBe('50000.00');
    expect(await orderStatus(orderId)).toBe('PIUTANG');
  });

  test('pelunasan parsial lalu penuh menjaga status, saldo, dan stok konsisten', async () => {
    const orderId = await createPiutangOrder('200000.00');
    const stockBefore = await productStock();

    await settleReceivable(orderId, payload('50000.00', 'INT-FULL-A'), KASIR_ID);
    expect(await orderStatus(orderId)).toBe('PIUTANG');

    const final = await settleReceivable(orderId, payload('150000.00', 'INT-FULL-B'), KASIR_ID);
    expect(final.duplicate).toBe(false);
    expect(await orderStatus(orderId)).toBe('LUNAS');
    expect(await paidTotal(orderId)).toBe('200000.00');
    expect(await paymentRows(orderId)).toHaveLength(2);
    expect(await productStock()).toBe(stockBefore);

    // Retry setelah LUNAS dengan kunci yang sama tetap idempoten.
    const replayFinal = await settleReceivable(orderId, payload('150000.00', 'INT-FULL-B'), KASIR_ID);
    expect(replayFinal.duplicate).toBe(true);
    expect(await paymentRows(orderId)).toHaveLength(2);
  });

  test('kegagalan setelah insert dirollback: payment, status, dan stok kembali', async () => {
    const orderId = await createPiutangOrder('200000.00');
    const stockBefore = await productStock();
    jest.spyOn(receivableModel, 'markSettled').mockRejectedValueOnce(new Error('injected failure'));

    await expect(
      settleReceivable(orderId, payload('200000.00', 'INT-ROLLBACK-001'), KASIR_ID)
    ).rejects.toThrow('injected failure');

    expect(await paymentRows(orderId)).toHaveLength(0);
    expect(await orderStatus(orderId)).toBe('PIUTANG');
    expect(await productStock()).toBe(stockBefore);
  });

  test('reference lama tanpa kunci masih dikenali dalam jendela 60 detik', async () => {
    const orderId = await createPiutangOrder();
    await db.execute(
      `INSERT INTO payments
        (sales_order_id, user_id, paid_at, amount, change_amount, method, note)
       VALUES (?, ?, NOW(), 50000.00, 0, 'TRANSFER', ?)`,
      [orderId, KASIR_ID, 'REF:INT-LEGACY-001|catatan lama']
    );

    const replay = await settleReceivable(
      orderId,
      payload('50000.00', 'INT-LEGACY-001', 'catatan lama'),
      KASIR_ID
    );

    expect(replay.duplicate).toBe(true);
    expect(await paymentRows(orderId)).toHaveLength(1);
  });
});
