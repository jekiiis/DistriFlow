'use strict';

const bcrypt = require('bcrypt');
const AppError = require('../helpers/AppError');
const { HTTP_STATUS } = require('../helpers/response');
const { withTransaction } = require('../config/db');
const userModel = require('../models/userModel');

const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;
const ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];

const MESSAGE = Object.freeze({
  REQUIRED: 'Field wajib diisi',
  USER_NOT_FOUND: 'Pengguna tidak ditemukan',
  INVALID_ID: 'ID pengguna tidak valid',
  DUPLICATE_USERNAME: 'Username sudah terdaftar',
  PASSWORD_TOO_SHORT: 'Password minimal 8 karakter',
  PASSWORD_TOO_LONG: 'Password maksimal 72 byte',
  ROLE_INVALID: 'Role tidak valid',
  USERNAME_READONLY: 'Username tidak dapat diubah',
  USERNAME_SPACE: 'Username tidak boleh mengandung spasi',
  STATUS_INVALID: 'Status harus boolean',
  NO_FIELDS: 'Tidak ada field yang dapat diperbarui',
  LAST_ADMIN: 'Minimal harus ada satu Admin aktif'
});

function toPublicUser(row) {
  return {
    id: Number(row.id),
    name: row.name,
    username: row.username,
    role: row.role,
    is_active: Boolean(row.is_active)
  };
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.INVALID_ID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function toBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (value === 1 || value === '1' || value === 'true') {
    return true;
  }
  if (value === 0 || value === '0' || value === 'false') {
    return false;
  }
  throw new AppError(MESSAGE.STATUS_INVALID, HTTP_STATUS.BAD_REQUEST);
}

function validatePasswordRules(password) {
  if (String(password).length < MIN_PASSWORD_LENGTH) {
    throw new AppError(MESSAGE.PASSWORD_TOO_SHORT, HTTP_STATUS.BAD_REQUEST);
  }
  if (Buffer.byteLength(String(password), 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AppError(MESSAGE.PASSWORD_TOO_LONG, HTTP_STATUS.BAD_REQUEST);
  }
}

function validateCreateInput(input = {}) {
  if (!input.name || String(input.name).trim() === '') {
    throw new AppError(MESSAGE.REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }
  if (!input.username || String(input.username).trim() === '') {
    throw new AppError(MESSAGE.REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }
  if (/\s/.test(input.username)) {
    throw new AppError(MESSAGE.USERNAME_SPACE, HTTP_STATUS.BAD_REQUEST);
  }
  validatePasswordRules(input.password);
  if (!ROLES.includes(input.role)) {
    throw new AppError(MESSAGE.ROLE_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
}

function normalizeName(value) {
  if (String(value).trim() === '') {
    throw new AppError(MESSAGE.REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }
  return value;
}

function normalizeRole(value) {
  if (!ROLES.includes(value)) {
    throw new AppError(MESSAGE.ROLE_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return value;
}

function normalizeUpdate(input = {}) {
  if (input.username !== undefined) {
    throw new AppError(MESSAGE.USERNAME_READONLY, HTTP_STATUS.BAD_REQUEST);
  }

  const fields = {};

  if (input.name !== undefined) {
    fields.name = normalizeName(input.name);
  }
  if (input.role !== undefined) {
    fields.role = normalizeRole(input.role);
  }
  if (input.is_active !== undefined) {
    fields.isActive = toBoolean(input.is_active);
  }
  if (input.password !== undefined && input.password !== null && input.password !== '') {
    validatePasswordRules(input.password);
    fields.password = input.password;
  }

  if (Object.keys(fields).length === 0) {
    throw new AppError(MESSAGE.NO_FIELDS, HTTP_STATUS.BAD_REQUEST);
  }

  return fields;
}

function assertLastAdmin(target, fields, activeAdmins) {
  const wasActiveAdmin = target.role === 'ADMIN' && Boolean(target.is_active);
  const nextRole = fields.role === undefined ? target.role : fields.role;
  const nextActive = fields.isActive === undefined ? Boolean(target.is_active) : fields.isActive;

  if (wasActiveAdmin && (nextRole !== 'ADMIN' || !nextActive) && activeAdmins.length <= 1) {
    throw new AppError(MESSAGE.LAST_ADMIN, HTTP_STATUS.CONFLICT);
  }
}

function buildUpdateValues(fields, target, passwordHash) {
  return {
    name: fields.name === undefined ? target.name : fields.name,
    role: fields.role === undefined ? target.role : fields.role,
    isActive: fields.isActive === undefined ? Boolean(target.is_active) : fields.isActive,
    passwordHash
  };
}

function parseActiveFilter(value) {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  return toBoolean(value) ? 1 : 0;
}

async function list(query = {}) {
  const page = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);
  const safePage = Number.isInteger(page) && page > 0 ? page : 1;
  const safeLimit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : 10;

  const filters = {
    search: query.search || '',
    role: query.role || '',
    isActive: parseActiveFilter(query.isActive),
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit
  };

  const [rows, total] = await Promise.all([
    userModel.findMany(filters),
    userModel.countAll(filters)
  ]);

  return {
    users: rows.map(toPublicUser),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.ceil(total / safeLimit)
    }
  };
}

async function getById(id) {
  const userId = parseId(id);
  const user = await userModel.findPublicById(userId);

  if (!user) {
    throw new AppError(MESSAGE.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  return toPublicUser(user);
}

async function create(input = {}) {
  validateCreateInput(input);

  const existing = await userModel.findIdByUsername(input.username);
  if (existing) {
    throw new AppError(MESSAGE.DUPLICATE_USERNAME, HTTP_STATUS.CONFLICT);
  }

  try {
    const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
    const result = await userModel.insertUser({
      name: input.name,
      username: input.username,
      role: input.role,
      passwordHash
    });
    const created = await userModel.findPublicById(result.insertId);
    return toPublicUser(created);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw new AppError(MESSAGE.DUPLICATE_USERNAME, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }
}

async function update(id, input = {}) {
  const userId = parseId(id);
  const fields = normalizeUpdate(input);

  return withTransaction(async (connection) => {
    const mayReduceAdmins = (fields.role !== undefined && fields.role !== 'ADMIN') ||
      (fields.isActive !== undefined && fields.isActive === false);
    const activeAdmins = mayReduceAdmins
      ? await userModel.lockActiveAdmins(connection)
      : [];

    const target = await userModel.findByIdForUpdate(userId, connection);
    if (!target) {
      throw new AppError(MESSAGE.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    assertLastAdmin(target, fields, activeAdmins);

    const passwordHash = fields.password === undefined
      ? null
      : await bcrypt.hash(fields.password, BCRYPT_COST);
    const values = buildUpdateValues(fields, target, passwordHash);

    await userModel.updateUser(userId, values, connection);

    const nextActive = fields.isActive === undefined ? Boolean(target.is_active) : fields.isActive;
    if (!nextActive || fields.password !== undefined) {
      await userModel.deleteSessionsByUserId(userId, connection);
    }

    return toPublicUser(await userModel.findPublicById(userId, connection));
  });
}

module.exports = {
  MESSAGE,
  ROLES,
  BCRYPT_COST,
  list,
  getById,
  create,
  update
};
