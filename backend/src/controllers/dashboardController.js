'use strict';

const { success } = require('../helpers/response');
const reportService = require('../services/reportService');

/** FR-20: KPI read-only untuk semua peran yang sudah login. */
async function kpi(req, res) {
  const data = await reportService.getDashboardKpi(req.session && req.session.user);
  return success(res, data, 'KPI dashboard');
}

module.exports = { kpi };
