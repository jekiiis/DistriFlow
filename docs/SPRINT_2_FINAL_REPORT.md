# DistriFlow — Laporan Akhir Sprint 2 (UC-03 & UC-04)

Tanggal penutupan: 26 November 2026.

Dokumen ini melaporkan hasil akhir Sprint 2 berdasarkan kondisi implementasi aktual di repository.
Rujukan kebutuhan tetap **SKPL-DF-001 Revisi C** dan **DPPL-DF-001 Revisi C**. Dokumen sumber
(`SKPL DistriFlow (1).pdf`, `DPPL DistriFlow.pdf`, `User Manual DistriFlow.pdf`, dan
`figma/Export Figma.pdf`) tidak diubah. Schema, seed, `.env`, dependency, dan `AGENTS.md` juga
tidak diubah. Semua perubahan masih **lokal dan belum di-commit atau di-push**.

## 1. Ringkasan eksekutif

| Area | Status | Catatan |
|---|---|---|
| Backend UC-03 (order DRAFT, list, detail) | **DONE** | Termasuk perbaikan bug nomor order dan test regresi. |
| Backend UC-04 (pembayaran, stok, piutang, invoice) | **DONE** | Transaksi, rollback, dan PDF terverifikasi. |
| Frontend UI-06…UI-09 | **DONE** | Page Guard, role, dan alur utama tersedia. |
| Dokumentasi teknis | **DONE** | `docs/API.md`, README, planning, dan laporan ini. |
| FR-09 pembatalan order | **DEFERRED** | Sengaja ditunda ke Sprint 3 sesuai keputusan pengguna. |
| FR-22 `risk_score`/`risk_label` | **DEFERRED** | Sengaja ditunda ke Sprint 3 sesuai keputusan pengguna. |
| Commit/push | **Tidak dilakukan** | Sesuai instruksi; semua perubahan tetap lokal. |

Sprint 2 dinyatakan **DONE untuk task dalam ruang lingkup yang disetujui** (2.1, 2.3, 2.4,
dan 2.6–2.12). Task 2.2 dan 2.5 berstatus **DEFERRED**, bukan `DONE`, `PARTIAL`, atau `BLOCKED`.

## 2. Status task

| Task | Status | Bukti ringkas |
|---|---|---|
| 2.1 Lookup customer/product + utilitas uang | **DONE** | `catalogModel`, `catalogService`, `catalogValidator`, `money.js`; unit test presisi uang. |
| 2.2 Skor risiko FR-22 | **DEFERRED** | Tidak ada field, endpoint, atau UI risk score/label. |
| 2.3 Backend buat sales order DRAFT | **DONE** | `POST /api/orders`; harga dihitung server; nomor `SO-YYYYMMDD-NNN`; test + integrasi. |
| 2.4 Backend daftar & detail order | **DONE** | `GET /api/orders`, `GET /api/orders/:id`; Sales hanya melihat order miliknya. |
| 2.5 Pembatalan order FR-09 | **DEFERRED** | Tidak ada endpoint cancel, tombol Batalkan Order, atau transisi `BATAL` dari aplikasi. |
| 2.6 Backend proses pembayaran | **DONE** | `POST /api/orders/:id/payments`; transaksi, stok, movement, status, limit kredit, rollback. |
| 2.7 Backend invoice PDF | **DONE** | `GET /api/orders/:id/invoice.pdf`; format `a4`/`80mm`; hanya LUNAS/PIUTANG. |
| 2.8 Page Guard dan navigasi Sprint 2 | **DONE** | Allowlist 9 halaman; menu per role; tanpa menu KPI. |
| 2.9 Frontend UI-06 Sales Order Baru | **DONE** | `sales-order.html`/`sales-order.js`; price level dari server; tanpa label risiko. |
| 2.10 Frontend UI-07/UI-08 | **DONE** | `orders.html`/`orders.js`, `order-detail.html`/`order-detail.js`; tanpa tombol batal. |
| 2.11 Frontend UI-09 Pembayaran | **DONE** | `payment.html`/`payment.js`; alur Kasir, kembalian, kredit, cetak invoice. |
| 2.12 Pengujian akhir & dokumentasi | **DONE** | Lint, 288 test, `node --check` 78/78, integrasi 10/10, browser 111/111. |

## 3. Keputusan yang dipakai

- `sales_orders.subtotal` adalah bruto sebelum diskon; `discount` adalah total diskon seluruh item;
  `total = subtotal − discount`.
- Item kosong ditolak dengan HTTP 400 dan pesan persis `Minimal satu barang harus ditambahkan`.
- Nomor sales order memakai format `SO-YYYYMMDD-NNN` dengan sequence `001`, `002`, … dan
  `UNIQUE(order_no)` plus retry `ER_DUP_ENTRY` maksimal tiga kali.
- DRAFT tidak mengurangi stok dan tidak membuat `payments` atau `stock_movements`.
- Harga, `price_level`, subtotal, dan total selalu dihitung ulang oleh server. Harga/uang dari client
  tidak dipercaya.
- Mutex nomor order memakai `SELECT … FOR UPDATE` pada baris `users`, bukan pada tabel order.
- Endpoint baru: `POST /api/orders` (ADMIN/SALES), `GET /api/orders` dan `GET /api/orders/:id`
  (ADMIN/SALES/KASIR; Sales hanya order miliknya), `POST /api/orders/:id/payments` (KASIR), dan
  `GET /api/orders/:id/invoice.pdf` (ADMIN/KASIR).
- `payment_type` (`TUNAI`/`KREDIT`) berbeda dari `payments.method` (`TUNAI`/`TRANSFER`). Nominal
  yang dikirim adalah uang diterima; `change_amount` adalah kembalian. Nilai terpakai =
  `amount − change_amount`.
- Kredit penuh (`nominal >= total`) menghasilkan LUNAS dan `due_date` NULL. Kredit sebagian dengan
  sisa > 0 dan `credit_limit = 0` ditolak dengan pesan persis `Melebihi limit kredit`.
- Invoice memakai dependency `pdfkit` yang sudah terpasang. Karena alamat/telepon distributor tidak
  tersedia sebagai data kanonik, PDF menampilkan `tidak tercatat pada data transaksi`.
- Tombol "Cetak Invoice" membuka URL kanonik `/api/orders/:id/invoice.pdf?format=...` di tab baru
  lewat `window.DistriFlowAPI.openInvoice`. Fetch/XHR tidak dipakai untuk mengunduh PDF karena
  PDF viewer bawaan Chrome mengganti respons `application/pdf` menjadi HTTP 204 kosong pada
  browser headless. Ini bukan endpoint tambahan; role guard backend tetap berlaku.
- `docs/API.md` mendokumentasikan **17 endpoint aktual** (Sprint 1 + Sprint 2). Tidak ada endpoint
  rekaan ke-18.
- Karena `GET /api/customers/:id/credit` hanya untuk ADMIN/SALES sementara UI-09 hanya untuk KASIR,
  `frontend/js/payment.js` mencoba endpoint tersebut lebih dulu, lalu memakai fallback
  `/customers` + `/orders` + `/orders/:id` untuk menderviasi sisa limit. Backend tetap menjadi
  penentu batas kredit saat pembayaran.

## 4. Implementasi per task

### 4.1 Backend

| File | Peran |
|---|---|
| `backend/src/helpers/money.js` | Konversi integer sen tanpa `parseFloat`; menolak lebih dari dua desimal. |
| `backend/src/models/customerModel.js`, `productModel.js` | Lookup read-only dan agregasi kredit. |
| `backend/src/services/catalogService.js` | Aturan katalog dan price level. |
| `backend/src/middleware/validators/catalogValidator.js` | Validasi query dan parameter katalog. |
| `backend/src/controllers/catalogController.js`, `routes/customerRoutes.js`, `routes/productRoutes.js` | Endpoint katalog dengan role. |
| `backend/src/models/orderModel.js` | Query order/items, lock mutex, nomor order, dan detail aman. |
| `backend/src/services/orderService.js` | Perhitungan uang, pembuatan DRAFT, list/detail, dan filter Sales. |
| `backend/src/middleware/validators/orderValidator.js`, `controllers/orderController.js`, `routes/orderRoutes.js` | Kontrak HTTP UC-03. |
| `backend/src/models/paymentModel.js`, `services/paymentService.js` | Payment + stock movement dalam satu transaksi. |
| `backend/src/middleware/validators/paymentValidator.js`, `controllers/paymentController.js`, `routes/paymentRoutes.js` | Kontrak HTTP UC-04. |
| `backend/src/services/pdfService.js`, `services/invoiceService.js`, `controllers/invoiceController.js`, `routes/invoiceRoutes.js` | PDF A4/80mm dan guard status. |
| `backend/src/middleware/pageGuard.js`, `src/routes/index.js` | Perluasan allowlist halaman dan menu Sprint 2. |

### 4.2 Frontend

| File | Peran |
|---|---|
| `frontend/js/api.js` | Helper JSON + `getBlob` dan `openInvoice`; PDF dibuka sebagai navigasi tab, bukan fetch blob; `credentials: 'same-origin'`. |
| `frontend/js/ui.js` | `textContent`, sidebar per role, logout, notifikasi, konfirmasi. |
| `frontend/pages/sales-order.html`, `frontend/js/sales-order.js` | UI-06: pilih pelanggan/barang, harga server, submit DRAFT. |
| `frontend/pages/orders.html`, `frontend/js/orders.js` | UI-07: daftar, filter, pencarian, pagination, tautan detail. |
| `frontend/pages/order-detail.html`, `frontend/js/order-detail.js` | UI-08: header/items/payments dan cetak invoice. |
| `frontend/pages/payment.html`, `frontend/js/payment.js` | UI-09: pembayaran TUNAI/KREDIT, kembalian, limit, dan invoice. |

Tidak ada `innerHTML`, `localStorage`, `sessionStorage`, tombol cancel, atau label risiko aktif pada
frontend. Satu-satunya penyebutan "Batalkan Order" dan "innerHTML" hanya berupa komentar yang
menjelaskan bahwa fitur tersebut tidak diterapkan.

### 4.3 Dokumentasi

| File | Perubahan |
|---|---|
| `docs/API.md` | Ditulis ulang sebagai kontrak 17 endpoint aktual, termasuk contoh request/response dan error. |
| `docs/SPRINT_2_PLANNING.md` | Status task, keputusan D1/D2/D8, dan catatan penutupan disinkronkan. |
| `README.md` | Status Sprint 2, URL UI-06…UI-09, penjelasan dependency, dan tautan dok diperbarui; marker konflik Git di akhir file dihapus. |
| `docs/SPRINT_2_FINAL_REPORT.md` | Laporan ini. |

## 5. Bukti verifikasi

### 5.1 Verifikasi statis dan otomatis

| Pemeriksaan | Hasil |
|---|---|
| `npm run lint` di `backend` | exit code **0**, tanpa error. |
| `npm test` di `backend` | **21 suite lolos, 288/288 test lolos**. |
| `node --check` pada `backend/src`, `backend/tests`, `backend/scripts`, `frontend/js` | **78 file diperiksa, 0 gagal**. |
| Pencarian `innerHTML`, `localStorage`, `sessionStorage` | Tidak ada pemakaian aktif. |
| Pencarian tombol cancel / `risk_score` / `risk_label` | Tidak ada implementasi aktif. |
| Marker konflik Git di `README.md` | Tidak ada lagi. |

Suite `npm test` mencakup test Sprint 1 yang dipertahankan (auth, user, security, transaction,
helpers, response, page guard, routing halaman) dan test Sprint 2 baru (money, catalog, order,
payment, invoice, PDF, frontend API helper, page/menu, dan kontrak route).

### 5.2 Integrasi MariaDB nyata dengan database isolasi

Dua database isolasi baru dibuat dari salinan schema+seed kanonik:

- `test_verify_sprint2_1795632180863` — run pertama, dipertahankan.
- `test_verify_sprint2_rerun_1795632300408` — run ulang setelah perbaikan bug, dipertahankan.

Database utama `distriflow` hanya dicek keberadaannya secara read-only. Tidak ada `DROP`,
`TRUNCATE`, reset, `DELETE`, atau perubahan akun/sesi pengguna pada database utama maupun database
isolasi setelah seed. Kredensial dan konfigurasi sensitif tidak ditampilkan.

Hasil run ulang: **10/10 checks PASS, 0 FAIL**.

| Pemeriksaan | Hasil |
|---|---|
| Schema+seed kanonik termuat di DB isolasi baru | PASS |
| Backend memakai DB isolasi, bukan `distriflow` | PASS |
| Dua order berurutan tanggal sama | PASS — `SO-20261126-001`, `SO-20261126-002`. |
| Order ketiga tanggal sama | PASS — `SO-20261126-003`. |
| DRAFT tidak mengubah stok dan tidak membuat payment/movement | PASS |
| Payment TUNAI `145000.00` atas total `139000.00` | PASS — LUNAS, kembalian `6000.00`. |
| Stok BRS-05 | PASS — `30 → 28` setelah qty 2. |
| Stock movement | PASS — tepat satu `KELUAR`, qty 2, referensi order. |
| Invoice order LUNAS | PASS — `%PDF`, 5059 byte, status tidak berubah. |
| Invoice order DRAFT | PASS — 409, `Invoice hanya tersedia untuk order LUNAS atau PIUTANG`. |
| Rollback kredit limit 0 | PASS — 409, `Melebihi limit kredit`, order tetap DRAFT, stok/payment/movement tidak berubah. |
| Rollback kas kurang | PASS — 400, `Nominal kurang Rp65000`, tidak ada perubahan stok/payment/movement. |
| Kasus kanonik total `750000.00`, bayar `800000.00` | PASS — kembalian `50000.00`, stok `28 → 18`, invoice `%PDF`. |
| Order seed `SO-20261112-001` | PASS — `800000.00`/`50000.00`, invoice `%PDF`. |

### 5.3 Bug yang ditemukan dan diperbaiki

| Bug | Dampak | Perbaikan | Test regresi |
|---|---|---|---|
| `getOrderDate()` memakai format `%Y-%m-%d` | Nomor order yang dihasilkan memakai tanggal dengan tanda hubung, bukan `YYYYMMDD`. | Menggunakan `%Y%m%d`. | `backend/tests/orderModel.test.js`. |
| `findLastOrderNo()` mencari prefiks `${orderDate}-%` | Sequence tidak ketemu untuk format `SO-YYYYMMDD-NNN`, sehingga nomor bisa bentrok saat beberapa order dibuat pada tanggal sama. | Mencari dengan prefiks `SO-${orderDate}-%`. | `backend/tests/orderModel.test.js` dan integrasi tiga order berurutan. |
| UI mengunduh invoice lewat `fetch` ke URL `.pdf` | Chrome headless mengganti respons PDF menjadi HTTP 204 / 0 byte, sehingga pengguna melihat unduhan berhasil tanpa isi. | `api.openInvoice()` membuka URL kanonik di tab baru; `fetch`/blob tidak dipakai untuk PDF. | `backend/tests/frontendApi.test.js` dan verifikasi browser ulang dengan popup tab nyata. |

Dua bug pertama ditemukan pada verifikasi integrasi sebelum perbaikan; bug ketiga ditemukan pada
verifikasi browser aplikasi asli. Semua diperbaiki dan diverifikasi ulang. Tidak ada test yang
dihapus atau dilemahkan.

### 5.4 Verifikasi browser aplikasi asli

Verifikasi memakai **aplikasi nyata**, bukan mock: Express asli dari `backend/src/app.js`, sesi
MySQL asli, dan Chrome headless dengan context terpisah untuk guest, ADMIN, SALES, KASIR, dan
GUDANG. Harness berada di luar repository:
`C:\Users\fadhi\AppData\Local\Temp\opencode\browser_sprint2_verify.js`.

Database isolasi akhir: `test_verify_sprint2_browser_fix_1795635644869`. Run sebelumnya juga
dipertahankan: `test_verify_sprint2_browser_1795633197050`,
`test_verify_sprint2_browser_1795633939030`, dan `test_verify_sprint2_browser_1795634253481`.
Semua memuat schema+seed kanonik (4 user, 8 pelanggan, 20 produk, 3 order). Database utama
`distriflow` tidak diubah: jumlah user `4 → 4` dan sales order `3 → 3` (pemeriksaan read-only).

**Hasil akhir: 111/111 checks PASS, 0 FAIL.** Run pertama sebelum perbaikan PDF menghasilkan
107 PASS / 1 FAIL; setelah perbaikan, seluruh pemeriksaan dijalankan ulang dan lolos.

| Bagian | Checks | Hasil |
|---|---:|---|
| Inisialisasi database isolasi | 3 | 3 PASS |
| A. Page guard dan otorisasi API | 47 | 47 PASS |
| B. UI-06 pembuatan sales order | 12 | 12 PASS |
| C. UI-07 daftar/filter/scope peran | 10 | 10 PASS |
| D. UI-08 detail dan gating invoice DRAFT | 4 | 4 PASS |
| E. UI-09 pembayaran, stok, movement, invoice | 17 | 17 PASS |
| F. Penolakan limit kredit dan rollback | 4 | 4 PASS |
| G. Console/storage/static check | 7 | 7 PASS |
| H. Smoke Sprint 1 UI-01…UI-05 | 6 | 6 PASS |
| I. Database utama tidak berubah | 1 | 1 PASS |

Nilai yang diamati:

- Order baru: `id=4`, `SO-20261126-001`, subtotal `144000.00`, diskon `4000.00`, total
  `140000.00`. BRS-05 memakai harga GROSIR `72000.00`.
- `PLG-001`: GROSIR, limit `2500000.00`, outstanding `2000000.00`, sisa `500000.00`.
- Payload `POST /api/orders` hanya berisi `customer_id` dan `items`; harga/subtotal/total dari
  client ditolak HTTP 400 dengan pesan `Field tidak diizinkan`.
- Invoice order DRAFT ditolak HTTP 409 dengan pesan
  `Invoice hanya tersedia untuk order LUNAS atau PIUTANG`.
- Pembayaran TUNAI `150000.00` atas total `140000.00` menghasilkan kembalian `10000.00` dan status
  `LUNAS`. Stok BRS-05 `30 → 28`; tepat satu movement `KELUAR` qty 2 dengan referensi
  `SO-20261126-001` dan `user_id=3`; tepat satu baris payment. Pembayaran kedua ditolak HTTP 409
  `Order sudah diproses` tanpa penulisan tambahan.
- Order `SO-20261126-002` untuk PLG-004 ditolak dengan `Melebihi limit kredit`, tetap DRAFT, tanpa
  payment/movement, dan stok tetap `28`. UI menampilkan
  `Kredit tidak tersedia karena sisa limit kredit 0.`.
- Tombol Cetak Invoice pada order LUNAS membuka tab baru ke URL kanonik
  `/api/orders/4/invoice.pdf?format=a4`; notifikasi `Invoice dibuka di tab baru.` muncul dan tombol
  kembali menjadi `Cetak Invoice`. Tidak ada `fetch`/`XMLHttpRequest` dari halaman ke URL invoice.
- Pengambilan PDF dari Node memakai cookie sesi browser yang sama menghasilkan `200
  application/pdf`, header `%PDF-`, **5046 byte** untuk LUNAS dan **5641 byte** untuk order PIUTANG
  kanonik `SO-20261112-001`. Role guard invoice: SALES/GUDANG 403, KASIR/ADMIN 200.
- Tidak ada error console aplikasi, 401/403/500 tak terduga pada alur valid, pemakaian
  `localStorage`/`sessionStorage`, atau `innerHTML` aktif.
- Smoke Sprint 1 UI-01…UI-05 (login, dashboard, users Admin, halaman ganti password, logout)
  lolos 6/6.

Bug PDF yang ditemukan pada run pertama sudah diperbaiki dengan mengganti unduhan blob via
`fetch` menjadi navigasi tab baru. Backend, kontrak 17 endpoint, role guard, dan pembuatan PDF
tidak diubah. Tidak ada bug tersisa pada run akhir.

## 6. Ruang lingkup yang sengaja tidak dikerjakan

- **FR-09 pembatalan order (Task 2.5):** `DEFERRED` ke Sprint 3. Tidak ada endpoint, tombol, atau
  status `BATAL` yang dihasilkan aplikasi pada Sprint 2.
- **FR-22 risk score/label (Task 2.2):** `DEFERRED` ke Sprint 3. Tidak ada kolom API atau label UI.
- KPI dashboard, manajemen master UC-05/UC-06, laporan UC-07, Purchase Order, PPN, Faktur Hold 50%,
  ekspor Excel, barcode, dan fitur v1 tetap di luar Sprint 2.
- Invoice menampilkan teks `tidak tercatat pada data transaksi` untuk alamat/telepon distributor
  karena tidak ada sumber data kanonik. Ini bukan kegagalan fungsi PDF.
- Verifikasi browser memakai Chrome; Firefox/Safari dan perbandingan pixel-perfect terhadap Figma
  belum dilakukan.

## 7. Status repository akhir

Semua perubahan adalah perubahan kerja lokal. Tidak ada `git commit`, `git push`, `reset --hard`,
penghapusan branch, atau penghapusan file proyek yang tidak dikenal. `git status --short`
menunjukkan **8 file termodifikasi dan 46 file baru**; seluruhnya belum di-commit.

### 7.1 File termodifikasi

```text
README.md
backend/src/middleware/pageGuard.js
backend/src/routes/index.js
backend/tests/pageGuard.test.js
backend/tests/pageRoutes.test.js
docs/API.md
frontend/js/api.js
frontend/js/ui.js
```

### 7.2 File baru — backend

```text
backend/src/controllers/catalogController.js
backend/src/controllers/invoiceController.js
backend/src/controllers/orderController.js
backend/src/controllers/paymentController.js
backend/src/helpers/money.js
backend/src/middleware/validators/catalogValidator.js
backend/src/middleware/validators/invoiceValidator.js
backend/src/middleware/validators/orderValidator.js
backend/src/middleware/validators/paymentValidator.js
backend/src/models/customerModel.js
backend/src/models/orderModel.js
backend/src/models/paymentModel.js
backend/src/models/productModel.js
backend/src/routes/customerRoutes.js
backend/src/routes/invoiceRoutes.js
backend/src/routes/orderRoutes.js
backend/src/routes/paymentRoutes.js
backend/src/routes/productRoutes.js
backend/src/services/catalogService.js
backend/src/services/invoiceService.js
backend/src/services/orderService.js
backend/src/services/paymentService.js
backend/src/services/pdfService.js
backend/tests/catalogModel.test.js
backend/tests/catalogRoutes.test.js
backend/tests/catalogService.test.js
backend/tests/frontendApi.test.js
backend/tests/invoiceService.test.js
backend/tests/money.test.js
backend/tests/orderModel.test.js
backend/tests/orderService.test.js
backend/tests/paymentModel.test.js
backend/tests/paymentService.test.js
backend/tests/pdfService.test.js
backend/tests/sprint2Routes.test.js
backend/tests/uiMenu.test.js
```

### 7.3 File baru — frontend dan dokumentasi

```text
frontend/js/order-detail.js
frontend/js/orders.js
frontend/js/payment.js
frontend/js/sales-order.js
frontend/pages/order-detail.html
frontend/pages/orders.html
frontend/pages/payment.html
frontend/pages/sales-order.html
docs/SPRINT_2_FINAL_REPORT.md
docs/SPRINT_2_PLANNING.md
```

`git diff --check` tidak menemukan error whitespace; hanya peringatan konversi LF/CRLF yang bersifat
kosmetik pada beberapa file.

## 8. Kesimpulan

Sprint 2 selesai untuk cakupan yang disetujui: UC-03 dan UC-04 tersedia dari backend hingga UI,
dengan kontrak API 17 endpoint, 288 test otomatis, integrasi MariaDB isolasi 10/10, dan verifikasi
browser aplikasi asli 111/111. Satu bug UI invoice ditemukan pada verifikasi browser dan sudah
diperbaikan serta diverifikasi ulang. Task FR-09 dan FR-22 tetap `DEFERRED` ke Sprint 3 dan tidak
diklaim selesai. Seluruh perubahan disimpan lokal tanpa commit atau push.
