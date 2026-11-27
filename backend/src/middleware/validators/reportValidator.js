'use strict';

const { query } = require('express-validator');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MESSAGE = Object.freeze({
  FROM_REQUIRED: 'Tanggal awal wajib diisi',
  TO_REQUIRED: 'Tanggal akhir wajib diisi',
  DATE_INVALID: 'Format tanggal harus YYYY-MM-DD',
  ORDER_INVALID: 'Tanggal awal tidak boleh setelah tanggal akhir'
});

/** YYYY-MM-DD beserta tanggal kalender yang benar (menolak 2026-02-31). */
function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

const dateFrom = query('date_from')
  .trim()
  .notEmpty().withMessage(MESSAGE.FROM_REQUIRED)
  .bail()
  .custom(isCalendarDate).withMessage(MESSAGE.DATE_INVALID);

const dateTo = query('date_to')
  .trim()
  .notEmpty().withMessage(MESSAGE.TO_REQUIRED)
  .bail()
  .custom(isCalendarDate).withMessage(MESSAGE.DATE_INVALID);

const periodOrder = query('date_to').custom((value, { req }) => {
  const from = req.query && req.query.date_from;
  // Tanggal yang tidak valid sudah dilaporkan chain masing-masing.
  if (!isCalendarDate(from) || !isCalendarDate(value)) {
    return true;
  }
  return from <= value;
}).withMessage(MESSAGE.ORDER_INVALID);

/**FR-19: date_from dan date_to wajib, terformat, dan terurut. */
const sales = [dateFrom, dateTo, periodOrder];

module.exports = { sales, isCalendarDate, DATE_PATTERN, MESSAGE };
