'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');

const { sessionMiddleware } = require('./config/session');
const routes = require('./routes');
const { createPageGuard } = require('./middleware/pageGuard');
const AppError = require('./helpers/AppError');
const { fail, HTTP_STATUS } = require('./helpers/response');

const app = express();

// Bundel frontend aktif. Guard dan static wajib memakai root yang sama agar
// HTML terlindungi dan asetnya berasal dari direktori yang identik.
const frontendDir = path.resolve(__dirname, '../../frontend(new)');

app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'connect-src': ["'self'"],
      'font-src': ["'self'"],
      'object-src': ["'none'"],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"]
    }
  }
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(sessionMiddleware);

// Guard halaman berjalan sebelum static agar HTML terlindungi tidak bisa
// diambil langsung lewat express.static.
app.use(createPageGuard({ pagesDir: path.resolve(frontendDir, 'pages') }));

app.use('/api', routes);

// Aset publik (css/js/gambar) tetap dapat dimuat setelah halaman diizinkan.
app.use(express.static(frontendDir, {
  index: false,
  redirect: false,
  dotfiles: 'ignore'
}));

app.use((req, res) => {
  return fail(res, 'Halaman tidak ditemukan', null, HTTP_STATUS.NOT_FOUND);
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const isAppError = err instanceof AppError;
  const statusCode = isAppError ? err.statusCode : HTTP_STATUS.INTERNAL_SERVER_ERROR;

  if (!isAppError || statusCode >= HTTP_STATUS.INTERNAL_SERVER_ERROR) {
    console.error('[ERROR]', err && err.stack ? err.stack : err);
  }

  if (isAppError) {
    return fail(res, err.message, err.errors, statusCode);
  }

  return fail(res, 'Terjadi kesalahan pada server', null, HTTP_STATUS.INTERNAL_SERVER_ERROR);
});

module.exports = app;
