'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('bcrypt', () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock('../src/models/userModel', () => ({
  findByUsername: jest.fn(),
  findById: jest.fn(),
  recordFailedAttempt: jest.fn(),
  resetLoginAttempts: jest.fn(),
  updatePassword: jest.fn(),
  findMany: jest.fn(),
  countAll: jest.fn(),
  findPublicById: jest.fn(),
  findIdByUsername: jest.fn(),
  insertUser: jest.fn(),
  findByIdForUpdate: jest.fn(),
  lockActiveAdmins: jest.fn(),
  updateUser: jest.fn(),
  deleteSessionsByUserId: jest.fn()
}));

jest.mock('../src/config/db', () => ({
  pool: { execute: jest.fn(), getConnection: jest.fn() },
  execute: jest.fn(),
  getExecutor: jest.fn(),
  withTransaction: jest.fn(),
  testConnection: jest.fn()
}));

const express = require('express');
const session = require('express-session');
const request = require('supertest');
const bcrypt = require('bcrypt');
const userModel = require('../src/models/userModel');
const { getExecutor, withTransaction } = require('../src/config/db');
const userService = require('../src/services/userService');
const userRoutes = require('../src/routes/userRoutes');

const MESSAGE = userService.MESSAGE;
const transaction = { commit: jest.fn(), rollback: jest.fn() };

function publicUser(overrides = {}) {
  return Object.assign({
    id: 1,
    name: 'Devrosan',
    username: 'devrosan',
    role: 'ADMIN',
    is_active: 1
  }, overrides);
}

function dbUser(overrides = {}) {
  return Object.assign({
    id: 1,
    name: 'Devrosan',
    username: 'devrosan',
    password: 'hash-lama',
    role: 'ADMIN',
    is_active: 1,
    failed_attempts: 0,
    locked_until: null
  }, overrides);
}

function makeTestApp() {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: 'test-only-secret', resave: false, saveUninitialized: false }));
  app.get('/__role/:role', (req, res) => {
    req.session.user = { id: 99, role: req.params.role };
    return res.sendStatus(200);
  });
  app.use('/api/users', userRoutes);
  return app;
}

beforeEach(() => {
  bcrypt.hash.mockResolvedValue('hash-baru');
  bcrypt.compare.mockResolvedValue(true);

  withTransaction.mockImplementation(async (callback) => {
    const connection = { execute: jest.fn() };
    try {
      const value = await callback(connection);
      transaction.commit();
      return value;
    } catch (error) {
      transaction.rollback();
      throw error;
    }
  });

  getExecutor.mockReset();

  userModel.findMany.mockResolvedValue([publicUser()]);
  userModel.countAll.mockResolvedValue(1);
  userModel.findPublicById.mockResolvedValue(publicUser());
  userModel.findIdByUsername.mockResolvedValue(null);
  userModel.insertUser.mockResolvedValue({ insertId: 5 });
  userModel.findByIdForUpdate.mockResolvedValue(dbUser());
  userModel.lockActiveAdmins.mockResolvedValue([{ id: 1 }, { id: 2 }]);
  userModel.updateUser.mockResolvedValue({ affectedRows: 1 });
  userModel.deleteSessionsByUserId.mockResolvedValue({ affectedRows: 0 });
  userModel.resetLoginAttempts.mockResolvedValue({ affectedRows: 1 });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('daftar dan detail pengguna', () => {
  test('Admin dapat mengambil daftar pengguna dengan filter dan pagination', async () => {
    userModel.countAll.mockResolvedValue(12);

    const result = await userService.list({
      search: 'dev',
      role: '',
      isActive: '',
      page: 2,
      limit: 5
    });

    expect(userModel.findMany).toHaveBeenCalledWith(expect.objectContaining({
      search: 'dev',
      limit: 5,
      offset: 5
    }));
    expect(result.users).toEqual([publicUser({ is_active: true })]);
    expect(result.users[0]).not.toHaveProperty('password');
    expect(result.pagination).toEqual({ page: 2, limit: 5, total: 12, totalPages: 3 });
  });

  test('Admin dapat mengambil detail pengguna', async () => {
    const result = await userService.getById(1);

    expect(result).toEqual(publicUser({ is_active: true }));
    expect(result).not.toHaveProperty('password');
    expect(userModel.findPublicById).toHaveBeenCalledWith(1);
  });

  test('ID pengguna tidak ditemukan menghasilkan 404', async () => {
    userModel.findPublicById.mockResolvedValue(null);

    await expect(userService.getById(999)).rejects.toMatchObject({
      message: MESSAGE.USER_NOT_FOUND,
      statusCode: 404
    });
  });
});

describe('tambah pengguna', () => {
  const validInput = {
    name: 'Raihan Haryo',
    username: 'raihan2',
    password: 'Password123!',
    role: 'SALES'
  };

  test('Admin berhasil membuat pengguna dengan bcrypt cost 10', async () => {
    const result = await userService.create(validInput);

    expect(bcrypt.hash).toHaveBeenCalledWith(validInput.password, 10);
    expect(userModel.insertUser).toHaveBeenCalledWith(expect.objectContaining({
      username: 'raihan2',
      role: 'SALES',
      passwordHash: 'hash-baru'
    }));
    expect(result).not.toHaveProperty('password');
  });

  test('username duplikat menghasilkan 409', async () => {
    userModel.findIdByUsername.mockResolvedValue({ id: 2 });

    await expect(userService.create(validInput)).rejects.toMatchObject({
      message: MESSAGE.DUPLICATE_USERNAME,
      statusCode: 409
    });
    expect(userModel.insertUser).not.toHaveBeenCalled();
  });

  test('password kurang dari 8 karakter ditolak', async () => {
    await expect(userService.create(Object.assign({}, validInput, {
      password: 'pendek'
    }))).rejects.toMatchObject({
      message: MESSAGE.PASSWORD_TOO_SHORT,
      statusCode: 400
    });
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('password lebih dari 72 byte ditolak', async () => {
    const tooLong = 'a'.repeat(73);

    await expect(userService.create(Object.assign({}, validInput, {
      password: tooLong
    }))).rejects.toMatchObject({
      message: MESSAGE.PASSWORD_TOO_LONG,
      statusCode: 400
    });
  });

  test('role di luar whitelist ditolak', async () => {
    await expect(userService.create(Object.assign({}, validInput, {
      role: 'MANAGER'
    }))).rejects.toMatchObject({
      message: MESSAGE.ROLE_INVALID,
      statusCode: 400
    });
  });
});

describe('ubah pengguna', () => {
  test('Admin berhasil mengubah nama', async () => {
    await userService.update(1, { name: 'Nama Baru' });

    expect(userModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
      name: 'Nama Baru',
      role: 'ADMIN',
      isActive: true,
      passwordHash: null
    }), expect.anything());
    expect(userModel.deleteSessionsByUserId).not.toHaveBeenCalled();
  });

  test('Admin berhasil mengubah role', async () => {
    await userService.update(1, { role: 'SALES' });

    expect(userModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
      role: 'SALES'
    }), expect.anything());
  });

  test('Admin berhasil menonaktifkan pengguna', async () => {
    await userService.update(1, { is_active: false });

    expect(userModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
      isActive: false
    }), expect.anything());
    expect(userModel.deleteSessionsByUserId).toHaveBeenCalledWith(1, expect.anything());
  });

  test('Admin berhasil mengaktifkan pengguna', async () => {
    userModel.findByIdForUpdate.mockResolvedValue(dbUser({ is_active: 0 }));

    await userService.update(1, { is_active: true });

    expect(userModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
      isActive: true
    }), expect.anything());
    expect(userModel.deleteSessionsByUserId).not.toHaveBeenCalled();
  });

  test('Admin berhasil reset password', async () => {
    await userService.update(1, { password: 'PasswordBaru123!' });

    expect(bcrypt.hash).toHaveBeenCalledWith('PasswordBaru123!', 10);
    expect(userModel.updateUser).toHaveBeenCalledWith(1, expect.objectContaining({
      passwordHash: 'hash-baru'
    }), expect.anything());
    expect(userModel.deleteSessionsByUserId).toHaveBeenCalledWith(1, expect.anything());
  });

  test('reset password tidak menghapus lockout', async () => {
    await userService.update(1, { password: 'PasswordBaru123!' });

    expect(userModel.resetLoginAttempts).not.toHaveBeenCalled();
    expect(userModel.updateUser.mock.calls[0][1]).not.toHaveProperty('failed_attempts');
    expect(userModel.updateUser.mock.calls[0][1]).not.toHaveProperty('locked_until');
  });

  test('username tidak dapat diubah', async () => {
    await expect(userService.update(1, { username: 'username-baru' })).rejects.toMatchObject({
      message: MESSAGE.USERNAME_READONLY,
      statusCode: 400
    });
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('tidak ada field yang dapat diperbarui ditolak', async () => {
    await expect(userService.update(1, {})).rejects.toMatchObject({
      message: MESSAGE.NO_FIELDS,
      statusCode: 400
    });
  });
});

describe('perlindungan Admin terakhir', () => {
  test('Admin terakhir tidak dapat dinonaktifkan', async () => {
    userModel.lockActiveAdmins.mockResolvedValue([{ id: 1 }]);

    await expect(userService.update(1, { is_active: false })).rejects.toMatchObject({
      message: MESSAGE.LAST_ADMIN,
      statusCode: 409
    });
    expect(userModel.updateUser).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });

  test('Admin terakhir tidak dapat mengubah role menjadi non-ADMIN', async () => {
    userModel.lockActiveAdmins.mockResolvedValue([{ id: 1 }]);

    await expect(userService.update(1, { role: 'SALES' })).rejects.toMatchObject({
      message: MESSAGE.LAST_ADMIN,
      statusCode: 409
    });
    expect(userModel.updateUser).not.toHaveBeenCalled();
  });

  test('Admin boleh menonaktifkan dirinya jika masih ada Admin lain', async () => {
    await expect(userService.update(1, { is_active: false })).resolves.toEqual(
      publicUser({ is_active: true })
    );
    expect(userModel.updateUser).toHaveBeenCalledTimes(1);
    expect(userModel.deleteSessionsByUserId).toHaveBeenCalledWith(1, expect.anything());
    expect(transaction.commit).toHaveBeenCalledTimes(1);
  });
});

describe('transaksi dan penghapusan sesi', () => {
  test('kegagalan penghapusan sesi menyebabkan rollback', async () => {
    const error = new Error('hapus sesi gagal');
    userModel.deleteSessionsByUserId.mockRejectedValue(error);

    await expect(userService.update(1, { is_active: false })).rejects.toBe(error);

    expect(userModel.updateUser).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
    expect(transaction.commit).not.toHaveBeenCalled();
  });

  test('kegagalan update menyebabkan rollback dan sesi tidak dihapus', async () => {
    const error = new Error('update gagal');
    userModel.updateUser.mockRejectedValue(error);

    await expect(userService.update(1, { is_active: false })).rejects.toBe(error);

    expect(userModel.deleteSessionsByUserId).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalledTimes(1);
  });
});

describe('query model user management', () => {
  test('updateUser tidak menyentuh failed_attempts maupun locked_until', async () => {
    const run = jest.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.updateUser(3, {
      name: 'Nama',
      role: 'SALES',
      isActive: false,
      passwordHash: 'hash'
    });

    const [sql, params] = run.mock.calls[0];
    expect(sql).not.toContain('failed_attempts');
    expect(sql).not.toContain('locked_until');
    expect(sql).toContain('password = COALESCE(?, password)');
    expect(params).toEqual(['Nama', 'SALES', 0, 'hash', 3]);
  });

  test('deleteSessionsByUserId hanya menghapus sesi user target', async () => {
    const run = jest.fn().mockResolvedValue([{ affectedRows: 2 }, []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.deleteSessionsByUserId(7);

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain("JSON_EXTRACT(data, '$.user.id')");
    expect(sql).toContain('DELETE FROM `session`');
    expect(params).toEqual([7]);
  });

  test('findByIdForUpdate dan lockActiveAdmins memakai FOR UPDATE', async () => {
    const run = jest.fn().mockResolvedValue([[], []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.findByIdForUpdate(4);
    await model.lockActiveAdmins();

    expect(run.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(run.mock.calls[1][0]).toContain('ORDER BY id ASC');
    expect(run.mock.calls[1][0]).toContain('FOR UPDATE');
  });

  test('findMany memakai query parameterized untuk pencarian', async () => {
    const run = jest.fn().mockResolvedValue([[], []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.findMany({ search: 'dev', limit: 5, offset: 10 });

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('name LIKE ?');
    expect(sql).toContain('LIMIT ? OFFSET ?');
    expect(params).toEqual(expect.arrayContaining(['%dev%', 5, 10]));
  });

  test('filter is_active=false tetap diterapkan pada query', async () => {
    const run = jest.fn().mockResolvedValue([[{ total: 0 }], []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.findMany({ isActive: false, limit: 10, offset: 0 });
    await model.countAll({ isActive: false });

    const findSql = run.mock.calls[0][0];
    const countSql = run.mock.calls[1][0];
    expect(findSql).toContain('? IS NULL OR is_active = ?');
    expect(countSql).toContain('? IS NULL OR is_active = ?');
    expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining([0, 0, 10, 0]));
    expect(run.mock.calls[1][1]).toEqual(expect.arrayContaining([0, 0]));

    run.mockClear();
    await model.findMany({ isActive: '' });
    expect(run.mock.calls[0][1]).toEqual(expect.arrayContaining([null, null]));
  });
});

describe('hak akses endpoint', () => {
  const protectedRequests = [
    ['get', '/api/users'],
    ['get', '/api/users/1'],
    ['post', '/api/users'],
    ['put', '/api/users/1']
  ];

  const bodies = {
    POST: { name: 'User Baru', username: 'userbaru', password: 'Password123!', role: 'SALES' },
    PUT: { name: 'User Diubah' }
  };

  async function callAs(role, method, path) {
    const agent = request.agent(makeTestApp());
    if (role) {
      await agent.get('/__role/' + role);
    }
    const verb = method.toUpperCase();
    return agent[method](path).send(bodies[verb] || {});
  }

  test.each(protectedRequests)('%s %s menolak tanpa sesi dengan 401', async (method, path) => {
    const response = await callAs(null, method, path);
    expect(response.status).toBe(401);
  });

  test.each(protectedRequests)('%s %s menolak role SALES dengan 403', async (method, path) => {
    const response = await callAs('SALES', method, path);
    expect(response.status).toBe(403);
  });

  test.each(protectedRequests)('%s %s mengizinkan ADMIN', async (method, path) => {
    const response = await callAs('ADMIN', method, path);
    expect([200, 201]).toContain(response.status);
  });
});
