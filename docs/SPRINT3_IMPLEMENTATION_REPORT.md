# DistriFlow — Laporan Implementasi Sprint 3

Tanggal: 27 November 2026  
Cabang: `main`, HEAD awal `87fb4ae`. Tidak ada commit, push, reset, atau perpindahan cabang.

## 1. Status keseluruhan

| Area | Status | Keterangan |
|---|---|---|
| Backend FR-09, FR-13–FR-22 | COMPLETED | 19 endpoint Sprint 3 aktif dan terpasang di `/api`. |
| Integrasi `frontend(new)` | COMPLETED | Backend melayani `frontend(new)`; 16 halaman memakai API nyata. |
| Perbaikan aturan bisnis | COMPLETED | Stok DRAFT tidak berubah; stok PIUTANG dikembalikan saat batal. |
| Pengujian otomatis + DB isolasi | COMPLETED | 354 test Jest lulus; 9 kelompok integrasi DB isolasi lulus. |
| Bukti PDF laporan & piutang | COMPLETED | PDF riil via pdfkit, tidak menulis data, `Cache-Control: no-store`. |
| Catatan `note` barang masuk | COMPLETED WITH LIMITATIONS | Divalidasi tetapi tidak dipersisten; skema tidak memiliki kolom `note`. |
| Filter/KPI risiko pada daftar piutang | COMPLETED WITH LIMITATIONS | Risiko dihitung backend per baris; filter/KPI ringkas hanya untuk halaman termuat. |
| Verifikasi browser end-to-end headless | BLOCKED | Tidak dijalankan pada sesi ini; tidak ada klaim pengujian browser. |
| XLSX, PO/supplier, kategori/rak, valuasi, DSI, WhatsApp/SMS, auto-lock, Faktur Hold 50% | NOT IMPLEMENTED | Sesuai keputusan backlog v1.0; tombol tetap dinonaktifkan dengan catatan jujur. |

## 2. Ruang lingkup

Sprint 3 mengerjakan FR-09 dan FR-13–FR-22:

- FR-09: pembatalan order oleh Admin (DRAFT/PIUTANG, alasan wajib, stok PIUTANG dikembalikan).
- FR-13/FR-15: master barang Admin, stok awal hanya lewat barang masuk, stok menipis.
- FR-14: pencatatan barang masuk oleh Gudang (Admin juga diizinkan), duplikat dokumen
  = konfirmasi, bukan pemblokiran.
- FR-16: master pelanggan Admin; Sales/Kasir read-only; tanpa delete permanen.
- FR-17/FR-18: piutang dan pelunasan Kasir, pembayaran sebagian, bukti PDF.
- FR-19: laporan penjualan Admin + ekspor PDF; omzet `LUNAS + PIUTANG`, tanpa PPN.
- FR-20/FR-21: KPI dashboard dan rekomendasi restock berbasis data 30 hari.
- FR-22: label risiko biner `Aman`/`Berisiko` pada ambang 80% bila limit > 0.

Tidak ada migrasi schema. Tujuh tabel bisnis pada `database/01_schema.sql` sudah mencukupi.
Database utama `distriflow`, akun seed, password, dan `.env` tidak diubah.

## 3. Arsitektur dan perubahan backend

Alur tetap mengikuti konvensi proyek:

```text
routes → middleware (requireLogin/requireRole/express-validator/validate)
       → controller → service → model (getExecutor/pool.execute + placeholder ?)
       → helpers/response
```

### Endpoint baru (19)

| Area | Endpoint | Role |
|---|---|---|
| Produk | `GET /api/products/restock` | ADMIN, GUDANG |
| Produk | `GET /api/products/:id`, `POST /api/products`, `PUT /api/products/:id`, `PATCH /api/products/:id` | ADMIN (detail juga GUDANG) |
| Pelanggan | `GET /api/customers/:id`, `POST /api/customers`, `PUT /api/customers/:id`, `PATCH /api/customers/:id` | ADMIN |
| Barang masuk | `POST /api/stock-in`, `GET /api/stock-in` | ADMIN, GUDANG |
| Order | `POST /api/orders/:id/cancel` | ADMIN |
| Piutang | `GET /api/receivables`, `GET /api/receivables/:id` | ADMIN, KASIR |
| Piutang | `POST /api/receivables/:id/pay` | KASIR |
| Bukti | `GET /api/payments/:id/receipt.pdf` | KASIR |
| Laporan | `GET /api/reports/sales`, `GET /api/reports/sales.pdf` | ADMIN |
| Dashboard | `GET /api/dashboard/kpi` | Semua role login |

Kontrak lengkap, payload, dan pesan error ada di `docs/API.md`.

### Aturan transaksi yang diterapkan

- **Barang masuk:** satu `withTransaction()` untuk lock produk → cek aktif → cek duplikat
  `reference` → insert `stock_movements.MASUK` → increment stok. Duplikat tanpa konfirmasi
  menjawab `409 { needConfirm: true }`; dengan `confirm_duplicate: true` tetap dicatat.
- **Pembatalan PIUTANG:** order dikunci `FOR UPDATE`, status dicek ulang, produk dikunci
  berurutan berdasarkan id, stok **ditambah** kembali, movement `BATAL` ditulis, status
  berubah dengan update bersyarat. DRAFT sama sekali tidak menyentuh stok.
  Arah ini dikoreksi setelah verifikasi bahwa `paymentService` sudah mengurangi stok saat
  pembayaran (termasuk pembayaran kredit yang menghasilkan PIUTANG).
- **Pelunasan piutang:** satu transaksi untuk lock order → hitung ulang outstanding →
  cek duplikat → insert `payments` → update `LUNAS` bersyarat. Idempotency memakai
  `reference` yang disimpan sebagai awalan `REF:` pada `note` (tanpa kolom baru).
- **Laporan dan KPI:** agregasi dilakukan di SQL, tidak dengan mengambil maksimal 100
  baris lalu menjumlahkannya di JavaScript.

## 4. Integrasi frontend

`backend/src/app.js` sekarang memakai `frontend(new)` sebagai root statis dan direktori
Page Guard. Folder lama `frontend/` dibiarkan utuh sebagai backup.

- 16 halaman terdaftar pada allowlist kanonik `pageGuard.js` dengan matriks peran yang
  sama dengan `layout.js`, `dashboard.js`, `users-shell.js`, dan `change-password.js`.
- UI-11/UI-12: daftar barang, tambah/ubah, nonaktifkan, restock nyata. Gudang hanya melihat.
- UI-13: pencarian barang, pencatatan barang masuk, konfirmasi duplikat, riwayat nyata.
- UI-14/UI-15: daftar dan form pelanggan; tulis hanya Admin.
- UI-16/UI-17: daftar piutang dan pelunasan Kasir dengan bukti PDF.
- UI-18: laporan penjualan Admin dengan PDF; KPI dan stok menipis pada dashboard.
- UI-07/UI-08: aksi batal Admin untuk DRAFT/PIUTANG; edit order tetap dinonaktifkan
  karena tidak ada endpoint edit di v1.0.
- Semua data dari API dirender dengan `textContent`. Tidak ada `localStorage` sebagai
  pengganti API, tidak ada endpoint/mock rekaan, dan tombol yang belum termasuk v1.0
  tetap dinonaktifkan dengan pesan backlog yang jujur.

Perubahan pada `users-shell.js` dan `change-password.js` hanya menyelaraskan matriks role
serta mengaktifkan tautan menu yang sebelumnya ditandai «belum tersedia». Susunan visual
UI-01–UI-05 tidak didesain ulang.

## 5. Keputusan, konflik, dan batasan

1. **FR-22 conflicts with approved decision.** SKPL menyebut skor `0 = Aman`,
   `1 = Waspada`, `2–3 = Berisiko`, tetapi keputusan pengguna yang disetujui di
   `docs/ASSUMPTIONS.md` dan teks UI-14 memakai ambang biner 80%. Implementasi mengikuti
   keputusan yang disetujui: `risk = "Aman" | "Berisiko"`, tanpa `risk_score`.
2. **`stock_movements.note` tidak ada pada schema.** `note` barang masuk divalidasi
   tetapi tidak disimpan; skema kanonik sengaja tidak diubah.
3. **Daftar piutang tidak punya endpoint agregat.** Filter risiko dan kartu ringkas pada
   UI-16 hanya menghitung halaman yang sedang dimuat. Label `risk` per baris tetap
   berasal dari backend dan memakai total piutang pelanggan yang benar.
4. **Pembatalan dari daftar order memakai `window.prompt`.** Tidak ada modal batal pada
   rancangan UI-07 dan perubahan CSS berada di luar ruang lingkup. Detail order memakai
   kartu batal yang sudah ada dengan textarea alasan.
5. **`AGENTS.md` masih menyatakan Sprint 2/3 belum dikerjakan.** File ini tidak diubah
   karena merupakan panduan agen dan tidak termasuk dokumen kebutuhan yang disetujui.
   Status aktual mengikuti laporan ini dan `docs/SPRINT3_PROGRESS.md`.
6. Folder `frontend/` lama berisi perubahan yang sudah ada sebelum sesi ini
   (`frontend/js/layout.js`, `frontend/js/pages/`, dan tujuh halaman HTML). File-file itu
   tidak dihapus atau ditimpa.

## 6. Status pekerjaan yang belum selesai

- NOT IMPLEMENTED: XLSX, PO/supplier, kategori/rak, valuasi, DSI, notifikasi
  WhatsApp/SMS, auto-lock faktur, dan Faktur Hold 50%. Semua masuk backlog v1.0.
- BLOCKED: verifikasi browser end-to-end dengan Chrome headless belum dijalankan.
  Pengujian yang benar-benar dijalankan tercatat di `docs/SPRINT3_TEST_REPORT.md`.
- COMPLETED WITH LIMITATIONS: tiga batasan pada bagian 5 (note, filter piutang,
  prompt pembatalan).

Tidak ada commit atau push. Perubahan tersedia di working tree untuk ditinjau.
