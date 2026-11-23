'use strict';

const path = require('path');

const PUBLIC = 'PUBLIC';
const AUTHENTICATED = 'AUTHENTICATED';

const LOGIN_PAGE = '/pages/login.html';
const DASHBOARD_PAGE = '/pages/dashboard.html';

// Allowlist halaman Sprint 1. Path disimpan kanonik, bukan berasal dari input pengguna.
const PAGE_ACCESS = Object.freeze({
  '/pages/login.html': PUBLIC,
  '/pages/dashboard.html': AUTHENTICATED,
  '/pages/change-password.html': AUTHENTICATED,
  '/pages/users.html': 'ADMIN',
  '/pages/user-form.html': 'ADMIN'
});

function resolvePathname(req) {
  let decoded;
  try {
    decoded = decodeURIComponent(req.path);
  } catch (error) {
    return null;
  }
  return path.posix.normalize(decoded);
}

function getRule(pathname) {
  return Object.prototype.hasOwnProperty.call(PAGE_ACCESS, pathname)
    ? PAGE_ACCESS[pathname]
    : null;
}

function canAccess(rule, user) {
  if (!user) {
    return false;
  }
  if (rule === AUTHENTICATED) {
    return true;
  }
  return user.role === rule;
}

function redirectForbidden(res, loggedIn) {
  if (loggedIn) {
    return res.redirect(302, DASHBOARD_PAGE);
  }
  return res.redirect(302, LOGIN_PAGE);
}

function handleUnknown(pathname, res, next) {
  if (pathname.toLowerCase().endsWith('.html')) {
    return res.status(404).end();
  }
  return next();
}

function sendPage(res, next, pathname, pagesDir) {
  const filename = path.basename(pathname);

  return res.sendFile(filename, { root: pagesDir }, (error) => {
    if (error && !res.headersSent) {
      return next();
    }
    return undefined;
  });
}

function createPageGuard(options = {}) {
  const pagesDir = options.pagesDir || path.resolve(__dirname, '../../frontend/pages');

  return function pageGuard(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    const user = req.session ? req.session.user : null;
    const pathname = resolvePathname(req);

    if (!pathname) {
      return next();
    }

    if (pathname === '/') {
      return redirectForbidden(res, Boolean(user));
    }

    const rule = getRule(pathname);
    if (!rule) {
      return handleUnknown(pathname, res, next);
    }

    if (rule === PUBLIC) {
      if (user) {
        return res.redirect(302, DASHBOARD_PAGE);
      }
      return sendPage(res, next, pathname, pagesDir);
    }

    if (!canAccess(rule, user)) {
      return redirectForbidden(res, Boolean(user));
    }

    return sendPage(res, next, pathname, pagesDir);
  };
}

module.exports = {
  createPageGuard,
  PAGE_ACCESS,
  LOGIN_PAGE,
  DASHBOARD_PAGE
};
