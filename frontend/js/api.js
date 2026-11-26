'use strict';

/**
 * DistriFlow - Sprint 0
 * Wrapper fetch untuk REST API JSON. Belum ada endpoint use case yang dipanggil
 * pada Sprint 0; helper ini disiapkan untuk Sprint 1 dan seterusnya.
 */
(function exposeApi() {
  const API_BASE = '/api';

  function buildError(response, payload) {
    const message = payload && payload.message
      ? payload.message
      : 'Permintaan gagal dengan status ' + response.status;
    const error = new Error(message);
    error.status = response.status;
    error.errors = payload && payload.errors ? payload.errors : null;
    error.payload = payload;
    return error;
  }

  async function request(path, options = {}) {
    const config = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {})
    };

    if (options.body !== undefined) {
      config.body = JSON.stringify(options.body);
    }

    let response;
    try {
      response = await fetch(API_BASE + path, config);
    } catch (networkError) {
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (parseError) {
      payload = null;
    }

    if (response.status === 401) {
      // 401 pada /auth/login adalah kredensial salah/lockout: pesannya harus
      // tetap tampil di halaman login, bukan memicu redirect.
      const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
      const onLoginPage = pathname.indexOf('login.html') !== -1;
      if (!onLoginPage && typeof window !== 'undefined' && window.DistriFlowUI && window.DistriFlowUI.onUnauthorized) {
        window.DistriFlowUI.onUnauthorized();
      }
      throw buildError(response, payload);
    }

    if (!response.ok) {
      throw buildError(response, payload);
    }

    return payload && payload.success ? payload.data : payload;
  }

  /**
   * Helper untuk respons biner (invoice PDF). Beda dari request(): success
   * TIDAK di-parse sebagai JSON; blob dikembalikan apa adanya.
   */
  async function requestBlob(path, options = {}) {
    const config = {
      method: options.method || 'GET',
      credentials: 'same-origin',
      headers: Object.assign({ Accept: 'application/pdf' }, options.headers || {})
    };

    let response;
    try {
      response = await fetch(API_BASE + path, config);
    } catch (networkError) {
      throw new Error('Tidak dapat terhubung ke server. Periksa koneksi Anda.');
    }

    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch (parseError) {
        payload = null;
      }

      if (response.status === 401) {
        const pathname = typeof window !== 'undefined' ? window.location.pathname : '';
        const onLoginPage = pathname.indexOf('login.html') !== -1;
        if (!onLoginPage && typeof window !== 'undefined' && window.DistriFlowUI && window.DistriFlowUI.onUnauthorized) {
          window.DistriFlowUI.onUnauthorized();
        }
      }

      throw buildError(response, payload);
    }

    return response.blob();
  }

  function buildInvoicePath(id, format) {
    const params = new URLSearchParams();
    params.set('format', format || 'a4');
    return '/orders/' + encodeURIComponent(String(id)) + '/invoice.pdf?' + params.toString();
  }

  /**
   * Invoice dibuka sebagai navigasi tab, bukan fetch/XHR. Chrome headless
   * mengalihkan respons application/pdf dari fetch menjadi 204 kosong melalui
   * PDF viewer bawaan, sehingga blob tidak dapat dipakai untuk cetak. Navigasi
   * memakai session cookie yang sama dan tetap melalui role guard.
   */
  function openInvoice(id, format) {
    if (typeof window === 'undefined' || typeof window.open !== 'function') {
      throw new Error('Browser tidak dapat membuka invoice.');
    }
    const url = API_BASE + buildInvoicePath(id, format);
    const tab = window.open(url, '_blank');
    if (!tab) {
      throw new Error('Popup diblokir. Izinkan popup untuk membuka invoice.');
    }
    try {
      if (tab.opener) {
        tab.opener = null;
      }
    } catch {}
    return url;
  }

  const api = {
    get: (path, options) => request(path, Object.assign({}, options, { method: 'GET' })),
    post: (path, body, options) => request(path, Object.assign({}, options, { method: 'POST', body })),
    put: (path, body, options) => request(path, Object.assign({}, options, { method: 'PUT', body })),
    patch: (path, body, options) => request(path, Object.assign({}, options, { method: 'PATCH', body })),
    del: (path, options) => request(path, Object.assign({}, options, { method: 'DELETE' })),
    getBlob: (path, options) => requestBlob(path, options),
    openInvoice
  };

  if (typeof window !== 'undefined') {
    window.DistriFlowAPI = api;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
}());
