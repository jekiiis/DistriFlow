'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('../src/models/orderModel');
jest.mock('../src/services/pdfService', () => ({
  buildInvoice: jest.fn()
}));

const orderModel = require('../src/models/orderModel');
const pdfService = require('../src/services/pdfService');
const invoiceService = require('../src/services/invoiceService');

beforeEach(() => {
  orderModel.findDetailById.mockReset();
  pdfService.buildInvoice.mockReset();
  pdfService.buildInvoice.mockResolvedValue(Buffer.from('%PDF-1.4 invoice'));
});

describe('invoiceService.generateInvoice', () => {
  test('format default a4', async () => {
    orderModel.findDetailById.mockResolvedValue({
      order_no: 'SO-20261112-001',
      status: 'LUNAS'
    });
    const result = await invoiceService.generateInvoice(1);
    expect(result.format).toBe('a4');
    expect(pdfService.buildInvoice.mock.calls[0][1]).toBe('a4');
  });

  test('format 80mm diterima', async () => {
    orderModel.findDetailById.mockResolvedValue({
      order_no: 'SO-20261112-001',
      status: 'PIUTANG'
    });
    const result = await invoiceService.generateInvoice(1, '80mm');
    expect(result.format).toBe('80mm');
  });

  test('format di luar a4/80mm ditolak 400 tanpa query', async () => {
    await expect(invoiceService.generateInvoice(1, 'letter'))
      .rejects.toMatchObject({ message: 'Format invoice tidak valid', statusCode: 400 });
    expect(orderModel.findDetailById).not.toHaveBeenCalled();
  });

  test('DRAFT dan BATAL ditolak 409', async () => {
    orderModel.findDetailById.mockResolvedValue({ status: 'DRAFT' });
    await expect(invoiceService.generateInvoice(1))
      .rejects.toMatchObject({ statusCode: 409 });
    orderModel.findDetailById.mockResolvedValue({ status: 'BATAL' });
    await expect(invoiceService.generateInvoice(1))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(pdfService.buildInvoice).not.toHaveBeenCalled();
  });

  test('order tidak ditemukan 404', async () => {
    orderModel.findDetailById.mockResolvedValue(null);
    await expect(invoiceService.generateInvoice(1))
      .rejects.toMatchObject({ message: 'Order tidak ditemukan', statusCode: 404 });
  });

  test('invoice tidak menulis data', () => {
    const source = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/services/invoiceService.js'),
      'utf8'
    );
    expect(source).not.toMatch(/INSERT\s+INTO/i);
    expect(source).not.toMatch(/UPDATE\s+/i);
  });
});
