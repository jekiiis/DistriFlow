/**
 * @file    user-form.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 26 November 2026
 * UI-05 Form Pengguna — rancangan Figma dengan data dari endpoint nyata.
 *
 * Endpoint yang dipakai: GET /api/auth/me, GET /api/users/:id,
 * POST /api/users, dan PUT /api/users/:id.
 *
 * Catatan backend:
 * - username bersifat read-only pada PUT; field ini sengaja tidak dikirim.
 * - reset password tersedia lewat field opsional `password` pada PUT.
 * - tidak ada endpoint/field untuk mewajibkan ganti password pada login pertama.
 */
(function () {
  'use strict';

  const ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const ROLE_HINTS = {
    ADMIN: 'Admin memiliki akses pengelolaan pengguna dan pengaturan sistem.',
    SALES: 'Sales mencatat Sales Order dan data pelanggan.',
    KASIR: 'Kasir memproses pembayaran dan piutang.',
    GUDANG: 'Petugas Gudang mengelola barang dan mutasi stok fisik.'
  };

  const state = { mode: 'add', userId: null, original: null };

  function utf8Bytes(value) {
    return encodeURIComponent(String(value)).replace(/%[0-9A-F]{2}/gi, 'x').length;
  }

  function showAlert(message, type = 'err') {
    const box = UI.$('#userFormAlert');
    if (!box) return;
    box.textContent = message || '';
    box.className = message ? `alert ${type}` : 'alert err hidden';
  }

  function clearAlert() {
    showAlert('');
  }

  function clearFieldError(input) {
    if (!input || !input.name) return;
    input.classList.remove('invalid');
    const field = input.closest('.uf-field');
    if (!field) return;
    const error = UI.$('.field-error', field);
    if (error) error.remove();
  }

  function applyMode() {
    const edit = state.mode === 'edit';
    const name = UI.$('#name');
    const username = UI.$('#username');
    const password = UI.$('#password');
    const active = UI.$('#isActive');
    const statusLabel = UI.$('#statusLabel');

    UI.$('#formTitle').textContent = edit ? 'Ubah Pengguna' : 'Tambah Pengguna Baru';
    UI.$('#formSubtitle').textContent = edit
      ? 'Perbarui data akun staf, peran, status operasional, dan kata sandi bila diperlukan.'
      : 'Daftarkan akun staf baru untuk akses operasional sistem DistriFlow Bandung.';
    UI.$('#btnSimpan').textContent = edit ? 'Simpan Perubahan' : 'Simpan Pengguna';

    username.readOnly = edit;
    if (edit) username.setAttribute('aria-readonly', 'true');
    else username.removeAttribute('aria-readonly');
    UI.$('#usernameHint').textContent = edit
      ? 'Username tidak dapat diubah setelah dibuat.'
      : 'Digunakan untuk login. Huruf kecil dan angka, tanpa spasi.';

    if (edit) password.setAttribute('aria-required', 'false');
    else password.setAttribute('aria-required', 'true');
    UI.$('#passwordHint').textContent = edit
      ? 'Kosongkan jika tidak ingin mengganti kata sandi. Minimal 8 karakter.'
      : 'Minimal 8 karakter. Kosongkan saat mengubah jika tidak diganti.';

    active.checked = true;
    active.disabled = !edit;
    statusLabel.textContent = 'Aktif';
    UI.$('#statusHint').textContent = edit
      ? 'Nonaktifkan akun untuk mencabut akses masuk pengguna.'
      : 'Pengguna baru selalu dibuat aktif.';

    UI.$('#securityNote').textContent = edit
      ? 'Perubahan peran, status, dan kata sandi akan tercatat pada log operasional DistriFlow Bandung.'
      : 'Akun yang dibuat akan langsung aktif. Kata sandi dapat diganti sendiri melalui menu Ganti Password setelah login.';
    UI.$('#securityLimit').textContent =
      'Penegakan wajib ganti kata sandi pada login pertama belum didukung backend, sehingga tidak diterapkan pada form ini.';

    if (name) name.focus();
  }

  function updateTopbar() {
    const title = UI.$('#topbar .top-title');
    if (title) title.textContent = 'Manajemen Pengguna';

    const breadcrumb = UI.$('#topbar .users-breadcrumb');
    if (!breadcrumb) return;
    const spans = UI.$$('span', breadcrumb);
    if (spans[0]) spans[0].textContent = 'Pengguna';
    if (spans[1]) spans[1].textContent = '/';
    const current = UI.$('strong', breadcrumb);
    if (current) current.textContent = state.mode === 'edit' ? 'Ubah Pengguna' : 'Tambah Pengguna';
  }

  function applyUser(user) {
    UI.$('#name').value = user.name || '';
    UI.$('#username').value = user.username || '';
    UI.$('#role').value = ROLES.indexOf(user.role) >= 0 ? user.role : '';
    UI.$('#password').value = '';

    const active = Boolean(user.is_active);
    const toggle = UI.$('#isActive');
    toggle.disabled = false;
    toggle.checked = active;
    UI.$('#statusLabel').textContent = active ? 'Aktif' : 'Nonaktif';
    UI.$('#statusHint').textContent = active
      ? 'Nonaktifkan akun untuk mencabut akses masuk pengguna.'
      : 'Aktifkan kembali akun untuk memulihkan akses masuk pengguna.';

    state.original = {
      id: user.id,
      name: user.name,
      username: user.username,
      role: user.role,
      is_active: active
    };
  }

  function readForm() {
    const values = UI.formData(UI.$('#form'));
    return {
      name: values.name || '',
      username: values.username || '',
      password: values.password || '',
      role: values.role || '',
      is_active: UI.$('#isActive').checked
    };
  }

  function validate(data) {
    const errors = {};

    if (!data.name) errors.name = 'Nama wajib diisi';
    else if (data.name.length > 100) errors.name = 'Nama maksimal 100 karakter';

    if (state.mode === 'add') {
      if (!data.username) errors.username = 'Username wajib diisi';
      else if (/\s/.test(data.username)) errors.username = 'Username tidak boleh mengandung spasi';
      else if (data.username.length > 50) errors.username = 'Username maksimal 50 karakter';
    }

    if (state.mode === 'add' || data.password) {
      if (!data.password) errors.password = 'Password wajib diisi';
      else if (data.password.length < 8) errors.password = 'Password minimal 8 karakter';
      else if (utf8Bytes(data.password) > 72) errors.password = 'Password maksimal 72 byte';
    }

    if (!data.role) errors.role = 'Peran wajib diisi';
    else if (ROLES.indexOf(data.role) < 0) errors.role = 'Role tidak valid';

    return errors;
  }

  function buildPayload(data) {
    if (state.mode === 'add') {
      return {
        name: data.name,
        username: data.username,
        password: data.password,
        role: data.role
      };
    }

    const payload = {
      name: data.name,
      role: data.role,
      is_active: data.is_active
    };
    if (data.password) payload.password = data.password;
    return payload;
  }

  function backendErrors(errors) {
    if (Array.isArray(errors)) {
      const mapped = {};
      errors.forEach((item) => {
        if (item && item.field && item.message) mapped[item.field] = item.message;
      });
      return mapped;
    }
    return errors && typeof errors === 'object' ? errors : {};
  }

  function handleError(err) {
    if (err && err.status === 401) return; // api.js sudah mengalihkan ke halaman login
    const message = (err && err.message) || 'Permintaan gagal';
    showAlert(message, 'err');
    UI.toast(message, 'err');

    const fields = backendErrors(err && err.errors);
    if (Object.keys(fields).length) UI.showErrors(UI.$('#form'), fields);
  }

  async function loadUser() {
    try {
      const response = await API.get(`/api/users/${encodeURIComponent(state.userId)}`);
      const user = response && response.data && response.data.user;
      if (!user) throw new Error('Detail pengguna tidak ditemukan');
      applyUser(user);
      updateTopbar();
    } catch (err) {
      handleError(err);
      UI.$('#btnSimpan').disabled = true;
    }
  }

  async function onSubmit(event) {
    event.preventDefault();
    clearAlert();
    UI.clearErrors(UI.$('#form'));

    const data = readForm();
    const errors = validate(data);
    if (Object.keys(errors).length) {
      UI.showErrors(UI.$('#form'), errors);
      showAlert('Periksa kembali field yang ditandai.', 'err');
      const first = UI.$('#form .invalid');
      if (first) first.focus();
      return;
    }

    const payload = buildPayload(data);
    const button = UI.$('#btnSimpan');

    try {
      const response = await UI.busy(button, () => {
        if (state.mode === 'add') return API.post('/api/users', payload);
        return API.put(`/api/users/${encodeURIComponent(state.userId)}`, payload);
      });
      const fallback = state.mode === 'add'
        ? 'Pengguna berhasil ditambahkan'
        : 'Pengguna berhasil diperbarui';
      UI.flash((response && response.message) || fallback, 'ok');
      window.location.href = 'users.html';
    } catch (err) {
      handleError(err);
    }
  }

  function bindEvents() {
    UI.$('#form').addEventListener('submit', onSubmit);

    UI.$('#btnPwToggle').addEventListener('click', () => {
      const password = UI.$('#password');
      const button = UI.$('#btnPwToggle');
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      button.textContent = show ? 'Sembunyikan' : 'Tampilkan';
      button.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    });

    UI.$('#isActive').addEventListener('change', (event) => {
      UI.$('#statusLabel').textContent = event.target.checked ? 'Aktif' : 'Nonaktif';
    });

    UI.$('#role').addEventListener('change', (event) => {
      UI.$('#roleHint').textContent = ROLE_HINTS[event.target.value] ||
        'Menentukan otorisasi transaksi dan visibilitas data cabang.';
    });

    UI.$('#form').addEventListener('input', (event) => {
      clearFieldError(event.target);
      if (event.target.id === 'role') {
        UI.$('#roleHint').textContent = ROLE_HINTS[event.target.value] ||
          'Menentukan otorisasi transaksi dan visibilitas data cabang.';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const id = UI.param('id');
    state.mode = id ? 'edit' : 'add';
    state.userId = id;
    applyMode();
    bindEvents();

    window.UsersShell.init().then(() => {
      updateTopbar();
      if (state.mode === 'edit') return loadUser();
      return null;
    }).catch((err) => {
      if (err && err.status === 401) return;
      if (err && err.message === 'forbidden') return;
      showAlert((err && err.message) || 'Halaman tidak dapat dimuat', 'err');
    });
  });
}());
