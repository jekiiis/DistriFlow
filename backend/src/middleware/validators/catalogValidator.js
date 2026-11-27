'use strict';

const { body, param, query } = require('express-validator');
const money = require('../../helpers/money');
const { LEVELS } = require('../../services/catalogService');

const STOCK_FORBIDDEN = 'Stok tidak dapat diubah pada master produk';

function isPositiveMoney(value) {
  if (value === undefined || value === null || value === '') {
    return false;
  }

  try {
    return money.toCents(value) > 0;
  } catch (error) {
    return false;
  }
}

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

const id = [
  param('id').isInt({ min: 1 }).withMessage('ID produk tidak valid')
];

const productFields = {
  codeRequired: body('code').trim().notEmpty().withMessage('Kode produk wajib diisi'),
  codeLength: body('code').isLength({ max: 20 }).withMessage('Kode produk maksimal 20 karakter'),
  nameRequired: body('name').trim().notEmpty().withMessage('Nama produk wajib diisi'),
  nameLength: body('name').isLength({ max: 100 }).withMessage('Nama produk maksimal 100 karakter'),
  unitRequired: body('unit').trim().notEmpty().withMessage('Unit wajib diisi'),
  unitLength: body('unit').isLength({ max: 20 }).withMessage('Unit maksimal 20 karakter'),
  retail: body('price_retail').custom(isPositiveMoney)
    .withMessage('Harga retail harus lebih dari 0 dengan maksimal 2 desimal'),
  wholesale: body('price_wholesale').custom(isPositiveMoney)
    .withMessage('Harga grosir harus lebih dari 0 dengan maksimal 2 desimal')
};

const storeProduct = [
  productFields.codeRequired,
  productFields.codeLength,
  productFields.nameRequired,
  productFields.nameLength,
  productFields.unitRequired,
  productFields.unitLength,
  productFields.retail,
  productFields.wholesale,
  body('min_stock').optional({ nullable: true }).isInt({ min: 0 })
    .withMessage('Stok minimum harus bilangan bulat non-negatif'),
  body('stock').not().exists().withMessage(STOCK_FORBIDDEN)
];

const updateProduct = id.concat([
  body('code').optional({ nullable: true }).trim().notEmpty().withMessage('Kode produk wajib diisi'),
  body('code').optional({ nullable: true }).isLength({ max: 20 })
    .withMessage('Kode produk maksimal 20 karakter'),
  body('name').optional({ nullable: true }).trim().notEmpty().withMessage('Nama produk wajib diisi'),
  body('name').optional({ nullable: true }).isLength({ max: 100 })
    .withMessage('Nama produk maksimal 100 karakter'),
  body('unit').optional({ nullable: true }).trim().notEmpty().withMessage('Unit wajib diisi'),
  body('unit').optional({ nullable: true }).isLength({ max: 20 }).withMessage('Unit maksimal 20 karakter'),
  body('price_retail').optional({ nullable: true }).custom(isPositiveMoney)
    .withMessage('Harga retail harus lebih dari 0 dengan maksimal 2 desimal'),
  body('price_wholesale').optional({ nullable: true }).custom(isPositiveMoney)
    .withMessage('Harga grosir harus lebih dari 0 dengan maksimal 2 desimal'),
  body('min_stock').optional({ nullable: true }).isInt({ min: 0 })
    .withMessage('Stok minimum harus bilangan bulat non-negatif'),
  body('stock').not().exists().withMessage(STOCK_FORBIDDEN)
]);

const setActive = [
  body('is_active').isBoolean().withMessage('Status harus boolean')
];

const storeCustomer = [
  body('code').trim().notEmpty().withMessage('Kode pelanggan wajib diisi'),
  body('code').isLength({ max: 20 }).withMessage('Kode pelanggan maksimal 20 karakter'),
  body('name').trim().notEmpty().withMessage('Nama pelanggan wajib diisi'),
  body('name').isLength({ max: 100 }).withMessage('Nama pelanggan maksimal 100 karakter'),
  body('address').optional({ nullable: true }).trim().isLength({ max: 255 })
    .withMessage('Alamat maksimal 255 karakter'),
  body('phone').optional({ nullable: true }).trim().isLength({ max: 20 })
    .withMessage('Nomor telepon maksimal 20 karakter'),
  body('price_level').optional({ nullable: true }).isIn(LEVELS).withMessage('Level harga tidak valid'),
  body('credit_limit').optional({ nullable: true }).custom(isNonNegativeMoney)
    .withMessage('Limit kredit tidak valid'),
  body('payment_term_days').optional({ nullable: true }).isInt({ min: 0 })
    .withMessage('Jangka waktu pembayaran tidak valid')
];

const updateCustomer = customerId.concat([
  body('code').optional({ nullable: true }).trim().notEmpty().withMessage('Kode pelanggan wajib diisi'),
  body('code').optional({ nullable: true }).isLength({ max: 20 })
    .withMessage('Kode pelanggan maksimal 20 karakter'),
  body('name').optional({ nullable: true }).trim().notEmpty().withMessage('Nama pelanggan wajib diisi'),
  body('name').optional({ nullable: true }).isLength({ max: 100 })
    .withMessage('Nama pelanggan maksimal 100 karakter'),
  body('address').optional({ nullable: true }).trim().isLength({ max: 255 })
    .withMessage('Alamat maksimal 255 karakter'),
  body('phone').optional({ nullable: true }).trim().isLength({ max: 20 })
    .withMessage('Nomor telepon maksimal 20 karakter'),
  body('price_level').optional({ nullable: true }).isIn(LEVELS).withMessage('Level harga tidak valid'),
  body('credit_limit').optional({ nullable: true }).custom(isNonNegativeMoney)
    .withMessage('Limit kredit tidak valid'),
  body('payment_term_days').optional({ nullable: true }).isInt({ min: 0 })
    .withMessage('Jangka waktu pembayaran tidak valid')
]);

const list = [search, page, limit];
const priceByCode = productCode.concat(priceQuery);

module.exports = {
  list,
  customerId,
  productCode,
  priceByCode,
  id,
  storeProduct,
  updateProduct,
  setActive,
  storeCustomer,
  updateCustomer
};
