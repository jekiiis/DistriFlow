/**
 * @file    layout.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * Kerangka halaman UI-06..UI-18: sidebar, topbar, sesi, dan guard peran.
 *
 * File ini sengaja terpisah dari users-shell.js agar UI-01..UI-05 tidak berubah.
 * Halaman memakai pola yang sama dengan UI-04/UI-05:
 *   <body data-page="..." data-roles="ADMIN,SALES">
 *   Layout.start(async () => { ... })
 */
(function () {
  'use strict';

  const ALL_ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const SALES_ORDER_ROLES = ['ADMIN', 'SALES'];
  const ORDER_ROLES = ['ADMIN', 'SALES', 'KASIR'];
  const WAREHOUSE_ROLES = ['ADMIN', 'GUDANG'];

  const MENU = [
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', roles: ALL_ROLES },
    { key: 'sales-order', label: 'Sales Order Baru', href: 'sales-order.html', roles: SALES_ORDER_ROLES },
    { key: 'orders', label: 'Daftar Sales Order', href: 'orders.html', roles: ORDER_ROLES },
    { key: 'payment', label: 'Pembayaran', href: 'payment.html', roles: ['KASIR'] },
    { key: 'receivables', label: 'Piutang', href: 'receivables.html', roles: ['KASIR'] },
    { key: 'products', label: 'Barang', href: 'products.html', roles: WAREHOUSE_ROLES },
    { key: 'stock-in', label: 'Barang Masuk', href: 'stock-in.html', roles: WAREHOUSE_ROLES },
    { key: 'customers', label: 'Pelanggan', href: 'customers.html', roles: ORDER_ROLES },
    { key: 'reports', label: 'Laporan', href: 'reports.html', roles: ['ADMIN'] },
    { key: 'users', label: 'Pengguna', href: 'users.html', roles: ['ADMIN'] }
  ];

  const ICON_PATH = {
    dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    'sales-order': 'M3 4h2l2.4 11h11.2L21 7H6.2M9 20h.01M18 20h.01',
    orders: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    payment: 'M2 6h20v12H2zM2 10h20M6 15h4',
    receivables: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
    products: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    'stock-in': 'M12 3v12M7 10l5 5 5-5M4 21h16',
    customers: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-5-5.9',
    reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    users: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11'
  };

  function icon(key) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICON_PATH[key] || '');
    svg.appendChild(path);
    return svg;
  }

  function activeKey() {
    const page = document.body.dataset.page || '';
    const view = document.body.dataset.view || '';
    if (page === 'orders') return 'orders';
    if (page === 'products') return 'products';
    if (page === 'customers') return 'customers';
    if (page === 'invoice') return 'orders';
    return page;
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2)
      .map((word) => word[0]).join('').toUpperCase() || '?';
  }

  async function logout() {
    try { await API.post('/api/auth/logout'); }
    finally { window.location.href = 'login.html'; }
  }

  function buildSidebar(user) {
    const active = activeKey();
    const menu = UI.el('nav', { class: 'menu' }, MENU
      .filter((item) => item.roles.includes(user.role))
      .map((item) => UI.el('a', {
        href: item.href,
        class: item.key === active ? 'active' : null,
        'aria-current': item.key === active ? 'page' : null
      }, [icon(item.key), UI.el('span', { text: item.label })])));

    const logoutButton = UI.el('button', {
      class: 'logout', type: 'button', onclick: logout
    }, [icon('logout'), UI.el('span', { text: 'Keluar' })]);

    UI.$('#sidebar').replaceChildren(
      UI.el('div', { class: 'brand' }, [
        UI.el('span', { class: 'logo', text: 'DF' }),
        UI.el('div', {}, ['DistriFlow', UI.el('small', { text: 'Distribusi & POS Bandung' })])
      ]),
      menu,
      UI.el('div', { class: 'side-foot' }, logoutButton)
    );
  }

  function breadcrumbFor(user, key) {
    const group = {
      'sales-order': 'Penjualan',
      orders: 'Penjualan',
      payment: 'Penjualan',
      receivables: 'Penagihan',
      products: 'Inventaris',
      'stock-in': 'Inventaris',
      customers: 'Pelanggan',
      reports: 'Analitik',
      users: 'Pengaturan Akun',
      dashboard: 'Ringkasan'
    }[key] || 'DistriFlow';

    const h1 = UI.$('#content h1');
    const current = document.body.dataset.title ||
      (h1 ? h1.textContent.trim() : document.title.split(' - ')[0]);
    return [group, current];
  }

  function buildTopbar(user) {
    const [group, current] = breadcrumbFor(user, activeKey());
    const name = user.name || 'Pengguna';

    UI.$('#topbar').replaceChildren(
      UI.el('div', { class: 'shell-top-left' }, [
        UI.el('div', { class: 'top-title', text: current }),
        UI.el('div', { class: 'shell-breadcrumb' }, [
          UI.el('span', { text: group }),
          UI.el('span', { class: 'shell-sep', text: '/' }),
          UI.el('strong', { text: current })
        ])
      ]),
      UI.el('div', { class: 'shell-top-right' }, [
        UI.el('span', {
          class: 'shell-location',
          text: document.body.dataset.location || 'Gudang Utama Bandung'
        }),
        UI.el('div', { class: 'who' }, [
          UI.el('span', { class: 'avatar', text: initials(name) }),
          UI.el('div', { class: 'shell-who-copy' }, [
            UI.el('div', { class: 'who-name', text: name }),
            UI.el('div', { class: 'shell-role-row' }, [
              UI.el('span', { class: 'who-role', text: UI.roleLabel(user.role) }),
              UI.el('a', { href: 'change-password.html', class: 'who-link', text: 'Ganti Password' })
            ])
          ])
        ])
      ])
    );
  }

  const Layout = {
    user: null,
    _ready: null,

    /** "750000.00" → 75000000 (sen). Format uang API selalu desimal. */
    cents(value) {
      const text = String(value === null || value === undefined ? '' : value).trim();
      const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
      if (!match) return 0;
      const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
      return match[1] === '-' ? -cents : cents;
    },

    /** sen → "750000.00" (payload API menerima desimal). */
    decimal(cents) {
      const sign = cents < 0 ? '-' : '';
      const absolute = Math.abs(Math.round(Number(cents) || 0));
      return sign + String(Math.trunc(absolute / 100)) + '.' + String(absolute % 100).padStart(2, '0');
    },

    /** sen → "Rp750.000" */
    money(cents) { return UI.rupiah((Number(cents) || 0) / 100); },

    /** Menerima "50000", "50000,5", "1.000,50", atau "50000.50". */
    parseMoneyCents(value, allowEmpty = false) {
      let text = String(value === null || value === undefined ? '' : value).trim().replace(/\s/g, '');
      if (text === '') return allowEmpty ? 0 : null;
      if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(text)) {
        text = text.replace(/\./g, '').replace(',', '.');
      } else {
        text = text.replace(',', '.');
      }
      const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text);
      if (!match) return null;
      const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
      return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
    },

    parseQty(value) {
      const text = String(value === null || value === undefined ? '' : value).trim();
      if (!/^\d+$/.test(text)) return null;
      const qty = Number(text);
      return Number.isSafeInteger(qty) && qty >= 1 ? qty : null;
    },

    /** Mengubah errors array dari validator menjadi { field: message }. */
    errorMap(errors) {
      const result = {};
      if (Array.isArray(errors)) {
        errors.forEach((item) => {
          const field = String((item && item.field) || '').replace(/^items\.\d+\./, '').replace(/^body\./, '');
          if (field && !result[field]) result[field] = item.message;
        });
      }
      return result;
    },

    init() {
      if (this._ready) return this._ready;
      this._ready = (async () => {
        const response = await API.get('/api/auth/me');
        this.user = (response && response.data && response.data.user) || {};

        buildSidebar(this.user);
        buildTopbar(this.user);

        const roles = (document.body.dataset.roles || '').split(',').filter(Boolean);
        if (roles.length && !roles.includes(this.user.role)) {
          UI.$('#content').replaceChildren(
            UI.el('div', { class: 'alert err', text: 'Anda tidak berhak membuka halaman ini.' })
          );
          const error = new Error('forbidden');
          error.status = 403;
          throw error;
        }

        UI.showFlash();
        return this.user;
      })();
      return this._ready;
    },

    /** Memperbarui judul/breadcrumb topbar tanpa mengubah struktur HTML. */
    setTop(title, current) {
      const top = UI.$('#topbar .top-title');
      if (top && title) top.textContent = title;
      const strong = UI.$('#topbar .shell-breadcrumb strong');
      if (strong && current) strong.textContent = current;
    },

    /** Pola peluncuran halaman yang dipakai semua UI-06..UI-18. */
    start(fn) {
      document.addEventListener('DOMContentLoaded', () => {
        this.init().then(fn).catch((error) => {
          if (error && (error.status === 401 || error.message === 'forbidden')) return;
          UI.toast((error && error.message) || 'Halaman tidak dapat dimuat', 'err');
        });
      });
    }
  };

  window.Layout = Layout;
}());
