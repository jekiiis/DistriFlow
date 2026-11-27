# DistriFlow

Sistem penjualan, invoice, dan piutang untuk satu distributor dengan satu gudang di Bandung.

DistriFlow membantu alur kerja dari pembuatan sales order, pembayaran, pencetakan invoice, pencatatan
barang masuk, pelunasan piutang, hingga laporan penjualan dan KPI. Aplikasi ini ditujukan untuk
mahasiswa dan tim pengembangan sebagai dokumentasi teknis sekaligus panduan menjalankan proyek di
komputer masing-masing.

Repository: <https://github.com/jekiiis/DistriFlow>

**Status saat ini:** cabang `main`. Implementasi UI-01…UI-18, Sprint 3
(FR-09 dan FR-13…FR-22), serta perbaikan P1 idempotensi pembayaran piutang sudah tersedia.
Rinciannya ada di [`docs/SPRINT3_IMPLEMENTATION_REPORT.md`](docs/SPRINT3_IMPLEMENTATION_REPORT.md)
dan [`docs/P1_FIX_REPORT.md`](docs/P1_FIX_REPORT.md).

## 1. Tujuan dan gambaran aplikasi

DistriFlow versi 1.0 dirancang untuk satu distributor dengan satu gudang. Ruang lingkupnya:

- Mengelola pengguna dengan empat peran dan pembatasan akses di backend maupun halaman.
- Membuat sales order dalam status `DRAFT`, lalu memproses pembayaran menjadi `LUNAS` atau `PIUTANG`.
- Mencetak invoice dari data transaksi nyata.
- Mengelola master produk dan pelanggan serta mencatat barang masuk.
- Melihat dan melunasi piutang dengan bukti pembayaran PDF.
- Menyajikan laporan penjualan dan KPI dashboard.

Alur utama dapat diringkas sebagai berikut:

```text
Login sesuai peran
  → buat sales order DRAFT (ADMIN/SALES)
  → bayar order (KASIR) → invoice PDF
  → kelola stok dan master data (ADMIN/GUDANG)
  → lihat dan lunasi piutang (KASIR) → bukti PDF
  → lihat laporan dan KPI (ADMIN / semua peran login)
```

Otorisasi ditentukan oleh backend. Frontend hanya membantu navigasi dan tidak boleh menjadi satu-satunya
penjaga hak akses.

## 2. Fitur utama

### Autentikasi dan manajemen pengguna

- Login, logout, dan ganti password.
- Session disimpan di MySQL pada lingkungan `development`/`production`; cookie `HttpOnly` dan
  `SameSite=Strict`.
- Lockout sementara setelah lima kegagalan login dalam jendela lima menit.
- ADMIN dapat membuat, mengubah, dan menonaktifkan pengguna. Pengguna tidak dihapus permanen.
- Username tidak dapat diubah setelah dibuat.

### Penjualan dan invoice

- UI-06: sales order baru dengan pelanggan dan produk dari API; harga dihitung ulang di server.
- UI-07/UI-08: daftar dan detail order, filter, pagination, pembatalan oleh ADMIN, dan cetak invoice.
- UI-09: pembayaran tunai/kredit oleh KASIR, termasuk pengecekan limit kredit dan kembalian.
- UI-10: invoice PDF nyata melalui `/api/orders/:id/invoice.pdf?format=a4|80mm`.
- Total transaksi = `subtotal − diskon`; tanpa PPN. Order `DRAFT` belum mengurangi stok.

### Master data dan inventaris

- UI-11/UI-12: daftar, tambah, ubah, dan nonaktifkan produk oleh ADMIN; GUDANG melihat data.
- UI-13: pencatatan barang masuk oleh ADMIN/GUDANG beserta riwayat dan konfirmasi duplikasi nomor dokumen.
  Catatan: field `note` barang masuk divalidasi oleh API tetapi belum dipersistenkan karena tabel
  `stock_movements` belum memiliki kolom `note`, sesuai
  [`docs/SPRINT3_IMPLEMENTATION_REPORT.md`](docs/SPRINT3_IMPLEMENTATION_REPORT.md).
- UI-14/UI-15: daftar dan form pelanggan; penulisan hanya oleh ADMIN.
- Stok awal produk selalu `0`; penambahan stok hanya melalui barang masuk.

### Piutang, laporan, dan KPI

- UI-16: daftar piutang dengan informasi jatuh tempo dan label risiko.
- UI-17: modal pelunasan piutang oleh KASIR dengan nominal, metode, dan bukti PDF.
- UI-18: laporan penjualan ADMIN dengan ringkasan, tabel produk, tabel harian, dan ekspor PDF.
- Dashboard menampilkan KPI dan daftar stok menipis. `GET /api/dashboard/kpi` dapat dibaca semua peran
  login, tetapi angka keuangan untuk GUDANG sengaja dikembalikan sebagai nol.
- Risiko kredit memakai aturan biner yang disetujui: `Berisiko` bila
  `outstanding >= 0,8 × credit_limit` dan `credit_limit > 0`; jika tidak, `Aman`.

### Perbaikan P1 — idempotensi pembayaran piutang

- `POST /api/receivables/:id/pay` mencatat identitas pembayaran melalui
  `payments.idempotency_key` dan `payments.request_hash`.
- Retry identik, termasuk setelah lebih dari 60 detik, mengembalikan payment yang sama tanpa
  menambah baris baru.
- Kunci yang sama dengan nominal atau metode berbeda ditolak dengan `409`.
- `UNIQUE KEY uq_payments_order_idem (sales_order_id, idempotency_key)` menjadi pengaman di
  tingkat database. Perbaikan ini hanya menyentuh jalur pelunasan piutang (FR-18), bukan jalur
  pembayaran order UC-04.

## 3. Role dan hak akses

Berikut adalah allowlist kanonik pada `backend/src/middleware/pageGuard.js`. Pengguna tanpa sesi
diarahkan ke halaman login; pengguna yang login tetapi tidak berhak diarahkan ke dashboard.
Berkas HTML di luar allowlist tidak disajikan.

| Halaman | UI | Role yang diizinkan |
|---|---|---|
| `/pages/login.html` | UI-01 | Publik; pengguna yang sudah login diarahkan ke dashboard |
| `/pages/dashboard.html` | UI-02 | Semua role login |
| `/pages/change-password.html` | UI-03 | Semua role login |
| `/pages/users.html` | UI-04 | ADMIN |
| `/pages/user-form.html` | UI-05 | ADMIN |
| `/pages/sales-order.html` | UI-06 | ADMIN, SALES |
| `/pages/orders.html` | UI-07 | ADMIN, SALES, KASIR |
| `/pages/order-detail.html` | UI-08 | ADMIN, SALES, KASIR |
| `/pages/payment.html` | UI-09 | KASIR |
| `/api/orders/:id/invoice.pdf` | UI-10 | ADMIN, KASIR (bukan halaman HTML) |
| `/pages/products.html` | UI-11 | ADMIN, GUDANG |
| `/pages/product-form.html` | UI-12 | ADMIN |
| `/pages/stock-in.html` | UI-13 | ADMIN, GUDANG |
| `/pages/customers.html` | UI-14 | ADMIN, SALES, KASIR |
| `/pages/customer-form.html` | UI-15 | ADMIN |
| `/pages/receivables.html` | UI-16 dan UI-17 | KASIR; UI-17 adalah modal di dalam halaman ini |
| `/pages/reports.html` | UI-18 | ADMIN |

Ringkasan peran:

- **ADMIN:** mengelola pengguna, master produk, master pelanggan, membatalkan order, melihat laporan,
  serta mengakses halaman inventaris. Tidak diizinkan membuka halaman pembayaran/piutang KASIR.
- **SALES:** membuat dan melihat order, melihat daftar pelanggan, serta memakai form sales order.
- **KASIR:** memproses pembayaran order, melihat/melunasi piutang, mencetak bukti, dan melihat order.
  Halaman form pelanggan dan laporan tidak tersedia untuk peran ini.
- **GUDANG:** melihat produk, mengelola barang masuk, dan melihat dashboard/KPI tanpa angka keuangan.
- **Tamu:** hanya dapat membuka halaman login dan endpoint login.

Matriks role API dapat berbeda dari halaman. Misalnya, `GET /api/receivables` mengizinkan ADMIN dan
KASIR, tetapi halaman `receivables.html` hanya untuk KASIR. Kontrak lengkap ada di
[`docs/API.md`](docs/API.md).

## 4. Teknologi yang digunakan

| Lapisan | Teknologi |
|---|---|
| Backend | Node.js 20 LTS atau lebih baru, Express 4, REST API JSON, pola MVC, CommonJS |
| Database | MySQL 8 / MariaDB, `mysql2/promise`, transaksi InnoDB, `express-mysql-session` |
| Autentikasi | `express-session`, bcrypt cost 10, cookie `HttpOnly` + `SameSite=Strict` |
| Validasi & keamanan | `express-validator`, Helmet/CSP |
| Frontend | HTML5, CSS3, JavaScript ES2020 tanpa framework dan tanpa langkah build |
| PDF | `pdfkit` untuk invoice, bukti pembayaran, dan laporan |
| Pengujian | Jest, Supertest, verifikasi browser Chrome headless di luar repository |

`backend/package.json` menetapkan `engines.node >= 20`. Pengembangan juga terverifikasi pada
Node.js v24.21.0, namun Node.js 20 LTS adalah batas minimum yang didukung.

## 5. Preview aplikasi

Belum ada berkas screenshot atau gambar preview di dalam repository, sehingga README ini tidak
menyertakan gambar. Referensi visual rancangan tersedia secara lokal pada `figma/Export Figma.pdf`,
tetapi berkas PDF tersebut diabaikan oleh Git dan bukan tangkapan layar aplikasi berjalan.

## 6. Struktur folder proyek

```text
DistriFlow\
├── backend\
│   ├── .env.example            # templat variabel lingkungan tanpa nilai asli
│   ├── package.json            # satu-satunya package.json proyek
│   ├── scripts\                # seed:users dan skrip verifikasi DB terisolasi
│   ├── src\
│   │   ├── app.js              # middleware, Page Guard, API, static frontend
│   │   ├── server.js           # test koneksi DB dan app.listen
│   │   ├── config\             # env, db, session
│   │   ├── helpers\            # response, AppError, asyncHandler
│   │   ├── middleware\         # auth, role, page guard, validator
│   │   ├── routes\             # auth, users, catalog, orders, stock-in,
│   │   │                       # receivables, payments, reports, dashboard
│   │   ├── controllers\
│   │   ├── services\
│   │   └── models\
│   └── tests\                  # Jest + Supertest, termasuk DB terisolasi
├── database\
│   ├── 01_schema.sql           # skema baru, termasuk kolom idempotensi pembayaran
│   ├── 02_seed.sql             # data awal/demo
│   ├── 03_payment_idempotency.sql # migrasi sekali jalan untuk database lama
│   └── distriflow_lengkap.sql  # dump gabungan skema + seed
├── docs\                       # API, asumsi, laporan sprint, audit, dan P1
├── frontend(new)\              # FRONTEND AKTIF, dilayani langsung oleh backend
│   ├── css\style.css
│   ├── js\                     # api.js, ui.js, layout.js, js\pages\
│   └── pages\                  # 16 halaman HTML UI-01…UI-18
└── README.md
```

Struktur di atas hanya memuat yang tersedia setelah clone. Folder/berkas lokal berikut **tidak**
termasuk struktur repository dan mungkin tidak ada setelah clone: `frontend/` (cadangan lama),
`figma/` (referensi visual, diabaikan Git), dan `AGENTS.md` (panduan kerja agen, diabaikan Git).

Tidak ada folder `distriflow` bersarang dan tidak ada `package.json` di root. Semua perintah `npm`
dijalankan dari direktori `backend`.

## 7. Prasyarat instalasi

- Node.js 20 LTS atau lebih baru dan npm.
- MySQL 8 atau MariaDB, misalnya melalui Laragon, dengan port `3306` secara default.
- Pengguna database yang dapat membuat database/tabel dan menyisipkan data. Untuk migrasi P1,
  pengguna juga memerlukan hak `ALTER TABLE` dan `ADD INDEX`.
- Plugin autentikasi yang didukung `mysql2`, misalnya `mysql_native_password` atau
  `caching_sha2_password`. Plugin `auth_gssapi_client` tidak didukung.
- Browser modern. Frontend tidak memerlukan build, bundler, atau server terpisah.
- Klien MySQL seperti `mysql` CLI atau HeidiSQL untuk mengimpor berkas SQL.

## 8. Instalasi dependency

Dari root proyek:

```powershell
cd backend
npm install
```

Tidak ada langkah build frontend. Dependensi yang dipakai tercantum di `backend/package.json`;
`pdfkit` sudah termasuk sejak fondasi proyek.

## 9. Konfigurasi environment variable

Salin templat lalu isi nilai lokal Anda:

```powershell
Copy-Item backend\.env.example backend\.env
```

`backend/src/config/env.js` memuat `backend/.env` dan menolak menjalankan aplikasi bila variabel
wajib kosong.

| Variabel | Wajib | Keterangan dari implementasi |
|---|---|---|
| `PORT` | tidak | Port HTTP; default `3000` |
| `NODE_ENV` | tidak | `development`, `test`, atau `production`; default `development` |
| `DB_HOST` | ya | Host database; templat memakai `127.0.0.1` |
| `DB_PORT` | ya | Port database; templat memakai `3306` |
| `DB_USER` | ya | Pengguna database; templat memakai `root` sebagai contoh lokal |
| `DB_PASSWORD` | tidak | Kata sandi database; boleh kosong untuk pengguna lokal tanpa kata sandi |
| `DB_NAME` | ya | Nama database; berkas SQL memakai `distriflow` |
| `SESSION_SECRET` | ya | String acak panjang untuk menandatangani session cookie |
| `SESSION_TABLE_NAME` | tidak | Nama tabel sesi; default `session` |
| `RESTOCK_DAYS` | tidak | Jendela hari rekomendasi restock; default `14` |

Catatan konfigurasi:

- `DB_NAME` harus sama dengan database yang dipakai berkas SQL. Berkas SQL membangun dan memilih
  `distriflow` secara eksplisit.
- Session cookie bernama `distriflow.sid`, berlaku 30 menit, `rolling`, `HttpOnly`, dan
  `SameSite=Strict`. Opsi `secure` aktif hanya saat `NODE_ENV=production`.
- Pada `NODE_ENV=test`, backend memakai `MemoryStore` agar pengujian tidak memerlukan MySQL.
  Pada `development`/`production`, session disimpan di MySQL. Nama tabel diambil dari
  `SESSION_TABLE_NAME` (default `session`) dan `express-mysql-session` dapat membuatnya otomatis.
  Perlu diperhatikan, `01_schema.sql` membuat tabel bernama `sessions` (plural); dengan nilai default,
  store memakai/membuat `session` (singular). Samakan `SESSION_TABLE_NAME=sessions` apabila ingin
  memakai tabel yang dibuat oleh skema.
- `backend/.env` sudah diabaikan Git. Jangan pernah menjadikan nilai aslinya sebagai bagian dari
  dokumentasi, log, atau commit.

## 10. Setup database

Bagian ini sengaja membedakan tiga kondisi. Jangan menjalankan semua perintah di bawah secara
berurutan: pilih prosedur yang sesuai dengan kondisi database Anda.

### 10.1 Instalasi database baru

`database/01_schema.sql`:

- Membuat database `distriflow` bila belum ada.
- Menghapus tabel lama yang bernama sama, lalu membuat tujuh tabel bisnis:
  `users`, `customers`, `products`, `sales_orders`, `sales_order_items`, `payments`, dan
  `stock_movements`.
- Juga membuat tabel `sessions` (plural) untuk store sesi. Perhatikan bahwa default
  `SESSION_TABLE_NAME` pada backend adalah `session` (singular); samakan menjadi `sessions`
  apabila ingin memakai tabel yang dibuat oleh skema ini.
- Sudah memuat `idempotency_key`, `request_hash`, dan `uq_payments_order_idem` pada tabel `payments`.

`database/02_seed.sql` mengisi data awal: empat akun demo (satu per peran), pelanggan, produk,
riwayat order, pembayaran, dan mutasi stok.

Urutan yang benar adalah **`01_schema.sql` lalu `02_seed.sql`**. Gunakan database kosong karena
`01_schema.sql` menghapus tabel yang sudah ada.

PowerShell:

```powershell
# Dari root proyek. Kedua berkas sudah berisi CREATE DATABASE dan USE distriflow.
Get-Content database\01_schema.sql -Raw -Encoding UTF8 |
  mysql -h 127.0.0.1 -P 3306 -u NAMA_PENGGUNA -p
Get-Content database\02_seed.sql -Raw -Encoding UTF8 |
  mysql -h 127.0.0.1 -P 3306 -u NAMA_PENGGUNA -p
```

Pada Command Prompt, bentuk setara adalah:

```cmd
mysql -h 127.0.0.1 -P 3306 -u NAMA_PENGGUNA -p < database\01_schema.sql
mysql -h 127.0.0.1 -P 3306 -u NAMA_PENGGUNA -p < database\02_seed.sql
```

Alternatif HeidiSQL: jalankan `01_schema.sql` lebih dulu, baru `02_seed.sql`.

**Jangan jalankan `03_payment_idempotency.sql` setelah `01_schema.sql` pada instalasi baru.**
Kolom dan kunci unik sudah ada di skema, sehingga menjalankan migrasi akan gagal atau berisiko
menggandakan objek.

Untuk sementara, **jangan pakai `database/distriflow_lengkap.sql` sebagai alternatif instalasi
baru** sebelum versi yang tersedia di GitHub dipastikan memiliki skema P1 yang benar. Versi pada
working tree sudah memuat kolom dan kunci idempotensi, tetapi versi di GitHub belum diverifikasi.
Untuk instalasi baru, gunakan **`01_schema.sql` lalu `02_seed.sql`** sampai verifikasi selesai.

### 10.2 Database existing sebelum perbaikan P1

Gunakan prosedur ini hanya bila database Anda dibuat sebelum perbaikan P1 dan tabel `payments`
**belum** memiliki kolom idempotensi.

`database/03_payment_idempotency.sql` berfungsi sekali saja untuk:

- Menambah `idempotency_key VARBINARY(512) NULL`.
- Menambah `request_hash BINARY(32) NULL`.
- Menambah `UNIQUE KEY uq_payments_order_idem (sales_order_id, idempotency_key)`.

Migrasi tidak menambah tabel baru, tidak menghapus data, dan tidak meng-backfill baris lama; baris
existing tetap bernilai `NULL` pada dua kolom baru.

Sebelum menjalankan migrasi, periksa metadatabase berikut (sesuaikan `'distriflow'` dengan
`DB_NAME` Anda):

```sql
SELECT COLUMN_NAME
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'distriflow'
  AND TABLE_NAME = 'payments'
  AND COLUMN_NAME IN ('idempotency_key', 'request_hash');

SELECT CONSTRAINT_NAME
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'distriflow'
  AND TABLE_NAME = 'payments'
  AND CONSTRAINT_TYPE = 'UNIQUE'
  AND CONSTRAINT_NAME = 'uq_payments_order_idem';
```

Artinya:

- Kedua kolom dan kunci unik sudah tampil → database sudah termigrasi. **Jangan jalankan `03`.**
- Keduanya tidak tampil → jalankan migrasi **satu kali**.
- Hanya sebagian yang tampil → hentikan dan periksa manual; jangan menjalankan migrasi tanpa pemeriksaan.

Setelah backup dan persetujuan penerapan, jalankan:

```powershell
Get-Content database\03_payment_idempotency.sql -Raw -Encoding UTF8 |
  mysql -h 127.0.0.1 -P 3306 -u NAMA_PENGGUNA -p distriflow
```

Urutan deploy untuk database lama adalah **migrasi terlebih dahulu, baru menjalankan kode backend
terbaru**. Kode pelunasan mengira kedua kolom sudah ada; tanpa migrasi, endpoint akan gagal dengan
kolom tidak ditemukan.

Jangan menjalankan `01_schema.sql` pada database existing karena berkas tersebut menghapus dan
membuat ulang tabel.

### 10.3 Database demo/seed

Data demo tersedia di `database/02_seed.sql`. Untuk instalasi baru, data ini sudah masuk setelah
langkah 10.1, sehingga tidak perlu dijalankan ulang. Jangan mengimpor ulang seed ke database yang
sudah dipakai karena dapat menimpa atau menggandakan data.

Kredensial awal demo tercantum pada berkas seed; README sengaja tidak menyalinnya. Password
disimpan sebagai hash bcrypt, dan API tidak pernah mengembalikan hash tersebut.

`npm run seed:users` hanya mencetak pernyataan `INSERT` dengan hash bcrypt baru ke konsol. Perintah
itu tidak menulis ke database dan tidak mengubah berkas seed.

## 11. Menjalankan backend

Dari direktori `backend`:

```powershell
npm run dev    # nodemon, untuk pengembangan
npm start      # node src/server.js
```

Server memakai `PORT` dari `.env`, default `3000`. Saat koneksi database berhasil, konsol
menampilkan `[DB] Koneksi MySQL berhasil`, diikuti alamat aplikasi.

Backend sekaligus melayani aset frontend dari `frontend(new)`; tidak perlu menjalankan server
terpisah untuk frontend.

## 12. Membuka aplikasi di browser

Gunakan alamat `http://localhost:<PORT>`, atau `http://localhost:3000` bila port tidak diubah.

| URL | Keterangan |
|---|---|
| `http://localhost:3000/` | Redirect ke login bila guest, ke dashboard bila sudah login |
| `http://localhost:3000/pages/login.html` | UI-01 Login |
| `http://localhost:3000/pages/dashboard.html` | UI-02 Dashboard + KPI |
| `http://localhost:3000/pages/change-password.html` | UI-03 Ganti Password |
| `http://localhost:3000/pages/users.html` | UI-04 Daftar Pengguna |
| `http://localhost:3000/pages/user-form.html` | UI-05 Form Pengguna |
| `http://localhost:3000/pages/sales-order.html` | UI-06 Sales Order Baru |
| `http://localhost:3000/pages/orders.html` | UI-07 Daftar Sales Order |
| `http://localhost:3000/pages/order-detail.html?id=1` | UI-08 Detail Order |
| `http://localhost:3000/pages/payment.html?id=1` | UI-09 Pembayaran |
| `http://localhost:3000/pages/products.html` | UI-11 Daftar Barang |
| `http://localhost:3000/pages/product-form.html` | UI-12 Form Barang |
| `http://localhost:3000/pages/stock-in.html` | UI-13 Barang Masuk |
| `http://localhost:3000/pages/customers.html` | UI-14 Daftar Pelanggan |
| `http://localhost:3000/pages/customer-form.html` | UI-15 Form Pelanggan |
| `http://localhost:3000/pages/receivables.html` | UI-16 Piutang dan UI-17 modal pelunasan |
| `http://localhost:3000/pages/reports.html` | UI-18 Laporan Penjualan |
| `http://localhost:3000/api/orders/1/invoice.pdf?format=a4` | UI-10 Invoice PDF |

Invoice dapat memakai `format=a4` atau `format=80mm`. Endpoint PDF mengembalikan berkas
`application/pdf`, bukan JSON.

## 13. Lint dan test

Jalankan dari direktori `backend`:

```powershell
npm run lint   # eslint src tests scripts --ext .js
npm test       # jest --runInBand
```

Perintah tersebut berasal langsung dari `backend/package.json`. Hasil yang tercatat pada laporan
terakhir:

- `npm run lint`: lolos tanpa error.
- `npm test -- --silent`: **24 suite / 366 test lolos** setelah perbaikan P1.
- Sebelum P1, laporan Sprint 3 mencatat 22 suite / 354 test lolos.
- Integrasi database isolasi dan verifikasi browser memakai database buangan yang dibuat dan
  dihapus otomatis, bukan database utama.

Jika menambah atau mengubah JavaScript, jalankan juga `node --check` pada berkas terkait.
`npm run lint` hanya mencakup backend sesuai konvensi proyek.

## 14. Dokumentasi API dan referensi proyek

- [`docs/API.md`](docs/API.md) — 36 endpoint aktif, kontrak request/response, role, dan pesan error.
- [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md) — keputusan bisnis yang disetujui dan batasan v1.0.
- [`docs/SPRINT_1_REPORT.md`](docs/SPRINT_1_REPORT.md) — hasil Sprint 1.
- [`docs/SPRINT_2_PLANNING.md`](docs/SPRINT_2_PLANNING.md) — planning Sprint 2.
- [`docs/SPRINT_2_FINAL_REPORT.md`](docs/SPRINT_2_FINAL_REPORT.md) — hasil Sprint 2.
- [`docs/SPRINT3_IMPLEMENTATION_REPORT.md`](docs/SPRINT3_IMPLEMENTATION_REPORT.md) — ruang lingkup dan hasil Sprint 3.
- [`docs/SPRINT3_TEST_REPORT.md`](docs/SPRINT3_TEST_REPORT.md) — pengujian Sprint 3 yang benar-benar dijalankan.
- [`docs/SPRINT3_BACKEND_CHANGELOG.md`](docs/SPRINT3_BACKEND_CHANGELOG.md) — perubahan backend per lapisan.
- [`docs/SPRINT3_PROGRESS.md`](docs/SPRINT3_PROGRESS.md) — progres akhir Sprint 3.
- [`docs/P1_FIX_REPORT.md`](docs/P1_FIX_REPORT.md) — analisis, perubahan, dan verifikasi perbaikan P1.
- [`docs/FINAL_VERIFICATION_AUDIT.md`](docs/FINAL_VERIFICATION_AUDIT.md) — audit sebelum perbaikan P1.
- [`docs/UI_COMPLETION_REPORT.md`](docs/UI_COMPLETION_REPORT.md) — catatan historis penyelesaian UI-06…UI-18.

Dokumen kebutuhan, rancangan, manual pengguna, dan referensi Figma tersedia secara lokal sebagai
PDF di root proyek serta folder `figma/`. Berkas PDF tersebut diabaikan oleh Git.

## 15. Catatan penting dan batasan

### Migrasi dan data

- `03_payment_idempotency.sql` ditujukan hanya untuk database existing pra-P1. Jalankan sekali,
  setelah backup/persetujuan, dan jangan ulangi pada database yang sudah memiliki kolom/kunci.
- Instalasi baru memakai `01_schema.sql` + `02_seed.sql`; keduanya sudah memuat struktur P1.
- Jangan mengimpor ulang `01_schema.sql` atau `02_seed.sql` ke database yang sudah dipakai.
- Data demo di repository bukan data produksi. Jangan menaruh kredensial, hash, token, atau isi
  `.env` ke dalam dokumentasi maupun commit.

### Fitur yang tersedia dengan batasan

- Pembatalan order sudah tersedia untuk ADMIN pada order `DRAFT` dan `PIUTANG`. Pengembalian stok
  hanya terjadi untuk `PIUTANG`; uang muka diselesaikan manual di luar sistem.
- Ubah order tidak tersedia. Pengguna tidak dapat dihapus permanen, hanya dinonaktifkan.
- Field `note` barang masuk divalidasi oleh API tetapi belum dipersistenkan karena tabel
  `stock_movements` belum memiliki kolom `note` (keterbatasan skema). Lihat
  [`docs/SPRINT3_IMPLEMENTATION_REPORT.md`](docs/SPRINT3_IMPLEMENTATION_REPORT.md).
- Filter dan kartu ringkas risiko pada daftar piutang dihitung dari halaman yang sedang dimuat;
  label `risk` per baris berasal dari backend.
- FR-22 memakai label `Aman`/`Berisiko`, bukan `risk_score`/`risk_label` numerik.
- PDF dihasilkan dari data nyata, tetapi viewer PDF Chrome headless dapat mengembalikan `204`;
  ini keterbatasan alat uji, bukan kegagalan endpoint.
- Idempotensi P1 berlaku pada `POST /api/receivables/:id/pay`. Jalur `POST /api/orders/:id/payments`
  tidak diubah.

### Di luar cakupan v1.0

Belum diimplementasikan: Purchase Order/master pemasok, ekspor XLSX, kategori/rak/lokasi rak,
valuasi persediaan, DSI, notifikasi WhatsApp/SMS, auto-lock faktur, Faktur Hold 50%, PPN,
surat jalan otomatis, cetak barcode, ganti password wajib saat login pertama, rotasi password 90 hari,
shortcut F2/F4/F9 sebagai fitur wajib, ID audit, dan label “DATA FINAL”.

Folder `frontend/` dapat ada sebagai cadangan lokal, tetapi bukan bagian dari struktur kloning dan
bukan frontend aktif; backend melayani `frontend(new)`. Allowlist Page Guard hanya memuat 16 halaman
yang tercantum pada bagian 3.

Panduan kerja `AGENTS.md` bersifat lokal (diabaikan Git) dan mungkin tidak ada setelah clone. Versi
lokalnya masih memuat status lama yang menyebut Sprint 2/3 belum dikerjakan dan folder `frontend/`
sebagai struktur aktif. Status pada README ini mengikuti implementasi aktual pada `main` serta
laporan Sprint 3 dan P1.
