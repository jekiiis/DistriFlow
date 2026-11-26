'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('../src/config/db', () => ({
  pool: { execute: jest.fn(), getConnection: jest.fn() },
  execute: jest.fn(),
  getExecutor: jest.fn(),
  withTransaction: jest.fn(),
  testConnection: jest.fn()
}));

const { getExecutor } = require('../src/config/db');
const customerModel = require('../src/models/customerModel');
const productModel = require('../src/models/productModel');

function stubExecutor(rows = []) {
  const run = jest.fn().mockResolvedValue([rows, []]);
  getExecutor.mockReturnValue(run);
  return run;
}

beforeEach(() => {
  getExecutor.mockReset();
});

describe('customerModel read-only', () => {
  test('findMany hanya mengambil pelanggan aktif dan memakai placeholder', async () => {
    const run = stubExecutor([]);

    await customerModel.findMany({ search: 'Toko', limit: 5, offset: 10 });

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('code LIKE ?');
    expect(sql).toContain('LIMIT ? OFFSET ?');
    expect(params).toEqual(['Toko', '%Toko%', '%Toko%', 5, 10]);
  });

  test('countAll memakai filter aktif yang sama', async () => {
    const run = stubExecutor([{ total: '2' }]);

    const total = await customerModel.countAll({ search: 'Makmur' });

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('is_active = TRUE');
    expect(params).toEqual(['Makmur', '%Makmur%', '%Makmur%']);
    expect(total).toBe(2);
  });

  test('findActiveById menolak baris tidak aktif di level SQL', async () => {
    const run = stubExecutor([]);

    const row = await customerModel.findActiveById(7);

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('WHERE id = ? AND is_active = TRUE');
    expect(params).toEqual([7]);
    expect(row).toBeNull();
  });

  test('sumOutstanding memakai pembayaran terpakai dan status PIUTANG', async () => {
    const run = stubExecutor([{ outstanding: '2000000.00' }]);

    const outstanding = await customerModel.sumOutstanding(7);

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain("so.status = 'PIUTANG'");
    expect(sql).toContain('SUM(amount - change_amount)');
    expect(sql).toContain('WHERE so.customer_id = ?');
    expect(params).toEqual([7]);
    expect(outstanding).toBe('2000000.00');
  });
});

describe('productModel read-only', () => {
  test('findMany hanya mengambil produk aktif dan memakai placeholder', async () => {
    const run = stubExecutor([]);

    await productModel.findMany({ search: 'Beras', limit: 10, offset: 0 });

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('is_active = TRUE');
    expect(sql).toContain('price_retail');
    expect(sql).toContain('price_wholesale');
    expect(sql).toContain('stock');
    expect(params).toEqual(['Beras', '%Beras%', '%Beras%', 10, 0]);
  });

  test('findActiveByCode menolak baris tidak aktif di level SQL', async () => {
    const run = stubExecutor([{ id: 1, code: 'BRS-05' }]);

    const row = await productModel.findActiveByCode('BRS-05');

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('WHERE code = ? AND is_active = TRUE');
    expect(params).toEqual(['BRS-05']);
    expect(row.code).toBe('BRS-05');
  });
});
