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
jest.mock('../src/models/customerModel', () => ({
  findActiveById: jest.fn(),
  findActiveByCode: jest.fn()
}));
jest.mock('../src/models/productModel', () => ({
  findActiveByCode: jest.fn()
}));

const { getExecutor } = require('../src/config/db');
const orderModel = require('../src/models/orderModel');

let run;
beforeEach(() => {
  run = jest.fn().mockResolvedValue([[], []]);
  getExecutor.mockReturnValue(run);
});

describe('orderModel — query aman', () => {
  test('lock mutex memakai FOR UPDATE pada baris users yang sama', async () => {
    run.mockResolvedValueOnce([[{ id: 1 }], []]);
    const id = await orderModel.lockOrderNumberMutex({ execute: jest.fn() });
    expect(id).toBe(1);
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/FROM users/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(params).toHaveLength(1);
  });

  test('getOrderDate memakai YYYYMMDD untuk nomor order', async () => {
    run.mockResolvedValueOnce([[{ order_date: '20261126' }], []]);
    const result = await orderModel.getOrderDate();
    expect(result).toBe('20261126');
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/DATE_FORMAT\(CURDATE\(\), \?\)/);
    expect(params).toEqual(['%Y%m%d']);
  });

  test('nomor terakhir diurutkan numerik, bukan lexicographic', async () => {
    run.mockResolvedValueOnce([[{ order_no: 'SO-20261126-1000' }], []]);
    const result = await orderModel.findLastOrderNo('2026-11-26');
    expect(result).toBe('SO-20261126-1000');
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/CAST\(SUBSTRING_INDEX\(order_no, '-', -1\) AS UNSIGNED\) DESC/);
    expect(params[0]).toBe('2026-11-26');
    expect(params[1]).toBe('SO-2026-11-26-%');
  });

  test('findLastOrderNo memakai prefiks SO untuk format YYYYMMDD', async () => {
    run.mockResolvedValueOnce([[{ order_no: 'SO-20261126-1000' }], []]);
    await orderModel.findLastOrderNo('20261126');
    expect(run.mock.calls[0][1]).toEqual(['20261126', 'SO-20261126-%']);
  });

  test('insertHeader selalu status DRAFT dengan payment_type/due_date NULL', async () => {
    run.mockResolvedValueOnce([{ insertId: 7 }, []]);
    await orderModel.insertHeader({
      orderNo: 'SO-20261126-001',
      orderDate: '2026-11-26',
      customerId: 7,
      userId: 2,
      subtotal: '100000.00',
      discount: '0.00',
      total: '100000.00'
    });
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO sales_orders/);
    expect(params[7]).toBe('DRAFT');
    expect(params[8]).toBe(null);
    expect(params[9]).toBe(null);
    expect(sql).not.toMatch(/password/i);
  });

  test('insertItems memakai placeholder dan tidak mengubah products', async () => {
    run.mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const affected = await orderModel.insertItems(7, [{
      productId: 5,
      qty: 1,
      unitPrice: '75000.00',
      discount: '0.00',
      lineTotal: '75000.00'
    }]);
    expect(affected).toBe(1);
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO sales_order_items/);
    expect(sql).toContain('(?, ?, ?, ?, ?, ?)');
    expect(params).toHaveLength(6);
    expect(sql).not.toMatch(/UPDATE\s+products/i);
  });

  test('findMany menyaring status, tanggal, pencarian, dan Sales', async () => {
    run.mockResolvedValueOnce([[], []]);
    await orderModel.findMany({
      search: 'SO-1',
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      status: 'DRAFT',
      userId: 9,
      limit: 10,
      offset: 20
    });
    const [sql, params] = run.mock.calls[0];
    expect(sql).toMatch(/so\.order_no LIKE \? OR c\.name LIKE \?/);
    expect(sql).toMatch(/so\.order_date >= \?/);
    expect(sql).toMatch(/so\.order_date <= \?/);
    expect(sql).toMatch(/so\.status = \?/);
    expect(sql).toMatch(/so\.user_id = \?/);
    expect(sql).toMatch(/ORDER BY so\.order_date DESC, so\.id DESC/);
    expect(params).toEqual([
      '%Y-%m-%d', '%Y-%m-%d',
      '%SO-1%', '%SO-1%', '2026-11-01', '2026-11-30', 'DRAFT', 9, 10, 20
    ]);
  });

  test('lockForUpdate memakai transaksi dan FOR UPDATE', async () => {
    run.mockResolvedValueOnce([[{ id: 1, status: 'DRAFT' }], []]);
    const connection = { execute: jest.fn() };
    const row = await orderModel.lockForUpdate(1, connection);
    expect(row.status).toBe('DRAFT');
    expect(run.mock.calls[0][0]).toMatch(/FOR UPDATE/);
  });

  test('findDetailById tidak memilih kolom password', async () => {
    run
      .mockResolvedValueOnce([[{ id: 1, order_no: 'SO-20261126-001' }], []])
      .mockResolvedValueOnce([[], []])
      .mockResolvedValueOnce([[], []]);
    await orderModel.findDetailById(1);
    const sql = run.mock.calls.map((call) => call[0]).join(' ');
    expect(sql).not.toMatch(/password/i);
  });
});
