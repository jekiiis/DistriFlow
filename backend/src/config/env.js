'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const REQUIRED_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_NAME', 'SESSION_SECRET'];

function validate() {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = process.env[key];
    return value === undefined || String(value).trim() === '';
  });

  if (missing.length > 0) {
    throw new Error('Variabel lingkungan wajib belum diisi: ' + missing.join(', '));
  }
}

validate();

const nodeEnv = process.env.NODE_ENV || 'development';

module.exports = {
  nodeEnv,
  port: Number(process.env.PORT) || 3000,
  db: {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME
  },
  session: {
    secret: process.env.SESSION_SECRET,
    tableName: process.env.SESSION_TABLE_NAME || 'session',
    rollingMs: 30 * 60 * 1000
  },
  restockDays: Number(process.env.RESTOCK_DAYS) || 14,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test'
};
