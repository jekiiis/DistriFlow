'use strict';

/**
 * DistriFlow - Sprint 0
 * Komponen UI reusable. Semua data pengguna dirender dengan textContent,
 * bukan innerHTML, sesuai NFR-02 (pencegahan XSS).
 */
(function exposeUi() {
  // Path absolut dipakai karena halaman berada di /pages/, bukan di root.
  const COMMON_MENU = [
    ['dashboard', 'Dashboard', '/pages/dashboard.html', '⌂'],
    ['change-password', 'Ganti Password', '/pages/change-password.html', '⚿']
  ];

  const SALES_MENU = [
    ['sales-order', 'Sales Order Baru', '/pages/sales-order.html', '✎'],
    ['orders', 'Daftar Sales Order', '/pages/orders.html', '≡']
  ];

  const KASIR_MENU = [
    ['orders', 'Daftar Sales Order', '/pages/orders.html', '≡'],
    ['payment', 'Pembayaran', '/pages/payment.html', '₹']
  ];

  // Menu mengikuti PAGE_ACCESS di backend. Detail order dibuka dari daftar,
  // sehingga tidak ditaruh sebagai tautan langsung tanpa ID order.
  const MENU_BY_ROLE = {
    ADMIN: COMMON_MENU.concat([
      ['users', 'Manajemen Pengguna', '/pages/users.html', '⚙'],
      ['sales-order', 'Sales Order Baru', '/pages/sales-order.html', '✎'],
      ['orders', 'Daftar Sales Order', '/pages/orders.html', '≡']
    ]),
    SALES: COMMON_MENU.concat(SALES_MENU),
    KASIR: COMMON_MENU.concat(KASIR_MENU),
    GUDANG: COMMON_MENU.slice()
  };

  function formatRupiah(value) {
    const number = Number(value);
    const safeNumber = Number.isFinite(number) ? Math.round(number) : 0;
    return 'Rp' + safeNumber.toLocaleString('id-ID');
  }

  function setText(element, value) {
    if (!element) {
      return;
    }
    element.textContent = value === null || value === undefined ? '' : String(value);
  }

  function renderRows(tbody, rows, columns) {
    if (!tbody) {
      return;
    }
    tbody.textContent = '';

    if (!rows || rows.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = columns.length;
      td.className = 'df-table__empty';
      td.textContent = 'Tidak ada data.';
      tr.appendChild(td);
      tbody.appendChild(tr);
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((column) => {
        const td = document.createElement('td');
        if (column.className) {
          td.className = column.className;
        }
        const value = typeof column.value === 'function' ? column.value(row) : row[column.key];
        td.textContent = value === null || value === undefined ? '' : String(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function notify(message, type = 'success', duration = 4000) {
    let stack = document.querySelector('.df-toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'df-toast-stack';
      document.body.appendChild(stack);
    }

    const toast = document.createElement('div');
    toast.className = 'df-toast df-toast--' + (type || 'success');
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    stack.appendChild(toast);

    window.setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, duration);
  }

  function confirmAction(message, options = {}) {
    return new Promise((resolve) => {
      const backdrop = document.createElement('div');
      backdrop.className = 'df-modal-backdrop';

      const modal = document.createElement('div');
      modal.className = 'df-modal';
      modal.setAttribute('role', 'dialog');
      modal.setAttribute('aria-modal', 'true');

      const title = document.createElement('h2');
      title.className = 'df-modal__title';
      title.textContent = options.title || 'Konfirmasi';

      const body = document.createElement('p');
      body.className = 'df-modal__body';
      body.textContent = message;

      const actions = document.createElement('div');
      actions.className = 'df-btn-group';
      actions.style.justifyContent = 'flex-end';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'df-btn df-btn--secondary';
      cancel.textContent = options.cancelLabel || 'Batal';

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.className = 'df-btn ' + (options.danger ? 'df-btn--danger' : 'df-btn--primary');
      confirm.textContent = options.confirmLabel || 'Ya, lanjutkan';

      function close(result) {
        if (backdrop.parentNode) {
          backdrop.parentNode.removeChild(backdrop);
        }
        resolve(result);
      }

      cancel.addEventListener('click', () => close(false));
      confirm.addEventListener('click', () => close(true));
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) {
          close(false);
        }
      });

      actions.appendChild(cancel);
      actions.appendChild(confirm);
      modal.appendChild(title);
      modal.appendChild(body);
      modal.appendChild(actions);
      backdrop.appendChild(modal);
      document.body.appendChild(backdrop);
      confirm.focus();
    });
  }

  function buildSidebar(role, activeKey, container) {
    const target = container || document.querySelector('.df-sidebar');
    if (!target) {
      return null;
    }

    const menu = MENU_BY_ROLE[String(role || '').toUpperCase()] || [];
    target.textContent = '';

    const brand = document.createElement('div');
    brand.className = 'df-sidebar__brand';

    const logo = document.createElement('div');
    logo.className = 'df-sidebar__logo';
    logo.textContent = 'DF';

    const brandText = document.createElement('div');
    brandText.className = 'df-sidebar__brand-text';
    brandText.textContent = 'DistriFlow';

    const brandSub = document.createElement('span');
    brandSub.className = 'df-sidebar__brand-sub';
    brandSub.textContent = 'Distribusi & POS Bandung';
    brandText.appendChild(brandSub);

    brand.appendChild(logo);
    brand.appendChild(brandText);

    const nav = document.createElement('nav');
    nav.className = 'df-nav';
    nav.setAttribute('aria-label', 'Menu utama');

    menu.forEach((item) => {
      const link = document.createElement('a');
      link.className = 'df-nav__item' + (item[0] === activeKey ? ' df-nav__item--active' : '');
      link.href = item[2];

      const icon = document.createElement('span');
      icon.className = 'df-nav__icon';
      icon.textContent = item[3];

      const label = document.createElement('span');
      label.textContent = item[1];

      link.appendChild(icon);
      link.appendChild(label);
      nav.appendChild(link);
    });

    const footer = document.createElement('div');
    footer.className = 'df-sidebar__footer';
    footer.textContent = 'Gudang Utama · Bandung';

    target.appendChild(brand);
    target.appendChild(nav);
    target.appendChild(footer);
    return target;
  }

  function setupPasswordToggles(root) {
    const scope = root || document;
    const buttons = scope.querySelectorAll('[data-password-toggle]');

    buttons.forEach((button) => {
      if (button.dataset.bound === 'true') {
        return;
      }
      const input = document.getElementById(button.getAttribute('data-password-toggle'));
      if (!input) {
        return;
      }

      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        const willShow = input.type === 'password';
        input.type = willShow ? 'text' : 'password';
        button.textContent = willShow ? 'Sembunyikan' : 'Tampilkan';
        button.setAttribute('aria-label', (willShow ? 'Sembunyikan' : 'Tampilkan') + ' password');
      });
    });
  }

  function setupLogout(button) {
    if (!button || !window.DistriFlowAPI) {
      return;
    }

    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await window.DistriFlowAPI.post('/auth/logout');
        window.location.replace('/pages/login.html');
      } catch (error) {
        notify((error && error.message) || 'Logout gagal. Silakan coba lagi.', 'error');
        button.disabled = false;
      }
    });
  }

  function onUnauthorized() {
    if (typeof window === 'undefined') {
      return;
    }
    if (window.location.pathname.indexOf('login.html') === -1) {
      window.location.replace('/pages/login.html');
    }
  }

  const ui = {
    formatRupiah,
    setText,
    renderRows,
    notify,
    confirmAction,
    buildSidebar,
    setupPasswordToggles,
    setupLogout,
    onUnauthorized,
    MENU_BY_ROLE
  };

  if (typeof window !== 'undefined') {
    window.DistriFlowUI = ui;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ui;
  }
}());
