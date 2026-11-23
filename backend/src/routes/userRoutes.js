'use strict';

const express = require('express');

const userController = require('../controllers/userController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireRole } = require('../middleware/roleMiddleware');
const { validate } = require('../middleware/validate');
const userValidator = require('../middleware/validators/userValidator');

const router = express.Router();

// Seluruh endpoint User Management hanya untuk ADMIN.
router.use(requireRole('ADMIN'));

router.get('/', asyncHandler(userController.index));
router.get('/:id', userValidator.id, validate, asyncHandler(userController.show));
router.post('/', userValidator.create, validate, asyncHandler(userController.store));
router.put('/:id', userValidator.update, validate, asyncHandler(userController.update));

module.exports = router;
