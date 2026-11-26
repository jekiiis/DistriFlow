'use strict';

const express = require('express');

const invoiceController = require('../controllers/invoiceController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const invoiceValidator = require('../middleware/validators/invoiceValidator');

const router = express.Router({ mergeParams: true });

// Cetak ulang invoice: Kasir dan Admin. Tidak mengubah status atau stok.
router.get('/invoice.pdf', requireRole('ADMIN', 'KASIR'), invoiceValidator.pdf, validate,
  asyncHandler(invoiceController.pdf));

module.exports = router;
