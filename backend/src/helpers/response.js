'use strict';

const HTTP_STATUS = Object.freeze({
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500
});

function success(res, data = null, message = 'OK', status = HTTP_STATUS.OK) {
  return res.status(status).json({ success: true, message, data });
}

function fail(res, message, errors = null, status = HTTP_STATUS.BAD_REQUEST) {
  const body = { success: false, message };
  if (errors !== null && errors !== undefined) {
    body.errors = errors;
  }
  return res.status(status).json(body);
}

module.exports = { success, fail, HTTP_STATUS };
