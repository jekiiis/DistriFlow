'use strict';

const { body, param } = require('express-validator');
const money = require('../../helpers/money');

const METHODS = ['TUNAI', 'TRANSFER'];
const PAYMENT_TYPES = ['TUNAI', 'KREDIT'];

function isNonNegativeMoney(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  try {
    return money.toCents(value) >= 0;
  } catch (error) {
    return false;
  }
}

const pay = [
  param('id').isInt({ min: 1 }).withMessage('ID sales order tidak valid'),
  body('payment_type').isIn(PAYMENT_TYPES).withMessage('Jenis pembayaran tidak valid'),
  body('method').isIn(METHODS).withMessage('Metode pembayaran tidak valid'),
  body('nominal').custom(isNonNegativeMoney).withMessage('Nominal tidak valid'),
  body('note').optional({ nullable: true })
    .isLength({ max: 255 }).withMessage('Catatan maksimal 255 karakter')
];

module.exports = { pay, METHODS, PAYMENT_TYPES };
