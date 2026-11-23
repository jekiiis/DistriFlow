'use strict';

const express = require('express');

const authController = require('../controllers/authController');
const asyncHandler = require('../helpers/asyncHandler');
const { requireLogin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const authValidator = require('../middleware/validators/authValidator');

const router = express.Router();

router.post('/login', authValidator.login, validate, asyncHandler(authController.login));

router.post('/logout', requireLogin, asyncHandler(authController.logout));
router.get('/me', requireLogin, authController.me);
router.put('/password', requireLogin, authValidator.changePassword, validate, asyncHandler(authController.changePassword));

module.exports = router;
