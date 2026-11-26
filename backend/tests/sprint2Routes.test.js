'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('../src/services/orderService', () => ({
  createOrder: jest.fn(),
  listOrders: jest.fn(),
  getOrder: jest.fn(),
  toPublicOrder: jest.fn()
}));
jest.mock('../src/services/paymentService', () => ({
  processPayment: jest.fn()
}));
jest.mock('../src/services/invoiceService', () => ({
  generateInvoice: jest.fn()
}));

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const AppError = require('../src/helpers/AppError');
const { fail } = require('../src/helpers/response');
const orderRoutes = require('../src/routes/orderRoutes');
const orderService = require('../src/services/orderService');
const paymentService = require('../src/services/paymentService');
const invoiceService = require('../src/services/invoiceService');

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
  app.use('/api/orders', orderRoutes);
  app.use((req, res) => fail(res, 'Endpoint tidak ditemukan', null, 404));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    const status = err instanceof AppError ? err.statusCode : 500;
    const message = err instanceof AppError
      ? err.message
      : 'Terjadi kesalahan pada server';
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

const VALID_ITEM = { code: 'BRS-05', qty: 1 };

beforeEach(() => {
  Object.values(orderService).forEach((fn) => {
    if (typeof fn.mockReset === 'function') {
      fn.mockReset();
    }
  });
  Object.values(paymentService).forEach((fn) => {
    if (typeof fn.mockReset === 'function') {
      fn.mockReset();
    }
  });
  Object.values(invoiceService).forEach((fn) => {
    if (typeof fn.mockReset === 'function') {
      fn.mockReset();
    }
  });

  orderService.createOrder.mockResolvedValue({ id: 1, status: 'DRAFT', items: [] });
  orderService.listOrders.mockResolvedValue({ orders: [], pagination: {} });
  orderService.getOrder.mockResolvedValue({ id: 1, status: 'DRAFT' });
  paymentService.processPayment.mockResolvedValue({ order: { status: 'LUNAS' }, payment: null });
  invoiceService.generateInvoice.mockResolvedValue({
    orderNo: 'SO-20261112-001',
    format: 'a4',
    pdf: Buffer.from('%PDF-1.4 invoice')
  });
});

describe('POST /api/orders', () => {
  test('guest ditolak 401', async () => {
    const agent = await as(null);
    const response = await agent.post('/api/orders')
      .send({ customer_id: 7, items: [VALID_ITEM] });
    expect(response.status).toBe(401);
    expect(response.body.message).toBe('Sesi berakhir, silakan login kembali');
  });

  test('KASIR ditolak 403', async () => {
    const agent = await as('KASIR');
    const response = await agent.post('/api/orders')
      .send({ customer_id: 7, items: [VALID_ITEM] });
    expect(response.status).toBe(403);
  });

  test('SALES berhasil membuat DRAFT dengan respons 201', async () => {
    const agent = await as('SALES');
    const response = await agent.post('/api/orders')
      .send({ customer_id: 7, items: [VALID_ITEM] });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    expect(response.body.data.order.status).toBe('DRAFT');
    expect(orderService.createOrder.mock.calls[0][1]).toBe(2);
    expect(response.body).not.toHaveProperty('password');
  });

  test('items kosong memakai pesan persis', async () => {
    const agent = await as('SALES');
    const response = await agent.post('/api/orders')
      .send({ customer_id: 7, items: [] });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Minimal satu barang harus ditambahkan');
  });

  test('field harga dari client ditolak', async () => {
    const agent = await as('SALES');
    const response = await agent.post('/api/orders')
      .send({ customer_id: 7, items: [Object.assign({}, VALID_ITEM, { unit_price: '1.00' })] });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Field tidak diizinkan');
  });
});

describe('GET /api/orders dan GET /api/orders/:id', () => {
  test('KASIR dapat daftar; GUDANG dan guest tidak', async () => {
    const kasir = await as('KASIR');
    const response = await kasir.get('/api/orders');
    expect(response.status).toBe(200);

    const gudang = await as('GUDANG');
    expect((await gudang.get('/api/orders')).status).toBe(403);
    const guest = await as(null);
    expect((await guest.get('/api/orders')).status).toBe(401);
  });

  test('SALES menerima filter dan actor untuk pembatasan akses', async () => {
    const agent = await as('SALES');
    await agent.get('/api/orders?q=SO-2026&status=DRAFT&page=2&limit=5');
    expect(orderService.listOrders.mock.calls[0][0]).toMatchObject({
      q: 'SO-2026',
      status: 'DRAFT',
      page: '2',
      limit: '5'
    });
    expect(orderService.listOrders.mock.calls[0][1]).toMatchObject({ id: 2, role: 'SALES' });
  });

  test('tanggal akhir sebelum awal ditolak', async () => {
    const agent = await as('ADMIN');
    const response = await agent.get('/api/orders?date_from=2026-12-01&date_to=2026-11-01');
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Tanggal akhir tidak boleh sebelum tanggal awal');
  });

  test('detail tidak ditemukan menghasilkan 404', async () => {
    orderService.getOrder.mockRejectedValue(new AppError('Order tidak ditemukan', 404));
    const agent = await as('ADMIN');
    const response = await agent.get('/api/orders/999');
    expect(response.status).toBe(404);
  });

  test('ID detail tidak valid ditolak 400', async () => {
    const agent = await as('ADMIN');
    const response = await agent.get('/api/orders/abc');
    expect(response.status).toBe(400);
  });
});

describe('POST /api/orders/:id/payments', () => {
  const BODY = { payment_type: 'TUNAI', method: 'TUNAI', nominal: '750000.00' };

  test('hanya KASIR yang dapat membayar', async () => {
    const sales = await as('SALES');
    expect((await sales.post('/api/orders/1/payments').send(BODY)).status).toBe(403);
    const kasir = await as('KASIR');
    expect((await kasir.post('/api/orders/1/payments').send(BODY)).status).toBe(200);
  });

  test('nominal negatif ditolak dengan pesan SKPL', async () => {
    const agent = await as('KASIR');
    const response = await agent.post('/api/orders/1/payments')
      .send(Object.assign({}, BODY, { nominal: '-1' }));
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Nominal tidak valid');
  });

  test('order sudah diproses diteruskan sebagai 409', async () => {
    paymentService.processPayment.mockRejectedValue(new AppError('Order sudah diproses', 409));
    const agent = await as('KASIR');
    const response = await agent.post('/api/orders/1/payments').send(BODY);
    expect(response.status).toBe(409);
    expect(response.body.message).toBe('Order sudah diproses');
  });
});

describe('GET /api/orders/:id/invoice.pdf', () => {
  test('KASIR mendapat application/pdf', async () => {
    const agent = await as('KASIR');
    const response = await agent.get('/api/orders/1/invoice.pdf');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/pdf/);
    expect(response.headers['content-disposition']).toContain('invoice-SO-20261112-001.pdf');
  });

  test('SALES tidak dapat mencetak invoice', async () => {
    const agent = await as('SALES');
    const response = await agent.get('/api/orders/1/invoice.pdf');
    expect(response.status).toBe(403);
    expect(invoiceService.generateInvoice).not.toHaveBeenCalled();
  });

  test('format tidak valid ditolak 400', async () => {
    const agent = await as('ADMIN');
    const response = await agent.get('/api/orders/1/invoice.pdf?format=letter');
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Format invoice tidak valid');
  });

  test('order DRAFT ditolak 409', async () => {
    invoiceService.generateInvoice.mockRejectedValue(new AppError(
      'Invoice hanya tersedia untuk order LUNAS atau PIUTANG', 409
    ));
    const agent = await as('ADMIN');
    const response = await agent.get('/api/orders/1/invoice.pdf');
    expect(response.status).toBe(409);
  });
});
