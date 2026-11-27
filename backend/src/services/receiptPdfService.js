'use strict';

const PDFDocument = require('pdfkit');

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const receivableModel = require('../models/receivableModel');
const { COMPANY, rupiah } = require('./pdfService');

function parseId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppError('ID pembayaran tidak valid', HTTP_STATUS.BAD_REQUEST);
  }
  return id;
}

function label(doc, text, value, contentWidth, bold = false) {
  const y = doc.y;
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
  doc.text(text, doc.page.margins.left, y, {
    width: contentWidth * 0.45,
    align: 'left'
  });
  doc.text(value, doc.page.margins.left + contentWidth * 0.45, y, {
    width: contentWidth * 0.55,
    align: 'right'
  });
  doc.y = y + 14;
}

/** Membangun PDF di memori memakai gaya pdfService; tidak mengakses database. */
function buildReceipt(data) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 40,
    compress: false,
    info: {
      Title: 'Bukti Pembayaran ' + String(data.orderNo || ''),
      Author: COMPANY.name,
      Subject: 'Bukti pembayaran piutang DistriFlow'
    }
  });

  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const contentWidth = doc.page.width - (doc.page.margins.left * 2);

    doc.font('Helvetica-Bold').fontSize(16).text(COMPANY.name, { align: 'center' });
    doc.font('Helvetica').fontSize(9);
    doc.text(COMPANY.tagline, { align: 'center' });
    doc.text(COMPANY.address, { align: 'center' });
    doc.text(COMPANY.phone, { align: 'center' });
    doc.moveDown(0.8);

    doc.font('Helvetica-Bold').fontSize(12).text('BUKTI PEMBAYARAN / KWITANSI');
    doc.moveDown(0.6);

    label(doc, 'No. Pembayaran', '#' + data.paymentId, contentWidth);
    label(doc, 'No. Order', String(data.orderNo || '-'), contentWidth);
    label(doc, 'Tanggal Order', String(data.orderDate || '-'), contentWidth);
    label(doc, 'Pelanggan', String(data.customerName || '-') + ' (' + String(data.customerCode || '-') + ')', contentWidth);
    label(doc, 'Tanggal Bayar', String(data.paidAt || '-'), contentWidth);
    label(doc, 'Metode', String(data.method || '-'), contentWidth);

    doc.moveTo(doc.page.margins.left, doc.y + 4)
      .lineTo(doc.page.margins.left + contentWidth, doc.y + 4)
      .stroke();
    doc.moveDown(0.8);

    label(doc, 'Nominal bayar', rupiah(data.amountCents), contentWidth, true);
    label(doc, 'Total tagihan order', rupiah(data.totalCents), contentWidth);
    label(doc, 'Total dibayar (termasuk ini)', rupiah(data.runningCents), contentWidth);
    label(doc, 'Sisa piutang', rupiah(data.outstandingCents), contentWidth, true);

    doc.moveDown(1);
    doc.font('Helvetica').fontSize(8)
      .text('Dokumen ini dicetak dari data transaksi yang tersimpan.', { width: contentWidth });

    doc.end();
  });
}

/** Jalur ini hanya membaca data tersimpan; tidak mengubah status maupun saldo. */
async function generateReceipt(id) {
  const paymentId = parseId(id);
  const payment = await receivableModel.findPaymentById(paymentId);

  if (!payment) {
    throw new AppError('Pembayaran tidak ditemukan', HTTP_STATUS.NOT_FOUND);
  }

  const running = await receivableModel.sumAppliedUpToPayment(
    payment.sales_order_id,
    payment.id
  );
  const amountCents = money.toCents(payment.amount);
  const totalCents = money.toCents(payment.total);
  const runningCents = money.toCents(running.total_paid);
  const outstandingCents = Math.max(0, money.subtractCents(totalCents, runningCents));

  const pdf = await buildReceipt({
    paymentId: payment.id,
    orderNo: payment.order_no,
    orderDate: payment.order_date,
    customerName: payment.customer_name,
    customerCode: payment.customer_code,
    paidAt: payment.paid_at,
    amountCents,
    method: payment.method,
    totalCents,
    runningCents,
    outstandingCents
  });

  return { paymentId: payment.id, orderNo: payment.order_no, pdf };
}

module.exports = { buildReceipt, generateReceipt, COMPANY, rupiah };
