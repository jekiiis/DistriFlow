/**
 * @file    order-detail.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-08 Detail Sales Order — rancangan Figma dengan data dari GET /api/orders/:id.
 *
 * Aksi:
 * - KASIR + DRAFT → halaman Pembayaran (UI-09).
 * - ADMIN/KASIR + LUNAS/PIUTANG → PDF invoice nyata (UI-10).
 * - ADMIN + DRAFT/PIUTANG → pembatalan via POST /api/orders/:id/cancel.
 * - Ubah order belum tersedia di API v1.0; kartu tetap dinonaktifkan.
 */
(function () {
  'use strict';

  const ITEM_COLUMNS = 6;
  const PAYMENT_COLUMNS = 6;

  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  const orderId = rawId && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;

  const state = { order: null, role: '', printing: false, cancelling: false };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }

  const nodes = {
    alert: el('detailAlert'),
    no: el('no'),
    status: el('status'),
    sub: el('sub'),
    info: el('label1'),
    items: el('table1'),
    total: el('label2'),
    payments: el('tblPay'),
    payInfo: el('payInfo'),
    totalTagihan: el('totalTagihan'),
    totalInfo: el('totalInfo'),
    bayarCard: el('bayarCard'),
    bayar: el('btnBayar'),
    cetakCard: el('cetakCard'),
    format: el('format'),
    cetak: el('btnCetak'),
    batalCard: el('batalCard'),
    batal: el('btnBatal'),
    batalReason: el('batalAlasan'),
    editCard: el('editCard'),
    edit: el('btnEdit'),
    cancelInfo: el('cancelInfo'),
    cancelList: el('cancelList')
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

  function emptyRow(message, columns) {
    return UI.el('tr', {}, UI.el('td', {
      class: 'empty', colspan: String(columns), text: message
    }));
  }

  function detailRow(label, value) {
    return [
      UI.el('dt', { text: label }),
      UI.el('dd', { text: value === null || value === undefined || value === '' ? '-' : String(value) })
    ];
  }

  function money(value) { return Layout.money(Layout.cents(value)); }

  function renderInfo(order) {
    const rows = [
      ...detailRow('No. order', order.order_no),
      ...detailRow('Tanggal order', UI.tanggal(order.order_date)),
      ...detailRow('Pelanggan', order.customer_name || order.customer_code),
      ...detailRow('Kode pelanggan', order.customer_code),
      ...detailRow('Sales', order.user_name || `ID ${order.user_id}`),
      ...detailRow('Jenis pembayaran', order.payment_type ? UI.statusLabel(order.payment_type) : '-'),
      ...detailRow('Jatuh tempo', UI.tanggal(order.due_date)),
      ...detailRow('Subtotal', money(order.subtotal)),
      ...detailRow('Diskon', money(order.discount)),
      ...detailRow('Dibuat', order.created_at || '-')
    ];
    nodes.info.replaceChildren(...rows);
  }

  function renderItems(items) {
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
      nodes.items.replaceChildren(emptyRow('Tidak ada barang pada order ini.', ITEM_COLUMNS));
      return;
    }
    nodes.items.replaceChildren(...list.map((item) => UI.el('tr', {}, [
      UI.td(item.code),
      UI.td(item.name),
      UI.td(money(item.unit_price), 'num'),
      UI.td(item.qty, 'num'),
      UI.td(money(item.discount), 'num'),
      UI.td(money(item.line_total), 'num')
    ])));
  }

  function renderPayments(payments) {
    const list = Array.isArray(payments) ? payments : [];
    setText('payInfo', list.length
      ? `${list.length} pembayaran tercatat. Backend menentukan status akhir order.`
      : 'Belum ada pembayaran untuk order ini.');

    if (list.length === 0) {
      nodes.payments.replaceChildren(emptyRow('Belum ada pembayaran.', PAYMENT_COLUMNS));
      return;
    }
    nodes.payments.replaceChildren(...list.map((payment) => UI.el('tr', {}, [
      UI.td(payment.paid_at || '-'),
      UI.td(`ID kasir ${payment.user_id}`),
      UI.td(payment.method ? UI.statusLabel(payment.method) : '-'),
      UI.td(money(payment.amount), 'num'),
      UI.td(money(payment.change_amount), 'num'),
      UI.td(payment.note || '-')
    ])));
  }

  function renderCancel(order) {
    const isCancelled = String(order.status || '') === 'BATAL';
    nodes.cancelInfo.classList.toggle('hidden', !isCancelled);
    if (!isCancelled) {
      nodes.cancelList.replaceChildren();
      return;
    }
    nodes.cancelList.replaceChildren(
      ...detailRow('Alasan', order.cancel_reason),
      ...detailRow('Dibatalkan pada', order.cancelled_at),
      ...detailRow('Oleh', order.cancelled_by ? `ID ${order.cancelled_by}` : '-')
    );
  }

  function canPay() {
    return Boolean(state.order) && state.role === 'KASIR' && state.order.status === 'DRAFT';
  }

  function canPrint() {
    return Boolean(state.order) &&
      ['ADMIN', 'KASIR'].includes(state.role) &&
      ['LUNAS', 'PIUTANG'].includes(state.order.status);
  }

  function canCancel() {
    return Boolean(state.order) && state.role === 'ADMIN' &&
      ['DRAFT', 'PIUTANG'].includes(state.order.status);
  }

  function updateActions() {
    const order = state.order;
    nodes.bayarCard.classList.toggle('hidden', !canPay());
    nodes.bayar.href = canPay()
      ? `payment.html?id=${encodeURIComponent(String(order.id))}`
      : '#';
    nodes.cetakCard.classList.toggle('hidden', !canPrint());
    nodes.cetak.disabled = state.printing || !canPrint();

    // Batal hanya untuk ADMIN pada order DRAFT/PIUTANG. Ubah pesanan tidak
    // memiliki endpoint di API v1.0, sehingga kartunya tetap nonaktif.
    nodes.batalCard.classList.toggle('hidden', !canCancel());
    nodes.batal.disabled = state.cancelling || !canCancel();
    nodes.batalReason.disabled = !canCancel();
    nodes.editCard.classList.toggle('hidden', !order || !['ADMIN', 'SALES'].includes(state.role));
    nodes.edit.disabled = true;
  }

  function applyOrder(order) {
    state.order = order;
    setText('no', order.order_no || '-');
    nodes.status.replaceChildren(UI.statusBadge(order.status));
    setText('sub', `Order ${order.order_no || '-'} · ${UI.statusLabel(order.status)} · rincian barang dan riwayat pembayaran.`);
    setText('totalTagihan', money(order.total));
    setText('label2', money(order.total));
    setText('totalInfo', `${(order.items || []).length} barang · subtotal ${money(order.subtotal)} · diskon ${money(order.discount)}`);
    renderInfo(order);
    renderItems(order.items);
    renderPayments(order.payments);
    renderCancel(order);
    updateActions();
  }

  async function loadOrder() {
    if (!orderId) {
      showAlert('ID sales order tidak valid');
      setText('no', 'Tidak valid');
      setText('sub', 'Buka daftar sales order lalu pilih satu order.');
      return;
    }

    showAlert('Memuat detail sales order…', 'warn');
    try {
      const response = await API.get(`/api/orders/${encodeURIComponent(String(orderId))}`);
      const order = response.data && response.data.order;
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

  async function printInvoice() {
    if (state.printing || !canPrint()) return;
    clearAlert();
    state.printing = true;
    nodes.cetak.disabled = true;
    nodes.cetak.textContent = 'Membuka PDF…';
    const format = ['a4', '80mm'].includes(nodes.format.value) ? nodes.format.value : 'a4';
    try {
      await API.openPdf(`/api/orders/${encodeURIComponent(String(orderId))}/invoice.pdf?format=${format}`);
      UI.toast('Invoice dibuka di tab baru.', 'ok');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal membuka invoice.');
    } finally {
      state.printing = false;
      nodes.cetak.textContent = 'Cetak Invoice';
      updateActions();
    }
  }

  async function cancelOrder() {
    if (state.cancelling || !canCancel()) return;
    const reason = nodes.batalReason.value.trim();
    if (!reason) {
      showAlert('Alasan pembatalan wajib diisi.');
      return;
    }
    if (reason.length > 255) {
      showAlert('Alasan pembatalan maksimal 255 karakter.');
      return;
    }
    if (!UI.confirm(`Batalkan order ${state.order.order_no}? Stok dikembalikan hanya untuk order berstatus Piutang.`)) return;

    state.cancelling = true;
    clearAlert();
    nodes.batal.textContent = 'Membatalkan…';
    try {
      await UI.busy(nodes.batal, () => API.post(
        `/api/orders/${encodeURIComponent(String(orderId))}/cancel`, { reason }
      ));
      nodes.batalReason.value = '';
      await loadOrder();
      if (state.order && state.order.status === 'BATAL') {
        showAlert(`Order ${state.order.order_no} berhasil dibatalkan.`, 'ok');
        UI.toast('Order dibatalkan.', 'ok');
      }
    } catch (error) {
      showAlert((error && error.message) || 'Gagal membatalkan order.');
    } finally {
      state.cancelling = false;
      nodes.batal.textContent = 'Batalkan Order';
      updateActions();
    }
  }

  nodes.cetak.addEventListener('click', printInvoice);
  nodes.batal.addEventListener('click', cancelOrder);

  Layout.start(async () => {
    state.role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    renderItems([]);
    renderPayments([]);
    setText('sub', 'Detail sales order, rincian barang, dan riwayat pembayaran.');
    await loadOrder();

    // Kompatibilitas dengan tautan lama order-detail.html?id=…&print=1.
    if (params.get('print') === '1' && canPrint()) {
      await printInvoice();
    }
  });
}());
