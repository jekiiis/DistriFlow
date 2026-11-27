'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('../src/services/catalogService', () => ({
  LEVELS: ['RETAIL', 'GROSIR'],
  listCustomers: jest.fn(),
  getCustomerCredit: jest.fn(),
  listProducts: jest.fn(),
  getProductPrice: jest.fn(),
  getRestock: jest.fn(),
  getProduct: jest.fn(),
  storeProduct: jest.fn(),
  updateProduct: jest.fn(),
  setProductActive: jest.fn(),
  getCustomer: jest.fn(),
  storeCustomer: jest.fn(),
  updateCustomer: jest.fn(),
  setCustomerActive: jest.fn()
}));
jest.mock('../src/services/stockService', () => ({
  MESSAGE: {
    PRODUCT_ID_INVALID: 'ID produk tidak valid',
    QTY_INVALID: 'Jumlah tidak valid',
    DOCUMENT_NO_REQUIRED: 'No. dokumen wajib diisi',
    DOCUMENT_NO_TOO_LONG: 'No. dokumen maksimal 50 karakter',
    INVOICE_MATCH_REQUIRED: 'Centang kesesuaian dengan faktur',
    NOTE_INVALID: 'Catatan tidak valid'
  },
  createStockIn: jest.fn(),
  listStockIns: jest.fn()
}));
jest.mock('../src/services/orderService', () => ({
  createOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrder: jest.fn(),
  cancelOrder: jest.fn(),
  toPublicOrder: jest.fn()
}));
jest.mock('../src/services/receivableService', () => ({
  listReceivables: jest.fn(),
  getReceivable: jest.fn(),
  settleReceivable: jest.fn()
}));
jest.mock('../src/services/receiptPdfService', () => ({
  generateReceipt: jest.fn()
}));
jest.mock('../src/services/reportService', () => ({
  getSalesReport: jest.fn(),
  generateSalesReportPdf: jest.fn(),
  getDashboardKpi: jest.fn()
}));

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const AppError = require('../src/helpers/AppError');
const { fail } = require('../src/helpers/response');
const productRoutes = require('../src/routes/productRoutes');
const customerRoutes = require('../src/routes/customerRoutes');
const stockRoutes = require('../src/routes/stockRoutes');
const orderRoutes = require('../src/routes/orderRoutes');
const receivableRoutes = require('../src/routes/receivableRoutes');
const paymentReceiptRoutes = require('../src/routes/paymentReceiptRoutes');
const reportRoutes = require('../src/routes/reportRoutes');
const dashboardRoutes = require('../src/routes/dashboardRoutes');
const catalogService = require('../src/services/catalogService');
const stockService = require('../src/services/stockService');
const orderService = require('../src/services/orderService');
const receivableService = require('../src/services/receivableService');
const receiptPdfService = require('../src/services/receiptPdfService');
const reportService = require('../src/services/reportService');

const ROLE_IDS = { ADMIN: 1, SALES: 2, KASIR: 3, GUDANG: 4 };

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: 'test-session-secret-not-for-production',
    resave: false,
    saveUninitialized: false
  }));
  app.get('/__role/:role', (req, res) => {
    const role = req.params.role;
    req.session.user = { id: ROLE_IDS[role] || 9, username: 'probe', role };
    return res.sendStatus(200);
  });
  app.use('/api/products', productRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/stock-in', stockRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/receivables', receivableRoutes);
  app.use('/api/payments', paymentReceiptRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use((req, res) => fail(res, 'Endpoint tidak ditemukan', null, 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    const status = err instanceof AppError ? err.statusCode : 500;
    const message = err instanceof AppError ? err.message : 'Terjadi kesalahan pada server';
    if (err && err.needConfirm === true) {
      return res.status(409).json({ success: false, message, needConfirm: true });
    }
    return fail(res, message, err.errors || null, status);
  });
  return app;
}

async function as(role) {
  const agent = request.agent(makeApp());
  if (role) {
    await agent.get('/__role/' + role);
  }
  return agent;
}

function resetAllMocks() {
  [catalogService, stockService, orderService, receivableService, receiptPdfService, reportService]
    .forEach((service) => Object.values(service).forEach((fn) => {
      if (typeof fn.mockReset === 'function') {
        fn.mockReset();
      }
    }));
}

beforeEach(() => {
  resetAllMocks();

  catalogService.storeProduct.mockResolvedValue({ id: 1, code: 'BRS-99' });
  catalogService.updateProduct.mockResolvedValue({ id: 1, code: 'BRS-99' });
  catalogService.setProductActive.mockResolvedValue({ id: 1, is_active: false });
  catalogService.storeCustomer.mockResolvedValue({ id: 1, code: 'PLG-99' });
  catalogService.updateCustomer.mockResolvedValue({ id: 1, code: 'PLG-99' });
  catalogService.setCustomerActive.mockResolvedValue({ id: 1, is_active: false });
  catalogService.getRestock.mockResolvedValue({ products: [], generated_at: '2026-11-27' });
  catalogService.getProduct.mockResolvedValue({ id: 1, code: 'BRS-99' });
  catalogService.getCustomer.mockResolvedValue({ id: 1, code: 'PLG-99' });

  stockService.createStockIn.mockResolvedValue({ movement: { id: 1, stock_after: 11 } });
  stockService.listStockIns.mockResolvedValue({ movements: [], pagination: {} });

  orderService.cancelOrder.mockResolvedValue({ id: 1, status: 'BATAL' });
  orderService.toPublicOrder.mockImplementation((order) => order);

  receivableService.listReceivables.mockResolvedValue({ receivables: [], pagination: {} });
  receivableService.getReceivable.mockResolvedValue({ id: 1, status: 'PIUTANG' });
  receivableService.settleReceivable.mockResolvedValue({
    payment: { id: 5 },
    receivable: { id: 1, status: 'LUNAS' }
  });
  receiptPdfService.generateReceipt.mockResolvedValue({
    orderNo: 'SO-20261112-001',
    paymentId: 5,
    pdf: Buffer.from('%PDF-1.4 receipt')
  });

  reportService.getSalesReport.mockResolvedValue({ summary: { omzet: '0.00' } });
  reportService.generateSalesReportPdf.mockResolvedValue({
    report: { period: { from: '2026-11-01', to: '2026-11-27' } },
    pdf: Buffer.from('%PDF-1.4 report')
  });
  reportService.getDashboardKpi.mockResolvedValue({ omzetHariIni: '0.00' });
});

describe('FR-13/FR-15 master produk', () => {
  const PRODUCT = {
    code: 'BRS-99',
    name: 'Beras Pandan Wangi',
    unit: 'karung',
    price_retail: '75000.00',
    price_wholesale: '72000.00',
    min_stock: 50
  };

  test('POST /api/products hanya ADMIN', async () => {
    expect((await (await as('GUDANG')).post('/api/products').send(PRODUCT)).status).toBe(403);
    expect((await (await as(null)).post('/api/products').send(PRODUCT)).status).toBe(401);
    const admin = await as('ADMIN');
    const response = await admin.post('/api/products').send(PRODUCT);
    expect(response.status).toBe(201);
    expect(response.body.data.product.code).toBe('BRS-99');
  });

  test('field stock ditolak pada pembuatan dan perubahan produk', async () => {
    const admin = await as('ADMIN');
    expect((await admin.post('/api/products').send(Object.assign({}, PRODUCT, { stock: 10 }))).status)
      .toBe(400);
    expect((await admin.put('/api/products/1').send({ name: 'Ubah', stock: 1 })).status)
      .toBe(400);
    expect(catalogService.storeProduct).not.toHaveBeenCalled();
    expect(catalogService.updateProduct).not.toHaveBeenCalled();
  });

  test('harga non-positif dan nama kosong ditolak', async () => {
    const admin = await as('ADMIN');
    expect((await admin.post('/api/products').send(Object.assign({}, PRODUCT, { price_retail: '0' }))).status)
      .toBe(400);
    expect((await admin.post('/api/products').send(Object.assign({}, PRODUCT, { name: '  ' }))).status)
      .toBe(400);
  });

  test('GET /api/products/restock hanya ADMIN dan GUDANG', async () => {
    expect((await (await as('SALES')).get('/api/products/restock')).status).toBe(403);
    const gudang = await as('GUDANG');
    const response = await gudang.get('/api/products/restock');
    expect(response.status).toBe(200);
    expect(response.body.data.products).toEqual([]);
  });

  test('PATCH status produk hanya ADMIN dan memakai boolean', async () => {
    expect((await (await as('GUDANG')).patch('/api/products/1').send({ is_active: false })).status)
      .toBe(403);
    expect((await (await as('ADMIN')).patch('/api/products/1').send({ is_active: 'tidak' })).status)
      .toBe(400);
    const response = await (await as('ADMIN')).patch('/api/products/1').send({ is_active: false });
    expect(response.status).toBe(200);
  });
});

describe('FR-16 master pelanggan', () => {
  const CUSTOMER = {
    code: 'PLG-99',
    name: 'Toko Barokah',
    address: 'Bandung',
    phone: '081234567890',
    price_level: 'GROSIR',
    credit_limit: '2500000.00',
    payment_term_days: 14
  };

  test('POST /api/customers hanya ADMIN', async () => {
    expect((await (await as('SALES')).post('/api/customers').send(CUSTOMER)).status).toBe(403);
    expect((await (await as('KASIR')).post('/api/customers').send(CUSTOMER)).status).toBe(403);
    const response = await (await as('ADMIN')).post('/api/customers').send(CUSTOMER);
    expect(response.status).toBe(201);
    expect(response.body.data.customer.code).toBe('PLG-99');
  });

  test('limit kredit negatif ditolak', async () => {
    const response = await (await as('ADMIN')).post('/api/customers')
      .send(Object.assign({}, CUSTOMER, { credit_limit: '-1' }));
    expect(response.status).toBe(400);
  });

  test('detail dan status pelanggan hanya ADMIN', async () => {
    expect((await (await as('KASIR')).get('/api/customers/1')).status).toBe(403);
    expect((await (await as('ADMIN')).get('/api/customers/1')).status).toBe(200);
    expect((await (await as('SALES')).patch('/api/customers/1').send({ is_active: false })).status)
      .toBe(403);
  });

  test('tidak ada endpoint hapus pelanggan', async () => {
    const response = await (await as('ADMIN')).delete('/api/customers/1');
    expect(response.status).toBe(404);
  });
});

describe('FR-14 barang masuk', () => {
  const STOCK_IN = {
    product_id: 1,
    qty: 5,
    document_no: 'SJ.0112',
    invoice_match: true
  };

  test('hanya ADMIN dan GUDANG yang dapat mencatat', async () => {
    expect((await (await as('SALES')).post('/api/stock-in').send(STOCK_IN)).status).toBe(403);
    const response = await (await as('GUDANG')).post('/api/stock-in').send(STOCK_IN);
    expect(response.status).toBe(201);
    expect(response.body.data.movement.stock_after).toBe(11);
  });

  test('invoice_match wajib true dan qty minimal 1', async () => {
    const gudang = await as('GUDANG');
    expect((await gudang.post('/api/stock-in')
      .send(Object.assign({}, STOCK_IN, { invoice_match: false }))).status).toBe(400);
    expect((await gudang.post('/api/stock-in')
      .send(Object.assign({}, STOCK_IN, { qty: 0 }))).status).toBe(400);
    expect(stockService.createStockIn).not.toHaveBeenCalled();
  });

  test('duplikat dokumen menghasilkan 409 needConfirm', async () => {
    const error = new AppError('No. dokumen sudah dicatat', 409);
    error.needConfirm = true;
    stockService.createStockIn.mockRejectedValue(error);
    const response = await (await as('GUDANG')).post('/api/stock-in').send(STOCK_IN);
    expect(response.status).toBe(409);
    expect(response.body.needConfirm).toBe(true);
  });

  test('riwayat barang masuk dapat dibaca ADMIN dan GUDANG', async () => {
    expect((await (await as('KASIR')).get('/api/stock-in')).status).toBe(403);
    const response = await (await as('GUDANG')).get('/api/stock-in?limit=10');
    expect(response.status).toBe(200);
    expect(stockService.listStockIns.mock.calls[0][0]).toMatchObject({ limit: '10' });
  });
});

describe('FR-09 pembatalan order', () => {
  test('hanya ADMIN yang dapat membatalkan dan alasan wajib', async () => {
    expect((await (await as('SALES')).post('/api/orders/1/cancel').send({ reason: 'salah input' })).status)
      .toBe(403);
    expect((await (await as('ADMIN')).post('/api/orders/1/cancel').send({ reason: '  ' })).status)
      .toBe(400);
    const response = await (await as('ADMIN')).post('/api/orders/1/cancel')
      .send({ reason: 'salah input' });
    expect(response.status).toBe(200);
    expect(orderService.cancelOrder.mock.calls[0][2]).toBe(1);
  });

  test('status LUNAS ditolak dengan 409 dari service', async () => {
    orderService.cancelOrder.mockRejectedValue(new AppError('Order tidak dapat dibatalkan', 409));
    const response = await (await as('ADMIN')).post('/api/orders/1/cancel').send({ reason: 'alasan' });
    expect(response.status).toBe(409);
  });
});

describe('FR-17/FR-18 piutang dan pembayaran', () => {
  test('daftar piutang dapat dibaca ADMIN dan KASIR, bukan SALES/GUDANG', async () => {
    expect((await (await as('SALES')).get('/api/receivables')).status).toBe(403);
    expect((await (await as('GUDANG')).get('/api/receivables')).status).toBe(403);
    expect((await (await as('ADMIN')).get('/api/receivables')).status).toBe(200);
    expect((await (await as('KASIR')).get('/api/receivables')).status).toBe(200);
  });

  test('pelunasan hanya KASIR dengan nominal dan metode valid', async () => {
    expect((await (await as('ADMIN')).post('/api/receivables/1/pay')
      .send({ nominal: '100.00', method: 'TUNAI' })).status).toBe(403);
    const kasir = await as('KASIR');
    expect((await kasir.post('/api/receivables/1/pay')
      .send({ nominal: '0', method: 'TUNAI' })).status).toBe(400);
    expect((await kasir.post('/api/receivables/1/pay')
      .send({ nominal: '100.00', method: 'QRIS' })).status).toBe(400);

    const response = await kasir.post('/api/receivables/1/pay')
      .send({ nominal: '100.00', method: 'TUNAI', reference: 'BUKTI-1' });
    expect(response.status).toBe(201);
    expect(response.body.data.payment.id).toBe(5);
  });

  test('retry dengan kunci sama memakai pesan duplikat dan status 201', async () => {
    receivableService.settleReceivable.mockResolvedValueOnce({
      payment: { id: 9 },
      receivable: { id: 1, status: 'PIUTANG' },
      duplicate: true
    });

    const response = await (await as('KASIR')).post('/api/receivables/1/pay')
      .send({ nominal: '100.00', method: 'TUNAI', reference: 'BUKTI-1' });
    expect(response.status).toBe(201);
    expect(response.body.message).toMatch(/sudah tercatat/);
    expect(response.body.data.payment.id).toBe(9);
  });

  test('bukti PDF hanya KASIR dan benar-benar PDF', async () => {
    expect((await (await as('ADMIN')).get('/api/payments/5/receipt.pdf')).status).toBe(403);
    const response = await (await as('KASIR')).get('/api/payments/5/receipt.pdf');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.length).toBeGreaterThan(0);
  });
});

describe('FR-19/FR-20 laporan dan KPI', () => {
  test('laporan penjualan hanya ADMIN dan memerlukan periode', async () => {
    expect((await (await as('KASIR')).get('/api/reports/sales')).status).toBe(403);
    const admin = await as('ADMIN');
    expect((await admin.get('/api/reports/sales')).status).toBe(400);
    expect((await admin.get('/api/reports/sales?date_from=2026-12-01&date_to=2026-11-01')).status)
      .toBe(400);
    const response = await admin.get('/api/reports/sales?date_from=2026-11-01&date_to=2026-11-27');
    expect(response.status).toBe(200);
    expect(reportService.getSalesReport.mock.calls[0][0]).toMatchObject({
      date_from: '2026-11-01',
      date_to: '2026-11-27'
    });
  });

  test('ekspor PDF laporan hanya ADMIN', async () => {
    expect((await (await as('SALES')).get('/api/reports/sales.pdf?date_from=2026-11-01&date_to=2026-11-27')).status)
      .toBe(403);
    const response = await (await as('ADMIN'))
      .get('/api/reports/sales.pdf?date_from=2026-11-01&date_to=2026-11-27');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('application/pdf');
    expect(response.body.length).toBeGreaterThan(0);
  });

  test('KPI dapat dibaca semua peran login dengan actor yang benar', async () => {
    expect((await (await as(null)).get('/api/dashboard/kpi')).status).toBe(401);
    await (await as('GUDANG')).get('/api/dashboard/kpi');
    expect(reportService.getDashboardKpi.mock.calls[0][0]).toMatchObject({ role: 'GUDANG' });
    expect((await (await as('ADMIN')).get('/api/dashboard/kpi')).status).toBe(200);
  });
});
