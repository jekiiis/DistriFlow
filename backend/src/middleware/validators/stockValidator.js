'use strict';

const { body, query } = require('express-validator');
const { MESSAGE } = require('../../services/stockService');

// confirm_duplicate tidak divalidasi tipenya: service hanya menganggap true
// sebagai konfirmasi, sehingga nilai lain tetap meminta konfirmasi duplikat.
const CREATE_FIELDS = ['product_id', 'qty', 'document_no', 'invoice_match', 'note', 'confirm_duplicate'];

const create = [
  body().custom((value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Body permintaan tidak valid');
    }
    const unknown = Object.keys(value).filter((key) => !CREATE_FIELDS.includes(key));
    if (unknown.length > 0) {
      throw new Error(`Field tidak dikenal: ${unknown.join(', ')}`);
    }
    return true;
  }),
  body('product_id').isInt({ min: 1 }).withMessage(MESSAGE.PRODUCT_ID_INVALID),
  body('qty').isInt({ min: 1 }).withMessage(MESSAGE.QTY_INVALID),
  body('document_no').trim().notEmpty().withMessage(MESSAGE.DOCUMENT_NO_REQUIRED)
    .bail().isLength({ max: 50 }).withMessage(MESSAGE.DOCUMENT_NO_TOO_LONG),
  body('invoice_match').custom((value) => value === true)
    .withMessage(MESSAGE.INVOICE_MATCH_REQUIRED),
  body('note').optional({ nullable: true }).trim()
    .isLength({ max: 255 }).withMessage(MESSAGE.NOTE_INVALID)
];

const list = [
  query('search').optional({ nullable: true }).trim()
    .isLength({ max: 100 }).withMessage('Pencarian maksimal 100 karakter'),
  query('page').optional({ nullable: true }).isInt({ min: 1 })
    .withMessage('Halaman harus bilangan bulat positif'),
  query('limit').optional({ nullable: true }).isInt({ min: 1, max: 100 })
    .withMessage('Limit harus antara 1 dan 100'),
  query('date_from').optional({ nullable: true }).isISO8601()
    .withMessage('Tanggal mulai tidak valid'),
  query('date_to').optional({ nullable: true }).isISO8601()
    .withMessage('Tanggal akhir tidak valid')
];

module.exports = { create, list, CREATE_FIELDS };
