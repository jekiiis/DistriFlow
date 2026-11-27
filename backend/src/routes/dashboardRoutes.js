'use strict';

const express = require('express');

const dashboardController = require('../controllers/dashboardController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const router = express.Router();

router.use(requireLogin);

// FR-20: tidak ada role tambahan; KPI tidak menerima parameter pengguna.
router.get('/kpi', validate, asyncHandler(dashboardController.kpi));

module.exports = router;
