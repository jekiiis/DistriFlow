'use strict';

const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Semua akses database wajib melalui helper ini: parameterized query via pool.execute().
function execute(sql, params = []) {
  return pool.execute(sql, params);
}

/**
 * Mengembalikan fungsi query yang memakai koneksi transaksi bila diberikan,
 * atau pool biasa bila tidak ada. Model pada sprint berikutnya menerima
 * koneksi transaksi lewat helper ini, sehingga tidak membuka pool terpisah.
 */
function getExecutor(connection) {
  if (!connection) {
    return execute;
  }

  return function executeWithConnection(sql, params = []) {
    return connection.execute(sql, params);
  };
}

/**
 * Menjalankan callback di dalam satu transaksi InnoDB.
 * Commit bila berhasil, rollback bila gagal, dan koneksi selalu dilepas.
 */
async function withTransaction(callback) {
  const connection = await pool.getConnection();
  let committed = false;

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    committed = true;
    return result;
  } catch (error) {
    if (!committed) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error('[DB] Rollback gagal:', rollbackError.message);
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

async function testConnection() {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
    return true;
  } finally {
    connection.release();
  }
}

module.exports = { pool, execute, getExecutor, withTransaction, testConnection };
