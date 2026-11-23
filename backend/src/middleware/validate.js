'use strict';

const { validationResult } = require('express-validator');
const { fail, HTTP_STATUS } = require('../helpers/response');

/**
 * Mengubah hasil express-validator menjadi respons 400 dengan format seragam.
 * Pesan error pertama dipakai sebagai pesan utama agar pesan bisnis yang
 * ditetapkan SKPL/DPPL tetap tampil persis di body respons.
 */
function validate(req, res, next) {
  const result = validationResult(req);

  if (result.isEmpty()) {
    return next();
  }

  const errors = result.array().map((error) => ({
    field: error.path || error.param,
    message: error.msg
  }));

  const message = errors.length > 0 && errors[0].message
    ? errors[0].message
    : 'Validasi gagal';

  return fail(res, message, errors, HTTP_STATUS.BAD_REQUEST);
}

module.exports = { validate };
