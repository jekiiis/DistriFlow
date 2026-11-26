'use strict';

const { param, query } = require('express-validator');
const money = require('../../helpers/money');
const { LEVELS } = require('../../services/catalogService');

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

const search = query('search')
  .optional({ nullable: true })
  .trim()
  .isLength({ max: 100 })
  .withMessage('Pencarian maksimal 100 karakter');

const page = query('page')
  .optional({ nullable: true })
  .isInt({ min: 1 })
  .withMessage('Halaman harus bilangan bulat positif');

const limit = query('limit')
  .optional({ nullable: true })
  .isInt({ min: 1, max: 100 })
  .withMessage('Limit harus antara 1 dan 100');

const customerId = [
  param('id').isInt({ min: 1 }).withMessage('ID pelanggan tidak valid')
];

const productCode = [
  param('code').trim().notEmpty().withMessage('Kode produk wajib diisi'),
  param('code').isLength({ max: 20 }).withMessage('Kode produk maksimal 20 karakter')
];

const priceQuery = [
  query('level').optional({ nullable: true }).isIn(LEVELS).withMessage('Level harga tidak valid'),
  query('qty').optional({ nullable: true }).isInt({ min: 1 })
    .withMessage('Kuantitas harus bilangan bulat positif'),
  query('discount').optional({ nullable: true }).custom(isNonNegativeMoney)
    .withMessage('Nominal diskon tidak valid')
];

const list = [search, page, limit];
const priceByCode = productCode.concat(priceQuery);

module.exports = {
  list,
  customerId,
  priceByCode
};
