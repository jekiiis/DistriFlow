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

module.exports = { store, index, show };
