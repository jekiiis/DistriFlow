'use strict';

describe('frontend api helper', () => {
  let api;
  let onUnauthorized;

  beforeEach(() => {
    jest.resetModules();
    onUnauthorized = jest.fn();
    global.window = {
      location: { pathname: '/pages/order-detail.html' },
      DistriFlowUI: { onUnauthorized },
      open: jest.fn(() => ({ opener: null }))
    };
    global.fetch = jest.fn();
    api = require('../../frontend/js/api');
  });

  afterEach(() => {
    delete global.fetch;
    delete global.window;
  });

  test('openInvoice membuka URL PDF kanonik di tab baru tanpa fetch blob', () => {
    const url = api.openInvoice(12, '80mm');

    expect(url).toBe('/api/orders/12/invoice.pdf?format=80mm');
    expect(global.window.open).toHaveBeenCalledWith(
      '/api/orders/12/invoice.pdf?format=80mm',
      '_blank'
    );
    // fetch/XHR PDF dicegat PDF viewer Chrome dan menghasilkan 204 kosong.
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('openInvoice melaporkan popup yang diblokir', () => {
    global.window.open.mockReturnValue(null);

    expect(() => api.openInvoice(9)).toThrow(/Popup diblokir/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('getBlob mengembalikan Blob biner tanpa parse JSON', async () => {
    const blob = new Blob(['%PDF-1.3'], { type: 'application/pdf' });
    const response = {
      ok: true,
      status: 200,
      blob: jest.fn().mockResolvedValue(blob),
      json: jest.fn()
    };
    global.fetch.mockResolvedValue(response);

    const result = await api.getBlob('/reports/bin');

    expect(result).toBe(blob);
    expect(response.json).not.toHaveBeenCalled();
  });

  test('401 di halaman selain login memanggil onUnauthorized', async () => {
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({
        success: false,
        message: 'Sesi berakhir, silakan login kembali'
      })
    });

    await expect(api.get('/orders')).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  test('401 di halaman login tidak memicu redirect', async () => {
    global.window.location.pathname = '/pages/login.html';
    global.fetch.mockResolvedValue({
      ok: false,
      status: 401,
      json: jest.fn().mockResolvedValue({
        success: false,
        message: 'Username atau password salah'
      })
    });

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      message: 'Username atau password salah'
    });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });
});
