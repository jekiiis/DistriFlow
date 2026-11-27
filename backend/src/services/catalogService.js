'use strict';

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const customerModel = require('../models/customerModel');
const productModel = require('../models/productModel');
const restockService = require('./restockService');

const LEVELS = ['RETAIL', 'GROSIR'];
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const MESSAGE = Object.freeze({
  CUSTOMER_NOT_FOUND: 'Pelanggan tidak ditemukan',
  PRODUCT_NOT_FOUND: 'Produk tidak ditemukan',
  CUSTOMER_ID_INVALID: 'ID pelanggan tidak valid',
  PRODUCT_ID_INVALID: 'ID produk tidak valid',
  LEVEL_INVALID: 'Level harga tidak valid',
  QUANTITY_INVALID: 'Kuantitas harus bilangan bulat positif',
  DISCOUNT_INVALID: 'Nominal diskon tidak valid',
  CODE_PRODUCT_REQUIRED: 'Kode produk wajib diisi',
  CODE_PRODUCT_LONG: 'Kode produk maksimal 20 karakter',
  NAME_PRODUCT_REQUIRED: 'Nama produk wajib diisi',
  NAME_PRODUCT_LONG: 'Nama produk maksimal 100 karakter',
  UNIT_REQUIRED: 'Unit wajib diisi',
  UNIT_LONG: 'Unit maksimal 20 karakter',
  PRICE_RETAIL_INVALID: 'Harga retail harus lebih dari 0 dengan maksimal 2 desimal',
  PRICE_WHOLESALE_INVALID: 'Harga grosir harus lebih dari 0 dengan maksimal 2 desimal',
  MIN_STOCK_INVALID: 'Stok minimum harus bilangan bulat non-negatif',
  STOCK_FORBIDDEN: 'Stok tidak dapat diubah pada master produk',
  DUPLICATE_PRODUCT_CODE: 'Kode produk sudah terdaftar',
  CODE_CUSTOMER_REQUIRED: 'Kode pelanggan wajib diisi',
  CODE_CUSTOMER_LONG: 'Kode pelanggan maksimal 20 karakter',
  NAME_CUSTOMER_REQUIRED: 'Nama pelanggan wajib diisi',
  NAME_CUSTOMER_LONG: 'Nama pelanggan maksimal 100 karakter',
  ADDRESS_LONG: 'Alamat maksimal 255 karakter',
  PHONE_LONG: 'Nomor telepon maksimal 20 karakter',
  CREDIT_LIMIT_INVALID: 'Limit kredit tidak valid',
  PAYMENT_TERM_INVALID: 'Jangka waktu pembayaran tidak valid',
  DUPLICATE_CUSTOMER_CODE: 'Kode pelanggan sudah terdaftar',
  STATUS_INVALID: 'Status harus boolean',
  NO_FIELDS: 'Tidak ada field yang dapat diperbarui'
});

function parsePagination(query = {}) {
  const page = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_LIMIT)
      : DEFAULT_LIMIT
  };
}

function parseSearch(value) {
  if (value === undefined || value === null) {
    return '';
  }
  return String(value).trim().slice(0, 100);
}

function toPublicCustomer(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    address: row.address,
    phone: row.phone,
    price_level: row.price_level,
    credit_limit: money.fromCents(money.toCents(row.credit_limit)),
    payment_term_days: Number(row.payment_term_days)
  };
}

function toAdminCustomer(row) {
  return Object.assign({}, toPublicCustomer(row), {
    is_active: Boolean(row.is_active)
  });
}

function toPublicProduct(row) {
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    unit: row.unit,
    price_retail: money.fromCents(money.toCents(row.price_retail)),
    price_wholesale: money.fromCents(money.toCents(row.price_wholesale)),
    stock: Number(row.stock),
    min_stock: Number(row.min_stock)
  };
}

function toAdminProduct(row) {
  return Object.assign({}, toPublicProduct(row), {
    is_active: Boolean(row.is_active)
  });
}

function parseCustomerId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.CUSTOMER_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function parseProductId(value) {
  const id = Number(value);
  if (typeof value === 'boolean' || !Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.PRODUCT_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function requiredText(value, max, requiredMessage, longMessage) {
  const text = isBlank(value) ? '' : String(value).trim();
  if (text === '') {
    throw new AppError(requiredMessage, HTTP_STATUS.BAD_REQUEST);
  }
  if (text.length > max) {
    throw new AppError(longMessage, HTTP_STATUS.BAD_REQUEST);
  }
  return text;
}

function optionalText(value, max, longMessage) {
  if (isBlank(value)) {
    return null;
  }
  const text = String(value).trim();
  if (text.length > max) {
    throw new AppError(longMessage, HTTP_STATUS.BAD_REQUEST);
  }
  return text === '' ? null : text;
}

function parseLevel(value) {
  const level = isBlank(value) ? 'RETAIL' : value;
  if (!LEVELS.includes(level)) {
    throw new AppError(MESSAGE.LEVEL_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return level;
}

function parsePositiveMoney(value, message) {
  let cents;
  try {
    cents = money.toCents(value);
  } catch (error) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }
  if (cents <= 0) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }
  return money.fromCents(cents);
}

function parseNonNegativeMoney(value, message, fallback) {
  let cents;
  try {
    cents = money.toCents(isBlank(value) ? fallback : value);
  } catch (error) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }
  if (cents < 0) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }
  return money.fromCents(cents);
}

function parseNonNegativeInt(value, message, fallback) {
  const clean = isBlank(value) ? fallback : value;
  const parsed = typeof clean === 'boolean' ? NaN : Number(clean);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }
  return parsed;
}

function parseBoolean(value) {
  if (typeof value !== 'boolean') {
    throw new AppError(MESSAGE.STATUS_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return value;
}

function isDuplicateCode(error) {
  return Boolean(error && error.code === 'ER_DUP_ENTRY');
}

/**
 * Model mengekspor nama generik (create/update) sekaligus alias bergaya
 * repository (insertProduct/updateProduct). Pilih salah satu yang tersedia
 * agar service tetap bisa dipakai dengan model asli maupun mock.
 */
function modelMethod(model, name, alias) {
  const fn = typeof model[name] === 'function' ? model[name] : model[alias];
  if (typeof fn !== 'function') {
    throw new Error(`${name} tidak tersedia pada model`);
  }
  return fn;
}

function normalizeProductCreate(input = {}) {
  const payload = input || {};
  if (payload.stock !== undefined) {
    throw new AppError(MESSAGE.STOCK_FORBIDDEN, HTTP_STATUS.BAD_REQUEST);
  }

  return {
    code: requiredText(payload.code, 20, MESSAGE.CODE_PRODUCT_REQUIRED, MESSAGE.CODE_PRODUCT_LONG),
    name: requiredText(payload.name, 100, MESSAGE.NAME_PRODUCT_REQUIRED, MESSAGE.NAME_PRODUCT_LONG),
    unit: requiredText(payload.unit, 20, MESSAGE.UNIT_REQUIRED, MESSAGE.UNIT_LONG),
    price_retail: parsePositiveMoney(payload.price_retail, MESSAGE.PRICE_RETAIL_INVALID),
    price_wholesale: parsePositiveMoney(payload.price_wholesale, MESSAGE.PRICE_WHOLESALE_INVALID),
    min_stock: parseNonNegativeInt(payload.min_stock, MESSAGE.MIN_STOCK_INVALID, 0)
  };
}

function normalizeProductUpdate(input = {}) {
  const payload = input || {};
  if (payload.stock !== undefined) {
    throw new AppError(MESSAGE.STOCK_FORBIDDEN, HTTP_STATUS.BAD_REQUEST);
  }

  const fields = {};
  if (payload.code !== undefined) {
    fields.code = requiredText(payload.code, 20, MESSAGE.CODE_PRODUCT_REQUIRED, MESSAGE.CODE_PRODUCT_LONG);
  }
  if (payload.name !== undefined) {
    fields.name = requiredText(payload.name, 100, MESSAGE.NAME_PRODUCT_REQUIRED, MESSAGE.NAME_PRODUCT_LONG);
  }
  if (payload.unit !== undefined) {
    fields.unit = requiredText(payload.unit, 20, MESSAGE.UNIT_REQUIRED, MESSAGE.UNIT_LONG);
  }
  if (payload.price_retail !== undefined) {
    fields.price_retail = parsePositiveMoney(payload.price_retail, MESSAGE.PRICE_RETAIL_INVALID);
  }
  if (payload.price_wholesale !== undefined) {
    fields.price_wholesale = parsePositiveMoney(payload.price_wholesale, MESSAGE.PRICE_WHOLESALE_INVALID);
  }
  if (payload.min_stock !== undefined) {
    fields.min_stock = parseNonNegativeInt(payload.min_stock, MESSAGE.MIN_STOCK_INVALID, 0);
  }
  // is_active sengaja diabaikan di sini: status hanya diubah lewat PATCH.

  if (Object.keys(fields).length === 0) {
    throw new AppError(MESSAGE.NO_FIELDS, HTTP_STATUS.BAD_REQUEST);
  }
  return fields;
}

function normalizeCustomerCreate(input = {}) {
  const payload = input || {};

  return {
    code: requiredText(payload.code, 20, MESSAGE.CODE_CUSTOMER_REQUIRED, MESSAGE.CODE_CUSTOMER_LONG),
    name: requiredText(payload.name, 100, MESSAGE.NAME_CUSTOMER_REQUIRED, MESSAGE.NAME_CUSTOMER_LONG),
    address: optionalText(payload.address, 255, MESSAGE.ADDRESS_LONG),
    phone: optionalText(payload.phone, 20, MESSAGE.PHONE_LONG),
    price_level: parseLevel(payload.price_level),
    credit_limit: parseNonNegativeMoney(payload.credit_limit, MESSAGE.CREDIT_LIMIT_INVALID, '0.00'),
    payment_term_days: parseNonNegativeInt(payload.payment_term_days, MESSAGE.PAYMENT_TERM_INVALID, 0)
  };
}

function normalizeCustomerUpdate(input = {}) {
  const payload = input || {};
  const fields = {};

  if (payload.code !== undefined) {
    fields.code = requiredText(payload.code, 20, MESSAGE.CODE_CUSTOMER_REQUIRED, MESSAGE.CODE_CUSTOMER_LONG);
  }
  if (payload.name !== undefined) {
    fields.name = requiredText(payload.name, 100, MESSAGE.NAME_CUSTOMER_REQUIRED, MESSAGE.NAME_CUSTOMER_LONG);
  }
  if (payload.address !== undefined) {
    fields.address = optionalText(payload.address, 255, MESSAGE.ADDRESS_LONG);
  }
  if (payload.phone !== undefined) {
    fields.phone = optionalText(payload.phone, 20, MESSAGE.PHONE_LONG);
  }
  if (payload.price_level !== undefined) {
    fields.price_level = parseLevel(payload.price_level);
  }
  if (payload.credit_limit !== undefined) {
    fields.credit_limit = parseNonNegativeMoney(payload.credit_limit, MESSAGE.CREDIT_LIMIT_INVALID, '0.00');
  }
  if (payload.payment_term_days !== undefined) {
    fields.payment_term_days = parseNonNegativeInt(payload.payment_term_days, MESSAGE.PAYMENT_TERM_INVALID, 0);
  }
  // is_active sengaja diabaikan di sini: status hanya diubah lewat PATCH.

  if (Object.keys(fields).length === 0) {
    throw new AppError(MESSAGE.NO_FIELDS, HTTP_STATUS.BAD_REQUEST);
  }
  return fields;
}

function parseQuantity(value) {
  const qty = Number.parseInt(isBlank(value) ? '1' : value, 10);
  if (!Number.isSafeInteger(qty) || qty < 1) {
    throw new AppError(MESSAGE.QUANTITY_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return qty;
}

function parseDiscount(value) {
  const cents = money.toCents(isBlank(value) ? '0' : value);
  if (cents < 0) {
    throw new AppError(MESSAGE.DISCOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return cents;
}

function parsePriceQuery(options = {}) {
  return {
    level: parseLevel(options.level),
    qty: parseQuantity(options.qty),
    discountCents: parseDiscount(options.discount)
  };
}

async function listCustomers(query = {}) {
  const { page, limit } = parsePagination(query);
  const filters = {
    search: parseSearch(query.search),
    limit,
    offset: (page - 1) * limit
  };

  const [rows, total] = await Promise.all([
    customerModel.findMany(filters),
    customerModel.countAll(filters)
  ]);

  return {
    customers: rows.map(toPublicCustomer),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function listProducts(query = {}) {
  const { page, limit } = parsePagination(query);
  const filters = {
    search: parseSearch(query.search),
    limit,
    offset: (page - 1) * limit
  };

  const [rows, total] = await Promise.all([
    productModel.findMany(filters),
    productModel.countAll(filters)
  ]);

  return {
    products: rows.map(toPublicProduct),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getCustomerCredit(id) {
  const customerId = parseCustomerId(id);
  const customer = await customerModel.findActiveById(customerId);

  if (!customer) {
    throw new AppError(MESSAGE.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  const outstandingRaw = await customerModel.sumOutstanding(customerId);
  const limitCents = money.toCents(customer.credit_limit);
  const outstandingCents = money.toCents(outstandingRaw);
  const remainingCents = limitCents > 0
    ? Math.max(0, limitCents - outstandingCents)
    : 0;

  // FR-22 (risk_score/risk_label) sengaja tidak disertakan: ditunda ke Sprint 3.
  return {
    id: customerId,
    code: customer.code,
    name: customer.name,
    price_level: customer.price_level,
    credit_limit: money.fromCents(limitCents),
    outstanding: money.fromCents(outstandingCents),
    remaining_limit: money.fromCents(remainingCents)
  };
}

async function getProductPrice(code, options = {}) {
  const product = await productModel.findActiveByCode(String(code).trim());

  if (!product) {
    throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  const { level, qty, discountCents } = parsePriceQuery(options);
  const priceRaw = level === 'GROSIR' ? product.price_wholesale : product.price_retail;
  const unitPriceCents = money.toCents(priceRaw);
  const subtotalCents = money.multiplyCents(unitPriceCents, qty);
  const lineTotalCents = money.subtractCents(subtotalCents, discountCents);

  return {
    id: Number(product.id),
    code: product.code,
    name: product.name,
    unit: product.unit,
    price_level: level,
    unit_price: money.fromCents(unitPriceCents),
    qty,
    subtotal: money.fromCents(subtotalCents),
    discount: money.fromCents(discountCents),
    line_total: money.fromCents(lineTotalCents),
    stock: Number(product.stock)
  };
}

async function getProduct(id) {
  const productId = parseProductId(id);
  const product = await productModel.findById(productId);

  if (!product) {
    throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  return toAdminProduct(product);
}

function toInsertId(result) {
  if (result && typeof result === 'object' && result.insertId !== undefined) {
    return Number(result.insertId);
  }
  return result;
}

async function storeProduct(input = {}) {
  const fields = normalizeProductCreate(input);
  let id;

  try {
    id = toInsertId(await modelMethod(productModel, 'create', 'insertProduct').call(productModel, fields));
  } catch (error) {
    if (isDuplicateCode(error)) {
      throw new AppError(MESSAGE.DUPLICATE_PRODUCT_CODE, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }

  const product = await productModel.findById(id);
  if (!product) {
    throw new Error('Produk tidak ditemukan setelah disimpan');
  }
  return toAdminProduct(product);
}

async function updateProduct(id, input = {}) {
  const productId = parseProductId(id);
  const fields = normalizeProductUpdate(input);

  try {
    await modelMethod(productModel, 'update', 'updateProduct').call(productModel, productId, fields);
  } catch (error) {
    if (isDuplicateCode(error)) {
      throw new AppError(MESSAGE.DUPLICATE_PRODUCT_CODE, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }

  const product = await productModel.findById(productId);
  if (!product) {
    throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  return toAdminProduct(product);
}

async function setProductActive(id, input = {}) {
  const productId = parseProductId(id);
  const isActive = parseBoolean((input || {}).is_active);

  await productModel.setActive(productId, isActive);
  const product = await productModel.findById(productId);
  if (!product) {
    throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  return toAdminProduct(product);
}

async function getRestock() {
  return restockService.getRestock();
}

async function getCustomer(id) {
  const customerId = parseCustomerId(id);
  const customer = await customerModel.findById(customerId);

  if (!customer) {
    throw new AppError(MESSAGE.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  return toAdminCustomer(customer);
}

async function storeCustomer(input = {}) {
  const fields = normalizeCustomerCreate(input);
  let id;

  try {
    id = toInsertId(await modelMethod(customerModel, 'create', 'insertCustomer').call(customerModel, fields));
  } catch (error) {
    if (isDuplicateCode(error)) {
      throw new AppError(MESSAGE.DUPLICATE_CUSTOMER_CODE, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }

  const customer = await customerModel.findById(id);
  if (!customer) {
    throw new Error('Pelanggan tidak ditemukan setelah disimpan');
  }
  return toAdminCustomer(customer);
}

async function updateCustomer(id, input = {}) {
  const customerId = parseCustomerId(id);
  const fields = normalizeCustomerUpdate(input);

  try {
    await modelMethod(customerModel, 'update', 'updateCustomer').call(customerModel, customerId, fields);
  } catch (error) {
    if (isDuplicateCode(error)) {
      throw new AppError(MESSAGE.DUPLICATE_CUSTOMER_CODE, HTTP_STATUS.CONFLICT);
    }
    throw error;
  }

  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw new AppError(MESSAGE.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  return toAdminCustomer(customer);
}

async function setCustomerActive(id, input = {}) {
  const customerId = parseCustomerId(id);
  const isActive = parseBoolean((input || {}).is_active);

  await customerModel.setActive(customerId, isActive);
  const customer = await customerModel.findById(customerId);
  if (!customer) {
    throw new AppError(MESSAGE.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  return toAdminCustomer(customer);
}

module.exports = {
  LEVELS,
  MESSAGE,
  listCustomers,
  listProducts,
  getCustomerCredit,
  getProductPrice,
  getRestock,
  getProduct,
  storeProduct,
  updateProduct,
  setProductActive,
  getCustomer,
  storeCustomer,
  updateCustomer,
  setCustomerActive
};
