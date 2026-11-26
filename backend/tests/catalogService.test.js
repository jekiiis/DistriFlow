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

const customerModel = require('../src/models/customerModel');
const productModel = require('../src/models/productModel');
const catalogService = require('../src/services/catalogService');

const customerRow = {
  id: 1,
  code: 'PLG-001',
  name: 'Toko Makmur',
  address: 'Jl. Sudirman No. 12, Bandung',
  phone: '022-4200110',
  price_level: 'GROSIR',
  credit_limit: '2500000.00',
  payment_term_days: 14,
  is_active: 1
};

const productRow = {
  id: 1,
  code: 'BRS-05',
  name: 'Beras Premium 5 kg',
  unit: 'karung',
  price_retail: '75000.00',
  price_wholesale: '72000.00',
  stock: 30,
  min_stock: 50,
  is_active: 1
};

beforeEach(() => {
  customerModel.findMany.mockReset().mockResolvedValue([customerRow]);
  customerModel.countAll.mockReset().mockResolvedValue(11);
  customerModel.findActiveById.mockReset().mockResolvedValue(customerRow);
  customerModel.sumOutstanding.mockReset().mockResolvedValue('2000000.00');
  productModel.findMany.mockReset().mockResolvedValue([productRow]);
  productModel.countAll.mockReset().mockResolvedValue(1);
  productModel.findActiveByCode.mockReset().mockResolvedValue(productRow);
});

describe('catalogService.listCustomers', () => {
  test('memetakan baris aktif dan paginasi dengan aman', async () => {
    const result = await catalogService.listCustomers({ search: '  Toko  ', page: '2', limit: '5' });

    expect(customerModel.findMany).toHaveBeenCalledWith({
      search: 'Toko',
      limit: 5,
      offset: 5
    });
    expect(result.customers).toEqual([{
      id: 1,
      code: 'PLG-001',
      name: 'Toko Makmur',
      address: 'Jl. Sudirman No. 12, Bandung',
      phone: '022-4200110',
      price_level: 'GROSIR',
      credit_limit: '2500000.00',
      payment_term_days: 14
    }]);
    expect(result.pagination).toEqual({ page: 2, limit: 5, total: 11, totalPages: 3 });
  });

  test('membatasi limit maksimal 100', async () => {
    const result = await catalogService.listCustomers({ limit: '500' });

    expect(result.pagination.limit).toBe(100);
    expect(customerModel.findMany.mock.calls[0][0].limit).toBe(100);
  });
});

describe('catalogService.listProducts', () => {
  test('mengembalikan harga retail/grosir dan stok sebagai tipe yang aman', async () => {
    const result = await catalogService.listProducts({});

    expect(result.products).toEqual([{
      id: 1,
      code: 'BRS-05',
      name: 'Beras Premium 5 kg',
      unit: 'karung',
      price_retail: '75000.00',
      price_wholesale: '72000.00',
      stock: 30,
      min_stock: 50
    }]);
    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });
});

describe('catalogService.getCustomerCredit', () => {
  test('menghitung sisa limit dari piutang tanpa field risiko', async () => {
    const result = await catalogService.getCustomerCredit('1');

    expect(result.credit_limit).toBe('2500000.00');
    expect(result.outstanding).toBe('2000000.00');
    expect(result.remaining_limit).toBe('500000.00');
    expect(result.price_level).toBe('GROSIR');
    expect(result).not.toHaveProperty('risk_score');
    expect(result).not.toHaveProperty('risk_label');
  });

  test('limit 0 menghasilkan sisa 0 tanpa pembagian', async () => {
    customerModel.findActiveById.mockResolvedValue(Object.assign({}, customerRow, {
      credit_limit: '0.00'
    }));
    customerModel.sumOutstanding.mockResolvedValue('0.00');

    const result = await catalogService.getCustomerCredit('4');

    expect(result.remaining_limit).toBe('0.00');
    expect(result.outstanding).toBe('0.00');
  });

  test('piutang melebihi limit dibatasi menjadi 0', async () => {
    customerModel.sumOutstanding.mockResolvedValue('3000000.00');

    const result = await catalogService.getCustomerCredit('1');

    expect(result.remaining_limit).toBe('0.00');
  });

  test('menolak ID invalid dan pelanggan tidak ditemukan', async () => {
    await expect(catalogService.getCustomerCredit('abc')).rejects.toMatchObject({
      statusCode: 400,
      message: 'ID pelanggan tidak valid'
    });

    customerModel.findActiveById.mockResolvedValue(null);
    await expect(catalogService.getCustomerCredit('99')).rejects.toMatchObject({
      statusCode: 404,
      message: 'Pelanggan tidak ditemukan'
    });
  });
});

describe('catalogService.getProductPrice', () => {
  test('memakai harga grosir dan menghitung diskon presisi', async () => {
    const result = await catalogService.getProductPrice('BRS-05', {
      level: 'GROSIR',
      qty: '3',
      discount: '0.01'
    });

    expect(result.price_level).toBe('GROSIR');
    expect(result.unit_price).toBe('72000.00');
    expect(result.subtotal).toBe('216000.00');
    expect(result.discount).toBe('0.01');
    expect(result.line_total).toBe('215999.99');
  });

  test('default retail, qty 1, dan diskon 0', async () => {
    const result = await catalogService.getProductPrice('BRS-05', {});

    expect(result.price_level).toBe('RETAIL');
    expect(result.unit_price).toBe('75000.00');
    expect(result.qty).toBe(1);
    expect(result.line_total).toBe('75000.00');
  });

  test('menolak level, kuantitas, diskon negatif, dan produk tidak ditemukan', async () => {
    await expect(catalogService.getProductPrice('BRS-05', { level: 'INVALID' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Level harga tidak valid'
    });
    await expect(catalogService.getProductPrice('BRS-05', { qty: '0' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Kuantitas harus bilangan bulat positif'
    });
    await expect(catalogService.getProductPrice('BRS-05', { discount: '-1' })).rejects.toMatchObject({
      statusCode: 400,
      message: 'Nominal diskon tidak valid'
    });

    productModel.findActiveByCode.mockResolvedValue(null);
    await expect(catalogService.getProductPrice('XX-01', {})).rejects.toMatchObject({
      statusCode: 404,
      message: 'Produk tidak ditemukan'
    });
  });
});
