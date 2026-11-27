'use strict';

const express = require('express');

const catalogController = require('../controllers/catalogController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const catalogValidator = require('../middleware/validators/catalogValidator');

const router = express.Router();

router.use(requireLogin);

// Daftar produk tersedia untuk semua peran yang sudah login.
router.get('/', catalogValidator.list, validate, asyncHandler(catalogController.products));

// Rekomendasi restock dibaca dari data transaksi, bukan field turunan di products.
router.get('/restock', requireRole('ADMIN', 'GUDANG'), asyncHandler(catalogController.restock));

// Kalkulator harga read-only untuk Sales dan Admin; bukan pembuatan sales order.
router.get('/by-code/:code', requireRole('ADMIN', 'SALES'), catalogValidator.priceByCode, validate,
  asyncHandler(catalogController.productPrice));

// Detail master termasuk produk nonaktif hanya untuk Admin dan Gudang.
router.get('/:id', requireRole('ADMIN', 'GUDANG'), catalogValidator.id, validate,
  asyncHandler(catalogController.productDetail));

// Master produk hanya dikelola Admin. Stok tidak pernah diterima dari sini.
router.post('/', requireRole('ADMIN'), catalogValidator.storeProduct, validate,
  asyncHandler(catalogController.storeProduct));
router.put('/:id', requireRole('ADMIN'), catalogValidator.updateProduct, validate,
  asyncHandler(catalogController.updateProduct));
router.patch('/:id', requireRole('ADMIN'), catalogValidator.id, catalogValidator.setActive, validate,
  asyncHandler(catalogController.setProductActive));

module.exports = router;
