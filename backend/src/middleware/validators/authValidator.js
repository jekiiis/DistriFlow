'use strict';

const { body } = require('express-validator');

const REQUIRED = 'Field wajib diisi';

const login = [
  body('username').exists({ checkFalsy: true }).withMessage('Username dan password wajib diisi'),
  body('password').exists({ checkFalsy: true }).withMessage('Username dan password wajib diisi')
];

const changePassword = [
  body('oldPassword').exists({ checkFalsy: true }).withMessage(REQUIRED),
  body('newPassword').isLength({ min: 8 }).withMessage('Password minimal 8 karakter'),
  body('newPassword')
    .custom((value) => Buffer.byteLength(String(value), 'utf8') <= 72)
    .withMessage('Password maksimal 72 byte'),
  body('confirmPassword').exists({ checkFalsy: true }).withMessage(REQUIRED)
];

module.exports = { login, changePassword };
