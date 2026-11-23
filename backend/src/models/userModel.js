'use strict';

const { getExecutor } = require('../config/db');
const env = require('../config/env');

const MAX_FAILED_ATTEMPTS = 5;

const USER_COLUMNS = 'id, name, username, password, role, is_active, failed_attempts, locked_until, last_login_at';
const PUBLIC_USER_COLUMNS = 'id, name, username, role, is_active';

async function findByUsername(username, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${USER_COLUMNS},
    (locked_until IS NOT NULL AND locked_until > NOW()) AS is_locked
    FROM users
    WHERE username = ?
    LIMIT 1`;
  const [rows] = await run(sql, [username]);
  return rows[0] || null;
}

async function findById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${USER_COLUMNS}
    FROM users
    WHERE id = ?
    LIMIT 1`;
  const [rows] = await run(sql, [id]);
  return rows[0] || null;
}

// Satu pernyataan atomik: menaikkan failed_attempts, lalu pada percobaan
// kelima memasang lock 5 menit dan mengembalikan failed_attempts ke 0.
async function recordFailedAttempt(id, connection = null) {
  const run = getExecutor(connection);
  // UPDATE single-table dievaluasi kiri ke kanan. locked_until dihitung lebih dulu
  // agar kedua kondisi memakai nilai failed_attempts lama; jika tidak, kunci
  // terpasang pada percobaan ke-4 dan failed_attempts tidak pernah direset.
  const sql = `UPDATE users
    SET locked_until = IF(failed_attempts + 1 >= ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE), locked_until),
        failed_attempts = IF(failed_attempts + 1 >= ?, 0, failed_attempts + 1)
    WHERE id = ?`;
  const [result] = await run(sql, [MAX_FAILED_ATTEMPTS, MAX_FAILED_ATTEMPTS, id]);
  return result;
}

async function resetLoginAttempts(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `UPDATE users
    SET failed_attempts = 0,
        locked_until = NULL,
        last_login_at = NOW()
    WHERE id = ?`;
  const [result] = await run(sql, [id]);
  return result;
}

async function updatePassword(id, passwordHash, connection = null) {
  const run = getExecutor(connection);
  const sql = 'UPDATE users SET password = ? WHERE id = ?';
  const [result] = await run(sql, [passwordHash, id]);
  return result;
}

function buildUserFilters(filters = {}) {
  const search = filters.search || '';
  const role = filters.role || '';
  // Sentinel NULL dipakai agar is_active = 0 tidak dianggap sebagai filter kosong:
  // perbandingan MySQL `0 = ''` bernilai benar dan akan menonaktifkan filter status.
  const isActive = filters.isActive === '' || filters.isActive === undefined || filters.isActive === null
    ? null
    : Number(filters.isActive);

  const where = `WHERE (? = '' OR name LIKE ? OR username LIKE ?)
    AND (? = '' OR role = ?)
    AND (? IS NULL OR is_active = ?)`;
  const params = [
    search, '%' + search + '%', '%' + search + '%',
    role, role,
    isActive, isActive
  ];

  return { where, params };
}

async function findMany(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildUserFilters(filters);
  const limit = filters.limit || 10;
  const offset = filters.offset || 0;
  const sql = `SELECT ${PUBLIC_USER_COLUMNS}
    FROM users
    ${where}
    ORDER BY name ASC, id ASC
    LIMIT ? OFFSET ?`;
  const [rows] = await run(sql, params.concat([limit, offset]));
  return rows;
}

async function countAll(filters = {}, connection = null) {
  const run = getExecutor(connection);
  const { where, params } = buildUserFilters(filters);
  const sql = `SELECT COUNT(*) AS total FROM users ${where}`;
  const [rows] = await run(sql, params);
  return Number(rows[0].total);
}

async function findPublicById(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ? LIMIT 1`;
  const [rows] = await run(sql, [id]);
  return rows[0] || null;
}

async function findIdByUsername(username, connection = null) {
  const run = getExecutor(connection);
  const sql = 'SELECT id FROM users WHERE username = ? LIMIT 1';
  const [rows] = await run(sql, [username]);
  return rows[0] || null;
}

async function insertUser(data, connection = null) {
  const run = getExecutor(connection);
  const sql = `INSERT INTO users (name, username, password, role, is_active)
    VALUES (?, ?, ?, ?, TRUE)`;
  const [result] = await run(sql, [data.name, data.username, data.passwordHash, data.role]);
  return result;
}

// Dipakai di dalam transaksi agar baris target tidak diubah proses lain.
async function findByIdForUpdate(id, connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT ${USER_COLUMNS} FROM users WHERE id = ? LIMIT 1 FOR UPDATE`;
  const [rows] = await run(sql, [id]);
  return rows[0] || null;
}

// Urutan id yang stabil mencegah deadlock saat dua transaksi mengunci Admin.
async function lockActiveAdmins(connection = null) {
  const run = getExecutor(connection);
  const sql = `SELECT id FROM users
    WHERE role = 'ADMIN' AND is_active = TRUE
    ORDER BY id ASC
    FOR UPDATE`;
  const [rows] = await run(sql, []);
  return rows;
}

// Hanya mengubah kolom yang diizinkan. Kolom failed_attempts dan locked_until
// sengaja tidak disentuh agar reset password tidak membuka lockout.
async function updateUser(id, values, connection = null) {
  const run = getExecutor(connection);
  const sql = `UPDATE users
    SET name = ?,
        role = ?,
        is_active = ?,
        password = COALESCE(?, password)
    WHERE id = ?`;
  const [result] = await run(sql, [
    values.name,
    values.role,
    values.isActive ? 1 : 0,
    values.passwordHash,
    id
  ]);
  return result;
}

async function deleteSessionsByUserId(userId, connection = null) {
  const run = getExecutor(connection);
  const tableName = env.session.tableName;

  // Nama tabel berasal dari konfigurasi, bukan input pengguna.
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
    throw new Error('Nama tabel sesi tidak valid');
  }

  const sql = `DELETE FROM \`${tableName}\`
    WHERE CAST(JSON_UNQUOTE(JSON_EXTRACT(data, '$.user.id')) AS UNSIGNED) = ?`;
  const [result] = await run(sql, [Number(userId)]);
  return result;
}

module.exports = {
  MAX_FAILED_ATTEMPTS,
  findByUsername,
  findById,
  recordFailedAttempt,
  resetLoginAttempts,
  updatePassword,
  findMany,
  countAll,
  findPublicById,
  findIdByUsername,
  insertUser,
  findByIdForUpdate,
  lockActiveAdmins,
  updateUser,
  deleteSessionsByUserId
};
