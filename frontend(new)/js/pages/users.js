/**
 * @file    users.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 26 November 2026
 * UI-04 Daftar Pengguna — rancangan Figma dengan data dari endpoint nyata.
 *
 * Endpoint yang dipakai: GET /api/auth/me, GET /api/users, PUT /api/users/:id.
 * Tidak ada endpoint untuk "terakhir masuk" maupun statistik sesi harian,
 * sehingga dua bagian itu sengaja dibiarkan sebagai teks "belum tersedia".
 */
(function () {
  'use strict';

  const ALL_ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const SHORT_ROLE = { ADMIN: 'Admin', SALES: 'Sales', KASIR: 'Kasir', GUDANG: 'Gudang' };
  const LIMIT = 10;

  const state = { page: 1, total: 0, totalPages: 1 };
  let pendingUser = null;
  let searchTimer = null;

  function showAlert(message, type = 'err') {
    const box = UI.$('#usersAlert');
    box.textContent = message;
    box.className = `alert ${type}`;
  }

  function clearAlert() {
    const box = UI.$('#usersAlert');
    box.textContent = '';
    box.className = 'alert err hidden';
  }

  function icon(text) {
    return UI.el('span', { class: 'users-avatar', 'aria-hidden': 'true', text });
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  }

  function queryString(params) {
    return new URLSearchParams(params).toString();
  }

  async function countUsers(extra = {}) {
    const params = Object.assign({}, extra, { page: 1, limit: 1 });
    const { data } = await API.get('/api/users?' + queryString(params));
    return data.pagination ? Number(data.pagination.total) || 0 : 0;
  }

  async function loadSummary() {
    const [total, active, roleCounts] = await Promise.all([
      countUsers(),
      countUsers({ is_active: '1' }),
      Promise.all(ALL_ROLES.map((role) => countUsers({ role })))
    ]);

    UI.$('#kpiTotal').textContent = String(total);
    UI.$('#kpiActive').textContent = String(active);
    UI.$('#kpiActiveLabel').textContent = `Dari ${total} akun terdaftar`;

    const biggest = Math.max.apply(null, roleCounts);
    if (!biggest) {
      UI.$('#kpiRole').textContent = '—';
    } else {
      const leaders = ALL_ROLES.filter((role, i) => roleCounts[i] === biggest);
      UI.$('#kpiRole').textContent = leaders.map((role) => SHORT_ROLE[role] || role).join(' & ');
    }
    // Sesi login harian tidak tersedia dari API; tidak diisi dengan angka contoh.
    UI.$('#kpiSession').textContent = '—';
  }

  function userRow(user) {
    const active = Boolean(user.is_active);
    const statusButton = UI.el('button', {
      type: 'button',
      class: `btn small users-status ${active ? 'danger' : 'secondary'}`,
      text: active ? 'Nonaktifkan' : 'Aktifkan',
      onclick: () => openModal(user)
    });

    return UI.el('tr', {}, [
      UI.el('td', { class: 'users-name-cell' }, [
        icon(initials(user.name)),
        UI.el('div', { class: 'users-who' }, [
          UI.el('div', { class: 'users-name', text: user.name || '-' }),
          UI.el('div', { class: 'users-username', text: user.username || '-' })
        ])
      ]),
      UI.td(SHORT_ROLE[user.role] || user.role || '-'),
      UI.el('td', {}, UI.badge(active ? 'Aktif' : 'Nonaktif', active ? 'ok' : 'err')),
      UI.el('td', { class: 'users-activity' }, UI.el('span', {
        class: 'users-muted', text: 'Belum tersedia dari API'
      })),
      UI.el('td', { class: 'right' }, [
        UI.el('a', {
          class: 'btn small secondary users-edit',
          href: `user-form.html?id=${encodeURIComponent(user.id)}`,
          text: 'Ubah'
        }),
        ' ',
        statusButton
      ])
    ]);
  }

  async function loadList() {
    const params = { page: state.page, limit: LIMIT };
    const q = UI.$('#q').value.trim();
    const role = UI.$('#roleFilter').value;
    if (q) params.q = q;
    if (role) params.role = role;

    const { data } = await API.get('/api/users?' + queryString(params));
    const users = data.users || [];
    const pagination = data.pagination || { page: 1, total: 0, totalPages: 1 };

    state.page = Number(pagination.page) || 1;
    state.total = Number(pagination.total) || 0;
    state.totalPages = Number(pagination.totalPages) || 1;

    UI.fillTable(UI.$('#tbl'), users, userRow, 'Pengguna tidak ditemukan', 5);
    UI.$('#userCount').textContent = `${state.total} Terdaftar`;

    const start = users.length ? (state.page - 1) * LIMIT + 1 : 0;
    const end = users.length ? start + users.length - 1 : 0;
    UI.$('#pageInfo').textContent =
      `Menampilkan ${start}-${end} dari ${state.total} pengguna terdaftar`;
    UI.$('#btnPrev').disabled = state.page <= 1;
    UI.$('#btnNext').disabled = state.page >= state.totalPages;
  }

  async function refresh() {
    await Promise.all([loadSummary(), loadList()]);
  }

  function openModal(user) {
    pendingUser = user;
    const active = Boolean(user.is_active);
    UI.$('#usersModalTitle').textContent = active ? 'Nonaktifkan Pengguna?' : 'Aktifkan Pengguna?';
    UI.$('#usersModalText').textContent = active
      ? `Apakah Anda yakin ingin menonaktifkan pengguna ${user.name}? Pengguna tidak akan dapat masuk ke sistem.`
      : `Apakah Anda yakin ingin mengaktifkan kembali pengguna ${user.name}?`;
    UI.$('#usersModalUsername').textContent = user.username || '-';
    UI.$('#usersModalRole').textContent = UI.roleLabel(user.role);
    UI.$('#usersModalStatus').textContent = active ? 'Aktif' : 'Nonaktif';
    UI.$('#btnModalConfirm').textContent = active ? 'Ya, Nonaktifkan' : 'Ya, Aktifkan';
    UI.$('#usersModal').classList.remove('hidden');
    UI.$('#btnModalCancel').focus();
  }

  function closeModal() {
    pendingUser = null;
    UI.$('#usersModal').classList.add('hidden');
  }

  async function confirmModal() {
    if (!pendingUser) return;
    const user = pendingUser;
    const button = UI.$('#btnModalConfirm');
    try {
      await UI.busy(button, () => API.put(`/api/users/${user.id}`, {
        is_active: !Boolean(user.is_active)
      }));
      UI.toast(Boolean(user.is_active) ? 'Pengguna dinonaktifkan' : 'Pengguna diaktifkan');
      closeModal();
      await refresh();
    } catch (err) {
      UI.toast(err.message || 'Gagal mengubah status pengguna', 'err');
    }
  }

  function bindEvents() {
    UI.$('#q').addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.page = 1; loadList().catch((e) => UI.toast(e.message, 'err')); }, 250);
    });
    UI.$('#roleFilter').addEventListener('change', () => {
      state.page = 1;
      loadList().catch((e) => UI.toast(e.message, 'err'));
    });
    UI.$('#btnReset').addEventListener('click', () => {
      UI.$('#q').value = '';
      UI.$('#roleFilter').value = '';
      state.page = 1;
      loadList().catch((e) => UI.toast(e.message, 'err'));
    });
    UI.$('#btnPrev').addEventListener('click', () => {
      if (state.page > 1) { state.page -= 1; loadList().catch((e) => UI.toast(e.message, 'err')); }
    });
    UI.$('#btnNext').addEventListener('click', () => {
      if (state.page < state.totalPages) { state.page += 1; loadList().catch((e) => UI.toast(e.message, 'err')); }
    });
    UI.$('#btnModalCancel').addEventListener('click', closeModal);
    UI.$('#btnModalConfirm').addEventListener('click', confirmModal);
    UI.$('#usersModal').addEventListener('click', (e) => {
      if (e.target === UI.$('#usersModal')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !UI.$('#usersModal').classList.contains('hidden')) closeModal();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.UsersShell.init().then(() => {
      clearAlert();
      bindEvents();
      return refresh();
    }).catch((err) => {
      if (err && err.status === 401) return; // api.js sudah mengalihkan ke login
      if (err && err.message === 'forbidden') return;
      showAlert(err.message || 'Data pengguna tidak dapat dimuat');
    });
  });
}());
