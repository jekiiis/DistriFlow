'use strict';

const AppError = require('../helpers/AppError');
const { HTTP_STATUS } = require('../helpers/response');
const { withTransaction } = require('../config/db');
const stockModel = require('../models/stockModel');

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const MESSAGE = Object.freeze({
  PRODUCT_ID_INVALID: 'ID barang tidak valid',
  PRODUCT_NOT_FOUND: 'Barang tidak ditemukan',
  PRODUCT_INACTIVE: 'Barang tidak aktif, barang masuk tidak dapat dicatat',
  QTY_INVALID: 'Jumlah barang harus bilangan bulat positif',
  DOCUMENT_NO_REQUIRED: 'Nomor dokumen wajib diisi',
  DOCUMENT_NO_TOO_LONG: 'Nomor dokumen maksimal 50 karakter',
  INVOICE_MATCH_REQUIRED: 'Centang kesesuaian dengan detail faktur',
  NOTE_INVALID: 'Catatan maksimal 255 karakter',
  DUPLICATE_DOCUMENT: 'Nomor dokumen sudah digunakan. Konfirmasi untuk tetap menyimpan',
  SESSION_EXPIRED: 'Sesi berakhir, silakan login kembali',
  STOCK_UPDATE_FAILED: 'Gagal memperbarui stok barang',
  MOVEMENT_NOT_FOUND: 'Pencatatan barang masuk tidak ditemukan'
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

function parseProductId(value) {
  const id = toSafeInteger(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(MESSAGE.PRODUCT_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function parseQty(value) {
  const qty = toSafeInteger(value);
  if (!Number.isSafeInteger(qty) || qty < 1) {
    throw new AppError(MESSAGE.QTY_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return qty;
}

function parseDocumentNo(value) {
  const documentNo = isBlank(value) ? '' : String(value).trim();
  if (documentNo === '') {
    throw new AppError(MESSAGE.DOCUMENT_NO_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }
  if (documentNo.length > 50) {
    throw new AppError(MESSAGE.DOCUMENT_NO_TOO_LONG, HTTP_STATUS.BAD_REQUEST);
  }
  return documentNo;
}

function parseInvoiceMatch(value) {
  if (value !== true) {
    throw new AppError(MESSAGE.INVOICE_MATCH_REQUIRED, HTTP_STATUS.BAD_REQUEST);
  }
  return true;
}

/** Schema v1.0 tidak memiliki kolom note pada stock_movements: hanya divalidasi. */
function parseNote(value) {
  const note = isBlank(value) ? '' : String(value).trim();
  if (note.length > 255) {
    throw new AppError(MESSAGE.NOTE_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return note;
}

function parseSessionUserId(value) {
  const id = toSafeInteger(value);
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new AppError(MESSAGE.SESSION_EXPIRED, HTTP_STATUS.UNAUTHORIZED);
  }
  return id;
}

/** MySQL mengembalikan BOOLEAN sebagai 0/1; hanya nilai nonaktif yang ditolak. */
function isInactive(value) {
  return value === false || value === 0 || value === '0';
}

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

function toPublicMovement(row) {
  return {
    id: Number(row.id),
    product_id: Number(row.product_id),
    product_code: row.product_code,
    product_name: row.product_name,
    qty: Number(row.qty),
    reference: row.reference,
    type: row.type,
    user_id: Number(row.user_id),
    created_at: row.created_at,
    stock_after: Number(row.stock_after)
  };
}

/**
 * Nomor dokumen duplikat hanya meminta konfirmasi. Pemeriksaan ini bersifat
 * peringatan dan dilakukan sebelum transaksi; penulisan tetap satu transaksi.
 */
async function assertDuplicateAllowed(documentNo, confirmed) {
  const duplicate = await stockModel.hasReference(documentNo);
  if (duplicate && confirmed !== true) {
    const error = new AppError(MESSAGE.DUPLICATE_DOCUMENT, HTTP_STATUS.CONFLICT);
    error.needConfirm = true;
    throw error;
  }
  return false;
}

/**
 * Barang masuk: lock produk, verifikasi, insert movement, lalu tambah stok
 * di dalam SATU transaksi. Semua kegagalan menggugurkan seluruh perubahan.
 */
async function createStockIn(input = {}, userId) {
  const payload = input || {};
  const productId = parseProductId(payload.product_id);
  const qty = parseQty(payload.qty);
  const documentNo = parseDocumentNo(payload.document_no);
  parseInvoiceMatch(payload.invoice_match);
  parseNote(payload.note);
  const recorderId = parseSessionUserId(userId);

  await assertDuplicateAllowed(documentNo, payload.confirm_duplicate === true);

  const movement = await withTransaction(async (connection) => {
    const product = await stockModel.lockProductById(productId, connection);
    if (!product) {
      throw new AppError(MESSAGE.PRODUCT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }
    if (isInactive(product.is_active)) {
      throw new AppError(MESSAGE.PRODUCT_INACTIVE, HTTP_STATUS.CONFLICT);
    }

    const movementId = await stockModel.insertInMovement(connection, {
      productId,
      userId: recorderId,
      qty,
      reference: documentNo
    });

    const affected = await stockModel.increaseStock(connection, productId, qty);
    if (affected !== 1) {
      throw new AppError(MESSAGE.STOCK_UPDATE_FAILED, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    const row = await stockModel.findById(movementId, connection);
    if (!row) {
      throw new AppError(MESSAGE.MOVEMENT_NOT_FOUND, HTTP_STATUS.INTERNAL_SERVER_ERROR);
    }

    return toPublicMovement(row);
  });

  return { movement };
}

async function listStockIns(query = {}) {
  const { page, limit } = parsePagination(query);
  const filters = {
    search: parseSearch(query.search),
    dateFrom: isBlank(query.date_from) ? '' : String(query.date_from).trim(),
    dateTo: isBlank(query.date_to) ? '' : String(query.date_to).trim(),
    limit,
    offset: (page - 1) * limit
  };

  const [rows, total] = await Promise.all([
    stockModel.findMasukMany(filters),
    stockModel.countMasuk(filters)
  ]);

  return {
    movements: rows.map(toPublicMovement),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  };
}

module.exports = {
  MESSAGE,
  createStockIn,
  listStockIns,
  parsePagination,
  toPublicMovement
};
