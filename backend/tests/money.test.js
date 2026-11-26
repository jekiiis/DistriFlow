'use strict';

process.env.NODE_ENV = 'test';

const money = require('../src/helpers/money');

describe('utilitas uang presisi', () => {
  test('mengubah nominal desimal menjadi integer sen', () => {
    expect(money.toCents('10.25')).toBe(1025);
    expect(money.toCents('100.50')).toBe(10050);
    expect(money.toCents('999999.99')).toBe(99999999);
    expect(money.toCents(10.25)).toBe(1025);
    expect(money.toCents('0')).toBe(0);
    expect(money.toCents('75000.00')).toBe(7500000);
  });

  test('menolak format yang tidak aman untuk perhitungan uang', () => {
    expect(() => money.toCents('10.255')).toThrow('Nominal uang tidak valid');
    expect(() => money.toCents(0.1 + 0.2)).toThrow('Nominal uang tidak valid');
    expect(() => money.toCents('')).toThrow('Nominal uang tidak valid');
    expect(() => money.toCents('abc')).toThrow('Nominal uang tidak valid');
    expect(() => money.toCents('1e3')).toThrow('Nominal uang tidak valid');
  });

  test('konversi balik selalu memakai dua angka desimal', () => {
    expect(money.fromCents(1025)).toBe('10.25');
    expect(money.fromCents(10050)).toBe('100.50');
    expect(money.fromCents(0)).toBe('0.00');
    expect(money.fromCents(-1025)).toBe('-10.25');
    expect(money.fromCents(99999999)).toBe('999999.99');
  });

  test('penjumlahan dan pengurangan tidak kehilangan sen', () => {
    expect(money.addCents(1025, 10050)).toBe(11075);
    expect(money.sumCents([1025, 10050, 99999999])).toBe(100011074);
    expect(money.subtractCents(money.toCents('100.50'), money.toCents('0.01'))).toBe(10049);
    expect(money.fromCents(money.subtractCents(10050, 1))).toBe('100.49');
  });

  test('perkalian 75000.01 x 3 menghasilkan 225000.03', () => {
    const cents = money.multiplyCents(money.toCents('75000.01'), 3);

    expect(cents).toBe(22500003);
    expect(money.fromCents(cents)).toBe('225000.03');
  });

  test('diskon 0.01 dikurangkan setelah perkalian', () => {
    const cents = money.lineTotalCents('75000.01', 3, '0.01');

    expect(cents).toBe(22500002);
    expect(money.fromCents(cents)).toBe('225000.02');
  });

  test('menerima DECIMAL(15,2) terbesar tanpa pembulatan', () => {
    expect(money.fromCents(money.toCents('9999999999999.99'))).toBe('9999999999999.99');
  });

  test('menolak kuantitas bukan bilangan bulat positif', () => {
    expect(() => money.multiplyCents(1025, 0)).toThrow('Kuantitas harus bilangan bulat positif');
    expect(() => money.multiplyCents(1025, 1.5)).toThrow('Kuantitas harus bilangan bulat positif');
  });
});
