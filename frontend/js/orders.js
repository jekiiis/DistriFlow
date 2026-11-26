'use strict';

/**
 * UI-07 Daftar Sales Order.
 * Memakai GET /api/orders untuk filter, pencarian, dan pagination. Aksi
 * ditampilkan menurut peran dan status; tidak ada pembatalan order di UI-08.
 */
(function initOrders() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  if (!api || !ui) {
    return;
  }

  const PAGE_LIMIT = 10;
  const SEARCH_DELAY_MS = 300;
  const COLUMN_COUNT = 7;

  const els = {
    alert: document.getElementById('orders-alert'),
    logout: document.getElementById('logout-button'),
    addOrder: document.getElementById('add-order'),
    count: document.getElementById('order-count'),
    form: document.getElementById('order-filters'),
    search: document.getElementById('order-search'),
    dateFrom: document.getElementById('date-from'),
    dateTo: document.getElementById('date-to'),
    status: document.getElementById('status-filter'),
    reset: document.getElementById('filter-reset'),
    tbody: document.getElementById('orders-body'),
    prev: document.getElementById('prev-page'),
    next: document.getElementById('next-page'),
    pageLabel: document.getElementById('page-label'),
    paginationInfo: document.getElementById('pagination-info')
  };

  const state = {
    q: '',
    status: '',
    dateFrom: '',
    dateTo: '',
    page: 1,
    totalPages: 0,
    role: '',
    orders: []
  };

  let requestToken = 0;
  let searchTimer = null;

  function showAlert(message, type) {
    els.alert.textContent = message;
    els.alert.className = 'df-alert df-alert--' + (type === 'warning' ? 'warning' : 'error');
    els.alert.hidden = false;
  }

  function clearAlert() {
    els.alert.hidden = true;
    els.alert.textContent = '';
  }

  function appendTextCell(row, value, className) {
    const cell = document.createElement('td');
    if (className) {
      cell.className = className;
    }
    cell.textContent = value === null || value === undefined ? '' : String(value);
    row.appendChild(cell);
    return cell;
  }

  function makeLink(href, label, ariaLabel) {
    const link = document.createElement('a');
    link.className = 'df-btn df-btn--secondary df-btn--sm';
    link.href = href;
    link.textContent = label;
    if (ariaLabel) {
      link.setAttribute('aria-label', ariaLabel);
    }
    return link;
  }

  function statusBadge(status) {
    const text = String(status || '-');
    let modifier = '';
    if (text === 'LUNAS') {
      modifier = ' df-badge--success';
    } else if (text === 'PIUTANG') {
      modifier = ' df-badge--info';
    } else if (text === 'DRAFT') {
      modifier = ' df-badge--warning';
    } else if (text === 'BATAL') {
      modifier = ' df-badge--danger';
    }
    const badge = document.createElement('span');
    badge.className = 'df-badge' + modifier;
    badge.textContent = text;
    return badge;
  }

  function renderEmpty(message) {
    els.tbody.textContent = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'df-table__empty';
    cell.colSpan = COLUMN_COUNT;
    cell.textContent = message;
    row.appendChild(cell);
    els.tbody.appendChild(row);
  }

  function renderOrders(orders) {
    els.tbody.textContent = '';

    if (!orders || orders.length === 0) {
      renderEmpty('Tidak ada sales order yang cocok dengan filter.');
      return;
    }

    const role = String(state.role || '').toUpperCase();

    orders.forEach((order) => {
      const id = String(order.id);
      const orderNo = String(order.order_no || '-');
      const status = String(order.status || '');
      const row = document.createElement('tr');

      const noCell = document.createElement('td');
      noCell.appendChild(makeLink(
        '/pages/order-detail.html?id=' + encodeURIComponent(id),
        orderNo,
        'Buka detail ' + orderNo
      ));
      row.appendChild(noCell);

      appendTextCell(row, order.order_date || '-');
      appendTextCell(row, order.customer_name || order.customer_code || '-');
      appendTextCell(row, order.user_name || '-');
      appendTextCell(row, ui.formatRupiah(order.total), 'df-table__num');

      const statusCell = document.createElement('td');
      statusCell.appendChild(statusBadge(status));
      row.appendChild(statusCell);

      const actionCell = document.createElement('td');
      actionCell.className = 'df-right';
      const actions = document.createElement('div');
      actions.className = 'df-btn-group';
      actions.style.justifyContent = 'flex-end';

      actions.appendChild(makeLink(
        '/pages/order-detail.html?id=' + encodeURIComponent(id),
        'Detail',
        'Lihat detail ' + orderNo
      ));

      if (role === 'KASIR' && status === 'DRAFT') {
        actions.appendChild(makeLink(
          '/pages/payment.html?id=' + encodeURIComponent(id),
          'Bayar',
          'Bayar order ' + orderNo
        ));
      }

      if ((role === 'ADMIN' || role === 'KASIR') &&
          (status === 'LUNAS' || status === 'PIUTANG')) {
        actions.appendChild(makeLink(
          '/pages/order-detail.html?id=' + encodeURIComponent(id) + '&print=1',
          'Cetak',
          'Cetak invoice ' + orderNo
        ));
      }

      actionCell.appendChild(actions);
      row.appendChild(actionCell);
      els.tbody.appendChild(row);
    });
  }

  function setLoading(loading) {
    [els.search, els.dateFrom, els.dateTo, els.status, els.reset].forEach((element) => {
      if (element) {
        element.disabled = loading;
      }
    });

    els.prev.disabled = true;
    els.next.disabled = true;

    if (loading) {
      renderEmpty('Memuat daftar sales order…');
      ui.setText(els.count, 'Memuat daftar sales order…');
    }
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.q) {
      params.set('q', state.q);
    }
    if (state.status) {
      params.set('status', state.status);
    }
    if (state.dateFrom) {
      params.set('date_from', state.dateFrom);
    }
    if (state.dateTo) {
      params.set('date_to', state.dateTo);
    }
    params.set('page', String(state.page));
    params.set('limit', String(PAGE_LIMIT));
    return '/orders?' + params.toString();
  }

  function renderPagination(pagination) {
    const total = Number(pagination && pagination.total) || 0;
    const totalPages = Number(pagination && pagination.totalPages) || 0;
    state.totalPages = totalPages;

    if (pagination && Number(pagination.page) > 0) {
      state.page = Number(pagination.page);
    }

    if (total === 0) {
      ui.setText(els.paginationInfo, 'Tidak ada sales order');
    } else {
      ui.setText(
        els.paginationInfo,
        'Halaman ' + state.page + ' dari ' + Math.max(totalPages, 1) + ' · ' + total + ' order'
      );
    }

    ui.setText(els.pageLabel, String(state.page));
    els.prev.disabled = state.page <= 1;
    els.next.disabled = totalPages === 0 || state.page >= totalPages;
    ui.setText(els.count, 'Data Sales Order · ' + total + ' ditemukan');
  }

  async function loadOrders() {
    const token = ++requestToken;
    clearAlert();
    setLoading(true);

    try {
      const data = await api.get(buildQuery());
      if (token !== requestToken) {
        return;
      }

      const pagination = data && data.pagination ? data.pagination : {};
      const pages = Number(pagination.totalPages) || 0;
      if (pages > 0 && state.page > pages) {
        state.page = pages;
        await loadOrders();
        return;
      }

      state.orders = data && Array.isArray(data.orders) ? data.orders : [];
      renderOrders(state.orders);
      renderPagination(pagination);
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      state.orders = [];
      renderEmpty('Gagal memuat data sales order.');
      ui.setText(els.paginationInfo, '');
      els.prev.disabled = true;
      els.next.disabled = true;
      showAlert((error && error.message) || 'Gagal memuat daftar sales order.');
    } finally {
      if (token === requestToken) {
        setLoading(false);
      }
    }
  }

  function applySessionUser(user) {
    const name = String((user && user.name) || 'Pengguna');
    const role = String((user && user.role) || '-');

    state.role = role.toUpperCase();
    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.buildSidebar(role, 'orders');

    const canCreate = state.role === 'ADMIN' || state.role === 'SALES';
    els.addOrder.classList.toggle('df-hidden', !canCreate);
    renderOrders(state.orders);
  }

  async function loadSession() {
    try {
      const data = await api.get('/auth/me');
      applySessionUser(data && data.user ? data.user : {});
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat data sesi.');
    }
  }

  function applyFilters() {
    state.q = els.search.value.trim();
    state.status = els.status.value;
    state.dateFrom = els.dateFrom.value;
    state.dateTo = els.dateTo.value;
    state.page = 1;
  }

  function cancelScheduledSearch() {
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  function scheduleSearch() {
    cancelScheduledSearch();
    searchTimer = window.setTimeout(() => {
      searchTimer = null;
      applyFilters();
      loadOrders();
    }, SEARCH_DELAY_MS);
  }

  els.form.addEventListener('submit', (event) => {
    event.preventDefault();
    cancelScheduledSearch();
    applyFilters();
    loadOrders();
  });

  els.search.addEventListener('input', scheduleSearch);
  els.status.addEventListener('change', () => {
    cancelScheduledSearch();
    applyFilters();
    loadOrders();
  });
  els.dateFrom.addEventListener('change', () => {
    cancelScheduledSearch();
    applyFilters();
    loadOrders();
  });
  els.dateTo.addEventListener('change', () => {
    cancelScheduledSearch();
    applyFilters();
    loadOrders();
  });
  els.reset.addEventListener('click', () => {
    cancelScheduledSearch();
    els.search.value = '';
    els.status.value = '';
    els.dateFrom.value = '';
    els.dateTo.value = '';
    applyFilters();
    loadOrders();
  });

  els.prev.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadOrders();
    }
  });

  els.next.addEventListener('click', () => {
    if (state.totalPages > 0 && state.page < state.totalPages) {
      state.page += 1;
      loadOrders();
    }
  });

  ui.setupLogout(els.logout);
  renderOrders([]);
  loadSession();
  loadOrders();
}());
