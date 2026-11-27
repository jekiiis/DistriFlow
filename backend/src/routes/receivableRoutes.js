'use strict';

const express = require('express');

const receivableController = require('../controllers/receivableController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const receivableValidator = require('../middleware/validators/receivableValidator');

const router = express.Router();

router.use(requireLogin);

// Admin hanya melihat; penyelesaian piutang menjadi wewenang Kasir (FR-17/FR-18).
router.get('/', requireRole('ADMIN', 'KASIR'), receivableValidator.list, validate,
  asyncHandler(receivableController.index));
router.get('/:id', requireRole('ADMIN', 'KASIR'), receivableValidator.id, validate,
  asyncHandler(receivableController.show));
router.post('/:id/pay', requireRole('KASIR'), receivableValidator.pay, validate,
  asyncHandler(receivableController.pay));

module.exports = router;
