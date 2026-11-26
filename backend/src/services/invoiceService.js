'use strict';

const AppError = require('../helpers/AppError');
const { HTTP_STATUS } = require('../helpers/response');
const orderModel = require('../models/orderModel');
const pdfService = require('./pdfService');

const INVOICE_STATUSES = ['LUNAS', 'PIUTANG'];
const FORMATS = ['a4', '80mm'];

const MESSAGE = Object.freeze({
  ORDER_ID_INVALID: 'ID sales order tidak valid',
  ORDER_NOT_FOUND: 'Order tidak ditemukan',
  STATUS_INVALID: 'Invoice hanya tersedia untuk order LUNAS atau PIUTANG',
  FORMAT_INVALID: 'Format invoice tidak valid'
});

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError(MESSAGE.ORDER_ID_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function parseFormat(value) {
  const format = value === undefined || value === null || value === '' ? 'a4' : String(value);
  if (!FORMATS.includes(format)) {
    throw new AppError(MESSAGE.FORMAT_INVALID, HTTP_STATUS.BAD_REQUEST);
  }
  return format;
}

/** Hanya membaca data tersimpan; tidak ada UPDATE/INSERT di jalur ini. */
async function generateInvoice(id, format) {
  const orderId = parseId(id);
  const cleanFormat = parseFormat(format);
  const order = await orderModel.findDetailById(orderId);

  if (!order) {
    throw new AppError(MESSAGE.ORDER_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
  }
  if (!INVOICE_STATUSES.includes(order.status)) {
    throw new AppError(MESSAGE.STATUS_INVALID, HTTP_STATUS.CONFLICT);
  }

  const pdf = await pdfService.buildInvoice(order, cleanFormat);
  return { orderNo: order.order_no, format: cleanFormat, pdf };
}

module.exports = { MESSAGE, FORMATS, generateInvoice };
