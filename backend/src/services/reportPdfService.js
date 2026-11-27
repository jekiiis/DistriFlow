'use strict';

const PDFDocument = require('pdfkit');
const money = require('../helpers/money');
const { COMPANY } = require('./pdfService');

const MARGIN = 40;
const ROW_HEIGHT = 18;
const PRODUCT_COLUMNS = [
  { width: 0.36, align: 'left' },
  { width: 0.08, align: 'center' },
  { width: 0.08, align: 'center' },
  { width: 0.24, align: 'right' },
  { width: 0.24, align: 'right' }
];
const DAILY_COLUMNS = [
  { width: 0.40, align: 'left' },
  { width: 0.20, align: 'center' },
  { width: 0.40, align: 'right' }
];

/** Format Rupiah tanpa floating point: Rp1.234,56. */
function formatRupiah(cents) {
  const text = money.fromCents(cents);
  const negative = text.startsWith('-');
  const absolute = negative ? text.slice(1) : text;
  const [whole, fraction] = absolute.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return (negative ? '-Rp' : 'Rp') + grouped + ',' + fraction;
}

function rupiahFromValue(value) {
  const clean = value === null || value === undefined || value === '' ? 0 : value;
  return formatRupiah(money.toCents(clean));
}

function contentWidth(doc) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function ensureSpace(doc, y, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (y + needed <= bottom) {
    return y;
  }

  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(9).text('Laporan Penjualan (lanjutan)', {
    width: contentWidth(doc)
  });
  doc.font('Helvetica').fontSize(9);
  return doc.y + 10;
}

function writeColumns(doc, cells, columns, y) {
  const width = contentWidth(doc);
  let x = doc.page.margins.left;

  cells.forEach((cell, index) => {
    doc.text(String(cell === null || cell === undefined ? '' : cell), x, y, {
      width: width * columns[index].width,
      align: columns[index].align,
      ellipsis: true
    });
    x += width * columns[index].width;
  });

  return y + ROW_HEIGHT;
}

function writeSummary(doc, summary) {
  const source = summary || {};
  const width = contentWidth(doc);
  doc.font('Helvetica-Bold').fontSize(11).text('Ringkasan', { width });
  let y = ensureSpace(doc, doc.y + 6, ROW_HEIGHT);

  const top = source.topProduct;
  const rows = [
    ['Omzet', rupiahFromValue(source.omzet)],
    ['Total transaksi', String(source.totalOrders || 0)],
    ['Barang terjual', String(source.totalProductsSold || 0)],
    ['Penjualan tunai (LUNAS)', rupiahFromValue(source.cashTotal)],
    ['Penjualan kredit (LUNAS + PIUTANG)', rupiahFromValue(source.creditTotal)],
    ['Total piutang berjalan', rupiahFromValue(source.receivablesTotal)],
    ['Produk terlaris', top ? `${top.code} - ${top.name} (${top.qty})` : '-']
  ];

  doc.font('Helvetica').fontSize(9);
  for (const [label, value] of rows) {
    y = ensureSpace(doc, y, ROW_HEIGHT);
    doc.text(label, doc.page.margins.left, y, { width: width * 0.5, align: 'left' });
    doc.text(value, doc.page.margins.left + width * 0.5, y, {
      width: width * 0.5,
      align: 'right',
      ellipsis: true
    });
    y += ROW_HEIGHT;
  }

  return y + 8;
}

function writeTable(doc, title, headers, rows, columns) {
  const width = contentWidth(doc);
  doc.font('Helvetica-Bold').fontSize(11).text(title, { width });
  let y = ensureSpace(doc, doc.y + 6, ROW_HEIGHT * 2);

  y = writeColumns(doc, headers, columns, y);
  doc.moveTo(doc.page.margins.left, y - 4)
    .lineTo(doc.page.margins.left + width, y - 4)
    .stroke();

  doc.font('Helvetica').fontSize(9);
  if (rows.length === 0) {
    y = ensureSpace(doc, y, ROW_HEIGHT);
    doc.text('Tidak ada data pada periode ini.', doc.page.margins.left, y, { width });
    return y + ROW_HEIGHT + 8;
  }

  for (const row of rows) {
    y = ensureSpace(doc, y, ROW_HEIGHT);
    y = writeColumns(doc, row, columns, y);
  }

  return y + 8;
}

function writeDocument(doc, report) {
  const width = contentWidth(doc);
  const period = report.period || {};
  const products = report.products || [];
  const daily = report.daily || [];

  doc.font('Helvetica-Bold').fontSize(16).text(COMPANY.name, { width, align: 'center' });
  doc.font('Helvetica').fontSize(9);
  doc.text(COMPANY.tagline, { width, align: 'center' });
  doc.text(COMPANY.address, { width, align: 'center' });
  doc.text(COMPANY.phone, { width, align: 'center' });
  doc.moveDown(0.6);

  doc.font('Helvetica-Bold').fontSize(13).text('LAPORAN PENJUALAN', { width, align: 'center' });
  doc.font('Helvetica').fontSize(9);
  doc.text('Periode: ' + (period.from || '-') + ' s.d. ' + (period.to || '-'), {
    width,
    align: 'center'
  });
  doc.moveDown(0.6);

  writeSummary(doc, report.summary);
  writeTable(doc, 'Penjualan per Produk',
    ['Barang', 'Satuan', 'Qty', 'Penjualan', 'Kontribusi'],
    products.map((item) => [
      item.code + ' - ' + item.name,
      item.unit,
      item.qty,
      rupiahFromValue(item.sales),
      String(item.contributionPercent) + '%'
    ]),
    PRODUCT_COLUMNS);
  writeTable(doc, 'Penjualan Harian',
    ['Tanggal', 'Transaksi', 'Omzet'],
    daily.map((item) => [item.date, item.orders, rupiahFromValue(item.omzet)]),
    DAILY_COLUMNS);

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(8).text(
    'Dihasilkan dari order berstatus LUNAS dan PIUTANG; DRAFT dan BATAL tidak dihitung. Tidak termasuk PPN.',
    { width }
  );
}

/** Membangun PDF di memori; tidak menjalankan query dan tidak mengubah data. */
function buildSalesReport(report) {
  const period = report && report.period ? `${report.period.from} - ${report.period.to}` : '';
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    compress: false,
    info: {
      Title: 'Laporan Penjualan ' + period,
      Author: COMPANY.name,
      Subject: 'Laporan penjualan DistriFlow'
    }
  });
  const chunks = [];

  return new Promise((resolve, reject) => {
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => {
      const pdf = Buffer.concat(chunks);
      if (pdf.length === 0) {
        reject(new Error('PDF laporan kosong'));
        return;
      }
      resolve(pdf);
    });
    doc.on('error', reject);

    try {
      writeDocument(doc, report || {});
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}

module.exports = { buildSalesReport, formatRupiah, COMPANY };
