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

// Kalkulator harga read-only untuk Sales dan Admin; bukan pembuatan sales order.
router.get('/by-code/:code', requireRole('ADMIN', 'SALES'), catalogValidator.priceByCode, validate,
  asyncHandler(catalogController.productPrice));

module.exports = router;
