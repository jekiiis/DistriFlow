/**
 * @file    payment.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-09 Kasir & Loket Pembayaran.
 *
 * Endpoint nyata:
 * - GET /api/orders?status=DRAFT → daftar order yang menunggu bayar.
 * - GET /api/orders/:id → rincian tagihan.
 * - POST /api/orders/:id/payments → { payment_type, method, nominal, note? }.
 * - GET /api/orders/:id/invoice.pdf?format=a4|80mm → faktur/struk PDF.
 *
 * KASIR tidak memiliki endpoint /customers/:id/credit. Sisa limit pada form
 * therefore dihitung dari data pelanggan + order PIUTANG yang dapat diakses
 * KASIR, lalu diberi label "perkiraan". Backend tetap menjadi penentu final.
 */
(function () {
  'use strict';

  const CATALOG_LIMIT = 100;
  const CREDIT_ORDER_LIMIT = 100;
  const MAX_CREDIT_PAGES = 100;
  const MAX_CREDIT_ORDER_DETAILS = 200;
  const DRAFT_COLUMNS = 7;
  const ITEM_COLUMNS = 6;

  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  const orderId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;

  const state = {
    orders: [],
    order: null,
    role: '',
    totalCents: 0,
    credit: null,
    outstandingCents: 0,
    remainingCents: 0,
    processing: false,
    printing: false
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }
  function showAlert(message, type = 'err') {
    const node = el('paymentAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clearAlert() {
    const node = el('paymentAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function money(cents) { return Layout.money(cents); }
  function emptyRow(message, columns) {
    return UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(columns), text: message }));
  }
  function detailRow(label, value) {
    return [
      UI.el('dt', { text: label }),
      UI.el('dd', { text: value === null || value === undefined || value === '' ? '-' : String(value) })
    ];
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }

  function renderDrafts() {
    const search = el('draftSearch').value.trim().toLowerCase();
    const list = state.orders.filter((order) => {
      if (!search) return true;
      return [order.order_no, order.customer_name, order.customer_code, order.user_name]
        .some((value) => String(value || '').toLowerCase().includes(search));
    });

    if (list.length === 0) {
      el('draftBody').replaceChildren(emptyRow(
        state.orders.length ? 'Tidak ada order yang cocok.' : 'Belum ada sales order berstatus Draft.',
        DRAFT_COLUMNS
      ));
      return;
    }

    el('draftBody').replaceChildren(...list.map((order) => UI.el('tr', {}, [
      UI.td(order.order_no),
      UI.td(UI.tanggal(order.order_date)),
      UI.td(order.customer_name || order.customer_code),
      UI.td(order.user_name || `ID ${order.user_id}`),
      UI.td(money(Layout.cents(order.total)), 'num'),
      UI.el('td', {}, UI.statusBadge(order.status)),
      UI.el('td', {}, UI.el('a', {
        class: 'btn small',
        href: `payment.html?id=${encodeURIComponent(String(order.id))}`,
        text: 'Bayar'
      }))
    ])));
  }

  async function loadDrafts() {
    if (orderId) return;
    showAlert('Memuat order Draft…', 'warn');
    try {
      const response = await API.get('/api/orders?status=DRAFT&limit=100');
      const data = response.data || {};
      state.orders = Array.isArray(data.orders) ? data.orders : [];
      renderDrafts();
      clearAlert();
    } catch (error) {
      el('draftBody').replaceChildren(emptyRow('Gagal memuat order Draft.', DRAFT_COLUMNS));
      showAlert(errorFrom(error, 'Gagal memuat order Draft.'));
    }
  }

  function renderItems(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      el('itemBody').replaceChildren(emptyRow('Tidak ada barang pada order ini.', ITEM_COLUMNS));
      return;
    }
    el('itemBody').replaceChildren(...list.map((item) => UI.el('tr', {}, [
      UI.td(item.code),
      UI.td(item.name),
      UI.td(money(Layout.cents(item.unit_price)), 'num'),
      UI.td(item.qty, 'num'),
      UI.td(money(Layout.cents(item.discount)), 'num'),
      UI.td(money(Layout.cents(item.line_total)), 'num')
    ])));
  }

  function getPaymentType() {
    return el('typeKredit').checked && !el('typeKredit').disabled ? 'KREDIT' : 'TUNAI';
  }

  function setFormDisabled(disabled) {
    const locked = disabled || !state.order || state.order.status !== 'DRAFT';
    ['nominal', 'method', 'note', 'typeTunai', 'typeKredit'].forEach((id) => {
      el(id).disabled = locked;
    });
    el('typeKredit').disabled = locked || !state.credit || state.remainingCents <= 0;
    if (el('typeKredit').disabled && el('typeKredit').checked) {
      el('typeTunai').checked = true;
    }
    UI.$$('#quick button').forEach((button) => { button.disabled = locked; });
  }

  function computePreview() {
    if (!state.order || state.order.status !== 'DRAFT') return { disabled: true };

    const nominalCents = Layout.parseMoneyCents(el('nominal').value, false);
    if (nominalCents === null || nominalCents === 0) {
      return { error: 'Nominal tidak valid' };
    }

    const paymentType = getPaymentType();
    const method = el('method').value;
    const totalCents = state.totalCents;

    if (method === 'TRANSFER' && nominalCents > totalCents) {
      return { error: 'Transfer tidak boleh melebihi total' };
    }
    if (nominalCents >= totalCents) {
      const changeCents = nominalCents - totalCents;
      return {
        nominalCents,
        changeCents,
        status: 'LUNAS',
        message: `LUNAS · Kembalian ${money(changeCents)}`
      };
    }
    if (paymentType === 'TUNAI') {
      return { error: `Nominal kurang ${UI.rupiah((totalCents - nominalCents) / 100)}` };
    }

    const remainingCents = totalCents - nominalCents;
    if (!state.credit || state.remainingCents <= 0 || remainingCents > state.remainingCents) {
      return { error: 'Melebihi limit kredit' };
    }
    return {
      nominalCents,
      changeCents: 0,
      status: 'PIUTANG',
      message: `PIUTANG · Sisa piutang ${money(remainingCents)}`
    };
  }

  function updatePreview() {
    if (state.processing || !state.order || state.order.status !== 'DRAFT') {
      el('preview').className = 'alert err hidden';
      setText('change', money(0));
      el('btnProses').disabled = true;
      return;
    }

    const preview = computePreview();
    if (preview.error) {
      el('preview').className = 'alert err';
      el('preview').textContent = preview.error;
      setText('change', money(0));
      el('btnProses').disabled = true;
      return;
    }
    el('preview').className = 'alert ok';
    el('preview').textContent = preview.message;
    setText('change', money(preview.changeCents || 0));
    el('btnProses').disabled = false;
  }

  function renderQuick() {
    const values = [
      { label: 'Uang Pas', cents: state.totalCents },
      { label: 'Rp50.000', cents: 5000000 },
      { label: 'Rp100.000', cents: 10000000 },
      { label: 'Rp500.000', cents: 50000000 }
    ];
    el('quick').replaceChildren(...values.map((item) => UI.el('button', {
      class: 'btn secondary small',
      type: 'button',
      text: item.label,
      disabled: !state.order || state.order.status !== 'DRAFT',
      onclick() {
        el('nominal').value = Layout.decimal(item.cents);
        updatePreview();
      }
    })));
  }

  function applyCredit(credit) {
    state.credit = credit || null;
    state.remainingCents = credit ? Layout.cents(credit.remaining_limit) : 0;
    state.outstandingCents = credit ? Layout.cents(credit.outstanding) : 0;

    const estimated = Boolean(credit && credit.estimated);
    setText('creditHint', !credit || state.remainingCents <= 0
      ? 'Kredit tidak tersedia karena sisa limit kredit 0.'
      : `Sisa limit ${estimated ? 'perkiraan' : ''}: ${money(state.remainingCents)}${estimated ? ' (KASIR tidak memiliki endpoint credit; backend menentukan final)' : ''}`);

    setFormDisabled(false);
    updatePreview();
  }

  async function findCustomer(order) {
    for (const search of [order.customer_code, order.customer_name]) {
      if (!search) continue;
      const query = new URLSearchParams({ search: String(search), limit: String(CATALOG_LIMIT) });
      const response = await API.get(`/api/customers?${query.toString()}`);
      const customers = (response.data || {}).customers || [];
      const match = customers.find((customer) => Number(customer.id) === Number(order.customer_id));
      if (match) return match;
    }
    return null;
  }

  async function sumOutstandingAsKasir(customerId) {
    let page = 1;
    let totalPages = 1;
    let outstandingCents = 0;
    let checked = 0;

    while (page <= totalPages && page <= MAX_CREDIT_PAGES) {
      const query = new URLSearchParams({
        status: 'PIUTANG', page: String(page), limit: String(CREDIT_ORDER_LIMIT)
      });
      const response = await API.get(`/api/orders?${query.toString()}`);
      const data = response.data || {};
      const orders = Array.isArray(data.orders) ? data.orders : [];

      for (const summary of orders) {
        if (Number(summary.customer_id) !== Number(customerId)) continue;
        if (checked >= MAX_CREDIT_ORDER_DETAILS) return null;
        const detailResponse = await API.get(`/api/orders/${encodeURIComponent(String(summary.id))}`);
        const detail = (detailResponse.data || {}).order;
        if (detail && detail.status === 'PIUTANG' &&
            Number(detail.customer_id) === Number(customerId)) {
          const paid = (detail.payments || []).reduce((sum, payment) => (
            sum + Layout.cents(payment.amount) - Layout.cents(payment.change_amount)
          ), 0);
          outstandingCents += Math.max(0, Layout.cents(detail.total) - paid);
        }
        checked += 1;
      }

      totalPages = Number((data.pagination || {}).totalPages) || 0;
      page += 1;
    }
    return outstandingCents;
  }

  async function loadCreditFallback(order) {
    const customer = await findCustomer(order);
    if (!customer) throw new Error('Pelanggan tidak ditemukan');
    const outstandingCents = await sumOutstandingAsKasir(order.customer_id);
    if (outstandingCents === null) throw new Error('Gagal memuat limit kredit.');
    const limitCents = Layout.cents(customer.credit_limit);
    const remainingCents = limitCents > 0 ? Math.max(0, limitCents - outstandingCents) : 0;
    return {
      code: customer.code,
      name: customer.name,
      credit_limit: Layout.decimal(limitCents),
      outstanding: Layout.decimal(outstandingCents),
      remaining_limit: Layout.decimal(remainingCents),
      estimated: true
    };
  }

  async function loadCredit(order) {
    // Endpoint /customers/:id/credit hanya ADMIN/SALES. KASIR memakai endpoint
    // yang diizinkan agar tidak menghasilkan permintaan 403 yang tidak perlu.
    if (state.role !== 'KASIR') {
      try {
        const response = await API.get(`/api/customers/${encodeURIComponent(String(order.customer_id))}/credit`);
        applyCredit(response.data);
        return;
      } catch (error) {
        showAlert(errorFrom(error, 'Gagal memuat limit kredit.'));
        applyCredit(null);
        return;
      }
    }

    try {
      applyCredit(await loadCreditFallback(order));
    } catch (error) {
      showAlert(errorFrom(error, 'Gagal memuat limit kredit.'));
      applyCredit(null);
    }
  }

  function showInvoiceCard() {
    const status = String((state.order && state.order.status) || '');
    const canPrint = ['ADMIN', 'KASIR'].includes(state.role) && ['LUNAS', 'PIUTANG'].includes(status);
    el('invoiceCard').classList.toggle('hidden', !canPrint);
    setText('invoiceStatus', `Status pembayaran: ${status || '-'}`);
  }

  function applyOrder(order, options = {}) {
    state.order = order;
    state.totalCents = Layout.cents(order.total);
    el('draftCard').classList.add('hidden');
    el('detail').classList.remove('hidden');
    el('orderStatus').replaceChildren(UI.statusBadge(order.status));
    setText('orderSubtitle', `Tagihan ${order.customer_name || order.customer_code || '-'} · ${UI.tanggal(order.order_date)}`);
    el('summaryDl').replaceChildren(
      ...detailRow('No. order', order.order_no),
      ...detailRow('Pelanggan', order.customer_name || order.customer_code),
      ...detailRow('Kode pelanggan', order.customer_code),
      ...detailRow('Sales', order.user_name || `ID ${order.user_id}`),
      ...detailRow('Tanggal', UI.tanggal(order.order_date)),
      ...detailRow('Gudang', document.body.dataset.location || '-')
    );
    setText('totalTagihan', money(state.totalCents));
    renderItems(order.items);
    renderQuick();
    showInvoiceCard();

    if (order.status !== 'DRAFT') {
      showAlert('Order sudah diproses', 'warn');
      setFormDisabled(true);
      updatePreview();
      return;
    }
    setFormDisabled(false);
    updatePreview();
    if (options.clear !== false) clearAlert();
  }

  function applyPaymentResult(order, payment) {
    showInvoiceCard();
    if (!payment) return;
    const amountCents = Layout.cents(payment.amount);
    const changeCents = Layout.cents(payment.change_amount);
    setText('resultAmount', money(amountCents));
    setText('resultChange', money(changeCents));
    setText('resultUsed', money(Math.max(0, amountCents - changeCents)));
    el('result').classList.remove('hidden');
  }

  async function loadOrder() {
    if (!orderId) return;
    showAlert('Memuat tagihan sales order…', 'warn');
    try {
      const response = await API.get(`/api/orders/${encodeURIComponent(String(orderId))}`);
      const order = (response.data || {}).order;
      if (!order) {
        showAlert('Order tidak ditemukan');
        return;
      }
      applyOrder(order);
      if (order.status === 'DRAFT') await loadCredit(order);
    } catch (error) {
      showAlert(errorFrom(error, 'Gagal memuat tagihan sales order.'));
      setFormDisabled(true);
    }
  }

  async function processPayment(event) {
    event.preventDefault();
    if (state.processing || !state.order || state.order.status !== 'DRAFT') return;

    const preview = computePreview();
    if (preview.error) {
      showAlert(preview.error);
      return;
    }

    const body = {
      payment_type: getPaymentType(),
      method: el('method').value,
      nominal: Layout.decimal(preview.nominalCents)
    };
    const note = el('note').value.trim();
    if (note) body.note = note;

    clearAlert();
    state.processing = true;
    setFormDisabled(true);
    el('btnProses').disabled = true;
    el('btnProses').textContent = 'Memproses…';
    try {
      const response = await API.post(
        `/api/orders/${encodeURIComponent(String(orderId))}/payments`, body
      );
      const data = response.data || {};
      if (data.order) applyOrder(data.order, { clear: false });
      applyPaymentResult(data.order, data.payment);
      UI.toast('Pembayaran berhasil diproses.');
      clearAlert();
    } catch (error) {
      showAlert(errorFrom(error, 'Gagal memproses pembayaran.'));
      UI.showErrors(el('paymentForm'), Layout.errorMap(error.errors));
    } finally {
      state.processing = false;
      el('btnProses').textContent = 'Proses Pembayaran';
      setFormDisabled(false);
      updatePreview();
    }
  }

  async function printInvoice() {
    if (state.printing || !state.order || !orderId) return;
    const status = String(state.order.status || '');
    if (!['ADMIN', 'KASIR'].includes(state.role) || !['LUNAS', 'PIUTANG'].includes(status)) {
      showAlert('Invoice hanya tersedia untuk order LUNAS atau PIUTANG', 'warn');
      return;
    }

    state.printing = true;
    el('btnCetak').disabled = true;
    el('btnCetak').textContent = 'Membuka PDF…';
    try {
      const format = ['a4', '80mm'].includes(el('format').value) ? el('format').value : 'a4';
      await API.openPdf(`/api/orders/${encodeURIComponent(String(orderId))}/invoice.pdf?format=${format}`);
      UI.toast('Invoice dibuka di tab baru.');
    } catch (error) {
      showAlert(errorFrom(error, 'Gagal membuka invoice.'));
    } finally {
      state.printing = false;
      el('btnCetak').disabled = false;
      el('btnCetak').textContent = 'Cetak Invoice (PDF)';
    }
  }

  el('draftSearch').addEventListener('input', renderDrafts);
  ['typeTunai', 'typeKredit', 'method', 'nominal'].forEach((id) => {
    el(id).addEventListener('change', updatePreview);
    el(id).addEventListener('input', updatePreview);
  });
  el('paymentForm').addEventListener('submit', processPayment);
  el('btnCetak').addEventListener('click', printInvoice);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'F4' && state.order && state.order.status === 'DRAFT') {
      event.preventDefault();
      el('nominal').value = Layout.decimal(state.totalCents);
      updatePreview();
    }
  });

  Layout.start(async () => {
    state.role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    renderDrafts();
    if (!orderId) {
      setText('orderSubtitle', 'Pilih order Draft pada daftar di atas.');
      await loadDrafts();
      return;
    }
    await loadOrder();
  });
}());
