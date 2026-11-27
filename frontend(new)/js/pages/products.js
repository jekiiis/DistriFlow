/**
 * @file    products.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-11 Daftar Barang — GET /api/products, GET /api/products/restock,
 * PUT persiapan via product-form.html, dan PATCH status untuk ADMIN.
 *
 * Ekspor XLSX dan modul PO tidak termasuk cakupan v1.0; tombolnya sengaja
 * tetap nonaktif. GUDANG dapat melihat data, tetapi tidak mengubahnya.
 */
(function () {
  'use strict';

  const COLUMNS = 9;
  const RESTOCK_COLUMNS = 8;
  const SEARCH_DELAY_MS = 250;
  const MAX_PAGE_LIMIT = 100;

  const state = {
    products: [],
    restock: [],
    restockGeneratedAt: '',
    pagination: { page: 1, total: 0, totalPages: 1 },
    page: 1,
    limit: 25,
    search: '',
    lowOnly: false,
    role: '',
    timer: null,
    loading: false,
    restockLoading: false
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }
  function money(value) { return Layout.money(Layout.cents(value)); }
  function canWrite() { return state.role === 'ADMIN'; }
  function display(value) {
    return value === null || value === undefined || value === '' ? '—' : String(value);
  }
  function showAlert(message, type = 'err') {
    const node = el('productAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clearAlert() {
    const node = el('productAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function emptyRow(message, columns) {
    return UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(columns), text: message }));
  }
  function isLow(product) {
    return Number(product.stock) <= Number(product.min_stock);
  }
  function filteredProducts() {
    return state.lowOnly ? state.products.filter(isLow) : state.products;
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }
  function actionError(error, fallback) {
    if (error && error.status === 401) return; // api.js sudah mengalihkan ke login
    const message = errorFrom(error, fallback);
    showAlert(message);
    UI.toast(message, 'err');
  }

  function renderKpis() {
    setText('kpiSku', Number(state.pagination.total || 0).toLocaleString('id-ID'));
    setText('kpiLow', state.restock.length);
    setText('kpiOut', state.products.filter((product) => Number(product.stock) === 0).length);
    setText('kpiSkuFoot', `Total dari API · halaman ${state.page}`);
    setText('kpiLowFoot', state.restock.length ? 'Dari saran backend' : 'Belum ada saran restock');
  }

  function estimateFor(product) {
    const item = state.restock.find((entry) => Number(entry.id) === Number(product.id));
    if (!item || item.estimated_days === null || item.estimated_days === undefined) return '—';
    return `${item.estimated_days} hari`;
  }

  function actionButton(label, title, onClick) {
    return UI.el('button', {
      class: 'btn secondary small', type: 'button', text: label, title,
      onclick(event) { onClick(event.currentTarget); }
    });
  }

  function renderProducts() {
    const list = filteredProducts();
    if (list.length === 0) {
      el('productBody').replaceChildren(emptyRow(
        state.search
          ? 'Tidak ada barang yang cocok pada halaman ini.'
          : 'Belum ada data barang.',
        COLUMNS
      ));
      return;
    }

    el('productBody').replaceChildren(...list.map((product) => {
      const low = isLow(product);
      const actions = canWrite()
        ? [
          actionButton('Ubah', 'Ubah data barang ini', () => {
            window.location.href = `product-form.html?id=${encodeURIComponent(String(product.id))}`;
          }),
          actionButton('Nonaktifkan', 'Nonaktifkan barang ini', (button) => deactivate(product, button))
        ]
        : [];
      return UI.el('tr', {}, [
        UI.td(product.code),
        UI.el('td', { text: product.name }),
        UI.td(product.unit),
        UI.td(money(product.price_retail), 'num'),
        UI.td(money(product.price_wholesale), 'num'),
        UI.el('td', { class: 'num' }, [
          UI.el('span', { text: String(product.stock) }),
          low ? UI.el('span', { class: 'badge warn', text: 'Menipis' }) : null
        ]),
        UI.td(estimateFor(product)),
        UI.el('td', {}, UI.el('span', { class: 'badge Aman', text: 'Aktif' })),
        actions.length
          ? UI.el('td', { class: 'right' }, UI.el('div', { class: 'ui-pager-group' }, actions))
          : UI.td('—', 'right')
      ]);
    }));
  }

  function renderRestock() {
    const list = state.restock;
    if (list.length === 0) {
      el('restockBody').replaceChildren(emptyRow('Belum ada barang yang memerlukan restock.', RESTOCK_COLUMNS));
      setText('restockInfo', state.restockGeneratedAt
        ? `Belum ada saran restock · diperbarui ${state.restockGeneratedAt}`
        : 'Belum ada saran restock dari backend.');
      return;
    }

    el('restockBody').replaceChildren(...list.map((item) => UI.el('tr', {}, [
      UI.el('td', {}, [
        UI.el('div', { text: display(item.name) }),
        UI.el('div', { class: 'ui-muted-cell', text: display(item.code) })
      ]),
      UI.td(display(item.stock), 'num'),
      UI.td(display(item.min_stock), 'num'),
      UI.td(display(item.avg_daily)),
      UI.td(display(item.estimated_days)),
      UI.td(display(item.suggested_qty), 'num'),
      UI.td(display(item.reason)),
      UI.el('td', {}, UI.el('button', {
        class: 'btn secondary small', type: 'button', text: '+ Buat PO Pemasok',
        disabled: true, title: 'Modul PO belum termasuk cakupan v1.0'
      }))
    ])));
    setText('restockInfo', `${list.length} barang memerlukan restock · saran dari backend${state.restockGeneratedAt ? ` · diperbarui ${state.restockGeneratedAt}` : ''}`);
  }

  function renderPagination() {
    const total = Number(state.pagination.total || 0);
    const totalPages = Math.max(1, Number(state.pagination.totalPages || 1));
    setText('resultInfo', total
      ? `Menampilkan ${filteredProducts().length} dari ${total.toLocaleString('id-ID')} data barang`
      : 'Belum ada data barang');
    setText('paginationInfo', total
      ? `Halaman ${state.page} dari ${totalPages} · ${total.toLocaleString('id-ID')} barang aktif`
      : 'Tidak ada data');
    setText('pageLabel', `${state.page} / ${totalPages}`);
    el('prevPage').disabled = state.loading || state.page <= 1;
    el('nextPage').disabled = state.loading || state.page >= totalPages;
  }

  async function loadProducts() {
    if (state.loading) return;
    state.loading = true;
    showAlert('Memuat daftar barang…', 'warn');
    el('prevPage').disabled = true;
    el('nextPage').disabled = true;
    try {
      const query = new URLSearchParams({
        page: String(state.page), limit: String(state.limit)
      });
      if (state.search) query.set('search', state.search);
      const response = await API.get(`/api/products?${query.toString()}`);
      const data = response.data || {};
      state.products = Array.isArray(data.products) ? data.products : [];
      state.pagination = data.pagination || state.pagination;
      state.page = Number(state.pagination.page) || state.page;
      renderKpis();
      renderProducts();
      renderPagination();
      clearAlert();
    } catch (error) {
      if (error && error.status === 401) return;
      state.products = [];
      el('productBody').replaceChildren(emptyRow('Gagal memuat data barang.', COLUMNS));
      setText('resultInfo', 'Gagal memuat data barang.');
      showAlert(errorFrom(error, 'Gagal memuat data barang.'));
    } finally {
      state.loading = false;
      renderPagination();
    }
  }

  async function loadRestock() {
    if (state.restockLoading) return;
    state.restockLoading = true;
    setText('restockInfo', 'Memuat saran restock…');
    el('restockBody').replaceChildren(emptyRow('Memuat saran restock…', RESTOCK_COLUMNS));
    try {
      const response = await API.get('/api/products/restock');
      const data = response.data || {};
      state.restock = Array.isArray(data.products) ? data.products : [];
      state.restockGeneratedAt = data.generated_at ? String(data.generated_at) : '';
      renderRestock();
      renderKpis();
    } catch (error) {
      if (error && error.status === 401) return;
      state.restock = [];
      el('restockBody').replaceChildren(emptyRow('Saran restock tidak dapat dimuat.', RESTOCK_COLUMNS));
      setText('restockInfo', errorFrom(error, 'Gagal memuat saran restock.'));
    } finally {
      state.restockLoading = false;
    }
  }

  async function deactivate(product, button) {
    if (!canWrite()) return;
    const label = `${product.code} — ${product.name}`;
    if (!UI.confirm(`Nonaktifkan barang ${label}? Barang tidak akan tersedia untuk transaksi baru.`)) return;
    try {
      await UI.busy(button, () => API.patch(
        `/api/products/${encodeURIComponent(String(product.id))}`, { is_active: false }
      ));
      await Promise.all([loadProducts(), loadRestock()]);
      const message = `Barang ${label} berhasil dinonaktifkan.`;
      showAlert(message, 'ok');
      UI.toast(message, 'ok');
    } catch (error) {
      actionError(error, 'Gagal menonaktifkan barang.');
    }
  }

  function scheduleSearch() {
    window.clearTimeout(state.timer);
    state.timer = window.setTimeout(() => {
      state.search = el('search').value.trim();
      state.page = 1;
      loadProducts();
    }, SEARCH_DELAY_MS);
  }

  el('search').addEventListener('input', scheduleSearch);
  el('filter').addEventListener('submit', (event) => {
    event.preventDefault();
    state.search = el('search').value.trim();
    state.limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Number(el('limit').value) || 25));
    state.page = 1;
    loadProducts();
  });
  el('lowOnly').addEventListener('change', () => {
    state.lowOnly = el('lowOnly').checked;
    renderProducts();
    renderPagination();
  });
  el('limit').addEventListener('change', () => {
    state.limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Number(el('limit').value) || 25));
    state.page = 1;
    loadProducts();
  });
  el('prevPage').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadProducts(); }
  });
  el('nextPage').addEventListener('click', () => {
    if (state.page < Number(state.pagination.totalPages || 1)) { state.page += 1; loadProducts(); }
  });
  el('btnAdd').addEventListener('click', () => { window.location.href = 'product-form.html'; });
  el('btnExport').addEventListener('click', () => UI.toast('Ekspor XLSX masuk backlog v1.0.', 'warn'));
  el('btnPO').addEventListener('click', () => UI.toast('Modul pengadaan/PO belum termasuk v1.0.', 'warn'));

  Layout.start(async () => {
    state.role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    if (!canWrite()) el('btnAdd').classList.add('hidden');
    await Promise.all([loadProducts(), loadRestock()]);
  });
}());
