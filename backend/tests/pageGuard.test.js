'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

const {
  createPageGuard,
  PAGE_ACCESS,
  LOGIN_PAGE,
  DASHBOARD_PAGE
} = require('../src/middleware/pageGuard');

function runGuard(overrides = {}, user = null) {
  const req = Object.assign({
    method: 'GET',
    path: '/',
    session: user ? { user } : {}
  }, overrides);

  const res = {
    redirect: jest.fn(),
    sendFile: jest.fn(),
    status: jest.fn(),
    end: jest.fn()
  };
  res.status.mockReturnValue(res);

  const next = jest.fn();
  createPageGuard({ pagesDir: '/fake/pages' })(req, res, next);
  return { req, res, next };
}

describe('allowlist halaman', () => {
  test('berisi 16 halaman UI-01..UI-18 dengan aturan Sprint 1, 2, dan 3', () => {
    const normalize = (rule) => (Array.isArray(rule) ? rule.slice().sort() : rule);
    const expected = {
      '/pages/login.html': 'PUBLIC',
      '/pages/dashboard.html': 'AUTHENTICATED',
      '/pages/change-password.html': 'AUTHENTICATED',
      '/pages/users.html': 'ADMIN',
      '/pages/user-form.html': 'ADMIN',
      '/pages/sales-order.html': ['ADMIN', 'SALES'],
      '/pages/orders.html': ['ADMIN', 'SALES', 'KASIR'],
      '/pages/order-detail.html': ['ADMIN', 'SALES', 'KASIR'],
      '/pages/payment.html': 'KASIR',
      '/pages/products.html': ['ADMIN', 'GUDANG'],
      '/pages/product-form.html': 'ADMIN',
      '/pages/stock-in.html': ['ADMIN', 'GUDANG'],
      '/pages/customers.html': ['ADMIN', 'SALES', 'KASIR'],
      '/pages/customer-form.html': 'ADMIN',
      '/pages/receivables.html': 'KASIR',
      '/pages/reports.html': 'ADMIN'
    };
    expect(Object.keys(PAGE_ACCESS).sort()).toEqual(Object.keys(expected).sort());
    Object.keys(expected).forEach((pagePath) => {
      expect(normalize(PAGE_ACCESS[pagePath])).toEqual(normalize(expected[pagePath]));
    });
  });
});

describe('root', () => {
  test('tanpa sesi diarahkan ke halaman login', () => {
    const { res } = runGuard();
    expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
  });

  test('dengan sesi diarahkan ke dashboard', () => {
    const { res } = runGuard({}, { id: 1, role: 'SALES' });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
  });

  test('tidak memakai URL dari query sebagai tujuan redirect', () => {
    const { res } = runGuard({ path: '/', query: { next: 'https://jahat.example' } });
    expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
  });
});

describe('halaman login', () => {
  test('publik dapat diakses tanpa sesi', () => {
    const { res, next } = runGuard({ path: '/pages/login.html' });
    expect(res.sendFile).toHaveBeenCalledWith(
      'login.html',
      { root: '/fake/pages' },
      expect.any(Function)
    );
    expect(res.redirect).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('pengguna yang sudah login diarahkan ke dashboard', () => {
    const { res } = runGuard({ path: '/pages/login.html' }, { id: 1, role: 'ADMIN' });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
    expect(res.sendFile).not.toHaveBeenCalled();
  });
});

describe('halaman terlindungi', () => {
  test.each(['/pages/dashboard.html', '/pages/change-password.html'])(
    '%s tanpa sesi diarahkan ke login',
    (pagePath) => {
      const { res } = runGuard({ path: pagePath });
      expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
    }
  );

  test.each(['/pages/dashboard.html', '/pages/change-password.html'])(
    '%s dapat diakses oleh peran apa pun yang sudah login',
    (pagePath) => {
      const user = { id: 2, role: 'GUDANG' };
      const { res } = runGuard({ path: pagePath }, user);
      expect(res.sendFile).toHaveBeenCalledWith(
        pagePath.replace('/pages/', ''),
        { root: '/fake/pages' },
        expect.any(Function)
      );
    }
  );

  test('/pages/users.html tanpa sesi diarahkan ke login', () => {
    const { res } = runGuard({ path: '/pages/users.html' });
    expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
  });

  test('/pages/users.html untuk non-ADMIN diarahkan ke dashboard', () => {
    const { res } = runGuard({ path: '/pages/users.html' }, { id: 3, role: 'SALES' });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  test('/pages/users.html untuk ADMIN disajikan', () => {
    const { res } = runGuard({ path: '/pages/users.html' }, { id: 4, role: 'ADMIN' });
    expect(res.sendFile).toHaveBeenCalledWith(
      'users.html',
      { root: '/fake/pages' },
      expect.any(Function)
    );
  });

  test('/pages/user-form.html untuk GUDANG diarahkan ke dashboard', () => {
    const { res } = runGuard({ path: '/pages/user-form.html' }, { id: 5, role: 'GUDANG' });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
  });

  test('/pages/user-form.html untuk ADMIN disajikan', () => {
    const { res } = runGuard({ path: '/pages/user-form.html' }, { id: 6, role: 'ADMIN' });
    expect(res.sendFile).toHaveBeenCalledWith(
      'user-form.html',
      { root: '/fake/pages' },
      expect.any(Function)
    );
  });
});

describe('halaman Sprint 2', () => {
  test.each([
    ['/pages/sales-order.html', 'SALES'],
    ['/pages/sales-order.html', 'ADMIN'],
    ['/pages/orders.html', 'ADMIN'],
    ['/pages/orders.html', 'SALES'],
    ['/pages/orders.html', 'KASIR'],
    ['/pages/order-detail.html', 'ADMIN'],
    ['/pages/order-detail.html', 'SALES'],
    ['/pages/order-detail.html', 'KASIR'],
    ['/pages/payment.html', 'KASIR']
  ])('%s dapat disajikan untuk %s', (pagePath, role) => {
    const { res } = runGuard({ path: pagePath }, { id: 10, role });
    expect(res.sendFile).toHaveBeenCalledWith(
      pagePath.replace('/pages/', ''),
      { root: '/fake/pages' },
      expect.any(Function)
    );
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test.each([
    ['/pages/sales-order.html', 'KASIR'],
    ['/pages/sales-order.html', 'GUDANG'],
    ['/pages/orders.html', 'GUDANG'],
    ['/pages/order-detail.html', 'GUDANG'],
    ['/pages/payment.html', 'ADMIN'],
    ['/pages/payment.html', 'SALES']
  ])('%s untuk %s diarahkan ke dashboard', (pagePath, role) => {
    const { res } = runGuard({ path: pagePath }, { id: 11, role });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  test.each([
    '/pages/sales-order.html',
    '/pages/orders.html',
    '/pages/order-detail.html',
    '/pages/payment.html'
  ])('%s tanpa sesi diarahkan ke login', (pagePath) => {
    const { res } = runGuard({ path: pagePath });
    expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
  });
});

describe('path alternatif dan allowlist', () => {
  test('path dengan dot segment tetap dikenali sebagai halaman terlindungi', () => {
    const { res } = runGuard({
      path: '/pages/..%2Fpages%2Fusers.html'
    }, { id: 7, role: 'SALES' });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  test('double slash tetap dinormalisasi ke halaman yang sama', () => {
    const { res } = runGuard({ path: '//pages//dashboard.html' });
    expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
  });

  test('halaman HTML di luar allowlist ditolak 404', () => {
    const { res, next } = runGuard({ path: '/pages/rahasia.html' }, { id: 8, role: 'ADMIN' });
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(res.sendFile).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  test('path non-HTML diteruskan ke middleware berikutnya', () => {
    const { res, next } = runGuard({ path: '/css/style.css' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.redirect).not.toHaveBeenCalled();
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  test('method selain GET/HEAD tidak diintersep guard', () => {
    const { res, next } = runGuard({ method: 'POST', path: '/pages/users.html' }, { id: 9, role: 'ADMIN' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  test('encoding URI rusak diteruskan tanpa melempar error', () => {
    const { res, next } = runGuard({ path: '/pages/%ZZ.html' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.sendFile).not.toHaveBeenCalled();
  });
});

describe('halaman Sprint 3', () => {
  test.each([
    ['/pages/products.html', 'ADMIN'],
    ['/pages/products.html', 'GUDANG'],
    ['/pages/product-form.html', 'ADMIN'],
    ['/pages/stock-in.html', 'ADMIN'],
    ['/pages/stock-in.html', 'GUDANG'],
    ['/pages/customers.html', 'ADMIN'],
    ['/pages/customers.html', 'SALES'],
    ['/pages/customers.html', 'KASIR'],
    ['/pages/customer-form.html', 'ADMIN'],
    ['/pages/receivables.html', 'KASIR'],
    ['/pages/reports.html', 'ADMIN']
  ])('%s dapat disajikan untuk %s', (pagePath, role) => {
    const { res } = runGuard({ path: pagePath }, { id: 20, role });
    expect(res.sendFile).toHaveBeenCalledWith(
      pagePath.replace('/pages/', ''),
      { root: '/fake/pages' },
      expect.any(Function)
    );
    expect(res.redirect).not.toHaveBeenCalled();
  });

  test.each([
    ['/pages/products.html', 'SALES'],
    ['/pages/products.html', 'KASIR'],
    ['/pages/product-form.html', 'GUDANG'],
    ['/pages/stock-in.html', 'SALES'],
    ['/pages/customers.html', 'GUDANG'],
    ['/pages/customer-form.html', 'SALES'],
    ['/pages/receivables.html', 'ADMIN'],
    ['/pages/reports.html', 'KASIR'],
    ['/pages/reports.html', 'GUDANG']
  ])('%s untuk %s diarahkan ke dashboard', (pagePath, role) => {
    const { res } = runGuard({ path: pagePath }, { id: 21, role });
    expect(res.redirect).toHaveBeenCalledWith(302, DASHBOARD_PAGE);
    expect(res.sendFile).not.toHaveBeenCalled();
  });

  test.each([
    '/pages/products.html',
    '/pages/product-form.html',
    '/pages/stock-in.html',
    '/pages/customers.html',
    '/pages/customer-form.html',
    '/pages/receivables.html',
    '/pages/reports.html'
  ])('%s tanpa sesi diarahkan ke login', (pagePath) => {
    const { res } = runGuard({ path: pagePath });
    expect(res.redirect).toHaveBeenCalledWith(302, LOGIN_PAGE);
  });
});
