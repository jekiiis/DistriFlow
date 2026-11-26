'use strict';

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const { withTransaction } = require('../config/db');
const orderModel = require('../models/orderModel');

const MAX_ORDER_NO_ATTEMPTS = 3;
const WHOLESALE_LEVEL = 'GROSIR';

const MESSAGE = Object.freeze({
  ITEMS_REQUIRED: 'Minimal satu barang harus ditambahkan',
  CUSTOMER_ID_INVALID: 'ID pelanggan tidak valid',
  SESSION_EXPIRED: 'Sesi berakhir, silakan login kembali',
  CUSTOMER_NOT_FOUND: 'Pelanggan tidak ditemukan',
  PRODUCT_NOT_FOUND: 'Barang tidak ditemukan',
  CODE_REQUIRED: 'Kode barang wajib diisi',
  QUANTITY_INVALID: 'Jumlah tidak valid',
  DISCOUNT_INVALID: 'Diskon tidak valid',
  ORDER_NO_FAILED: 'Gagal membuat nomor sales order, silakan coba lagi'
});

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function toSafeInteger(value) {
  if (typeof value === 'boolean' || isBlank(value)) {
    return NaN;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : NaN;
}

function parseCustomerId(value) {
  const id = toSafeInteger(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.CUSTOMER_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function parseSessionUserId(value) {
  const id = toSafeInteger(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.SESSION_EXPIRED, HTTP_STATUS.UNAUTHORIZED);
  }
  return id;
}

function parseQuantity(value) {
  const qty = toSafeInteger(value);
  if (!Number.isSafeInteger(qty) || qty < 1) {
    throw new AppError(MESSAGE.QUANTITY_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return qty;
}

function parseDiscountCents(value) {
  let cents;

  try {
    cents = money.toCents(isBlank(value) ? '0' : value);
  } catch (error) {
    throw new AppError(MESSAGE.DISCOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }

  if (cents < 0) {
    throw new AppError(MESSAGE.DISCOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }

  return cents;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new AppError(MESSAGE.ITEMS_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }

  return items.map((item) => {
    const source = item || {};
    const code = isBlank(source.code) ? '' : String(source.code).trim();

    if (code === '') {
      throw new AppError(MESSAGE.CODE_REQUIRED, HTTP_STATUS.BAD_REQUEST);
    }

    return {
      code,
      qty: parseQuantity(source.qty),
      discountCents: parseDiscountCents(source.discount)
    };
  });
}

/** Kode sama digabung sebelum stok dan rentang diskon diperiksa. */
function mergeItems(items) {
  const merged = new Map();

  for (const item of items) {
    const current = merged.get(item.code) || { code: item.code, qty: 0, discountCents: 0 };
    current.qty += item.qty;
    current.discountCents = money.addCents(current.discountCents, item.discountCents);

    if (!Number.isSafeInteger(current.qty)) {
      throw new AppError(MESSAGE.QUANTITY_INVALID, HTTP_STATUS.BAD_REQUEST);
    }

    merged.set(item.code, current);
  }

  return Array.from(merged.values());
}

/**
 * Harga berasal dari products di database. Discard field harga dari client
 * sudah dilakukan validator; service tidak membacanya sama sekali.
 */
async function buildLines(mergedItems, customer, connection) {
  const useWholesale = customer.price_level === WHOLESALE_LEVEL;
  const lines = [];

  for (const item of mergedItems) {
    const product = await orderModel.findActiveProductByCode(item.code, connection);
    if (!product) {
      throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const priceRaw = useWholesale ? product.price_wholesale : product.price_retail;
    const unitPriceCents = money.toCents(priceRaw);
    const grossCents = money.multiplyCents(unitPriceCents, item.qty);
    const stock = Number(product.stock);

    if (item.qty > stock) {
      throw new AppError(`Stok tidak cukup, tersedia ${stock}`, HTTP_STATUS.CONFLICT);
    }

    if (item.discountCents > grossCents) {
      throw new AppError(MESSAGE.DISCOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
    }

    const lineTotalCents = money.subtractCents(grossCents, item.discountCents);
    lines.push({
      productId: Number(product.id),
      code: product.code,
      name: product.name,
      qty: item.qty,
      unitPrice: money.fromCents(unitPriceCents),
      discount: money.fromCents(item.discountCents),
      lineTotal: money.fromCents(lineTotalCents),
      grossCents,
      discountCents: item.discountCents,
      lineTotalCents
    });
  }

  return lines;
}

/** subtotal = bruto, discount = total diskon baris, total = bruto - diskon. */
function buildTotals(lines) {
  const subtotalCents = money.sumCents(lines.map((line) => line.grossCents));
  const discountCents = money.sumCents(lines.map((line) => line.discountCents));
  const totalCents = money.subtractCents(subtotalCents, discountCents);

  return {
    subtotal: money.fromCents(subtotalCents),
    discount: money.fromCents(discountCents),
    total: money.fromCents(totalCents)
  };
}

function parseSequence(orderNo, prefix) {
  if (typeof orderNo !== 'string' || !orderNo.startsWith(prefix)) {
    return 0;
  }

  const suffix = Number(orderNo.slice(prefix.length));
  return Number.isSafeInteger(suffix) && suffix >= 0 ? suffix : 0;
}

/** padStart hanya membantu untuk 1..999; 1000 tetap "1000". */
function nextOrderNo(orderDate, lastOrderNo) {
  const prefix = `SO-${orderDate}-`;
  const sequence = parseSequence(lastOrderNo, prefix) + 1;
  return prefix + String(sequence).padStart(3, '0');
}

function isDuplicateOrderNo(error) {
  return Boolean(error && error.code === 'ER_DUP_ENTRY');
}

async function persistOrder(prepared, userId) {
  return withTransaction(async (connection) => {
    const orderDate = await orderModel.getOrderDate(connection);
    if (!orderDate) {
      throw new AppError(MESSAGE.ORDER_NO_FAILED, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const customer = await orderModel.findActiveCustomerById(prepared.customerId, connection);
    if (!customer) {
      throw new AppError(MESSAGE.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const lines = await buildLines(mergeItems(prepared.items), customer, connection);
    const totals = buildTotals(lines);

    await orderModel.lockOrderNumberMutex(connection);
    const lastOrderNo = await orderModel.findLastOrderNo(orderDate, connection);
    const orderNo = nextOrderNo(orderDate, lastOrderNo);

    const orderId = await orderModel.insertHeader({
      orderNo,
      orderDate,
      customerId: prepared.customerId,
      userId,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total
    }, connection);

    const inserted = await orderModel.insertItems(orderId, lines.map((line) => ({
      productId: line.productId,
      qty: line.qty,
      unitPrice: line.unitPrice,
      discount: line.discount,
      lineTotal: line.lineTotal
    })), connection);

    if (Number(inserted) !== lines.length) {
      throw new Error('Jumlah item sales order tidak sesuai');
    }

    const order = await orderModel.findDetailById(orderId, connection);
    if (!order) {
      throw new Error('Sales order tidak ditemukan setelah disimpan');
    }

    return order;
  });
}

/**
 * Membuat sales order DRAFT. Seluruh percobaan memakai transaksi baru;
 * AppError generik dipakai bila UNIQUE(order_no) tetap bentrok.
 */
async function createOrder(input = {}, userId) {
  const payload = input || {};
  const sessionUserId = parseSessionUserId(userId);
  const customerId = parseCustomerId(payload.customer_id);
  const prepared = { customerId, items: normalizeItems(payload.items) };

  for (let attempt = 1; attempt <= MAX_ORDER_NO_ATTEMPTS; attempt += 1) {
    try {
      return await persistOrder(prepared, sessionUserId);
    } catch (error) {
      if (!isDuplicateOrderNo(error)) {
        throw error;
      }
      if (attempt < MAX_ORDER_NO_ATTEMPTS) {
        continue;
      }
      throw new AppError(MESSAGE.ORDER_NO_FAILED, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }
  }

  throw new AppError(MESSAGE.ORDER_NO_FAILED, HTTP_STATUS.INTERNAL_SERVER_ERROR);
}

const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;

function parsePagination(query = {}) {
  const page = toSafeInteger(query.page);
  const requestedLimit = toSafeInteger(query.limit);

  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT
  };
}

function parseOrderId(value) {
  const id = toSafeInteger(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('ID sales order tidak valid', HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function moneyField(value) {
  return money.fromCents(money.toCents(value));
}

function nullable(value) {
  return value === null || value === undefined || value === '' ? null : value;
}

function nullableId(value) {
  const clean = nullable(value);
  return clean === null ? null : Number(clean);
}

function toPublicItem(item) {
  return {
    id: Number(item.id),
    sales_order_id: Number(item.sales_order_id),
    product_id: Number(item.product_id),
    code: item.code,
    name: item.name,
    qty: Number(item.qty),
    unit_price: moneyField(item.unit_price),
    discount: moneyField(item.discount),
    line_total: moneyField(item.line_total)
  };
}

function toPublicPayment(payment) {
  return {
    id: Number(payment.id),
    user_id: Number(payment.user_id),
    paid_at: payment.paid_at,
    amount: moneyField(payment.amount),
    change_amount: moneyField(payment.change_amount),
    method: payment.method,
    note: nullable(payment.note)
  };
}

function toPublicOrder(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    order_no: row.order_no,
    order_date: row.order_date,
    customer_id: Number(row.customer_id),
    customer_code: nullable(row.customer_code),
    customer_name: nullable(row.customer_name),
    user_id: Number(row.user_id),
    user_name: nullable(row.user_name),
    subtotal: moneyField(row.subtotal),
    discount: moneyField(row.discount),
    total: moneyField(row.total),
    status: row.status,
    payment_type: nullable(row.payment_type),
    due_date: nullable(row.due_date),
    cancel_reason: nullable(row.cancel_reason),
    cancelled_by: nullableId(row.cancelled_by),
    cancelled_at: nullable(row.cancelled_at),
    created_at: nullable(row.created_at),
    items: (row.items || []).map(toPublicItem),
    payments: (row.payments || []).map(toPublicPayment)
  };
}

async function listOrders(query = {}, actor = {}) {
  const { page, limit } = parsePagination(query);
  const filters = {
    search: query.q === undefined || query.q === null ? '' : String(query.q).trim().slice(0, 100),
    status: query.status || '',
    dateFrom: query.date_from || query.dateFrom || '',
    dateTo: query.date_to || query.dateTo || '',
    limit,
    offset: (page - 1) * limit
  };

  if (actor && actor.role === 'SALES') {
    const salesId = parseSessionUserId(actor.id);
    filters.userId = salesId;
  }

  const [rows, total] = await Promise.all([
    orderModel.findMany(filters),
    orderModel.countAll(filters)
  ]);

  return {
    orders: rows.map(toPublicOrder),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getOrder(id, actor = {}) {
  const orderId = parseOrderId(id);
  const order = await orderModel.findDetailById(orderId);

  if (!order) {
    throw new AppError('Order tidak ditemukan', HTTP_STATUS.NOT_FOUND);
  }
  if (actor && actor.role === 'SALES' && Number(order.user_id) !== parseSessionUserId(actor.id)) {
    throw new AppError('Order tidak ditemukan', HTTP_STATUS.NOT_FOUND);
  }

  return toPublicOrder(order);
}

module.exports = {
  MESSAGE,
  MAX_ORDER_NO_ATTEMPTS,
  createOrder,
  listOrders,
  getOrder,
  toPublicOrder
};
