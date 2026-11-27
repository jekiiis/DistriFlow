'use strict';

const receiptPdfService = require('../services/receiptPdfService');

function safeFilename(value) {
  return String(value === undefined || value === null ? 'receipt' : value)
    .replace(/[^A-Za-z0-9_-]/g, '_');
}

async function pdf(req, res) {
  const generate = receiptPdfService.generateReceipt
    || receiptPdfService.generate
    || receiptPdfService.buildPdf;
  const result = await generate(req.params.id);

  res.status(200);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'inline; filename="receipt-'
    + safeFilename(result.orderNo) + '-' + safeFilename(result.paymentId) + '.pdf"');
  res.set('Cache-Control', 'no-store');
  return res.send(result.pdf);
}

module.exports = { pdf };
