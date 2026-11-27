# DistriFlow — Laporan Pengujian Sprint 3

Tanggal: 27 November 2026  
Lingkungan: backend Node.js/CommonJS, Jest 29 + Supertest, MySQL/MariaDB lokal.  
Tidak ada credential, `SESSION_SECRET`, atau hash yang dicetak pada log/laporan ini.

## 1. Status pengujian

| Item | Status | Hasil |
|---|---|---|
| `npm run lint` | COMPLETED | Lulus tanpa error (src, tests, scripts). |
| `npm test -- --silent` | COMPLETED | 22/22 suite, 354/354 test lulus. |
| Regresi endpoint lama | COMPLETED | Sprint 1, Sprint 2, Page Guard, dan kontrak API tetap lulus. |
| Integrasi database isolasi | COMPLETED | 9 kelompok pemeriksaan lulus; DB dibuat dan dibersihkan otomatis. |
| Verifikasi PDF riil | COMPLETED | Invoice Sprint 2, bukti pembayaran, dan laporan Sprint 3 menghasilkan buffer `%PDF`. |
| Verifikasi browser headless | BLOCKED | Tidak dijalankan; tidak ada klaim pengujian browser pada sesi ini. |
| Pengujian XLSX/PO/fitur backlog | NOT IMPLEMENTED | Fitur memang di luar ruang lingkup v1.0. |

## 2. Perintah dan hasil

Dijalankan dari direktori `backend`:

```text
npm run lint
> eslint src tests scripts --ext .js
(tanpa output error, exit 0)

npm test -- --silent
Test Suites: 22 passed, 22 total
Tests:       354 passed, 354 total
Snapshots:   0 total
```

Sebelum `sprint3Routes.test.js` ditambahkan, suite berada pada 21/21 dan 333/333 test.
Penambahan 21 test baru menaikkan total menjadi 354 tanpa melemahkan assertion lama.

## 3. Cakupan test otomatis

### Test baru

- `backend/tests/sprint3Routes.test.js` — 21 test kontrak/RBAC/validasi Sprint 3:
  - master produk: Admin only, `stock` ditolak saat create/update, harga > 0,
    `/restock` Admin+Gudang, PATCH boolean;
  - master pelanggan: Admin only, limit negatif ditolak, detail/PATCH terlindungi,
    tidak ada endpoint DELETE;
  - barang masuk: Admin+Gudang, `invoice_match` wajib true, qty >= 1,
    duplikat `409 needConfirm`, riwayat terpaginasi;
  - pembatalan order: Admin only, alasan wajib, error 409 dari service;
  - piutang: baca Admin/Kasir, bayar Kasir only, metode TUNAI/TRANSFER,
    nominal > 0, bukti PDF Kasir only;
  - laporan/KPI: Admin only untuk laporan, periode wajib dan terurut, PDF valid,
    KPI untuk semua role login dengan actor diteruskan ke service.

### Test lama yang diperbarui

- `backend/tests/pageGuard.test.js` — allowlist 16 halaman UI-01…UI-18,
  izin dan penolakan peran Sprint 3, guest diredirect ke login, path normalization
  dan 404 untuk HTML di luar allowlist.
- `backend/tests/pageRoutes.test.js` — halaman Sprint 3 dapat disajikan dari
  `frontend(new)`, penolakan peran, dan aset `layout.js`/`style.css` tetap termuat.

### Test yang membuktikan regresi penting

- `orderService.test.js` — pembuatan DRAFT, presisi uang, stok, retry nomor order.
- `paymentService.test.js` — pembayaran menurunkan stok dan menulis `KELUAR`.
  Ini dasar koreksi arah pengembalian stok pada pembatalan PIUTANG.
- `catalogRoutes.test.js`, `catalogService.test.js`, `catalogModel.test.js` —
  kontrak lama katalog tidak berubah.
- `pageGuard.test.js`, `uiMenu.test.js`, `frontendApi.test.js` — navigasi dan helper API.

## 4. Integrasi database isolasi

Skrip: `backend/scripts/verify-sprint3-db.js`.

Skrip membuat database baru dengan pola `test_verify_sprint3_<timestamp>` dari salinan
`01_schema.sql` dan `02_seed.sql`, menjalankan alur nyata melalui Supertest terhadap
`app`, lalu menghapus database tersebut pada `finally`. Database utama `distriflow`
tidak dibuka untuk tulis, tidak di-reset, dan tidak di-seed ulang. Akun seed dipakai
hanya untuk login dalam database isolasi; kredensial tidak dicetak.

Hasil yang benar-benar dijalankan:

1. Database isolasi dibuat dari schema + seed.
2. Empat peran login memakai sesi MySQL.
3. RBAC nyata menolak 401/403 untuk peran yang tidak berhak.
4. Produk dibuat tanpa stok awal; duplikat 409; field `stock` ditolak; update,
   nonaktif (tersembunyi dari daftar), dan aktif kembali berfungsi.
5. Barang masuk menambah stok secara atomik; duplikat meminta konfirmasi;
   riwayat terbaca.
6. Piutang dibaca Kasir; pembayaran sebagian tercatat; pengiriman ulang identik
   tidak membuat payment kedua; kelebihan bayar ditolak; bukti PDF sah.
7. Pembatalan DRAFT oleh Admin tidak mengubah stok dan pengulangan menghasilkan 409.
8. Pembatalan PIUTANG mengembalikan stok produk 1 dan 4 serta menulis dua movement
   `BATAL` dengan `reference` nomor order yang sama.
9. Laporan dan PDF mengecualikan `BATAL` (jumlah order cocok dengan query SQL
   `LUNAS + PIUTANG`); KPI Gudang mengembalikan angka keuangan nol; restock
   mencantumkan produk dengan stok di bawah minimum.

Ringkasan keluaran skrip:

```text
Sprint 3 database integration: 9 kelompok pemeriksaan lulus.
Database isolasi dibersihkan.
```

## 5. Verifikasi statis frontend

- `node --check` lulus untuk semua file JavaScript yang diubah pada `frontend(new)`.
- `npm run lint` mencakup backend saja sesuai konvensi proyek; tidak ada build step
  untuk frontend.
- Pemindaian teks memastikan tidak ada `innerHTML` untuk data server, tidak ada
  `localStorage` sebagai pengganti API, dan tidak ada angka contoh yang dipakai
  sebagai data nyata.
- Tombol yang masih dinonaktifkan (XLSX, PO, kategori/rak, edit order, dan
  fitur backlog lain) disertai pesan yang jujur, bukan data rekaan.

## 6. Batasan pengujian

- COMPLETED WITH LIMITATIONS: pengujian database integrasi memakai satu putaran
  data seed per database isolasi; api skenario konkurensi tingkat tinggi diuji lewat
  unit test/transaksi mock, bukan beban paralel nyata.
- COMPLETED WITH LIMITATIONS: `note` pada barang masuk tidak diverifikasi sebagai
  data tersimpan karena kolom tersebut memang tidak ada pada schema kanonik.
- BLOCKED: tidak ada verifikasi browser headless Chromium pada sesi ini. Alur UI
  diverifikasi lewat test page guard/page route dan integrasi API, bukan klik browser.
- NOT IMPLEMENTED: tidak ada test untuk XLSX/PO/fitur backlog karena fitur tersebut
  tidak diimplementasikan.

## 7. Kesimpulan

Status pengujian keseluruhan: **COMPLETED WITH LIMITATIONS**. Semua fitur Sprint 3
yang diimplementasikan memiliki cakupan test otomatis dan telah dijalankan dengan
hasil lulus. Batasannya hanya pada verifikasi browser end-to-end dan fitur yang
memang sengaja berada di luar ruang lingkup v1.0.
