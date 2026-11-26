'use strict';

const express = require('express');

const orderController = require('../controllers/orderController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const orderValidator = require('../middleware/validators/orderValidator');
const paymentRoutes = require('./paymentRoutes');
const invoiceRoutes = require('./invoiceRoutes');

const router = express.Router();

router.use(requireLogin);

// UC-03 Alur A: buat DRAFT hanya untuk Sales dan Admin.
router.post('/', requireRole('ADMIN', 'SALES'), orderValidator.create, validate,
  asyncHandler(orderController.store));

// UC-03 daftar/detail: Sales hanya melihat order miliknya (ditegakkan service).
router.get('/', requireRole('ADMIN', 'SALES', 'KASIR'), orderValidator.list, validate,
  asyncHandler(orderController.index));
router.get('/:id', requireRole('ADMIN', 'SALES', 'KASIR'), orderValidator.id, validate,
  asyncHandler(orderController.show));

router.use('/:id/payments', paymentRoutes);
router.use('/:id', invoiceRoutes);

module.exports = router;
