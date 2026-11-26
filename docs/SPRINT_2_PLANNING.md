# DistriFlow — Planning Sprint 2 (UC-03 & UC-04)

> **Status: Sprint 2 SELESAI untuk Task 2.1, 2.3, 2.4, dan 2.6–2.12. Task 2.2 dan 2.5 `DEFERRED` ke Sprint 3.**
> Dokumen ini berisi perencanaan dan catatan penutupan Sprint 2. Rujukan kebutuhan tetap SKPL-DF-001
> Revisi C dan DPPL-DF-001 Revisi C. FR-09 dan FR-22 tidak diimplementasikan pada Sprint 2.
> Schema, seed, `.env`, dependency, dan dokumen sumber tidak diubah. Hasil verifikasi akhir ada di
> [`SPRINT_2_FINAL_REPORT.md`](SPRINT_2_FINAL_REPORT.md).

## 1. Tujuan dan ruang lingkup

Sprint 2 mengerjakan dua use case inti POS:

| UC | Fokus | Aktor | Sprint |
|---|---|---|---|
| UC-03 | Buat Sales Order: pilih pelanggan, pilih barang, harga retail/grosir, subtotal/diskon/total, status DRAFT (pembatalan/FR-09 ditunda ke Sprint 3) | Sales, Admin | 2 |
| UC-04 | Pembayaran tunai/kredit, validasi dan pengurangan stok, pencatatan pembayaran, invoice PDF, status LUNAS/PIUTANG | Kasir, Admin (cetak ulang) | 2 |

Di luar ruang lingkup Sprint 2: manajemen master pelanggan/barang (UC-05/UC-06), pelunasan piutang
(UC-06), laporan dan KPI dashboard (UC-07), Purchase Order, PPN, Faktur Hold 50%, ekspor Excel,
barcode, dan fitur v1.0 lain yang tercantum di `docs/ASSUMPTIONS.md` bagian 3.

---

## 2. Sumber yang diperiksa

| Sumber | Hasil pemeriksaan |
|---|---|
| `AGENTS.md` | Konvensi lapisan `routes → middleware → controllers → services → models`, aturan transaksi, respons, validasi, session, Page Guard, dan pengujian. |
| `README.md` | Status Sprint 0/1 selesai, 7 tabel bisnis, 4 akun demo, 8 endpoint Sprint 1. **Ditemukan marker konflik Git pada baris 221–223** (`=======`, `>>>>>>> origin/main`). |
| `docs/ASSUMPTIONS.md` | Keputusan Revisi C: ambang risiko 80%, tanpa PPN, pembayaran hanya di UI-09, tidak ada Faktur Hold 50%, data kanonik SO/pelanggan/barang. |
| `docs/API.md` | Tepat 8 endpoint Sprint 1; format sukses/gagal; pesan 401/403; endpoint di luar daftar belum ada. |
| `docs/SPRINT_1_REPORT.md` | 8 suite, 131/131 test; integrasi MariaDB isolasi 128/128; browser Chrome headless 51/51; dua bug Sprint 1 telah diperbaiki. |
| `database/01_schema.sql` | Tepat 7 tabel bisnis. Kolom untuk SO, item, pembayaran, dan mutasi stok sudah tersedia. |
| `database/02_seed.sql` | Data kanonik: 8 pelanggan, 20 barang, 3 order (LUNAS/DRAFT/PIUTANG), 1 pembayaran tunai Rp800.000 dengan kembalian Rp50.000, `stock_movements` sengaja kosong. |
| `backend/src/**` | Implementasi Sprint 0/1: helper, config DB/session, auth, user management, Page Guard, validator, transactions. |
| `frontend/pages/**`, `frontend/js/**`, `frontend/css/style.css` | UI-01…UI-05, `window.DistriFlowAPI`, `window.DistriFlowUI`, sistem komponen CSS. |
| `SKPL DistriFlow (1).pdf` | FR-05…FR-12, deskripsi/skenario UC-03 (hlm. 25–27) dan UC-04 (hlm. 30–32), NFR-01/04/05/09. |
| `DPPL DistriFlow.pdf` | Tabel endpoint (hlm. 13–14), UI-06…UI-10 (hlm. 23–32), kelas CLS-04…CLS-13, Algoritma #2/#3, Query #1–#4 (hlm. 57–60). |
| `User Manual DistriFlow.pdf`, `figma/Export Figma.pdf` | Referensi alur dan visual. Teks Figma tidak terekstrak sebagai teks; referensi visual tetap dipakai sebagaimana disetujui di Sprint 1. |

PDF dibaca dengan utilitas ekstraksi sementara di `C:\Users\fadhi\AppData\Local\Temp\opencode\pdftools\`,
di luar repository. Keempat file/folder sumber tidak diubah.

---

## 3. Kondisi implementasi saat awal audit

> Catatan: bagian ini adalah baseline sebelum implementasi Sprint 2. Kondisi akhir dan bukti verifikasi
> ada di `docs/SPRINT_2_FINAL_REPORT.md`.

### Backend

- Struktur CNN sudah konsisten: `routes → middleware → controllers → services → models`.
- Helper siap pakai:
  - `src/helpers/response.js`: `success()`, `fail()`, `HTTP_STATUS`.
  - `src/helpers/AppError.js`, `src/helpers/asyncHandler.js`.
  - `src/config/db.js`: `execute()`, `getExecutor(connection)`, `withTransaction()` dengan commit/rollback/release.
- Autentikasi dan otorisasi: `requireLogin`, `requireRole(...)`, session MySQL, cookie `HttpOnly`/`SameSite=Strict`.
- Validasi: `express-validator` di `src/middleware/validators/` + helper `validate` yang menghasilkan
  `errors: [{ field, message }]` dan memakai pesan pertama sebagai `message`.
- 12 endpoint aktif: 4 `/api/auth/*`, 4 `/api/users*`, dan 4 endpoint katalog dari Task 2.1
  (2 `/api/customers*`, 2 `/api/products*`).
- `pdfkit` **sudah terpasang** di `backend/package.json` (belum dipakai), sehingga invoice PDF tidak
  memerlukan dependency baru.

### Database

- `users`, `customers`, `products`, `sales_orders`, `sales_order_items`, `payments`, `stock_movements`
  sudah sesuai DPPL 3.4. Tidak ada tabel baru yang dibutuhkan.
- Semua uang `DECIMAL(15,2)`; `mysql2` mengembalikan `DECIMAL` sebagai string. Perhitungan harus
  menjaga presisi sen (lihat D10).
- FK `sales_order_items.sales_order_id` memakai `ON DELETE CASCADE`; FK lain `RESTRICT`.
- Data kanonik penting:
  - `PLG-001` GROSIR, limit Rp2.500.000, piutang Rp2.000.000 → Berisiko (tepat 80%).
  - `PLG-007` RETAIL, limit Rp5.000.000, piutang Rp0 → Aman.
  - `BRS-05` retail Rp75.000 / grosir Rp72.000, stok 30, min 50.
  - `SO-20261112-001` LUNAS; `SO-20261112-002` DRAFT; `SO-20261003-001` PIUTANG.

### Frontend

- 5 halaman: `login`, `dashboard`, `change-password`, `users`, `user-form`.
- `window.DistriFlowAPI` sudah menangani `credentials: 'same-origin'`, error 401, dan format respons.
- `window.DistriFlowUI` menyediakan `formatRupiah`, `setText`, `renderRows`, `notify`, `confirmAction`,
  `buildSidebar`, `setupLogout`, `onUnauthorized`.
- Semua data dirender dengan `textContent`; tidak ada `innerHTML` untuk data pengguna.
- `PageGuard` memakai allowlist kanonik 5 halaman dan berjalan sebelum `express.static`.

### Pengujian

- Jest + Supertest; setelah Task 2.1: 12 suite, 172 test, semuanya lolos. Pola pengujian service,
  validator, page guard, routing halaman, dan kontrak API sudah tersedia.
- Sprint 1 memakai database isolasi hasil salinan schema+seed untuk integrasi. Pola ini harus dipakai
  kembali; database aplikasi tidak boleh di-reset.

---

## 4. Temuan dan keputusan yang perlu dikonfirmasi

| ID | Temuan | Dampak | Rekomendasi | Status |
|---|---|---|---|---|
| D1 | SKPL hlm. 25 menyatakan **FR-09 (pembatalan) dan FR-22 (label risiko) ditambahkan pada Sprint 3**, tetapi DPPL hlm. 23–26/31 dan target Sprint 2 Anda memasukkan pembatalan di Sprint 2. Tabel matriks SKPL hlm. 46 juga memetakan FR-09/FR-22 ke Sprint 2. | Konflik sumber otoritatif. AGENTS.md memerintahkan menghentikan bagian yang bertentangan dan melaporkan, bukan memutuskan sendiri. | Konfirmasi tertulis: (a) FR-09 dan/atau FR-22 memang dikejar di Sprint 2, atau (i) ditunda ke Sprint 3. Hasilnya: kedua fitur **ditunda ke Sprint 3**. | **Diputuskan pengguna: FR-09 dan FR-22 ditunda ke Sprint 3**; SKPL Revisi C menjadi acuan ruang lingkup |
| D2 | Schema punya `sales_orders.discount`, tetapi UI-06 hanya memuat diskon per baris dan Algoritma #2 menjumlahkan `line_total` yang sudah dikurangi diskon baris. | Berisiko diskon dihitung dua kali atau `total` tidak cocok dengan `subtotal − discount`. | Tidak menambah input baru: `subtotal = Σ(qty × unit_price)`, `discount = Σ(diskon baris)`, `total = subtotal − discount = Σ line_total`. `sales_orders.discount` menjadi turunan, bukan input header. | **Diterapkan**: `subtotal` bruto, `discount` total diskon item, `total = subtotal − discount` |
| D3 | UI-06 memerlukan combo pelanggan/barang yang dapat dicari, tetapi DPPL menempatkan `GET /api/customers` dan `GET /api/products` di UC-06/UC-05 (Sprint 3). | Jika tidak dibuat, frontend terpaksa hard-code data seed dan melanggar aturan "harga/stok dihitung ulang di server". | Tambahkan **read-only** `GET /api/customers` dan `GET /api/products` di Sprint 2 (tanpa POST/PUT). Ini bukan implementasi master data Sprint 3. | Diterapkan pada Task 2.1 (read-only) |
| D4 | Seed `SO-20261112-001` total Rp750.000 tetapi `payments.amount` Rp800.000 dan `change_amount` Rp50.000. Query #3/#6 memakai `amount − change_amount` sebagai nilai dibayar. | Salah interpretasi `amount` akan membuat piutang/kembalian melenceng. | `amount` = nominal yang diterima kasir (tendered); nilai terpakai = `amount − change_amount`. Tunai: kembalian = `amount − total`. Kredit: `change_amount = 0`, sisa = `total − amount`. | Konsisten dengan seed & DPPL |
| D5 | Nomor order `SO-YYYYMMDD-NNN` harus unik walaupun dua Sales menyimpan bersamaan. | Potensi duplikat atau deadlock. | Buat nomor di dalam `withTransaction()` dengan `SELECT ... FOR UPDATE` baris terakhir hari itu; `UNIQUE(order_no)` sebagai pertahanan akhir; tangani `ER_DUP_ENTRY` dengan retry terbatas. Tanpa mengubah schema. | Disetujui secara teknis |
| D6 | Draft **tidak** memesan stok. Stok dicek saat simpan dan dicek ulang saat bayar. | Order bisa gagal dibayar bila stok berubah. | Sesuai SKPL alternatif 4a: rollback, order tetap DRAFT, tampilkan barang yang kurang. Tidak boleh menyisakan payment/status setengah. | Disetujui secara teknis |
| D7 | FR-22 memakai `outstanding >= 0.8 × credit_limit` hanya jika `credit_limit > 0`; skor 0=Aman, 1=Waspada, 2–3=Berisiko. | Label risiko tampil di UI-06 menurut DPPL, tapi SKPL menundanya ke Sprint 3 (lihat D1). | Implementasikan `GET /api/customers/:id/credit` dengan level/limit/sisa limit; skor risiko hanya dikerjakan bila D1 memutuskan masuk Sprint 2. | Endpoint kredit dibuat di Task 2.1 **tanpa** `risk_score`/`risk_label`; skor risiko ditunda ke Sprint 3 |
| D8 | `README.md` masih memuat marker konflik Git di akhir file. | Dokumen teknis tampak belum bersih. | Bersihkan pada Task 2.12 hanya setelah persetujuan pengguna; tidak menyentuh dokumen sumber. | **SELESAI**: marker di akhir file dihapus; judul sudah ada di baris pertama |
| D9 | Endpoint PDF tidak cocok dengan wrapper JSON `api.js`; Helmet mengatur `object-src 'none'`. | Cetak invoice bisa gagal atau dianggap error JSON. | Endpoint mengembalikan `application/pdf`; frontend membuka URL langsung di tab/window baru atau mengambil `blob` dengan penanganan terpisah. Tidak mengubah CSP tanpa alasan. | Disetujui secara teknis |
| D10 | `DECIMAL(15,2)` dibaca `mysql2` sebagai string; `Number` rawan pembulatan biner. | Melanggar NFR-04 (selisih Rp0). | Konversi ke integer sen di service (parser string eksplisit) atau lakukan agregasi di SQL; dilarang `parseFloat` untuk uang. | Diterapkan pada Task 2.1 lewat `src/helpers/money.js` |

---

## 5. Komponen yang dapat digunakan kembali

### Backend

| Komponen | Dipakai untuk Sprint 2 |
|---|---|
| `withTransaction()` | Simpan order + item + nomor; bayar + stok + payment + mutasi; pembatalan Piutang. |
| `getExecutor(connection)` | Semua model menerima koneksi transaksi agar query tetap parameterized. |
| `AppError`, `success()`, `fail()`, `HTTP_STATUS`, `asyncHandler` | Seluruh endpoint baru; pesan SKPL tampil persis di `message`. |
| `requireLogin`, `requireRole(...)` | Pasang di router API, bukan hanya di frontend. |
| `validate` + `express-validator` | `catalogValidator` (Task 2.1, sudah dipakai); `orderValidator` dan `paymentValidator` untuk task berikutnya. |
| Pola `userService.update()` | Transaksi + `FOR UPDATE` + urutan lock stabil + rollback saat validasi gagal. |
| Pola `userModel.buildUserFilters()` | Filter/paginasi order (sentinel `NULL`, hindari bug `0 = ''`). |
| `pdfkit` (sudah terpasang) | `PdfService.buatInvoice()` A4 dan struk 80 mm. |

### Frontend

| Komponen | Dipakai untuk Sprint 2 |
|---|---|
| `window.DistriFlowAPI` | Semua request; 401 otomatis memanggil `onUnauthorized`. |
| `window.DistriFlowUI.formatRupiah` | Tampilan harga, subtotal, diskon, total, kembalian, piutang. |
| `setText`, `renderRows` | Render pelanggan/barang/order/items dengan `textContent`. |
| `notify`, `confirmAction` | Error sukses, konfirmasi hapus baris/form, konfirmasi pembatalan. |
| `buildSidebar` | Tambah menu yang tersedia per role; **tanpa** KPI (Sprint 3). |
| `setupLogout`, `onUnauthorized` | Dipanggil di semua halaman baru. |
| `frontend/css/style.css` | Kelas `df-btn`, `df-table`, `df-toast`, `df-modal`, layout halaman; tidak membuat framework baru. |

### Testing

- Pola unit service dengan mock model pada `authService.test.js` / `userService.test.js`.
- Pola kontrak API dengan Supertest dan helper `response.test.js`.
- Pola `pageGuard.test.js` untuk memperluas allowlist.
- Harness integrasi di luar project dengan database `test_verify_*` hasil salinan schema+seed.

---

## 6. Analisis kebutuhan database Sprint 2

### 6.1 Tidak ada perubahan schema

Ketujuh tabel sudah cukup. Tidak direncanakan `ALTER TABLE`, tabel baru, atau perubahan seed.
Perubahan schema hanya boleh dilakukan bila pengguna menyetujui setelah analisis lanjutan.

### 6.2 Pemetaan tabel

| Tabel | Peran Sprint 2 |
|---|---|
| `users` | FK `sales_orders.user_id` (Sales pembuat order), `payments.user_id` (Kasir), `cancelled_by` (Admin). |
| `customers` | Filter `is_active = TRUE`; `price_level`, `credit_limit`, `payment_term_days`; dikunci `FOR UPDATE` saat pembayaran kredit. |
| `products` | Filter `is_active = TRUE`; `price_retail`/`price_wholesale`; `stock`; dikunci `FOR UPDATE` saat pembayaran. |
| `sales_orders` | Header order DRAFT → LUNAS/PIUTANG/BATAL; `order_no`, `order_date`, ringkasan uang, `payment_type`, `due_date`, metadata pembatalan. |
| `sales_order_items` | Baris order; `unit_price` adalah salinan harga saat transaksi; `line_total = qty × unit_price − discount`. |
| `payments` | Catatan pembayaran; `amount` = nominal diterima, `change_amount` = kembalian, `method` = TUNAI/TRANSFER. |
| `stock_movements` | `KELUAR` saat pembayaran berhasil; `BATAL` saat order PIUTANG dibatalkan; `reference` = `order_no`. |

### 6.3 Pola query yang wajib dipakai

- Semua nilai memakai placeholder `?` melalui `pool.execute()`/`getExecutor()`. Dilarang konkatenasi SQL.
- Harga: `CASE WHEN level = 'GROSIR' THEN price_wholesale ELSE price_retail END`.
- Piutang berjalan:
  `SUM(so.total − COALESCE(p.paid, 0))` untuk order `PIUTANG`, dengan
  `p.paid = SUM(amount − change_amount)` per `sales_order_id`.
- Cek limit kredit: `outstanding + sisa_baru <= credit_limit`, hanya bila `credit_limit > 0`.
- Pengurangan stok aman:
  `UPDATE products SET stock = stock − ? WHERE id = ? AND stock >= ?`; gagal bila `affectedRows = 0`.
- Pengembalian stok: `UPDATE products SET stock = stock + ? WHERE id = ?`, hanya untuk order PIUTANG.
- Nomor order: buat di dalam transaksi yang sama dengan insert order; `UNIQUE(order_no)` menjaga duplikat.
- Proteksi mutasi ganda: cek `stock_movements` berdasarkan `reference` + `type` + `product_id` sebelum
  insert (model `existsByReference` sesuai CLS-07 DPPL).

### 6.4 Data kanonik untuk pengujian

Gunakan salinan schema+seed di database isolasi. Skenario wajib:

1. `SO-20261112-002` (DRAFT, PLG-002) dibayar tunai Rp150.000 → LUNAS, stok SBN-08 berkurang 10,
   payment tercatat, movement `KELUAR` dengan reference `SO-20261112-002`.
2. `PLG-001` memiliki outstanding Rp2.000.000 dari limit Rp2.500.000 → kredit dengan sisa > Rp500.000
   ditolak "Melebihi limit kredit"; tepat Rp500.000 masih diizinkan.
3. `BRS-05` level GROSIR memakai Rp72.000; RETAIL memakai Rp75.000.
4. Pembayaran Rp800.000 untuk order Rp750.000 → `amount = 800000`, `change_amount = 50000`, status LUNAS
   (sesuai seed `SO-20261112-001`).
5. `credit_limit = 0` (PLG-004) → opsi KREDIT nonaktif dan perhitungan rasio 80% dilewati.

---

## 7. Business rules, validasi, dan pesan error

### 7.1 UC-03 — Sales Order

1. Actor: Sales atau Admin, sudah login. Sales hanya melihat order miliknya; Admin melihat semua.
2. Pilih pelanggan aktif. Tampilkan `price_level` dan sisa limit. Label risiko **tidak diterapkan** karena FR-22 `DEFERRED` ke Sprint 3.
3. Pilih barang aktif berdasarkan kode. Harga ditentukan server dari level pelanggan, bukan dari input browser.
4. Kode barang yang sama digabung menjadi satu baris; stok dicek terhadap total qty gabungan.
5. `qty` bilangan bulat `>= 1`; `diskon` opsional, `0 <= diskon <= qty × unit_price`.
6. `line_total = qty × unit_price − diskon`; `subtotal = Σ(qty × unit_price)`;
   `discount = Σ diskon`; `total = subtotal − discount`. Tanpa PPN.
7. Simpan order hanya bila minimal satu baris. Nomor `SO-YYYYMMDD-NNN` dibuat saat simpan.
8. Status awal selalu `DRAFT`. **Stok belum dikurangi** saat order dibuat.
9. Pembatalan **tidak diterapkan** pada Sprint 2: FR-09 `DEFERRED` ke Sprint 3. Tidak ada endpoint
   cancel, tombol Batalkan Order, atau perubahan status `BATAL` dari aplikasi.

### 7.2 UC-04 — Pembayaran

1. Actor: Kasir. Hanya order `DRAFT` yang boleh dibayar.
2. `payment_type` (`TUNAI`/`KREDIT`) berbeda dari `payments.method` (`TUNAI`/`TRANSFER`). Keduanya wajib
   divalidasi terpisah.
3. Nominal:
   - `nominal >= 0`; tunai tidak boleh 0; kredit boleh 0 (tanpa uang muka).
   - Transfer tidak boleh melebihi total karena tidak ada kembalian transfer.
   - Tunai kurang bayar ditolak.
4. Kredit: `sisa = total − nominal`; cek `outstanding + sisa <= credit_limit` hanya bila limit > 0;
   `due_date = CURDATE() + payment_term_days`.
5. Kredit dengan nominal `>= total`: `payment_type` tetap `KREDIT`, status `LUNAS`, kembalian dihitung
   seperti tunai (kecuali transfer, yang sudah dibatasi nominal `<= total`).
6. Dalam **satu transaksi**: kunci customer dan semua product → cek ulang limit & stok → kurangi stok →
   catat movement `KELUAR` → simpan payment (bila nominal > 0) → update status/`payment_type`/`due_date`.
   Gagal di mana pun ⇒ rollback, order tetap `DRAFT`.
7. Payment record dibuat hanya bila nominal > 0. Kredit tanpa uang muka tetap menghasilkan status PIUTANG.
8. Invoice hanya tersedia untuk order `LUNAS` atau `PIUTANG`, format `a4` atau `80mm`, tanpa PPN.

### 7.3 Pesan yang harus tampil persis

| Kondisi | Pesan `message` | HTTP | Sumber |
|---|---|---|---|
| Barang tidak ada/nonaktif | `Barang tidak ditemukan` | 400/404 | SKPL A3a, Algoritma #2 |
| Qty tidak valid | `Jumlah tidak valid` | 400 | Algoritma #2 |
| Stok kurang saat simpan/bayar | `Stok tidak cukup, tersedia {n}` | 409 | SKPL A4b, DPPL API 409 |
| Diskon di luar rentang | `Diskon tidak valid` | 400 | Algoritma #2 |
| Order bukan DRAFT saat bayar | `Order sudah diproses` | 409 | Algoritma #3 d1 |
| Nominal negatif / 0 untuk tunai | `Nominal tidak valid` | 400 | Algoritma #3 d2 |
| Transfer melebihi total | `Transfer tidak boleh melebihi total` | 400 | Algoritma #3 d3 |
| Tunai kurang | `Nominal kurang Rp{selisih}` | 400 | SKPL 3a, Algoritma #3 d4 |
| Limit kredit terlampaui | `Melebihi limit kredit` | 409 | SKPL 3b, Algoritma #3 d6 |
| Tidak ada sesi | `Sesi berakhir, silakan login kembali` | 401 | Sprint 1 |
| Role tidak berhak | `Anda tidak memiliki hak akses untuk operasi ini` | 403 | Sprint 1 |
| Alasan pembatalan kosong | `Alasan pembatalan wajib diisi` | 400 | Turunan SKPL B2a; perlu konfirmasi redaksi |

Pesan yang belum ada teks eksplisit di SKPL/DPPL (misalnya validasi format tanggal dan alasan pembatalan)
harus diajukan untuk konfirmasi sebelum implementations, bukan dibuat sebagai keputusan bisnis baru.

### 7.4 Edge cases yang wajib diuji

- Kode barang duplikat digabung; stok dicek setelah digabung, bukan per kemunculan.
- Ganti pelanggan setelah ada baris ⇒ semua harga dihitung ulang sesuai level baru.
- Pelanggan berlabel Waspada/Berisiko tetap bisa order; limit baru dicek saat pembayaran.
- Simpan order kosong ⇒ tombol Simpan nonaktif dan service menolak.
- Dua Sales membuat order hari yang sama ⇒ nomor unik; retry `ER_DUP_ENTRY` terbatas.
- Stok berubah di antara pembayaran ⇒ rollback penuh, order tetap DRAFT, tidak ada payment/movement.
- Dua Kasir membayar order yang sama ⇒ yang kedua mendapat `Order sudah diproses`.
- Dua Kasir membayar kredit pelanggan yang sama ⇒ lock customer, cek limit dengan piutang terbaru.
- Pembayaran gagal di tengah ⇒ tidak ada baris `payments`, `stock_movements`, atau perubahan status.
- Retry pembayaran sukses ⇒ tidak boleh membuat movement `KELUAR` ganda untuk order yang sama.
- Order PIUTANG dibatalkan ⇒ stok kembali, movement `BATAL`, payment lama tetap ada — **tidak diuji pada Sprint 2** (FR-09 `DEFERRED`).
- Order DRAFT dibatalkan ⇒ tidak ada pengembalian stok/movement — **tidak diuji pada Sprint 2** (FR-09 `DEFERRED`).
- Order LUNAS/BATAL dibatalkan ⇒ ditolak — **tidak diuji pada Sprint 2** (FR-09 `DEFERRED`).
- `credit_limit = 0` ⇒ tidak ada pembagian dengan nol; kredit nonaktif.
- Kredit nominal 0 ⇒ payment record tidak dibuat, status PIUTANG, due_date tetap dihitung.
- Format invoice selain `a4`/`80mm` ⇒ 400; order DRAFT ⇒ invoice 409.
- Uang desimal ⇒ selisih perhitungan harus Rp0.

---

## 8. Pembagian task dan acceptance criteria

### Prasyarat — Task 2.0 Decision Gate (bukan implementasi)

**Tujuan:** pengguna memutuskan D1/D2/D7 dan D8.

**Acceptance criteria:**

- Keputusan D1 dicatat di dokumen ini: FR-09 dan FR-22 masuk Sprint 2 atau ditunda ke Sprint 3.
- Keputusan D2 dicatat: `discount` header turunan dari diskon baris (rekomendasi) atau input header baru.
- Resolusi D8: marker konflik `README.md` dibersihkan pada Task 2.12 setelah resolusinya jelas.
- Tidak ada kode/Schema/seed yang diubah pada gate ini.

> Task yang ditunda tidak boleh diimplementasikan pada Sprint 2 tanpa persetujuan baru.

---

### Task 2.1 — Backend: lookup read-only customer/product + utilitas uang

**Status: DONE** (26-11-2026).

**Cakupan:**

- Model baru: `customerModel`, `productModel` (read-only).
- Service `catalogService` (atau fungsi dalam `orderService`) untuk daftar aktif, detail kredit, dan
  harga sesuai level.
- Utilitas konversi uang ke integer sen tanpa dependency baru.
- Endpoint:
  - `GET /api/customers?search=&limit=` — Admin, Sales, Kasir.
  - `GET /api/customers/:id/credit` — Sales, Admin; mengembalikan `price_level`, `credit_limit`,
    `outstanding`, `remaining_limit` (tanpa `risk_score`/`risk_label`; Task 2.2 ditunda).
  - `GET /api/products?search=&limit=` — semua role login.
  - `GET /api/products/by-code/:code?level=&qty=&discount=` — Sales, Admin.

**Acceptance criteria:**

- Hanya baris `is_active = TRUE` yang dikembalikan.
- Harga grosir/retail sesuai `price_level`; client tidak bisa memaksa harga lewat body order.
- `outstanding` memakai `SUM(total − (amount − change_amount))` untuk order PIUTANG.
- `credit_limit = 0` menghasilkan `remaining_limit = 0` tanpa error pembagian.
- Query memakai placeholder `?`; rentang `limit` dibatasi (maksimal 100).
- Unit test utilitas uang: `75000.01 × 3`, diskon `0.01`, tidak ada pembulatan biner.
- Unit/contract test untuk peran dan payload publik (tanpa kolom sensitif).
- `npm run lint` dan `npm test` lolos.

**Catatan penutupan:**

- Helper baru `src/helpers/money.js`: konversi integer sen tanpa `parseFloat`, menolak lebih dari dua
  desimal dan noise biner; menyediakan `toCents`, `fromCents`, `addCents`, `sumCents`, `subtractCents`,
  `multiplyCents`, `lineTotalCents`. Contoh terverifikasi: `75000.01 × 3 = 225000.03`, dikurangi diskon
  `0.01` menjadi `225000.02`.
- Model read-only `customerModel` dan `productModel`; service `catalogService`; controller
  `catalogController`; validator `catalogValidator`; router `customerRoutes` dan `productRoutes`.
- `src/routes/index.js` hanya menambah mount `/customers` dan `/products`; endpoint Sprint 1 tidak diubah.
- Endpoint yang dibuat:
  - `GET /api/customers?search=&page=&limit=` — ADMIN, SALES, KASIR.
  - `GET /api/customers/:id/credit` — ADMIN, SALES; mengembalikan `price_level`, `credit_limit`,
    `outstanding`, `remaining_limit`, **tanpa** `risk_score`/`risk_label`.
  - `GET /api/products?search=&page=&limit=` — semua role login; memuat harga retail/grosir dan stok.
  - `GET /api/products/by-code/:code?level=&qty=&discount=` — ADMIN, SALES; kalkulator harga read-only,
    bukan pembuatan sales order.
- Field uang dikembalikan sebagai string dua desimal; ID dan stok sebagai bilangan. Tidak ada password,
  hash, atau data sesi pada payload.
- **Verifikasi:** `npm run lint` lolos tanpa error; `npm test` lolos dengan **12 suite, 172 test, 0 gagal**,
  termasuk test regresi Sprint 1. Test mencakup konversi uang, filter aktif pada SQL model, kontrak peran,
  validasi query, paginasi, `credit_limit = 0`, dan payload tanpa field sensitif.
- **Keterbatasan:** pengujian terhadap **server MySQL sungguhan belum dilakukan**. Filter
  `is_active = TRUE` dan agregat piutang diverifikasi melalui mock executor serta test kontrak Supertest,
  bukan eksekusi SQL pada database isolasi. Perlu verifikasi integrasi MariaDB/MySQL sebelum task
  berikutnya bergantung pada data ini.
- Tidak ada endpoint Sales Order, Payment, Invoice, pembatalan, atau label risiko yang dibuat. Tidak ada
  perubahan schema, seed, `.env`, dependency, atau dokumen sumber; tidak ada commit/push.

---

### Task 2.2 — Backend: skor risiko FR-22 (**DITUNDA ke Sprint 3**)

**Status: DEFERRED** sesuai keputusan pengguna (FR-22 masuk Sprint 3). Task ini tidak diimplementasikan
pada Sprint 2 dan tidak boleh ditandai selesai.

**Cakupan:** `ReceivableService.skorRisiko()` dan integrasi ke response `GET /api/customers/:id/credit`.

**Acceptance criteria:**

- Skor 0–3 sesuai Algoritma #5: overdue +1, rasio 80% +1, keterlambatan ≥2 dalam 90 hari +1.
- Rasio dihitung hanya bila `credit_limit > 0`.
- Label: 0 = `Aman`, 1 = `Waspada`, 2–3 = `Berisiko`.
- `PLG-001` menghasilkan `Berisiko`, `PLG-007` `Aman`, `PLG-004` tidak dibagi nol.
- Jika gate memutuskan FR-22 Sprint 3, task ini dilewati dan tidak diimplementasikan.

---

### Task 2.3 — Backend: buat sales order DRAFT (UC-03 Alur A)

**Status: DONE.** Implementasi Tahap 1 dipertahankan; Tahap 2 (review dan pengujian) selesai.
Bug format tanggal nomor order dan prefiks `findLastOrderNo` ditemukan serta diperbaiki dengan test regresi.

**Cakupan:** `POST /api/orders` (Sales, Admin), `orderValidator`, `orderService.buatOrder()`,
`orderModel` (insert header + items + nomor).

**Acceptance criteria:**

- Server menghitung ulang harga, subtotal, diskon, dan total; tidak percaya nominal dari client.
- Kode duplikat digabung; stok dicek terhadap total qty per produk.
- Validasi: pelanggan aktif, barang aktif, qty bulat ≥1, diskon `0..qty×harga`, minimal satu baris.
- Nomor `SO-YYYYMMDD-NNN` dibuat dalam satu transaksi dengan `FOR UPDATE` + `UNIQUE`.
- Status `DRAFT`, `payment_type = NULL`, `due_date = NULL`, stok **belum** berubah.
- Respons memuat order lengkap beserta items.
- Test: skenario A1–A6 dan alternatif A2a/A2b/A3a/A4a/A4b/A4c/A5a/A6a; concurrent order number.
- Lint dan test lolos.

---

### Task 2.4 — Backend: daftar & detail order (UC-03)

**Status: DONE.**

**Cakupan:** `GET /api/orders` dan `GET /api/orders/:id` (Admin, Sales, Kasir).

**Acceptance criteria:**

- Filter: tanggal awal/akhir, status (`DRAFT`/`LUNAS`/`PIUTANG`/`BATAL`/semua), pencarian nomor order
  atau nama pelanggan; tanggal akhir tidak boleh sebelum awal.
- Paginasi dengan batas `limit` maksimal 100; urutan deterministik.
- Sales hanya menerima order miliknya; Admin/Kasir menerima semua.
- Detail memuat items, ringkasan uang, status, payment_type, due_date, dan metadata pembatalan bila ada.
- Tidak mengembalikan password/hash/session data.
- Test kontrak untuk peran, filter, paginasi, dan 404 order tidak ditemukan.

---

### Task 2.5 — Backend: pembatalan order (**DITUNDA ke Sprint 3**)

**Status: DEFERRED** sesuai keputusan pengguna (FR-09 masuk Sprint 3). Task ini tidak diimplementasikan
pada Sprint 2 dan tidak boleh ditandai selesai.

**Cakupan:** `POST /api/orders/:id/cancel` (Admin).

**Acceptance criteria:**

- Hanya status `DRAFT` atau `PIUTANG`; selain itu `409 Order sudah diproses` atau pesan status yang disetujui.
- Alasan wajib; disimpan di `cancel_reason` bersama `cancelled_by` dan `cancelled_at`.
- `DRAFT`: status `BATAL`, **tanpa** perubahan stok dan tanpa movement.
- `PIUTANG`: status `BATAL`, stok dikembalikan, movement `BATAL` dengan `reference = order_no`.
- Semua perubahan berada dalam satu `withTransaction()` dengan lock order/product.
- Payment yang sudah tercatat tidak dihapus; tidak ada logika refund otomatis.
- Test: Draft, Piutang, Lunas/Batal ditolak, alasan kosong, rollback kegagalan, idempotensi pembatalan.

---

### Task 2.6 — Backend: proses pembayaran (UC-04 inti)

**Status: DONE.**

**Cakupan:** `POST /api/orders/:id/payments` (Kasir), `paymentValidator`, `paymentService`, `paymentModel`,
`stockService`.

**Acceptance criteria:**

- Validasi matriks nominal/tunai/kredit/transfer sesuai bagian 7.2 dan pesan persis di bagian 7.3.
- Satu transaksi mencakup: lock customer + products, cek limit, cek stok, `UPDATE stock` bersyarat,
  movement `KELUAR`, insert payment (nominal > 0), update order LUNAS/PIUTANG + `payment_type` + `due_date`.
- Payment `amount` menyimpan nominal diterima; `change_amount` kembalian; nilai terpakai =
  `amount − change_amount`.
- Status akhir LUNAS/PIUTANG; tidak ada "dibayar tapi masih DRAFT".
- Kredit tanpa uang muka tetap menghasilkan PIUTANG dan tidak membuat baris payment.
- Rollback penuh saat stok/limit gagal; order tetap DRAFT.
- Guard terhadap order dibayar dua kali dan movement ganda.
- Test white-box d1–d8 (V(G)=9), test konkurensi customer/product, test canonical Rp800.000/50.000.
- Lint dan test lolos.

---

### Task 2.7 — Backend: invoice PDF (UC-04/UI-10)

**Status: DONE.**

**Cakupan:** `GET /api/orders/:id/invoice.pdf?format=a4|80mm` (Kasir, Admin), `invoiceController`,
`pdfService` (pdfkit).

**Acceptance criteria:**

- Hanya order `LUNAS` atau `PIUTANG`; DRAFT/BATAL ditolak dengan `409`.
- Format hanya `a4` atau `80mm`; default `a4`.
- Berisi kop distributor, no. order, tanggal, pelanggan, kasir, rincian barang, total, nominal bayar,
  kembalian/sisa piutang, dan jatuh tempo untuk kredit. Tanpa PPN.
- Respons `application/pdf`, `Content-Disposition` jelas, dapat dibuka/dicetak di browser.
- Waktu pembuatan ≤3 detik untuk order contoh (NFR-01).
- Test: format invalid, status invalid, isi minimal invoice, tipe konten PDF.

---

### Task 2.8 — Page Guard dan navigasi Sprint 2

**Status: DONE.**

**Cakupan:** perluasan `PAGE_ACCESS` dan `MENU_BY_ROLE`.

Halaman baru:

| Path | Role |
|---|---|
| `/pages/sales-order.html` | SALES, ADMIN |
| `/pages/orders.html` | ADMIN, SALES, KASIR |
| `/pages/order-detail.html` | ADMIN, SALES, KASIR |
| `/pages/payment.html` | KASIR |

**Acceptance criteria:**

- Guest diredirect ke login; role salah diredirect ke dashboard; unknown `.html` tetap 404.
- Guard berjalan sebelum `express.static`.
- Sidebar hanya menampilkan menu yang benar-benar tersedia per role; **tidak ada** menu KPI.
- Test page guard dan routing halaman diperbarui tanpa melemahkan assertion Sprint 1.

---

### Task 2.9 — Frontend UI-06: Sales Order Baru

**Status: DONE.** Label risiko sengaja tidak ditampilkan (FR-22 `DEFERRED`).

**Cakupan:** `frontend/pages/sales-order.html`, `frontend/js/sales-order.js`, style tambahan bila perlu.

**Acceptance criteria:**

- Combo pelanggan dan barang memakai API read-only; pencarian, loading, empty state, dan error ditampilkan.
- Memilih/ganti pelanggan menghitung ulang semua harga sesuai level; info limit/sisa limit ditampilkan.
  Label risiko **tidak ditampilkan** karena FR-22 `DEFERRED` (keputusan D1/D7).
- Input kode barang dengan fokus otomatis; Enter menambah baris; kode sama digabung.
- Validasi frontend: qty bulat ≥1, diskon `0..bruto`, stok kurang `Stok tidak cukup, tersedia N`,
  daftar kosong ⇒ Simpan nonaktif. Validasi backend tetap berlaku.
- Tampilkan kode, nama, harga, qty, diskon, subtotal per baris dan total order dengan `formatRupiah`.
- Tombol Batal membuka konfirmasi sebelum mengosongkan form.
- Semua data dirender dengan `textContent`; tidak ada `innerHTML` untuk data API.
- 401/sesi habis ditangani oleh `DistriFlowAPI`/`onUnauthorized`.
- Verifikasi browser dicatat dengan jelas: aplikasi asli atau mock.

---

### Task 2.10 — Frontend UI-07/UI-08: daftar & detail order

**Status: DONE.** Tombol Batalkan Order sengaja tidak ditampilkan (FR-09 `DEFERRED`).

**Cakupan:** `orders.html`, `orders.js`, `order-detail.html`, `order-detail.js`.

**Acceptance criteria:**

- Daftar memuat filter tanggal, status, pencarian, dan tabel sesuai DPPL; pagination bila tersedia.
- Sales hanya melihat order miliknya; tombol aksi mengikuti role dan status.
- Detail menampilkan info order, rincian barang, total (read-only).
- Tombol Bayar hanya untuk Kasir pada order DRAFT.
- Tombol Batalkan Order **tidak diterapkan** karena FR-09 `DEFERRED` ke Sprint 3.
- Tombol Cetak Invoice hanya untuk Admin/Kasir pada LUNAS/PIUTANG, memilih format A4/80 mm.
- Error 403/409/401 ditampilkan; tidak ada aksi destruktif tanpa konfirmasi.

---

### Task 2.11 — Frontend UI-09: pembayaran dan cetak invoice

**Status: DONE.**

**Cakupan:** `payment.html`, `payment.js`, penanganan PDF terpisah di `api.js` atau helper baru.

**Acceptance criteria:**

- Menampilkan total tagihan dan rincian order (read-only).
- Radio Tunai/Kredit; Kredit nonaktif bila sisa limit = 0 (dari endpoint credit).
- Combo metode Tunai/Transfer, default Tunai.
- Nominal wajib; perhitungan kembalian/tersisa piutang berubah mengikuti jenis dan nominal, dengan
  validasi yang sama persis dengan backend.
- Proses Pembayaran mengirim `POST /api/orders/:id/payments`; setelah sukses menampilkan status akhir dan
  mengaktifkan tombol Cetak Invoice.
- Cetak invoice membuka/mengunduh PDF dari endpoint dengan format terpilih; tidak mem-parsing PDF sebagai JSON.
- Loading, error, empty state, 401, dan pesan SKPL tampil persis.

---

### Task 2.12 — Pengujian akhir, dokumentasi, dan penutupan sprint

**Status: DONE.** Bukti lengkap ada di `docs/SPRINT_2_FINAL_REPORT.md`.

**Cakupan:** verifikasi lint/test, integrasi DB isolasi, browser, `docs/API.md`, `README.md`,
`docs/SPRINT_2_FINAL_REPORT.md`, pembaruan keputusan di dokumen ini.

**Acceptance criteria:**

- `npm run lint` exit 0 dan `npm test` lolos di `backend`; test baru mencakup service, validator, page guard,
  routing halaman, dan kontrak seluruh endpoint Sprint 2.
- Integrasi MariaDB/MySQL memakai database isolasi hasil salinan schema+seed; database aplikasi tidak di-reset.
- Jika verifikasi browser dijalankan, nyatakan aplikasi asli atau mock; jangan mengklaim pengujian yang tidak dilakukan.
- `docs/API.md` diperbarui dari 8 endpoint menjadi **17 endpoint aktual**; tidak ada endpoint rekaan ke-18.
- `README.md` dan laporan Sprint 2 mencerminkan status sebenarnya; marker konflik dibersihkan setelah resolusi D8 jelas.
- Tidak ada credential, `SESSION_SECRET`, hash, atau dataproduksi yang dicetak di log/laporan.
- Tidak ada perubahan pada SKPL, DPPL, User Manual, `figma/`, `01_schema.sql`, `02_seed.sql`, `.env`, atau dependency
  tanpa persetujuan terpisah.
- Berhenti di akhir task ini dan menunggu persetujuan sebelum Sprint 3.

---

## 9. Ringkasan urutan pengerjaan

```text
2.0 Decision gate (D1 diputuskan: FR-09/FR-22 → Sprint 3; D2/D8 terselesaikan)
  └─ 2.1 Lookup + uang                         [DONE]
       ├─ 2.2 Risk score FR-22                 [DEFERRED ke Sprint 3]
       └─ 2.3 Buat order                       [DONE]
            └─ 2.4 List/detail                 [DONE]
                 ├─ 2.5 Cancel order FR-09     [DEFERRED ke Sprint 3]
                 └─ 2.6 Payment                [DONE]
                      └─ 2.7 Invoice PDF       [DONE]
                           └─ 2.8 Page Guard/menu [DONE]
                                ├─ 2.9 UI-06   [DONE]
                                ├─ 2.10 UI-07/08 [DONE]
                                └─ 2.11 UI-09  [DONE]
                                     └─ 2.12 Test & docs [DONE]
```

Task 2.2 dan 2.5 tidak dikerjakan pada Sprint 2 karena FR-22 dan FR-09 ditunda ke Sprint 3 sesuai
keputusan pengguna. Task lain selesai dan diverifikasi; rincian ada di `docs/SPRINT_2_FINAL_REPORT.md`.

---

## 10. Catatan rekomendasi task

**Task 2.1 — Backend lookup read-only customer/product + utilitas uang** telah dikerjakan sebagai task
pertama.

Alasan saat task dipilih:

- Tidak bergantung pada D1/D7/D8, sehingga bisa dimulai setelah planning ditinjau.
- Menyediakan data dan presisi uang yang dipakai oleh hampir semua task berikutnya.
- Risiko perubahan kecil: hanya model/service/validator/route baru; tidak menyentuh schema, seed, atau dependency.
- Validasi awal (`PLG-001`, `PLG-004`, `BRS-05`, konversi sen) langsung menguji asumsi kritis Sprint 2.

Task 2.1 telah dikerjakan dan ditutup pada 26-11-2026. Sprint 2 dilanjutkan hingga Task 2.12
pada hari yang sama. FR-09 dan FR-22 tetap ditunda ke Sprint 3, sehingga Task 2.2 dan 2.5
berstatus `DEFERRED` dan tidak termasuk klaim penyelesaian Sprint 2.
