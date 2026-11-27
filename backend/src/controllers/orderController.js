'use strict';

const orderService = require('../services/orderService');
const { success } = require('../helpers/response');

async function store(req, res) {
  const order = await orderService.createOrder(req.body || {}, req.session.user.id);
  return success(res, { order }, 'Sales order berhasil dibuat', 201);
}

async function index(req, res) {
  const result = await orderService.listOrders(req.query || {}, req.session.user);
  return success(res, result, 'Daftar sales order');
}

async function show(req, res) {
  const order = await orderService.getOrder(req.params.id, req.session.user);
  return success(res, { order }, 'Detail sales order');
}

// FR-09: alasan dan identitas Admin berasal dari request yang sudah divalidasi.
async function cancel(req, res) {
  const order = await orderService.cancelOrder(req.params.id, req.body || {}, req.session.user.id);
  return success(res, { order }, 'Sales order berhasil dibatalkan');
}

module.exports = { store, index, show, cancel };
