# DistriFlow

Sistem penjualan, invoice, dan piutang untuk satu distributor dengan satu gudang.

Dokumen ini merupakan panduan teknis singkat untuk instalasi, konfigurasi, dan penggunaan aplikasi DistriFlow.

**Status saat ini:** Sprint 0 dan Sprint 1 selesai. Sprint 2 (UC-03 dan UC-04) sudah diimplementasikan;
status per task dan hasil verifikasi ada di [`docs/SPRINT_2_FINAL_REPORT.md`](docs/SPRINT_2_FINAL_REPORT.md).
Sprint 3 belum dikerjakan.

## 1. Tujuan dan ruang lingkup

DistriFlow versi 1.0 ditujukan untuk satu distributor dengan satu gudang di Bandung.
Ruang lingkup yang sudah tersedia sekarang:

- **Sprint 0:** fondasi proyek, schema dan seed basis data, koneksi MySQL, konfigurasi session,
  header keamanan, serta kerangka pengujian.
- **Sprint 1:** autentikasi, manajemen pengguna, Page Guard/otorisasi API, dan frontend UI-01…UI-05.
- **Sprint 2:** katalog read-only, sales order DRAFT, daftar/detail order, pembayaran tunai/kredit,
  invoice PDF, frontend UI-06…UI-09, dan dokumentasi API yang diperbarui.

UC-01 (manajemen master), UC-05/UC-06 (pelunasan piutang), UC-07 (laporan/KPI), Purchase Order,
dan fitur Sprint 3 lainnya **belum diimplementasikan**. FR-09 (pembatalan order) dan FR-22
(`risk_score`/`risk_label`) juga ditunda ke Sprint 3. Batasan versi 1.0 tercatat di
[`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md).

## 2. Teknologi yang digunakan

| Lapisan | Teknologi |
|---|---|
| Backend | Node.js 20 LTS atau lebih baru, Express 4, REST API JSON, pola MVC |
| Database | MySQL 8 / MariaDB, `mysql2/promise`, `express-mysql-session` |
| Autentikasi | `express-session`, bcrypt (cost 10), cookie `HttpOnly` + `SameSite=Strict` |
| Validasi & keamanan | `express-validator`, Helmet/CSP |
| Frontend | HTML5, CSS3, JavaScript ES2020 tanpa framework |
| Pengujian | Jest, Supertest, Chrome headless (verifikasi manual, di luar project) |

Node.js yang terpakai saat pengembangan terverifikasi v24.21.0; kode ditulis kompatibel dengan Node.js 20 LTS.

## 3. Struktur direktori

```text
DistriFlow\
├── docs\
│   ├── ASSUMPTIONS.md          # keputusan yang sudah disetujui + batasan v1.0
│   ├── API.md                  # kontrak endpoint aktual Sprint 1 + Sprint 2
│   ├── SPRINT_1_REPORT.md      # laporan hasil Sprint 1
│   ├── SPRINT_2_PLANNING.md    # planning dan keputusan Sprint 2
│   └── SPRINT_2_FINAL_REPORT.md # laporan akhir Sprint 2
├── database\
│   ├── 01_schema.sql           # tepat 7 tabel bisnis
│   └── 02_seed.sql             # data kanonik, termasuk 4 akun demo
├── backend\
│   ├── .env.example            # template variabel lingkungan (tanpa credential asli)
│   ├── package.json
│   ├── scripts\seed-users.js   # mencetak hash bcrypt akun demo
│   ├── src\
│   │   ├── app.js, server.js
│   │   ├── config\             # env, db, session
│   │   ├── helpers\            # response, AppError, asyncHandler
│   │   ├── middleware\         # auth, role, page guard, validate, validators
│   │   ├── routes\             # auth, users, customers, products, orders, payments, invoice, index
│   │   ├── controllers\
│   │   ├── services\           # termasuk orderService, paymentService, pdfService, invoiceService
│   │   └── models\             # termasuk customerModel, productModel, orderModel, paymentModel
│   └── tests\
├── frontend\
│   ├── css\style.css
│   ├── js\                     # api, ui, dan skrip UI-01…UI-09
│   └── pages\                  # login, dashboard, change-password, users, user-form,
│                               # sales-order, orders, order-detail, payment
```

Tidak ada folder `distriflow` bersarang. Semua path di atas relatif terhadap root `DistriFlow`.

## 4. Prasyarat instalasi

- Node.js 20 LTS atau lebih baru dan npm.
- MySQL 8 atau MariaDB melalui Laragon, berjalan pada port `3306` (sesuaikan dengan `.env`).
- Pengguna database dengan hak `CREATE DATABASE`, `CREATE TABLE`, dan `INSERT`.
- Pengguna database dengan plugin autentikasi `mysql_native_password` atau `caching_sha2_password`.
  Plugin `auth_gssapi_client` tidak didukung oleh `mysql2`.
- Browser modern untuk mengakses frontend. Tidak ada langkah build frontend.

## 5. Instalasi dependency

Jalankan dari folder `backend` (tidak ada `package.json` di root):

```powershell
cd backend
npm install
```

Tidak ada dependency baru yang ditambahkan pada Sprint 1 maupun Sprint 2. `pdfkit` sudah terpasang
sejak fondasi dan dipakai untuk invoice PDF.

## 6. Konfigurasi environment variable

Salin template, lalu isi nilai lokal Anda:

```powershell
Copy-Item backend\.env.example backend\.env
```

| Variabel | Wajib | Keterangan |
|---|---|---|
| `PORT` | tidak | Port HTTP aplikasi, default `3000` |
| `NODE_ENV` | tidak | `development`, `test`, atau `production`; default `development` |
| `DB_HOST` | ya | Host database, contoh `127.0.0.1` |
| `DB_PORT` | ya | Port database, contoh `3306` |
| `DB_USER` | ya | Pengguna database |
| `DB_PASSWORD` | tidak | Kata sandi database; boleh kosong untuk pengguna lokal tanpa password |
| `DB_NAME` | ya | Nama database aplikasi, contoh `distriflow` |
| `SESSION_SECRET` | ya | String acak panjang untuk penandatanganan cookie |
| `SESSION_TABLE_NAME` | tidak | Nama tabel sesi, default `session` |
| `RESTOCK_DAYS` | tidak | Jendela hari rekomendasi restock (FR-21), default `14` |

`backend/.env` **jangan pernah di-commit atau dibagikan**. Hanya `backend/.env.example` yang boleh
disimpan di repository; nilai asli tidak ditampilkan dalam dokumentasi ini maupun laporan pengujian.

## 7. Setup database Laragon/MariaDB

1. Pastikan layanan MySQL/MariaDB di Laragon sudah berjalan.
2. Impor schema, lalu seed (urutan penting):

   ```powershell
   mysql -h 127.0.0.1 -P 3306 -u <DB_USER> -p < database\01_schema.sql
   mysql -h 127.0.0.1 -P 3306 -u <DB_USER> -p < database\02_seed.sql
   ```

   Alternatif: buka HeidiSQL, pilih file SQL tersebut, lalu jalankan secara berurutan.
3. `01_schema.sql` membuat **tepat 7 tabel bisnis**: `users`, `customers`, `products`,
   `sales_orders`, `sales_order_items`, `payments`, `stock_movements`.
4. Tabel sesi **tidak** ditulis di schema. `express-mysql-session` membuatnya otomatis saat aplikasi
   pertama kali berjalan, dengan nama dari `SESSION_TABLE_NAME` (default `session`).
5. Verifikasi koneksi dengan menjalankan backend; pesan `[DB] Koneksi MySQL berhasil` akan tampil
   bila konfigurasi benar.

Jangan menghapus, mereset, atau mengimpor ulang seed pada database yang sudah dipakai tanpa persetujuan,
karena dapat menghilangkan perubahan data pengguna.

## 8. Cara menjalankan seed

Data seed sudah termasuk 4 akun demo di `database/02_seed.sql`, sehingga tidak perlu dijalankan ulang
untuk penggunaan normal.

`npm run seed:users` **hanya mencetak pernyataan `INSERT` dengan hash bcrypt baru** ke konsol;
perintah ini tidak menulis ke database dan tidak mengubah `02_seed.sql`. Gunakan keluaran tersebut
manual hanya bila hash demo perlu diganti.

```powershell
cd backend
npm run seed:users
```

## 9. Cara menjalankan backend

```powershell
cd backend
npm run dev    # dengan nodemon, untuk pengembangan
npm start      # tanpa nodemon
```

Server berjalan pada `http://localhost:3000` secara default, atau menggunakan port yang ditentukan melalui `.env`.

Backend juga melayani file frontend dari folder `frontend`, jadi frontend tidak memerlukan server terpisah.

## 10. Cara menjalankan lint dan test

```powershell
cd backend
npm run lint   # ESLint untuk src, tests, dan scripts
npm test       # Jest + Supertest, --runInBand
```

Hasil verifikasi terakhir Sprint 2: `npm run lint` exit 0, `npm test` **21 suite / 288 test lolos**,
`node --check` **78 file / 0 gagal**, integrasi MariaDB pada database isolasi **10/10 checks lolos**,
dan browser headless aplikasi asli **111/111 checks lolos**. Rincian endpoint, peran, transaksi,
stok, dan invoice tercatat di
[`docs/SPRINT_2_FINAL_REPORT.md`](docs/SPRINT_2_FINAL_REPORT.md).

Perintah yang wajib dijalankan sebelum menutup sprint: `npm run lint`, `npm test`, dan `node --check`
untuk file JavaScript yang dibuat/diubah.

## 11. URL aplikasi lokal
URL berikut menggunakan port default `3000`. Jika nilai `PORT` pada `.env` berbeda, sesuaikan port pada URL.

| URL | Keterangan |
|---|---|
| `http://localhost:3000/` | Redirect ke login bila belum login, atau ke dashboard bila sudah login |
| `http://localhost:3000/pages/login.html` | UI-01 Login (publik) |
| `http://localhost:3000/pages/dashboard.html` | UI-02 Dashboard (semua role login) |
| `http://localhost:3000/pages/change-password.html` | UI-03 Ganti Password (semua role login) |
| `http://localhost:3000/pages/users.html` | UI-04 Daftar Pengguna (khusus ADMIN) |
| `http://localhost:3000/pages/user-form.html` | UI-05 Form Tambah/Ubah Pengguna (khusus ADMIN) |
| `http://localhost:3000/pages/sales-order.html` | UI-06 Sales Order Baru (ADMIN, SALES) |
| `http://localhost:3000/pages/orders.html` | UI-07 Daftar Sales Order (ADMIN, SALES, KASIR) |
| `http://localhost:3000/pages/order-detail.html?id=1` | UI-08 Detail Sales Order (ADMIN, SALES, KASIR) |
| `http://localhost:3000/pages/payment.html?id=1` | UI-09 Pembayaran (khusus KASIR) |
| `http://localhost:3000/api/...` | REST API; daftar lengkap di [`docs/API.md`](docs/API.md) |

Halaman di luar allowlist Page Guard tidak disajikan. Pengujian integrasi memakai database isolasi
sementara agar data seed dan sesi asli tidak berubah.

## 12. Akun demo

Berdasarkan `backend/scripts/seed-users.js` dan `database/02_seed.sql`:

| Username | Peran | Nama |
|---|---|---|
| `devrosan` | ADMIN | Devrosan |
| `raihan` | SALES | Raihan Haryo |
| `zuriel` | KASIR | Zuriel Egan |
| `jeki` | GUDANG | Jeki |


Password disimpan sebagai hash bcrypt cost 10, bukan teks biasa, dan tidak pernah dikembalikan oleh API.

## 13. Status pengerjaan

- **Sprint 0 selesai:** setup proyek, schema/seed, koneksi database, session store, keamanan awal, testing.
- **Sprint 1 selesai:** Task 1.1 Foundation; 1.2 Authentication Backend; 1.3 User Management Backend;
  1.4 Page Guard dan API Authorization; 1.5 Authentication Frontend (UI-01…UI-03);
  1.6 User Management Frontend (UI-04…UI-05); 1.7 Complete Testing & Manual Verification;
  1.8 Documentation & Sprint 1 Report.
- **Sprint 2 terimplementasi:** Task 2.1 katalog, 2.3 sales order, 2.4 daftar/detail order,
  2.6 pembayaran, 2.7 invoice PDF, 2.8 Page Guard/navigasi, 2.9…2.11 frontend UI-06…UI-09,
  dan 2.12 pengujian/dokumentasi. FR-09 dan FR-22 tetap ditunda ke Sprint 3.
- Rincian hasil Sprint 1 ada di [`docs/SPRINT_1_REPORT.md`](docs/SPRINT_1_REPORT.md);
  status dan temuan Sprint 2 ada di [`docs/SPRINT_2_FINAL_REPORT.md`](docs/SPRINT_2_FINAL_REPORT.md).

## 14. Batasan versi 1.0

Tidak diimplementasikan pada v1.0: Purchase Order/modul pengadaan, manajemen armada pengiriman,
integrasi WhatsApp/SMS, ekspor Excel, cetak barcode, valuasi persediaan dan DSI, kategori/rak/lokasi
rak yang mengubah schema, PPN, Faktur Hold 50%, password wajib diganti saat login pertama, rotasi
password 90 hari, shortcut F2/F4/F9 sebagai fitur wajib, dan surat jalan otomatis.

Dashboard Sprint 1 sengaja belum memuat KPI; KPI direncanakan pada Sprint 3.
Daftar keputusan lengkap ada di [`docs/ASSUMPTIONS.md`](docs/ASSUMPTIONS.md).

Dokumentasi tambahan:

- [`docs/API.md`](docs/API.md) — kontrak endpoint yang benar-benar tersedia.
- [`docs/SPRINT_1_REPORT.md`](docs/SPRINT_1_REPORT.md) — laporan hasil Sprint 1.
- [`docs/SPRINT_2_PLANNING.md`](docs/SPRINT_2_PLANNING.md) — planning dan keputusan Sprint 2.
- [`docs/SPRINT_2_FINAL_REPORT.md`](docs/SPRINT_2_FINAL_REPORT.md) — laporan akhir Sprint 2.
