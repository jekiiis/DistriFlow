'use strict';

/**
 * UI-09 Pembayaran Sales Order.
 * Nominal yang dikirim adalah uang diterima. Backend tetap menentukan status,
 * kembalian, sisa piutang, stok, dan batas kredit secara final.
 */
(function initPayment() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  if (!api || !ui) {
    return;
  }

  const ITEM_COLUMNS = 6;
  const CATALOG_LIMIT = 100;
  const CREDIT_ORDER_LIMIT = 100;
  const MAX_CREDIT_PAGES = 100;
  const MAX_CREDIT_ORDER_DETAILS = 200;

  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  const orderId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;

  const els = {
    alert: document.getElementById('payment-alert'),
    logout: document.getElementById('logout-button'),
    title: document.getElementById('payment-title'),
    subtitle: document.getElementById('payment-subtitle'),
    status: document.getElementById('summary-status'),
    orderNo: document.getElementById('summary-order-no'),
    customer: document.getElementById('summary-customer'),
    total: document.getElementById('summary-total'),
    remaining: document.getElementById('summary-remaining'),
    itemsBody: document.getElementById('payment-items-body'),
    form: document.getElementById('payment-form'),
    typeTunai: document.getElementById('type-tunai'),
    typeKredit: document.getElementById('type-kredit'),
    creditHint: document.getElementById('credit-hint'),
    method: document.getElementById('payment-method'),
    nominal: document.getElementById('payment-nominal'),
    note: document.getElementById('payment-note'),
    preview: document.getElementById('payment-preview'),
    process: document.getElementById('process-button'),
    invoiceCard: document.getElementById('invoice-card'),
    invoiceStatus: document.getElementById('invoice-status'),
    invoiceFormat: document.getElementById('invoice-format'),
    printInvoice: document.getElementById('print-invoice'),
    result: document.getElementById('payment-result'),
    resultAmount: document.getElementById('result-amount'),
    resultChange: document.getElementById('result-change'),
    resultUsed: document.getElementById('result-used')
  };

  const state = {
    order: null,
    role: '',
    totalCents: 0,
    credit: null,
    outstandingCents: 0,
    remainingCents: 0,
    processing: false,
    printing: false
  };

  function showAlert(message, type) {
    els.alert.textContent = message;
    els.alert.className = 'df-alert df-alert--' + (type === 'warning' ? 'warning' : 'error');
    els.alert.hidden = false;
  }

  function clearAlert() {
    els.alert.hidden = true;
    els.alert.textContent = '';
  }

  function apiCents(value) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    const match = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(text);
    if (!match) {
      return 0;
    }
    const cents = Number(match[2]) * 100 + Number((match[3] || '').padEnd(2, '0'));
    return match[1] === '-' ? -cents : cents;
  }

  function centsToDecimal(cents) {
    const sign = cents < 0 ? '-' : '';
    const absolute = Math.abs(cents);
    return sign + String(Math.trunc(absolute / 100)) + '.' + String(absolute % 100).padStart(2, '0');
  }

  function formatPlainCents(cents) {
    const sign = cents < 0 ? '-' : '';
    const absolute = Math.abs(cents);
    const whole = String(Math.trunc(absolute / 100));
    const fraction = String(absolute % 100).padStart(2, '0');
    return sign + whole + (fraction === '00' ? '' : '.' + fraction);
  }

  function formatMoney(value) {
    return ui.formatRupiah(apiCents(value) / 100);
  }

  function parseMoneyCents(value, allowEmpty) {
    const text = String(value === null || value === undefined ? '' : value).trim().replace(/\s/g, '');
    if (text === '') {
      return allowEmpty ? 0 : null;
    }

    let normalized = text;
    if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(normalized)) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(',', '.');
    }

    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
    if (!match) {
      return null;
    }
    const cents = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
    return Number.isSafeInteger(cents) && cents >= 0 ? cents : null;
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

  function renderEmpty(tbody, columns, message) {
    tbody.textContent = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'df-table__empty';
    cell.colSpan = columns;
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function renderItems(items) {
    if (!items || items.length === 0) {
      renderEmpty(els.itemsBody, ITEM_COLUMNS, 'Tidak ada barang pada order ini.');
      return;
    }

    els.itemsBody.textContent = '';
    items.forEach((item) => {
      const row = document.createElement('tr');
      appendTextCell(row, item.code);
      appendTextCell(row, item.name);
      appendTextCell(row, formatMoney(item.unit_price), 'df-table__num');
      appendTextCell(row, item.qty, 'df-table__num');
      appendTextCell(row, formatMoney(item.discount), 'df-table__num');
      appendTextCell(row, formatMoney(item.line_total), 'df-table__num');
      els.itemsBody.appendChild(row);
    });
  }

  function getPaymentType() {
    return els.typeKredit.checked && !els.typeKredit.disabled ? 'KREDIT' : 'TUNAI';
  }

  function setFormDisabled(disabled) {
    const locked = disabled || !state.order || state.order.status !== 'DRAFT';
    els.nominal.disabled = locked;
    els.note.disabled = locked;
    els.method.disabled = locked;
    els.typeTunai.disabled = locked;
    els.typeKredit.disabled = locked || !state.credit || state.remainingCents <= 0;
    if (els.typeKredit.disabled && els.typeKredit.checked) {
      els.typeTunai.checked = true;
    }
  }

  function showInvoiceCard() {
    const role = state.role.toUpperCase();
    const status = state.order ? String(state.order.status || '') : '';
    const canPrint = Boolean(state.order) &&
      (role === 'ADMIN' || role === 'KASIR') &&
      (status === 'LUNAS' || status === 'PIUTANG');

    els.invoiceCard.classList.toggle('df-hidden', !canPrint);
    ui.setText(els.invoiceStatus, 'Status pembayaran: ' + (status || '-'));
  }

  function computePreview() {
    if (!state.order || state.order.status !== 'DRAFT') {
      return { disabled: true };
    }

    const raw = els.nominal.value.trim();
    if (raw === '') {
      return { error: 'Nominal tidak valid' };
    }

    const nominalCents = parseMoneyCents(raw, false);
    if (nominalCents === null) {
      return { error: 'Nominal tidak valid' };
    }

    const paymentType = getPaymentType();
    const method = els.method.value;
    const totalCents = state.totalCents;

    if (paymentType === 'TUNAI' && nominalCents === 0) {
      return { error: 'Nominal tidak valid' };
    }
    if (method === 'TRANSFER' && nominalCents > totalCents) {
      return { error: 'Transfer tidak boleh melebihi total' };
    }
    if (nominalCents >= totalCents) {
      return {
        nominalCents,
        status: 'LUNAS',
        message: 'LUNAS · Kembalian ' + ui.formatRupiah((nominalCents - totalCents) / 100)
      };
    }
    if (paymentType === 'TUNAI') {
      return {
        nominalCents,
        error: 'Nominal kurang Rp' + formatPlainCents(totalCents - nominalCents)
      };
    }

    const sisaCents = totalCents - nominalCents;
    if (!state.credit || state.remainingCents <= 0 || sisaCents > state.remainingCents) {
      return { nominalCents, error: 'Melebihi limit kredit' };
    }
    return {
      nominalCents,
      status: 'PIUTANG',
      message: 'PIUTANG · Sisa piutang ' + ui.formatRupiah(sisaCents / 100)
    };
  }

  function updatePreview() {
    if (state.processing || !state.order || state.order.status !== 'DRAFT') {
      els.preview.classList.add('df-hidden');
      els.process.disabled = true;
      return;
    }

    const preview = computePreview();
    els.preview.classList.remove('df-hidden');
    if (preview.error) {
      els.preview.className = 'df-alert df-alert--error';
      els.preview.textContent = preview.error;
      els.process.disabled = true;
      return;
    }

    els.preview.className = 'df-alert df-alert--success';
    els.preview.textContent = preview.message;
    els.process.disabled = false;
  }

  function applyCredit(credit) {
    state.credit = credit || null;
    state.remainingCents = credit ? apiCents(credit.remaining_limit) : 0;
    state.outstandingCents = credit ? apiCents(credit.outstanding) : 0;

    ui.setText(
      els.remaining,
      credit ? ui.formatRupiah(state.remainingCents / 100) : '-'
    );
    els.remaining.title = credit && credit.estimated
      ? 'Sisa limit dihitung dari data yang dapat diakses Kasir.'
      : '';

    setFormDisabled(false);
    const creditUnavailable = !credit || state.remainingCents <= 0;
    ui.setText(
      els.creditHint,
      creditUnavailable
        ? 'Kredit tidak tersedia karena sisa limit kredit 0.'
        : 'Kredit tersedia sesuai sisa limit pelanggan.'
    );
    updatePreview();
  }

  async function findCustomer(search, customerId) {
    if (!search) {
      return null;
    }
    const query = new URLSearchParams();
    query.set('search', search);
    query.set('limit', String(CATALOG_LIMIT));

    const data = await api.get('/customers?' + query.toString());
    const customers = data && Array.isArray(data.customers) ? data.customers : [];
    return customers.find((customer) => Number(customer.id) === Number(customerId)) || null;
  }

  function paidCents(payments) {
    return (payments || []).reduce((sum, payment) => {
      return sum + apiCents(payment.amount) - apiCents(payment.change_amount);
    }, 0);
  }

  /**
   * KASIR tidak memiliki akses ke /customers/:id/credit pada backend saat ini.
   * Fallback ini memakai endpoint yang diizinkan KASIR dan rumus yang sama
   * dengan sumOutstanding: total order PIUTANG dikurangi (amount - change).
   * Detail order diambil satu per satu karena daftar order tidak memuat payments.
   */
  async function sumOutstandingAsKasir(customerId) {
    let page = 1;
    let totalPages = 1;
    let outstanding = 0;
    let checked = 0;

    pages: while (page <= totalPages && page <= MAX_CREDIT_PAGES) {
      const query = new URLSearchParams();
      query.set('status', 'PIUTANG');
      query.set('page', String(page));
      query.set('limit', String(CREDIT_ORDER_LIMIT));

      const data = await api.get('/orders?' + query.toString());
      const orders = data && Array.isArray(data.orders) ? data.orders : [];

      for (const summary of orders) {
        if (Number(summary.customer_id) !== Number(customerId)) {
          continue;
        }
        if (checked >= MAX_CREDIT_ORDER_DETAILS) {
          return null;
        }

        const detailData = await api.get('/orders/' + encodeURIComponent(String(summary.id)));
        const order = detailData && detailData.order ? detailData.order : null;
        if (order && order.status === 'PIUTANG' &&
            Number(order.customer_id) === Number(customerId)) {
          outstanding += Math.max(0, apiCents(order.total) - paidCents(order.payments));
        }
        checked += 1;
      }

      totalPages = Number(data && data.pagination && data.pagination.totalPages) || 0;
      page += 1;
    }

    return outstanding;
  }

  async function loadCreditFallback(order) {
    let customer = await findCustomer(order.customer_code, order.customer_id);
    if (!customer) {
      customer = await findCustomer(order.customer_name, order.customer_id);
    }
    if (!customer) {
      throw new Error('Pelanggan tidak ditemukan');
    }

    const limitCents = apiCents(customer.credit_limit);
    const outstandingCents = await sumOutstandingAsKasir(order.customer_id);
    if (outstandingCents === null) {
      throw new Error('Gagal memuat limit kredit.');
    }
    const remaining = limitCents > 0
      ? Math.max(0, limitCents - outstandingCents)
      : 0;

    return {
      code: customer.code,
      name: customer.name,
      price_level: customer.price_level,
      credit_limit: centsToDecimal(limitCents),
      outstanding: centsToDecimal(outstandingCents),
      remaining_limit: centsToDecimal(remaining),
      estimated: true
    };
  }

  async function loadCredit(order) {
    ui.setText(els.remaining, 'Memuat…');
    try {
      const credit = await api.get('/customers/' + encodeURIComponent(String(order.customer_id)) + '/credit');
      applyCredit(credit);
      return;
    } catch (error) {
      if (error && error.status === 403) {
        try {
          applyCredit(await loadCreditFallback(order));
          return;
        } catch (fallbackError) {
          showAlert((fallbackError && fallbackError.message) || 'Gagal memuat limit kredit.');
          applyCredit(null);
          return;
        }
      }
      showAlert((error && error.message) || 'Gagal memuat limit kredit.');
      applyCredit(null);
    }
  }

  function applyOrder(order, options = {}) {
    state.order = order;
    state.totalCents = apiCents(order.total);

    ui.setText(els.title, 'Pembayaran ' + (order.order_no || ''));
    ui.setText(
      els.subtitle,
      'Tagihan ' + (order.customer_name || order.customer_code || '-') + ' · ' + (order.order_date || '-')
    );
    ui.setText(els.status, 'Status: ' + (order.status || '-'));
    ui.setText(els.orderNo, order.order_no || '-');
    ui.setText(els.customer, order.customer_name || order.customer_code || '-');
    ui.setText(els.total, formatMoney(order.total));

    renderItems(order.items);
    setFormDisabled(false);
    showInvoiceCard();

    if (order.status !== 'DRAFT') {
      if (options.warnProcessed !== false) {
        showAlert('Order sudah diproses', 'warning');
      }
      updatePreview();
      return;
    }
    updatePreview();
  }

  function applyPaymentResult(order, payment) {
    showInvoiceCard();
    ui.setText(els.invoiceStatus, 'Status pembayaran: ' + (order ? order.status : '-'));

    const amountCents = apiCents(payment && payment.amount);
    const changeCents = apiCents(payment && payment.change_amount);
    const usedCents = Math.max(0, amountCents - changeCents);

    ui.setText(els.resultAmount, ui.formatRupiah(amountCents / 100));
    ui.setText(els.resultChange, ui.formatRupiah(changeCents / 100));
    ui.setText(els.resultUsed, ui.formatRupiah(usedCents / 100));
    els.result.classList.remove('df-hidden');
  }

  function applySessionUser(user) {
    const name = String((user && user.name) || 'Pengguna');
    const role = String((user && user.role) || '-');

    state.role = role.toUpperCase();
    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.buildSidebar(role, 'payment');
    showInvoiceCard();
  }

  async function loadSession() {
    try {
      const data = await api.get('/auth/me');
      applySessionUser(data && data.user ? data.user : {});
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat data sesi.');
    }
  }

  async function loadOrder() {
    showAlert('Memuat tagihan sales order…', 'warning');
    try {
      const data = await api.get('/orders/' + encodeURIComponent(String(orderId)));
      const order = data && data.order ? data.order : null;
      if (!order) {
        showAlert('Order tidak ditemukan');
        setFormDisabled(true);
        return;
      }
      applyOrder(order);
      if (order.status === 'DRAFT') {
        clearAlert();
      }
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat tagihan sales order.');
      setFormDisabled(true);
    }
  }

  async function processPayment(event) {
    event.preventDefault();
    if (state.processing || !state.order || state.order.status !== 'DRAFT') {
      return;
    }

    const preview = computePreview();
    if (preview.error) {
      showAlert(preview.error);
      return;
    }

    const paymentType = getPaymentType();
    const method = els.method.value;

    clearAlert();
    state.processing = true;
    setFormDisabled(true);
    els.process.disabled = true;
    els.process.textContent = 'Memproses…';

    const body = {
      payment_type: paymentType,
      method,
      nominal: centsToDecimal(preview.nominalCents)
    };
    const note = els.note.value.trim();
    if (note) {
      body.note = note;
    }

    try {
      const data = await api.post('/orders/' + encodeURIComponent(String(orderId)) + '/payments', body);
      const order = data && data.order ? data.order : null;
      const payment = data && data.payment ? data.payment : null;
      if (order) {
        applyOrder(order, { warnProcessed: false });
        clearAlert();
      }
      applyPaymentResult(order, payment);
      ui.notify('Pembayaran berhasil diproses.');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memproses pembayaran.');
    } finally {
      state.processing = false;
      els.process.textContent = 'Proses Pembayaran';
      setFormDisabled(false);
      updatePreview();
    }
  }

  function printInvoice() {
    if (state.printing || !state.order || !orderId) {
      return;
    }
    const role = state.role.toUpperCase();
    const status = String(state.order.status || '');
    if ((role !== 'ADMIN' && role !== 'KASIR') ||
        (status !== 'LUNAS' && status !== 'PIUTANG')) {
      showAlert('Invoice hanya tersedia untuk order LUNAS atau PIUTANG');
      return;
    }

    clearAlert();
    state.printing = true;
    els.printInvoice.disabled = true;
    els.printInvoice.textContent = 'Membuka PDF…';

    try {
      api.openInvoice(orderId, els.invoiceFormat.value);
      ui.notify('Invoice dibuka di tab baru.');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal membuka invoice.');
    } finally {
      state.printing = false;
      els.printInvoice.disabled = false;
      els.printInvoice.textContent = 'Cetak Invoice';
    }
  }

  els.typeTunai.addEventListener('change', updatePreview);
  els.typeKredit.addEventListener('change', updatePreview);
  els.method.addEventListener('change', updatePreview);
  els.nominal.addEventListener('input', updatePreview);
  els.form.addEventListener('submit', processPayment);
  els.printInvoice.addEventListener('click', printInvoice);

  ui.setupLogout(els.logout);
  renderItems([]);
  setFormDisabled(true);
  updatePreview();

  async function initialize() {
    await loadSession();
    await loadOrder();
    if (state.order && state.order.status === 'DRAFT') {
      await loadCredit(state.order);
    }
  }

  if (!orderId) {
    showAlert('ID sales order tidak valid');
    ui.setText(els.subtitle, 'ID sales order tidak valid.');
    loadSession();
    return;
  }

  initialize();
}());
