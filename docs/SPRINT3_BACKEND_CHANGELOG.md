# DistriFlow — Backend Changelog Sprint 3

Tanggal: 27 November 2026  
Cabang: `main`, HEAD awal `87fb4ae`. Semua perubahan masih berada di working tree; tidak ada commit atau push.

## Ringkasan status

| Area | Status | Catatan |
|---|---|---|
| Endpoint Sprint 3 | COMPLETED | 19 endpoint aktif; total `/api` menjadi 36 endpoint. |
| Layer routes/controller/service/model | COMPLETED | Alur `routes → middleware → controller → service → model` dipertahankan. |
| RBAC dan validasi backend | COMPLETED | Otorisasi di router, validasi request + service sebagai pertahanan kedua. |
| Transaksi multi-tabel | COMPLETED | `withTransaction()` dipakai untuk barang masuk, batal order, dan pelunasan. |
| PDF riil | COMPLETED | Bukti pembayaran dan laporan penjualan dihasilkan dari data database. |
| Schema/seed/dependency | COMPLETED | Tidak diubah. Tidak ada migrasi dan tidak ada dependency baru. |
| `stock_movements.note` | COMPLETED WITH LIMITATIONS | Divalidasi, tidak dipersisten karena kolom tidak tersedia pada schema kanonik. |
| Idempotency pembayaran | COMPLETED WITH LIMITATIONS | Memakai awalan `REF:` pada kolom `payments.note` dan jendela 60 detik; tanpa kolom/schema baru. |
| Verifikasi browser headless | BLOCKED | Tidak dijalankan pada sesi ini. |
| Fitur backlog v1.0 | NOT IMPLEMENTED | XLSX, PO/supplier, kategori/rak, valuasi, DSI, WhatsApp/SMS, auto-lock, Faktur Hold 50%. |

## 1. Boot, static root, dan Page Guard

### `backend/src/app.js` — diubah

- Root statis dan direktori Page Guard sekarang memakai `frontend(new)`.
- Folder lama `frontend/` tidak dihapus dan tidak dipakai sebagai root aktif.
- Endpoint API tetap berada di prefix `/api`; halaman yang diizinkan tetap melewati Page Guard.

### `backend/src/middleware/pageGuard.js` — diubah

- Allowlist kanonik diperluas dari UI-01…UI-05 menjadi 16 halaman UI-01…UI-18.
- Penyesuaian peran:
  - `dashboard.html`, `change-password.html`: semua role login.
  - `users.html`, `user-form.html`, `product-form.html`, `customer-form.html`, `reports.html`: ADMIN.
  - `sales-order.html`: ADMIN, SALES.
  - `orders.html`, `order-detail.html`: ADMIN, SALES, KASIR.
  - `payment.html`, `receivables.html`: KASIR.
  - `products.html`, `stock-in.html`: ADMIN, GUDANG.
  - `customers.html`: ADMIN, SALES, KASIR.
- Redirect guest ke login dan redirect role yang tidak berhak ke dashboard tetap berlaku; tidak ada redirect dari URL query.

### `backend/tests/pageGuard.test.js`, `backend/tests/pageRoutes.test.js` — diubah

- Allowlist 16 halaman dan matriks peran diuji, termasuk halaman Sprint 3.
- Routing halaman diverifikasi menyajikan file dari `frontend(new)`.

## 2. Routing dan pemasangan endpoint

### `backend/src/routes/index.js` — diubah

Router Sprint 3 baru dipasang:

```js
router.use('/stock-in', stockRoutes);
router.use('/receivables', receivableRoutes);
router.use('/payments', paymentReceiptRoutes);
router.use('/reports', reportRoutes);
router.use('/dashboard', dashboardRoutes);
```

Router lama `/auth`, `/users`, `/customers`, `/products`, dan `/orders` tetap dipakai dan diperluas.

### Router baru

- `backend/src/routes/stockRoutes.js`: `POST /api/stock-in`, `GET /api/stock-in` (ADMIN, GUDANG).
- `backend/src/routes/receivableRoutes.js`: `GET /api/receivables`, `GET /api/receivables/:id` (ADMIN, KASIR), `POST /api/receivables/:id/pay` (KASIR).
- `backend/src/routes/paymentReceiptRoutes.js`: `GET /api/payments/:id/receipt.pdf` (KASIR).
- `backend/src/routes/reportRoutes.js`: `GET /api/reports/sales`, `GET /api/reports/sales.pdf` (ADMIN).
- `backend/src/routes/dashboardRoutes.js`: `GET /api/dashboard/kpi` (semua role login).

### Router yang diperluas

- `backend/src/routes/productRoutes.js`: `/restock`, `/:id`, `POST /`, `PUT /:id`, `PATCH /:id`. Rute statis `/restock` dan `/by-code/:code` dipasang sebelum `/:id`.
- `backend/src/routes/customerRoutes.js`: `/:id`, `POST /`, `PUT /:id`, `PATCH /:id`. Rute `/:id/credit` dipasang sebelum `/:id`.
- `backend/src/routes/orderRoutes.js`: `POST /:id/cancel` (ADMIN).

## 3. Middleware dan validasi

### File baru

- `backend/src/middleware/validators/stockValidator.js`: `product_id`, `qty >= 1`, `document_no`, `invoice_match === true`, `note`, `confirm_duplicate`, filter tanggal/halaman.
- `backend/src/middleware/validators/receivableValidator.js`: id, filter/status/tanggal/halaman, nominal > 0, metode `TUNAI|TRANSFER`, referensi maksimal 100 karakter, catatan maksimal 255 karakter, id pembayaran.
- `backend/src/middleware/validators/reportValidator.js`: `date_from`/`date_to` wajib berformat `YYYY-MM-DD` dan terurut.

### File yang diubah

- `backend/src/middleware/validators/catalogValidator.js`: validator `storeProduct`, `updateProduct`, `setActive`, `storeCustomer`, `updateCustomer`. Field `stock` ditolak pada pembuatan dan perubahan produk; `is_active` wajib boolean.
- `backend/src/middleware/validators/orderValidator.js`: alasan pembatalan wajib dan maksimal 255 karakter.

Semua validator memakai `express-validator` dan `validate`; service tetap melakukan validasi ulang.

## 4. Controller

### File baru

- `backend/src/controllers/stockController.js`: membaca payload/filter dan meneruskan ke `stockService`.
- `backend/src/controllers/receivableController.js`: daftar, detail, dan pelunasan; pesan berbeda untuk pembayaran duplikat.
- `backend/src/controllers/receiptController.js`: mengirim buffer PDF dengan `application/pdf`, `inline`, dan `Cache-Control: no-store`.
- `backend/src/controllers/reportController.js`: laporan JSON dan PDF.
- `backend/src/controllers/dashboardController.js`: KPI; meneruskan role aktor agar angka keuangan Gudang tetap nol.

### File yang diubah

- `backend/src/controllers/catalogController.js`: handler detail/create/update/set-active untuk produk dan pelanggan.
- `backend/src/controllers/orderController.js`: handler pembatalan order.

Controller tidak mengandung SQL.

## 5. Service — aturan bisnis

### `backend/src/services/catalogService.js` — diubah

- Menambah CRUD/status produk dan pelanggan dengan whitelist field.
- Stok awal tidak pernah diterima dari client; `stock` tidak dapat diubah lewat `PUT`/`PATCH`.
- Produk nonaktif disembunyikan dari daftar dan lookup transaksi, tetapi masih dapat diakses Admin lewat `GET /api/products/:id` untuk diaktifkan kembali.
- `ER_DUP_ENTRY` diterjemahkan menjadi `409`, bukan error 500.
- Pelanggan tidak memiliki endpoint hapus permanen.

### `backend/src/services/restockService.js` — baru

- `RESTOCK_DAYS = 14`, horizon urgensi 7 hari, batas 100 produk.
- Rata-rata harian dihitung dari penjualan `LUNAS`/`PIUTANG` 30 hari terakhir.
- Output: `avg_daily`, `estimated_days`, `suggested_qty`, `reason`, `generated_at`.
- Produk dengan `avg_daily = 0` menghasilkan `estimated_days: null`.

### `backend/src/services/stockService.js` — baru

- Pencatatan barang masuk dalam satu transaksi: lock produk → cek aktif → cek duplikat → insert movement `MASUK` → increment stok.
- Duplikat nomor dokumen tanpa konfirmasi menghasilkan `409 { needConfirm: true }`.
- Konfirmasi duplikat mencatat transaksi baru tanpa mengubah schema.
- `note` divalidasi tetapi tidak dipersisten karena `stock_movements` tidak memiliki kolom `note`.

### `backend/src/services/orderService.js` — diubah

- Menambah `cancelOrder` khusus ADMIN untuk `DRAFT` dan `PIUTANG`, dengan alasan wajib.
- Order dikunci `SELECT ... FOR UPDATE` dan status dicek ulang sebelum perubahan.
- `DRAFT` → `BATAL` tanpa perubahan stok.
- `PIUTANG` → `BATAL` dengan pengembalian stok (`stock + qty`) dan movement `BATAL` per produk. Arah ini dikoreksi karena `paymentService` sudah mengurangi stok saat pembayaran.
- Pembatalan ulang menghasilkan `409`, sehingga stok tidak dikembalikan dua kali.

### `backend/src/services/receivableService.js` — baru

- Daftar/detail piutang dengan uang dalam sen dan paginasi.
- Pelunasan sebagian atau penuh dengan rentang `0.01..outstanding`; kelebihan bayar `400`.
- FR-22 memakai `risk = 'Aman' | 'Berisiko'`: `Berisiko` bila `credit_limit > 0` dan `outstanding >= 0.8 * credit_limit`. Tidak ada `risk_score`.
- Satu transaksi untuk lock order, hitung ulang outstanding, cek duplikat, insert payment, dan update status `LUNAS` bersyarat.
- Idempotency 60 detik memakai `REF:` pada `payments.note`; pengiriman ulang mengembalikan payment yang sudah ada tanpa baris baru.

### `backend/src/services/receiptPdfService.js` — baru

- Bukti pembayaran PDF riil melalui `pdfkit` (dependency sudah ada sejak Sprint 2).
- Memuat order, pelanggan, nominal, metode, tanggal, total, dan sisa piutang.
- Tidak menulis database dan tidak menampilkan credential/hash.

### `backend/src/services/reportService.js` — baru

- Omzet = `LUNAS + PIUTANG`; `DRAFT` dan `BATAL` dikecualikan; tanpa PPN.
- Ringkasan, per produk, dan harian diagregasi di SQL.
- Validasi periode dan batas tanggal.

### `backend/src/services/reportPdfService.js` — baru

- PDF laporan penjualan riil dengan kop, periode, ringkasan, tabel produk, dan tabel harian.
- Respons hanya dibuat dari data laporan; tidak ada data contoh.

## 6. Model

### File baru

- `backend/src/models/stockModel.js`: insert/find movement, cek duplikat `reference`, dan update stok dengan ekspresi `stock = stock + ?`.
- `backend/src/models/receivableModel.js`: daftar/detail piutang, aggregate paid, lock order/payment, insert payment, cek idempotency, dan lookup bukti.
- `backend/src/models/restockModel.js`: agregasi 30 hari `LUNAS`/`PIUTANG` dan daftar produk aktif yang perlu restock.
- `backend/src/models/reportModel.js`: agregasi omzet, produk, dan harian untuk laporan serta KPI dasbor.

### File yang diubah

- `backend/src/models/productModel.js`: `findById` termasuk produk nonaktif, `create`, `update` (whitelist tanpa `stock`), dan `setActive`.
- `backend/src/models/customerModel.js`: `findById`, `create`, `update`, dan `setActive`; lookup kredit lama tetap dipertahankan.
- `backend/src/models/orderModel.js`: pembatalan bersyarat, update stok pengembalian, dan movement `BATAL`.

Semua query memakai `getExecutor()`/`pool.execute()` dengan placeholder `?`; tidak ada konkatenasi nilai pengguna ke SQL.

## 7. Pengujian dan verifikasi baru

- `backend/tests/sprint3Routes.test.js` — 21 test untuk kontrak, RBAC, validasi, dan PDF Sprint 3.
- `backend/scripts/verify-sprint3-db.js` — integrasi nyata memakai database isolasi `test_verify_sprint3_<timestamp>` dari salinan schema+seed; database utama `distriflow` tidak di-reset atau di-seed ulang.

Hasil yang dijalankan:

```text
npm test -- --silent
Test Suites: 22 passed, 22 total
Tests:       354 passed, 354 total

npm run lint
(exit 0, tanpa error)

node scripts/verify-sprint3-db.js
Sprint 3 database integration: 9 kelompok pemeriksaan lulus.
Database isolasi dibersihkan.
```

## 8. Tidak diubah dengan sengaja

- `database/01_schema.sql`, `database/02_seed.sql`, `backend/.env`, dependency, dan dokumen sumber.
- Hash password, `SESSION_SECRET`, dan kredensial tidak dicetak pada log atau laporan.
- Folder `frontend/` lama tetap ada sebagai backup.
- Fitur backlog v1.0 tidak diberi endpoint palsu; tombol terkait pada `frontend(new)` tetap dinonaktifkan dengan catatan yang jujur.
- Browser end-to-end headless tidak dijalankan, sehingga statusnya BLOCKED dan tidak diklaim selesai.
