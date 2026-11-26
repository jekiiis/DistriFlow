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
  pool: { execute: jest.fn(), getConnection: jest.fn() },
  getExecutor: jest.fn(),
  withTransaction: jest.fn(),
  testConnection: jest.fn()
}));
jest.mock('../src/models/orderModel');
jest.mock('../src/models/paymentModel');
jest.mock('../src/models/customerModel', () => ({
  findActiveById: jest.fn(),
  findMany: jest.fn(),
  countAll: jest.fn(),
  sumOutstanding: jest.fn()
}));
jest.mock('../src/services/orderService', () => ({
  toPublicOrder: jest.fn((row) => row)
}));

const { withTransaction } = require('../src/config/db');
const orderModel = require('../src/models/orderModel');
const paymentModel = require('../src/models/paymentModel');
const customerModel = require('../src/models/customerModel');
const paymentService = require('../src/services/paymentService');

const CONNECTION = { execute: jest.fn() };

function resetModel(model) {
  Object.values(model).forEach((fn) => {
    if (typeof fn.mockReset === 'function') {
      fn.mockReset();
    }
  });
}

beforeEach(() => {
  withTransaction.mockReset();
  withTransaction.mockImplementation((callback) => callback(CONNECTION));
  resetModel(orderModel);
  resetModel(paymentModel);
  resetModel(customerModel);

  orderModel.lockForUpdate.mockResolvedValue({
    id: 2,
    order_no: 'SO-20261112-002',
    customer_id: 1,
    total: '750000.00',
    status: 'DRAFT'
  });
  orderModel.findItemsByOrderId.mockResolvedValue([{ product_id: 5, qty: 10 }]);
  orderModel.findDetailById.mockResolvedValue({
    id: 2,
    status: 'LUNAS',
    payments: [{ id: 11, amount: '800000.00' }]
  });

  paymentModel.lockCustomerById.mockResolvedValue({
    id: 1,
    credit_limit: '2500000.00',
    payment_term_days: 30
  });
  paymentModel.lockProductById.mockResolvedValue({ id: 5, code: 'SBN-08', stock: 20 });
  paymentModel.decrementStock.mockResolvedValue(1);
  paymentModel.hasOutMovement.mockResolvedValue(false);
  paymentModel.insertMovement.mockResolvedValue(1);
  paymentModel.insertPayment.mockResolvedValue(11);
  paymentModel.updateOrderAfterPayment.mockResolvedValue(1);

  customerModel.sumOutstanding.mockResolvedValue('0.00');
});

describe('paymentService — d1 sampai d8 (white-box)', () => {
  test('d2: tunai nominal 0 ditolak', () => {
    expect(() => paymentService.validateMatrix(0, 'TUNAI', 'TUNAI', 75000000))
      .toThrow('Nominal tidak valid');
  });

  test('d3: transfer melebihi total ditolak', () => {
    expect(() => paymentService.validateMatrix(75000100, 'KREDIT', 'TRANSFER', 75000000))
      .toThrow('Transfer tidak boleh melebihi total');
  });

  test('d4: tunai kurang memakai format Rp{selisih}', () => {
    expect(() => paymentService.resolveOutcome(72500000, 75000000, 'TUNAI', {}, 0))
      .toThrow('Nominal kurang Rp25000');
  });

  test('d5: nominal lebih besar menghasilkan LUNAS dan kembalian', () => {
    expect(paymentService.resolveOutcome(80000000, 75000000, 'TUNAI', {}, 0)).toMatchObject({
      status: 'LUNAS',
      changeCents: 5000000,
      remainingCents: 0,
      dueDateDays: null
    });
  });

  test('d6: sisa kredit melebihi limit ditolak', () => {
    expect(() => paymentService.resolveOutcome(
      10000000,
      75000000,
      'KREDIT',
      { credit_limit: '500000.00', payment_term_days: 30 },
      20000000
    )).toThrow('Melebihi limit kredit');
  });

  test('d6: limit 0 tidak aktif untuk kredit sebagian', () => {
    expect(() => paymentService.resolveOutcome(
      0,
      10000000,
      'KREDIT',
      { credit_limit: '0', payment_term_days: 0 },
      0
    )).toThrow('Melebihi limit kredit');
  });

  test('d6: sisa tepat pada sisa limit diterima', () => {
    expect(paymentService.resolveOutcome(
      0,
      50000000,
      'KREDIT',
      { credit_limit: '250000000', payment_term_days: 14 },
      200000000
    )).toMatchObject({ status: 'PIUTANG', remainingCents: 50000000, dueDateDays: 14 });
  });
});

describe('paymentService.processPayment', () => {
  test('kas Rp800.000 untuk tagihan Rp750.000 menghasilkan kembalian Rp50.000', async () => {
    const result = await paymentService.processPayment(2, {
      payment_type: 'TUNAI',
      method: 'TUNAI',
      nominal: '800000.00'
    }, 3);

    expect(paymentModel.insertPayment.mock.calls[0][1]).toMatchObject({
      amount: '800000.00',
      changeAmount: '50000.00',
      method: 'TUNAI',
      userId: 3
    });
    expect(paymentModel.updateOrderAfterPayment.mock.calls[0][2]).toMatchObject({
      status: 'LUNAS',
      paymentType: 'TUNAI'
    });
    expect(paymentModel.insertMovement.mock.calls[0][1]).toMatchObject({
      productId: 5,
      qty: 10,
      reference: 'SO-20261112-002',
      userId: 3
    });
    expect(paymentModel.decrementStock.mock.calls[0]).toEqual([CONNECTION, 5, 10]);
    expect(result.order.status).toBe('LUNAS');
    expect(result.payment).toMatchObject({ id: 11 });
  });

  test('kredit tanpa uang muka tidak membuat payment, tetapi tetap PIUTANG', async () => {
    orderModel.lockForUpdate.mockResolvedValue({
      id: 2,
      order_no: 'SO-20261112-002',
      customer_id: 1,
      total: '150000.00',
      status: 'DRAFT'
    });
    orderModel.findItemsByOrderId.mockResolvedValue([{ product_id: 5, qty: 1 }]);
    customerModel.sumOutstanding.mockResolvedValue('0.00');

    await paymentService.processPayment(2, {
      payment_type: 'KREDIT',
      method: 'TUNAI',
      nominal: '0.00'
    }, 3);

    expect(paymentModel.insertPayment).not.toHaveBeenCalled();
    expect(paymentModel.updateOrderAfterPayment.mock.calls[0][2]).toMatchObject({
      status: 'PIUTANG',
      paymentType: 'KREDIT',
      dueDateDays: 30
    });
  });

  test('order sudah dibayar ditolak dan tidak menyentuh stok/payment', async () => {
    orderModel.lockForUpdate.mockResolvedValue({
      id: 2,
      order_no: 'SO-20261112-001',
      customer_id: 1,
      total: '750000.00',
      status: 'LUNAS'
    });

    await expect(paymentService.processPayment(2, {
      payment_type: 'TUNAI',
      method: 'TUNAI',
      nominal: '750000.00'
    }, 3)).rejects.toMatchObject({
      message: 'Order sudah diproses',
      statusCode: 409
    });

    expect(paymentModel.lockCustomerById).not.toHaveBeenCalled();
    expect(paymentModel.decrementStock).not.toHaveBeenCalled();
    expect(paymentModel.insertPayment).not.toHaveBeenCalled();
  });

  test('stok berubah saat pembayaran membatalkan seluruh proses', async () => {
    paymentModel.lockProductById.mockResolvedValue({ id: 5, stock: 5 });

    await expect(paymentService.processPayment(2, {
      payment_type: 'TUNAI',
      method: 'TUNAI',
      nominal: '750000.00'
    }, 3)).rejects.toMatchObject({
      message: 'Stok tidak cukup, tersedia 5',
      statusCode: 409
    });

    expect(paymentModel.insertPayment).not.toHaveBeenCalled();
    expect(paymentModel.updateOrderAfterPayment).not.toHaveBeenCalled();
  });

  test('kegagalan update status diteruskan agar transaksi rollback', async () => {
    paymentModel.updateOrderAfterPayment.mockResolvedValue(0);

    await expect(paymentService.processPayment(2, {
      payment_type: 'TUNAI',
      method: 'TUNAI',
      nominal: '750000.00'
    }, 3)).rejects.toMatchObject({
      message: 'Order sudah diproses',
      statusCode: 409
    });
  });

  test('movement ganda dicegah untuk reference yang sama', async () => {
    paymentModel.hasOutMovement.mockResolvedValue(true);
    await paymentService.processPayment(2, {
      payment_type: 'TUNAI',
      method: 'TUNAI',
      nominal: '750000.00'
    }, 3);
    expect(paymentModel.insertMovement).not.toHaveBeenCalled();
  });
});
