# P1 Fix Report — Idempotensi Pembayaran Piutang (FR-18)

Tanggal: 2026-11-27  
Root proyek: `C:\Users\fadhi\Documents\Semester 5\IMPAL\DistriFlow`

## 1. Temuan awal

Berdasarkan `docs/FINAL_VERIFICATION_AUDIT.md`, temuan P1/M-1 adalah risiko
pembayaran ganda pada `POST /api/receivables/:id/pay`. Idempotensi hanya
mengandalkan awalan `REF:<kunci>|` pada `payments.note` dan jendela waktu
60 detik. Akibatnya:

- retry identik setelah lebih dari 60 detik dapat membuat baris `payments` baru;
- dua request identik yang masuk bersamaan dapat lolos dari pengecekan sebelum
  baris pertama tersimpan;
- tidak ada proteksi database-level yang menjamin satu pembayaran per kunci.

## 2. Audit sebelum perubahan

Audit read-only dilakukan terhadap route, controller, service, model, skema,
test, dan skrip integrasi sebelum file apa pun diubah. Bukti kondisi awal
database utama (hanya `SELECT COUNT(*)`, tidak ada reset/seed/migrasi):

```text
MAIN_DB_users_BEFORE=4
MAIN_DB_products_BEFORE=20
MAIN_DB_customers_BEFORE=8
MAIN_DB_sales_orders_BEFORE=6
MAIN_DB_payments_BEFORE=4
MAIN_DB_stock_movements_BEFORE=3
```

Tidak ada UNIQUE key pada `payments` yang dapat melindungi idempotensi.
Jumlah tabel bisnis tetap 7; perbaikan tidak menambah tabel teknis baru.

## 3. Akar penyebab test yang gagal

### 3.1 `paymentIdempotencyMigration.test.js` — test 1

Error lengkap:

```text
Can't DROP INDEX `uq_payments_order_idem`; check that it exists
  at tests/paymentIdempotencyMigration.test.js:59:14
```

Akar masalah: `beforeAll` sudah diubah untuk membangun skema lama melalui
`transform` pada helper `isolatedDb.js`, tetapi badan test masih menyisakan
tiga pernyataan `ALTER TABLE payments DROP INDEX / DROP COLUMN ...`. Karena
objeknya sudah tidak ada di skema hasil transform, MySQL menolak pernyataan
tersebut. Ini adalah test setup yang usang, bukan cacat implementasi.

Perbaikan: ketiga `ALTER ... DROP` dihapus; test sekarang menjalankan
`03_payment_idempotency.sql` apa adanya terhadap skema lama hasil transform.

### 3.2 `paymentIdempotencyMigration.test.js` — test 2

Error lengkap:

```text
Unknown column 'idempotency_key' in 'INSERT INTO'
  at tests/paymentIdempotencyMigration.test.js:99:14
```

Akar masalah: efek berantai dari test 1. Karena test 1 berhenti sebelum
loop migrasi, kolom baru tidak pernah dibuat, sehingga test 2 gagal saat
mencoba insert dengan `idempotency_key`.

Perbaikan: setelah test 1 berhasil menjalankan migrasi, test 2 lolos tanpa
perubahan assertion.

### 3.3 Open handles Jest

Peringatan sebelumnya:

```text
Jest did not exit one second after the test run has completed.
This usually means that there are asynchronous operations that weren't stopped ...
```

Akar masalah: `backend/src/config/db.js` membuat `mysql.createPool` di level
modul. `paymentIdempotency.integration.test.js` memuat service yang memakai
pool tersebut, tetapi tidak pernah menutupnya di `afterAll`.

Perbaikan: integration test mengimpor `pool` dan memanggil `await pool.end()`
sebelum menutup koneksi standalone dan menghapus database isolasi. Tidak ada
`forceExit`, tidak ada warning yang dimatikan, dan tidak ada assertion yang
dilemahkan. Verifikasi dengan `--detectOpenHandles` menunjukkan tidak ada
open handle dan proses keluar normal.

## 4. Perubahan file

###Modified

- `backend/tests/orderService.test.js` — assertion source-scan `BATAL` diganti
  assertion perilaku `createOrder`: tidak memanggil `lockProductById`,
  `returnStock`, atau `insertCancelMovement` (baris 294-305). SQL pembatalan
  memang berada di `orderModel.js`, bukan di `orderService.js`.
- `database/01_schema.sql` — kolom dan UNIQUE key baru pada `payments`
  (baris 99-105).
- `database/distriflow_lengkap.sql` — dump lengkap diselaraskan dengan skema.
- `docs/API.md` — endpoint 32 (baris 594-643) disinkronkan dengan urutan
  proses, status error, dan strategi idempotensi baru.

### Untracked / baru

- `backend/src/services/receivableService.js` — logika identitas pembayaran,
  deteksi konflik, pencarian existing payment, insert sekali, dan orkestrasi
  transaksi (fungsi utama di baris 221, 282, 286, 307, 352).
- `backend/src/models/receivableModel.js` — `PAYMENT_COLUMNS` menyertakan
  `sales_order_id`; `findPaymentByKey` memakai `FOR UPDATE` (baris 161);
  `findRecentPayment` hanya untuk baris lama dengan `idempotency_key IS NULL`
  (baris 180); `insertPayment` menyimpan kunci dan hash (baris 209).
- `backend/tests/helpers/isolatedDb.js` — helper create/connect/drop database
  isolasi, validasi nama database, dan dukungan `transform` untuk skema lama.
- `backend/tests/paymentIdempotency.integration.test.js` — 9 test integrasi
  MySQL nyata pada database terisolasi.
- `backend/tests/paymentIdempotencyMigration.test.js` — 2 test migrasi pada
  database terisolasi.
- `backend/tests/sprint3Routes.test.js` — test retry duplikat tetap `201`
  dengan pesan `sudah tercatat`.
- `backend/scripts/verify-sprint3-db.js` — late replay setelah 61 detik dan
  pemeriksaan jumlah payment tetap 1.
- `database/03_payment_idempotency.sql` — migrasi sekali jalan untuk database
  existing. **Belum diterapkan ke `distriflow`.**
- `docs/P1_FIX_REPORT.md` — laporan ini.

File lain yang muncul di `git status` adalah pekerjaan Sprint 3 yang sudah
ada sebelum task P1 ini; tidak saya ubah.

## 5. Perubahan skema

Instalasi baru (`01_schema.sql` dan `distriflow_lengkap.sql`) serta migrasi
existing (`03_payment_idempotency.sql`) menambahkan:

```sql
idempotency_key VARBINARY(512) NULL AFTER note,
request_hash   BINARY(32) NULL AFTER idempotency_key,
UNIQUE KEY uq_payments_order_idem (sales_order_id, idempotency_key)
```

- Tidak ada tabel baru; tetap 7 tabel bisnis sesuai DPPL.
- Tidak ada backfill data lama; baris existing tetap `NULL` pada dua kolom baru.
- Migrasi diuji hanya di database isolasi dan **tidak** dijalankan pada
  database utama `distriflow`.

## 6. Strategi idempotensi

1. Identitas pembayaran dibuat dari `reference`:
   - ada reference → kunci `REF:<reference>`;
   - tanpa reference → kunci `AUTO:<sha256(order, nominal, metode, catatan, kasir)>`.
2. Awalan `REF:<kunci>|` pada `payments.note` tetap dipertahankan agar respons
   API, PDF, dan data historis kompatibel.
3. `payments.request_hash` menyimpan SHA-256 dari
   `[orderId, kunci, nominal, metode, kasir]` dan dibandingkan dengan
   `timingSafeEqual`. Kunci yang sama dengan payload berbeda ditolak `409`.
4. `UNIQUE KEY uq_payments_order_idem` menjadi pertahanan database-level.
   Jika dua request bersamaan lolos dari pengecekan awal, `ER_DUP_ENTRY`
   ditangkap, baris pemenang dibaca dengan `FOR UPDATE`, lalu diperlakukan
   sebagai retry yang sama.
5. Urutan transaksi: validasi → lock order `FOR UPDATE` → cek kunci → cek
   warisan `REF:` (hanya baris lama, 60 detik) → cek status → hitung ulang
   outstanding → insert → update status bersyarat → baca ulang hasil.
6. Perilaku endpoint:
   - retry identik kapan saja, termasuk setelah order `LUNAS`: `201`, pesan
     `Pembayaran sudah tercatat sebelumnya`, `data.payment` adalah baris lama;
   - kunci sama dengan nominal/metode berbeda: `409 Referensi pembayaran sudah
     dipakai untuk nominal atau metode berbeda`;
   - reference berbeda pada order `PIUTANG`: payment baru, sehingga parsial dan
     pelunasan tetap berjalan;
   - kunci baru pada order bukan `PIUTANG`: tetap `404 Piutang tidak ditemukan`.

## 7. Hasil pengujian

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` | PASS, 0 error |
| `node --check` 9 file JS relevan | PASS |
| `npm test -- --silent` | **24 suite PASS, 366 test PASS, 0 gagal**, 18.744 s |
| `npm test -- --silent --detectOpenHandles` | 24 suite PASS, 366 test PASS, tanpa open handle warning, 19.617 s |
| `npx jest tests/paymentIdempotencyMigration.test.js` | 2 test PASS, 1.631 s |
| `npx jest tests/paymentIdempotency.integration.test.js` | 9 test PASS, 2.607 s |
| `node backend/scripts/verify-sprint3-db.js` | 9 kelompok pemeriksaan PASS; database isolasi dibersihkan |
| Browser E2E `audit-browser-full.js` (Chrome headless) | `E2E_OVERALL=PASS`; `ISOLATED_DB_DROPPED=yes` |

Cakupan idempotensi yang diuji:

- retry identik dalam 60 detik;
- retry identik setelah paid_at dimundurkan 61 detik;
- retry tanpa reference setelah 61 detik;
- dua request identik bersamaan (`Promise.all`);
- dua reference berbeda menghasilkan dua payment parsial;
- reference sama dengan payload berbeda ditolak `409`;
- parsial lalu pelunasan, status `LUNAS`, saldo `200000.00`, stok tidak berubah;
- injeksi kegagalan pada `markSettled` → rollback payment, status, dan stok;
- baris warisan `REF:` tanpa kunci masih dikenali dalam 60 detik.

Regresi terkait juga lolos: transaksi `withTransaction`, pembatalan DRAFT dan
PIUTANG, payment UC-04, route Sprint 2/3, page guard, dan alur browser
UI-01…UI-18. Tidak ada perubahan UI.

Ringkasan E2E browser (database buangan) meliputi login empat peran, role gate,
CRUD produk/pelanggan/user, barang masuk duplikat, order, invoice PDF,
pelunasan, piutang + receipt PDF, pembatalan DRAFT/PIUTANG, dan logout.

## 8. Bukti database utama tidak disentuh

Hitungan akhir database utama sama persis dengan hitungan awal:

```text
MAIN_DB_users_AFTER=4          MAIN_DB_users_FINAL=4
MAIN_DB_products_AFTER=20      MAIN_DB_products_FINAL=20
MAIN_DB_customers_AFTER=8      MAIN_DB_customers_FINAL=8
MAIN_DB_sales_orders_AFTER=6   MAIN_DB_sales_orders_FINAL=6
MAIN_DB_payments_AFTER=4       MAIN_DB_payments_FINAL=4
MAIN_DB_stock_movements_AFTER=3 MAIN_DB_stock_movements_FINAL=3
P1_LEFTOVER_DBS=0
```

Seluruh pengujian memakai database dengan prefiks `test_payment_idem_*`,
`test_payment_migrate_*`, `test_verify_sprint3_*`, atau
`test_audit_browser_full_*`, dan semuanya dihapus setelah pengujian. Masih ada
10 database lama berprefiks `test_verify_sprint2_*` dari audit Sprint 2
sebelumnya; bukan dibuat oleh rangkaian P1 ini dan tidak saya hapus atau ubah.

Tidak ada password, token, hash, atau isi `.env` yang ditampilkan selama
pekerjaan maupun dalam laporan ini.

## 9. Git status terakhir (ruang lingkup P1)

```text
 M backend/tests/orderService.test.js
 M database/01_schema.sql
 M database/distriflow_lengkap.sql
 M docs/API.md
?? backend/scripts/verify-sprint3-db.js
?? backend/src/models/receivableModel.js
?? backend/src/services/receivableService.js
?? backend/tests/helpers/isolatedDb.js
?? backend/tests/paymentIdempotency.integration.test.js
?? backend/tests/paymentIdempotencyMigration.test.js
?? backend/tests/sprint3Routes.test.js
?? database/03_payment_idempotency.sql
?? docs/P1_FIX_REPORT.md
```

Tidak ada commit, push, reset, checkout, perpindahan branch, atau penghapusan
file yang dilakukan.

## 10. Risiko dan keterbatasan

1. **Migrasi produksi masih menunggu persetujuan.** Kode baru mengira
   `payments.idempotency_key` dan `request_hash` sudah ada. Jika kode ini
   diterapkan ke database utama yang masih memakai skema lama sebelum
   `03_payment_idempotency.sql` dijalankan, endpoint pelunasan akan gagal dengan
   `Unknown column`. Urutan deploy harus: migrasi → deploy kode.
2. Baris lama tidak di-backfill. Untuk baris warisan dengan
   `idempotency_key IS NULL`, proteksi `REF:` hanya berlaku dalam jendela 60
   detik seperti perilaku lama. Backfill sengaja tidak dilakukan karena akan
   mengubah data utama.
3. `request_hash` tidak memasukkan `note`. Reference, nominal, metode, dan
   kasir yang sama dianggap identik walaupun catatannya berbeda; ini sesuai
   dengan makna kunci idempotency dan tidak mengubah aturan bisnis pembayaran.
4. Perlindungan konkurensi bergantung pada InnoDB dan UNIQUE key. Sudah diuji
   dengan dua request bersamaan pada MySQL terisolasi.
5. Perbaikan hanya menyentuh jalur `POST /api/receivables/:id/pay` (FR-18).
   Jalur `POST /api/orders/:id/payments` (UC-04) tidak diubah.

## 11. Kesimpulan

Seluruh kriteria teknis untuk review kode terpenuhi: lint PASS, syntax check
PASS, 366/366 test PASS, Jest berhenti normal tanpa open handle, integrasi
Sprint 3 dan browser E2E PASS, database utama tidak berubah, UI tidak diubah,
dan dokumentasi sesuai implementasi.

Status siap direview untuk commit manual: **YA**, dengan catatan bahwa
penerapan `database/03_payment_idempotency.sql` ke database utama `distriflow`
masih menunggu persetujuan pemilik proyek dan harus dilakukan sebelum kode
ini di-deploy ke lingkungan yang memakai database tersebut.
