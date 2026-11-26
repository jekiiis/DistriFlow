'use strict';

const paymentService = require('../services/paymentService');
const { success } = require('../helpers/response');

async function pay(req, res) {
  const result = await paymentService.processPayment(
    req.params.id,
    req.body || {},
    req.session.user.id
  );
  return success(res, result, 'Pembayaran berhasil diproses');
}

module.exports = { pay };
