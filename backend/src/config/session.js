'use strict';

const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const env = require('./env');

const MySQLStore = MySQLStoreFactory(session);

// Test memakai store bawaan express-session agar tidak memerlukan MySQL.
// Produksi dan pengembangan tetap memakai express-mysql-session seperti Sprint 0.
function createStore() {
  if (env.isTest) {
    return new session.MemoryStore();
  }

  return new MySQLStore({
    host: env.db.host,
    port: env.db.port,
    user: env.db.user,
    password: env.db.password,
    database: env.db.database,
    clearExpired: true,
    checkExpirationInterval: 15 * 60 * 1000,
    expiration: env.session.rollingMs,
    createDatabaseTable: true,
    schema: {
      tableName: env.session.tableName
    }
  });
}

const store = createStore();

const sessionMiddleware = session({
  name: 'distriflow.sid',
  secret: env.session.secret,
  store,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: env.isProduction,
    maxAge: env.session.rollingMs,
    path: '/'
  }
});

module.exports = { sessionMiddleware, store };
