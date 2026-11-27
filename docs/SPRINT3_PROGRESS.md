# Sprint 3 — Progres Pengerjaan (final)

Dibuat: 27 November 2026.  
Status akhir: **COMPLETED WITH LIMITATIONS** (lihat bagian 6).

## 1. Kondisi awal (dicatat sebelum perubahan)

- Branch: `main`.
- HEAD: `87fb4ae Merge branch 'main' of https://github.com/jekiiis/DistriFlow`.
- `git status --short` awal:
  - untracked: `docs/POST_UI_AUDIT.md`, `docs/UI_COMPLETION_BACKEND_GAP.md`,
    `docs/UI_COMPLETION_REPORT.md`, `frontend(new)/`, `frontend/js/layout.js`,
    `frontend/js/pages/`, dan 7 halaman baru di `frontend/pages/`.
- `git status --ignored --short` menambahkan ignored: `AGENTS.md`, PDF sumber, `figma/`,
  `backend/.env`, `backend/node_modules/`.
- Tidak ada commit, push, reset, pergantian branch, atau penghapusan perubahan kerja.

## 2. Keputusan ruang lingkup berdasarkan dokumen otoritatif

Sprint 3 = **FR-09 dan FR-13…FR-22** (SKPL Revisi C hlm. 12–14, Tabel 5).

Dalam ruang lingkup:

- FR-09 pembatalan order.
- FR-13 kelola barang.
- FR-14 barang masuk.
- FR-15 peringatan stok minimum.
- FR-16 kelola pelanggan.
- FR-17 daftar piutang.
- FR-18 pelunasan piutang + bukti PDF.
- FR-19 laporan penjualan + ekspor PDF.
- FR-20 KPI dashboard.
- FR-21 rekomendasi restock.
- FR-22 label risiko pelanggan (keputusan biner yang disetujui).
- Integrasi `frontend(new)/` sebagai frontend utama dengan `frontend/` sebagai backup.

Di luar v1.0 / backlog (sesuai `docs/ASSUMPTIONS.md`):

- Purchase Order dan master pemasok.
- Ekspor XLSX/Excel.
- Kategori, rak/lokasi rak, valuasi persediaan, DSI.
- WhatsApp/SMS, auto-lock, Faktur Hold 50%.
- ID audit / klaim “DATA FINAL”.
- PPN, surat jalan otomatis, cetak barcode.

Tidak ada perubahan schema yang diperlukan: DPPL Revisi C §3.4 sudah menyediakan seluruh
field yang dibutuhkan pada 7 tabel bisnis. Schema, seed, `.env`, dan dependency tidak diubah.

## 3. Aturan otoritatif yang dipakai

- FR-09: **Admin saja**, order **DRAFT/PIUTANG**, alasan wajib, stok dikembalikan
  hanya untuk PIUTANG; uang muka dikembalikan manual di luar sistem.
- FR-13: **Admin** mengelola master barang. `stock` bukan field pembuatan produk;
  stok masuk hanya melalui FR-14. Edit produk tidak mengubah stok.
- FR-14: **Gudang** mencatat barang masuk; Admin juga diizinkan oleh allowlist.
  Duplikat nomor dokumen = peringatan + konfirmasi (`needConfirm`), bukan blokir.
- FR-16: **Admin** membuat/mengubah/menonaktifkan pelanggan; Sales & Kasir
  hanya melihat. Tidak ada endpoint hapus pelanggan.
- FR-17/18: **Kasir** melihat/melunasi piutang; pembayaran sebagian boleh;
  bukti PDF wajib (`GET /api/payments/:id/receipt.pdf`).
- FR-19: **Admin** melihat/ekspor laporan; omzet = Lunas + Piutang,
  bukan uang yang sudah diterima. XLSX tidak termasuk v1.0.
- FR-20/21: KPI omzet hari ini, order hari ini (tanpa BATAL), piutang jatuh
  tempo, stok menipis, perlu restock (≤7 hari atau ≤ stok minimum; rata-rata
  30 hari Lunas+Piutang; `RESTOCK_DAYS=14`).
- FR-22: ambang 80% hanya untuk `credit_limit > 0`. Sesuai keputusan yang
  disetujui, hasilnya `Aman` atau `Berisiko`; tidak ada `risk_score`.
- Gudang tidak melihat Pelanggan/Laporan dan tidak menerima angka keuangan.

## 4. Status rencana kerja

| No | Task | Status |
|---|---|---|
| 1 | Audit repository, dokumen kebutuhan, backend, database, dan frontend | COMPLETED |
| 2 | Pemetaan kontrak endpoint dan pembagian file tanpa konflik | COMPLETED |
| 3 | Routing + integrasi frontend utama (`app.js`, `pageGuard.js`, UI-01…UI-18) | COMPLETED |
| 4 | Master produk + restock (FR-13/FR-15/FR-21) | COMPLETED |
| 5 | Barang masuk (FR-14) | COMPLETED |
| 6 | Master pelanggan (FR-16) | COMPLETED |
| 7 | Pembatalan order (FR-09) | COMPLETED |
| 8 | Piutang, pelunasan, bukti PDF, risiko kredit (FR-17/FR-18/FR-22) | COMPLETED |
| 9 | Dashboard KPI, laporan, ekspor PDF (FR-19/FR-20) | COMPLETED |
| 10 | Test unit/route + regression | COMPLETED |
| 11 | Verifikasi database isolasi | COMPLETED |
| 12 | Dokumentasi akhir (`API.md` + 3 laporan Sprint 3 + changelog) | COMPLETED |
| 13 | Verifikasi browser end-to-end headless | BLOCKED |

## 5. Hasil verifikasi akhir

Dijalankan dari direktori `backend` setelah seluruh edit kode dan dokumen selesai:

```text
node --check js/pages/change-password.js        -> OK
node --check js/pages/users-shell.js            -> OK
npm run lint                                    -> exit 0, tanpa error
npm test -- --silent                            -> 22/22 suite, 354/354 test lulus
node scripts/verify-sprint3-db.js               -> 9 kelompok pemeriksaan lulus
                                                   Database isolasi dibersihkan.
```

Database utama `distriflow` tidak di-reset, di-seed ulang, atau dimodifikasi.
Database isolasi memakai pola `test_verify_sprint3_<timestamp>` dan dihapus setelah verifikasi.
Kredensial, `SESSION_SECRET`, dan hash tidak dicetak.

Dokumen akhir:

- `docs/API.md` — 36 endpoint aktif dengan kontrak Sprint 3.
- `docs/SPRINT3_IMPLEMENTATION_REPORT.md` — status implementasi dan keputusan.
- `docs/SPRINT3_TEST_REPORT.md` — hasil pengujian yang benar-benar dijalankan.
- `docs/SPRINT3_BACKEND_CHANGELOG.md` — perubahan backend per layer dan endpoint.
- `docs/SPRINT3_PROGRESS.md` — dokumen ini.

## 6. Status akhir dan batasan

| Area | Status |
|---|---|
| Backend FR-09, FR-13–FR-22, 19 endpoint baru | COMPLETED |
| Integrasi `frontend(new)` dan Page Guard 16 halaman | COMPLETED |
| Test otomatis, lint, dan integrasi DB isolasi | COMPLETED |
| `stock_movements.note` tidak dipersisten | COMPLETED WITH LIMITATIONS |
| Filter/KPI risiko pada daftar piutang hanya per halaman termuat | COMPLETED WITH LIMITATIONS |
| Pembatalan dari daftar order memakai `window.prompt` | COMPLETED WITH LIMITATIONS |
| Verifikasi browser headless | BLOCKED |
| XLSX, PO/supplier, kategori/rak, valuasi, DSI, WhatsApp/SMS, auto-lock, Faktur Hold 50% | NOT IMPLEMENTED |

`AGENTS.md` masih berisi catatan lama bahwa Sprint 2/3 belum dikerjakan. File itu sengaja
tidak diubah karena merupakan panduan agen; status aktual mengikuti dokumen Sprint 3 ini.
Perubahan pada UI-01…UI-05 hanya menyelaraskan matriks role dan mengaktifkan tautan menu
yang sudah tersedia, tanpa mendesain ulang tampilan yang telah disetujui.

## 7. Kondisi akhir repository

- Branch: `main`; HEAD tetap `87fb4ae`.
- `git status --short`: 60 entri (18 modified, 42 untracked) sebelum penulisan dokumen ini;
  isi dokumen ini diperbarui setelah penghitungan tersebut, sehingga jumlah entri tidak berubah.
- `git status --ignored --short`: 67 entri termasuk ignored bawaan proyek.
- Tidak ada commit, push, reset, pergantian branch, penghapusan file, atau cleanup.
- Folder `frontend/` lama tetap ada sebagai backup; `frontend(new)` menjadi frontend aktif.
- Semua perubahan tersedia di working tree untuk ditinjau.
