'use strict';

const { param, query } = require('express-validator');

const FORMATS = ['a4', '80mm'];

const pdf = [
  param('id').isInt({ min: 1 }).withMessage('ID sales order tidak valid'),
  query('format').optional({ nullable: true })
    .isIn(FORMATS).withMessage('Format invoice tidak valid')
];

module.exports = { pdf, FORMATS };
