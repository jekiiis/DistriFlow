/**
 * @file    users-shell.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 26 November 2026
 * Kerangka halaman UI-04: sidebar, topbar, dan pemeriksaan sesi/peran.
 * File ini hanya dipakai oleh users.html agar UI-01/02/03/05 tidak berubah.
 */
(function () {
  'use strict';

  const ALL_ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const LOCATION = 'Gudang Utama Pasteur';

  const MENU = [
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', roles: ALL_ROLES, available: true },
    { key: 'sales-order', label: 'Sales Order Baru', href: 'sales-order.html', roles: ['ADMIN', 'SALES'], available: true },
    { key: 'orders', label: 'Daftar Sales Order', href: 'orders.html', roles: ['ADMIN', 'SALES', 'KASIR'], available: true },
    { key: 'payment', label: 'Pembayaran', href: 'payment.html', roles: ['KASIR'], available: true },
    { key: 'receivables', label: 'Piutang', href: 'receivables.html', roles: ['KASIR'], available: true },
    { key: 'products', label: 'Barang', href: 'products.html', roles: ['ADMIN', 'GUDANG'], available: true },
    { key: 'stock-in', label: 'Barang Masuk', href: 'stock-in.html', roles: ['ADMIN', 'GUDANG'], available: true },
    { key: 'customers', label: 'Pelanggan', href: 'customers.html', roles: ['ADMIN', 'SALES', 'KASIR'], available: true },
    { key: 'reports', label: 'Laporan', href: 'reports.html', roles: ['ADMIN'], available: true },
    { key: 'users', label: 'Pengguna', href: 'users.html', roles: ['ADMIN'], available: true }
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

  async function logout() {
    try { await API.post('/api/auth/logout'); }
    finally { window.location.href = 'login.html'; }
  }

  function buildSidebar(user) {
    const menu = UI.el('nav', { class: 'menu' }, MENU
      .filter((m) => m.roles.includes(user.role))
      .map((m) => {
        const content = [icon(m.key), UI.el('span', { text: m.label })];
        if (!m.available) {
          return UI.el('span', {
            class: 'users-nav-item is-disabled', 'aria-disabled': 'true',
            title: 'Halaman ini belum tersedia di frontend(new)'
          }, content);
        }
        return UI.el('a', {
          href: m.href,
          class: m.key === 'users' ? 'active' : null,
          'aria-current': m.key === 'users' ? 'page' : null
        }, content);
      }));

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

  function buildTopbar(user) {
    const name = user.name || 'Pengguna';
    const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

    UI.$('#topbar').replaceChildren(
      UI.el('div', { class: 'users-top-left' }, [
        UI.el('div', { class: 'top-title', text: 'Daftar Pengguna' }),
        UI.el('div', { class: 'users-breadcrumb' }, [
          UI.el('span', { text: 'Pengaturan Akun' }),
          UI.el('span', { class: 'users-sep', text: '/' }),
          UI.el('strong', { text: 'Manajemen Pengguna Sistem' })
        ])
      ]),
      UI.el('div', { class: 'users-top-right' }, [
        UI.el('span', { class: 'users-location', text: LOCATION }),
        UI.el('div', { class: 'who' }, [
          UI.el('span', { class: 'avatar', text: initials }),
          UI.el('div', { class: 'users-who-copy' }, [
            UI.el('div', { class: 'who-name', text: name }),
            UI.el('div', { class: 'who-role', text: UI.roleLabel(user.role) }),
            UI.el('a', { href: 'change-password.html', class: 'who-link', text: 'Ganti Password' })
          ])
        ])
      ])
    );
  }

  const UsersShell = {
    user: null,
    _ready: null,

    init() {
      if (this._ready) return this._ready;
      this._ready = (async () => {
        const { data } = await API.get('/api/auth/me');
        this.user = data.user || {};
        buildSidebar(this.user);
        buildTopbar(this.user);

        const roles = (document.body.dataset.roles || '').split(',').filter(Boolean);
        if (roles.length && !roles.includes(this.user.role)) {
          UI.$('#content').replaceChildren(
            UI.el('div', { class: 'alert err', text: 'Anda tidak berhak membuka halaman ini.' })
          );
          const err = new Error('forbidden');
          err.status = 403;
          throw err;
        }
        UI.showFlash();
        return this.user;
      })();
      return this._ready;
    }
  };

  window.UsersShell = UsersShell;
}());
