/**
 * @file    orders.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-07 Daftar Sales Order — rancangan Figma dengan data dari GET /api/orders.
 *
 * Filter tanggal, status, dan pencarian memakai query backend. Ringkasan KPI
 * dihitung dari order yang berhasil dimuat. Admin dapat membatalkan order
 * DRAFT/PIUTANG melalui POST /api/orders/:id/cancel.
 */
(function () {
  'use strict';

  const LIMIT = 100;
  const PAGE_SIZE = 10;
  const COLUMNS = 7;
  const SEARCH_DELAY_MS = 300;

  const state = { orders: [], page: 1, token: 0, role: '', loading: false, cancelling: false };
  let searchTimer = null;

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }

  const nodes = {
    alert: el('ordersAlert'),
    form: el('filter'),
    from: el('from'),
    to: el('to'),
    status: el('status'),
    q: el('q'),
    reset: el('btnReset'),
    tbody: el('tbl'),
    prev: el('prevPage'),
    next: el('nextPage'),
    add: el('btnTambah')
  };

  function showAlert(message, type = 'err') {
    nodes.alert.textContent = message;
    nodes.alert.className = `alert ${type}`;
    nodes.alert.classList.remove('hidden');
  }

  function clearAlert() {
    nodes.alert.textContent = '';
    nodes.alert.className = 'alert err hidden';
  }

  function emptyRow(message) {
    nodes.tbody.replaceChildren(UI.el('tr', {}, UI.el('td', {
      class: 'empty', colspan: String(COLUMNS), text: message
    })));
  }

  function link(href, label, title) {
    return UI.el('a', { class: 'btn secondary', href, title: title || label, text: label });
  }

  async function openInvoice(id) {
    try {
      await API.openPdf(`/api/orders/${encodeURIComponent(String(id))}/invoice.pdf?format=a4`);
      UI.toast('Invoice dibuka di tab baru.', 'ok');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal membuka invoice.');
    }
  }

  function invoiceLink(id, orderNo) {
    return UI.el('a', {
      class: 'btn secondary', href: '#', title: `Cetak invoice ${orderNo}`, text: 'Invoice',
      onclick(event) {
        event.preventDefault();
        openInvoice(id);
      }
    });
  }

  async function cancelOrder(id, orderNo, button) {
    if (state.cancelling || state.role !== 'ADMIN') return;
    const reason = window.prompt(`Alasan pembatalan order ${orderNo} (wajib):`, '');
    if (reason === null) return;
    const cleanReason = reason.trim();
    if (!cleanReason) {
      showAlert('Alasan pembatalan wajib diisi.');
      return;
    }
    if (cleanReason.length > 255) {
      showAlert('Alasan pembatalan maksimal 255 karakter.');
      return;
    }
    if (!UI.confirm(`Batalkan order ${orderNo}? Stok dikembalikan hanya untuk order berstatus Piutang.`)) return;

    state.cancelling = true;
    clearAlert();
    try {
      await UI.busy(button, () => API.post(
        `/api/orders/${encodeURIComponent(String(id))}/cancel`, { reason: cleanReason }
      ));
      await loadOrders();
      showAlert(`Order ${orderNo} berhasil dibatalkan.`, 'ok');
      UI.toast(`Order ${orderNo} dibatalkan.`, 'ok');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal membatalkan order.');
    } finally {
      state.cancelling = false;
    }
  }

  function totalPages() {
    return Math.max(1, Math.ceil(state.orders.length / PAGE_SIZE));
  }

  function renderSummary() {
    const sum = { all: 0, DRAFT: 0, LUNAS: 0, PIUTANG: 0 };
    const count = { all: 0, DRAFT: 0, LUNAS: 0, PIUTANG: 0 };
    state.orders.forEach((order) => {
      const cents = Layout.cents(order.total);
      sum.all += cents;
      count.all += 1;
      if (Object.prototype.hasOwnProperty.call(sum, order.status)) {
        sum[order.status] += cents;
        count[order.status] += 1;
      }
    });
    setText('kpiTotal', Layout.money(sum.all));
    setText('kpiTotalCount', `${count.all} transaksi`);
    setText('kpiDraft', Layout.money(sum.DRAFT));
    setText('kpiDraftCount', `${count.DRAFT} faktur`);
    setText('kpiLunas', Layout.money(sum.LUNAS));
    setText('kpiLunasCount', `${count.LUNAS} order`);
    setText('kpiPiutang', Layout.money(sum.PIUTANG));
    setText('kpiPiutangCount', `${count.PIUTANG} order berjalan`);
  }

  function renderRows() {
    const pages = totalPages();
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const visible = state.orders.slice(start, start + PAGE_SIZE);

    if (visible.length === 0) {
      emptyRow('Tidak ada sales order yang cocok dengan filter.');
    } else {
      nodes.tbody.replaceChildren(...visible.map((order) => {
        const id = String(order.id);
        const orderNo = String(order.order_no || '-');
        const detailHref = `order-detail.html?id=${encodeURIComponent(id)}`;
        const actions = UI.el('div', { style: 'display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap' }, [
          link(detailHref, 'Detail', `Lihat detail ${orderNo}`)
        ]);

        if (state.role === 'KASIR' && order.status === 'DRAFT') {
          actions.append(link(
            `payment.html?id=${encodeURIComponent(id)}`, 'Bayar', `Bayar order ${orderNo}`
          ));
        }
        if ((state.role === 'ADMIN' || state.role === 'KASIR') &&
            (order.status === 'LUNAS' || order.status === 'PIUTANG')) {
          actions.append(invoiceLink(id, orderNo));
        }
        if (state.role === 'ADMIN' && ['DRAFT', 'PIUTANG'].includes(order.status)) {
          actions.append(UI.el('button', {
            class: 'btn small danger', type: 'button', text: 'Batalkan',
            title: `Batalkan order ${orderNo}`,
            onclick(event) { cancelOrder(id, orderNo, event.currentTarget); }
          }));
        }

        return UI.el('tr', {}, [
          UI.el('td', {}, link(detailHref, orderNo, `Buka detail ${orderNo}`)),
          UI.td(UI.tanggal(order.order_date)),
          UI.td(order.customer_name || order.customer_code || '-'),
          UI.td(order.user_name || '-'),
          UI.td(Layout.money(Layout.cents(order.total)), 'num'),
          UI.el('td', {}, UI.statusBadge(order.status)),
          UI.el('td', { class: 'right' }, actions)
        ]);
      }));
    }

    const end = Math.min(start + PAGE_SIZE, state.orders.length);
    setText('resultInfo', state.orders.length
      ? `Menampilkan ${start + 1}–${end} dari ${state.orders.length} order`
      : 'Tidak ada order yang cocok dengan filter.');
    setText('paginationInfo', state.orders.length
      ? `Halaman ${state.page} dari ${pages} · ${state.orders.length} order`
      : 'Tidak ada sales order');
    setText('pageLabel', String(state.page));
    nodes.prev.disabled = state.loading || state.page <= 1;
    nodes.next.disabled = state.loading || state.page >= pages;
  }

  function setLoading(loading) {
    state.loading = loading;
    [nodes.from, nodes.to, nodes.status, nodes.q, nodes.reset].forEach((node) => {
      if (node) node.disabled = loading;
    });
    if (loading) emptyRow('Memuat daftar sales order…');
    renderRows();
  }

  function buildQuery() {
    const params = new URLSearchParams({ limit: String(LIMIT) });
    if (nodes.from.value) params.set('date_from', nodes.from.value);
    if (nodes.to.value) params.set('date_to', nodes.to.value);
    if (nodes.status.value) params.set('status', nodes.status.value);
    if (nodes.q.value.trim()) params.set('q', nodes.q.value.trim());
    return `/api/orders?${params}`;
  }

  async function loadOrders() {
    if (nodes.from.value && nodes.to.value && nodes.to.value < nodes.from.value) {
      showAlert('Tanggal akhir tidak boleh sebelum tanggal awal');
      return;
    }

    const token = ++state.token;
    clearAlert();
    setLoading(true);
    try {
      const response = await API.get(buildQuery());
      if (token !== state.token) return;
      state.orders = Array.isArray(response.data && response.data.orders)
        ? response.data.orders : [];
      renderSummary();
      renderRows();
    } catch (error) {
      if (token !== state.token) return;
      state.orders = [];
      emptyRow('Gagal memuat data sales order.');
      setText('resultInfo', 'Data tidak tersedia.');
      setText('paginationInfo', '-');
      showAlert((error && error.message) || 'Gagal memuat daftar sales order.');
    } finally {
      if (token === state.token) setLoading(false);
    }
  }

  nodes.form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.page = 1;
    loadOrders();
  });

  nodes.reset.addEventListener('click', () => {
    nodes.from.value = '';
    nodes.to.value = '';
    nodes.status.value = '';
    nodes.q.value = '';
    state.page = 1;
    loadOrders();
  });

  nodes.q.addEventListener('input', () => {
    if (searchTimer) window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      searchTimer = null;
      state.page = 1;
      loadOrders();
    }, SEARCH_DELAY_MS);
  });

  nodes.prev.addEventListener('click', () => {
    if (state.page > 1 && !state.loading) {
      state.page -= 1;
      renderRows();
    }
  });

  nodes.next.addEventListener('click', () => {
    if (state.page < totalPages() && !state.loading) {
      state.page += 1;
      renderRows();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      event.preventDefault();
      nodes.q.focus();
    }
  });

  Layout.start(async () => {
    state.role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    nodes.add.classList.toggle('hidden', !['ADMIN', 'SALES'].includes(state.role));
    await loadOrders();
  });
}());
