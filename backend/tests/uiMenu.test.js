'use strict';

const ui = require('../../frontend/js/ui');
const { PAGE_ACCESS } = require('../src/middleware/pageGuard');

function paths(role) {
  return ui.MENU_BY_ROLE[role].map((item) => item[2]);
}

describe('MENU_BY_ROLE Sprint 2', () => {
  test('ADMIN, SALES, dan KASIR hanya melihat halaman yang diizinkan', () => {
    ['ADMIN', 'SALES', 'KASIR', 'GUDANG'].forEach((role) => {
      paths(role).forEach((pagePath) => {
        const rule = PAGE_ACCESS[pagePath];
        expect(rule).toBeDefined();
        if (Array.isArray(rule)) {
          expect(rule).toContain(role);
        } else {
          expect(['AUTHENTICATED', role]).toContain(rule);
        }
      });
    });
  });

  test('menu Sales Order hanya untuk ADMIN dan SALES', () => {
    expect(paths('SALES')).toContain('/pages/sales-order.html');
    expect(paths('ADMIN')).toContain('/pages/sales-order.html');
    expect(paths('KASIR')).not.toContain('/pages/sales-order.html');
  });

  test('menu Pembayaran hanya untuk KASIR', () => {
    expect(paths('KASIR')).toContain('/pages/payment.html');
    expect(paths('ADMIN')).not.toContain('/pages/payment.html');
    expect(paths('SALES')).not.toContain('/pages/payment.html');
  });

  test('tidak ada menu KPI', () => {
    const all = ['ADMIN', 'SALES', 'KASIR', 'GUDANG']
      .reduce((items, role) => items.concat(ui.MENU_BY_ROLE[role]), []);
    expect(all.some((item) => /kpi|laporan/i.test(item[1]))).toBe(false);
  });
});
