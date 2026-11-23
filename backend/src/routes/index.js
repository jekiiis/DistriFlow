'use strict';

const express = require('express');
const { fail, HTTP_STATUS } = require('../helpers/response');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');

const router = express.Router();

// Task 1.2: autentikasi. Task 1.3: kelola pengguna (khusus ADMIN).
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// Router ini menjawab path API yang tidak dikenal dengan format seragam.
router.use((req, res) => {
  return fail(res, 'Endpoint tidak ditemukan', null, HTTP_STATUS.NOT_FOUND);
});

module.exports = router;
