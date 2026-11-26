'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('../src/config/db', () => ({
  execute: jest.fn(),
  pool: { execute: jest.fn() },
  getExecutor: jest.fn(),
  withTransaction: jest.fn(),
  testConnection: jest.fn()
}));

const { getExecutor } = require('../src/config/db');
const paymentModel = require('../src/models/paymentModel');

let run;
const CONNECTION = { execute: jest.fn() };

beforeEach(() => {
  run = jest.fn().mockResolvedValue([[], []]);
  getExecutor.mockReturnValue(run);
});

describe('paymentModel — SQL transaksi pembayaran', () => {
  test('lock customer dan product memakai FOR UPDATE', async () => {
    await paymentModel.lockCustomerById(1, CONNECTION);
    await paymentModel.lockProductById(5, CONNECTION);
    const sql = run.mock.calls.map((call) => call[0]).join(' ');
    expect(sql).toMatch(/FROM customers[\s\S]*FOR UPDATE/);
    expect(sql).toMatch(/FROM products[\s\S]*FOR UPDATE/);
  });

  test('pengurangan stok bersyarat mencegah stok negatif', async () => {
    run.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const affected = await paymentModel.decrementStock(CONNECTION, 5, 10);
    expect(affected).toBe(1);
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/UPDATE products/);
    expect(sql).toMatch(/stock = stock - \?/);
    expect(sql).toMatch(/WHERE id = \? AND stock >= \?/);
    expect(params).toEqual([10, 5, 10]);
  });

  test('movement KELUAR dicek berdasarkan reference, type, dan product', async () => {
    run.mockResolvedValueOnce([[{ total: 1 }], []]);
    const exists = await paymentModel.hasOutMovement(CONNECTION, 5, 'SO-20261112-002');
    expect(exists).toBe(true);
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/reference = \?/);
    expect(sql).toMatch(/type = 'KELUAR'/);
    expect(sql).toMatch(/product_id = \?/);
    expect(params).toEqual(['SO-20261112-002', 5]);
  });

  test('insert movement dan payment memakai placeholder serta NOW()', async () => {
    run.mockResolvedValueOnce([{ insertId: 1 }, []]);
    await paymentModel.insertMovement(CONNECTION, {
      productId: 5,
      userId: 3,
      qty: 10,
      reference: 'SO-20261112-002'
    });
    run.mockResolvedValueOnce([{ insertId: 11 }, []]);
    await paymentModel.insertPayment(CONNECTION, {
      orderId: 2,
      userId: 3,
      amount: '800000.00',
      changeAmount: '50000.00',
      method: 'TRANSFER',
      note: 'catatan'
    });

    const movementSql = run.mock.calls[0][0];
    const paymentSql = run.mock.calls[1][0];
    expect(movementSql).toMatch(/INSERT INTO stock_movements/);
    expect(movementSql).toMatch(/'KELUAR'/);
    expect(paymentSql).toMatch(/INSERT INTO payments/);
    expect(paymentSql).toMatch(/NOW\(\)/);
    expect(run.mock.calls[1][1]).toEqual([2, 3, '800000.00', '50000.00', 'TRANSFER', 'catatan']);
  });

  test('update status hanya dari DRAFT dan due_date dari tanggal database', async () => {
    run.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const affected = await paymentModel.updateOrderAfterPayment(CONNECTION, 2, {
      status: 'PIUTANG',
      paymentType: 'KREDIT',
      dueDateDays: 30
    });
    expect(affected).toBe(1);
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/status = \?/);
    expect(sql).toMatch(/payment_type = \?/);
    expect(sql).toMatch(/DATE_ADD\(CURDATE\(\), INTERVAL \? DAY\)/);
    expect(sql).toMatch(/status = 'DRAFT'/);
    expect(params).toEqual(['PIUTANG', 'KREDIT', 30, 2]);
  });

  test('semua fungsi menolak koneksi non-transaksi', async () => {
    await expect(paymentModel.decrementStock(null, 5, 1)).rejects.toThrow(/transaksi/);
    await expect(paymentModel.insertPayment(null, {})).rejects.toThrow(/transaksi/);
  });
});
