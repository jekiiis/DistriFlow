/**
 * @file    stock-in.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-13 Barang Masuk — POST /api/stock-in dan GET /api/stock-in.
 *
 * Nomor dokumen duplikat menghasilkan 409 needConfirm: pengguna diminta
 * konfirmasi lewat modal yang sudah ada, lalu dikirim ulang dengan
 * confirm_duplicate:true. Tombol "Lihat Aturan Duplikasi" tetap membuka
 * modal yang sama sebagai demonstrasi manual.
 */
(function () {
  'use strict';

  const SEARCH_LIMIT = 10;
  const LOG_COLUMNS = 8;

  const state = {
    product: null,
    saving: false,
    pendingPayload: null,
    log: { page: 1, limit: 10, totalPages: 1, loading: false }
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }
  function money(value) { return Layout.money(Layout.cents(value)); }
  function show(message, type = 'warn') {
    const node = el('stockAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clear() {
    const node = el('stockAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }
  function detailRow(label, value) {
    return [
      UI.el('dt', { text: label }),
      UI.el('dd', { text: value === null || value === undefined || value === '' ? '-' : String(value) })
    ];
  }
  function emptyRow(message, columns) {
    return UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(columns), text: message }));
  }
  function formatTime(value) {
    if (!value) return '—';
    const text = String(value);
    const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/.exec(text);
    return match ? `${match[1]} ${match[2]}` : text;
  }
  function setInputsDisabled(disabled) {
    ['qty', 'docNo', 'matchInvoice'].forEach((id) => { el(id).disabled = disabled; });
  }
  function clearProduct() {
    state.product = null;
    setInputsDisabled(true);
    el('qty').value = '';
    el('docNo').value = '';
    el('matchInvoice').checked = false;
    el('productInfo').replaceChildren(...detailRow('Barang terpilih', 'Belum ada barang dipilih'));
  }

  function renderSearchResults(products) {
    const box = el('searchResults');
    if (!products.length) {
      box.replaceChildren(UI.el('div', { class: 'empty', text: 'Barang tidak ditemukan.' }));
      box.classList.remove('hidden');
      return;
    }
    box.replaceChildren(...products.map((product) => UI.el('button', {
      class: 'btn secondary small',
      type: 'button',
      text: `${product.code} · ${product.name} · stok ${product.stock}`,
      title: 'Pilih barang ini',
      onclick() { selectProduct(product); }
    })));
    box.classList.remove('hidden');
  }

  async function searchProducts(event) {
    event.preventDefault();
    clear();
    const term = el('productSearch').value.trim();
    if (!term) {
      show('Masukkan kode atau nama barang terlebih dahulu.');
      return;
    }
    try {
      await UI.busy(el('btnSearch'), async () => {
        const query = new URLSearchParams({ search: term, limit: String(SEARCH_LIMIT) });
        const response = await API.get(`/api/products?${query.toString()}`);
        const products = (response.data || {}).products || [];
        renderSearchResults(products);
      });
    } catch (error) {
      el('searchResults').classList.add('hidden');
      if (!(error && error.status === 401)) show(errorFrom(error, 'Gagal mencari barang.'), 'err');
    }
  }

  function selectProduct(product) {
    state.product = product;
    el('searchResults').classList.add('hidden');
    el('productInfo').replaceChildren(
      ...detailRow('Kode', product.code),
      ...detailRow('Nama', product.name),
      ...detailRow('Satuan', product.unit),
      ...detailRow('Stok saat ini', product.stock),
      ...detailRow('Stok minimum', product.min_stock),
      ...detailRow('Harga retail', money(product.price_retail)),
      ...detailRow('Kategori / rak', '—')
    );
    setInputsDisabled(false);
    clear();
    UI.toast(`${product.code} dipilih.`, 'ok');
  }

  function validateForm() {
    if (!state.product) return 'Pilih barang terlebih dahulu.';
    const qty = Layout.parseQty(el('qty').value);
    if (qty === null) return 'Jumlah masuk minimal 1 dan harus bilangan bulat.';
    if (!el('docNo').value.trim()) return 'No. dokumen pemasok wajib diisi.';
    if (!el('matchInvoice').checked) return 'Centang kesesuaian dengan detail faktur.';
    return '';
  }

  function buildPayload() {
    return {
      product_id: Number(state.product.id),
      qty: Layout.parseQty(el('qty').value),
      document_no: el('docNo').value.trim(),
      invoice_match: true
    };
  }

  function openDuplicateModal(message) {
    setText('duplicateMessage', message || 'Nomor dokumen yang sama sudah pernah dicatat. Simpan lagi?');
    el('duplicateModal').classList.remove('hidden');
  }
  function closeDuplicateModal() {
    el('duplicateModal').classList.add('hidden');
    state.pendingPayload = null;
  }

  function renderLog(movements) {
    if (!movements.length) {
      el('logBody').replaceChildren(emptyRow('Belum ada pencatatan barang masuk.', LOG_COLUMNS));
      return;
    }
    el('logBody').replaceChildren(...movements.map((movement) => UI.el('tr', {}, [
      UI.td(formatTime(movement.created_at)),
      UI.el('td', {}, [
        UI.el('div', { text: movement.product_name || '—' }),
        UI.el('div', { class: 'ui-muted-cell', text: movement.product_code || '—' })
      ]),
      UI.td(movement.qty, 'num'),
      UI.td(movement.reference),
      UI.td('—', 'num'), // API tidak mengembalikan stok sebelum mutasi
      UI.td(movement.stock_after, 'num'),
      UI.el('td', {}, UI.el('span', { class: 'badge Aman', text: 'Tercatat' })),
      UI.td('—')
    ])));
  }

  function updateLogPager() {
    const totalPages = Math.max(1, state.log.totalPages || 1);
    setText('logPageLabel', `${state.log.page} / ${totalPages}`);
    el('logPrev').disabled = state.log.loading || state.log.page <= 1;
    el('logNext').disabled = state.log.loading || state.log.page >= totalPages;
  }

  async function loadLog() {
    if (state.log.loading) return;
    state.log.loading = true;
    setText('logInfo', 'Memuat riwayat penerimaan…');
    el('logBody').replaceChildren(emptyRow('Memuat riwayat…', LOG_COLUMNS));
    updateLogPager();
    try {
      const query = new URLSearchParams({
        page: String(state.log.page), limit: String(state.log.limit)
      });
      const response = await API.get(`/api/stock-in?${query.toString()}`);
      const data = response.data || {};
      const movements = Array.isArray(data.movements) ? data.movements : [];
      const pager = data.pagination || {};
      state.log.page = Number(pager.page) || state.log.page;
      state.log.totalPages = Math.max(1, Number(pager.totalPages) || 1);
      const total = Number(pager.total || 0);
      renderLog(movements);
      setText('logInfo', total
        ? `Menampilkan ${movements.length} dari ${total.toLocaleString('id-ID')} pencatatan`
        : 'Belum ada pencatatan barang masuk');
    } catch (error) {
      if (error && error.status === 401) return;
      el('logBody').replaceChildren(emptyRow('Riwayat penerimaan tidak dapat dimuat.', LOG_COLUMNS));
      setText('logInfo', errorFrom(error, 'Gagal memuat riwayat penerimaan.'));
    } finally {
      state.log.loading = false;
      updateLogPager();
    }
  }

  async function submit(payload, button) {
    if (state.saving) return;
    state.saving = true;
    try {
      const response = await UI.busy(button, () => API.post('/api/stock-in', payload));
      closeDuplicateModal();
      const movement = (response.data || {}).movement || {};
      const product = state.product || {};
      const after = movement.stock_after === null || movement.stock_after === undefined
        ? '—' : movement.stock_after;
      const message = `${product.code || movement.product_code || 'Barang'} bertambah ${movement.qty || payload.qty} ${product.unit || ''} · stok setelah pencatatan: ${after}.`;
      show(message, 'ok');
      UI.toast(message, 'ok');
      clearProduct();
      state.log.page = 1;
      await loadLog();
    } catch (error) {
      if (error && error.status === 401) return;
      if (error && error.status === 409 && error.needConfirm) {
        state.pendingPayload = payload;
        openDuplicateModal(errorFrom(error, 'Nomor dokumen sudah pernah dicatat. Simpan lagi?'));
        return;
      }
      const message = errorFrom(error, 'Gagal mencatat barang masuk.');
      show(message);
      UI.toast(message, 'err');
    } finally {
      state.saving = false;
    }
  }

  function onSave() {
    const message = validateForm();
    if (message) {
      show(message);
      return;
    }
    clear();
    submit(buildPayload(), el('btnSave'));
  }

  function onConfirmDuplicate() {
    if (!state.pendingPayload) {
      closeDuplicateModal();
      UI.toast('Aturan duplikasi ditampilkan. Isi form lalu simpan untuk mencatat.', 'warn');
      return;
    }
    submit({ ...state.pendingPayload, confirm_duplicate: true }, el('btnConfirmDuplicate'));
  }

  el('stockForm').addEventListener('submit', searchProducts);
  el('qty').addEventListener('input', () => {
    const message = validateForm();
    if (message && el('qty').value) show(message); else clear();
  });
  el('docNo').addEventListener('input', clear);
  el('matchInvoice').addEventListener('change', clear);
  el('btnDuplicateRule').addEventListener('click', () => {
    const doc = el('docNo').value.trim() || 'SJ.0112';
    const name = state.product ? state.product.name : 'barang terpilih';
    openDuplicateModal(`No. dokumen ${doc} sudah pernah dicatat untuk ${name}. Simpan lagi?`);
  });
  el('btnSave').addEventListener('click', onSave);
  el('btnConfirmDuplicate').addEventListener('click', onConfirmDuplicate);
  el('btnCloseDuplicate').addEventListener('click', closeDuplicateModal);
  el('btnCancelDuplicate').addEventListener('click', closeDuplicateModal);
  el('duplicateModal').addEventListener('click', (event) => {
    if (event.target === el('duplicateModal')) closeDuplicateModal();
  });
  el('logPrev').addEventListener('click', () => {
    if (state.log.page > 1) { state.log.page -= 1; loadLog(); }
  });
  el('logNext').addEventListener('click', () => {
    if (state.log.page < state.log.totalPages) { state.log.page += 1; loadLog(); }
  });
  el('logLimit').addEventListener('change', () => {
    state.log.limit = Math.min(100, Math.max(1, Number(el('logLimit').value) || 10));
    state.log.page = 1;
    loadLog();
  });

  Layout.start(async () => {
    const role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    if (role === 'ADMIN') el('adminNote').classList.remove('hidden');
    clear();
    clearProduct();
    await loadLog();
  });
}());
