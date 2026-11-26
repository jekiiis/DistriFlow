'use strict';

const { success } = require('../helpers/response');
const catalogService = require('../services/catalogService');

async function customers(req, res) {
  const result = await catalogService.listCustomers(req.query || {});
  return success(res, result, 'Daftar pelanggan');
}

async function customerCredit(req, res) {
  const result = await catalogService.getCustomerCredit(req.params.id);
  return success(res, result, 'Detail kredit pelanggan');
}

async function products(req, res) {
  const result = await catalogService.listProducts(req.query || {});
  return success(res, result, 'Daftar produk');
}

async function productPrice(req, res) {
  const result = await catalogService.getProductPrice(req.params.code, req.query || {});
  return success(res, result, 'Harga produk');
}

module.exports = { customers, customerCredit, products, productPrice };
