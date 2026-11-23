'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_HOST = '127.0.0.1';
process.env.DB_PORT = '3306';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = '';
process.env.DB_NAME = 'distriflow_test';
process.env.SESSION_SECRET = 'test-session-secret-not-for-production';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn()
}));

jest.mock('../src/models/userModel', () => ({
  findByUsername: jest.fn(),
  findById: jest.fn(),
  recordFailedAttempt: jest.fn(),
  resetLoginAttempts: jest.fn(),
  updatePassword: jest.fn()
}));

jest.mock('../src/config/db', () => ({
  getExecutor: jest.fn(),
  withTransaction: jest.fn(async (callback) => callback({ execute: jest.fn() }))
}));

const bcrypt = require('bcrypt');
const userModel = require('../src/models/userModel');
const { getExecutor, withTransaction } = require('../src/config/db');
const authService = require('../src/services/authService');
const authController = require('../src/controllers/authController');

const MESSAGE = authService.MESSAGE;

function activeUser(overrides = {}) {
  return Object.assign({
    id: 1,
    name: 'Devrosan',
    username: 'devrosan',
    password: 'stored-hash',
    role: 'ADMIN',
    is_active: 1,
    failed_attempts: 0,
    locked_until: null,
    is_locked: 0
  }, overrides);
}

function makeRes() {
  const res = {
    statusCode: null,
    body: null
  };
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.body = body;
    return res;
  });
  res.clearCookie = jest.fn();
  return res;
}

beforeEach(() => {
  bcrypt.compare.mockResolvedValue(true);
  bcrypt.hash.mockResolvedValue('new-hash');
  userModel.findByUsername.mockResolvedValue(null);
  userModel.findById.mockResolvedValue(null);
  userModel.recordFailedAttempt.mockResolvedValue({ affectedRows: 1 });
  userModel.resetLoginAttempts.mockResolvedValue({ affectedRows: 1 });
  userModel.updatePassword.mockResolvedValue({ affectedRows: 1 });
  withTransaction.mockImplementation(async (callback) => callback({ execute: jest.fn() }));
  getExecutor.mockReset();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('login — validasi awal', () => {
  test('input kosong ditolak sebelum query database', async () => {
    await expect(authService.login('', 'DistriFlow123!')).rejects.toMatchObject({
      message: MESSAGE.EMPTY_LOGIN,
      statusCode: 400
    });
    await expect(authService.login('devrosan', '')).rejects.toMatchObject({
      message: MESSAGE.EMPTY_LOGIN,
      statusCode: 400
    });
    expect(userModel.findByUsername).not.toHaveBeenCalled();
  });

  test('username tidak ditemukan menghasilkan pesan generik', async () => {
    userModel.findByUsername.mockResolvedValue(null);

    await expect(authService.login('tidakada', 'DistriFlow123!')).rejects.toMatchObject({
      message: MESSAGE.INVALID_CREDENTIALS,
      statusCode: 401
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
    expect(userModel.recordFailedAttempt).not.toHaveBeenCalled();
  });
});

describe('login — penguncian akun', () => {
  test('akun terkunci ditolak sebelum verifikasi password', async () => {
    userModel.findByUsername.mockResolvedValue(activeUser({ is_locked: 1 }));

    await expect(authService.login('devrosan', 'DistriFlow123!')).rejects.toMatchObject({
      message: MESSAGE.LOCKED,
      statusCode: 401
    });
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  test('percobaan berikutnya saat terkunci tetap menghasilkan pesan terkunci', async () => {
    userModel.findByUsername.mockResolvedValue(activeUser({
      is_locked: 1,
      locked_until: new Date(Date.now() + 4 * 60 * 1000)
    }));

    await expect(authService.login('devrosan', 'salah')).rejects.toMatchObject({
      message: MESSAGE.LOCKED,
      statusCode: 401
    });
    expect(userModel.recordFailedAttempt).not.toHaveBeenCalled();
  });

  test.each([0, 1, 2, 3])('password salah pada percobaan ke-%i menghasilkan pesan generik', async (failedAttempts) => {
    jest.clearAllMocks();
    bcrypt.compare.mockResolvedValue(false);
    userModel.findByUsername.mockResolvedValue(activeUser({ failed_attempts: failedAttempts }));

    await expect(authService.login('devrosan', 'salah')).rejects.toMatchObject({
      message: MESSAGE.INVALID_CREDENTIALS,
      statusCode: 401
    });
    expect(userModel.recordFailedAttempt).toHaveBeenCalledTimes(1);
    expect(userModel.recordFailedAttempt).toHaveBeenCalledWith(1);
  });

  test('password salah pada percobaan kelima tetap generik dan memanggil recordFailedAttempt', async () => {
    bcrypt.compare.mockResolvedValue(false);
    userModel.findByUsername.mockResolvedValue(activeUser({ failed_attempts: 4 }));

    await expect(authService.login('devrosan', 'salah')).rejects.toMatchObject({
      message: MESSAGE.INVALID_CREDENTIALS,
      statusCode: 401
    });
    expect(userModel.recordFailedAttempt).toHaveBeenCalledTimes(1);
    expect(userModel.recordFailedAttempt).toHaveBeenCalledWith(1);
  });
});

describe('login — status akun', () => {
  test('password salah pada akun nonaktif tetap menghasilkan pesan generik', async () => {
    bcrypt.compare.mockResolvedValue(false);
    userModel.findByUsername.mockResolvedValue(activeUser({ is_active: 0 }));

    await expect(authService.login('devrosan', 'salah')).rejects.toMatchObject({
      message: MESSAGE.INVALID_CREDENTIALS,
      statusCode: 401
    });
  });

  test('password benar pada akun nonaktif menghasilkan pesan nonaktif', async () => {
    userModel.findByUsername.mockResolvedValue(activeUser({ is_active: 0 }));

    await expect(authService.login('devrosan', 'DistriFlow123!')).rejects.toMatchObject({
      message: MESSAGE.INACTIVE,
      statusCode: 401
    });
    expect(userModel.resetLoginAttempts).not.toHaveBeenCalled();
  });
});

describe('login — berhasil', () => {
  test('mengembalikan data pengguna tanpa password', async () => {
    userModel.findByUsername.mockResolvedValue(activeUser());

    const result = await authService.login('devrosan', 'DistriFlow123!');

    expect(result).toEqual({
      id: 1,
      name: 'Devrosan',
      username: 'devrosan',
      role: 'ADMIN'
    });
    expect(result).not.toHaveProperty('password');
  });

  test('mengreset failed_attempts dan locked_until setelah login berhasil', async () => {
    userModel.findByUsername.mockResolvedValue(activeUser({ failed_attempts: 3 }));

    await authService.login('devrosan', 'DistriFlow123!');

    expect(userModel.resetLoginAttempts).toHaveBeenCalledTimes(1);
    expect(userModel.resetLoginAttempts).toHaveBeenCalledWith(1);
    expect(userModel.recordFailedAttempt).not.toHaveBeenCalled();
  });
});

describe('controller login — sesi', () => {
  test('session ID diregenerasi dan data sesi hanya berisi field aman', async () => {
    const user = { id: 1, name: 'Devrosan', username: 'devrosan', role: 'ADMIN' };
    jest.spyOn(authService, 'login').mockResolvedValue(user);
    const session = {
      regenerate: jest.fn((callback) => callback()),
      save: jest.fn((callback) => callback())
    };
    const res = makeRes();

    await authController.login({
      body: { username: 'devrosan', password: 'DistriFlow123!' },
      session
    }, res);

    expect(session.regenerate).toHaveBeenCalledTimes(1);
    expect(session.save).toHaveBeenCalledTimes(1);
    expect(session.user).toEqual(user);
    expect(Object.keys(session.user).sort()).toEqual(['id', 'name', 'role', 'username']);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test('kegagalan regenerasi session ditangani dan tidak mengirim respons sukses', async () => {
    jest.spyOn(authService, 'login').mockResolvedValue(activeUser());
    const error = new Error('regenerate gagal');
    const session = {
      regenerate: jest.fn((callback) => callback(error)),
      save: jest.fn((callback) => callback())
    };
    const res = makeRes();

    await expect(authController.login({
      body: { username: 'devrosan', password: 'DistriFlow123!' },
      session
    }, res)).rejects.toBe(error);

    expect(session.save).not.toHaveBeenCalled();
    expect(session.user).toBeUndefined();
    expect(res.json).not.toHaveBeenCalled();
  });

  test('kegagalan penyimpanan session tidak menghasilkan respons login sukses', async () => {
    jest.spyOn(authService, 'login').mockResolvedValue(activeUser());
    const error = new Error('save gagal');
    const session = {
      regenerate: jest.fn((callback) => callback()),
      save: jest.fn((callback) => callback(error))
    };
    const res = makeRes();

    await expect(authController.login({
      body: { username: 'devrosan', password: 'DistriFlow123!' },
      session
    }, res)).rejects.toBe(error);

    expect(res.json).not.toHaveBeenCalled();
  });
});

describe('ganti password', () => {
  const validInput = {
    oldPassword: 'DistriFlow123!',
    newPassword: 'PasswordBaru123!',
    confirmPassword: 'PasswordBaru123!'
  };

  test('password lama salah ditolak', async () => {
    userModel.findById.mockResolvedValue(activeUser());
    bcrypt.compare.mockResolvedValue(false);

    await expect(authService.changePassword(1, validInput)).rejects.toMatchObject({
      message: MESSAGE.OLD_PASSWORD_WRONG,
      statusCode: 400
    });
    expect(userModel.updatePassword).not.toHaveBeenCalled();
  });

  test('password baru kurang dari 8 karakter ditolak', async () => {
    userModel.findById.mockResolvedValue(activeUser());

    await expect(authService.changePassword(1, Object.assign({}, validInput, {
      newPassword: 'pendek',
      confirmPassword: 'pendek'
    }))).rejects.toMatchObject({ message: MESSAGE.PASSWORD_TOO_SHORT, statusCode: 400 });
  });

  test('password baru lebih dari 72 byte ditolak', async () => {
    userModel.findById.mockResolvedValue(activeUser());
    const tooLong = 'a'.repeat(73);

    await expect(authService.changePassword(1, Object.assign({}, validInput, {
      newPassword: tooLong,
      confirmPassword: tooLong
    }))).rejects.toMatchObject({ message: MESSAGE.PASSWORD_TOO_LONG, statusCode: 400 });
    expect(bcrypt.hash).not.toHaveBeenCalled();
  });

  test('password baru sama dengan password lama ditolak', async () => {
    userModel.findById.mockResolvedValue(activeUser());

    await expect(authService.changePassword(1, Object.assign({}, validInput, {
      newPassword: validInput.oldPassword,
      confirmPassword: validInput.oldPassword
    }))).rejects.toMatchObject({ message: MESSAGE.PASSWORD_SAME, statusCode: 400 });
  });

  test('konfirmasi password tidak cocok ditolak', async () => {
    userModel.findById.mockResolvedValue(activeUser());

    await expect(authService.changePassword(1, Object.assign({}, validInput, {
      confirmPassword: 'KonfirmasiLain123!'
    }))).rejects.toMatchObject({ message: MESSAGE.CONFIRM_MISMATCH, statusCode: 400 });
  });

  test('berhasil mengubah password dengan bcrypt cost 10', async () => {
    userModel.findById.mockResolvedValue(activeUser());

    const result = await authService.changePassword(1, validInput);

    expect(result).toBe(true);
    expect(bcrypt.hash).toHaveBeenCalledWith(validInput.newPassword, 10);
    expect(userModel.updatePassword).toHaveBeenCalledWith(1, 'new-hash', expect.anything());
  });

  test('berhasil dan session saat ini tetap aktif', async () => {
    userModel.findById.mockResolvedValue(activeUser());
    const session = { user: { id: 1 }, destroy: jest.fn() };
    const res = makeRes();

    await authController.changePassword({ session, body: validInput }, res);

    expect(userModel.updatePassword).toHaveBeenCalledTimes(1);
    expect(session.destroy).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(session.user).toEqual({ id: 1 });
  });

  test('kegagalan update password diteruskan', async () => {
    const error = new Error('update password gagal');
    userModel.findById.mockResolvedValue(activeUser());
    userModel.updatePassword.mockRejectedValue(error);

    await expect(authService.changePassword(1, validInput)).rejects.toBe(error);
  });
});

describe('logout', () => {
  test('menghancurkan sesi, menghapus cookie, dan mengembalikan respons sukses', async () => {
    const session = { destroy: jest.fn((callback) => callback()), user: { id: 1 } };
    const res = makeRes();

    await authController.logout({ session }, res);

    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(res.clearCookie).toHaveBeenCalledWith('distriflow.sid', expect.objectContaining({ path: '/' }));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ success: true, message: 'Logout berhasil', data: null });
  });
});

describe('query model autentikasi', () => {
  test('recordFailedAttempt mengunci 5 menit dan mereset attempts pada percobaan kelima', async () => {
    const run = jest.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.recordFailedAttempt(9);

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('failed_attempts + 1 >= ?');
    expect(sql).toContain('DATE_ADD(NOW(), INTERVAL 5 MINUTE)');
    // Kedua kondisi harus memakai nilai lama: locked_until dihitung lebih dulu.
    expect(sql.indexOf('locked_until = IF(')).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf('failed_attempts = IF(')).toBeGreaterThan(sql.indexOf('locked_until = IF('));
    expect(params).toEqual([5, 5, 9]);
  });

  test('resetLoginAttempts menghapus lock dan mengisi last_login_at', async () => {
    const run = jest.fn().mockResolvedValue([{ affectedRows: 1 }, []]);
    getExecutor.mockReturnValue(run);
    const model = jest.requireActual('../src/models/userModel');

    await model.resetLoginAttempts(4);

    const [sql, params] = run.mock.calls[0];
    expect(sql).toContain('failed_attempts = 0');
    expect(sql).toContain('locked_until = NULL');
    expect(sql).toContain('last_login_at = NOW()');
    expect(params).toEqual([4]);
  });
});
