'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('../src/models/customerModel', () => ({
  findMany: jest.fn(),
  countAll: jest.fn(),
  findActiveById: jest.fn(),
  sumOutstanding: jest.fn()
}));

jest.mock('../src/models/productModel', () => ({
  findMany: jest.fn(),
  countAll: jest.fn(),
  findActiveByCode: jest.fn()
}));

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const AppError = require('../src/helpers/AppError');
const { fail, HTTP_STATUS } = require('../src/helpers/response');
const apiRoutes = require('../src/routes');
const customerModel = require('../src/models/customerModel');
const productModel = require('../src/models/productModel');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use(session({ secret: 'test-only-catalog-secret', resave: false, saveUninitialized: false }));

  app.get('/__role/:role', (req, res) => {
    req.session.user = { id: 1, username: 'probe', role: req.params.role };
    return res.sendStatus(200);
  });

  app.use('/api', apiRoutes);
  app.use((req, res) => fail(res, 'Endpoint tidak ditemukan', null, HTTP_STATUS.NOT_FOUND));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    if (err instanceof AppError) {
      return fail(res, err.message, err.errors, err.statusCode);
    }
    return fail(res, 'Terjadi kesalahan pada server', null, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  });

  return app;
}

async function getAs(role, pathname) {
  const agent = request.agent(makeApp());
  if (role) {
    await agent.get('/__role/' + role);
  }
  return agent.get(pathname);
}

beforeEach(() => {
  customerModel.findMany.mockReset().mockResolvedValue([{
    id: 1,
    code: 'PLG-001',
    name: 'Toko Makmur',
    address: 'Jl. Sudirman No. 12, Bandung',
    phone: '022-4200110',
    price_level: 'GROSIR',
    credit_limit: '2500000.00',
    payment_term_days: 14,
    is_active: 1
  }]);
  customerModel.countAll.mockReset().mockResolvedValue(1);
  customerModel.findActiveById.mockReset().mockResolvedValue({
    id: 1,
    code: 'PLG-001',
    name: 'Toko Makmur',
    price_level: 'GROSIR',
    credit_limit: '2500000.00',
    is_active: 1
  });
  customerModel.sumOutstanding.mockReset().mockResolvedValue('2000000.00');
  productModel.findMany.mockReset().mockResolvedValue([{
    id: 1,
    code: 'BRS-05',
    name: 'Beras Premium 5 kg',
    unit: 'karung',
    price_retail: '75000.00',
    price_wholesale: '72000.00',
    stock: 30,
    min_stock: 50,
    is_active: 1
  }]);
  productModel.countAll.mockReset().mockResolvedValue(1);
  productModel.findActiveByCode.mockReset().mockResolvedValue({
    id: 1,
    code: 'BRS-05',
    name: 'Beras Premium 5 kg',
    unit: 'karung',
    price_retail: '75000.00',
    price_wholesale: '72000.00',
    stock: 30,
    is_active: 1
  });
});

describe('GET /api/customers', () => {
  test('tanpa sesi ditolak 401', async () => {
    const response = await getAs(null, '/api/customers');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, message: 'Sesi berakhir, silakan login kembali' });
  });

  test('GUDANG ditolak 403', async () => {
    const response = await getAs('GUDANG', '/api/customers');

    expect(response.status).toBe(403);
    expect(response.body.message).toBe('Anda tidak memiliki hak akses untuk operasi ini');
  });

  test('KASIR mendapat daftar pelanggan aktif dengan nominal string', async () => {
    const response = await getAs('KASIR', '/api/customers');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe('Daftar pelanggan');
    expect(response.body.data.customers[0].credit_limit).toBe('2500000.00');
    expect(response.body.data.customers[0]).not.toHaveProperty('password');
    expect(response.body.data.customers[0]).not.toHaveProperty('is_active');
  });

  test('pencarian dan paginasi diteruskan ke model', async () => {
    const response = await getAs('SALES', '/api/customers?search=Toko&page=2&limit=5');

    expect(response.status).toBe(200);
    expect(customerModel.findMany).toHaveBeenCalledWith({
      search: 'Toko',
      limit: 5,
      offset: 5
    });
  });

  test('limit di luar rentang ditolak 400', async () => {
    const response = await getAs('SALES', '/api/customers?limit=500');

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Limit harus antara 1 dan 100');
    expect(response.body.errors).toEqual([{ field: 'limit', message: 'Limit harus antara 1 dan 100' }]);
  });
});

describe('GET /api/customers/:id/credit', () => {
  test('hanya Sales dan Admin yang dapat mengakses', async () => {
    const kasir = await getAs('KASIR', '/api/customers/1/credit');
    const sales = await getAs('SALES', '/api/customers/1/credit');

    expect(kasir.status).toBe(403);
    expect(sales.status).toBe(200);
  });

  test('mengembalikan limit, piutang, dan sisa limit tanpa field risiko', async () => {
    const response = await getAs('ADMIN', '/api/customers/1/credit');

    expect(response.status).toBe(200);
    expect(response.body.data.credit_limit).toBe('2500000.00');
    expect(response.body.data.outstanding).toBe('2000000.00');
    expect(response.body.data.remaining_limit).toBe('500000.00');
    expect(response.body.data).not.toHaveProperty('risk_score');
    expect(response.body.data).not.toHaveProperty('risk_label');
  });

  test('limit 0 menghasilkan sisa limit 0', async () => {
    customerModel.findActiveById.mockResolvedValue({
      id: 4,
      code: 'PLG-004',
      name: 'Toko Melati',
      price_level: 'RETAIL',
      credit_limit: '0.00',
      is_active: 1
    });
    customerModel.sumOutstanding.mockResolvedValue('0.00');

    const response = await getAs('SALES', '/api/customers/4/credit');

    expect(response.status).toBe(200);
    expect(response.body.data.remaining_limit).toBe('0.00');
  });

  test('ID tidak valid dan pelanggan tidak ditemukan', async () => {
    const invalid = await getAs('SALES', '/api/customers/abc/credit');
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('ID pelanggan tidak valid');

    customerModel.findActiveById.mockResolvedValue(null);
    const missing = await getAs('SALES', '/api/customers/99/credit');
    expect(missing.status).toBe(404);
    expect(missing.body.message).toBe('Pelanggan tidak ditemukan');
  });
});

describe('GET /api/products', () => {
  test('tersedia untuk semua peran login termasuk GUDANG', async () => {
    const response = await getAs('GUDANG', '/api/products');

    expect(response.status).toBe(200);
    expect(response.body.data.products[0].price_retail).toBe('75000.00');
    expect(response.body.data.products[0].price_wholesale).toBe('72000.00');
    expect(response.body.data.products[0].stock).toBe(30);
  });

  test('tanpa sesi ditolak 401', async () => {
    const response = await getAs(null, '/api/products');

    expect(response.status).toBe(401);
  });
});

describe('GET /api/products/by-code/:code', () => {
  test('Kasir ditolak 403', async () => {
    const response = await getAs('KASIR', '/api/products/by-code/BRS-05');

    expect(response.status).toBe(403);
  });

  test('harga grosir, qty, dan diskon dihitung dengan presisi', async () => {
    const response = await getAs('SALES', '/api/products/by-code/BRS-05?level=GROSIR&qty=3&discount=0.01');

    expect(response.status).toBe(200);
    expect(response.body.data.unit_price).toBe('72000.00');
    expect(response.body.data.subtotal).toBe('216000.00');
    expect(response.body.data.discount).toBe('0.01');
    expect(response.body.data.line_total).toBe('215999.99');
  });

  test('validasi level, qty, dan diskon negatif', async () => {
    const level = await getAs('SALES', '/api/products/by-code/BRS-05?level=INVALID');
    const qty = await getAs('SALES', '/api/products/by-code/BRS-05?qty=0');
    const discount = await getAs('SALES', '/api/products/by-code/BRS-05?discount=-1');

    expect(level.status).toBe(400);
    expect(level.body.message).toBe('Level harga tidak valid');
    expect(qty.status).toBe(400);
    expect(qty.body.message).toBe('Kuantitas harus bilangan bulat positif');
    expect(discount.status).toBe(400);
    expect(discount.body.message).toBe('Nominal diskon tidak valid');
  });

  test('produk tidak ditemukan menghasilkan 404', async () => {
    productModel.findActiveByCode.mockResolvedValue(null);

    const response = await getAs('SALES', '/api/products/by-code/XX-01');

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Produk tidak ditemukan');
  });
});

describe('regresi endpoint Sprint 1', () => {
  test('endpoint API yang tidak dikenal tetap 404 seragam', async () => {
    const response = await getAs('ADMIN', '/api/tidak-ada');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ success: false, message: 'Endpoint tidak ditemukan' });
  });

  test('GET /api/users dengan SALES tetap 403', async () => {
    const response = await getAs('SALES', '/api/users');

    expect(response.status).toBe(403);
  });
});
