/**
 * @file    sales-order.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-06 Sales Order Baru — rancangan Figma dengan endpoint nyata.
 *
 * Endpoint: GET /api/auth/me, GET /api/customers, GET /api/customers/:id/credit,
 * GET /api/products, GET /api/products/by-code/:code, POST /api/orders.
 * Harga, level, dan stok selalu berasal dari server. Payload POST hanya memuat
 * customer_id dan items[{ code, qty, discount }].
 */
(function () {
  'use strict';

  const PAGE_LIMIT = 100;
  const SEARCH_DELAY_MS = 250;
  const COLUMNS = 7;

  const state = {
    customers: [],
    products: [],
    customerId: null,
    credit: null,
    lines: [],
    busy: false,
    saving: false,
    customerToken: 0,
    productToken: 0,
    recalcToken: 0
  };

  let customerTimer = null;
  let productTimer = null;

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }

  const nodes = {
    alert: el('soAlert'),
    customer: el('customer'),
    customerList: el('customerList'),
    customerStatus: el('customerStatus'),
    product: el('code'),
    productList: el('productList'),
    productInfo: el('productInfo'),
    qty: el('qty'),
    discount: el('discount'),
    itemInfo: el('itemInfo'),
    table: el('table1'),
    subtotal: el('subtotal'),
    discountTotal: el('discountTotal'),
    save: el('btnSimpan'),
    cancel: el('btnBatal')
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

  function totals() {
    return state.lines.reduce((acc, line) => {
      if (line.error) return acc;
      acc.subtotal += line.grossCents || 0;
      acc.discount += line.discountCents || 0;
      acc.total += line.lineTotalCents || 0;
      acc.qty += line.qty || 0;
      return acc;
    }, { subtotal: 0, discount: 0, total: 0, qty: 0 });
  }

  function updateSummary() {
    const sum = totals();
    setText('subtotal', Layout.money(sum.subtotal));
    setText('discountTotal', Layout.money(sum.discount));
    setText('label2', Layout.money(sum.total));
    setText('jmlBaris', `${state.lines.length} baris · ${sum.qty} item`);
  }

  function updateButtons() {
    const blocked = state.busy || state.saving || !state.customerId || !state.credit;
    const invalid = state.lines.some((line) => Boolean(line.error));
    el('btnTambah').disabled = blocked;
    nodes.save.disabled = blocked || state.lines.length === 0 || invalid;
    nodes.cancel.disabled = state.busy || state.saving;
    nodes.customer.disabled = state.busy || state.saving;
    nodes.product.disabled = blocked;
    nodes.qty.disabled = blocked;
    nodes.discount.disabled = blocked;
    nodes.save.textContent = state.saving ? 'Menyimpan…' : 'Simpan Order';
    el('btnTambah').textContent = state.busy ? 'Memproses…' : '+ Tambah';
  }

  function customerFromText(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return null;
    return state.customers.find((customer) => {
      const code = String(customer.code || '').toLowerCase();
      const name = String(customer.name || '').toLowerCase();
      const label = `${code} — ${name}`;
      return text === code || text === name || text === label;
    }) || null;
  }

  function renderCustomers() {
    nodes.customerList.replaceChildren(...state.customers.map((customer) =>
      UI.el('option', { value: `${customer.code} — ${customer.name}` })));
  }

  function renderProducts() {
    nodes.productList.replaceChildren(...state.products.map((product) =>
      UI.el('option', { value: String(product.code) })));
  }

  function applyCredit(credit) {
    state.credit = credit || null;
    const level = credit ? String(credit.price_level || 'RETAIL').toUpperCase() : '-';
    setText('creditName', credit ? credit.name : '-');
    setText('creditCode', credit ? credit.code : '-');
    setText('levelInfo', level);
    setText('creditLimit', credit ? Layout.money(Layout.cents(credit.credit_limit)) : '-');
    setText('kpiCustomer', credit ? credit.name : 'Belum dipilih');
    setText('kpiCustomerCode', credit ? credit.code : 'Cari kode atau nama toko');
    setText('kpiLevel', level);
    setText('kpiLimit', credit ? Layout.money(Layout.cents(credit.remaining_limit)) : '-');
    setText('kpiOutstanding', credit
      ? `Piutang berjalan: ${Layout.money(Layout.cents(credit.outstanding))}`
      : 'Piutang berjalan: -');

    const risk = el('riskAlert');
    if (credit) {
      const limit = Layout.cents(credit.credit_limit);
      const outstanding = Layout.cents(credit.outstanding);
      if (limit > 0 && outstanding >= Math.round(limit * 0.8)) {
        risk.textContent = 'Piutang pelanggan mencapai atau melampaui 80% dari limit kredit. Pembayaran kredit akan divalidasi Kasir.';
        risk.classList.remove('hidden');
      } else {
        risk.classList.add('hidden');
      }
    } else {
      risk.classList.add('hidden');
    }
  }

  async function loadCustomers(search) {
    const token = ++state.customerToken;
    nodes.customerStatus.textContent = 'Memuat pelanggan…';
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (search) params.set('search', search);
      const response = await API.get(`/api/customers?${params}`);
      if (token !== state.customerToken) return;
      state.customers = Array.isArray(response.data && response.data.customers)
        ? response.data.customers : [];
      renderCustomers();
      nodes.customerStatus.textContent = state.customers.length
        ? `${state.customers.length} pelanggan ditemukan.`
        : 'Tidak ada pelanggan yang cocok dengan pencarian.';
    } catch (error) {
      if (token !== state.customerToken) return;
      state.customers = [];
      renderCustomers();
      nodes.customerStatus.textContent = (error && error.message) || 'Gagal memuat daftar pelanggan.';
      showAlert(nodes.customerStatus.textContent);
    }
  }

  async function loadProducts(search) {
    const token = ++state.productToken;
    nodes.productInfo.textContent = 'Memuat barang…';
    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (search) params.set('search', search);
      const response = await API.get(`/api/products?${params}`);
      if (token !== state.productToken) return;
      state.products = Array.isArray(response.data && response.data.products)
        ? response.data.products : [];
      renderProducts();
      nodes.productInfo.textContent = state.products.length
        ? `${state.products.length} barang tersedia.`
        : 'Tidak ada barang yang cocok dengan pencarian.';
    } catch (error) {
      if (token !== state.productToken) return;
      state.products = [];
      renderProducts();
      nodes.productInfo.textContent = (error && error.message) || 'Gagal memuat daftar barang.';
      showAlert(nodes.productInfo.textContent);
    }
  }

  function fetchPrice(code, qty, discountCents) {
    const params = new URLSearchParams({
      level: state.credit.price_level,
      qty: String(qty),
      discount: Layout.decimal(discountCents)
    });
    return API.get(`/api/products/by-code/${encodeURIComponent(code)}?${params}`);
  }

  function applyPreview(line, preview) {
    const stock = Number(preview.stock) || 0;
    const grossCents = Layout.cents(preview.subtotal);
    let error = '';
    if (line.qty > stock) error = `Stok tidak cukup, tersedia ${stock}`;
    else if (line.discountCents > grossCents) error = 'Diskon tidak valid';

    return Object.assign({}, line, {
      code: preview.code || line.code,
      name: preview.name || line.name,
      unit: preview.unit || line.unit,
      unitPriceCents: Layout.cents(preview.unit_price),
      grossCents,
      discountCents: Layout.cents(preview.discount),
      lineTotalCents: Layout.cents(preview.line_total),
      stock,
      error
    });
  }

  function renderLines() {
    nodes.table.replaceChildren();
    if (state.lines.length === 0) {
      nodes.table.append(UI.el('tr', {}, UI.el('td', {
        class: 'empty', colspan: String(COLUMNS), text: 'Belum ada barang yang ditambahkan.'
      })));
      return;
    }

    state.lines.forEach((line, index) => {
      const nameCell = UI.el('td', {}, String(line.name || '-'));
      if (line.error) {
        nameCell.append(UI.el('div', { class: 'field-error', text: line.error }));
      }
      const qtyInput = UI.el('input', {
        class: 'input', type: 'number', min: '1', step: '1', value: String(line.qty),
        'aria-label': `Jumlah ${line.code}`, dataset: { field: 'qty', index: String(index) }
      });
      const discountInput = UI.el('input', {
        class: 'input', type: 'text', inputmode: 'decimal', value: Layout.decimal(line.discountCents || 0),
        'aria-label': `Diskon ${line.code}`, dataset: { field: 'discount', index: String(index) }
      });
      const remove = UI.el('button', {
        class: 'btn secondary', type: 'button', text: 'Hapus',
        'aria-label': `Hapus ${line.code}`, dataset: { remove: String(index) }
      });

      nodes.table.append(UI.el('tr', {}, [
        UI.td(line.code),
        nameCell,
        UI.td(Layout.money(line.unitPriceCents || 0), 'num'),
        UI.el('td', {}, qtyInput),
        UI.el('td', {}, discountInput),
        UI.td(Layout.money(Math.max(0, line.lineTotalCents || 0)), 'num'),
        UI.el('td', {}, remove)
      ]));
    });
  }

  async function recalculateAll() {
    if (!state.credit || state.lines.length === 0) {
      state.busy = false;
      if (state.lines.length && !state.credit) {
        state.lines = state.lines.map((line) => Object.assign({}, line, {
          error: 'Pilih pelanggan terlebih dahulu', grossCents: 0, lineTotalCents: 0
        }));
      }
      renderLines();
      updateSummary();
      updateButtons();
      return;
    }

    const token = ++state.recalcToken;
    state.busy = true;
    updateButtons();
    nodes.itemInfo.textContent = 'Menghitung ulang harga sesuai level pelanggan…';

    const nextLines = [];
    let firstError = '';
    for (const line of state.lines) {
      try {
        const response = await fetchPrice(line.code, line.qty, line.discountCents);
        if (token !== state.recalcToken) return;
        const updated = applyPreview(line, response.data);
        if (updated.error && !firstError) firstError = updated.error;
        nextLines.push(updated);
      } catch (error) {
        if (token !== state.recalcToken) return;
        const message = (error && error.message) || 'Gagal memuat harga barang.';
        if (!firstError) firstError = message;
        nextLines.push(Object.assign({}, line, { error: message, grossCents: 0, lineTotalCents: 0 }));
      }
    }
    if (token !== state.recalcToken) return;

    state.lines = nextLines;
    state.busy = false;
    nodes.itemInfo.textContent = firstError || 'Harga diperbarui sesuai level pelanggan.';
    if (firstError) showAlert(firstError); else clearAlert();
    renderLines();
    updateSummary();
    updateButtons();
  }

  async function selectCustomer(customerId) {
    if (!customerId || state.customerId === customerId) return;
    state.customerId = customerId;
    state.recalcToken += 1;
    state.busy = true;
    applyCredit(null);
    updateButtons();
    nodes.itemInfo.textContent = 'Memuat level harga dan limit pelanggan…';

    try {
      const response = await API.get(`/api/customers/${encodeURIComponent(String(customerId))}/credit`);
      if (state.customerId !== customerId) return;
      applyCredit(response.data);
      clearAlert();
      await recalculateAll();
    } catch (error) {
      if (state.customerId !== customerId) return;
      applyCredit(null);
      state.busy = false;
      const message = (error && error.message) || 'Gagal memuat data kredit pelanggan.';
      showAlert(message);
      nodes.itemInfo.textContent = message;
      state.lines = state.lines.map((line) => Object.assign({}, line, {
        error: 'Data pelanggan tidak tersedia', grossCents: 0, lineTotalCents: 0
      }));
      renderLines();
      updateSummary();
      updateButtons();
    }
  }

  function clearCustomer() {
    state.customerId = null;
    state.recalcToken += 1;
    state.busy = false;
    applyCredit(null);
    state.lines = state.lines.map((line) => Object.assign({}, line, {
      error: 'Pilih pelanggan terlebih dahulu', grossCents: 0, lineTotalCents: 0
    }));
    nodes.itemInfo.textContent = 'Pilih pelanggan terlebih dahulu untuk melihat harga.';
    renderLines();
    updateSummary();
    updateButtons();
  }

  async function addLine() {
    if (state.busy || state.saving) return;
    const code = nodes.product.value.trim();
    if (!code) {
      showAlert('Kode barang wajib diisi');
      nodes.product.focus();
      return;
    }
    if (!state.customerId || !state.credit) {
      showAlert('Pilih pelanggan terlebih dahulu');
      nodes.customer.focus();
      return;
    }

    const qty = Layout.parseQty(nodes.qty.value);
    if (qty === null) {
      showAlert('Jumlah harus bilangan bulat minimal 1');
      nodes.qty.focus();
      return;
    }
    const discountCents = Layout.parseMoneyCents(nodes.discount.value, true);
    if (discountCents === null) {
      showAlert('Diskon tidak valid');
      nodes.discount.focus();
      return;
    }

    const key = code.toUpperCase();
    const index = state.lines.findIndex((line) => String(line.code).toUpperCase() === key);
    const existing = index >= 0 ? state.lines[index] : null;
    const mergedQty = (existing ? existing.qty : 0) + qty;
    const mergedDiscount = (existing ? existing.discountCents : 0) + discountCents;
    if (!Number.isSafeInteger(mergedQty)) {
      showAlert('Jumlah tidak valid');
      return;
    }

    const token = ++state.recalcToken;
    state.busy = true;
    updateButtons();
    nodes.itemInfo.textContent = 'Memeriksa harga dan stok…';

    try {
      const response = await fetchPrice(code, mergedQty, mergedDiscount);
      if (token !== state.recalcToken) return;
      const line = applyPreview({ code, qty: mergedQty, discountCents: mergedDiscount }, response.data);
      if (line.error) {
        showAlert(line.error);
        nodes.itemInfo.textContent = line.error;
        return;
      }
      if (index >= 0) state.lines[index] = line;
      else state.lines.push(line);
      clearAlert();
      nodes.itemInfo.textContent = existing
        ? 'Kode barang digabung dengan baris yang sudah ada.'
        : 'Barang berhasil ditambahkan.';
      nodes.product.value = '';
      nodes.qty.value = '1';
      nodes.discount.value = '0';
      renderLines();
      updateSummary();
      nodes.product.focus();
    } catch (error) {
      const message = (error && error.message) || 'Gagal menambah barang.';
      showAlert(message);
      nodes.itemInfo.textContent = message;
    } finally {
      if (token === state.recalcToken) {
        state.busy = false;
        updateButtons();
      }
    }
  }

  async function saveOrder() {
    if (state.saving || state.busy || nodes.save.disabled) return;
    clearAlert();
    state.saving = true;
    updateButtons();

    const payload = {
      customer_id: state.customerId,
      items: state.lines.map((line) => ({
        code: line.code,
        qty: line.qty,
        discount: Layout.decimal(line.discountCents || 0)
      }))
    };

    try {
      const response = await API.post('/api/orders', payload);
      const order = response.data && response.data.order;
      UI.flash('Sales order berhasil disimpan.', 'ok');
      window.location.href = order && order.id
        ? `order-detail.html?id=${encodeURIComponent(String(order.id))}`
        : 'orders.html';
    } catch (error) {
      state.saving = false;
      showAlert((error && error.message) || 'Gagal menyimpan sales order.');
      updateButtons();
    }
  }

  async function resetForm() {
    if (!UI.confirm('Kosongkan form sales order ini? Semua barang yang ditambahkan akan dihapus.')) return;
    if (customerTimer) window.clearTimeout(customerTimer);
    if (productTimer) window.clearTimeout(productTimer);
    state.lines = [];
    state.customerToken += 1;
    state.productToken += 1;
    state.recalcToken += 1;
    state.busy = false;
    state.saving = false;
    nodes.customer.value = '';
    nodes.product.value = '';
    nodes.qty.value = '1';
    nodes.discount.value = '0';
    clearCustomer();
    clearAlert();
    loadCustomers('');
    loadProducts('');
    nodes.customer.focus();
  }

  nodes.customer.addEventListener('input', () => {
    if (customerTimer) window.clearTimeout(customerTimer);
    customerTimer = window.setTimeout(() => {
      customerTimer = null;
      loadCustomers(nodes.customer.value.trim());
    }, SEARCH_DELAY_MS);
    const match = customerFromText(nodes.customer.value);
    if (!match) clearCustomer();
  });

  nodes.customer.addEventListener('change', () => {
    const match = customerFromText(nodes.customer.value);
    if (match) selectCustomer(Number(match.id));
    else if (nodes.customer.value.trim()) {
      showAlert('Pelanggan tidak ditemukan dalam daftar aktif.');
      clearCustomer();
    } else clearCustomer();
  });

  nodes.product.addEventListener('input', () => {
    if (productTimer) window.clearTimeout(productTimer);
    productTimer = window.setTimeout(() => {
      productTimer = null;
      loadProducts(nodes.product.value.trim());
    }, SEARCH_DELAY_MS);
  });

  el('formItem').addEventListener('submit', (event) => {
    event.preventDefault();
    addLine();
  });

  nodes.table.addEventListener('change', (event) => {
    const input = event.target;
    if (!input || !input.dataset || !input.dataset.field || state.busy || state.saving) return;
    const index = Number(input.dataset.index);
    const line = state.lines[index];
    if (!line) return;
    if (input.dataset.field === 'qty') {
      const qty = Layout.parseQty(input.value);
      if (qty === null) {
        showAlert('Jumlah harus bilangan bulat minimal 1');
        renderLines();
        return;
      }
      line.qty = qty;
    } else {
      const discount = Layout.parseMoneyCents(input.value, true);
      if (discount === null) {
        showAlert('Diskon tidak valid');
        renderLines();
        return;
      }
      line.discountCents = discount;
    }
    recalculateAll();
  });

  nodes.table.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-remove]');
    if (!button || state.busy || state.saving) return;
    const index = Number(button.dataset.remove);
    if (!Number.isInteger(index) || index < 0 || index >= state.lines.length) return;
    state.lines.splice(index, 1);
    state.recalcToken += 1;
    clearAlert();
    nodes.itemInfo.textContent = 'Barang dihapus dari order.';
    renderLines();
    updateSummary();
    updateButtons();
  });

  nodes.save.addEventListener('click', saveOrder);
  nodes.cancel.addEventListener('click', resetForm);

  [nodes.customer, nodes.product, nodes.qty, nodes.discount].forEach((input) => {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && input !== nodes.customer) {
        event.preventDefault();
        addLine();
      }
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'F4') {
      event.preventDefault();
      nodes.product.focus();
    }
    if (event.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
      event.preventDefault();
      nodes.customer.focus();
    }
  });

  Layout.start(async () => {
    setText('tgl', UI.tanggal(UI.today()));
    renderLines();
    updateSummary();
    updateButtons();
    await Promise.all([loadCustomers(''), loadProducts('')]);
    nodes.customer.focus();
  });
}());
