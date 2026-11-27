/**
 * @file    customers.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-14 Daftar Pelanggan.
 *
 * Endpoint nyata:
 * - GET /api/customers → daftar pelanggan.
 * - GET /api/customers/:id → detail untuk mode Ubah (ADMIN).
 * - GET /api/customers/:id/credit → ADMIN/SALES saja.
 * - POST/PUT/PATCH /api/customers → penulisan data oleh ADMIN.
 *
 * KASIR sengaja tidak memanggil endpoint kredit. Aturan risiko memakai
 * ambang yang disetujui: outstanding >= 0.8 × credit_limit, limit > 0.
 */
(function () {
  'use strict';

  const COLUMNS = 9;
  const RISK_RATIO = 0.8;
  const MAX_CREDIT_LOOKUPS = 100;

  const state = {
    customers: [],
    credits: new Map(),
    pagination: { page: 1, total: 0, totalPages: 1 },
    page: 1,
    limit: 10,
    search: '',
    level: '',
    risk: '',
    role: '',
    loading: false
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }
  function money(cents) { return Layout.money(cents); }
  function canReadCredit() { return ['ADMIN', 'SALES'].includes(state.role); }
  function canWrite() { return state.role === 'ADMIN'; }
  function show(message, type = 'err') {
    const node = el('customerAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clear() {
    const node = el('customerAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }
  function emptyRow(message, columns) {
    return UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(columns), text: message }));
  }
  function detailRow(label, value) {
    return [
      UI.el('dt', { text: label }),
      UI.el('dd', { text: value === null || value === undefined || value === '' ? '-' : String(value) })
    ];
  }
  function creditFor(customer) {
    if (!canReadCredit()) return null;
    return state.credits.get(Number(customer.id)) || null;
  }
  function riskFor(customer) {
    const credit = creditFor(customer);
    if (!credit) return 'Tidak tersedia';
    if (credit.limitCents > 0 && credit.outstandingCents >= Math.floor(credit.limitCents * RISK_RATIO)) {
      return 'Berisiko';
    }
    return 'Aman';
  }
  function filteredCustomers() {
    return state.customers.filter((customer) => {
      if (state.level && String(customer.price_level || '') !== state.level) return false;
      if (state.risk && riskFor(customer) !== state.risk) return false;
      return true;
    });
  }

  function actionButton(label, title, onClick) {
    return UI.el('button', {
      class: 'btn secondary small', type: 'button', text: label, title,
      onclick(event) { onClick(event.currentTarget); }
    });
  }

  function actionError(error, fallback) {
    if (error && error.status === 401) return; // api.js sudah mengalihkan ke login
    const message = errorFrom(error, fallback);
    show(message);
    UI.toast(message, 'err');
  }

  async function toggleStatus(customer, button) {
    if (!canWrite()) return;
    const active = customer.is_active !== false;
    if (!UI.confirm(`${active ? 'Nonaktifkan' : 'Aktifkan'} pelanggan ${customer.code} — ${customer.name}?`)) return;
    try {
      await UI.busy(button, () => API.patch(
        `/api/customers/${encodeURIComponent(String(customer.id))}`, { is_active: !active }
      ));
      await loadCustomers();
      const message = `Pelanggan ${customer.code} berhasil ${active ? 'dinonaktifkan' : 'diaktifkan'}.`;
      show(message, 'ok');
      UI.toast(message, 'ok');
    } catch (error) {
      actionError(error, 'Gagal mengubah status pelanggan.');
    }
  }

  function renderKpis() {
    setText('kpiTotal', Number(state.pagination.total || 0).toLocaleString('id-ID'));
    if (!canReadCredit()) {
      setText('kpiOutstanding', '—');
      setText('kpiOutstandingFoot', 'Endpoint kredit hanya ADMIN/SALES');
      setText('kpiRisk', '—');
      setText('kpiRiskFoot', 'Tidak tersedia untuk KASIR');
      return;
    }
    const values = [...state.credits.values()];
    const totalCents = values.reduce((sum, item) => sum + item.outstandingCents, 0);
    const risky = state.customers.filter((customer) => riskFor(customer) === 'Berisiko').length;
    setText('kpiOutstanding', money(totalCents));
    setText('kpiOutstandingFoot', `Halaman ${state.page} · data kredit resmi`);
    setText('kpiRisk', risky);
    setText('kpiRiskFoot', 'Ambang 80% limit kredit');
  }

  function renderCustomers() {
    const list = filteredCustomers();
    if (list.length === 0) {
      el('customerBody').replaceChildren(emptyRow(
        state.search || state.level || state.risk
          ? 'Tidak ada pelanggan yang cocok pada halaman ini.'
          : 'Belum ada data pelanggan.',
        COLUMNS
      ));
      return;
    }

    el('customerBody').replaceChildren(...list.map((customer) => {
      const credit = creditFor(customer);
      const risk = riskFor(customer);
      const riskClass = risk === 'Berisiko' ? 'ui-risk--warn' : (risk === 'Aman' ? 'ui-risk--ok' : '');
      return UI.el('tr', {}, [
        UI.td(customer.code),
        UI.td(customer.name),
        UI.el('td', {}, [
          UI.el('div', { text: customer.address || '-' }),
          UI.el('div', { class: 'ui-muted-cell', text: customer.phone || '-' })
        ]),
        UI.td(customer.price_level),
        UI.td(money(Layout.cents(customer.credit_limit)), 'num'),
        UI.td(credit ? money(credit.outstandingCents) : 'Tidak tersedia', 'num'),
        UI.el('td', {}, UI.el('span', { class: `ui-risk ${riskClass}`, text: risk })),
        UI.el('td', {}, UI.el('span', {
          class: customer.is_active === false ? 'badge err' : 'badge Aman',
          text: customer.is_active === false ? 'Nonaktif' : 'Aktif'
        })),
        canWrite()
          ? UI.el('td', { class: 'right' }, UI.el('div', { class: 'ui-pager-group' }, [
            actionButton('Ubah', 'Ubah data pelanggan ini', () => {
              window.location.href = `customer-form.html?id=${encodeURIComponent(String(customer.id))}`;
            }),
            actionButton(customer.is_active === false ? 'Aktifkan' : 'Nonaktifkan',
              'Ubah status pelanggan ini', (button) => toggleStatus(customer, button))
          ]))
          : UI.td('—', 'right')
      ]);
    }));
  }

  function renderPagination() {
    const total = Number(state.pagination.total || 0);
    const totalPages = Math.max(1, Number(state.pagination.totalPages || 1));
    setText('resultInfo', total
      ? `Menampilkan ${filteredCustomers().length} dari ${total.toLocaleString('id-ID')} pelanggan`
      : 'Belum ada data pelanggan');
    setText('paginationInfo', total
      ? `Halaman ${state.page} dari ${totalPages} · ${total.toLocaleString('id-ID')} pelanggan aktif`
      : 'Tidak ada data');
    setText('pageLabel', `${state.page} / ${totalPages}`);
    el('prevPage').disabled = state.loading || state.page <= 1;
    el('nextPage').disabled = state.loading || state.page >= totalPages;
  }

  async function loadCredits(customers) {
    state.credits = new Map();
    if (!canReadCredit() || customers.length === 0) return;
    const targets = customers.slice(0, MAX_CREDIT_LOOKUPS);
    const results = await Promise.allSettled(targets.map((customer) => (
      API.get(`/api/customers/${encodeURIComponent(String(customer.id))}/credit`)
    )));
    let failed = 0;
    results.forEach((result, index) => {
      if (result.status !== 'fulfilled') { failed += 1; return; }
      const data = result.value.data || {};
      state.credits.set(Number(targets[index].id), {
        limitCents: Layout.cents(data.credit_limit),
        outstandingCents: Layout.cents(data.outstanding),
        remainingCents: Layout.cents(data.remaining_limit)
      });
    });
    if (failed > 0) show(`${failed} data kredit tidak dapat dimuat.`, 'warn');
  }

  async function loadCustomers() {
    if (state.loading) return;
    state.loading = true;
    show('Memuat daftar pelanggan…', 'warn');
    try {
      const query = new URLSearchParams({ page: String(state.page), limit: String(state.limit) });
      if (state.search) query.set('search', state.search);
      const response = await API.get(`/api/customers?${query.toString()}`);
      const data = response.data || {};
      state.customers = Array.isArray(data.customers) ? data.customers : [];
      state.pagination = data.pagination || state.pagination;
      state.page = Number(state.pagination.page) || state.page;
      await loadCredits(state.customers);
      renderKpis();
      renderCustomers();
      renderPagination();
      if (el('customerAlert').textContent.includes('Memuat')) clear();
    } catch (error) {
      if (error && error.status === 401) return;
      state.customers = [];
      state.credits = new Map();
      el('customerBody').replaceChildren(emptyRow('Gagal memuat data pelanggan.', COLUMNS));
      setText('resultInfo', 'Gagal memuat data pelanggan.');
      show(errorFrom(error, 'Gagal memuat data pelanggan.'));
    } finally {
      state.loading = false;
      renderPagination();
    }
  }

  el('filter').addEventListener('submit', (event) => {
    event.preventDefault();
    state.search = el('search').value.trim();
    state.level = el('level').value;
    state.risk = el('risk').value;
    state.limit = Math.min(100, Math.max(1, Number(el('limit').value) || 10));
    state.page = 1;
    loadCustomers();
  });
  ['level', 'risk'].forEach((id) => el(id).addEventListener('change', () => {
    state.level = el('level').value;
    state.risk = el('risk').value;
    renderCustomers();
    renderPagination();
  }));
  el('prevPage').addEventListener('click', () => {
    if (state.page > 1) { state.page -= 1; loadCustomers(); }
  });
  el('nextPage').addEventListener('click', () => {
    if (state.page < Number(state.pagination.totalPages || 1)) { state.page += 1; loadCustomers(); }
  });
  el('btnAdd').addEventListener('click', () => { window.location.href = 'customer-form.html'; });

  Layout.start(async () => {
    state.role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    if (!canReadCredit()) {
      el('risk').disabled = true;
      el('risk').title = 'Risiko memerlukan endpoint kredit ADMIN/SALES';
    }
    if (state.role !== 'ADMIN') el('btnAdd').classList.add('hidden');
    await loadCustomers();
  });
}());
