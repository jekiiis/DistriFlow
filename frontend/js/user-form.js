'use strict';

/**
 * UI-05 Form Tambah/Edit Pengguna.
 * Tambah: POST /api/users dengan { name, username, password, role }.
 * Edit: PUT /api/users/:id tanpa username, password hanya dikirim bila diisi.
 * Aturan Admin terakhir sepenuhnya divalidasi backend (HTTP 409).
 */
(function initUserForm() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  const ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const MAX_NAME_LENGTH = 100;
  const MIN_PASSWORD_LENGTH = 8;
  const MAX_PASSWORD_BYTES = 72;

  const params = new URLSearchParams(window.location.search);
  const rawId = params.get('id');
  const isEdit = rawId !== null;
  const userId = isEdit && /^\d+$/.test(rawId) && Number(rawId) > 0 ? Number(rawId) : null;

  const form = document.getElementById('user-form');
  const alertBox = document.getElementById('form-alert');
  const submitButton = document.getElementById('save-button');
  const nameInput = document.getElementById('name');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const roleSelect = document.getElementById('role');
  const statusSelect = document.getElementById('status');

  let saving = false;
  let formReady = !isEdit || userId !== null;

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = 'df-alert df-alert--' + (type === 'success' ? 'success' : 'error');
    alertBox.hidden = false;
  }

  function clearAlert() {
    alertBox.hidden = true;
    alertBox.textContent = '';
  }

  function setSaving(loading) {
    saving = loading;
    submitButton.disabled = loading || !formReady;
    submitButton.textContent = loading ? 'Menyimpan…' : 'Simpan';
    [nameInput, usernameInput, passwordInput, roleSelect, statusSelect].forEach((element) => {
      element.disabled = loading || !formReady;
    });
  }

  function configureMode() {
    if (isEdit) {
      ui.setText(document.getElementById('topbar-title'), 'Ubah Pengguna');
      ui.setText(document.getElementById('breadcrumb'), 'Pengaturan Akun / Manajemen Pengguna / Ubah Pengguna');
      ui.setText(document.getElementById('page-title'), 'Ubah Pengguna');
      ui.setText(document.getElementById('page-subtitle'), 'Perbarui nama, peran, status, atau reset password pengguna.');
      ui.setText(document.getElementById('password-label'), 'Reset Password');
      ui.setText(document.getElementById('password-help'), 'Kosongkan saat mengubah jika tidak diganti.');

      usernameInput.readOnly = true;
      usernameInput.setAttribute('aria-readonly', 'true');
      document.getElementById('username-help').classList.add('df-hidden');
      document.getElementById('username-note').classList.remove('df-hidden');
      document.getElementById('status-field').classList.remove('df-hidden');
      document.getElementById('create-status-note').classList.add('df-hidden');
    } else {
      usernameInput.readOnly = false;
      usernameInput.removeAttribute('aria-readonly');
      document.getElementById('username-note').classList.add('df-hidden');
      document.getElementById('status-field').classList.add('df-hidden');
      document.getElementById('create-status-note').classList.remove('df-hidden');
    }
  }

  function applyUser(user) {
    nameInput.value = String((user && user.name) || '');
    usernameInput.value = String((user && user.username) || '');
    roleSelect.value = String((user && user.role) || '');
    statusSelect.value = user && user.is_active === false ? 'false' : 'true';
    // Password sengaja tidak diisi; backend tidak mengirim hash ke frontend.
    passwordInput.value = '';
  }

  function applySessionUser(user) {
    const name = String((user && user.name) || 'Pengguna');
    const role = String((user && user.role) || '-');

    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.buildSidebar(role, 'users');
  }

  async function loadSession() {
    try {
      const data = await api.get('/auth/me');
      applySessionUser(data && data.user ? data.user : {});
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat data sesi.');
    }
  }

  async function loadTargetUser() {
    if (!isEdit || userId === null) {
      return;
    }

    showAlert('Memuat data pengguna…', 'warning');
    try {
      const data = await api.get('/users/' + encodeURIComponent(String(userId)));
      applyUser(data && data.user ? data.user : {});
      clearAlert();
    } catch (error) {
      formReady = false;
      showAlert((error && error.message) || 'Gagal memuat data pengguna.');
    } finally {
      setSaving(false);
    }
  }

  function byteLength(value) {
    return new TextEncoder().encode(String(value)).length;
  }

  function validate(values) {
    if (!values.name.trim()) {
      return 'Field wajib diisi';
    }
    if (values.name.trim().length > MAX_NAME_LENGTH) {
      return 'Nama maksimal 100 karakter';
    }

    if (!isEdit) {
      if (!values.username.trim()) {
        return 'Field wajib diisi';
      }
      if (/\s/.test(values.username.trim())) {
        return 'Username tidak boleh mengandung spasi';
      }
      if (values.password.length < MIN_PASSWORD_LENGTH) {
        return 'Password minimal 8 karakter';
      }
      if (byteLength(values.password) > MAX_PASSWORD_BYTES) {
        return 'Password maksimal 72 byte';
      }
    }

    if (!values.role) {
      return 'Field wajib diisi';
    }
    if (ROLES.indexOf(values.role) === -1) {
      return 'Role tidak valid';
    }

    if (isEdit && values.password) {
      if (values.password.length < MIN_PASSWORD_LENGTH) {
        return 'Password minimal 8 karakter';
      }
      if (byteLength(values.password) > MAX_PASSWORD_BYTES) {
        return 'Password maksimal 72 byte';
      }
    }

    return null;
  }

  function buildBody(values) {
    if (!isEdit) {
      // Backend menetapkan is_active = TRUE saat create; jangan dikirim.
      return {
        name: values.name.trim(),
        username: values.username.trim(),
        password: values.password,
        role: values.role
      };
    }

    const body = {
      name: values.name.trim(),
      role: values.role,
      is_active: values.status === 'true'
    };

    // Username tidak pernah dikirim pada PUT (validator backend menolaknya).
    if (values.password) {
      body.password = values.password;
    }
    return body;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || !formReady) {
      return;
    }

    clearAlert();

    const values = {
      name: nameInput.value,
      username: usernameInput.value,
      password: passwordInput.value,
      role: roleSelect.value,
      status: statusSelect.value
    };

    const validationError = validate(values);
    if (validationError) {
      showAlert(validationError);
      return;
    }

    setSaving(true);
    try {
      if (isEdit) {
        await api.put('/users/' + encodeURIComponent(String(userId)), buildBody(values));
      } else {
        await api.post('/users', buildBody(values));
      }
      window.location.replace('/pages/users.html?saved=1');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal menyimpan data pengguna.');
      setSaving(false);
    }
  });

  ui.setupPasswordToggles(form);
  ui.setupLogout(document.getElementById('logout-button'));
  configureMode();

  if (!formReady) {
    showAlert('ID pengguna tidak valid');
  }

  setSaving(false);
  loadSession();
  loadTargetUser();
}());
