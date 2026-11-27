'use strict';

const { body, param, query } = require('express-validator');
const money = require('../../helpers/money');

const METHODS = ['TUNAI', 'TRANSFER'];
const ORDER_STATUSES = ['DRAFT', 'LUNAS', 'PIUTANG', 'BATAL'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPositiveMoney(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  try {
    return money.toCents(value) >= 1;
  } catch (error) {
    return false;
  }
}

function optionalDate(value) {
  return value === undefined || value === null || value === ''
    || DATE_PATTERN.test(String(value));
}

function validDateRange(value, { req }) {
  const from = req.query.date_from;
  const to = req.query.date_to;
  if (!from || !to) {
    return true;
  }
  if (!DATE_PATTERN.test(String(from)) || !DATE_PATTERN.test(String(to))) {
    return false;
  }
  return String(to) >= String(from);
}

function isOptionalText(value) {
  return value === undefined || value === null || typeof value === 'string';
}

const list = [
  query('page').optional({ nullable: true })
    .isInt({ min: 1 }).withMessage('Halaman tidak valid'),
  query('limit').optional({ nullable: true })
    .isInt({ min: 1, max: 100 }).withMessage('Limit maksimal 100'),
  query('search').optional({ nullable: true })
    .isLength({ max: 100 }).withMessage('Pencarian terlalu panjang'),
  query('status').optional({ nullable: true })
    .isIn(['', ...ORDER_STATUSES]).withMessage('Status tidak valid'),
  query('date_from').optional({ nullable: true })
    .custom(optionalDate).withMessage('Tanggal awal tidak valid'),
  query('date_to').optional({ nullable: true })
    .custom(optionalDate).withMessage('Tanggal akhir tidak valid'),
  query('date_to').optional({ nullable: true })
    .custom(validDateRange).withMessage('Tanggal akhir tidak boleh sebelum tanggal awal')
];

const id = [
  param('id').isInt({ min: 1 }).withMessage('ID piutang tidak valid')
];

const pay = [
  param('id').isInt({ min: 1 }).withMessage('ID piutang tidak valid'),
  body('nominal').custom(isPositiveMoney).withMessage('Nominal tidak valid'),
  body('method').isIn(METHODS).withMessage('Metode pembayaran tidak valid'),
  body('reference').optional({ nullable: true })
    .custom(isOptionalText).withMessage('Referensi tidak valid')
    .isLength({ max: 100 }).withMessage('Referensi maksimal 100 karakter'),
  body('note').optional({ nullable: true })
    .custom(isOptionalText).withMessage('Catatan tidak valid')
    .isLength({ max: 255 }).withMessage('Catatan maksimal 255 karakter')
];

const paymentId = [
  param('id').isInt({ min: 1 }).withMessage('ID pembayaran tidak valid')
];

module.exports = { list, id, pay, paymentId, METHODS, ORDER_STATUSES };
