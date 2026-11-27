/**
 * @file    reports.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-18 Laporan Penjualan — data resmi dari GET /api/reports/sales dan
 * ekspor PDF dari GET /api/reports/sales.pdf.
 */
(function () {
  'use strict';

  const COLUMNS = 7;
  const PAGE_SIZE = 10;
  const MAX_MONTHS = 12;

  const state = {
    items: [],
    summary: {},
    period: { from: '', to: '' },
    page: 1,
    search: '',
    loading: false,
    exporting: false
  };

  function el(id) { return document.getElementById(id); }
  function setText(id, value) {
    const node = el(id);
    if (node) node.textContent = value === null || value === undefined ? '-' : String(value);
  }
  function money(cents) { return Layout.money(cents); }
  function show(message, type = 'err') {
    const node = el('reportAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clearAlert() {
    const node = el('reportAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }
  function emptyRow(message) {
    return UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(COLUMNS), text: message }));
  }
  function defaultDates() {
    const today = UI.today();
    return { from: `${today.slice(0, 7)}-01`, to: today };
  }
  function validRange(from, to) {
    if (!from || !to) return 'Tanggal awal dan tanggal akhir wajib diisi.';
    if (from > to) return 'Tanggal awal tidak boleh setelah tanggal akhir.';
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T00:00:00`);
    const months = (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    if (months > MAX_MONTHS) return 'Periode maksimal penarikan data adalah 12 bulan.';
    return '';
  }

  function normalizeProduct(raw) {
    const source = raw || {};
    return {
      code: source.code || '-',
      name: source.name || '-',
      unit: source.unit || '-',
      qty: Number(source.qty) || 0,
      salesCents: Layout.cents(source.sales),
      contributionPercent: source.contributionPercent
    };
  }

  function normalizeSummary(raw) {
    const source = raw || {};
    return {
      omzetCents: Layout.cents(source.omzet),
      totalOrders: Number(source.totalOrders) || 0,
      totalProductsSold: Number(source.totalProductsSold) || 0,
      cashTotalCents: Layout.cents(source.cashTotal),
      creditTotalCents: Layout.cents(source.creditTotal),
      receivablesTotalCents: Layout.cents(source.receivablesTotal),
      topProduct: source.topProduct || null
    };
  }

  function filteredItems() {
    const term = state.search.toLowerCase();
    if (!term) return state.items;
    return state.items.filter((item) => [item.code, item.name].some(
      (value) => String(value || '').toLowerCase().includes(term)
    ));
  }

  function contributionText(item) {
    let percent = item.contributionPercent;
    if (percent === null || percent === undefined || percent === '') {
      percent = state.summary.omzetCents > 0
        ? (item.salesCents / state.summary.omzetCents) * 100 : 0;
    }
    const value = Number(percent);
    if (!Number.isFinite(value)) return '-';
    return `${value.toFixed(1).replace('.', ',')}%`;
  }

  function averagePriceCents(item) {
    return item.qty > 0 ? Math.round(item.salesCents / item.qty) : 0;
  }

  function renderKpis() {
    const summary = state.summary;
    setText('kpiOmzet', money(summary.omzetCents));
    setText('kpiOmzetFoot', `${summary.totalOrders} order · tunai ${money(summary.cashTotalCents)}`);
    setText('kpiQty', (summary.totalProductsSold || 0).toLocaleString('id-ID'));
    setText('kpiQtyFoot', `Kredit ${money(summary.creditTotalCents)} · piutang ${money(summary.receivablesTotalCents)}`);

    const top = summary.topProduct;
    if (!top) {
      setText('kpiTop', '-');
      setText('kpiTopFoot', 'Tidak ada penjualan pada periode ini');
      return;
    }
    setText('kpiTop', `${top.code || '-'} · ${top.name || '-'}`);
    setText('kpiTopFoot', `${Number(top.qty) || 0} unit · ${money(Layout.cents(top.sales))}`);
  }

  function renderTotalRow() {
    el('reportTotal').replaceChildren(
      UI.el('td', { text: 'TOTAL PERIODE', colspan: '4' }),
      UI.td((state.summary.totalProductsSold || 0).toLocaleString('id-ID'), 'num'),
      UI.td(money(state.summary.omzetCents), 'num'),
      UI.td('100,0%', 'num')
    );
  }

  function renderTable() {
    const list = filteredItems();
    const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > totalPages) state.page = totalPages;
    const start = (state.page - 1) * PAGE_SIZE;
    const visible = list.slice(start, start + PAGE_SIZE);

    if (visible.length === 0) {
      el('reportBody').replaceChildren(emptyRow(
        state.items.length ? 'Tidak ada produk yang cocok.'
          : 'Tidak ada penjualan pada periode terpilih.'
      ));
    } else {
      el('reportBody').replaceChildren(...visible.map((item) => UI.el('tr', {}, [
        UI.td(item.code),
        UI.el('td', {}, UI.el('div', { text: item.name })),
        UI.td(item.unit),
        UI.td(money(averagePriceCents(item)), 'num'),
        UI.td(item.qty.toLocaleString('id-ID'), 'num'),
        UI.td(money(item.salesCents), 'num'),
        UI.td(contributionText(item), 'num')
      ])));
    }
    renderTotalRow();

    const from = state.period.from || el('from').value;
    const to = state.period.to || el('to').value;
    setText('reportInfo', `Periode: ${UI.tanggal(from)} – ${UI.tanggal(to)} · ${state.items.length} produk dari endpoint laporan`);
    setText('paginationInfo', `Menampilkan ${visible.length} dari ${list.length} produk${state.search ? ' (pencarian)' : ''}`);
    setText('pageLabel', `${state.page} / ${totalPages}`);
    el('prevPage').disabled = state.loading || state.page <= 1;
    el('nextPage').disabled = state.loading || state.page >= totalPages;
  }

  async function loadReport() {
    const from = el('from').value;
    const to = el('to').value;
    const invalid = validRange(from, to);
    if (invalid) { show(invalid); return; }
    if (state.loading) return;

    state.loading = true;
    clearAlert();
    show('Menyusun laporan dari endpoint backend…', 'warn');
    try {
      const query = new URLSearchParams({ date_from: from, date_to: to });
      const response = await API.get(`/api/reports/sales?${query.toString()}`);
      const payload = response.data || {};
      const products = Array.isArray(payload.products) ? payload.products : [];

      state.summary = normalizeSummary(payload.summary);
      state.period = {
        from: (payload.period && payload.period.from) || from,
        to: (payload.period && payload.period.to) || to
      };
      state.items = products.map(normalizeProduct);
      state.page = 1;
      renderKpis();
      renderTable();
      if (el('reportAlert').textContent.includes('Menyusun')) clearAlert();
    } catch (error) {
      state.items = [];
      state.summary = normalizeSummary(null);
      el('reportBody').replaceChildren(emptyRow('Gagal menyusun laporan.'));
      setText('reportInfo', 'Gagal menyusun laporan.');
      show(errorFrom(error, 'Gagal menyusun laporan.'));
    } finally {
      state.loading = false;
      renderTable();
    }
  }

  async function exportPdf() {
    if (state.exporting) return;
    const from = el('from').value;
    const to = el('to').value;
    const invalid = validRange(from, to);
    if (invalid) { show(invalid); return; }

    // Tab dibuka saat klik sebelum request, agar tidak diblokir popup blocker.
    const pdfTab = window.open('', '_blank');
    state.exporting = true;
    try {
      await UI.busy(el('btnPdf'), async () => {
        const query = new URLSearchParams({ date_from: from, date_to: to });
        await API.openPdf(`/api/reports/sales.pdf?${query.toString()}`, pdfTab);
      });
      UI.toast('PDF laporan dibuka di tab baru.', 'ok');
    } catch (error) {
      show(errorFrom(error, 'Gagal membuat PDF laporan.'));
    } finally {
      state.exporting = false;
    }
  }

  el('filter').addEventListener('submit', (event) => {
    event.preventDefault();
    loadReport();
  });

  el('search').addEventListener('input', () => {
    state.search = el('search').value.trim();
    state.page = 1;
    renderTable();
  });

  el('prevPage').addEventListener('click', () => {
    if (state.page > 1 && !state.loading) {
      state.page -= 1;
      renderTable();
    }
  });

  el('nextPage').addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(filteredItems().length / PAGE_SIZE));
    if (state.page < totalPages && !state.loading) {
      state.page += 1;
      renderTable();
    }
  });

  el('btnPdf').addEventListener('click', exportPdf);
  el('btnXlsx').addEventListener('click', () => {
    show('Ekspor XLSX masuk backlog v1.0 dan belum tersedia.', 'warn');
  });

  Layout.start(async () => {
    const dates = defaultDates();
    el('from').value = dates.from;
    el('to').value = dates.to;
    await loadReport();
  });
}());
