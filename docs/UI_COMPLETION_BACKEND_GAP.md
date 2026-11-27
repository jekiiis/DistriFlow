# DistriFlow — Backend Gap & Klasifikasi Endpoint UI-06…UI-18

Tanggal audit: 27 November 2026.

Dokumen ini melengkapi `docs/UI_COMPLETION_REPORT.md`. Rujukan kebutuhan tetap
**SKPL-DF-001 Revisi C** dan **DPPL-DF-001 Revisi C**; rujukan visual adalah
`figma/Export Figma.pdf`. Tidak ada file sumber, backend, schema, seed, `.env`, dependency,
endpoint, atau konfigurasi yang diubah saat mengerjakan UI-06…UI-18. Semua pekerjaan bersifat
lokal dan belum di-commit atau di-push.

## 1. Klasifikasi yang dipakai

| Kelas | Arti | Perlakuan di frontend |
|---:|---|---|
| **1** | Endpoint nyata tersedia, kontrak dan perilaku sesuai API.md, serta dapat dipakai langsung. | Dipanggil langsung; hasil ditampilkan dengan `textContent`. |
| **2** | Endpoint tersedia tetapi terbatas (role tertentu, data turunan, atau tidak membawa semua field rancangan). | Dipakai dengan batasan yang dinyatakan di UI; tidak ada simulasi field tambahan. |
| **3** | Endpoint belum tersedia (backend gap / Sprint 3). | Tombol dinonaktifkan atau halaman diberi catatan gap; tidak ada mock endpoint. |
| **4** | Rancangan Figma bertentangan dengan keputusan yang sudah disetujui. | Tidak diimplementasikan; dilaporkan sebagai konflik. |
| **5** | Endpoint ada, tetapi verifikasi penuh tidak dilakukan atau terkena limitasi alat uji. | Dinyatakan sebagai keterbatasan verifikasi, bukan sebagai kegagalan endpoint. |

## 2. Endpoint aktual (17 endpoint)

Sumber kontrak: `docs/API.md`. Jumlah ini tidak berubah selama pengerjaan UI-06…UI-18.

| # | Method | URL | Role | Kelas | Pemakaian / catatan |
|---:|---|---|---|---:|---|
| 1 | `POST` | `/api/auth/login` | Publik | 1 | Semua sesi uji browser dibuat lewat endpoint nyata. |
| 2 | `POST` | `/api/auth/logout` | Semua role login | 1 | Dipakai Layout saat keluar; sesi dihancurkan backend. |
| 3 | `GET` | `/api/auth/me` | Semua role login | 1 | Sumber sesi, nama, dan role untuk sidebar/guard UI-06…UI-18. |
| 4 | `PUT` | `/api/auth/password` | Semua role login | 1 | Milik UI-03; tidak diubah dan tidak dijalankan ulang dalam task ini. |
| 5 | `GET` | `/api/users` | ADMIN | 1 | Milik UI-04; tidak diubah. |
| 6 | `GET` | `/api/users/:id` | ADMIN | 1 | Milik UI-05; tidak diubah. |
| 7 | `POST` | `/api/users` | ADMIN | 5 | Endpoint ada dan lolos test, tetapi mutasi nyata tidak dijalankan ulang; verifikasi UI-05 sebelumnya hanya memakai stub pemverifikasi payload. |
| 8 | `PUT` | `/api/users/:id` | ADMIN | 5 | Endpoint ada dan lolos test, tetapi mutasi nyata (ubah data pengguna) sengaja tidak dijalankan agar data tidak berubah. |
| 9 | `GET` | `/api/customers` | ADMIN, SALES, KASIR | 1 | UI-13/14/15/16/17. Pencarian dan pagination nyata. |
| 10 | `GET` | `/api/customers/:id/credit` | ADMIN, SALES | 2 | UI-14 memakainya untuk ADMIN/SALES. KASIR sengaja tidak memanggilnya; response tidak memiliki `risk_score`/`risk_label`. |
| 11 | `GET` | `/api/products` | Semua role login | 1 | UI-11 dan UI-13. Hanya mengembalikan produk aktif. |
| 12 | `GET` | `/api/products/by-code/:code` | ADMIN, SALES | 1 | UI-12 untuk pengecekan kode nyata. KASIR ditolak 403 oleh backend. |
| 13 | `POST` | `/api/orders` | ADMIN, SALES | 1 | UI-06. Alur nyata dibuktikan pada harness Sprint 2 dengan database isolasi; tidak dibuat order baru pada task ini. |
| 14 | `GET` | `/api/orders` | ADMIN, SALES, KASIR | 1 | UI-07, UI-16, UI-18. Filter status/tanggal dan pagination nyata. |
| 15 | `GET` | `/api/orders/:id` | ADMIN, SALES, KASIR | 1 | UI-08, UI-16, UI-18. `items[]` dan `payments[]` nyata. |
| 16 | `POST` | `/api/orders/:id/payments` | KASIR | 1 | UI-09. Alur nyata terverifikasi pada draft sekali pakai; endpoint hanya menerima order `DRAFT`. |
| 17 | `GET` | `/api/orders/:id/invoice.pdf` | ADMIN, KASIR | 5 | UI-10. Probe Node melalui proxy menghasilkan `200 application/pdf` untuk `a4` dan `80mm`; Chrome headless mengganti fetch/navigasi PDF menjadi `204` kosong. |

Catatan penting untuk endpoint 16: order yang sudah `LUNAS` atau `PIUTANG` ditolak dengan
`409 Order sudah diproses`. Karena itu UI-17 **tidak** memakai endpoint pembayaran untuk
melunasi piutang; tombol pelunasan dinonaktifkan dan dinyatakan sebagai gap.

## 3. Endpoint yang belum tersedia (kelas 3)

| UI | Fitur rancangan | Endpoint yang dibutuhkan | Status frontend |
|---|---|---|---|
| UI-08 | Batalkan / ubah order | `POST /api/orders/:id/cancel` atau `PUT /api/orders/:id` | Aksi dinonaktifkan dengan catatan gap; tidak ada perubahan status `BATAL`. |
| UI-11 | Tambah barang | `POST /api/products` | Tombol **Tambah** dinonaktifkan. |
| UI-11 | Ubah / nonaktifkan barang | `PUT` / `PATCH /api/products/:id` | Tombol perbaris dinonaktifkan. |
| UI-11 | Kategori, rak, valuasi, DSI, perkiraan habis | Endpoint master/agregat barang | Kolom ditandai “Tidak tersedia”; tidak dihitung secara rekaan. |
| UI-11 | Purchase Order pemasok | `POST /api/purchase-orders` dan data pemasok | Tombol PO dinonaktifkan. |
| UI-11 | Ekspor daftar barang | Endpoint ekspor | Tombol ekspor dinonaktifkan. |
| UI-12 | Simpan barang baru | `POST /api/products` | Form read-only; tombol simpan dinonaktifkan. |
| UI-13 | Catat barang masuk | `POST /api/stock-in` | Form read-only; tombol simpan dinonaktifkan; stok tidak diubah. |
| UI-13 | Log penerimaan, pemasok, lokasi rak | Endpoint log/master terkait | Tabel log menampilkan pesan gap. |
| UI-14 | Tambah / ubah pelanggan | `POST /api/customers`, `PUT /api/customers/:id` | Tombol tambah/ubah dinonaktifkan. |
| UI-14 | Status pelanggan, skor/label risiko resmi | Field atau endpoint risk | Status hanya “Aktif” dari data aktif API; risiko dihitung lokal untuk ADMIN/SALES dengan ambang 80%. |
| UI-15 | Simpan pelanggan baru | `POST /api/customers` | Form read-only; tombol simpan dinonaktifkan. |
| UI-15 | WhatsApp/SMS, auto-lock faktur | Endpoint notifikasi/locking | Tidak diimplementasikan sesuai keputusan yang disetujui. |
| UI-16 | Daftar piutang resmi | `GET /api/receivables` | Diturunkan dari `GET /api/orders?status=PIUTANG` dan `GET /api/orders/:id` (maks. 100 order). |
| UI-16 | Ekspor XLS, tertagih bulan ini | Endpoint agregat/ekspor pembayaran | Tombol ekspor dinonaktifkan; KPI ditandai “Tidak tersedia”. |
| UI-17 | Pelunasan piutang | `POST /api/receivables/:id/pay` | Tombol simpan dinonaktifkan; endpoint pembayaran yang ada menolak order non-`DRAFT`. |
| UI-17 | Bukti pelunasan / cetak POS | `GET /api/payments/:id/receipt.pdf` atau print service | Tidak tersedia; modal memberi catatan gap. |
| UI-18 | Laporan penjualan resmi | `GET /api/reports/sales` | Agregat lokal dari maks. 100 order nyata. |
| UI-18 | Ekspor PDF/XLSX | Endpoint ekspor laporan | Tombol dinonaktifkan. |
| UI-18 | Kategori, ID audit, “DATA FINAL” | Field kategori dan audit trail | Tidak diklaim; badge memakai `DATA API`. |

### 3.1 Backend page guard

`backend/src/middleware/pageGuard.js` tetap memuat **9 halaman** yang sudah diizinkan pada Sprint 1
dan Sprint 2: `login.html`, `dashboard.html`, `change-password.html`, `users.html`,
`user-form.html`, `sales-order.html`, `orders.html`, `order-detail.html`, dan `payment.html`.

Halaman UI-11…UI-18 (`products.html`, `product-form.html`, `stock-in.html`, `customers.html`,
`customer-form.html`, `receivables.html`, `reports.html`) **tidak masuk allowlist**. Karena backend
tidak diubah, mode yang disajikan langsung oleh backend akan menolak halaman-halaman tersebut
(404/redirect sesuai guard). Verifikasi browser pada task ini memakai server statis
`http://127.0.0.1:3001` yang melayani `frontend(new)` dan mem-proxy `/api/*`; API tetap berasal dari
backend nyata. Ini adalah gap backend yang harus diselesaikan terpisah, bukan dengan mengubah
allowlist di task ini.

## 4. Konflik rancangan vs keputusan yang disetujui (kelas 4)

| Topik | Figma / rancangan | Keputusan otoritatif | Tindakan |
|---|---|---|---|
| PPN | Beberapa layar menampilkan PPN | Total = `subtotal − diskon`; tanpa PPN | Tidak diimplementasikan. |
| UI-14 ambang risiko | 75% | **≥ 80%** dari limit kredit, hanya bila limit > 0 | Memakai 80%; teks UI sesuai `AGENTS.md`. |
| Faktur Hold 50% | Hold otomatis saat piutang 50% | Tidak diimplementasikan; limit ditegakkan saat pembayaran | Tidak diimplementasikan. |
| Auto-lock & WhatsApp/SMS | Penguncian faktur dan pengingat otomatis | Tidak diimplementasikan | Tidak diimplementasikan. |
| UI-13 duplikasi dokumen | “Memblokir” nomor dokumen ganda | Peringatan + konfirmasi | Modal memakai peringatan + konfirmasi; tombol konfirmasi tetap dinonaktifkan karena endpoint belum ada. |
| UI-06 pembayaran | Field/metode bayar pada form order | Pembayaran hanya di UI-09 (UC-04) | Tidak diimplementasikan di UI-06. |
| UI-11 valuasi/DSI/PO | Angka valuasi, DSI, perkiraan habis, PO | Tidak ada endpoint resmi | Ditandai tidak tersedia; tidak dibuat angka rekaan. |
| UI-18 ekspor & audit | PDF/XLSX, ID audit, label “DATA FINAL” | Tidak ada endpoint ekspor/audit | Tombol dinonaktifkan; badge `DATA API`. |
| UI-08 batal/ubah | Tombol aksiorder | FR-09 ditunda Sprint 3 | Aksi dinonaktifkan. |

Semua konflik di atas **dilaporkan, bukan diputuskan sendiri**. Tidak ada perubahan pada SKPL,
DPPL, User Manual, Figma, atau `docs/ASSUMPTIONS.md`.

## 5. Keterbatasan verifikasi (kelas 5)

| Item | Bukti yang ada | Keterbatasan |
|---|---|---|
| UI-05 `POST /api/users` | Endpoint ada, terdaftar di `docs/API.md`, dan lolos `npm test`. | Tidak ada mutasi pengguna nyata yang dijalankan ulang pada task ini; verifikasi UI-05 sebelumnya memakai stub pemverifikasi payload. |
| UI-05 `PUT /api/users/:id` | Endpoint ada dan lolos `npm test`. | Tidak ada perubahan data pengguna yang sengaja dilakukan, sesuai aturan data safety. |
| UI-06 `POST /api/orders` | Alur nyata terverifikasi pada harness Sprint 2 dengan database isolasi. | Tidak ada order baru yang dibuat pada task ini agar data produksi tidak bertambah. |
| UI-09 `POST /api/orders/:id/payments` | Alur nyata terverifikasi sebelumnya lewat UI pada draft sekali pakai. | Tidak diulang karena order yang sudah diproses akan ditolak 409. |
| UI-10 `GET /api/orders/:id/invoice.pdf` | Probe Node melalui proxy: `200`, `application/pdf`, `%PDF`, 5009 byte (`a4`) dan 4954 byte (`80mm`). | Fetch/navigasi Chrome headless mengembalikan `204`/0 byte. Ini adalah perilaku viewer PDF headless, bukan perubahan endpoint; backend tidak diubah. |
| UI-11…UI-18 | Verifikasi browser penuh memakai server statis + API backend nyata. | Tidak diverifikasi lewat backend-served routing karena page guard belum memuat halaman-halaman ini. |

## 6. Ringkasan kepatuhan

- Tidak ada mock endpoint, payload rekaan, atau penyimpanan lokal sebagai pengganti API.
- Tidak ada `innerHTML` aktif untuk data API; render memakai `textContent` melalui `UI.el`/`UI.td`.
- Tidak ada kredensial, hash, atau cookie yang ditulis ke source atau dicetak pada log/laporan.
- Tidak ada perubahan pada backend, database, schema, migration, seed, `.env`, dependency, atau
  dokumen sumber.
- Tidak ada `git commit`, `git push`, `reset --hard`, perubahan branch, atau penghapusan file kerja.
- Pekerjaan berhenti di UI-18; tidak ada task Sprint 3 yang dikerjakan.
