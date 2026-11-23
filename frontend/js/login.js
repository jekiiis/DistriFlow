'use strict';

/**
 * UI-01 Login — memanggil POST /api/auth/login.
 * Session hanya disimpan backend dalam cookie HttpOnly; tidak ada token di storage.
 */
(function initLogin() {
  const form = document.getElementById('login-form');
  if (!form) {
    return;
  }

  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const submitButton = document.getElementById('login-submit');
  const alertBox = document.getElementById('login-alert');

  ui.setupPasswordToggles(form);

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
    submitButton.textContent = loading ? 'Memproses…' : 'Login →';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) {
      return;
    }

    clearAlert();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      showAlert('Username dan password wajib diisi');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/login', { username, password });
      window.location.replace('/pages/dashboard.html');
    } catch (error) {
      showAlert((error && error.message) || 'Login gagal. Silakan coba lagi.');
      setLoading(false);
    }
  });
}());
