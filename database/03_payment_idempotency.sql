-- =====================================================================
-- DistriFlow - 03_payment_idempotency.sql
-- Migrasi sekali jalan untuk idempotency pembayaran piutang (FR-18).
--
-- PENTING:
-- - File ini BELUM dijalankan pada database utama `distriflow`.
-- - Jalankan hanya setelah persetujuan penerapan ke database utama.
-- - Baris lama tetap NULL pada kolom baru sehingga tidak ada data yang
--   diubah, dihapus, atau di-backfill oleh migrasi ini.
-- =====================================================================

ALTER TABLE payments
  ADD COLUMN idempotency_key VARBINARY(512) NULL AFTER note,
  ADD COLUMN request_hash BINARY(32) NULL AFTER idempotency_key,
  ADD UNIQUE KEY uq_payments_order_idem (sales_order_id, idempotency_key);
