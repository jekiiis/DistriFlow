'use strict';

const { body, param, query } = require('express-validator');
const money = require('../../helpers/money');

const REQUIRED = 'Minimal satu barang harus ditambahkan';
const FORBIDDEN = 'Field tidak diizinkan';

/**
 * Diskon per baris opsional dan default-nya 0. Null/string kosong dibiarkan
 * dan dinormalisasi menjadi 0 oleh service. money.toCents menolak format rusak,
 * lebih dari dua desimal, dan nilai negatif sebelum pemeriksaan rentang.
 */
function isNonNegativeMoney(value) {
  if (value === undefined || value === null || value === '') {
    return true;
  }

  try {
    return money.toCents(value) >= 0;
  } catch (error) {
    return false;
  }
}

// Harga, level, dan ringkasan uang adalah turunan server. Client tidak boleh
// mengirimkan field-field ini pada payload pembuatan order.
const forbiddenHeaderFields = [
  'unit_price',
  'price',
  'price_level',
  'subtotal',
  'discount',
  'total'
].map((field) => body(field).not().exists().withMessage(FORBIDDEN));

const forbiddenItemFields = [
  'unit_price',
  'price',
  'price_level',
  'subtotal',
  'line_total',
  'total'
].map((field) => body('items.*.' + field).not().exists().withMessage(FORBIDDEN));

const create = [
  body('customer_id').isInt({ min: 1 }).withMessage('ID pelanggan tidak valid'),

  body('items').isArray({ min: 1 }).withMessage(REQUIRED),

  body('items.*.code').trim().notEmpty().withMessage('Kode barang wajib diisi'),
  body('items.*.code').isLength({ max: 20 }).withMessage('Kode barang maksimal 20 karakter'),

  body('items.*.qty').isInt({ min: 1 }).withMessage('Jumlah tidak valid'),

  body('items.*.discount')
    .default(0)
    .custom(isNonNegativeMoney)
    .withMessage('Diskon tidak valid'),

  ...forbiddenHeaderFields,
  ...forbiddenItemFields
];

const ORDER_STATUSES = ['DRAFT', 'LUNAS', 'PIUTANG', 'BATAL'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function optionalDate(value) {
  return value === undefined || value === null || value === '' || DATE_PATTERN.test(String(value));
}

function validDateRange(value, { req }) {
  const from = req.query.date_from || req.query.dateFrom;
  const to = req.query.date_to || req.query.dateTo;
  if (!from || !to) {
    return true;
  }
  if (!DATE_PATTERN.test(String(from)) || !DATE_PATTERN.test(String(to))) {
    return false;
  }
  return String(to) >= String(from);
}

const id = [
  param('id').isInt({ min: 1 }).withMessage('ID sales order tidak valid')
];

const list = [
  query('q').optional({ nullable: true }).isLength({ max: 100 }).withMessage('Pencarian terlalu panjang'),
  query('status').optional({ nullable: true })
    .isIn(['', ...ORDER_STATUSES]).withMessage('Status tidak valid'),
  query('date_from').optional({ nullable: true }).custom(optionalDate)
    .withMessage('Tanggal awal tidak valid'),
  query('date_to').optional({ nullable: true }).custom(optionalDate)
    .withMessage('Tanggal akhir tidak valid'),
  query('date_to').optional({ nullable: true }).custom(validDateRange)
    .withMessage('Tanggal akhir tidak boleh sebelum tanggal awal'),
  query('page').optional({ nullable: true }).isInt({ min: 1 }).withMessage('Halaman tidak valid'),
  query('limit').optional({ nullable: true }).isInt({ min: 1, max: 100 })
    .withMessage('Limit maksimal 100')
];

// FR-09: alasan pembatalan wajib dan dibatasi panjangnya oleh kolom VARCHAR(255).
const cancel = [
  param('id').isInt({ min: 1 }).withMessage('ID sales order tidak valid'),
  body('reason').trim().notEmpty().withMessage('Alasan pembatalan wajib diisi')
    .isLength({ max: 255 }).withMessage('Alasan pembatalan maksimal 255 karakter')
];

module.exports = { create, id, list, cancel, ORDER_STATUSES };
