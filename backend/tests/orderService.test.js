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

const { withTransaction } = require('../src/config/db');
const orderModel = require('../src/models/orderModel');
const orderService = require('../src/services/orderService');

const PRODUCT = {
  id: 5,
  code: 'BRS-05',
  name: 'Produk Uji',
  price_retail: '75000.00',
  price_wholesale: '72000.00',
  stock: 30
};

function detail(id = 42) {
  return {
    id,
    order_no: 'SO-20261126-1000',
    subtotal: '0.00',
    discount: '0.00',
    total: '0.00',
    items: [],
    payments: []
  };
}

function productOverrides(overrides = {}) {
  return Object.assign({}, PRODUCT, overrides);
}

beforeEach(() => {
  withTransaction.mockReset();
  withTransaction.mockImplementation((callback) => callback({ execute: jest.fn() }));

  Object.values(orderModel).forEach((fn) => {
    if (typeof fn.mockReset === 'function') {
      fn.mockReset();
    }
  });

  orderModel.getOrderDate.mockResolvedValue('20261126');
  orderModel.findActiveCustomerById.mockResolvedValue({
    id: 7,
    code: 'PLG-007',
    price_level: 'RETAIL'
  });
  orderModel.findActiveProductByCode.mockResolvedValue(productOverrides());
  orderModel.lockOrderNumberMutex.mockResolvedValue(1);
  orderModel.findLastOrderNo.mockResolvedValue('SO-20261126-999');
  orderModel.insertHeader.mockResolvedValue(42);
  orderModel.insertItems.mockResolvedValue(1);
  orderModel.findDetailById.mockResolvedValue(detail());
});

describe('orderService.createOrder — validasi', () => {
  test('menolak items kosong dengan pesan persis', async () => {
    await expect(orderService.createOrder({ customer_id: 7, items: [] }, 2))
      .rejects.toMatchObject({
        message: 'Minimal satu barang harus ditambahkan',
        statusCode: 400
      });
    expect(withTransaction).not.toHaveBeenCalled();
  });

  test('menolak customer_id invalid dan user sesi invalid', async () => {
    await expect(orderService.createOrder({ customer_id: 0, items: [{}] }, 2))
      .rejects.toMatchObject({ message: 'ID pelanggan tidak valid', statusCode: 400 });
    await expect(orderService.createOrder({ customer_id: 7, items: [{}] }, null))
      .rejects.toMatchObject({
        message: 'Sesi berakhir, silakan login kembali',
        statusCode: 401
      });
  });

  test('pelanggan tidak ditemukan menggagalkan transaksi sebelum insert', async () => {
    orderModel.findActiveCustomerById.mockResolvedValue(null);
    await expect(orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2)).rejects.toMatchObject({
      message: 'Pelanggan tidak ditemukan',
      statusCode: 404
    });
    expect(orderModel.insertHeader).not.toHaveBeenCalled();
  });

  test('produk tidak ada/nonaktif memakai pesan Barang tidak ditemukan', async () => {
    orderModel.findActiveProductByCode.mockResolvedValue(null);
    await expect(orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'XX', qty: 1 }]
    }, 2)).rejects.toMatchObject({
      message: 'Barang tidak ditemukan',
      statusCode: 404
    });
  });

  test('qty bukan integer positif ditolak', async () => {
    await expect(orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 0 }]
    }, 2)).rejects.toMatchObject({ message: 'Jumlah tidak valid', statusCode: 400 });
    await expect(orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1.5 }]
    }, 2)).rejects.toMatchObject({ message: 'Jumlah tidak valid', statusCode: 400 });
  });
});

describe('orderService.createOrder — uang dan stok', () => {
  test('harga retail berasal dari database, bukan client', async () => {
    await orderService.createOrder({
      customer_id: 7,
      items: [{
        code: 'BRS-05',
        qty: 2,
        discount: '5000.00',
        unit_price: '1.00',
        price_level: 'GROSIR'
      }]
    }, 2);

    const header = orderModel.insertHeader.mock.calls[0][0];
    expect(header.subtotal).toBe('150000.00');
    expect(header.discount).toBe('5000.00');
    expect(header.total).toBe('145000.00');
    expect(header.status).toBeUndefined();
    expect(orderModel.insertItems.mock.calls[0][1][0]).toMatchObject({
      qty: 2,
      unitPrice: '75000.00',
      discount: '5000.00',
      lineTotal: '145000.00'
    });
  });

  test('level GROSIR memakai harga grosir', async () => {
    orderModel.findActiveCustomerById.mockResolvedValue({ id: 1, price_level: 'GROSIR' });
    await orderService.createOrder({
      customer_id: 1,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2);
    expect(orderModel.insertItems.mock.calls[0][1][0].unitPrice).toBe('72000.00');
  });

  test('kode sama digabung sebelum stok dan diskon dicek', async () => {
    orderModel.findActiveProductByCode.mockResolvedValue(productOverrides({ stock: 5 }));
    await orderService.createOrder({
      customer_id: 7,
      items: [
        { code: 'BRS-05', qty: 2, discount: '1000.00' },
        { code: 'BRS-05', qty: 3, discount: '2000.00' }
      ]
    }, 2);

    expect(orderModel.findActiveProductByCode).toHaveBeenCalledTimes(1);
    expect(orderModel.insertItems).toHaveBeenCalledTimes(1);
    expect(orderModel.insertItems.mock.calls[0][1]).toHaveLength(1);
    expect(orderModel.insertItems.mock.calls[0][1][0]).toMatchObject({
      qty: 5,
      discount: '3000.00',
      lineTotal: '372000.00'
    });
  });

  test('stok gabungan kurang menghasilkan 409 dengan stok tersedia', async () => {
    orderModel.findActiveProductByCode.mockResolvedValue(productOverrides({ stock: 4 }));
    await expect(orderService.createOrder({
      customer_id: 7,
      items: [
        { code: 'BRS-05', qty: 3 },
        { code: 'BRS-05', qty: 2 }
      ]
    }, 2)).rejects.toMatchObject({
      message: 'Stok tidak cukup, tersedia 4',
      statusCode: 409
    });
  });

  test('diskon melebihi bruto gabungan ditolak', async () => {
    await expect(orderService.createOrder({
      customer_id: 7,
      items: [
        { code: 'BRS-05', qty: 1, discount: '150000.00' },
        { code: 'BRS-05', qty: 1, discount: '0.01' }
      ]
    }, 2)).rejects.toMatchObject({ message: 'Diskon tidak valid', statusCode: 400 });
  });

  test('perhitungan presisi sen tidak memakai pembulatan biner', async () => {
    orderModel.findActiveProductByCode.mockResolvedValue(productOverrides({
      price_retail: '75000.01'
    }));
    await orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 3, discount: '0.02' }]
    }, 2);

    const header = orderModel.insertHeader.mock.calls[0][0];
    expect(header.subtotal).toBe('225000.03');
    expect(header.discount).toBe('0.02');
    expect(header.total).toBe('225000.01');
  });
});

describe('orderService.createOrder — transaksi dan nomor order', () => {
  test('lock mutex dipanggil sebelum membaca nomor terakhir', async () => {
    const calls = [];
    orderModel.lockOrderNumberMutex.mockImplementation(async () => {
      calls.push('lock');
    });
    orderModel.findLastOrderNo.mockImplementation(async () => {
      calls.push('read');
      return 'SO-20261126-001';
    });

    await orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2);

    expect(calls).toEqual(['lock', 'read']);
  });

  test('nomor 999 berkembang ke 1000', async () => {
    await orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2);
    expect(orderModel.insertHeader.mock.calls[0][0].orderNo).toBe('SO-20261126-1000');
  });

  test('ER_DUP_ENTRY di-retry maksimal tiga kali lalu error generik', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    orderModel.insertHeader.mockRejectedValue(duplicate);

    await expect(orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2)).rejects.toMatchObject({
      message: 'Gagal membuat nomor sales order, silakan coba lagi',
      statusCode: 500
    });

    expect(withTransaction).toHaveBeenCalledTimes(3);
    expect(orderModel.insertHeader).toHaveBeenCalledTimes(3);
  });

  test('retry berhasil setelah satu duplicate', async () => {
    const duplicate = Object.assign(new Error('duplicate'), { code: 'ER_DUP_ENTRY' });
    orderModel.insertHeader
      .mockRejectedValueOnce(duplicate)
      .mockResolvedValueOnce(42);

    const result = await orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2);

    expect(result).toEqual(detail());
    expect(withTransaction).toHaveBeenCalledTimes(2);
  });

  test('kegagalan insert detail diteruskan sehingga transaksi di-rollback', async () => {
    const failure = new Error('insert detail gagal');
    orderModel.insertItems.mockRejectedValue(failure);

    await expect(orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2)).rejects.toBe(failure);

    expect(orderModel.insertHeader).toHaveBeenCalledTimes(1);
    expect(orderModel.findDetailById).not.toHaveBeenCalled();
  });

  test('DRAFT tidak memanggil query stok/payment/movement', async () => {
    await orderService.createOrder({
      customer_id: 7,
      items: [{ code: 'BRS-05', qty: 1 }]
    }, 2);

    // SQL pembatalan berada di orderModel, bukan di orderService. Assertion
    // harus membuktikan perilaku createOrder, bukan menyusuri teks sumber.
    expect(orderModel.lockProductById).not.toHaveBeenCalled();
    expect(orderModel.returnStock).not.toHaveBeenCalled();
    expect(orderModel.insertCancelMovement).not.toHaveBeenCalled();
    expect(orderModel.insertHeader).toHaveBeenCalledTimes(1);
    expect(orderModel.insertItems).toHaveBeenCalledTimes(1);
  });
});

describe('orderService list/detail', () => {
  test('Sales hanya memfilter order miliknya', async () => {
    orderModel.findMany.mockResolvedValue([]);
    orderModel.countAll.mockResolvedValue(0);

    await orderService.listOrders({ page: '2', limit: '25' }, { id: 9, role: 'SALES' });

    expect(orderModel.findMany.mock.calls[0][0]).toMatchObject({
      userId: 9,
      limit: 25,
      offset: 25
    });
  });

  test('limit dibatasi maksimal 100', async () => {
    orderModel.findMany.mockResolvedValue([]);
    orderModel.countAll.mockResolvedValue(0);
    await orderService.listOrders({ limit: '500' }, { role: 'ADMIN' });
    expect(orderModel.findMany.mock.calls[0][0].limit).toBe(100);
  });

  test('order orang lain tidak terlihat oleh Sales', async () => {
    orderModel.findDetailById.mockResolvedValue(Object.assign(detail(), { user_id: 99 }));
    await expect(orderService.getOrder(42, { id: 9, role: 'SALES' }))
      .rejects.toMatchObject({ message: 'Order tidak ditemukan', statusCode: 404 });
  });

  test('detail tidak mengembalikan password atau hash', async () => {
    orderModel.findDetailById.mockResolvedValue(Object.assign(detail(), {
      user_id: 2,
      password: 'rahasia',
      password_hash: 'hash',
      items: [],
      payments: []
    }));
    const result = await orderService.getOrder(42, { id: 2, role: 'ADMIN' });
    expect(result).not.toHaveProperty('password');
    expect(result).not.toHaveProperty('password_hash');
  });
});
