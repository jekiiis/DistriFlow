/**
 * @file    customer-form.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-15 Tambah/Ubah Pelanggan — POST /api/customers atau PUT /api/customers/:id.
 *
 * Status kelayakan kredit dan notifikasi WhatsApp/SMS tidak memiliki field
 * backend, sehingga sengaja tetap dinonaktifkan dan tidak dikirim.
 * Faktur Hold 50%, auto-lock, dan pengingat otomatis tidak diimplementasikan.
 */
(function () {
  'use strict';

  const SEARCH_LIMIT = 100;

  const state = { mode: 'add', id: null };

  function el(id) { return document.getElementById(id); }
  function form() { return el('customerForm'); }
  function show(message, type = 'err') {
    const node = el('customerFormAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clear() {
    const node = el('customerFormAlert');
    node.textContent = '';
    node.className = 'alert err hidden';
  }
  function errorFrom(error, fallback) {
    return (error && error.message) || fallback;
  }
  function setResult(message, isError) {
    const node = el('codeResult');
    node.textContent = message;
    node.className = isError ? 'ui-hint ui-risk ui-risk--warn' : 'ui-hint ui-risk ui-risk--ok';
  }
  function applyMode() {
    const edit = state.mode === 'edit';
    el('formTitle').textContent = edit ? 'Ubah Pelanggan' : 'Tambah Pelanggan Baru';
    el('formSubtitle').textContent = edit
      ? 'Perbarui identitas toko, ketentuan penjualan, dan fasilitas kredit pelanggan.'
      : 'Informasi legalitas dan operasional titik distribusi toko pelanggan.';
    el('btnSimpan').textContent = edit ? 'Ubah Pelanggan' : 'Simpan Pelanggan';
    el('code').disabled = edit;
    el('codeHint').textContent = edit
      ? 'Kode pelanggan merupakan identitas data dan tidak dapat diubah.'
      : 'Kode unik pelanggan — otomatis atau manual.';
    el('active').checked = true;
    el('limit').value = '0';
    el('term').value = '0';
    if (edit) Layout.setTop('Daftar Pelanggan', 'Ubah Pelanggan');
  }
  function applyCustomer(customer) {
    el('code').value = customer.code || '';
    el('name').value = customer.name || '';
    el('phone').value = customer.phone || '';
    el('address').value = customer.address || '';
    const level = String(customer.price_level || 'RETAIL');
    el('level').value = level === 'RETAIL' || level === 'GROSIR' ? level : 'RETAIL';
    el('limit').value = Layout.decimal(Layout.cents(customer.credit_limit));
    el('term').value = customer.payment_term_days === null || customer.payment_term_days === undefined
      ? '0' : String(customer.payment_term_days);
    el('active').checked = customer.is_active !== false;
  }

  async function checkCode() {
    const code = el('code').value.trim();
    if (!code) {
      setResult('Kode pelanggan belum diisi.', true);
      return;
    }
    clear();
    try {
      await UI.busy(el('btnCheckCode'), async () => {
        const query = new URLSearchParams({ search: code, limit: String(SEARCH_LIMIT) });
        const response = await API.get(`/api/customers?${query.toString()}`);
        const customers = (response.data || {}).customers || [];
        const exact = customers.find((customer) => String(customer.code).toUpperCase() === code.toUpperCase());
        setResult(exact
          ? `Kode ${exact.code} sudah terdaftar: ${exact.name}`
          : `Kode ${code} belum terdaftar pada API.`, false);
      });
    } catch (error) {
      if (!(error && error.status === 401)) show(errorFrom(error, 'Gagal mengecek kode pelanggan.'));
      setResult('Pemeriksaan kode gagal.', true);
    }
  }

  function readForm() {
    const values = UI.formData(form());
    return {
      // Kode dinonaktifkan pada mode Ubah, sehingga dibaca langsung dari input.
      code: el('code').value.trim(),
      name: values.name || '',
      phone: values.phone || '',
      address: values.address || '',
      price_level: values.price_level || 'RETAIL',
      credit_limit: values.credit_limit || '0',
      payment_term_days: values.payment_term_days || '0',
      is_active: el('active').checked
    };
  }

  function validate(data) {
    const errors = {};
    if (!data.code) errors.code = 'Kode pelanggan wajib diisi';
    else if (data.code.length > 20) errors.code = 'Kode pelanggan maksimal 20 karakter';
    if (!data.name) errors.name = 'Nama toko wajib diisi';
    if (!data.address) errors.address = 'Alamat toko wajib diisi';

    const phone = data.phone.replace(/[\s-]/g, '');
    if (phone && !/^\d{10,14}$/.test(phone)) errors.phone = 'No. HP/WhatsApp harus 10–14 digit';

    const limitCents = Layout.parseMoneyCents(data.credit_limit, true);
    if (limitCents === null) errors.credit_limit = 'Limit kredit tidak valid';

    if (!/^\d+$/.test(data.payment_term_days) ||
        !Number.isSafeInteger(Number(data.payment_term_days))) {
      errors.payment_term_days = 'Tempo jatuh tempo harus bilangan bulat';
    }

    return {
      errors,
      phone,
      limitCents,
      termDays: Number(data.payment_term_days)
    };
  }

  function buildPayload(data, checked) {
    return {
      code: data.code,
      name: data.name,
      address: data.address,
      phone: checked.phone,
      price_level: data.price_level,
      credit_limit: Layout.decimal(checked.limitCents),
      payment_term_days: checked.termDays,
      is_active: data.is_active
    };
  }

  function handleError(error) {
    if (error && error.status === 401) return; // api.js sudah mengalihkan ke login
    const message = errorFrom(error, 'Permintaan gagal');
    show(message);
    UI.toast(message, 'err');
    const fields = Layout.errorMap(error && error.errors);
    if (error && error.status === 409) fields.code = message;
    if (Object.keys(fields).length) UI.showErrors(form(), fields);
  }

  async function loadCustomer() {
    try {
      const response = await API.get(`/api/customers/${encodeURIComponent(state.id)}`);
      const customer = response.data && response.data.customer;
      if (!customer) throw new Error('Detail pelanggan tidak ditemukan');
      applyCustomer(customer);
    } catch (error) {
      handleError(error);
      el('btnSimpan').disabled = true;
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    clear();
    UI.clearErrors(form());

    const data = readForm();
    const checked = validate(data);
    if (Object.keys(checked.errors).length) {
      UI.showErrors(form(), checked.errors);
      show('Periksa kembali field yang ditandai.', 'err');
      const first = UI.$('#customerForm .invalid');
      if (first) first.focus();
      return;
    }

    const payload = buildPayload(data, checked);
    try {
      const response = await UI.busy(el('btnSimpan'), () => (
        state.mode === 'add'
          ? API.post('/api/customers', payload)
          : API.put(`/api/customers/${encodeURIComponent(state.id)}`, payload)
      ));
      UI.flash(response.message || (state.mode === 'add'
        ? 'Pelanggan berhasil ditambahkan' : 'Pelanggan berhasil diubah'), 'ok');
      window.location.href = 'customers.html';
    } catch (error) {
      handleError(error);
    }
  }

  el('btnCheckCode').addEventListener('click', checkCode);
  form().addEventListener('submit', onSubmit);
  form().addEventListener('input', (event) => {
    if (event.target.name && event.target.classList.contains('invalid')) {
      event.target.classList.remove('invalid');
      const message = event.target.parentElement.querySelector('.field-error');
      if (message) message.remove();
    }
  });

  Layout.start(async () => {
    state.id = UI.param('id');
    state.mode = state.id ? 'edit' : 'add';
    applyMode();
    if (state.mode === 'edit') await loadCustomer();
    else clear();
  });
}());
