'use strict';

/**
 * UI-04 Daftar Pengguna.
 * Memakai GET /api/users untuk daftar/filter/pagination dan PUT /api/users/:id
 * untuk mengaktifkan atau menonaktifkan akun. Otorisasi tetap di Page Guard
 * dan middleware backend; frontend hanya menampilkan data dan pesan server.
 */
(function initUsers() {
  const api = window.DistriFlowAPI;
  const ui = window.DistriFlowUI;

  const PAGE_LIMIT = 10;
  const SEARCH_DELAY_MS = 300;
  const COLUMN_COUNT = 5;

  const alertBox = document.getElementById('users-alert');
  const tbody = document.getElementById('users-body');
  const userCount = document.getElementById('user-count');
  const searchInput = document.getElementById('user-search');
  const roleFilter = document.getElementById('role-filter');
  const statusFilter = document.getElementById('status-filter');
  const resetButton = document.getElementById('filter-reset');
  const prevButton = document.getElementById('prev-page');
  const nextButton = document.getElementById('next-page');
  const pageLabel = document.getElementById('page-label');
  const paginationInfo = document.getElementById('pagination-info');

  const state = {
    search: '',
    role: '',
    isActive: '',
    page: 1,
    totalPages: 0
  };

  let requestToken = 0;
  let searchTimer = null;
  let statusBusy = false;

  function showAlert(message, type) {
    alertBox.textContent = message;
    alertBox.className = 'df-alert df-alert--' + (type === 'warning' ? 'warning' : 'error');
    alertBox.hidden = false;
  }

  function clearAlert() {
    alertBox.hidden = true;
    alertBox.textContent = '';
  }

  function setLoading(loading) {
    [searchInput, roleFilter, statusFilter, resetButton].forEach((element) => {
      if (element) {
        element.disabled = loading;
      }
    });

    if (loading) {
      prevButton.disabled = true;
      nextButton.disabled = true;
      tbody.textContent = '';
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.className = 'df-table__empty';
      cell.colSpan = COLUMN_COUNT;
      cell.textContent = 'Memuat data pengguna…';
      row.appendChild(cell);
      tbody.appendChild(row);
      ui.setText(userCount, 'Memuat daftar pengguna…');
    }
  }

  function setActionButtonsDisabled(disabled) {
    const buttons = tbody.querySelectorAll('button[data-user-action]');
    buttons.forEach((button) => {
      button.disabled = disabled;
    });
  }

  function buildQuery() {
    const params = new URLSearchParams();
    if (state.search) {
      params.set('q', state.search);
    }
    if (state.role) {
      params.set('role', state.role);
    }
    if (state.isActive !== '') {
      params.set('is_active', state.isActive);
    }
    params.set('page', String(state.page));
    params.set('limit', String(PAGE_LIMIT));
    // Backend memakai ORDER BY tetap; tidak ada parameter sort yang didukung.
    return '/users?' + params.toString();
  }

  function appendTextCell(row, value, className) {
    const cell = document.createElement('td');
    if (className) {
      cell.className = className;
    }
    cell.textContent = value === null || value === undefined ? '' : String(value);
    row.appendChild(cell);
    return cell;
  }

  function renderEmpty(message) {
    tbody.textContent = '';
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.className = 'df-table__empty';
    cell.colSpan = COLUMN_COUNT;
    cell.textContent = message;
    row.appendChild(cell);
    tbody.appendChild(row);
  }

  function renderUsers(users) {
    tbody.textContent = '';

    if (!users.length) {
      renderEmpty('Tidak ada pengguna yang cocok dengan filter.');
      return;
    }

    users.forEach((user) => {
      const name = String(user.name || '');
      const username = String(user.username || '');
      const role = String(user.role || '');
      const isActive = Boolean(user.is_active);
      const row = document.createElement('tr');

      const nameCell = document.createElement('td');
      const nameWrap = document.createElement('div');
      nameWrap.className = 'df-user-cell';

      const avatar = document.createElement('span');
      avatar.className = 'df-user-cell__avatar';
      avatar.setAttribute('aria-hidden', 'true');
      avatar.textContent = name.charAt(0).toUpperCase() || '?';

      const nameText = document.createElement('span');
      const nameStrong = document.createElement('span');
      nameStrong.className = 'df-user-cell__name';
      nameStrong.textContent = name;

      const nameSub = document.createElement('span');
      nameSub.className = 'df-user-cell__username';
      nameSub.textContent = role ? 'Peran: ' + role : '';

      nameText.appendChild(nameStrong);
      nameText.appendChild(nameSub);
      nameWrap.appendChild(avatar);
      nameWrap.appendChild(nameText);
      nameCell.appendChild(nameWrap);
      row.appendChild(nameCell);

      appendTextCell(row, username);
      appendTextCell(row, role);

      const statusCell = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = 'df-badge ' + (isActive ? 'df-badge--success' : 'df-badge--danger');
      badge.textContent = isActive ? 'Aktif' : 'Nonaktif';
      statusCell.appendChild(badge);
      row.appendChild(statusCell);

      const actionCell = document.createElement('td');
      actionCell.className = 'df-right';
      const actions = document.createElement('div');
      actions.className = 'df-btn-group';
      actions.style.justifyContent = 'flex-end';

      const editLink = document.createElement('a');
      editLink.className = 'df-btn df-btn--secondary df-btn--sm';
      editLink.href = '/pages/user-form.html?id=' + encodeURIComponent(String(user.id));
      editLink.textContent = 'Ubah';
      editLink.setAttribute('aria-label', 'Ubah pengguna ' + name);

      const toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.className = 'df-btn df-btn--sm ' + (isActive ? 'df-btn--danger' : 'df-btn--primary');
      toggleButton.dataset.userAction = 'toggle';
      toggleButton.textContent = isActive ? 'Nonaktifkan' : 'Aktifkan';
      toggleButton.setAttribute('aria-label', (isActive ? 'Nonaktifkan' : 'Aktifkan') + ' pengguna ' + name);
      toggleButton.addEventListener('click', () => toggleStatus(user));

      actions.appendChild(editLink);
      actions.appendChild(toggleButton);
      actionCell.appendChild(actions);
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });
  }

  function renderPagination(pagination) {
    const total = Number(pagination && pagination.total) || 0;
    const totalPages = Number(pagination && pagination.totalPages) || 0;
    state.totalPages = totalPages;

    if (pagination && Number.isInteger(Number(pagination.page)) && Number(pagination.page) > 0) {
      state.page = Number(pagination.page);
    }

    if (total === 0) {
      ui.setText(paginationInfo, 'Tidak ada pengguna');
    } else {
      const pages = Math.max(totalPages, 1);
      ui.setText(paginationInfo, 'Halaman ' + state.page + ' dari ' + pages + ' · ' + total + ' pengguna');
    }

    ui.setText(pageLabel, String(state.page));
    prevButton.disabled = state.page <= 1;
    nextButton.disabled = totalPages === 0 || state.page >= totalPages;
    ui.setText(userCount, 'Data Pengguna · ' + total + ' terdaftar');
  }

  async function loadUsers() {
    const token = ++requestToken;
    clearAlert();
    setLoading(true);

    try {
      const data = await api.get(buildQuery());
      if (token !== requestToken) {
        return;
      }

      const pagination = data && data.pagination ? data.pagination : {};
      const pages = Number(pagination.totalPages) || 0;
      if (pages > 0 && state.page > pages) {
        state.page = pages;
        await loadUsers();
        return;
      }

      const users = data && Array.isArray(data.users) ? data.users : [];
      renderUsers(users);
      renderPagination(pagination);
    } catch (error) {
      if (token !== requestToken) {
        return;
      }
      renderEmpty('Gagal memuat data pengguna.');
      ui.setText(paginationInfo, '');
      prevButton.disabled = true;
      nextButton.disabled = true;
      showAlert((error && error.message) || 'Gagal memuat daftar pengguna.');
    } finally {
      if (token === requestToken) {
        setLoading(false);
      }
    }
  }

  async function toggleStatus(user) {
    if (statusBusy) {
      return;
    }

    const name = String(user.name || '');
    const nextActive = !Boolean(user.is_active);

    if (!nextActive) {
      const confirmed = await ui.confirmAction(
        'Apakah Anda yakin ingin menonaktifkan pengguna ' + name +
          '? Pengguna tidak akan dapat masuk ke sistem.',
        {
          title: 'Nonaktifkan Pengguna?',
          confirmLabel: 'Nonaktifkan',
          danger: true
        }
      );
      if (!confirmed) {
        return;
      }
    }

    statusBusy = true;
    setActionButtonsDisabled(true);
    clearAlert();

    try {
      await api.put('/users/' + encodeURIComponent(String(user.id)), { is_active: nextActive });
      ui.notify(nextActive ? 'Pengguna berhasil diaktifkan.' : 'Pengguna berhasil dinonaktifkan.');
      await loadUsers();
    } catch (error) {
      showAlert((error && error.message) || 'Gagal mengubah status pengguna.');
    } finally {
      statusBusy = false;
      setActionButtonsDisabled(false);
    }
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

  function applyFiltersFromInputs() {
    state.search = searchInput.value.trim();
    state.role = roleFilter.value;
    state.isActive = statusFilter.value;
    state.page = 1;
  }

  function cancelScheduledSearch() {
    if (searchTimer !== null) {
      window.clearTimeout(searchTimer);
      searchTimer = null;
    }
  }

  function scheduleSearch() {
    cancelScheduledSearch();
    searchTimer = window.setTimeout(() => {
      searchTimer = null;
      applyFiltersFromInputs();
      loadUsers();
    }, SEARCH_DELAY_MS);
  }

  document.getElementById('user-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    cancelScheduledSearch();
    applyFiltersFromInputs();
    loadUsers();
  });

  searchInput.addEventListener('input', scheduleSearch);
  roleFilter.addEventListener('change', () => {
    cancelScheduledSearch();
    applyFiltersFromInputs();
    loadUsers();
  });
  statusFilter.addEventListener('change', () => {
    cancelScheduledSearch();
    applyFiltersFromInputs();
    loadUsers();
  });
  resetButton.addEventListener('click', () => {
    cancelScheduledSearch();
    searchInput.value = '';
    roleFilter.value = '';
    statusFilter.value = '';
    applyFiltersFromInputs();
    loadUsers();
  });

  prevButton.addEventListener('click', () => {
    if (state.page > 1) {
      state.page -= 1;
      loadUsers();
    }
  });

  nextButton.addEventListener('click', () => {
    if (state.totalPages > 0 && state.page < state.totalPages) {
      state.page += 1;
      loadUsers();
    }
  });

  ui.setupLogout(document.getElementById('logout-button'));

  if (new URLSearchParams(window.location.search).get('saved') === '1') {
    ui.notify('Data pengguna berhasil disimpan.');
    window.history.replaceState(null, '', '/pages/users.html');
  }

  loadSession();
  loadUsers();
}());
