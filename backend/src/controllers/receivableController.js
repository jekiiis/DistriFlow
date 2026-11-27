'use strict';

const receivableService = require('../services/receivableService');
const { success } = require('../helpers/response');

function resolve(...names) {
  for (const name of names) {
    if (typeof receivableService[name] === 'function') {
      return receivableService[name];
    }
  }
  throw new Error('Layanan piutang tidak tersedia');
}

async function index(req, res) {
  const list = resolve('listReceivables', 'index', 'list');
  const result = await list(req.query || {});
  return success(res, result, 'Daftar piutang');
}

async function show(req, res) {
  const get = resolve('getReceivable', 'show');
  const receivable = await get(req.params.id);
  return success(res, { receivable }, 'Detail piutang');
}

async function pay(req, res) {
  const settle = resolve('settleReceivable', 'pay');
  const result = await settle(
    req.params.id,
    req.body || {},
    req.session.user.id
  );

  const message = result.duplicate
    ? 'Pembayaran sudah tercatat sebelumnya'
    : 'Pembayaran piutang berhasil dicatat';

  return success(res, {
    payment: result.payment,
    receivable: result.receivable
  }, message, 201);
}

module.exports = { index, show, pay };
