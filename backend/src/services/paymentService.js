'use strict';

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const { withTransaction } = require('../config/db');
const orderModel = require('../models/orderModel');
const paymentModel = require('../models/paymentModel');
const customerModel = require('../models/customerModel');
const { toPublicOrder } = require('./orderService');

const PAYMENT_TYPES = ['TUNAI', 'KREDIT'];
const METHODS = ['TUNAI', 'TRANSFER'];

const MESSAGE = Object.freeze({
  ORDER_ID_INVALID: 'ID sales order tidak valid',
  ORDER_NOT_FOUND: 'Order tidak ditemukan',
  ALREADY_PROCESSED: 'Order sudah diproses',
  AMOUNT_INVALID: 'Nominal tidak valid',
  TRANSFER_TOO_LARGE: 'Transfer tidak boleh melebihi total',
  CASH_SHORT: 'Nominal kurang Rp{selisih}',
  CREDIT_LIMIT: 'Melebihi limit kredit',
  STOCK_SHORT: 'Stok tidak cukup, tersedia {n}',
  PRODUCT_NOT_FOUND: 'Barang tidak ditemukan',
  CUSTOMER_NOT_FOUND: 'Pelanggan tidak ditemukan',
  PAYMENT_TYPE_INVALID: 'Jenis pembayaran tidak valid',
  METHOD_INVALID: 'Metode pembayaran tidak valid',
  SESSION_EXPIRED: 'Sesi berakhir, silakan login kembali'
});

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function parseId(value) {
  if (isBlank(value)) {
    throw new AppError(MESSAGE.ORDER_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.ORDER_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function parseEnum(value, allowed, message) {
  const clean = isBlank(value) ? '' : String(value).toUpperCase();
  if (!allowed.includes(clean)) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }
  return clean;
}

function parseNominal(value) {
  if (isBlank(value)) {
    throw new AppError(MESSAGE.AMOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }

  let cents;
  try {
    cents = money.toCents(value);
  } catch (error) {
    throw new AppError(MESSAGE.AMOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  if (cents < 0) {
    throw new AppError(MESSAGE.AMOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return cents;
}

/** d2 dan d3 ditegakkan sebelum transaksi dibuka. */
function validateMatrix(nominalCents, paymentType, method, totalCents) {
  if (paymentType === 'TUNAI' && nominalCents === 0) {
    throw new AppError(MESSAGE.AMOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  if (method === 'TRANSFER' && nominalCents > totalCents) {
    throw new AppError(MESSAGE.TRANSFER_TOO_LARGE, HTTP_STATUS.BAD_REQUEST);
  }
}

/** d4, d5, dan d6 menghasilkan status akhir beserta uang turunannya. */
function resolveOutcome(nominalCents, totalCents, paymentType, customer, outstandingCents) {
  if (nominalCents >= totalCents) {
    return {
      status: 'LUNAS',
      changeCents: money.subtractCents(nominalCents, totalCents),
      remainingCents: 0,
      dueDateDays: null
    };
  }

  if (paymentType === 'TUNAI') {
    const shortCents = money.subtractCents(totalCents, nominalCents);
    const shortText = money.fromCents(shortCents).replace(/\.00$/, '');
    throw new AppError(
      MESSAGE.CASH_SHORT.replace('{selisih}', shortText),
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const remainingCents = money.subtractCents(totalCents, nominalCents);
  const limitCents = money.toCents(isBlank(customer.credit_limit) ? '0' : customer.credit_limit);
  const projectedCents = money.addCents(outstandingCents, remainingCents);

  // limit 0 berarti kredit tidak aktif; sisa tagihan tidak boleh timbul.
  if (limitCents <= 0 || projectedCents > limitCents) {
    throw new AppError(MESSAGE.CREDIT_LIMIT, HTTP_STATUS.CONFLICT);
  }

  const term = Number(customer.payment_term_days);
  return {
    status: 'PIUTANG',
    changeCents: 0,
    remainingCents,
    dueDateDays: Number.isSafeInteger(term) && term >= 0 ? term : 0
  };
}

function mergeItemsByProduct(items) {
  const merged = new Map();

  for (const item of items) {
    const productId = Number(item.product_id);
    const qty = Number(item.qty);
    const current = merged.get(productId) || 0;
    merged.set(productId, current + qty);
  }

  return Array.from(merged.entries())
    .map(([productId, qty]) => ({ productId, qty }))
    .sort((a, b) => a.productId - b.productId);
}

/** d7: lock, cek ulang stok, UPDATE bersyarat, dan movement KELUAR sekali. */
async function applyStockChanges(connection, order, items, userId) {
  for (const item of mergeItemsByProduct(items)) {
    const product = await paymentModel.lockProductById(item.productId, connection);
    if (!product) {
      throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    if (item.qty > Number(product.stock)) {
      throw new AppError(
        MESSAGE.STOCK_SHORT.replace('{n}', String(product.stock)),
        HTTP_STATUS.CONFLICT
      );
    }

    const affected = await paymentModel.decrementStock(connection, item.productId, item.qty);
    if (affected !== 1) {
      throw new AppError(
        MESSAGE.STOCK_SHORT.replace('{n}', String(product.stock)),
        HTTP_STATUS.CONFLICT
      );
    }

    const exists = await paymentModel.hasOutMovement(connection, item.productId, order.order_no);
    if (!exists) {
      await paymentModel.insertMovement(connection, {
        productId: item.productId,
        userId,
        qty: item.qty,
        reference: order.order_no
      });
    }
  }
}

async function payInTransaction(orderId, input, userId) {
  return withTransaction(async (connection) => {
    const order = await orderModel.lockForUpdate(orderId, connection);
    if (!order) {
      throw new AppError(MESSAGE.ORDER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    if (order.status !== 'DRAFT') {
      throw new AppError(MESSAGE.ALREADY_PROCESSED, HTTP_STATUS.CONFLICT);
    }

    const totalCents = money.toCents(order.total);
    const nominalCents = parseNominal(input.nominal);
    validateMatrix(nominalCents, input.payment_type, input.method, totalCents);

    const customer = await paymentModel.lockCustomerById(order.customer_id, connection);
    if (!customer) {
      throw new AppError(MESSAGE.CUSTOMER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    const outstandingRaw = await customerModel.sumOutstanding(order.customer_id, connection);
    const outcome = resolveOutcome(
      nominalCents,
      totalCents,
      input.payment_type,
      customer,
      money.toCents(outstandingRaw)
    );

    const items = await orderModel.findItemsByOrderId(orderId, connection);
    await applyStockChanges(connection, order, items, userId);

    let paymentId = null;
    if (nominalCents > 0) {
      paymentId = await paymentModel.insertPayment(connection, {
        orderId,
        userId,
        amount: money.fromCents(nominalCents),
        changeAmount: money.fromCents(outcome.changeCents),
        method: input.method,
        note: isBlank(input.note) ? null : String(input.note).trim().slice(0, 255)
      });
    }

    const affected = await paymentModel.updateOrderAfterPayment(connection, orderId, {
      status: outcome.status,
      paymentType: input.payment_type,
      dueDateDays: outcome.dueDateDays
    });
    if (affected !== 1) {
      throw new AppError(MESSAGE.ALREADY_PROCESSED, HTTP_STATUS.CONFLICT);
    }

    const detail = await orderModel.findDetailById(orderId, connection);
    const payment = paymentId === null
      ? null
      : detail.payments.find((row) => Number(row.id) === paymentId) || null;

    return {
      order: toPublicOrder(detail),
      payment
    };
  });
}

function parseCashierId(value) {
  if (isBlank(value)) {
    throw new AppError(MESSAGE.SESSION_EXPIRED, HTTP_STATUS.UNAUTHORIZED);
  }
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.SESSION_EXPIRED, HTTP_STATUS.UNAUTHORIZED);
  }
  return id;
}

async function processPayment(id, input = {}, userId) {
  const payload = input || {};
  const orderId = parseId(id);
  const cashierId = parseCashierId(userId);

  const paymentType = parseEnum(payload.payment_type, PAYMENT_TYPES, MESSAGE.PAYMENT_TYPE_INVALID);
  const method = parseEnum(payload.method, METHODS, MESSAGE.METHOD_INVALID);
  const normalized = {
    payment_type: paymentType,
    method,
    nominal: payload.nominal,
    note: payload.note
  };

  return payInTransaction(orderId, normalized, cashierId);
}

module.exports = { MESSAGE, processPayment, resolveOutcome, validateMatrix };
