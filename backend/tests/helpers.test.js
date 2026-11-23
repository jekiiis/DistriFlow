'use strict';

jest.mock('express-validator', () => ({ validationResult: jest.fn() }));

const { validationResult } = require('express-validator');
const AppError = require('../src/helpers/AppError');
const asyncHandler = require('../src/helpers/asyncHandler');
const { validate } = require('../src/middleware/validate');

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
  return res;
}

describe('AppError', () => {
  test('memiliki status 500 dan errors null secara default', () => {
    const error = new AppError('Kesalahan');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('AppError');
    expect(error.message).toBe('Kesalahan');
    expect(error.statusCode).toBe(500);
    expect(error.errors).toBeNull();
  });

  test('menyimpan status dan daftar error yang diberikan', () => {
    const errors = [{ field: 'username', message: 'Username sudah terdaftar' }];
    const error = new AppError('Konflik', 409, errors);

    expect(error.statusCode).toBe(409);
    expect(error.errors).toBe(errors);
  });
});

describe('asyncHandler', () => {
  test('meneruskan error async ke next', async () => {
    const error = new Error('gagal async');
    const next = jest.fn();
    const handler = asyncHandler(async () => {
      throw error;
    });

    await handler({}, {}, next);

    expect(next).toHaveBeenCalledWith(error);
  });

  test('tidak memanggil next saat handler berhasil', async () => {
    const next = jest.fn();
    const handler = asyncHandler(async () => 'nilai');

    await expect(handler({}, {}, next)).resolves.toBe('nilai');
    expect(next).not.toHaveBeenCalled();
  });
});

describe('validate', () => {
  test('melanjutkan permintaan bila tidak ada error validasi', () => {
    validationResult.mockReturnValue({ isEmpty: () => true });
    const res = makeRes();
    const next = jest.fn();

    validate({}, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('menghasilkan 400 dengan pesan pertama dan daftar error', () => {
    validationResult.mockReturnValue({
      isEmpty: () => false,
      array: () => [
        { path: 'username', msg: 'Username dan password wajib diisi' },
        { path: 'password', msg: 'Username dan password wajib diisi' }
      ]
    });
    const res = makeRes();
    const next = jest.fn();

    validate({}, res, next);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      success: false,
      message: 'Username dan password wajib diisi',
      errors: [
        { field: 'username', message: 'Username dan password wajib diisi' },
        { field: 'password', message: 'Username dan password wajib diisi' }
      ]
    });
    expect(next).not.toHaveBeenCalled();
  });
});
