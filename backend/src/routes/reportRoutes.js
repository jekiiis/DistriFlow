'use strict';

const express = require('express');

const reportController = require('../controllers/reportController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const reportValidator = require('../middleware/validators/reportValidator');

const router = express.Router();

router.use(requireLogin);

// FR-19: laporan penjualan dan ekspor PDF hanya untuk ADMIN.
router.get('/sales', requireRole('ADMIN'), reportValidator.sales, validate,
  asyncHandler(reportController.sales));
router.get('/sales.pdf', requireRole('ADMIN'), reportValidator.sales, validate,
  asyncHandler(reportController.salesPdf));

module.exports = router;
