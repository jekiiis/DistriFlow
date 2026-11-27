'use strict';

const express = require('express');

const stockController = require('../controllers/stockController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const stockValidator = require('../middleware/validators/stockValidator');

const router = express.Router();

router.use(requireLogin);

// Pencatatan barang masuk dan riwayatnya menjadi tanggung jawab Gudang;
// Admin juga diizinkan sesuai allowlist peran.
router.post('/', requireRole('ADMIN', 'GUDANG'), stockValidator.create, validate,
  asyncHandler(stockController.store));
router.get('/', requireRole('ADMIN', 'GUDANG'), stockValidator.list, validate,
  asyncHandler(stockController.index));

module.exports = router;
