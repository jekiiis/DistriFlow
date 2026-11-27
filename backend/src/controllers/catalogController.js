'use strict';

const { success } = require('../helpers/response');
const catalogService = require('../services/catalogService');

const CREATED = 201;

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

async function restock(req, res) {
  const result = await catalogService.getRestock();
  return success(res, result, 'Rekomendasi restock');
}

async function productDetail(req, res) {
  const result = await catalogService.getProduct(req.params.id);
  return success(res, { product: result }, 'Detail produk');
}

async function storeProduct(req, res) {
  const result = await catalogService.storeProduct(req.body || {});
  return success(res, { product: result }, 'Produk berhasil ditambahkan', CREATED);
}

async function updateProduct(req, res) {
  const result = await catalogService.updateProduct(req.params.id, req.body || {});
  return success(res, { product: result }, 'Produk berhasil diperbarui');
}

async function setProductActive(req, res) {
  const result = await catalogService.setProductActive(req.params.id, req.body || {});
  return success(res, { product: result }, 'Status produk berhasil diperbarui');
}

async function customerDetail(req, res) {
  const result = await catalogService.getCustomer(req.params.id);
  return success(res, { customer: result }, 'Detail pelanggan');
}

async function storeCustomer(req, res) {
  const result = await catalogService.storeCustomer(req.body || {});
  return success(res, { customer: result }, 'Pelanggan berhasil ditambahkan', CREATED);
}

async function updateCustomer(req, res) {
  const result = await catalogService.updateCustomer(req.params.id, req.body || {});
  return success(res, { customer: result }, 'Pelanggan berhasil diperbarui');
}

async function setCustomerActive(req, res) {
  const result = await catalogService.setCustomerActive(req.params.id, req.body || {});
  return success(res, { customer: result }, 'Status pelanggan berhasil diperbarui');
}

module.exports = {
  customers,
  customerCredit,
  products,
  productPrice,
  restock,
  productDetail,
  storeProduct,
  updateProduct,
  setProductActive,
  customerDetail,
  storeCustomer,
  updateCustomer,
  setCustomerActive
};
