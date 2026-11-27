/**
 * @file    receivables.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-16 Daftar Piutang + UI-17 Modal Pelunasan Piutang.
 *
 * Sumber data: GET /api/receivables (pagination/filter backend) dan
 * GET /api/receivables/:id saat modal dibuka. Pelunasan memakai
 * POST /api/receivables/:id/pay, bukti PDF GET /api/payments/:id/receipt.pdf.
 * Risiko berasal dari backend; hitungan lokal hanya dipakai bila field absen.
 */
(function () {
  'use strict';

  const COLUMNS = 9;
  const LIMIT = 10;
  const RISK_RATIO = 0.8;

  const state = {
    rows: [],
    page: 1,
    totalPages: 1,
    total: 0,
    limit: LIMIT,
    search: '',
    from: '',
    to: '',
    risk: '',
    loading: false,
    saving: false,
    selected: null,
    cashier: '',
    role: ''
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }
  function money(cents) { return Layout.money(cents); }
  function show(message, type = 'err') {
    const node = el('receivableAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clearAlert() {
    const node = el('receivableAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }
  function emptyRow(message) {
    return UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(COLUMNS), text: message }));
  }

  function normalize(raw) {
    const source = raw || {};
    const totalCents = Layout.cents(source.total);
    const paidCents = Layout.cents(source.paid);
    const outstanding = source.outstanding === null || source.outstanding === undefined
      ? null : Layout.cents(source.outstanding);
    const customerOutstanding = source.customer_outstanding === null || source.customer_outstanding === undefined
      ? null : Layout.cents(source.customer_outstanding);
    return {
      id: Number(source.id),
      orderNo: source.order_no || '-',
      orderDate: source.order_date || '',
      customerId: source.customer_id,
      customerCode: source.customer_code || '-',
      customerName: source.customer_name || source.customer_code || '-',
      totalCents,
      paidCents,
      remainingCents: outstanding === null ? Math.max(0, totalCents - paidCents) : Math.max(0, outstanding),
      dueDate: source.due_date || '',
      status: source.status || '',
      risk: source.risk || '',
      paymentCount: Number(source.payment_count) || 0,
      creditLimitCents: Layout.cents(source.credit_limit),
      customerOutstandingCents: customerOutstanding,
      payments: Array.isArray(source.payments) ? source.payments : []
    };
  }

  function riskOf(row) {
    const risk = String(row && row.risk ? row.risk : '');
    if (risk === 'Aman' || risk === 'Berisiko') return risk;
    // Fallback hanya bila backend tidak mengirim risk (aturan 80% yang disetujui).
    if (row && row.creditLimitCents > 0 && row.customerOutstandingCents !== null) {
      return row.customerOutstandingCents >= row.creditLimitCents * RISK_RATIO
        ? 'Berisiko' : 'Aman';
    }
    return '';
  }

  function riskCellClass(risk) {
    if (risk === 'Berisiko') return 'ui-risk ui-risk--warn';
    if (risk === 'Aman') return 'ui-risk ui-risk--ok';
    return 'ui-risk';
  }

  function dayDiff(value) {
    if (!value) return null;
    const today = new Date(`${UI.today()}T00:00:00`);
    const target = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    return Math.round((today.getTime() - target.getTime()) / 86400000);
  }

  function isOverdue(row) {
    const diff = dayDiff(row.dueDate);
    return diff !== null && diff > 0;
  }

  function statusText(row) {
    if (row.status) return UI.statusLabel(row.status);
    const diff = dayDiff(row.dueDate);
    if (diff === null) return '-';
    if (diff > 0) return `Tertambat (${diff} hari)`;
    if (diff === 0) return 'Jatuh tempo hari ini';
    return `Belum jatuh tempo (${Math.abs(diff)} hari)`;
  }

  function filteredRows() {
    const term = state.search.toLowerCase();
    if (!state.risk) return state.rows;
    return state.rows.filter((row) => riskOf(row) === state.risk);
  }

  function renderKpis() {
    const rows = state.rows;
    const totalCents = rows.reduce((sum, row) => sum + row.remainingCents, 0);
    const overdue = rows.filter(isOverdue);
    const overdueCents = overdue.reduce((sum, row) => sum + row.remainingCents, 0);
    const paidCents = rows.reduce((sum, row) => sum + row.paidCents, 0);
    const payments = rows.reduce((sum, row) => sum + row.paymentCount, 0);
    setText('kpiTotal', money(totalCents));
    setText('kpiTotalFoot', `${rows.length} piutang pada halaman ini`);
    setText('kpiOverdue', money(overdueCents));
    setText('kpiOverdueFoot', `${overdue.length} faktur lewat jatuh tempo`);
    setText('kpiCollected', money(paidCents));
    setText('kpiCollectedFoot', `${payments} pembayaran tercatat`);
  }

  function renderTable() {
    const list = filteredRows();
    // Backend sudah mengembalikan sesuai halaman; risiko difilter lokal di halaman ini.
    const visible = list.slice(0, state.limit);

    if (visible.length === 0) {
      el('receivableBody').replaceChildren(emptyRow(
        state.total > 0 ? 'Tidak ada piutang yang cocok pada halaman ini.'
          : 'Belum ada piutang tercatat.'
      ));
    } else {
      el('receivableBody').replaceChildren(...visible.map((row) => {
        const action = state.role === 'KASIR'
          ? UI.el('td', { class: 'right' }, UI.el('button', {
            class: 'btn small', type: 'button', text: 'Pelunasan',
            onclick() { openSettle(row); }
          }))
          : UI.td('-', 'right');
        return UI.el('tr', {}, [
          UI.td(row.orderNo),
          UI.el('td', {}, [
            UI.el('div', { text: row.customerName }),
            UI.el('div', { class: 'ui-muted-cell', text: row.customerCode })
          ]),
          UI.td(money(row.totalCents), 'num'),
          UI.td(money(row.paidCents), 'num'),
          UI.td(money(row.remainingCents), 'num'),
          UI.td(row.dueDate ? UI.tanggal(row.dueDate) : '-'),
          UI.el('td', {}, UI.el('span', {
            class: riskCellClass(riskOf(row)), text: riskOf(row) || '-'
          })),
          UI.td(statusText(row)),
          action
        ]);
      }));
    }

    const riskNote = state.risk ? ' · risiko difilter pada halaman ini' : '';
    setText('resultInfo', state.total
      ? `Menampilkan ${visible.length} dari ${state.total} piutang · halaman ${state.page}/${state.totalPages}${riskNote}`
      : 'Tidak ada piutang tercatat.');
    setText('paginationInfo', state.total
      ? `Total ${state.total} piutang · ${state.limit} per halaman`
      : 'Tidak ada data');
    setText('pageLabel', `${state.page} / ${state.totalPages}`);
    el('prevPage').disabled = state.loading || state.page <= 1;
    el('nextPage').disabled = state.loading || state.page >= state.totalPages;
  }

  async function loadReceivables(page) {
    if (state.loading) return;
    state.loading = true;
    const targetPage = Number(page) || 1;
    show('Memuat data piutang…', 'warn');
    try {
      const query = new URLSearchParams({
        page: String(targetPage), limit: String(state.limit)
      });
      if (state.search) query.set('search', state.search);
      if (state.from) query.set('date_from', state.from);
      if (state.to) query.set('date_to', state.to);

      const response = await API.get(`/api/receivables?${query.toString()}`);
      const payload = response.data || {};
      const rows = Array.isArray(payload.receivables) ? payload.receivables : [];
      const pagination = payload.pagination || {};

      state.rows = rows.map(normalize);
      state.limit = Number(pagination.limit) || state.limit;
      state.total = Number(pagination.total) || 0;
      state.totalPages = Math.max(1, Number(pagination.totalPages) || 1);
      state.page = Math.min(Number(pagination.page) || targetPage, state.totalPages);

      renderKpis();
      renderTable();
      if (el('receivableAlert').textContent.includes('Memuat')) clearAlert();
    } catch (error) {
      state.rows = [];
      state.total = 0;
      state.totalPages = 1;
      state.page = 1;
      el('receivableBody').replaceChildren(emptyRow('Gagal memuat data piutang.'));
      setText('resultInfo', 'Gagal memuat data piutang.');
      show(errorFrom(error, 'Gagal memuat data piutang.'));
    } finally {
      state.loading = false;
      renderTable();
    }
  }

  function updateSettleHint(row) {
    const cents = Layout.parseMoneyCents(el('settleNominal').value, true);
    if (cents === null || cents < 1) {
      setText('settleMinHint', 'Minimal Rp1, maksimal sebesar sisa piutang.');
    } else if (cents > row.remainingCents) {
      setText('settleMinHint', `Maksimal sebesar sisa piutang (${money(row.remainingCents)}).`);
    } else {
      setText('settleMinHint', `Nominal valid. Sisa setelah pembayaran: ${money(row.remainingCents - cents)}.`);
    }
  }

  function renderQuick(row) {
    const values = [
      { label: `Bayar Lunas ${money(row.remainingCents)}`, cents: row.remainingCents },
      { label: 'Rp1.000.000', cents: 100000000 }
    ];
    el('settleQuick').replaceChildren(...values.map((item) => UI.el('button', {
      class: 'btn secondary small', type: 'button', text: item.label,
      onclick() {
        el('settleNominal').value = Layout.decimal(item.cents);
        updateSettleHint(state.selected || row);
      }
    })));
  }

  function fillSettle(row) {
    const risk = riskOf(row) || '-';
    setText('settleSubtitle', `${row.orderNo} / ${row.customerName}`);
    setText('settleRemaining', money(row.remainingCents));
    setText('settleOriginal', money(row.totalCents));
    setText('settlePaid', money(row.paidCents));
    setText('settleLimit', row.creditLimitCents > 0 ? money(row.creditLimitCents) : '-');
    setText('settleCustomerOutstanding', row.customerOutstandingCents === null
      ? '-' : money(row.customerOutstandingCents));
    setText('settleCashier', state.cashier || '-');
    setText('settleRiskText', `Pelanggan: ${row.customerName} · Jatuh tempo: ${row.dueDate ? UI.tanggal(row.dueDate) : '-'}`);
    setText('settleStatusText', `Status: ${statusText(row)} · Risiko: ${risk} · Pembayaran: ${row.paymentCount}`);
    setText('settleRiskBadge', risk === '-' ? '-' : risk.toUpperCase());
    el('settleRiskBadge').className = riskCellClass(risk);
    el('settleNominal').value = Layout.decimal(row.remainingCents);
    updateSettleHint(row);
  }

  async function openSettle(row) {
    if (state.role !== 'KASIR') return;
    state.selected = row;
    el('settleModal').classList.remove('hidden');
    el('settleSuccess').classList.add('hidden');
    el('settleSuccess').textContent = '';
    el('btnSaveSettle').disabled = true;
    fillSettle(row);
    renderQuick(row);

    const id = String(row.id);
    try {
      const response = await API.get(`/api/receivables/${encodeURIComponent(id)}`);
      const raw = response.data && response.data.receivable;
      if (!raw || !state.selected || String(state.selected.id) !== id) return;
      const detail = normalize(raw);
      const merged = Object.assign({}, row, detail);
      merged.risk = detail.risk || row.risk;
      merged.status = detail.status || row.status;
      merged.dueDate = detail.dueDate || row.dueDate;
      merged.orderNo = detail.orderNo !== '-' ? detail.orderNo : row.orderNo;
      merged.customerName = detail.customerName !== '-' ? detail.customerName : row.customerName;
      merged.customerCode = detail.customerCode !== '-' ? detail.customerCode : row.customerCode;
      merged.remainingCents = detail.remainingCents || row.remainingCents;
      const reference = el('settleReference').value;
      const note = el('settleNote').value;
      state.selected = merged;
      fillSettle(merged);
      el('settleReference').value = reference;
      el('settleNote').value = note;
      renderQuick(merged);
    } catch (error) {
      // Rincian tambahan gagal dimuat: data dari daftar tetap cukup untuk pelunasan.
    } finally {
      if (state.selected && String(state.selected.id) === id && !state.saving) {
        el('btnSaveSettle').disabled = false;
      }
    }
  }

  function closeSettle() {
    state.selected = null;
    el('settleModal').classList.add('hidden');
    el('settleSuccess').classList.add('hidden');
  }

  function validateSettle(row) {
    const cents = Layout.parseMoneyCents(el('settleNominal').value, false);
    if (cents === null || cents < 1) return 'Nominal pelunasan wajib diisi dan minimal Rp1.';
    if (cents > row.remainingCents) {
      return `Nominal melebihi sisa piutang (${money(row.remainingCents)}).`;
    }
    const method = el('settleMethod').value;
    if (!['TUNAI', 'TRANSFER'].includes(method)) return 'Metode bayar wajib dipilih.';
    if (el('settleReference').value.trim().length > 100) {
      return 'Nomor referensi maksimal 100 karakter.';
    }
    return '';
  }

  function applyUpdatedRow(id, raw) {
    const updated = normalize(raw);
    const index = state.rows.findIndex((row) => String(row.id) === String(id));
    if (index >= 0) state.rows[index] = updated;
    if (state.selected && String(state.selected.id) === String(id)) {
      state.selected = Object.assign({}, state.selected, updated, {
        payments: updated.payments.length ? updated.payments : state.selected.payments
      });
    }
    renderKpis();
    renderTable();
  }

  async function saveSettle() {
    if (state.saving || state.role !== 'KASIR') return;
    const row = state.selected;
    if (!row) return;

    // Tab dibuka saat klik, sebelum awaited request, agar tidak diblokir popup blocker.
    const receiptTab = window.open('', '_blank');
    const invalid = validateSettle(row);
    if (invalid) {
      if (receiptTab) receiptTab.close();
      show(invalid);
      return;
    }

    const cents = Layout.parseMoneyCents(el('settleNominal').value, false);
    const body = {
      nominal: Layout.decimal(cents),
      method: el('settleMethod').value
    };
    const reference = el('settleReference').value.trim();
    const note = el('settleNote').value.trim();
    if (reference) body.reference = reference;
    if (note) body.note = note;

    state.saving = true;
    let paid = false;
    try {
      await UI.busy(el('btnSaveSettle'), async () => {
        const response = await API.post(
          `/api/receivables/${encodeURIComponent(String(row.id))}/pay`, body
        );
        paid = true;
        const payload = response.data || {};
        if (payload.receivable) applyUpdatedRow(row.id, payload.receivable);

        const success = el('settleSuccess');
        success.textContent = `Pelunasan ${money(cents)} tercatat. Sisa piutang: ${money(
          (payload.receivable && Layout.cents(payload.receivable.outstanding)) || 0
        )}. Bukti pembayaran dibuka di tab baru.`;
        success.classList.remove('hidden');

        const paymentId = payload.payment && payload.payment.id;
        if (paymentId !== undefined && paymentId !== null) {
          await API.openPdf(
            `/api/payments/${encodeURIComponent(String(paymentId))}/receipt.pdf`, receiptTab
          );
        } else if (receiptTab) {
          receiptTab.close();
        }
      });
      await loadReceivables(state.page);
      show('Pembayaran tersimpan dan bukti pelunasan dibuka di tab baru.', 'ok');
      UI.toast('Pelunasan berhasil dicatat.', 'ok');
    } catch (error) {
      if (paid) {
        await loadReceivables(state.page);
        show(`Pembayaran tersimpan, tetapi bukti PDF gagal dibuka: ${errorFrom(error, 'Gagal membuat bukti.')}`, 'warn');
      } else {
        if (receiptTab) receiptTab.close();
        show(errorFrom(error, 'Gagal menyimpan pelunasan.'));
      }
    } finally {
      state.saving = false;
      if (state.selected && state.role === 'KASIR') el('btnSaveSettle').disabled = false;
    }
  }

  el('filter').addEventListener('submit', (event) => {
    event.preventDefault();
    state.search = el('search').value.trim();
    state.from = el('from').value;
    state.to = el('to').value;
    state.risk = el('risk').value;
    loadReceivables(1);
  });

  el('btnReset').addEventListener('click', () => {
    ['search', 'from', 'to'].forEach((id) => { el(id).value = ''; });
    el('risk').value = '';
    state.search = '';
    state.from = '';
    state.to = '';
    state.risk = '';
    loadReceivables(1);
  });

  el('risk').addEventListener('change', () => {
    state.risk = el('risk').value;
    renderTable();
  });

  el('prevPage').addEventListener('click', () => {
    if (state.page > 1 && !state.loading) loadReceivables(state.page - 1);
  });

  el('nextPage').addEventListener('click', () => {
    if (state.page < state.totalPages && !state.loading) loadReceivables(state.page + 1);
  });

  el('btnExport').addEventListener('click', () => {
    show('Ekspor XLS masuk backlog v1.0 dan belum tersedia.', 'warn');
  });

  el('settleNominal').addEventListener('input', () => {
    if (state.selected) updateSettleHint(state.selected);
  });
  el('btnCloseSettle').addEventListener('click', closeSettle);
  el('btnCancelSettle').addEventListener('click', closeSettle);
  el('settleModal').addEventListener('click', (event) => {
    if (event.target === el('settleModal')) closeSettle();
  });
  el('btnSaveSettle').addEventListener('click', saveSettle);

  Layout.start(async () => {
    state.role = String((Layout.user && Layout.user.role) || '').toUpperCase();
    state.cashier = String((Layout.user && Layout.user.name) || '');
    await loadReceivables(1);
  });
}());
