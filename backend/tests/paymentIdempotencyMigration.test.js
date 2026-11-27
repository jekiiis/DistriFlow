'use strict';

/**
 * Menguji migrasi 03_payment_idempotency.sql pada database isolasi.
 * Migrasi TIDAK dijalankan pada database utama `distriflow`.
 */

const isolatedDb = require('./helpers/isolatedDb');

const DB_NAME = isolatedDb.databaseName('test_payment_migrate_');
process.env.NODE_ENV = 'test';
process.env.DB_NAME = DB_NAME;
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'test-session-secret-not-for-production';
}

jest.setTimeout(30000);

let db;

const LEGACY_REPLACEMENTS = [
  /,\s*idempotency_key\s+VARBINARY\(512\)\s+NULL/gi,
  /,\s*request_hash\s+BINARY\(32\)\s+NULL/gi,
  /,\s*UNIQUE KEY uq_payments_order_idem\s*\([^)]*\)/gi
];

beforeAll(async () => {
  // Bangun skema "lama" dengan menghapus tiga definisi baru dari salinan
  // 01_schema.sql di database isolasi. File asli tidak diubah.
  await isolatedDb.createDatabase(
    DB_NAME,
    ['01_schema.sql', '02_seed.sql'],
    (file, statements) => {
      if (file !== '01_schema.sql') {
        return statements;
      }
      return statements.map((statement) => {
        let legacy = statement;
        for (const pattern of LEGACY_REPLACEMENTS) {
          legacy = legacy.replace(pattern, '');
        }
        return legacy;
      });
    }
  );
  db = await isolatedDb.connect(DB_NAME);
});

afterAll(async () => {
  if (db) {
    await db.end();
  }
  await isolatedDb.dropDatabase(DB_NAME);
});

describe('migrasi idempotency pembayaran', () => {
  test('menambah kolom dan UNIQUE key tanpa mengubah baris lama', async () => {
    // Skema lama sudah dibangun di beforeAll melalui transform; jalankan
    // migrasi apa adanya seperti yang akan dipakai pada database existing.
    for (const statement of isolatedDb.sqlStatements('03_payment_idempotency.sql', DB_NAME)) {
      await db.query(statement);
    }

    const [columns] = await db.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payments'
           AND COLUMN_NAME IN ('idempotency_key', 'request_hash')`,
      [DB_NAME]
    );
    expect(columns.map((row) => row.COLUMN_NAME).sort()).toEqual(
      ['idempotency_key', 'request_hash']
    );

    const [indexes] = await db.execute(
      `SELECT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'payments'
           AND INDEX_NAME = 'uq_payments_order_idem'`,
      [DB_NAME]
    );
    expect(indexes).toHaveLength(2); // (sales_order_id, idempotency_key)

    const [legacyRows] = await db.execute(
      'SELECT COUNT(*) AS total FROM payments WHERE idempotency_key IS NULL AND request_hash IS NULL'
    );
    expect(Number(legacyRows[0].total)).toBeGreaterThan(0);
  });

  test('UNIQUE menolak kunci sama dan mengizinkan kunci berbeda', async () => {
    const key = Buffer.from('REF:MIGRATION-001', 'utf8');
    const hash = Buffer.alloc(32, 7);
    const sql = `INSERT INTO payments
      (sales_order_id, user_id, paid_at, amount, change_amount, method, note,
        idempotency_key, request_hash)
      VALUES (2, 3, NOW(), 100000.00, 0, 'TRANSFER', ?, ?, ?)`;

    await db.execute(sql, ['pembayaran pertama', key, hash]);

    await expect(db.execute(sql, ['pembayaran kedua', key, hash]))
      .rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    await expect(
      db.execute(sql, ['pembayaran lain', Buffer.from('REF:MIGRATION-002', 'utf8'), hash])
    ).resolves.toBeTruthy();

    const [rows] = await db.execute(
      `SELECT COUNT(*) AS total FROM payments
         WHERE sales_order_id = 2 AND idempotency_key = ?`,
      [key]
    );
    expect(Number(rows[0].total)).toBe(1);
  });
});
