'use strict';

/**
 * Meneruskan error dari controller async ke middleware error Express.
 * Tanpa wrapper ini, promise yang rejected tidak ditangani oleh error handler.
 */
function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    return Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
