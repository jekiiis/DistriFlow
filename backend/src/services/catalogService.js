'use strict';

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const customerModel = require('../models/customerModel');
const productModel = require('../models/productModel');

const LEVELS = ['RETAIL', 'GROSIR'];
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const MESSAGE = Object.freeze({
  CUSTOMER_NOT_FOUND: 'Pelanggan tidak ditemukan',
  PRODUCT_NOT_FOUND: 'Produk tidak ditemukan',
  CUSTOMER_ID_INVALID: 'ID pelanggan tidak valid',
  LEVEL_INVALID: 'Level harga tidak valid',
  QUANTITY_INVALID: 'Kuantitas harus bilangan bulat positif',
  DISCOUNT_INVALID: 'Nominal diskon tidak valid'
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

function parseCustomerId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.CUSTOMER_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function parseLevel(value) {
  const level = isBlank(value) ? 'RETAIL' : value;
  if (!LEVELS.includes(level)) {
    throw new AppError(MESSAGE.LEVEL_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return level;
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

module.exports = {
  LEVELS,
  MESSAGE,
  listCustomers,
  listProducts,
  getCustomerCredit,
  getProductPrice
};
