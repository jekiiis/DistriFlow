'use strict';

const AppError = require('../helpers/AppError');
const money = require('../helpers/money');
const { HTTP_STATUS } = require('../helpers/response');
const reportModel = require('../models/reportModel');
const reportPdfService = require('./reportPdfService');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const RESTOCK_DAYS = 14;
// FR-21 memakai ambang estimasi 7 hari, yakni setengah dari jendela restock.
const RESTOCK_URGENT_DAYS = RESTOCK_DAYS / 2;
const LOW_STOCK_LIMIT = 100;

const MESSAGE = Object.freeze({
  FROM_REQUIRED: 'Tanggal awal wajib diisi',
  TO_REQUIRED: 'Tanggal akhir wajib diisi',
  DATE_INVALID: 'Format tanggal harus YYYY-MM-DD',
  ORDER_INVALID: 'Tanggal awal tidak boleh setelah tanggal akhir',
  PDF_EMPTY: 'Gagal membuat PDF laporan penjualan'
});

function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  if (month < 1 || month > 12 || day < 1) {
    return false;
  }

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

/** Pertahanan kedua setelah validator route. */
function parseDate(value, requiredMessage) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw new AppError(requiredMessage, HTTP_STATUS.BAD_REQUEST);
  }

  const text = String(value).trim();
  if (!isCalendarDate(text)) {
    throw new AppError(MESSAGE.DATE_INVALID, HTTP_STATUS.BAD_REQUEST);
  }

  return text;
}

function parsePeriod(query = {}) {
  const source = query || {};
  const from = parseDate(source.date_from, MESSAGE.FROM_REQUIRED);
  const to = parseDate(source.date_to, MESSAGE.TO_REQUIRED);

  if (from > to) {
    throw new AppError(MESSAGE.ORDER_INVALID, HTTP_STATUS.BAD_REQUEST);
  }

  return { from, to };
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return money.fromCents(0);
  }
  return money.fromCents(money.toCents(value));
}

function contributionPercent(salesCents, omzetCents) {
  if (omzetCents <= 0) {
    return 0;
  }
  return Math.round((salesCents / omzetCents) * 1000) / 10;
}

function compareProducts(a, b) {
  return b.salesCents - a.salesCents
    || b.qty - a.qty
    || String(a.row.code).localeCompare(String(b.row.code));
}

/**
 * FR-19: seluruh angka berasal dari agregasi SQL. JavaScript hanya mengubah
 * DECIMAL menjadi string uang dan menghitung persentase kontribusi.
 */
async function getSalesReport(query = {}) {
  const period = parsePeriod(query);
  const [sales, productRows, soldQty, dailyRows] = await Promise.all([
    reportModel.aggregateSales(period),
    reportModel.aggregateProducts(period),
    reportModel.sumProductsSold(period),
    reportModel.dailySales(period)
  ]);

  const omzetCents = money.toCents(sales.omzet === undefined ? 0 : sales.omzet);
  const entries = (productRows || []).map((row) => ({
    row,
    qty: Number(row.qty),
    salesCents: money.toCents(row.sales)
  })).sort(compareProducts);

  const products = entries.map(({ row, qty, salesCents }) => ({
    code: row.code,
    name: row.name,
    unit: row.unit,
    qty,
    sales: money.fromCents(salesCents),
    contributionPercent: contributionPercent(salesCents, omzetCents)
  }));

  const topEntry = entries[0];
  const topProduct = topEntry
    ? {
      code: topEntry.row.code,
      name: topEntry.row.name,
      qty: topEntry.qty,
      sales: money.fromCents(topEntry.salesCents)
    }
    : null;

  return {
    period,
    summary: {
      omzet: money.fromCents(omzetCents),
      totalOrders: Number(sales.total_orders || 0),
      totalProductsSold: Number(soldQty || 0),
      cashTotal: formatMoney(sales.cash_total),
      creditTotal: formatMoney(sales.credit_total),
      receivablesTotal: formatMoney(sales.receivables_total),
      topProduct
    },
    products,
    daily: (dailyRows || []).map((row) => ({
      date: row.date,
      orders: Number(row.orders),
      omzet: formatMoney(row.omzet)
    }))
  };
}

async function generateSalesReportPdf(query = {}) {
  const report = await getSalesReport(query);
  const pdf = await reportPdfService.buildSalesReport(report);

  if (!Buffer.isBuffer(pdf) || pdf.length === 0) {
    throw new AppError(MESSAGE.PDF_EMPTY, HTTP_STATUS.INTERNAL_SERVER_ERROR);
  }

  return { report, pdf };
}

function shapeKpi(omzetHariIni, orderHariIni, piutangJatuhTempo, stokMenipis, perluRestock, lowStockRows) {
  return {
    omzetHariIni,
    orderHariIni,
    piutangJatuhTempo,
    stokMenipis: Number(stokMenipis || 0),
    perluRestock: Number(perluRestock || 0),
    lowStock: (lowStockRows || []).map((row) => ({
      code: row.code,
      name: row.name,
      stock: Number(row.stock),
      min_stock: Number(row.min_stock),
      unit: row.unit
    })),
    generatedAt: new Date().toISOString()
  };
}

/**
 * FR-20: KPI untuk semua peran login. GUDANG tidak mengambil data finansial
 * sama sekali, sehingga angka tersebut tidak pernah sampai ke layer response.
 */
async function getDashboardKpi(actor = {}) {
  const stockTasks = [
    reportModel.countLowStock(),
    reportModel.countNeedRestock(RESTOCK_URGENT_DAYS),
    reportModel.findLowStock(LOW_STOCK_LIMIT)
  ];

  if (actor && actor.role === 'GUDANG') {
    const [lowStock, needRestock, rows] = await Promise.all(stockTasks);
    return shapeKpi('0.00', 0, '0.00', lowStock, needRestock, rows);
  }

  const [today, lowStock, needRestock, rows] = await Promise.all([
    reportModel.todaySummary(),
    ...stockTasks
  ]);

  return shapeKpi(
    formatMoney(today.omzet_today),
    Number(today.orders_today || 0),
    formatMoney(today.overdue_total),
    lowStock,
    needRestock,
    rows
  );
}

module.exports = {
  MESSAGE,
  DATE_PATTERN,
  RESTOCK_DAYS,
  RESTOCK_URGENT_DAYS,
  LOW_STOCK_LIMIT,
  isCalendarDate,
  parsePeriod,
  getSalesReport,
  generateSalesReportPdf,
  getDashboardKpi
};
