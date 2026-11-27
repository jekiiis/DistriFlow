/**
 * @file    product-form.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 27 November 2026
 * UI-12 Tambah/Ubah Barang — POST /api/products atau PUT /api/products/:id.
 *
 * Kategori, stok awal, dan status tidak memiliki field pada payload API:
 * kategori dan stok awal hanya rujukan rancangan, status diubah lewat
 * PATCH /api/products/:id pada halaman daftar barang.
 */
(function () {
  'use strict';

  const state = { mode: 'add', id: null };

  function el(id) { return document.getElementById(id); }
  function form() { return el('productForm'); }
  function show(message, type = 'err') {
    const node = el('productFormAlert');
    node.textContent = message;
    node.className = `alert ${type}`;
  }
  function clear() {
    const node = el('productFormAlert');
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
    el('formTitle').textContent = edit ? 'Ubah Barang' : 'Tambah Barang Baru';
    el('formSubtitle').textContent = edit
      ? 'Perbarui satuan, harga jual, dan batas stok barang terpilih.'
      : 'Daftarkan kode item, satuan distribusi, dan penetapan harga jual resmi.';
    el('btnSimpan').textContent = edit ? 'Ubah Barang' : 'Simpan Barang';
    el('code').disabled = edit;
    el('codeHint').textContent = edit
      ? 'Kode barang merupakan identitas data dan tidak dapat diubah.'
      : 'Kode SKU unik untuk barcode dan inventaris gudang. (Maks. 20 Karakter)';
    el('active').checked = true;
    if (edit) Layout.setTop('Data Barang', 'Ubah Barang');
  }
  function applyProduct(product) {
    el('code').value = product.code || '';
    el('name').value = product.name || '';
    el('unit').value = product.unit || '';
    el('priceRetail').value = Layout.decimal(Layout.cents(product.price_retail));
    el('priceWholesale').value = Layout.decimal(Layout.cents(product.price_wholesale));
    el('minStock').value = product.min_stock === null || product.min_stock === undefined
      ? '' : String(product.min_stock);
    el('active').checked = product.is_active !== false;
  }

  async function checkCode() {
    const code = el('code').value.trim();
    if (!code) {
      setResult('Kode barang belum diisi.', true);
      return;
    }
    clear();
    const button = el('btnCheckCode');
    try {
      await UI.busy(button, async () => {
        const response = await API.get(`/api/products/by-code/${encodeURIComponent(code)}`);
        const product = response.data || {};
        setResult(`Kode ${product.code || code} sudah terdaftar: ${product.name || '-'}`, false);
      });
    } catch (error) {
      if (error && error.status === 404) {
        setResult(`Kode ${code} belum terdaftar pada API.`, false);
      } else {
        if (!(error && error.status === 401)) show(errorFrom(error, 'Gagal mengecek kode barang.'));
        setResult('Pemeriksaan kode gagal.', true);
      }
    }
  }

  function readForm() {
    const values = UI.formData(form());
    return {
      // Kode dinonaktifkan pada mode Ubah, sehingga dibaca langsung dari input.
      code: el('code').value.trim(),
      name: values.name || '',
      unit: values.unit || '',
      price_retail: values.price_retail || '',
      price_wholesale: values.price_wholesale || '',
      min_stock: values.min_stock || ''
    };
  }

  function validate(data) {
    const errors = {};
    if (!data.code) errors.code = 'Kode barang wajib diisi';
    else if (data.code.length > 20) errors.code = 'Kode barang maksimal 20 karakter';
    if (!data.name) errors.name = 'Nama barang wajib diisi';
    if (!data.unit) errors.unit = 'Satuan wajib diisi';

    const retail = Layout.parseMoneyCents(data.price_retail);
    if (retail === null) errors.price_retail = 'Harga retail tidak valid';
    else if (retail <= 0) errors.price_retail = 'Harga retail harus lebih dari 0';

    const wholesale = Layout.parseMoneyCents(data.price_wholesale);
    if (wholesale === null) errors.price_wholesale = 'Harga grosir tidak valid';
    else if (wholesale <= 0) errors.price_wholesale = 'Harga grosir harus lebih dari 0';

    if (!/^\d+$/.test(data.min_stock)) {
      errors.min_stock = 'Stok minimum harus bilangan bulat';
    } else if (!Number.isSafeInteger(Number(data.min_stock)) || Number(data.min_stock) < 0) {
      errors.min_stock = 'Stok minimum harus bilangan bulat dan tidak negatif';
    }

    return {
      errors,
      retail,
      wholesale,
      minStock: Number(data.min_stock)
    };
  }

  function buildPayload(data, checked) {
    return {
      code: data.code,
      name: data.name,
      unit: data.unit,
      price_retail: Layout.decimal(checked.retail),
      price_wholesale: Layout.decimal(checked.wholesale),
      min_stock: checked.minStock
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

  async function loadProduct() {
    try {
      const response = await API.get(`/api/products/${encodeURIComponent(state.id)}`);
      const product = response.data && response.data.product;
      if (!product) throw new Error('Detail barang tidak ditemukan');
      applyProduct(product);
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
      const first = UI.$('#productForm .invalid');
      if (first) first.focus();
      return;
    }

    const payload = buildPayload(data, checked);
    try {
      const response = await UI.busy(el('btnSimpan'), () => (
        state.mode === 'add'
          ? API.post('/api/products', payload)
          : API.put(`/api/products/${encodeURIComponent(state.id)}`, payload)
      ));
      UI.flash(response.message || (state.mode === 'add'
        ? 'Barang berhasil ditambahkan' : 'Barang berhasil diubah'), 'ok');
      window.location.href = 'products.html';
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
    if (state.mode === 'edit') await loadProduct();
    else clear();
  });
}());
