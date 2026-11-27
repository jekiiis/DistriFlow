/**
 * @file    dashboard.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 26 November 2026
 * UI-02 Dashboard — tampilan Figma dengan data yang benar-benar tersedia.
 *
 * Endpoint yang dipakai: GET /api/auth/me dan GET /api/dashboard/kpi.
 * KPI dan tabel stok menipis berasal dari satu respons yang sama agar angka
 * di kartu dan di tabel tidak berbeda. Tidak ada angka contoh/placeholder.
 */
(function () {
  'use strict';

  const ALL_ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const SALES_ORDER_ROLES = ['ADMIN', 'SALES'];
  const ORDER_ROLES = ['ADMIN', 'SALES', 'KASIR'];
  const WAREHOUSE_ROLES = ['ADMIN', 'GUDANG'];
  const ROLE_LABEL = { ADMIN: 'Admin', SALES: 'Sales', KASIR: 'Kasir', GUDANG: 'Petugas Gudang' };
  const LOCATION = 'Gudang Utama Soekarno-Hatta';

  // Susunan menu mengikuti matriks hak akses kanonik. Semua item adalah tautan
  // nyata karena seluruh halaman sudah tersedia di frontend(new).
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

  const SHORTCUT = {
    SALES: [['Sales Order Baru', 'sales-order.html'], ['Daftar Sales Order', 'orders.html']],
    KASIR: [
      ['Pembayaran', 'payment.html'],
      ['Daftar Sales Order', 'orders.html'],
      ['Piutang', 'receivables.html']
    ],
    GUDANG: [['Barang', 'products.html'], ['Barang Masuk', 'stock-in.html']]
  };

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
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
    search: 'M10 4a6 6 0 104.5 10l4.5 4.5M10 4a6 6 0 010 12'
  };

  const KPI_VALUES = ['#kpiOmzet', '#kpiOrders', '#kpiDue', '#kpiStock', '#kpiRestock'];
  const KPI_FEET = ['#kpiOmzetFoot', '#kpiOrdersFoot', '#kpiDueFoot', '#kpiStockFoot', '#kpiRestockFoot'];

  let lowStockItems = [];

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

  function showAlert(message, type = 'err') {
    const box = UI.$('#dashAlert');
    box.textContent = message;
    box.className = `alert ${type}`;
  }

  function setText(selector, value) {
    const element = UI.$(selector);
    if (element) element.textContent = value;
  }

  function moneyText(value) {
    if (value === undefined || value === null || value === '') return '—';
    return Layout.money(Layout.cents(value));
  }

  function countText(value) {
    return value === undefined || value === null ? '—' : String(value);
  }

  function updatedText(generatedAt) {
    return generatedAt ? `Diperbarui ${generatedAt}` : 'Data tidak tersedia';
  }

  async function logout() {
    try { await API.post('/api/auth/logout'); }
    finally { window.location.href = 'login.html'; }
  }

  function buildSidebar(user) {
    const menu = UI.el('nav', { class: 'menu' }, MENU
      .filter((m) => m.roles.includes(user.role))
      .map((m) => UI.el('a', {
        href: m.href,
        class: m.key === 'dashboard' ? 'active' : null,
        'aria-current': m.key === 'dashboard' ? 'page' : null
      }, [icon(m.key), UI.el('span', { text: m.label })])));

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
    const dateText = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    }).format(new Date());

    const search = UI.el('input', {
      id: 'dashSearch', type: 'search', autocomplete: 'off',
      placeholder: 'Cari transaksi, SKU, ...', 'aria-label': 'Cari barang berdasarkan kode atau nama'
    });
    search.addEventListener('input', () => filterStock(search.value));

    const right = UI.el('div', { class: 'dash-top-right' }, [
      UI.el('span', { class: 'dash-date', id: 'today', text: dateText }),
      UI.el('label', { class: 'dash-search' }, [icon('search'), search]),
      UI.el('div', { class: 'who' }, [
        UI.el('span', { class: 'avatar', text: initials }),
        UI.el('div', {}, [
          UI.el('div', { class: 'who-name' }, [
            UI.el('span', { text: name }),
            UI.el('span', { class: 'role', text: ROLE_LABEL[user.role] || user.role || '-' })
          ]),
          UI.el('a', { href: 'change-password.html', class: 'who-link', text: 'Ganti Password' })
        ])
      ])
    ]);

    if (SALES_ORDER_ROLES.includes(user.role)) {
      right.append(UI.el('a', {
        href: 'sales-order.html', class: 'btn dash-new-order', text: '+ Sales Order Baru'
      }));
    }

    UI.$('#topbar').replaceChildren(
      UI.el('div', { class: 'dash-top-left' }, [
        UI.el('div', { class: 'top-title', text: 'Dashboard' }),
        UI.el('span', { class: 'dash-location', text: LOCATION })
      ]),
      right
    );
  }

  function applyRole(user) {
    if (user.role === 'GUDANG') {
      UI.$$('.kpi-card.finance-kpi').forEach((card) => card.classList.add('hidden'));
      UI.$('#kpiDueLink').hidden = true;
    }

    if (user.role === 'ADMIN') {
      UI.$('#userView').classList.add('hidden');
      return;
    }

    const items = (SHORTCUT[user.role] || []).map(([label, href]) =>
      UI.el('a', { class: 'btn secondary', href, text: label }));
    UI.$('#shortcuts').replaceChildren(...items);
    UI.$('#userView').classList.remove('hidden');
  }

  function renderKpi(kpi) {
    const foot = updatedText(kpi.generatedAt);
    setText('#kpiOmzet', moneyText(kpi.omzetHariIni));
    setText('#kpiOrders', countText(kpi.orderHariIni));
    setText('#kpiDue', moneyText(kpi.piutangJatuhTempo));
    setText('#kpiStock', countText(kpi.stokMenipis));
    setText('#kpiRestock', countText(kpi.perluRestock));
    KPI_FEET.forEach((selector) => setText(selector, foot));

    const perlu = kpi.perluRestock;
    if (perlu === undefined || perlu === null) {
      setText('#restockSummary', 'Data restock tidak tersedia dari API.');
    } else {
      setText('#restockSummary', Number(perlu) > 0
        ? `${countText(perlu)} barang perlu restock segera.`
        : 'Tidak ada barang yang perlu restock segera.');
    }
  }

  function showKpiError() {
    KPI_VALUES.forEach((selector) => setText(selector, '—'));
    KPI_FEET.forEach((selector) => setText(selector, 'Data tidak tersedia'));
    setText('#restockSummary', 'Data restock tidak dapat dimuat.');
  }

  function stockRow(product) {
    const stock = product.stock === undefined || product.stock === null ? '-' : product.stock;
    const min = product.min_stock === undefined || product.min_stock === null ? '-' : product.min_stock;
    const unit = product.unit ? ` ${product.unit}` : '';
    return UI.el('tr', {
      dataset: { code: product.code || '', name: product.name || '' }
    }, [
      UI.td(product.code || '-'),
      UI.el('td', {}, [
        UI.el('div', { class: 'stock-name', text: product.name || '-' }),
        UI.el('div', { class: 'stock-cat', text: 'Kategori: belum tersedia dari API' })
      ]),
      UI.td(`${stock}${unit}`),
      UI.td(`${min}${unit}`),
      UI.el('td', {}, UI.badge('Menipis', 'err')),
      UI.el('td', {}, UI.el('button', {
        type: 'button', class: 'btn small secondary dash-action', disabled: true,
        title: 'Order pemasok (PO) masih dalam backlog', text: 'Restock'
      }))
    ]);
  }

  function renderStock(items) {
    lowStockItems = Array.isArray(items) ? items.slice() : [];
    lowStockItems.sort((a, b) =>
      (Number(a.stock) - Number(a.min_stock)) - (Number(b.stock) - Number(b.min_stock)));

    UI.fillTable(
      UI.$('#tblLow'), lowStockItems, stockRow,
      'Tidak ada barang dengan stok di bawah minimum.', 6
    );

    UI.$('#stockFoot').textContent = `Menampilkan ${lowStockItems.length} item stok kritis`;
  }

  function filterStock(query) {
    const term = query.trim().toLowerCase();
    const rows = UI.$$('#tblLow tr').filter((tr) => !tr.querySelector('.empty'));
    let shown = 0;
    rows.forEach((tr) => {
      const haystack = `${tr.dataset.code || ''} ${tr.dataset.name || ''}`.toLowerCase();
      const match = !term || haystack.includes(term);
      tr.hidden = !match;
      if (match) shown += 1;
    });
    UI.$('#stockFoot').textContent = term
      ? `Menampilkan ${shown} dari ${lowStockItems.length} item stok kritis`
      : `Menampilkan ${lowStockItems.length} item stok kritis`;
  }

  async function loadDashboard() {
    try {
      const { data } = await API.get('/api/dashboard/kpi');
      const kpi = data || {};
      renderKpi(kpi);
      renderStock(kpi.lowStock);
    } catch (err) {
      if (err.status === 401) return; // API sudah mengalihkan ke halaman login
      showKpiError();
      UI.fillTable(UI.$('#tblLow'), [], () => UI.el('tr'), 'Data stok tidak dapat dimuat.', 6);
      UI.$('#stockFoot').textContent = 'Data stok tidak tersedia.';
      showAlert(err.message || 'Gagal memuat data dashboard', 'warn');
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let user = { name: 'Pengguna', role: '' };
    try {
      const { data } = await API.get('/api/auth/me');
      user = data.user || user;
    } catch (err) {
      if (err.status === 401) return; // API sudah mengalihkan ke halaman login
      showAlert(err.message || 'Gagal memuat data pengguna', 'warn');
    }

    buildSidebar(user);
    buildTopbar(user);
    applyRole(user);
    await loadDashboard();
  });
}());
