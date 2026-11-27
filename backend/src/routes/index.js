'use strict';

const express = require('express');
const { fail, HTTP_STATUS } = require('../helpers/response');
const authRoutes = require('./authRoutes');
const userRoutes = require('./userRoutes');
const customerRoutes = require('./customerRoutes');
const productRoutes = require('./productRoutes');
const orderRoutes = require('./orderRoutes');
const stockRoutes = require('./stockRoutes');
const receivableRoutes = require('./receivableRoutes');
const paymentReceiptRoutes = require('./paymentReceiptRoutes');
const reportRoutes = require('./reportRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

// Task 1.2: autentikasi. Task 1.3: kelola pengguna (khusus ADMIN).
router.use('/auth', authRoutes);
router.use('/users', userRoutes);

// Task 2.1: lookup read-only katalog untuk UC-03/UC-04.
router.use('/customers', customerRoutes);
router.use('/products', productRoutes);

// Task 2.3: buat sales order DRAFT (UC-03 Alur A).
router.use('/orders', orderRoutes);

// Sprint 3: barang masuk, piutang, bukti pembayaran, laporan, dan KPI.
router.use('/stock-in', stockRoutes);
router.use('/receivables', receivableRoutes);
router.use('/payments', paymentReceiptRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);

// Router ini menjawab path API yang tidak dikenal dengan format seragam.
router.use((req, res) => {
  return fail(res, 'Endpoint tidak ditemukan', null, HTTP_STATUS.NOT_FOUND);
});

module.exports = router;
