'use strict';

const bcrypt = require('bcrypt');
const AppError = require('../helpers/AppError');
const { HTTP_STATUS } = require('../helpers/response');
const { withTransaction } = require('../config/db');
const userModel = require('../models/userModel');

const BCRYPT_COST = 10;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_BYTES = 72;

const MESSAGE = Object.freeze({
  EMPTY_LOGIN: 'Username dan password wajib diisi',
  INVALID_CREDENTIALS: 'Username atau password salah',
  LOCKED: 'Akun terkunci sementara, coba lagi dalam 5 menit',
  INACTIVE: 'Akun tidak aktif, hubungi Admin',
  REQUIRED: 'Field wajib diisi',
  OLD_PASSWORD_WRONG: 'Password lama salah',
  PASSWORD_TOO_SHORT: 'Password minimal 8 karakter',
  PASSWORD_TOO_LONG: 'Password maksimal 72 byte',
  PASSWORD_SAME: 'Password baru harus berbeda dari password lama',
  CONFIRM_MISMATCH: 'Konfirmasi password tidak sama',
  USER_NOT_FOUND: 'Pengguna tidak ditemukan'
});

function isEmptyCredential(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function isAccountLocked(user) {
  if (user.is_locked === true || user.is_locked === 1) {
    return true;
  }

  if (!user.locked_until) {
    return false;
  }

  const value = user.locked_until instanceof Date
    ? user.locked_until.getTime()
    : Date.parse(user.locked_until);

  return Number.isFinite(value) && value > Date.now();
}

function validateNewPassword(newPassword, confirmPassword, oldPassword) {
  if (Buffer.byteLength(String(newPassword), 'utf8') > MAX_PASSWORD_BYTES) {
    throw new AppError(MESSAGE.PASSWORD_TOO_LONG, HTTP_STATUS.BAD_REQUEST);
  }

  if (String(newPassword).length < MIN_PASSWORD_LENGTH) {
    throw new AppError(MESSAGE.PASSWORD_TOO_SHORT, HTTP_STATUS.BAD_REQUEST);
  }

  if (newPassword !== confirmPassword) {
    throw new AppError(MESSAGE.CONFIRM_MISMATCH, HTTP_STATUS.BAD_REQUEST);
  }

  if (newPassword === oldPassword) {
    throw new AppError(MESSAGE.PASSWORD_SAME, HTTP_STATUS.BAD_REQUEST);
  }
}

async function login(username, password) {
  if (isEmptyCredential(username) || isEmptyCredential(password)) {
    throw new AppError(MESSAGE.EMPTY_LOGIN, HTTP_STATUS.BAD_REQUEST);
  }

  const user = await userModel.findByUsername(username);

  if (!user) {
    throw new AppError(MESSAGE.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
  }

  if (isAccountLocked(user)) {
    throw new AppError(MESSAGE.LOCKED, HTTP_STATUS.UNAUTHORIZED);
  }

  const passwordMatches = await bcrypt.compare(password, user.password);

  if (!passwordMatches) {
    await userModel.recordFailedAttempt(user.id);
    throw new AppError(MESSAGE.INVALID_CREDENTIALS, HTTP_STATUS.UNAUTHORIZED);
  }

  if (!user.is_active) {
    throw new AppError(MESSAGE.INACTIVE, HTTP_STATUS.UNAUTHORIZED);
  }

  await userModel.resetLoginAttempts(user.id);

  return {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role
  };
}

async function changePassword(userId, input = {}) {
  const { oldPassword, newPassword, confirmPassword } = input;

  if (!oldPassword || !newPassword || !confirmPassword) {
    throw new AppError(MESSAGE.REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  return withTransaction(async (connection) => {
    const user = await userModel.findById(userId, connection);

    if (!user) {
      throw new AppError(MESSAGE.USER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const oldPasswordMatches = await bcrypt.compare(oldPassword, user.password);

    if (!oldPasswordMatches) {
      throw new AppError(MESSAGE.OLD_PASSWORD_WRONG, HTTP_STATUS.BAD_REQUEST);
    }

    validateNewPassword(newPassword, confirmPassword, oldPassword);

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_COST);
    await userModel.updatePassword(userId, passwordHash, connection);

    return true;
  });
}

module.exports = {
  MESSAGE,
  BCRYPT_COST,
  MAX_PASSWORD_BYTES,
  login,
  changePassword
};
