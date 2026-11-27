'use strict';

const restockModel = require('../models/restockModel');

const RESTOCK_DAYS = 14;
const RESTOCK_HORIZON_DAYS = 7;
const MAX_PRODUCTS = 100;

const REASON = Object.freeze({
  LOW_STOCK: 'Stok mencapai batas minimum',
  FAST_MOVING: 'Estimasi habis dalam 7 hari',
  BOTH: 'Stok minimum dan estimasi habis dalam 7 hari'
});

function toRestockProduct(row) {
  const stock = Number(row.stock);
  const minStock = Number(row.min_stock);
  const avgDaily = Number(row.avg_daily) || 0;
  const estimatedDays = avgDaily > 0 ? Math.floor(stock / avgDaily) : null;
  const suggestedQty = Math.max(
    Math.ceil(avgDaily * RESTOCK_DAYS - stock),
    minStock - stock,
    0
  );

  const lowStock = stock <= minStock;
  const fastMoving = estimatedDays !== null && estimatedDays <= RESTOCK_HORIZON_DAYS;
  let reason = REASON.FAST_MOVING;
  if (lowStock && fastMoving) {
    reason = REASON.BOTH;
  } else if (lowStock) {
    reason = REASON.LOW_STOCK;
  }

  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    unit: row.unit,
    stock,
    min_stock: minStock,
    avg_daily: avgDaily,
    estimated_days: estimatedDays,
    suggested_qty: suggestedQty,
    reason
  };
}

async function getRestock() {
  const candidates = ['findNeedRestock', 'findRestockProducts'];
  const findRestock = candidates.map((name) => restockModel[name])
    .find((fn) => typeof fn === 'function');
  if (!findRestock) {
    throw new Error('Query restock tidak tersedia pada model');
  }
  const rows = await findRestock.call(restockModel, RESTOCK_HORIZON_DAYS, MAX_PRODUCTS);

  return {
    products: rows.map(toRestockProduct),
    generated_at: new Date().toISOString()
  };
}

module.exports = {
  RESTOCK_DAYS,
  RESTOCK_HORIZON_DAYS,
  MAX_PRODUCTS,
  REASON,
  getRestock
};
