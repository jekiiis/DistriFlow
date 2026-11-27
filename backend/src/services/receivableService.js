'use strict';

const crypto = require('crypto');

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const { withTransaction } = require('../config/db');
const receivableModel = require('../models/receivableModel');

const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;
const DEFAULT_STATUS = 'PIUTANG';
const METHODS = ['TUNAI', 'TRANSFER'];
const ORDER_STATUSES = ['DRAFT', 'LUNAS', 'PIUTANG', 'BATAL'];
const MAX_REFERENCE = 100;
const MAX_NOTE = 255;

const MESSAGE = Object.freeze({
  ID_INVALID: 'ID piutang tidak valid',
  NOT_FOUND: 'Piutang tidak ditemukan',
  AMOUNT_INVALID: 'Nominal tidak valid',
  OVERPAYMENT: 'Nominal melebihi sisa piutang',
  METHOD_INVALID: 'Metode pembayaran tidak valid',
  REFERENCE_INVALID: 'Referensi maksimal 100 karakter',
  NOTE_INVALID: 'Catatan maksimal 255 karakter',
  SESSION_EXPIRED: 'Sesi berakhir, silakan login kembali',
  ALREADY_SETTLED: 'Piutang sudah diselesaikan',
  DUPLICATE: 'Pembayaran sudah tercatat sebelumnya',
  IDEMPOTENCY_CONFLICT: 'Referensi pembayaran sudah dipakai untuk nominal atau metode berbeda'
});

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function parseCashierId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.SESSION_EXPIRED, HTTP_STATUS.UNAUTHORIZED);
  }
  return id;
}

function parsePagination(query = {}) {
  const page = Number(query.page);
  const requestedLimit = Number(query.limit);

  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    limit: Number.isSafeInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, MAX_PAGE_LIMIT)
      : DEFAULT_PAGE_LIMIT
  };
}

function moneyField(value) {
  return money.fromCents(money.toCents(value));
}

function nullable(value) {
  return value === null || value === undefined || value === '' ? null : value;
}

/**
 * FR-22: ambang 80% hanya aktif bila limit kredit lebih dari nol.
 * Perbandingan memakai BigInt agar tidak ada pembulatan desimal.
 */
function riskLabel(creditLimit, customerOutstanding) {
  const limitCents = money.toCents(isBlank(creditLimit) ? '0' : creditLimit);
  const outstandingCents = money.toCents(isBlank(customerOutstanding) ? '0' : customerOutstanding);

  if (limitCents <= 0) {
    return 'Aman';
  }

  return BigInt(outstandingCents) * 5n >= BigInt(limitCents) * 4n ? 'Berisiko' : 'Aman';
}

function toPublicPayment(row) {
  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    sales_order_id: Number(row.sales_order_id),
    user_id: Number(row.user_id),
    paid_at: nullable(row.paid_at),
    amount: moneyField(row.amount),
    change_amount: moneyField(row.change_amount),
    method: row.method,
    note: nullable(row.note)
  };
}

function toPublicReceivable(row, payments = null, includeCredit = false) {
  if (!row) {
    return null;
  }

  const result = {
    id: Number(row.id),
    order_no: row.order_no,
    order_date: nullable(row.order_date),
    customer_id: Number(row.customer_id),
    customer_code: nullable(row.customer_code),
    customer_name: nullable(row.customer_name),
    total: moneyField(row.total),
    paid: moneyField(row.paid),
    outstanding: moneyField(row.outstanding),
    due_date: nullable(row.due_date),
    status: row.status,
    risk: riskLabel(row.credit_limit, row.customer_outstanding),
    payment_count: Number(row.payment_count || 0)
  };

  if (includeCredit) {
    result.payments = (payments || []).map(toPublicPayment);
    result.credit_limit = moneyField(isBlank(row.credit_limit) ? '0' : row.credit_limit);
    result.customer_outstanding = moneyField(
      isBlank(row.customer_outstanding) ? '0' : row.customer_outstanding
    );
  }

  return result;
}

/** Teks dari client dinormalisasi agar JSON tidak menyisipkan kontrol/baris baru. */
function normalizeText(value, maxLength, message) {
  if (isBlank(value)) {
    return '';
  }

  const text = Array.from(String(value))
    .filter((character) => {
      const code = character.codePointAt(0);
      return code >= 32 && code !== 127;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > maxLength) {
    throw new AppError(message, HTTP_STATUS.BAD_REQUEST);
  }

  return text;
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

  if (cents < 1) {
    throw new AppError(MESSAGE.AMOUNT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }

  return cents;
}

function parseMethod(value) {
  const method = isBlank(value) ? '' : String(value).toUpperCase();
  if (!METHODS.includes(method)) {
    throw new AppError(MESSAGE.METHOD_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return method;
}

function digest(...parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest();
}

function hashParts(parts) {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest();
}

function sameDigest(stored, expected) {
  if (!stored) {
    return false;
  }

  let actual = stored;
  if (!Buffer.isBuffer(actual)) {
    actual = Buffer.from(String(actual), 'hex');
  }

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function isDuplicateEntry(error) {
  return Boolean(error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062));
}

/**
 * Identitas pembayaran FR-18.
 *
 * - `note` tetap memakai awalan REF:<kunci>| seperti implementasi lama agar
 *   respons API, PDF, dan data historis tetap kompatibel.
 * - `keyBuffer` adalah kunci biner baru yang disimpan di kolom
 *   payments.idempotency_key dan dilindungi UNIQUE per (sales_order, key).
 * - `requestHash` membedakan retry identik dari penyalahgunaan kunci yang sama
 *   dengan nominal/metode berbeda.
 */
function buildPaymentIdentity(reference, note, orderId, amountCents, method, userId) {
  const amount = money.fromCents(amountCents);
  const autoDigest = digest(orderId, amount, method, note, userId).toString('hex');
  const noteKey = reference !== '' ? reference : 'AUTO-' + autoDigest.slice(0, 16);
  const prefix = 'REF:' + noteKey + '|';
  const stored = (prefix + note).slice(0, MAX_NOTE);

  const key = reference !== '' ? 'REF:' + reference : 'AUTO:' + autoDigest;
  const keyBuffer = Buffer.from(key, 'utf8');
  if (keyBuffer.length > 512) {
    throw new AppError(MESSAGE.REFERENCE_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  const requestHash = hashParts([orderId, key, amount, method, userId]);

  return { stored, prefix, keyBuffer, requestHash };
}

async function listReceivables(query = {}) {
  const { page, limit } = parsePagination(query);
  const status = isBlank(query.status) ? DEFAULT_STATUS : String(query.status);
  const filters = {
    search: isBlank(query.search)
      ? (isBlank(query.q) ? '' : String(query.q).trim().slice(0, 100))
      : String(query.search).trim().slice(0, 100),
    dateFrom: query.date_from || query.dateFrom || '',
    dateTo: query.date_to || query.dateTo || '',
    status: ORDER_STATUSES.includes(status) ? status : DEFAULT_STATUS,
    limit,
    offset: (page - 1) * limit
  };

  const [rows, total] = await Promise.all([
    receivableModel.findMany(filters),
    receivableModel.countAll(filters)
  ]);

  return {
    receivables: rows.map((row) => toPublicReceivable(row)),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

async function getReceivable(id) {
  const receivableId = parseId(id);
  const row = await receivableModel.findById(receivableId);

  if (!row || row.status !== DEFAULT_STATUS) {
    throw new AppError(MESSAGE.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }

  const payments = await receivableModel.findPaymentsByOrderId(receivableId);
  return toPublicReceivable(row, payments, true);
}

function assertMatchingRequest(payment, identity) {
  if (payment.request_hash && !sameDigest(payment.request_hash, identity.requestHash)) {
    throw new AppError(MESSAGE.IDEMPOTENCY_CONFLICT, HTTP_STATUS.CONFLICT);
  }
}

async function findExistingPayment(connection, input) {
  const keyed = await receivableModel.findPaymentByKey(connection, {
    orderId: input.orderId,
    key: input.identity.keyBuffer
  });
  if (keyed) {
    assertMatchingRequest(keyed, input.identity);
    return keyed;
  }

  // Baris lama sebelum migrasi tidak punya kunci; pertahankan perilaku
  // 60 detik hanya untuk baris tersebut.
  return receivableModel.findRecentPayment(connection, {
    orderId: input.orderId,
    amount: money.fromCents(input.amountCents),
    changeAmount: '0.00',
    method: input.method,
    prefix: input.identity.prefix
  });
}

async function insertPaymentOnce(connection, input) {
  try {
    const paymentId = await receivableModel.insertPayment(connection, {
      orderId: input.orderId,
      userId: input.cashierId,
      amount: money.fromCents(input.amountCents),
      changeAmount: '0.00',
      method: input.method,
      note: input.identity.stored,
      idempotencyKey: input.identity.keyBuffer,
      requestHash: input.identity.requestHash
    });
    return { paymentId };
  } catch (error) {
    if (!isDuplicateEntry(error)) {
      throw error;
    }

    // Dua request dapat bersaing pada kunci UNIQUE bila keduanya lolos cek awal.
    // Baca baris pemenang dengan locking read, lalu perlakukan sebagai retry.
    const winner = await receivableModel.findPaymentByKey(connection, {
      orderId: input.orderId,
      key: input.identity.keyBuffer
    });
    if (!winner) {
      throw error;
    }
    assertMatchingRequest(winner, input.identity);
    return { duplicatePayment: winner };
  }
}

async function duplicateResult(connection, orderId, payment) {
  const [row, payments] = await Promise.all([
    receivableModel.findById(orderId, connection),
    receivableModel.findPaymentsByOrderId(orderId, connection)
  ]);

  return {
    payment: toPublicPayment(payment),
    receivable: toPublicReceivable(row, payments),
    duplicate: true
  };
}

async function settleReceivable(id, input = {}, userId) {
  const payload = input || {};
  const orderId = parseId(id);
  const cashierId = parseCashierId(userId);
  const nominalCents = parseNominal(payload.nominal);
  const method = parseMethod(payload.method);
  const reference = normalizeText(payload.reference, MAX_REFERENCE, MESSAGE.REFERENCE_INVALID);
  const note = normalizeText(payload.note, MAX_NOTE, MESSAGE.NOTE_INVALID);
  const identity = buildPaymentIdentity(reference, note, orderId, nominalCents, method, cashierId);

  return withTransaction(async (connection) => {
    const order = await receivableModel.lockForUpdate(orderId, connection);
    if (!order) {
      throw new AppError(MESSAGE.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const existing = await findExistingPayment(connection, {
      orderId,
      amountCents: nominalCents,
      method,
      identity
    });
    if (existing) {
      return duplicateResult(connection, orderId, existing);
    }

    if (order.status !== DEFAULT_STATUS) {
      throw new AppError(MESSAGE.NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    const paid = await receivableModel.sumPaidByOrderId(orderId, connection);
    const totalCents = money.toCents(order.total);
    const paidCents = money.toCents(paid.total_paid);
    const outstandingCents = money.subtractCents(totalCents, paidCents);

    if (nominalCents > outstandingCents) {
      throw new AppError(MESSAGE.OVERPAYMENT, HTTP_STATUS.BAD_REQUEST);
    }

    const inserted = await insertPaymentOnce(connection, {
      orderId,
      cashierId,
      amountCents: nominalCents,
      method,
      identity
    });
    if (inserted.duplicatePayment) {
      return duplicateResult(connection, orderId, inserted.duplicatePayment);
    }

    const newOutstandingCents = money.subtractCents(outstandingCents, nominalCents);
    if (newOutstandingCents === 0) {
      const affected = await receivableModel.markSettled(orderId, connection);
      if (affected !== 1) {
        throw new AppError(MESSAGE.ALREADY_SETTLED, HTTP_STATUS.CONFLICT);
      }
    }

    const [row, payments] = await Promise.all([
      receivableModel.findById(orderId, connection),
      receivableModel.findPaymentsByOrderId(orderId, connection)
    ]);
    const payment = payments.find((item) => Number(item.id) === inserted.paymentId);

    return {
      payment: toPublicPayment(payment),
      receivable: toPublicReceivable(row, payments),
      duplicate: false
    };
  });
}

module.exports = {
  MESSAGE,
  METHODS,
  ORDER_STATUSES,
  DEFAULT_STATUS,
  listReceivables,
  getReceivable,
  settleReceivable,
  riskLabel,
  // Alias mengikuti nama aksi controller agar pemakaian tetap fleksibel.
  index: listReceivables,
  show: getReceivable,
  pay: settleReceivable
};
