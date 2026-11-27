'use strict';

const AppError = require('../helpers/AppError');
const { success, HTTP_STATUS } = require('../helpers/response');
const reportService = require('../services/reportService');

function safeFilename(value) {
  const clean = String(value || '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  return clean || 'periode';
}

async function sales(req, res) {
  const data = await reportService.getSalesReport(req.query || {});
  return success(res, data, 'Laporan penjualan');
}

async function salesPdf(req, res) {
  const result = await reportService.generateSalesReportPdf(req.query || {});

  if (!Buffer.isBuffer(result.pdf) || result.pdf.length === 0) {
    throw new AppError('Gagal membuat PDF laporan penjualan', HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  const filename = 'laporan-penjualan-'
    + safeFilename(result.report.period.from)
    + '_'
    + safeFilename(result.report.period.to)
    + '.pdf';

  res.status(200);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.set('Cache-Control', 'no-store');
  return res.send(result.pdf);
}

module.exports = { sales, salesPdf, safeFilename };
