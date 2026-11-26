'use strict';

const invoiceService = require('../services/invoiceService');

function safeFilename(orderNo) {
  return String(orderNo || 'invoice').replace(/[^A-Za-z0-9_-]/g, '_');
}

async function pdf(req, res) {
  const result = await invoiceService.generateInvoice(
    req.params.id,
    req.query && req.query.format
  );

  res.status(200);
  res.set('Content-Type', 'application/pdf');
  res.set('Content-Disposition', 'inline; filename="invoice-' + safeFilename(result.orderNo) + '.pdf"');
  res.set('Cache-Control', 'no-store');
  return res.send(result.pdf);
}

module.exports = { pdf };
