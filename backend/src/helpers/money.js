'use strict';

const AppError = require('./AppError');
const { HTTP_STATUS } = require('./response');

const INVALID_AMOUNT = 'Nominal uang tidak valid';
const INVALID_QUANTITY = 'Kuantitas harus bilangan bulat positif';
const MONEY_PATTERN = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/;

function assertSafeInteger(value) {
  if (!Number.isSafeInteger(value)) {
    throw new AppError(INVALID_AMOUNT, HTTP_STATUS.BAD_REQUEST);
  }
  return value;
}

/**
 * Mengubah nominal uang menjadi integer sen.
 * Menerima string DECIMAL dari mysql2 maupun angka yang representasinya aman.
 * Tidak memakai parseFloat dan menolak lebih dari dua angka desimal.
 */
function toCents(value) {
  if (typeof value === 'bigint') {
    throw new AppError(INVALID_AMOUNT, HTTP_STATUS.BAD_REQUEST);
  }

  const text = value === null || value === undefined ? '' : String(value).trim();
  const match = MONEY_PATTERN.exec(text);

  if (!match) {
    throw new AppError(INVALID_AMOUNT, HTTP_STATUS.BAD_REQUEST);
  }

  const whole = Number(match[2]);
  const fraction = Number((match[3] || '').padEnd(2, '0'));
  const cents = assertSafeInteger(whole * 100 + fraction);

  return match[1] === '-' ? -cents : cents;
}

/** Mengubah integer sen menjadi string dua desimal tanpa floating point. */
function fromCents(cents) {
  assertSafeInteger(cents);

  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.trunc(absolute / 100);
  const fraction = absolute % 100;

  return sign + String(whole) + '.' + String(fraction).padStart(2, '0');
}

function addCents(...values) {
  return assertSafeInteger(values.reduce((total, value) => total + assertSafeInteger(value), 0));
}

function sumCents(values) {
  return addCents(...values);
}

function subtractCents(minuend, subtrahend) {
  return assertSafeInteger(assertSafeInteger(minuend) - assertSafeInteger(subtrahend));
}

function multiplyCents(cents, quantity) {
  const amount = assertSafeInteger(cents);

  if (!Number.isSafeInteger(quantity) || quantity < 1) {
    throw new AppError(INVALID_QUANTITY, HTTP_STATUS.BAD_REQUEST);
  }

  return assertSafeInteger(amount * quantity);
}

function lineTotalCents(unitPrice, quantity, discount = '0') {
  const subtotal = multiplyCents(toCents(unitPrice), quantity);
  return subtractCents(subtotal, toCents(discount));
}

module.exports = {
  INVALID_AMOUNT,
  INVALID_QUANTITY,
  toCents,
  fromCents,
  addCents,
  sumCents,
  subtractCents,
  multiplyCents,
  lineTotalCents
};
