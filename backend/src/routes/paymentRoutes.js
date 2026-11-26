'use strict';

const express = require('express');

const paymentController = require('../controllers/paymentController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const paymentValidator = require('../middleware/validators/paymentValidator');

// mergeParams dibutuhkan agar :id dari /orders/:id/payments ikut terbaca.
const router = express.Router({ mergeParams: true });

// Pemisahan tugas per SKPL: pembayaran tetap diproses Kasir.
router.post('/', requireRole('KASIR'), paymentValidator.pay, validate,
  asyncHandler(paymentController.pay));

module.exports = router;
