'use strict';

/**
 * UI-03 Ganti Password — memanggil PUT /api/auth/password.
 * Sesi tidak dihancurkan setelah berhasil; pengguna dapat kembali ke dashboard.
 */
(function initChangePassword() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  const form = document.getElementById('password-form');
  const alertBox = document.getElementById('password-alert');
  const submitButton = document.getElementById('password-submit');
  const oldInput = document.getElementById('oldPassword');
  const newInput = document.getElementById('newPassword');
  const confirmInput = document.getElementById('confirmPassword');

  ui.setupPasswordToggles(document.querySelector('.df-form-card'));
  ui.setupLogout(document.getElementById('logout-button'));

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = 'df-alert df-alert--' + (type === 'success' ? 'success' : 'error');
    alertBox.hidden = false;
  }

  function clearAlert() {
    alertBox.hidden = true;
    alertBox.textContent = '';
  }

  function setLoading(loading) {
    submitButton.disabled = loading;
    submitButton.textContent = loading ? 'Menyimpan…' : 'Simpan';
  }

  function applyUser(user) {
    const name = user.name || 'Pengguna';
    const role = user.role || '-';

    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.buildSidebar(role, 'change-password');
  }

  async function load() {
    try {
      const data = await api.get('/auth/me');
      applyUser(data && data.user ? data.user : {});
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat data sesi.');
    }
  }

  function validateInput(oldPassword, newPassword, confirmPassword) {
    if (!oldPassword || !newPassword || !confirmPassword) {
      return 'Field wajib diisi';
    }
    if (String(newPassword).length < 8) {
      return 'Password minimal 8 karakter';
    }
    if (newPassword !== confirmPassword) {
      return 'Konfirmasi password tidak sama';
    }
    if (new TextEncoder().encode(String(newPassword)).length > 72) {
      return 'Password maksimal 72 byte';
    }
    return null;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) {
      return;
    }

    clearAlert();

    const oldPassword = oldInput.value;
    const newPassword = newInput.value;
    const confirmPassword = confirmInput.value;
    const validationError = validateInput(oldPassword, newPassword, confirmPassword);

    if (validationError) {
      showAlert(validationError);
      return;
    }

    setLoading(true);
    try {
      await api.put('/auth/password', { oldPassword, newPassword, confirmPassword });
      form.reset();
      showAlert('Password berhasil diubah', 'success');
    } catch (error) {
      showAlert((error && error.message) || 'Gagal mengubah password. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  });

  load();
}());
