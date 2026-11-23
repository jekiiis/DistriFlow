'use strict';

const { HTTP_STATUS } = require('./response');

/**
 * Error aplikasi yang aman dikirim ke klien.
 * Dipakai oleh service/controller untuk menyampaikan status HTTP dan pesan
 * yang memang ditujukan untuk pengguna. Error di luar kelas ini tetap
 * diperlakukan sebagai kesalahan server 500 oleh error handler.
 */
class AppError extends Error {
  constructor(message, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, errors = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
