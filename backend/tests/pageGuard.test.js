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
  test('berisi sembilan halaman dengan aturan Sprint 1 dan Sprint 2', () => {
    expect(PAGE_ACCESS).toEqual({
      '/pages/login.html': 'PUBLIC',
      '/pages/dashboard.html': 'AUTHENTICATED',
      '/pages/change-password.html': 'AUTHENTICATED',
      '/pages/users.html': 'ADMIN',
      '/pages/user-form.html': 'ADMIN',
      '/pages/sales-order.html': ['SALES', 'ADMIN'],
      '/pages/orders.html': ['ADMIN', 'SALES', 'KASIR'],
      '/pages/order-detail.html': ['ADMIN', 'SALES', 'KASIR'],
      '/pages/payment.html': 'KASIR'
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
