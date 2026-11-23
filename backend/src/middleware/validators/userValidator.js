'use strict';

const { body, param } = require('express-validator');
const { ROLES } = require('../../services/userService');

const REQUIRED = 'Field wajib diisi';

function isBooleanLike(value) {
  return typeof value === 'boolean' ||
    value === 1 || value === 0 ||
    value === '1' || value === '0' ||
    value === 'true' || value === 'false';
}

function optionalPasswordLength(value) {
  return value === undefined || value === null || value === '' || String(value).length >= 8;
}

function optionalPasswordBytes(value) {
  return value === undefined || value === null || value === '' ||
    Buffer.byteLength(String(value), 'utf8') <= 72;
}

const id = [
  param('id').isInt({ min: 1 }).withMessage('ID pengguna tidak valid')
];

const create = [
  body('name').trim().notEmpty().withMessage(REQUIRED),
  body('name').isLength({ max: 100 }).withMessage('Nama maksimal 100 karakter'),
  body('username').trim().notEmpty().withMessage(REQUIRED),
  body('username').matches(/^\S+$/).withMessage('Username tidak boleh mengandung spasi'),
  body('password').isLength({ min: 8 }).withMessage('Password minimal 8 karakter'),
  body('password')
    .custom((value) => Buffer.byteLength(String(value), 'utf8') <= 72)
    .withMessage('Password maksimal 72 byte'),
  body('role').notEmpty().withMessage(REQUIRED),
  body('role').isIn(ROLES).withMessage('Role tidak valid')
];

const update = [
  param('id').isInt({ min: 1 }).withMessage('ID pengguna tidak valid'),
  body('username').not().exists().withMessage('Username tidak dapat diubah'),
  body('name').optional({ nullable: true }).trim().notEmpty().withMessage(REQUIRED),
  body('name').optional({ nullable: true }).isLength({ max: 100 }).withMessage('Nama maksimal 100 karakter'),
  body('role').optional({ nullable: true }).isIn(ROLES).withMessage('Role tidak valid'),
  body('is_active').optional({ nullable: true }).custom(isBooleanLike).withMessage('Status harus boolean'),
  body('password').custom(optionalPasswordLength).withMessage('Password minimal 8 karakter'),
  body('password').custom(optionalPasswordBytes).withMessage('Password maksimal 72 byte')
];

module.exports = { id, create, update };
