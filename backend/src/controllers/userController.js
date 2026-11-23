'use strict';

const userService = require('../services/userService');
const { success } = require('../helpers/response');

function parsePagination(query) {
  const page = Number.parseInt(query.page, 10);
  const requestedLimit = Number.parseInt(query.limit, 10);

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    limit: Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 10
  };
}

async function index(req, res) {
  const query = req.query || {};
  const { page, limit } = parsePagination(query);

  const result = await userService.list({
    search: query.q || query.search || '',
    role: query.role || '',
    isActive: query.is_active === undefined ? '' : query.is_active,
    page,
    limit
  });

  return success(res, result, 'Daftar pengguna');
}

async function show(req, res) {
  const user = await userService.getById(req.params.id);
  return success(res, { user }, 'Detail pengguna');
}

async function store(req, res) {
  const user = await userService.create(req.body || {});
  return success(res, { user }, 'Pengguna berhasil ditambahkan', 201);
}

async function update(req, res) {
  const user = await userService.update(req.params.id, req.body || {});
  return success(res, { user }, 'Pengguna berhasil diperbarui');
}

module.exports = { index, show, store, update };
