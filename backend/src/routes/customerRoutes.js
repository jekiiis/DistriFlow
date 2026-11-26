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

// Daftar pelanggan dipakai bersama Sales, Kasir, dan Admin.
router.get('/', requireRole('ADMIN', 'SALES', 'KASIR'), catalogValidator.list, validate,
  asyncHandler(catalogController.customers));

// Informasi kredit hanya untuk Sales dan Admin. Tidak ada field risiko (FR-22).
router.get('/:id/credit', requireRole('ADMIN', 'SALES'), catalogValidator.customerId, validate,
  asyncHandler(catalogController.customerCredit));

module.exports = router;
