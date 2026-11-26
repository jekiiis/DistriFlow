'use strict';

/**
 * UI-06 Sales Order Baru.
 * Harga, level, dan stok selalu berasal dari API. Payload POST /orders hanya
 * memuat customer_id dan items[{ code, qty, discount }].
 */
(function initSalesOrder() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  if (!api || !ui) {
    return;
  }

  const PAGE_LIMIT = 10;
  const SEARCH_DELAY_MS = 300;
  const COLUMN_COUNT = 7;

  const els = {
    alert: document.getElementById('so-alert'),
    logout: document.getElementById('logout-button'),
    form: document.getElementById('sales-order-form'),
    customerSearch: document.getElementById('customer-search'),
    customerSelect: document.getElementById('customer-select'),
    customerStatus: document.getElementById('customer-status'),
    creditCode: document.getElementById('credit-code'),
    creditLevel: document.getElementById('credit-level'),
    creditLimit: document.getElementById('credit-limit'),
    creditRemaining: document.getElementById('credit-remaining'),
    productSearch: document.getElementById('product-search'),
    productOptions: document.getElementById('product-options'),
    productStatus: document.getElementById('product-status'),
    productCode: document.getElementById('product-code'),
    itemQty: document.getElementById('item-qty'),
    itemDiscount: document.getElementById('item-discount'),
    addItem: document.getElementById('add-item'),
    itemStatus: document.getElementById('item-status'),
    itemsBody: document.getElementById('items-body'),
    subtotal: document.getElementById('order-subtotal'),
    discount: document.getElementById('order-discount'),
    total: document.getElementById('order-total'),
    cancel: document.getElementById('cancel-button'),
    save: document.getElementById('save-button')
  };

  const state = {
    customers: [],
    products: [],
    customerId: null,
    credit: null,
    priceLevel: '',
    lines: [],
    busy: false,
    saving: false,
    customerToken: 0,
    productToken: 0,
    recalcToken: 0
  };

  let customerTimer = null;
  let productTimer = null;

  function showAlert(message, type) {
    els.alert.textContent = message;
    els.alert.className = 'df-alert df-alert--' + (type === 'success' ? 'success' : 'error');
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

  function formatMoney(value) {
    return ui.formatRupiah(apiCents(value) / 100);
  }

  function centsToDecimal(cents) {
    const sign = cents < 0 ? '-' : '';
    const absolute = Math.abs(cents);
    return sign + String(Math.trunc(absolute / 100)) + '.' + String(absolute % 100).padStart(2, '0');
  }

  /** Menerima "50000", "50000,5", "1.000,50", atau "50000.50". */
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

  function parseQty(value) {
    const text = String(value === null || value === undefined ? '' : value).trim();
    if (!/^\d+$/.test(text)) {
      return null;
    }
    const qty = Number(text);
    return Number.isSafeInteger(qty) && qty >= 1 ? qty : null;
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

  function renderCustomerOptions() {
    els.customerSelect.textContent = '';

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Pilih Pelanggan';
    els.customerSelect.appendChild(placeholder);

    const visibleIds = {};
    state.customers.forEach((customer) => {
      const id = Number(customer.id);
      visibleIds[id] = true;
      const option = document.createElement('option');
      option.value = String(id);
      option.textContent = String(customer.code || '') + ' — ' + String(customer.name || '');
      els.customerSelect.appendChild(option);
    });

    if (state.customerId && !visibleIds[state.customerId] && state.credit) {
      const selected = document.createElement('option');
      selected.value = String(state.customerId);
      selected.textContent = String(state.credit.code || '') + ' — ' + String(state.credit.name || '');
      els.customerSelect.appendChild(selected);
    }

    els.customerSelect.value = state.customerId ? String(state.customerId) : '';
  }

  function renderProductOptions() {
    els.productOptions.textContent = '';
    state.products = state.products || [];
    state.products.forEach((product) => {
      const option = document.createElement('option');
      option.value = String(product.code || '');
      option.textContent = String(product.name || '') + ' · stok ' + String(product.stock || 0);
      els.productOptions.appendChild(option);
    });
  }

  function applyCredit(credit) {
    state.credit = credit || null;
    const level = credit ? String(credit.price_level || '').toUpperCase() : '';
    state.priceLevel = level === 'GROSIR' ? 'GROSIR' : (credit ? 'RETAIL' : '');

    ui.setText(els.creditCode, credit ? credit.code : '-');
    ui.setText(els.creditLevel, state.priceLevel || '-');
    ui.setText(els.creditLimit, credit ? formatMoney(credit.credit_limit) : '-');
    ui.setText(els.creditRemaining, credit ? formatMoney(credit.remaining_limit) : '-');
  }

  function updateTotals() {
    let subtotal = 0;
    let discount = 0;
    let total = 0;

    state.lines.forEach((line) => {
      if (line.error) {
        return;
      }
      subtotal += line.grossCents || 0;
      discount += line.discountCents || 0;
      total += line.lineTotalCents || 0;
    });

    ui.setText(els.subtotal, ui.formatRupiah(subtotal / 100));
    ui.setText(els.discount, ui.formatRupiah(discount / 100));
    ui.setText(els.total, ui.formatRupiah(total / 100));
  }

  function updateButtons() {
    const blocked = state.busy || state.saving || !state.customerId || !state.priceLevel;
    const hasInvalidLine = state.lines.some((line) => Boolean(line.error));

    els.addItem.disabled = blocked;
    els.save.disabled = blocked || state.lines.length === 0 || hasInvalidLine;
    els.save.textContent = state.saving ? 'Menyimpan…' : 'Simpan Order';
    els.addItem.textContent = state.busy ? 'Memproses…' : '+ Tambah Barang';
    els.cancel.disabled = state.busy || state.saving;
    els.customerSearch.disabled = state.busy || state.saving;
    els.customerSelect.disabled = state.busy || state.saving ||
      (state.customers.length === 0 && !state.customerId);
    els.productSearch.disabled = state.busy || state.saving;
    els.productCode.disabled = blocked;
    els.itemQty.disabled = blocked;
    els.itemDiscount.disabled = blocked;
  }

  function renderLines() {
    els.itemsBody.textContent = '';

    if (state.lines.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'df-table__empty';
      cell.colSpan = COLUMN_COUNT;
      cell.textContent = 'Belum ada barang yang ditambahkan.';
      row.appendChild(cell);
      els.itemsBody.appendChild(row);
      return;
    }

    state.lines.forEach((line, index) => {
      const row = document.createElement('tr');

      appendTextCell(row, line.code);
      const nameCell = appendTextCell(row, line.name || '-');
      if (line.error) {
        const errorText = document.createElement('div');
        errorText.className = 'df-error-text';
        errorText.textContent = line.error;
        nameCell.appendChild(errorText);
      }
      appendTextCell(row, formatMoney(centsToDecimal(line.unitPriceCents || 0)), 'df-table__num');

      const qtyCell = document.createElement('td');
      qtyCell.className = 'df-table__num';
      const qtyInput = document.createElement('input');
      qtyInput.className = 'df-input';
      qtyInput.type = 'number';
      qtyInput.min = '1';
      qtyInput.step = '1';
      qtyInput.value = String(line.qty);
      qtyInput.dataset.lineField = 'qty';
      qtyInput.dataset.index = String(index);
      qtyInput.setAttribute('aria-label', 'Qty ' + line.code);
      qtyCell.appendChild(qtyInput);
      row.appendChild(qtyCell);

      const discountCell = document.createElement('td');
      discountCell.className = 'df-table__num';
      const discountInput = document.createElement('input');
      discountInput.className = 'df-input';
      discountInput.type = 'text';
      discountInput.inputMode = 'decimal';
      discountInput.value = centsToDecimal(line.discountCents || 0);
      discountInput.dataset.lineField = 'discount';
      discountInput.dataset.index = String(index);
      discountInput.setAttribute('aria-label', 'Diskon ' + line.code);
      discountCell.appendChild(discountInput);
      row.appendChild(discountCell);

      appendTextCell(row, formatMoney(centsToDecimal(Math.max(0, line.lineTotalCents || 0))), 'df-table__num');

      const actionCell = document.createElement('td');
      actionCell.className = 'df-right';
      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'df-btn df-btn--secondary df-btn--sm';
      removeButton.textContent = 'Hapus';
      removeButton.dataset.removeIndex = String(index);
      removeButton.setAttribute('aria-label', 'Hapus ' + line.code);
      actionCell.appendChild(removeButton);
      row.appendChild(actionCell);

      els.itemsBody.appendChild(row);
    });
  }

  async function fetchPrice(code, qty, discountCents) {
    const params = new URLSearchParams();
    params.set('level', state.priceLevel);
    params.set('qty', String(qty));
    params.set('discount', centsToDecimal(discountCents));
    return api.get('/products/by-code/' + encodeURIComponent(code) + '?' + params.toString());
  }

  async function recalculateAll() {
    if (!state.priceLevel || state.lines.length === 0) {
      state.busy = false;
      if (!state.priceLevel) {
        state.lines = state.lines.map((line) => Object.assign({}, line, {
          error: 'Pilih pelanggan terlebih dahulu',
          grossCents: 0,
          lineTotalCents: 0
        }));
      }
      renderLines();
      updateTotals();
      updateButtons();
      return;
    }

    const token = ++state.recalcToken;
    state.busy = true;
    updateButtons();
    ui.setText(els.itemStatus, 'Menghitung ulang harga sesuai level pelanggan…');

    const nextLines = [];
    let firstError = '';

    for (const line of state.lines) {
      try {
        const preview = await fetchPrice(line.code, line.qty, line.discountCents);
        if (token !== state.recalcToken) {
          return;
        }

        const stock = Number(preview.stock) || 0;
        const grossCents = apiCents(preview.subtotal);
        const lineTotalCents = apiCents(preview.line_total);
        let error = '';
        if (line.qty > stock) {
          error = 'Stok tidak cukup, tersedia ' + stock;
        } else if (line.discountCents > grossCents) {
          error = 'Diskon tidak valid';
        }
        if (error && !firstError) {
          firstError = error;
        }

        nextLines.push(Object.assign({}, line, {
          code: preview.code || line.code,
          name: preview.name || line.name,
          unit: preview.unit || line.unit,
          unitPriceCents: apiCents(preview.unit_price),
          grossCents,
          discountCents: apiCents(preview.discount),
          lineTotalCents,
          stock,
          error
        }));
      } catch (error) {
        if (token !== state.recalcToken) {
          return;
        }
        const message = (error && error.message) || 'Gagal memuat harga barang.';
        if (!firstError) {
          firstError = message;
        }
        nextLines.push(Object.assign({}, line, {
          error: message,
          grossCents: 0,
          lineTotalCents: 0
        }));
      }
    }

    if (token !== state.recalcToken) {
      return;
    }

    state.lines = nextLines;
    if (firstError) {
      showAlert(firstError);
    } else {
      clearAlert();
    }
    ui.setText(els.itemStatus, firstError || 'Harga diperbarui sesuai level pelanggan.');
    state.busy = false;
    renderLines();
    updateTotals();
    updateButtons();
  }

  async function loadCredit(customerId) {
    ui.setText(els.itemStatus, 'Memuat level harga dan limit pelanggan…');
    try {
      const credit = await api.get('/customers/' + encodeURIComponent(String(customerId)) + '/credit');
      if (state.customerId !== customerId) {
        return;
      }
      applyCredit(credit);
      await recalculateAll();
    } catch (error) {
      if (state.customerId !== customerId) {
        return;
      }
      applyCredit(null);
      state.busy = false;
      showAlert((error && error.message) || 'Gagal memuat data kredit pelanggan.');
      ui.setText(els.itemStatus, 'Pilih pelanggan terlebih dahulu untuk melihat harga.');
      renderLines();
      updateTotals();
      updateButtons();
    }
  }

  function handleCustomerChange() {
    const value = els.customerSelect.value;
    state.customerId = value ? Number(value) : null;
    state.recalcToken += 1;
    state.busy = false;
    applyCredit(null);

    if (!state.customerId) {
      state.lines = state.lines.map((line) => Object.assign({}, line, {
        error: 'Pilih pelanggan terlebih dahulu',
        lineTotalCents: 0
      }));
      ui.setText(els.itemStatus, 'Pilih pelanggan terlebih dahulu untuk melihat harga.');
      renderLines();
      updateTotals();
      updateButtons();
      return;
    }

    loadCredit(state.customerId);
  }

  async function loadCustomers(search) {
    const token = ++state.customerToken;
    ui.setText(els.customerStatus, 'Memuat pelanggan…');

    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('limit', String(PAGE_LIMIT));

      const data = await api.get('/customers?' + params.toString());
      if (token !== state.customerToken) {
        return;
      }

      state.customers = data && Array.isArray(data.customers) ? data.customers : [];
      renderCustomerOptions();
      updateButtons();
      ui.setText(
        els.customerStatus,
        state.customers.length === 0
          ? 'Tidak ada pelanggan yang cocok dengan pencarian.'
          : String(state.customers.length) + ' pelanggan ditemukan.'
      );
    } catch (error) {
      if (token !== state.customerToken) {
        return;
      }
      ui.setText(els.customerStatus, (error && error.message) || 'Gagal memuat daftar pelanggan.');
      showAlert((error && error.message) || 'Gagal memuat daftar pelanggan.');
    }
  }

  async function loadProducts(search) {
    const token = ++state.productToken;
    ui.setText(els.productStatus, 'Memuat barang…');

    try {
      const params = new URLSearchParams();
      if (search) {
        params.set('search', search);
      }
      params.set('limit', String(PAGE_LIMIT));

      const data = await api.get('/products?' + params.toString());
      if (token !== state.productToken) {
        return;
      }

      state.products = data && Array.isArray(data.products) ? data.products : [];
      renderProductOptions();
      ui.setText(
        els.productStatus,
        state.products.length === 0
          ? 'Tidak ada barang yang cocok dengan pencarian.'
          : String(state.products.length) + ' barang ditemukan.'
      );
    } catch (error) {
      if (token !== state.productToken) {
        return;
      }
      ui.setText(els.productStatus, (error && error.message) || 'Gagal memuat daftar barang.');
      showAlert((error && error.message) || 'Gagal memuat daftar barang.');
    }
  }

  async function addLine() {
    if (state.busy || state.saving) {
      return;
    }

    const code = els.productCode.value.trim();
    if (!code) {
      showAlert('Kode barang wajib diisi');
      els.productCode.focus();
      return;
    }
    if (!state.customerId || !state.priceLevel) {
      showAlert('Pilih pelanggan terlebih dahulu');
      return;
    }

    const qty = parseQty(els.itemQty.value);
    if (qty === null) {
      showAlert('Jumlah tidak valid');
      return;
    }

    const discountCents = parseMoneyCents(els.itemDiscount.value, true);
    if (discountCents === null) {
      showAlert('Diskon tidak valid');
      return;
    }

    const key = code.toUpperCase();
    const index = state.lines.findIndex((line) => String(line.code).toUpperCase() === key);
    const existing = index >= 0 ? state.lines[index] : null;
    const mergedQty = (existing ? existing.qty : 0) + qty;
    const mergedDiscount = (existing ? existing.discountCents : 0) + discountCents;

    if (!Number.isSafeInteger(mergedQty) || mergedQty < 1) {
      showAlert('Jumlah tidak valid');
      return;
    }

    const token = state.recalcToken;
    state.busy = true;
    updateButtons();
    ui.setText(els.itemStatus, 'Memeriksa harga dan stok…');

    try {
      const preview = await fetchPrice(code, mergedQty, mergedDiscount);
      if (token !== state.recalcToken) {
        return;
      }
      const stock = Number(preview.stock) || 0;

      if (mergedQty > stock) {
        showAlert('Stok tidak cukup, tersedia ' + stock);
        ui.setText(els.itemStatus, 'Stok tidak cukup, tersedia ' + stock);
        return;
      }

      const grossCents = apiCents(preview.subtotal);
      if (mergedDiscount > grossCents) {
        showAlert('Diskon tidak valid');
        ui.setText(els.itemStatus, 'Diskon tidak valid');
        return;
      }

      const line = {
        code: preview.code || code,
        name: preview.name || code,
        unit: preview.unit || '',
        unitPriceCents: apiCents(preview.unit_price),
        grossCents,
        qty: mergedQty,
        discountCents: apiCents(preview.discount),
        lineTotalCents: apiCents(preview.line_total),
        stock,
        error: ''
      };

      if (index >= 0) {
        state.lines[index] = line;
      } else {
        state.lines.push(line);
      }

      clearAlert();
      ui.setText(
        els.itemStatus,
        existing ? 'Kode barang digabung dengan baris yang sudah ada.' : 'Barang berhasil ditambahkan.'
      );
      els.productCode.value = '';
      els.itemQty.value = '1';
      els.itemDiscount.value = '0';
      renderLines();
      updateTotals();
      els.productCode.focus();
    } catch (error) {
      const message = (error && error.message) || 'Gagal menambah barang.';
      showAlert(message);
      ui.setText(els.itemStatus, message);
    } finally {
      if (token === state.recalcToken) {
        state.busy = false;
        updateButtons();
      }
    }
  }

  function applySessionUser(user) {
    const name = String((user && user.name) || 'Pengguna');
    const role = String((user && user.role) || '-');
    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.buildSidebar(role, 'sales-order');
  }

  async function loadSession() {
    try {
      const data = await api.get('/auth/me');
      applySessionUser(data && data.user ? data.user : {});
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat data sesi.');
    }
  }

  function cancelScheduledSearches() {
    if (customerTimer !== null) {
      window.clearTimeout(customerTimer);
      customerTimer = null;
    }
    if (productTimer !== null) {
      window.clearTimeout(productTimer);
      productTimer = null;
    }
  }

  async function resetForm() {
    const confirmed = await ui.confirmAction(
      'Kosongkan form sales order ini? Semua barang yang sudah ditambahkan akan dihapus.',
      { title: 'Batalkan Pengisian?', confirmLabel: 'Ya, kosongkan', danger: true }
    );
    if (!confirmed) {
      return;
    }

    cancelScheduledSearches();
    state.lines = [];
    state.customerId = null;
    state.credit = null;
    state.priceLevel = '';
    state.recalcToken += 1;
    state.busy = false;
    state.saving = false;

    els.customerSearch.value = '';
    els.customerSelect.value = '';
    els.productSearch.value = '';
    els.productCode.value = '';
    els.itemQty.value = '1';
    els.itemDiscount.value = '0';
    els.productOptions.textContent = '';

    applyCredit(null);
    clearAlert();
    ui.setText(els.itemStatus, 'Pilih pelanggan terlebih dahulu untuk melihat harga.');
    renderCustomerOptions();
    renderLines();
    updateTotals();
    updateButtons();
    loadCustomers('');
    els.customerSearch.focus();
  }

  els.customerSearch.addEventListener('input', () => {
    if (customerTimer !== null) {
      window.clearTimeout(customerTimer);
    }
    customerTimer = window.setTimeout(() => {
      customerTimer = null;
      loadCustomers(els.customerSearch.value.trim());
    }, SEARCH_DELAY_MS);
  });

  els.productSearch.addEventListener('input', () => {
    if (productTimer !== null) {
      window.clearTimeout(productTimer);
    }
    productTimer = window.setTimeout(() => {
      productTimer = null;
      loadProducts(els.productSearch.value.trim());
    }, SEARCH_DELAY_MS);
  });

  els.productSearch.addEventListener('change', () => {
    const value = els.productSearch.value.trim();
    const product = (state.products || []).find((item) => String(item.code) === value);
    if (product) {
      els.productCode.value = String(product.code);
      els.productCode.focus();
    }
  });

  els.customerSelect.addEventListener('change', handleCustomerChange);

  [els.productCode, els.itemQty, els.itemDiscount].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        addLine();
      }
    });
  });

  els.addItem.addEventListener('click', addLine);
  els.cancel.addEventListener('click', resetForm);

  els.itemsBody.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || !input.dataset || !input.dataset.lineField) {
      return;
    }
    if (state.busy || state.saving) {
      return;
    }

    const index = Number(input.dataset.index);
    const line = state.lines[index];
    if (!line) {
      return;
    }

    if (input.dataset.lineField === 'qty') {
      const qty = parseQty(input.value);
      if (qty === null) {
        showAlert('Jumlah tidak valid');
        renderLines();
        return;
      }
      line.qty = qty;
    } else {
      const discount = parseMoneyCents(input.value, true);
      if (discount === null) {
        showAlert('Diskon tidak valid');
        renderLines();
        return;
      }
      line.discountCents = discount;
    }

    recalculateAll();
  });

  els.itemsBody.addEventListener('click', (event) => {
    const button = event.target;
    if (!button || !button.dataset || button.dataset.removeIndex === undefined) {
      return;
    }
    if (state.busy || state.saving) {
      return;
    }
    const index = Number(button.dataset.removeIndex);
    if (!Number.isInteger(index) || index < 0 || index >= state.lines.length) {
      return;
    }
    state.lines.splice(index, 1);
    clearAlert();
    ui.setText(els.itemStatus, 'Barang dihapus dari order.');
    renderLines();
    updateTotals();
    updateButtons();
  });

  els.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (state.saving || state.busy || els.save.disabled) {
      return;
    }

    clearAlert();
    state.saving = true;
    updateButtons();

    const body = {
      customer_id: state.customerId,
      items: state.lines.map((line) => ({
        code: line.code,
        qty: line.qty,
        discount: centsToDecimal(line.discountCents || 0)
      }))
    };

    try {
      const data = await api.post('/orders', body);
      ui.notify('Sales order berhasil disimpan.');
      const order = data && data.order ? data.order : null;
      const target = order && order.id
        ? '/pages/order-detail.html?id=' + encodeURIComponent(String(order.id))
        : '/pages/orders.html';
      window.location.replace(target);
    } catch (error) {
      showAlert((error && error.message) || 'Gagal menyimpan sales order.');
      state.saving = false;
      updateButtons();
    }
  });

  ui.setupLogout(els.logout);
  renderLines();
  updateTotals();
  updateButtons();
  loadSession();
  loadCustomers('');
  els.productCode.focus();
}());
