'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

const path = require('path');
const express = require('express');
const session = require('express-session');
const request = require('supertest');
const { createPageGuard } = require('../src/middleware/pageGuard');
const apiRoutes = require('../src/routes');

// Sprint 3: backend melayani frontend(new); frontend/ tetap ada sebagai backup.
const frontendDir = path.resolve(__dirname, '../../frontend(new)');

function makeApp() {
  const app = express();

  app.use(express.json());
  app.use(session({ secret: 'test-only-route-secret', resave: false, saveUninitialized: false }));

  // Probe untuk mengisi sesi tanpa membuat halaman login sungguhan.
  app.get('/__role/:role', (req, res) => {
    req.session.user = { id: 1, username: 'probe', role: req.params.role };
    return res.sendStatus(200);
  });
  app.get('/__logout', (req, res) => {
    req.session.destroy(() => res.sendStatus(200));
  });

  // Halaman belum dibuat pada Task 1.4; sendFile disubstitusi fixture minimal.
  app.use((req, res, next) => {
    res.sendFile = (filename, options, callback) => {
      res.type('html').send('<!doctype html><title>' + path.basename(filename) + '</title>');
      if (callback) {
        callback();
      }
    };
    return next();
  });

  app.use(createPageGuard());
  app.use('/api', apiRoutes);
  app.use(express.static(frontendDir, {
    index: false,
    redirect: false,
    dotfiles: 'ignore'
  }));

  app.use((req, res) => {
    return res.status(404).json({ success: false, message: 'Halaman tidak ditemukan' });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (res.headersSent) {
      return next(err);
    }
    return res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server' });
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

describe('routing halaman', () => {
  test('1. GET / tanpa sesi redirect ke login', async () => {
    const response = await getAs(null, '/');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/login.html');
  });

  test('2. GET / dengan sesi redirect ke dashboard', async () => {
    const response = await getAs('SALES', '/');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/dashboard.html');
  });

  test('3. GET /pages/login.html tanpa sesi dapat diakses', async () => {
    const response = await getAs(null, '/pages/login.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>login.html</title>');
  });

  test('4. GET /pages/login.html dengan sesi redirect ke dashboard', async () => {
    const response = await getAs('ADMIN', '/pages/login.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/dashboard.html');
  });

  test('5. GET /pages/dashboard.html tanpa sesi redirect ke login', async () => {
    const response = await getAs(null, '/pages/dashboard.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/login.html');
  });

  test('6. GET /pages/dashboard.html dengan sesi dapat diakses', async () => {
    const response = await getAs('KASIR', '/pages/dashboard.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>dashboard.html</title>');
  });

  test('7. GET /pages/change-password.html tanpa sesi redirect ke login', async () => {
    const response = await getAs(null, '/pages/change-password.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/login.html');
  });

  test('8. GET /pages/change-password.html dengan sesi dapat diakses', async () => {
    const response = await getAs('SALES', '/pages/change-password.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>change-password.html</title>');
  });

  test('9. GET /pages/users.html tanpa sesi redirect ke login', async () => {
    const response = await getAs(null, '/pages/users.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/login.html');
  });

  test('10. GET /pages/users.html dengan ADMIN dapat diakses', async () => {
    const response = await getAs('ADMIN', '/pages/users.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>users.html</title>');
  });

  test('11. GET /pages/users.html dengan SALES redirect ke dashboard', async () => {
    const response = await getAs('SALES', '/pages/users.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/dashboard.html');
  });

  test('12. GET /pages/user-form.html dengan ADMIN dapat diakses', async () => {
    const response = await getAs('ADMIN', '/pages/user-form.html');
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>user-form.html</title>');
  });

  test('13. GET /pages/user-form.html dengan GUDANG redirect ke dashboard', async () => {
    const response = await getAs('GUDANG', '/pages/user-form.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/dashboard.html');
  });

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
  ])('halaman Sprint 2 %s untuk %s dapat diakses', async (pathname, role) => {
    const response = await getAs(role, pathname);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>' + path.basename(pathname) + '</title>');
  });

  test.each([
    ['/pages/sales-order.html', 'KASIR'],
    ['/pages/orders.html', 'GUDANG'],
    ['/pages/payment.html', 'SALES'],
    ['/pages/payment.html', null]
  ])('halaman Sprint 2 %s untuk %s ditolak', async (pathname, role) => {
    const response = await getAs(role, pathname);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      role ? '/pages/dashboard.html' : '/pages/login.html'
    );
  });

  test('14a. path alternatif tidak membypass guard (tanpa sesi)', async () => {
    const response = await getAs(null, '/pages/..%2Fpages%2Fusers.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/login.html');
  });

  test('14b. path alternatif tidak membypass guard (SALES)', async () => {
    const response = await getAs('SALES', '/pages/..%2Fpages%2Fusers.html');
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe('/pages/dashboard.html');
  });

  test('14c. halaman HTML di luar allowlist tidak disajikan', async () => {
    const response = await getAs('ADMIN', '/pages/rahasia.html');
    expect(response.status).toBe(404);
  });

  test('15a. aset CSS publik tetap termuat', async () => {
    const response = await getAs(null, '/css/style.css');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/css');
  });

  test('15b. aset JS publik tetap termuat', async () => {
    const response = await getAs(null, '/js/api.js');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
  });

  test('redirect tidak membentuk loop', async () => {
    const loginAsGuest = await getAs(null, '/pages/login.html');
    expect(loginAsGuest.status).toBe(200);

    const agent = request.agent(makeApp());
    await agent.get('/__role/SALES');
    const dashboard = await agent.get('/pages/dashboard.html');
    expect(dashboard.status).toBe(200);

    await agent.get('/__logout');
    const afterLogout = await agent.get('/pages/dashboard.html');
    expect(afterLogout.status).toBe(302);
    expect(afterLogout.headers.location).toBe('/pages/login.html');
  });
});

describe('routing halaman Sprint 3', () => {
  test.each([
    ['/pages/products.html', 'ADMIN'],
    ['/pages/products.html', 'GUDANG'],
    ['/pages/product-form.html', 'ADMIN'],
    ['/pages/stock-in.html', 'GUDANG'],
    ['/pages/customers.html', 'SALES'],
    ['/pages/customers.html', 'KASIR'],
    ['/pages/customer-form.html', 'ADMIN'],
    ['/pages/receivables.html', 'KASIR'],
    ['/pages/reports.html', 'ADMIN']
  ])('halaman %s untuk %s dapat diakses', async (pathname, role) => {
    const response = await getAs(role, pathname);
    expect(response.status).toBe(200);
    expect(response.text).toContain('<title>' + path.basename(pathname) + '</title>');
  });

  test.each([
    ['/pages/products.html', 'SALES'],
    ['/pages/product-form.html', 'GUDANG'],
    ['/pages/stock-in.html', 'KASIR'],
    ['/pages/customers.html', 'GUDANG'],
    ['/pages/customer-form.html', 'KASIR'],
    ['/pages/receivables.html', 'ADMIN'],
    ['/pages/reports.html', 'SALES'],
    ['/pages/reports.html', null]
  ])('halaman %s untuk %s ditolak', async (pathname, role) => {
    const response = await getAs(role, pathname);
    expect(response.status).toBe(302);
    expect(response.headers.location).toBe(
      role ? '/pages/dashboard.html' : '/pages/login.html'
    );
  });

  test('aset baru frontend(new) tetap termuat', async () => {
    const layout = await getAs(null, '/js/layout.js');
    expect(layout.status).toBe(200);
    expect(layout.headers['content-type']).toContain('javascript');

    const css = await getAs(null, '/css/style.css');
    expect(css.status).toBe(200);
    expect(css.headers['content-type']).toContain('text/css');
  });
});

describe('kontrak API tidak berubah', () => {
  test('POST /api/auth/login kosong tetap 400 dengan pesan SKPL', async () => {
    const response = await request(makeApp()).post('/api/auth/login').send({});
    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Username dan password wajib diisi');
  });

  test('GET /api/auth/me tanpa sesi tetap 401', async () => {
    const response = await request(makeApp()).get('/api/auth/me');
    expect(response.status).toBe(401);
  });

  test('GET /api/users tanpa sesi tetap 401', async () => {
    const response = await request(makeApp()).get('/api/users');
    expect(response.status).toBe(401);
  });

  test('GET /api/users dengan SALES tetap 403', async () => {
    const agent = request.agent(makeApp());
    await agent.get('/__role/SALES');
    const response = await agent.get('/api/users');
    expect(response.status).toBe(403);
  });
});
