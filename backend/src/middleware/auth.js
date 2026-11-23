'use strict';

const { fail, HTTP_STATUS } = require('../helpers/response');

function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return fail(res, 'Sesi berakhir, silakan login kembali', null, HTTP_STATUS.UNAUTHORIZED);
}

module.exports = { requireLogin };
