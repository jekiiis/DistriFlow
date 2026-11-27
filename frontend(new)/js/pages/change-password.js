/**
 * @file    change-password.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 26 November 2026
 * UI-03 Ganti Password — UC-01 4c/4d.
 *
 * Integrasi: GET /api/auth/me untuk sesi dan PUT /api/auth/password untuk ubah sandi.
 * Aturan validasi mengikuti backend: wajib diisi, minimal 8 karakter, maksimal
 * 72 byte, berbeda dari password lama, dan konfirmasi sama. Tidak ada aturan
 * simbol/angka tambahan maupun rotasi 90 hari.
 */
(function () {
  'use strict';

  const ALL_ROLES = ['ADMIN', 'SALES', 'KASIR', 'GUDANG'];
  const ROLE_LABEL = { ADMIN: 'Admin', SALES: 'Sales', KASIR: 'Kasir', GUDANG: 'Petugas Gudang' };
  const LOCATION = 'Gudang Utama - Soekarno Hatta';

  const MENU = [
    { key: 'dashboard', label: 'Dashboard', href: 'dashboard.html', roles: ALL_ROLES, available: true },
    { key: 'sales-order', label: 'Sales Order Baru', href: 'sales-order.html', roles: ['ADMIN', 'SALES'], available: true },
    { key: 'orders', label: 'Daftar Sales Order', href: 'orders.html', roles: ['ADMIN', 'SALES', 'KASIR'], available: true },
    { key: 'payment', label: 'Pembayaran', href: 'payment.html', roles: ['KASIR'], available: true },
    { key: 'receivables', label: 'Piutang', href: 'receivables.html', roles: ['KASIR'], available: true },
    { key: 'products', label: 'Barang', href: 'products.html', roles: ['ADMIN', 'GUDANG'], available: true },
    { key: 'stock-in', label: 'Barang Masuk', href: 'stock-in.html', roles: ['ADMIN', 'GUDANG'], available: true },
    { key: 'customers', label: 'Pelanggan', href: 'customers.html', roles: ['ADMIN', 'SALES', 'KASIR'], available: true },
    { key: 'reports', label: 'Laporan', href: 'reports.html', roles: ['ADMIN'], available: true },
    { key: 'users', label: 'Pengguna', href: 'users.html', roles: ['ADMIN'], available: true }
  ];

  const ICON_PATH = {
    dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
    'sales-order': 'M3 4h2l2.4 11h11.2L21 7H6.2M9 20h.01M18 20h.01',
    orders: 'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    payment: 'M2 6h20v12H2zM2 10h20M6 15h4',
    receivables: 'M4 4h16v16H4zM8 9h8M8 13h8M8 17h5',
    products: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
    'stock-in': 'M12 3v12M7 10l5 5 5-5M4 21h16',
    customers: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21a7 7 0 0114 0M17 11a3 3 0 100-6M22 21a6 6 0 00-5-5.9',
    reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    users: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    logout: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11'
  };

  const FIELD_MAP = {
    oldPassword: 'password_lama',
    newPassword: 'password_baru',
    confirmPassword: 'konfirmasi'
  };

  function icon(key) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ico');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', ICON_PATH[key] || '');
    svg.appendChild(path);
    return svg;
  }

  function showAlert(message, type = 'err') {
    const box = UI.$('#cpAlert');
    box.textContent = message;
    box.className = `alert ${type}`;
  }

  function hideAlert() {
    const box = UI.$('#cpAlert');
    box.textContent = '';
    box.className = 'alert err hidden';
  }

  async function logout() {
    try { await API.post('/api/auth/logout'); }
    finally { window.location.href = 'login.html'; }
  }

  function buildSidebar(user) {
    const active = user.role === 'ADMIN' ? 'users' : 'dashboard';
    const menu = UI.el('nav', { class: 'menu' }, MENU
      .filter((m) => m.roles.includes(user.role))
      .map((m) => {
        const content = [icon(m.key), UI.el('span', { text: m.label })];
        if (!m.available) {
          return UI.el('span', {
            class: 'cp-nav-item is-disabled', 'aria-disabled': 'true',
            title: 'Halaman ini belum tersedia di frontend(new)'
          }, content);
        }
        return UI.el('a', {
          href: m.href,
          class: m.key === active ? 'active' : null,
          'aria-current': m.key === active ? 'page' : null
        }, content);
      }));

    const logoutButton = UI.el('button', {
      class: 'logout', type: 'button', onclick: logout
    }, [icon('logout'), UI.el('span', { text: 'Keluar' })]);

    UI.$('#sidebar').replaceChildren(
      UI.el('div', { class: 'brand' }, [
        UI.el('span', { class: 'logo', text: 'DF' }),
        UI.el('div', {}, ['DistriFlow', UI.el('small', { text: 'Distribusi & POS Bandung' })])
      ]),
      menu,
      UI.el('div', { class: 'side-foot' }, logoutButton)
    );
  }

  function buildTopbar(user) {
    const name = user.name || 'Pengguna';
    const initials = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
    const role = user.role || '-';

    UI.$('#topbar').replaceChildren(
      UI.el('div', { class: 'cp-top-left' }, [
        UI.el('nav', { class: 'cp-breadcrumb', 'aria-label': 'Breadcrumb' }, [
          UI.el('span', { text: 'Pengaturan Akun' }),
          UI.el('span', { class: 'cp-sep', text: '›' }),
          UI.el('strong', { text: 'Ganti Password' })
        ]),
        UI.el('span', { class: 'cp-location', text: LOCATION })
      ]),
      UI.el('div', { class: 'cp-top-right' }, [
        UI.el('span', { class: 'avatar', text: initials }),
        UI.el('div', { class: 'cp-who-copy' }, [
          UI.el('div', { class: 'who-name' }, [
            UI.el('span', { text: name }),
            UI.el('span', { class: 'role', text: role })
          ]),
          UI.el('div', { class: 'cp-username', text: user.username || '-' })
        ]),
        UI.el('a', { href: 'change-password.html', class: 'who-link', text: 'Ganti Password' })
      ])
    );
  }

  function setAuthBadge(user, verified = true) {
    const badge = UI.$('#cpAuthBadge');
    badge.hidden = false;
    if (verified) {
      badge.className = 'cp-auth-badge';
      badge.textContent = 'Terotentikasi';
      badge.title = `Sesi aktif sebagai ${user.name || 'Pengguna'} (${ROLE_LABEL[user.role] || user.role || '-'})`;
    } else {
      badge.className = 'cp-auth-badge warn';
      badge.textContent = 'Sesi tidak diverifikasi';
      badge.title = 'Data sesi tidak dapat dimuat dari /api/auth/me';
    }
  }

  function byteLength(value) {
    return new TextEncoder().encode(String(value)).length;
  }

  function readForm() {
    return {
      password_lama: UI.$('#password_lama').value,
      password_baru: UI.$('#password_baru').value,
      konfirmasi: UI.$('#konfirmasi').value
    };
  }

  function validate(data) {
    const errors = {};
    if (!data.password_lama.length) errors.password_lama = 'Field wajib diisi';

    if (!data.password_baru.length) {
      errors.password_baru = 'Field wajib diisi';
    } else if (byteLength(data.password_baru) > 72) {
      errors.password_baru = 'Password maksimal 72 byte';
    } else if (data.password_baru.length < 8) {
      errors.password_baru = 'Password minimal 8 karakter';
    } else if (data.password_baru === data.password_lama) {
      errors.password_baru = 'Password baru harus berbeda dari password lama';
    }

    if (!data.konfirmasi.length) {
      errors.konfirmasi = 'Field wajib diisi';
    } else if (data.konfirmasi !== data.password_baru) {
      errors.konfirmasi = 'Konfirmasi password tidak sama';
    }
    return errors;
  }

  function setCriterion(id, ok, label) {
    const el = UI.$(id);
    el.textContent = `${ok ? '✓' : '○'} ${label}`;
    el.className = `cp-criterion ${ok ? 'ok' : ''}`;
  }

  function updateStrength() {
    const data = readForm();
    const checks = {
      length: data.password_baru.length >= 8,
      bytes: data.password_baru.length > 0 && byteLength(data.password_baru) <= 72,
      different: Boolean(data.password_baru) && Boolean(data.password_lama) && data.password_baru !== data.password_lama,
      confirm: Boolean(data.password_baru) && data.konfirmasi === data.password_baru
    };
    const passed = Object.values(checks).filter(Boolean).length;

    UI.$('#cpStrengthFill').style.width = `${passed * 25}%`;
    UI.$('#cpStrengthText').textContent = !data.password_baru
      ? 'Belum diisi'
      : passed === 4 ? 'Siap disimpan · 4/4' : `${passed}/4 aturan terpenuhi`;

    setCriterion('#critLength', checks.length, 'Minimal 8 karakter');
    setCriterion('#critBytes', checks.bytes, 'Maksimal 72 byte');
    setCriterion('#critDifferent', checks.different, 'Berbeda dari password lama');
    setCriterion('#critConfirm', checks.confirm, 'Konfirmasi sesuai');
  }

  function mapBackendErrors(err) {
    const mapped = {};
    if (Array.isArray(err.errors)) {
      err.errors.forEach((item) => {
        const field = FIELD_MAP[item.field] || item.field;
        if (field && UI.$(`[name="${field}"]`, UI.$('#formPwd'))) mapped[field] = item.message;
      });
    }
    if (!Object.keys(mapped).length && err.message) {
      const msg = err.message;
      if (/lama salah/i.test(msg)) mapped.password_lama = msg;
      else if (/72 byte|minimal 8 karakter|berbeda dari password lama/i.test(msg)) mapped.password_baru = msg;
      else if (/konfirmasi/i.test(msg)) mapped.konfirmasi = msg;
    }
    return mapped;
  }

  function bindForm() {
    const form = UI.$('#formPwd');
    UI.$$('input', form).forEach((input) => input.addEventListener('input', () => {
      UI.clearErrors(form);
      hideAlert();
      updateStrength();
    }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      UI.clearErrors(form);
      hideAlert();
      UI.$('#cpSuccess').classList.add('hidden');

      const data = readForm();
      const errors = validate(data);
      if (Object.keys(errors).length) {
        UI.showErrors(form, errors);
        showAlert(errors[Object.keys(errors)[0]], 'warn');
        return;
      }

      await UI.busy(UI.$('#btnSimpan'), async () => {
        try {
          const res = await API.put('/api/auth/password', {
            oldPassword: data.password_lama,
            newPassword: data.password_baru,
            confirmPassword: data.konfirmasi
          });
          const message = res.message || 'Password berhasil diubah';
          UI.flash(message);
          UI.toast(message, 'ok');
          const success = UI.$('#cpSuccess');
          success.textContent = message;
          success.classList.remove('hidden');
          setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
        } catch (err) {
          if (err.status === 401) return; // API sudah mengalihkan ke halaman login
          const mapped = mapBackendErrors(err);
          if (Object.keys(mapped).length) UI.showErrors(form, mapped);
          showAlert(err.message || 'Gagal mengubah password', 'err');
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    let user = { name: 'Pengguna', username: '-', role: '' };
    try {
      const { data } = await API.get('/api/auth/me');
      user = data.user || user;
      setAuthBadge(user);
    } catch (err) {
      if (err.status === 401) return; // API sudah mengalihkan ke halaman login
      setAuthBadge(user, false);
      showAlert(err.message || 'Sesi tidak dapat diverifikasi', 'warn');
    }

    buildSidebar(user);
    buildTopbar(user);
    bindForm();
    updateStrength();
  });
}());
