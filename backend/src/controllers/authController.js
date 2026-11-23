'use strict';

const authService = require('../services/authService');
const { success } = require('../helpers/response');

// Nama cookie harus sama dengan konfigurasi di config/session.js.
const SESSION_COOKIE_NAME = 'distriflow.sid';

function regenerateSession(req) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((error) => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
}

function saveSession(req) {
  return new Promise((resolve, reject) => {
    req.session.save((error) => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
}

function destroySession(req) {
  return new Promise((resolve, reject) => {
    req.session.destroy((error) => {
      if (error) {
        return reject(error);
      }
      return resolve();
    });
  });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  const user = await authService.login(username, password);

  await regenerateSession(req);

  req.session.user = {
    id: user.id,
    name: user.name,
    username: user.username,
    role: user.role
  };

  // Pastikan sesi tersimpan sebelum mengirim respons sukses.
  await saveSession(req);

  return success(res, { user: req.session.user }, 'Login berhasil');
}

async function logout(req, res) {
  await destroySession(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/'
  });
  return success(res, null, 'Logout berhasil');
}

function me(req, res) {
  return success(res, { user: req.session.user }, 'Data sesi');
}

async function changePassword(req, res) {
  await authService.changePassword(req.session.user.id, req.body || {});
  return success(res, null, 'Password berhasil diubah');
}

module.exports = {
  login,
  logout,
  me,
  changePassword
};
