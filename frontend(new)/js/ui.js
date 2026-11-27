/**
 * @file    ui.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 10 November 2026
 * Komponen dan fungsi bantu antarmuka. Data dari pengguna selalu ditulis dengan
   textContent (bukan innerHTML) untuk mencegah XSS (DPPL 2.2). */
const UI = {
  $(sel, root = document) { return root.querySelector(sel); },
  $$(sel, root = document) { return [...root.querySelectorAll(sel)]; },

  /** Membuat elemen: UI.el('td', { class: 'num', text: '10' }, [anak...]) */
  el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => {
      if (v === undefined || v === null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'class') e.className = v;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(e.dataset, v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    [].concat(children).forEach((c) => { if (c !== null && c !== undefined) e.append(c instanceof Node ? c : String(c)); });
    return e;
  },

  /** 1250000 → "Rp1.250.000" (SKPL 4.1) */
  rupiah(n) {
    const v = Math.round(Number(n) || 0);
    return `${v < 0 ? '-' : ''}Rp${Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
  },

  /** "2026-11-10" → "10/11/2026" */
  tanggal(s) {
    if (!s) return '-';
    const [y, m, d] = String(s).slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
  },

  today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },

  param(name) { return new URLSearchParams(window.location.search).get(name); },

  /** Notifikasi: hijau berhasil, merah gagal, oranye peringatan. */
  toast(message, type = 'ok') {
    let box = UI.$('.toast-box');
    if (!box) { box = UI.el('div', { class: 'toast-box' }); document.body.append(box); }
    const t = UI.el('div', { class: `toast ${type}`, text: message, role: 'status' });
    box.append(t);
    setTimeout(() => t.remove(), type === 'ok' ? 3500 : 6000);
  },

  /** Notifikasi yang dibawa ke halaman berikutnya (setelah redirect). */
  flash(message, type = 'ok') {
    try { sessionStorage.setItem('flash', JSON.stringify({ message, type })); } catch (e) { /* abaikan */ }
  },
  showFlash() {
    try {
      const f = JSON.parse(sessionStorage.getItem('flash') || 'null');
      sessionStorage.removeItem('flash');
      if (f) UI.toast(f.message, f.type);
    } catch (e) { /* abaikan */ }
  },

  /** Aksi berisiko meminta konfirmasi (SKPL 4.1). */
  confirm(message) { return window.confirm(message); },

  badge(text, cls) { return UI.el('span', { class: `badge ${cls || text}`, text }); },

  statusLabel(s) { return { DRAFT: 'Draft', LUNAS: 'Lunas', PIUTANG: 'Piutang', BATAL: 'Batal' }[s] || s; },
  statusBadge(s) { return UI.badge(UI.statusLabel(s), s); },
  roleLabel(r) { return { ADMIN: 'Admin', SALES: 'Sales', KASIR: 'Kasir', GUDANG: 'Petugas Gudang' }[r] || r; },

  /** Mengisi tbody; rowFn(item) mengembalikan <tr>. */
  fillTable(tbody, items, rowFn, emptyText = 'Belum ada data', cols = 1) {
    tbody.replaceChildren();
    if (!items.length) {
      tbody.append(UI.el('tr', {}, UI.el('td', { class: 'empty', colspan: String(cols), text: emptyText })));
      return;
    }
    items.forEach((it) => tbody.append(rowFn(it)));
  },

  td(text, cls) { return UI.el('td', { class: cls, text: text === undefined || text === null ? '-' : String(text) }); },

  /** Menandai field yang salah dari respons { errors: { field: pesan } } */
  showErrors(form, errors = {}) {
    UI.clearErrors(form);
    Object.entries(errors).forEach(([name, msg]) => {
      const input = form.querySelector(`[name="${name}"]`);
      if (!input) return;
      input.classList.add('invalid');
      const wrap = input.closest('.field') || input.parentElement;
      wrap.append(UI.el('div', { class: 'field-error', text: msg }));
    });
  },
  clearErrors(form) {
    UI.$$('.invalid', form).forEach((e) => e.classList.remove('invalid'));
    UI.$$('.field-error', form).forEach((e) => e.remove());
  },

  /** Isi form → objek */
  formData(form) {
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = typeof v === 'string' ? v.trim() : v; });
    return data;
  },

  /** Menjalankan aksi async dengan tombol dinonaktifkan selama proses (mencegah klik ganda). */
  async busy(button, fn) {
    if (button) button.disabled = true;
    try { return await fn(); } finally { if (button) button.disabled = false; }
  }
};
