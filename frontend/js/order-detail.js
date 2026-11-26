'use strict';

/**
 * UI-08 Detail Sales Order.
 * Menampilkan data dari GET /api/orders/:id dan membuka URL PDF kanonik di tab baru lewat api.openInvoice().
 * Pembatalan order ditunda, sehingga tidak ada tombol Batalkan Order di halaman ini.
 */
(function initOrderDetail() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  if (!api || !ui) {
    return;
  }

  const ITEM_COLUMNS = 6;
  const PAYMENT_COLUMNS = 6;

  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  const orderId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;

  const els = {
    alert: document.getElementById('detail-alert'),
    logout: document.getElementById('logout-button'),
    title: document.getElementById('detail-title'),
    subtitle: document.getElementById('detail-subtitle'),
    orderNo: document.getElementById('detail-order-no'),
    date: document.getElementById('detail-date'),
    customer: document.getElementById('detail-customer'),
    sales: document.getElementById('detail-sales'),
    status: document.getElementById('detail-status'),
    paymentType: document.getElementById('detail-payment-type'),
    dueDate: document.getElementById('detail-due-date'),
    subtotal: document.getElementById('detail-subtotal'),
    discount: document.getElementById('detail-discount'),
    total: document.getElementById('detail-total'),
    itemsBody: document.getElementById('detail-items-body'),
    paymentSummary: document.getElementById('payment-summary'),
    paymentsBody: document.getElementById('detail-payments-body'),
    actions: document.getElementById('detail-actions'),
    payLink: document.getElementById('pay-link'),
    invoiceControls: document.getElementById('invoice-controls'),
    invoiceFormat: document.getElementById('invoice-format'),
    printInvoice: document.getElementById('print-invoice')
  };

  const state = {
    order: null,
    role: '',
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

  function formatMoney(value) {
    return ui.formatRupiah(apiCents(value) / 100);
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

  function renderPayments(payments) {
    const list = payments || [];
    ui.setText(
      els.paymentSummary,
      list.length === 0 ? 'Belum ada pembayaran untuk order ini.' : 'Data pembayaran yang telah tercatat.'
    );

    if (list.length === 0) {
      renderEmpty(els.paymentsBody, PAYMENT_COLUMNS, 'Belum ada pembayaran.');
      return;
    }

    els.paymentsBody.textContent = '';
    list.forEach((payment) => {
      const amountCents = apiCents(payment.amount);
      const changeCents = apiCents(payment.change_amount);
      const usedCents = Math.max(0, amountCents - changeCents);

      const row = document.createElement('tr');
      appendTextCell(row, payment.paid_at || '-');
      appendTextCell(row, payment.method || '-');
      appendTextCell(row, formatMoney(centsToDecimal(amountCents)), 'df-table__num');
      appendTextCell(row, formatMoney(centsToDecimal(changeCents)), 'df-table__num');
      appendTextCell(row, formatMoney(centsToDecimal(usedCents)), 'df-table__num');
      appendTextCell(row, payment.note || '-');
      els.paymentsBody.appendChild(row);
    });
  }

  function setStatusBadge(status) {
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
    els.status.className = 'df-badge' + modifier;
    els.status.textContent = text;
  }

  function updateActions() {
    const order = state.order;
    const role = state.role.toUpperCase();
    const status = order ? String(order.status || '') : '';
    const canPay = Boolean(order) && role === 'KASIR' && status === 'DRAFT';
    const canPrint = Boolean(order) &&
      (role === 'ADMIN' || role === 'KASIR') &&
      (status === 'LUNAS' || status === 'PIUTANG');

    els.payLink.classList.toggle('df-hidden', !canPay);
    if (canPay) {
      els.payLink.href = '/pages/payment.html?id=' + encodeURIComponent(String(order.id));
    }
    els.invoiceControls.classList.toggle('df-hidden', !canPrint);
    els.actions.classList.toggle('df-hidden', !canPay && !canPrint);
  }

  function applyOrder(order) {
    state.order = order;

    ui.setText(els.title, 'Order ' + (order.order_no || '-'));
    ui.setText(els.subtitle, 'Detail sales order, rincian barang, dan riwayat pembayaran.');
    ui.setText(els.orderNo, order.order_no || '-');
    ui.setText(els.date, order.order_date || '-');
    ui.setText(els.customer, order.customer_name || order.customer_code || '-');
    ui.setText(els.sales, order.user_name || '-');
    ui.setText(els.paymentType, order.payment_type || '-');
    ui.setText(els.dueDate, order.due_date || '-');
    ui.setText(els.subtotal, formatMoney(order.subtotal));
    ui.setText(els.discount, formatMoney(order.discount));
    ui.setText(els.total, formatMoney(order.total));
    setStatusBadge(order.status);

    renderItems(order.items);
    renderPayments(order.payments);
    updateActions();
  }

  function applySessionUser(user) {
    const name = String((user && user.name) || 'Pengguna');
    const role = String((user && user.role) || '-');

    state.role = role.toUpperCase();
    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.buildSidebar(role, 'orders');
    updateActions();
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
    showAlert('Memuat detail sales order…', 'warning');
    try {
      const data = await api.get('/orders/' + encodeURIComponent(String(orderId)));
      const order = data && data.order ? data.order : null;
      if (!order) {
        showAlert('Order tidak ditemukan');
        return;
      }
      applyOrder(order);
      clearAlert();
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat detail sales order.');
    }
  }

  function printInvoice() {
    if (state.printing || !state.order || !orderId) {
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

  els.printInvoice.addEventListener('click', printInvoice);

  ui.setupLogout(els.logout);
  renderItems([]);
  renderPayments([]);
  updateActions();

  if (!orderId) {
    showAlert('ID sales order tidak valid');
    ui.setText(els.title, 'Detail Order');
    ui.setText(els.subtitle, 'ID sales order tidak valid.');
    loadSession();
    return;
  }

  loadSession();
  loadOrder();
}());
