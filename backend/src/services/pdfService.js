'use strict';

const PDFDocument = require('pdfkit');
const money = require('../helpers/money');

const COMPANY = Object.freeze({
  name: 'DistriFlow',
  tagline: 'Distribusi & POS Bandung',
  address: 'Alamat: tidak tercatat pada data transaksi',
  phone: 'Telepon: tidak tercatat pada data transaksi'
});

const THERMAL_WIDTH_PT = 227;
const THERMAL_HEIGHT_PT = 842;
const ROW_HEIGHT = Object.freeze({ a4: 24, '80mm': 34 });

function rupiah(cents) {
  return 'Rp' + Number(money.fromCents(cents)).toLocaleString('id-ID');
}

function paidSummary(order) {
  let receivedCents = 0;
  let changeCents = 0;

  for (const payment of order.payments || []) {
    receivedCents = money.addCents(receivedCents, money.toCents(payment.amount));
    changeCents = money.addCents(changeCents, money.toCents(payment.change_amount));
  }

  const appliedCents = money.subtractCents(receivedCents, changeCents);
  const totalCents = money.toCents(order.total);

  return {
    receivedCents,
    changeCents,
    appliedCents,
    remainingCents: Math.max(0, money.subtractCents(totalCents, appliedCents))
  };
}

function writeColumns(doc, cells, y, rowHeight, contentWidth) {
  const defaults = [
    { width: 0.34, align: 'left' },
    { width: 0.10, align: 'center' },
    { width: 0.18, align: 'right' },
    { width: 0.14, align: 'right' },
    { width: 0.24, align: 'right' }
  ];

  let x = doc.page.margins.left;
  cells.forEach((cell, index) => {
    const config = defaults[index];
    const width = contentWidth * config.width;
    doc.text(String(cell === null || cell === undefined ? '' : cell), x, y, {
      width,
      align: config.align
    });
    x += width;
  });

  return y + rowHeight;
}

function writeHeader(doc, order) {
  const y = doc.y;

  doc.font('Helvetica-Bold').fontSize(16).text(COMPANY.name, { align: 'center' });
  doc.font('Helvetica').fontSize(9);
  doc.text(COMPANY.tagline, { align: 'center' });
  doc.text(COMPANY.address, { align: 'center' });
  doc.text(COMPANY.phone, { align: 'center' });
  doc.moveDown(0.8);

  doc.font('Helvetica-Bold').fontSize(12).text('INVOICE / FAKTUR PENJUALAN');
  doc.font('Helvetica').fontSize(9);
  doc.text('No. Order: ' + order.order_no);
  doc.text('Tanggal: ' + order.order_date);
  doc.text('Pelanggan: ' + (order.customer_name || '-') + ' (' + order.customer_code + ')');
  doc.text('Sales: ' + (order.user_name || '-'));
  doc.text('Status: ' + order.status);
  doc.moveDown(0.6);

  return Math.max(doc.y, y + 140);
}

function writeItems(doc, order, contentWidth, format) {
  const rowHeight = ROW_HEIGHT[format];
  let y = writeHeader(doc, order);

  doc.font('Helvetica-Bold').fontSize(8);
  y = writeColumns(doc, ['Barang', 'Qty', 'Harga', 'Diskon', 'Subtotal'], y, rowHeight, contentWidth);
  doc.moveTo(doc.page.margins.left, y - 6)
    .lineTo(doc.page.margins.left + contentWidth, y - 6)
    .stroke();

  doc.font('Helvetica').fontSize(8);
  for (const item of order.items || []) {
    y = writeColumns(doc, [
      item.code + ' - ' + item.name,
      item.qty,
      rupiah(money.toCents(item.unit_price)),
      rupiah(money.toCents(item.discount)),
      rupiah(money.toCents(item.line_total))
    ], y, rowHeight, contentWidth);
  }

  return y;
}

function writeTotals(doc, order, contentWidth, format) {
  const summary = paidSummary(order);
  const rowHeight = ROW_HEIGHT[format];
  let y = writeItems(doc, order, contentWidth, format) + 4;

  doc.moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.margins.left + contentWidth, y)
    .stroke();
  y += 8;

  const rows = [
    ['Subtotal', rupiah(money.toCents(order.subtotal))],
    ['Diskon', rupiah(money.toCents(order.discount))],
    ['Total tagihan', rupiah(money.toCents(order.total))],
    ['Nominal bayar', rupiah(summary.receivedCents)]
  ];

  doc.fontSize(9);
  for (const [label, value] of rows) {
    doc.text(label, doc.page.margins.left, y, { width: contentWidth * 0.6, align: 'left' });
    doc.text(value, doc.page.margins.left + contentWidth * 0.6, y, {
      width: contentWidth * 0.4,
      align: 'right'
    });
    y += rowHeight * 0.7;
  }

  doc.font('Helvetica-Bold');
  if (order.status === 'LUNAS') {
    doc.text('Kembalian / lebih bayar: ' + rupiah(summary.changeCents), {
      width: contentWidth
    });
  } else {
    doc.text('Sisa piutang: ' + rupiah(summary.remainingCents), { width: contentWidth });
    doc.text('Jatuh tempo: ' + (order.due_date || '-'), { width: contentWidth });
  }

  doc.font('Helvetica').fontSize(8).moveDown(1);
  doc.text('Dokumen ini dicetak dari data transaksi yang tersimpan.', { width: contentWidth });
}

/** Membangun PDF di memori; tidak menjalankan query dan tidak mengubah data. */
function buildInvoice(order, format = 'a4') {
  const thermal = format === '80mm';
  const size = thermal ? [THERMAL_WIDTH_PT, THERMAL_HEIGHT_PT] : 'A4';
  const margin = thermal ? 12 : 40;
  const doc = new PDFDocument({
    size,
    margin,
    compress: false,
    info: {
      Title: 'Invoice ' + order.order_no,
      Author: COMPANY.name,
      Subject: 'Invoice sales order DistriFlow'
    }
  });

  const chunks = [];
  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width;
    const contentWidth = pageWidth - (margin * 2);
    writeTotals(doc, order, contentWidth, format);
    doc.end();
  });
}

module.exports = { buildInvoice, COMPANY, paidSummary, rupiah };
