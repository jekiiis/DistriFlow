/**
 * @file    api.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 10 November 2026
 * Pembungkus fetch untuk REST API DistriFlow (format { success, data, message, errors }).
 */
const API = {
  async request(method, url, body) {
    const opt = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(url, opt);
    } catch (e) {
      throw Object.assign(new Error('Tidak dapat terhubung ke server'), { status: 0 });
    }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && !url.endsWith('/auth/login')) {
      // FR-02 / UC-01 4b: sesi habis → kembali ke login dengan pesan
      window.location.href = '/pages/login.html?expired=1';
      throw Object.assign(new Error(json.message || 'Sesi berakhir'), { status: 401 });
    }
    if (!res.ok || json.success === false) {
      throw Object.assign(new Error(json.message || 'Permintaan gagal'), {
        status: res.status, errors: json.errors || {}, needConfirm: Boolean(json.needConfirm)
      });
    }
    return json;
  },
  get(url) { return this.request('GET', url); },
  post(url, body = {}) { return this.request('POST', url, body); },
  put(url, body = {}) { return this.request('PUT', url, body); },
  patch(url, body = {}) { return this.request('PATCH', url, body); },

  /**
   * Membuka PDF di tab baru. Tab dibuka lebih dulu (saat klik) agar tidak diblokir
   * popup blocker; jika server menolak, tab ditutup dan pesan kesalahan dilempar.
   * preopened: tab yang sudah dibuka saat klik (dipakai bila PDF dibuat setelah request lain).
   */
  async openPdf(url, preopened) {
    const win = preopened || window.open('', '_blank');
    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.message || 'Gagal membuat PDF');
      }
      const link = URL.createObjectURL(await res.blob());
      if (win) win.location.href = link; else window.location.href = link;
    } catch (e) {
      if (win) win.close();
      throw e;
    }
  }
};
