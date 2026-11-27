'use strict';

const express = require('express');

const receiptController = require('../controllers/receiptController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const receivableValidator = require('../middleware/validators/receivableValidator');

const router = express.Router();

router.use(requireLogin);

// Bukti pembayaran dicetak Kasir; tidak mengubah data transaksi.
router.get('/:id/receipt.pdf', requireRole('KASIR'), receivableValidator.paymentId, validate,
  asyncHandler(receiptController.pdf));

module.exports = router;
