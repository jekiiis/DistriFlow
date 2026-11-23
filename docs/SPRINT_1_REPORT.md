# DistriFlow — Laporan Sprint 1

Sprint 1: **Authentication, User Management, Page Guard/API Authorization, Frontend UI-01…UI-05,
Complete Testing & Manual Verification, dan Documentation**.
Dokumen ini adalah ringkasan hasil, bukan dokumen kebutuhan. Rujukan kebutuhan tetap SKPL-DF-001 Revisi C
dan DPPL-DF-001 Revisi C.

## A. Ringkasan

Tujuan Sprint 1 adalah menyediakan fondasi fitur yang dapat dipakai pengguna sebelum fitur transaksi
bisnis dibangun: pengguna dapat login, mengganti password, melihat sesinya, dan logout; Administrator
dapat mengelola akun pengguna; halaman dan endpoint dilindungi oleh otorisasi server; serta seluruh
perubahan diverifikasi dengan lint, test otomatis, integrasi database nyata, dan browser headless.

Hasil akhir: **Sprint 1 selesai**. Delapan endpoint API tersedia dan terdokumentasi di
[`docs/API.md`](API.md). Seluruh pengujian yang dilaporkan lolos. Dua bug nyata ditemukan dan diperbaiki
pada Task 1.7 tanpa mengubah kontrak API maupun business rules. Sprint 2 dan Sprint 3 **belum
dimulai**, sehingga tidak ada klaim bahwa fitur UC-01…UC-07 sudah tersedia.

## B. Ruang Lingkup

| Task | Status | Cakupan |
|---|---|---|
| 1.1 Foundation | Selesai | Konvensi proyek, struktur lapisan, helper respons/error, konfigurasi lingkungan |
| 1.2 Authentication Backend | Selesai | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, `PUT /api/auth/password`, bcrypt, lockout, session store |
| 1.3 User Management Backend | Selesai | `GET /api/users`, `GET /api/users/:id`, `POST /api/users`, `PUT /api/users/:id`, filter/paginasi, last-admin protection |
| 1.4 Page Guard dan API Authorization | Selesai | Allowlist 5 halaman, `requireLogin`, `requireRole('ADMIN')` |
| 1.5 Authentication Frontend | Selesai | UI-01 Login, UI-02 Dashboard, UI-03 Ganti Password |
| 1.6 User Management Frontend | Selesai | UI-04 Daftar Pengguna, UI-05 Form Tambah/Ubah Pengguna |
| 1.7 Complete Testing & Manual Verification | Selesai | Lint, 8 suite test, integrasi MariaDB asli, Chrome headless, perbaikan 2 bug |
| 1.8 Documentation & Sprint 1 Report | Selesai | README, AGENTS, ASSUMPTIONS, API, laporan ini |

Di luar ruang lingkup Sprint 1 (dan masih belum dikerjakan): seluruh use case bisnis UC-01…UC-07,
KPI dashboard, modul transaksi/pembayaran/stok/piutang, dan fitur Sprint 3 lainnya.

## C. Implementasi

### Backend

- **Struktur:** `routes → middleware → controllers → services → models`, dengan helper `response.js`,
  `AppError.js`, `asyncHandler.js`, dan `config/{env,db,session}.js`.
- **API:** tepat 8 endpoint seperti tercantum di [`docs/API.md`](API.md); router `/api/auth` dan
  `/api/users`, dengan fallback `404` berformat JSON untuk endpoint tak dikenal.
- **Database:** `mysql2/promise`, `pool.execute()` dengan placeholder `?`, `getExecutor(connection)`
  untuk transaksi, dan `withTransaction()` untuk operasi multi-langkah.
- **Error handling:** `AppError` untuk error aman dengan `statusCode`; error di luar kelas itu
  menjadi `500` dengan pesan generik; validasi memakai `express-validator` + `validate`.

### Database integration

- `database/01_schema.sql` berisi tepat 7 tabel bisnis sesuai DPPL 3.4; tabel sesi dibuat otomatis
  oleh `express-mysql-session` dan tidak dihitung sebagai tabel bisnis.
- `database/02_seed.sql` memuat data kanonik dan 4 akun demo dengan hash bcrypt cost 10.
- Backend memakai MySQL 8 / MariaDB. Verifikasi Task 1.7 memakai MariaDB `12.1.2-MariaDB`, database
  sementara `test_verify_*` hasil salinan schema+seed, lalu dihapus. Database aplikasi `distriflow`
  tidak dimutasi.

### Authentication

- Login mencocokkan password dengan bcrypt cost 10, menolak akun nonaktif dan akun terkunci,
  mengatur lockout 5 menit setelah 5 kegagalan, serta mereset Attempt gagal saat login berhasil.
- Session ID diregenerasi setelah login; logout menghancurkan sesi dan menghapus cookie
  `distriflow.sid`; ganti password mempertahankan sesi aktif.
- Cookie memakai `HttpOnly`, `SameSite=Strict`, `rolling: true`, idle window 30 menit, dan `secure`
  hanya pada production.

### User management

- Daftar pengguna dengan pencarian (`q`/`search`), filter `role`, filter `is_active`, halaman
  (`page`/`limit`, maksimal 100 per halaman), dan urutan `name ASC, id ASC`.
- Pembuatan pengguna: pengguna baru selalu aktif; username unik dan tanpa spasi; password 8–72 byte
  UTF-8 di-hash bcrypt cost 10.
- Pembaruan pengguna: `username` immutable; perubahan peran/status/password tervalidasi; transaksi
  mengunci baris target dan Admin aktif; penonaktifan/reset password menghapus sesi target;
  reset password tidak membuka lockout; Admin aktif terakhir dilindungi dengan HTTP `409`.

### Page Guard dan otorisasi API

- Allowlist kanonik tepat 5 halaman: `login.html` publik, `dashboard.html` dan
  `change-password.html` untuk semua role login, `users.html` dan `user-form.html` khusus ADMIN.
- Page Guard berjalan sebelum `express.static` agar HTML terlindungi tidak bisa diambil langsung.
- Guest diarahkan ke login; role non-ADMIN diarahkan ke dashboard. API memakai `requireLogin` dan
  `requireRole('ADMIN')` sebagai penentu hak akses, bukan frontend.

### Frontend UI-01…UI-05

| UI | File | Fungsi |
|---|---|---|
| UI-01 | `frontend/pages/login.html`, `frontend/js/login.js` | Form login, pesan error, redirect setelah login |
| UI-02 | `frontend/pages/dashboard.html`, `frontend/js/dashboard.js` | Dashboard dasar tanpa KPI, identitas pengguna, navigasi, logout |
| UI-03 | `frontend/pages/change-password.html`, `frontend/js/change-password.js` | Ganti password dengan konfirmasi |
| UI-04 | `frontend/pages/users.html`, `frontend/js/users.js` | Daftar pengguna, pencarian/filter, paginasi, aksi nonaktifkan/reset |
| UI-05 | `frontend/pages/user-form.html`, `frontend/js/user-form.js` | Tambah/ubah pengguna, status disembunyikan saat Tambah |

Frontend memakai HTML/CSS/JavaScript tanpa framework dan tidak memerlukan langkah build.
Data API dirender dengan `textContent`, bukan `innerHTML`.

## D. Hasil Pengujian

Angka berikut adalah hasil aktual Task 1.7:

| Pengujian | Perintah / metode | Hasil |
|---|---|---|
| Lint | `npm run lint` di `backend` | **exit code 0** |
| Unit & kontrak API | `npm test` (Jest + Supertest, `--runInBand`) | **8 suite, 131/131 test lolos** |
| Integrasi MariaDB asli | Harness di luar project, database isolasi `test_verify_*` dari salinan schema+seed | **128/128 checks lolos** |
| Browser aplikasi asli | Chrome headless terhadap aplikasi berjalan | **51/51 checks lolos** |

Rincian lingkungan verifikasi:

- MariaDB `12.1.2-MariaDB` digunakan untuk integrasi; database sementara dihapus setelah pengujian.
- Pengujian browser dijalankan terhadap aplikasi asli (bukan mock) dengan Chrome headless.
- File harness verifikasi berada di luar folder project, di `C:\Users\fadhi\AppData\Local\Temp\opencode\uiprobe\`.
- Tidak ada credential, `SESSION_SECRET`, atau hash yang dicetak pada laporan pengujian.
- Suite test mencakup `authService`, `userService`, `helpers`, `response`, `transaction`,
  `pageGuard`, `pageRoutes`, dan `security`.

## E. Bug dan Perbaikan

Kedua bug ditemukan saat verifikasi Task 1.7 dan diperbaiki tanpa mengubah kontrak API, response,
atau business rules. Test regression ditambahkan agar tidak kembali muncul.

### Bug 1 — Filter `is_active=false` tidak bekerja

- **Gejala:** `GET /api/users?is_active=false` mengembalikan semua pengguna, termasuk yang aktif.
- **Penyebab:** filter status memakai sentinel string kosong. Di MySQL/MariaDB, perbandingan
  `0 = ''` bernilai benar, sehingga kondisi "tanpa filter" terpenuhi ketika nilai filter `0`
  dan filter status dinonaktifkan.
- **Perbaikan:** `buildUserFilters()` memakai sentinel `NULL` untuk "tanpa filter" dan menuliskan
  `(? IS NULL OR is_active = ?)`. Nilai `false` dikonversi menjadi `0`, sehingga hanya baris
  dengan `is_active = 0` yang dikembalikan. Parameter tetap terikat (`?`), bukan konkatenasi.
- **Dampak:** kontrak request/response tidak berubah; hanya hasil filter yang sekarang benar.

### Bug 2 — Lockout terjadi pada percobaan keempat, bukan kelima

- **Gejala:** akun terkunci setelah 4 password salah, dan `failed_attempts` tidak pernah direset
  ke 0 saat kunci terpasang.
- **Penyebab:** `UPDATE users` dengan beberapa assignment dievaluasi kiri ke kanan. Assignment
  `failed_attempts = failed_attempts + 1` berubah lebih dulu sehingga kondisi pada assignment
  `locked_until` berikutnya membaca nilai yang sudah ter-update dan mencapai ambang lebih awal.
- **Perbaikan:** kedua assignment kini menghitung `failed_attempts + 1` secara eksplisit dari nilai
  lama, sehingga kunci terpasang tepat pada percobaan kelima dan `failed_attempts` dikembalikan ke 0.
  Komentar di `userModel.js` mendokumentasikan alasan urutan evaluasi ini.
- **Dampak:** business rules tetap "5 kegagalan → lock 5 menit"; hanya waktu penerapan kunci
  yang diperbaiki agar sesuai aturan.

## F. Keamanan

- **Authentication:** bcrypt cost 10; password tidak pernah dikembalikan API atau ditulis ke log;
  username tidak ditemukan dan password salah memakai pesan generik yang sama.
- **Session:** disimpan di MySQL dengan `express-mysql-session`; cookie `HttpOnly` + `SameSite=Strict`,
  `secure` di production, `rolling: true`, idle 30 menit; regeneration setelah login; destroy saat
  logout; sesi target dihapus saat deaktivasi/reset password.
- **Query:** seluruh SQL memakai placeholder `?` melalui `pool.execute()`/`getExecutor()`.
  Nama tabel sesi berasal dari konfigurasi dan divalidasi dengan regex sebelum dipakai.
- **Authorization:** `requireLogin` dan `requireRole('ADMIN')` di router API; Page Guard berjalan
  sebelum static file; frontend bukan penentu hak akses.
- **Transaksi:** `withTransaction()` dengan `FOR UPDATE` dan urutan lock `id ASC` mencegah
  pelanggaran aturan Admin aktif terakhir akibat race condition.
- **Frontend:** render dengan `textContent`, tanpa `innerHTML` untuk data pengguna; tidak menyimpan
  password/token/session di browser storage; tidak menampilkan hash atau `SESSION_SECRET`.
- **HTTP:** Helmet/CSP, `x-powered-by` dimatikan, body dibatasi 1 MB, error 500 memakai pesan generik.
- **Lockout:** 5 kegagalan → 5 menit; reset password tidak membuka kunci yang masih aktif.

## G. Batasan dan Pengujian yang Belum Dilakukan

- **Idle timeout real-time:** konfigurasi rolling 30 menit sudah diterapkan dan diuji secara logis,
  tetapi belum diuji dengan menunggu 30 menit waktu nyata di browser.
- **Stress test / load test:** belum dilakukan. Pengujian berfokus pada kebenaran fungsi dan kontrak,
  bukan kapasitas beban tinggi.
- **Pixel-perfect Figma:** belum diverifikasi per pixel terhadap `figma/Export Figma.pdf`;
  Sprint 1 memastikan alur dan elemen UI-01…UI-05 tersedia dan fungsional.
- **KPI dashboard:** belum dibuat; direncanakan Sprint 3. Dashboard Sprint 1 sengaja kosong metrik.
- **Use case UC-01…UC-07:** belum diimplementasikan; tidak ada endpoint pelanggan, produk,
  sales order, pembayaran, stok, atau piutang pada Sprint 1.
- **Browser lain:** verifikasi headless memakai Chrome; Firefox/Safari belum diuji.
- **Pengujian lint/test di luar `backend`:** root proyek tidak memiliki `package.json`; seluruh
  perintah dijalankan dari folder `backend`.
- **Data produksi:** pengujian integrasi memakai database isolasi; tidak ada pengujian destructive
  terhadap database `distriflow`.
- **Fitur v1.0 yang sengaja tidak dibuat:** Purchase Order, armada pengiriman, WhatsApp/SMS,
  ekspor Excel, cetak barcode, valuasi persediaan/DSI, kategori/rak lokasi yang mengubah schema,
  PPN, Faktur Hold 50%, rotasi password 90 hari, dan surat jalan otomatis. Rincian ada di
  [`docs/ASSUMPTIONS.md`](ASSUMPTIONS.md).

## H. Kesimpulan

Sprint 1 dinyatakan **selesai**. Delapan endpoint autentikasi dan manajemen pengguna berjalan sesuai
kontrak di [`docs/API.md`](API.md). Frontend UI-01…UI-05, Page Guard, dan otorisasi API sudah
terpasang. Seluruh pengujian lolos: lint exit 0, 131/131 test pada 8 suite, 128/128 integrasi MariaDB,
dan 51/51 verifikasi Chrome headless. Dua bug yang ditemukan telah diperbaiki dengan test regression.

Proyek siap melanjutkan ke **Sprint 2** setelah pengguna memberikan persetujuan. Sprint 2 dan Sprint 3
belum dikerjakan; tidak ada fitur use case bisnis, KPI, atau endpoint tambahan yang diklaim selesai pada
laporan ini. Task 1.8 diakhiri di sini dan menunggu persetujuan untuk melanjutkan.
