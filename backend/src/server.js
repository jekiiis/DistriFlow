'use strict';

const app = require('./app');
const env = require('./config/env');
const { testConnection } = require('./config/db');

async function start() {
  try {
    await testConnection();
    console.log('[DB] Koneksi MySQL berhasil');
  } catch (error) {
    console.error('[DB] Koneksi MySQL gagal:', error.message);
    console.error('[DB] Periksa DB_* di backend/.env dan hak akses pengguna MySQL.');
  }

  app.listen(env.port, () => {
    console.log('[APP] DistriFlow berjalan di http://localhost:' + env.port);
  });
}

start();
