'use strict';

/**
 * Helper pengujian: membuat dan membersihkan database MySQL isolasi.
 * Tidak pernah menyentuh database utama `distriflow` dan tidak mencetak
 * kredensial. Dipakai oleh test integrasi idempotency pembayaran.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const ROOT = path.resolve(__dirname, '../../..');

function databaseName(prefix = 'test_payment_idem_') {
  const suffix = Date.now() + '_' + process.pid + '_' + crypto.randomBytes(3).toString('hex');
  const name = prefix + suffix;
  if (!/^[A-Za-z0-9_]+$/.test(name)) {
    throw new Error('Nama database isolasi tidak aman');
  }
  return name;
}

function dbConfig(database = undefined) {
  const config = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || ''
  };
  if (database) {
    config.database = database;
  }
  return config;
}

function sqlStatements(filename, dbName) {
  const file = path.join(ROOT, 'database', filename);
  let sql = fs.readFileSync(file, 'utf8');

  // Jangan pernah menjalankan CREATE DATABASE distriflow dari test.
  sql = sql.replace(/CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+distriflow[^;]*;/gi, '');
  sql = sql.replace(/USE\s+distriflow\s*;/gi, 'USE `' + dbName + '`;');

  return sql
    .replace(/--[^\r\n]*/g, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function createDatabase(dbName, files = ['01_schema.sql', '02_seed.sql'], transform = null) {
  const root = await mysql.createConnection(dbConfig());
  try {
    await root.query(
      'CREATE DATABASE `' + dbName + '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
    );
  } finally {
    await root.end();
  }

  const connection = await mysql.createConnection(dbConfig(dbName));
  try {
    for (const file of files) {
      let statements = sqlStatements(file, dbName);
      if (transform) {
        statements = transform(file, statements);
      }
      for (const statement of statements) {
        await connection.query(statement);
      }
    }
  } finally {
    await connection.end();
  }
}

async function connect(dbName) {
  return mysql.createConnection(dbConfig(dbName));
}

async function dropDatabase(dbName) {
  const root = await mysql.createConnection(dbConfig());
  try {
    await root.query('DROP DATABASE IF EXISTS `' + dbName + '`');
  } finally {
    await root.end();
  }
}

module.exports = {
  ROOT,
  databaseName,
  dbConfig,
  sqlStatements,
  createDatabase,
  connect,
  dropDatabase
};
