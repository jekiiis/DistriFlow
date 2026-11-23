'use strict';

/**
 * UI-02 Dashboard Sprint 1 — sambutan + pintasan navigasi sesuai peran.
 * Tidak memuat KPI atau statistik bisnis (scope Sprint 3).
 */
(function initDashboard() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;
  const alertBox = document.getElementById('dashboard-alert');
  const usersShortcut = document.getElementById('shortcut-users');

  ui.setupLogout(document.getElementById('logout-button'));

  function showAlert(message) {
    alertBox.textContent = message;
    alertBox.className = 'df-alert df-alert--error';
    alertBox.hidden = false;
  }

  function applyUser(user) {
    const name = user.name || 'Pengguna';
    const role = user.role || '-';

    ui.setText(document.getElementById('user-name'), name);
    ui.setText(document.getElementById('user-role'), role);
    ui.setText(document.getElementById('user-avatar'), name.charAt(0).toUpperCase());
    ui.setText(document.getElementById('welcome-name'), name);
    ui.setText(document.getElementById('welcome-role'), role);

    ui.buildSidebar(role, 'dashboard');

    if (role === 'ADMIN') {
      usersShortcut.classList.remove('df-hidden');
    }
  }

  function showDate() {
    const formatted = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    }).format(new Date());
    ui.setText(document.getElementById('today-label'), formatted);
  }

  async function load() {
    try {
      const data = await api.get('/auth/me');
      applyUser(data && data.user ? data.user : {});
      showDate();
    } catch (error) {
      showAlert((error && error.message) || 'Gagal memuat data sesi.');
    }
  }

  load();
}());
