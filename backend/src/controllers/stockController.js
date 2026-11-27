'use strict';

const stockService = require('../services/stockService');
const { success, HTTP_STATUS } = require('../helpers/response');

async function store(req, res) {
  try {
    const result = await stockService.createStockIn(req.body || {}, req.session.user.id);
    return success(res, result, 'Barang masuk berhasil dicatat', 201);
  } catch (error) {
    // Duplikasi nomor dokumen adalah peringatan + konfirmasi, bukan hard block.
    if (error && error.needConfirm === true) {
      return res.status(HTTP_STATUS.CONFLICT).json({
        success: false,
        message: error.message,
        needConfirm: true
      });
    }
    throw error;
  }
}

async function index(req, res) {
  const result = await stockService.listStockIns(req.query || {});
  return success(res, result, 'Daftar barang masuk');
}

module.exports = { store, index };
