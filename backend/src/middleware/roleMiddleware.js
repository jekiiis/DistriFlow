'use strict';

const { fail, HTTP_STATUS } = require('../helpers/response');

function requireRole(...roles) {
  return function checkRole(req, res, next) {
    if (!req.session || !req.session.user) {
      return fail(res, 'Sesi berakhir, silakan login kembali', null, HTTP_STATUS.UNAUTHORIZED);
    }

    if (!roles.includes(req.session.user.role)) {
      return fail(res, 'Anda tidak memiliki hak akses untuk operasi ini', null, HTTP_STATUS.FORBIDDEN);
    }

    return next();
  };
}

module.exports = { requireRole };
