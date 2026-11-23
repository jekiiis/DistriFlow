'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

const { pool, getExecutor, withTransaction } = require('../src/config/db');

function makeConnection(overrides = {}) {
  return Object.assign({
    beginTransaction: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    rollback: jest.fn().mockResolvedValue(undefined),
    release: jest.fn(),
    execute: jest.fn().mockResolvedValue([[], []])
  }, overrides);
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('withTransaction', () => {
  test('commit saat callback berhasil dan koneksi dilepas', async () => {
    const connection = makeConnection();
    jest.spyOn(pool, 'getConnection').mockResolvedValue(connection);

    const result = await withTransaction(async (conn) => {
      await conn.execute('UPDATE users SET is_active = ? WHERE id = ?', [0, 1]);
      return 'berhasil';
    });

    expect(result).toBe('berhasil');
    expect(connection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(connection.execute).toHaveBeenCalledWith(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [0, 1]
    );
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('rollback saat callback gagal dan koneksi tetap dilepas', async () => {
    const error = new Error(' proses gagal ');
    const connection = makeConnection();
    jest.spyOn(pool, 'getConnection').mockResolvedValue(connection);

    await expect(withTransaction(async () => {
      throw error;
    })).rejects.toBe(error);

    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('rollback dan lepas koneksi saat commit gagal', async () => {
    const commitError = new Error('commit gagal');
    const connection = makeConnection({
      commit: jest.fn().mockRejectedValue(commitError)
    });
    jest.spyOn(pool, 'getConnection').mockResolvedValue(connection);

    await expect(withTransaction(async () => 'nilai')).rejects.toBe(commitError);

    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('koneksi tetap dilepas saat beginTransaction gagal', async () => {
    const connection = makeConnection({
      beginTransaction: jest.fn().mockRejectedValue(new Error('begin gagal'))
    });
    jest.spyOn(pool, 'getConnection').mockResolvedValue(connection);
    const callback = jest.fn();

    await expect(withTransaction(callback)).rejects.toThrow('begin gagal');

    expect(callback).not.toHaveBeenCalled();
    expect(connection.commit).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.release).toHaveBeenCalledTimes(1);
  });

  test('kesalahan getConnection diteruskan tanpa koneksi yang dilepas', async () => {
    const error = new Error('pool penuh');
    jest.spyOn(pool, 'getConnection').mockRejectedValue(error);

    await expect(withTransaction(async () => 'nilai')).rejects.toBe(error);
  });
});

describe('getExecutor', () => {
  test('tanpa koneksi memakai pool.execute', async () => {
    const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[], []]);
    const run = getExecutor();

    await run('SELECT 1', [1]);

    expect(executeSpy).toHaveBeenCalledWith('SELECT 1', [1]);
  });

  test('dengan koneksi transaksi memanggil connection.execute, bukan pool', async () => {
    const executeSpy = jest.spyOn(pool, 'execute').mockResolvedValue([[], []]);
    const connection = makeConnection();
    const run = getExecutor(connection);

    await run('UPDATE users SET is_active = ? WHERE id = ?', [0, 2]);

    expect(connection.execute).toHaveBeenCalledWith(
      'UPDATE users SET is_active = ? WHERE id = ?',
      [0, 2]
    );
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
