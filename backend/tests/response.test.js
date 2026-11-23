'use strict';

const { success, fail, HTTP_STATUS } = require('../src/helpers/response');
const { requireLogin } = require('../src/middleware/auth');
const { requireRole } = require('../src/middleware/roleMiddleware');

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

describe('helper response', () => {
  test('success menghasilkan format seragam dengan status 200', () => {
    const res = makeRes();
    success(res, { id: 1 }, 'Data ditemukan');

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Data ditemukan',
      data: { id: 1 }
    });
  });

  test('fail menyertakan errors bila diberikan', () => {
    const res = makeRes();
    fail(res, 'Validasi gagal', [{ field: 'qty' }], HTTP_STATUS.CONFLICT);

    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({
      success: false,
      message: 'Validasi gagal',
      errors: [{ field: 'qty' }]
    });
  });

  test('kode HTTP yang dipetakan sesuai kontrak', () => {
    expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
    expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
    expect(HTTP_STATUS.FORBIDDEN).toBe(403);
    expect(HTTP_STATUS.NOT_FOUND).toBe(404);
    expect(HTTP_STATUS.CONFLICT).toBe(409);
  });
});

describe('middleware Sprint 0', () => {
  test('requireLogin menolak permintaan tanpa sesi dengan 401', () => {
    const res = makeRes();
    const next = jest.fn();
    requireLogin({}, res, next);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireLogin meneruskan permintaan dengan sesi aktif', () => {
    const res = makeRes();
    const next = jest.fn();
    requireLogin({ session: { user: { role: 'KASIR' } } }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  test('requireRole menolak peran yang tidak berhak dengan 403', () => {
    const res = makeRes();
    const next = jest.fn();
    requireRole('ADMIN')({ session: { user: { role: 'SALES' } } }, res, next);

    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('requireRole meneruskan peran yang berhak', () => {
    const res = makeRes();
    const next = jest.fn();
    requireRole('ADMIN', 'GUDANG')({ session: { user: { role: 'GUDANG' } } }, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});
