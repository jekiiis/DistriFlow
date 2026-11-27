# DistriFlow — Dokumentasi API (Sprint 1 + Sprint 2 + Sprint 3)

Dokumen ini mencatat endpoint yang **benar-benar tersedia** setelah Sprint 3. Sumber kebenaran:
`backend/src/routes/`, `controllers/`, `services/`, `middleware/validators/`, dan `models/`.

> Jumlah endpoint aktual adalah **36**: 17 endpoint Sprint 1/Sprint 2 dan 19 endpoint Sprint 3.
> Daftar ini tidak memuat endpoint rekaan. Endpoint yang masuk backlog v1.0 (PO/supplier,
> XLSX, kategori/rak, valuasi, DSI, WhatsApp/SMS, auto-lock, Faktur Hold 50%) sengaja
> tidak didokumentasikan sebagai endpoint aktif.

FR-09 (pembatalan order), FR-17/FR-18 (piutang & bukti pembayaran), FR-19 (laporan/PDF),
FR-20/FR-21 (KPI & restock), dan FR-22 (risiko kredit biner) sudah tersedia di Sprint 3.
Endpoint lama `/api/customers/:id/credit` tetap tidak mengembalikan `risk_score`/`risk_label`;
label risiko kini tersedia pada endpoint `/api/receivables`.

## Konvensi umum

- Prefix semua endpoint: `/api`.
- Kecuali invoice, request dan response bertipe `application/json`.
- Sukses: `{ "success": true, "message": "...", "data": ... }`.
- Gagal: `{ "success": false, "message": "...", "errors": [...] }`; `errors` hanya muncul
  pada kegagalan validasi `express-validator`.
- Sesi disimpan di server dan dikirim memakai cookie `HttpOnly` `SameSite=Strict`. Browser
  wajib memakai `credentials: 'same-origin'`.
- Nominal uang dikirim sebagai string desimal dua angka, misalnya `"75000.00"`, dan selalu
  dihitung ulang di server memakai integer sen.
- Semua contoh memakai data dummy; tidak ada credential asli di dokumen ini.

Kode status: `400` validasi, `401` sesi/credential, `403` peran, `404` tidak ditemukan,
`409` konflik bisnis, `500` kesalahan server tak tertangani.

## Ringkasan endpoint

| # | Method | URL | Auth | Role |
|---:|---|---|---|---|
| 1 | `POST` | `/api/auth/login` | Tidak | Publik |
| 2 | `POST` | `/api/auth/logout` | Ya | Semua role login |
| 3 | `GET` | `/api/auth/me` | Ya | Semua role login |
| 4 | `PUT` | `/api/auth/password` | Ya | Semua role login |
| 5 | `GET` | `/api/users` | Ya | ADMIN |
| 6 | `GET` | `/api/users/:id` | Ya | ADMIN |
| 7 | `POST` | `/api/users` | Ya | ADMIN |
| 8 | `PUT` | `/api/users/:id` | Ya | ADMIN |
| 9 | `GET` | `/api/customers` | Ya | ADMIN, SALES, KASIR |
| 10 | `GET` | `/api/customers/:id/credit` | Ya | ADMIN, SALES |
| 11 | `GET` | `/api/products` | Ya | Semua role login |
| 12 | `GET` | `/api/products/by-code/:code` | Ya | ADMIN, SALES |
| 13 | `POST` | `/api/orders` | Ya | ADMIN, SALES |
| 14 | `GET` | `/api/orders` | Ya | ADMIN, SALES, KASIR |
| 15 | `GET` | `/api/orders/:id` | Ya | ADMIN, SALES, KASIR |
| 16 | `POST` | `/api/orders/:id/payments` | Ya | KASIR |
| 17 | `GET` | `/api/orders/:id/invoice.pdf` | Ya | ADMIN, KASIR |
| 18 | `POST` | `/api/orders/:id/cancel` | Ya | ADMIN |
| 19 | `GET` | `/api/customers/:id` | Ya | ADMIN |
| 20 | `POST` | `/api/customers` | Ya | ADMIN |
| 21 | `PUT` | `/api/customers/:id` | Ya | ADMIN |
| 22 | `PATCH` | `/api/customers/:id` | Ya | ADMIN |
| 23 | `GET` | `/api/products/restock` | Ya | ADMIN, GUDANG |
| 24 | `GET` | `/api/products/:id` | Ya | ADMIN, GUDANG |
| 25 | `POST` | `/api/products` | Ya | ADMIN |
| 26 | `PUT` | `/api/products/:id` | Ya | ADMIN |
| 27 | `PATCH` | `/api/products/:id` | Ya | ADMIN |
| 28 | `POST` | `/api/stock-in` | Ya | ADMIN, GUDANG |
| 29 | `GET` | `/api/stock-in` | Ya | ADMIN, GUDANG |
| 30 | `GET` | `/api/receivables` | Ya | ADMIN, KASIR |
| 31 | `GET` | `/api/receivables/:id` | Ya | ADMIN, KASIR |
| 32 | `POST` | `/api/receivables/:id/pay` | Ya | KASIR |
| 33 | `GET` | `/api/payments/:id/receipt.pdf` | Ya | KASIR |
| 34 | `GET` | `/api/reports/sales` | Ya | ADMIN |
| 35 | `GET` | `/api/reports/sales.pdf` | Ya | ADMIN |
| 36 | `GET` | `/api/dashboard/kpi` | Ya | Semua role login |

Tanpa sesi, endpoint terlindungi menjawab `401` dengan pesan
`Sesi berakhir, silakan login kembali`. Role yang tidak diizinkan menjawab `403` dengan pesan
`Anda tidak memiliki hak akses untuk operasi ini`.

---

## 1. POST /api/auth/login

Publik. Body: `{ "username": "dummy_user", "password": "dummy_pass_123" }`.

Sukses `200`: `data.user = { id, name, username, role }`. Session ID diregenerasi setelah
kredensial valid; hash password tidak pernah dikembalikan.

| Status | `message` | Penyebab |
|---|---|---|
| `400` | `Username dan password wajib diisi` | Field kosong |
| `401` | `Username atau password salah` | Kredensial salah |
| `401` | `Akun terkunci sementara, coba lagi dalam 5 menit` | Lockout 5 menit aktif |
| `401` | `Akun tidak aktif, hubungi Admin` | Password benar, akun nonaktif |

Lima kegagalan dalam jendela 5 menit mengunci akun. Login berhasil mereset
`failed_attempts`, `locked_until`, dan mencatat `last_login_at`.

## 2. POST /api/auth/logout

Semua role login. Menghancurkan sesi dan menghapus cookie. Sukses:
`{ "success": true, "message": "Logout berhasil", "data": null }`.

## 3. GET /api/auth/me

Semua role login. Mengembalikan `data.user` dari `req.session.user`:
`{ id, name, username, role }`. Tidak ada query database baru dan tidak ada field sensitif.

## 4. PUT /api/auth/password

Semua role login. Body:
`{ "oldPassword": "...", "newPassword": "...", "confirmPassword": "..." }`.

Password baru minimal 8 karakter, maksimal 72 byte UTF-8, berbeda dari password lama, dan
cocok dengan konfirmasi. Hash memakai bcrypt cost 10. Sesi saat ini tetap aktif; endpoint ini
tidak menghapus lockout.

Pesan `400` yang mungkin: `Field wajib diisi`, `Password minimal 8 karakter`,
`Password maksimal 72 byte`, `Password lama salah`, `Konfirmasi password tidak sama`,
`Password baru harus berbeda dari password lama`.

## 5. GET /api/users

Khusus ADMIN. Query opsional: `q`/`search`, `role`, `is_active`, `page`, `limit` (maksimal 100).
Respons: `data.users` dan `data.pagination = { page, limit, total, totalPages }`.

## 6. GET /api/users/:id

Khusus ADMIN. `data.user` tidak memuat password maupun hash. `404`: `Pengguna tidak ditemukan`.

## 7. POST /api/users

Khusus ADMIN. Body: `{ name, username, password, role }`. Role salah satu
`ADMIN|SALES|KASIR|GUDANG`. Username tidak dapat diubah setelah dibuat. `409` untuk username
duplikat; `400` untuk password/role invalid.

## 8. PUT /api/users/:id

Khusus ADMIN. Body boleh berisi `name`, `role`, `is_active`, `password`. Reset password tidak
membuka lockout. ADMIN terakhir tidak boleh dinonaktifkan atau diturunkan perannya. Role lain
mendapat `403`.

---

## 9. GET /api/customers

Role: ADMIN, SALES, KASIR. Query opsional: `search` (maksimal 100 karakter), `page`, `limit`.
Hanya pelanggan aktif yang dikembalikan.

```json
{
  "success": true,
  "message": "Daftar pelanggan",
  "data": {
    "customers": [{
      "id": 1,
      "code": "PLG-001",
      "name": "Pelanggan Contoh",
      "address": "Bandung",
      "phone": "022000000",
      "price_level": "GROSIR",
      "credit_limit": "2500000.00",
      "payment_term_days": 30
    }],
    "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
  }
}
```

## 10. GET /api/customers/:id/credit

Role: ADMIN, SALES. Mengembalikan data kredit untuk UC-03/UC-04:

```json
{
  "success": true,
  "message": "Detail kredit pelanggan",
  "data": {
    "id": 1,
    "code": "PLG-001",
    "name": "Pelanggan Contoh",
    "price_level": "GROSIR",
    "credit_limit": "2500000.00",
    "outstanding": "2000000.00",
    "remaining_limit": "500000.00"
  }
}
```

`remaining_limit` dibatasi menjadi `0.00` bila negatif atau bila `credit_limit = 0`. Field
`risk_score` dan `risk_label` **tetap tidak ada** pada endpoint ini: label risiko FR-22
disajikan sebagai `risk` pada `/api/receivables`, sesuai keputusan biner yang disetujui.
`404`: `Pelanggan tidak ditemukan`; `400`: `ID pelanggan tidak valid`.

## 11. GET /api/products

Semua role login, termasuk GUDANG. Query opsional: `search`, `page`, `limit`. Hanya produk
aktif. Tiap produk memuat `id`, `code`, `name`, `unit`, `price_retail`, `price_wholesale`,
`stock`, `min_stock`. Harga berupa string desimal.

## 12. GET /api/products/by-code/:code

Role: ADMIN, SALES. Query opsional: `level=RETAIL|GROSIR` (default `RETAIL`),
`qty` (default `1`), `discount` (default `0`). Semua perhitungan memakai presisi sen.

```json
{
  "success": true,
  "message": "Harga produk",
  "data": {
    "id": 5,
    "code": "BRS-05",
    "name": "Barang Contoh",
    "unit": "PCS",
    "price_level": "RETAIL",
    "unit_price": "75000.00",
    "qty": 2,
    "subtotal": "150000.00",
    "discount": "5000.00",
    "line_total": "145000.00",
    "stock": 30
  }
}
```

Error: `400` `Kode produk wajib diisi`, `Level harga tidak valid`,
`Kuantitas harus bilangan bulat positif`, `Nominal diskon tidak valid`; `404`:
`Produk tidak ditemukan`.

---

## 13. POST /api/orders

Role: ADMIN, SALES. Membuat sales order **DRAFT**. Request body:

```json
{
  "customer_id": 1,
  "items": [
    { "code": "BRS-05", "qty": 2, "discount": "5000.00" }
  ]
}
```

Field berikut **ditolak** dengan `400 Field tidak diizinkan`: `unit_price`, `price`,
`price_level`, `subtotal`, `discount`, `total` pada header; dan `unit_price`, `price`,
`price_level`, `subtotal`, `line_total`, `total` pada setiap item. Harga dan uang dihitung
server dari `products` dan `customers.price_level`.

Sukses `201`: `data.order` berisi order DRAFT lengkap dengan `items` berisi barang yang tersimpan dan `payments: []`.

```json
{
  "id": 42,
  "order_no": "SO-20261126-001",
  "order_date": "2026-11-26",
  "customer_id": 1,
  "customer_code": "PLG-001",
  "customer_name": "Pelanggan Contoh",
  "user_id": 2,
  "user_name": "Sales Contoh",
  "subtotal": "150000.00",
  "discount": "5000.00",
  "total": "145000.00",
  "status": "DRAFT",
  "payment_type": null,
  "due_date": null,
  "items": [
    {
      "id": 1,
      "sales_order_id": 42,
      "product_id": 5,
      "code": "BRS-05",
      "name": "Barang Contoh",
      "qty": 2,
      "unit_price": "75000.00",
      "discount": "5000.00",
      "line_total": "145000.00"
    }
  ],
  "payments": []
}
```

Aturan penting:

- `subtotal` = bruto sebelum diskon; `discount` = total diskon semua baris;
  `total = subtotal − discount`. Tanpa PPN.
- Kode barang sama digabung; stok dicek terhadap jumlah gabungan.
- Nomor order `SO-YYYYMMDD-NNN`; sequence boleh `1000`, `1001`, ...
- Nomor dibuat dengan mutex `SELECT ... FOR UPDATE` pada baris `users`, `UNIQUE(order_no)`,
  dan retry `ER_DUP_ENTRY` maksimal 3 kali.
- DRAFT **tidak** mengurangi stok dan tidak membuat `payments`/`stock_movements`.

Error utama: `400` `Minimal satu barang harus ditambahkan`, `ID pelanggan tidak valid`,
`Kode barang wajib diisi`, `Jumlah tidak valid`, `Diskon tidak valid`, `Field tidak diizinkan`;
`401` `Sesi berakhir, silakan login kembali`; `404` `Pelanggan tidak ditemukan` atau
`Barang tidak ditemukan`; `409` `Stok tidak cukup, tersedia N`; `500`
`Gagal membuat nomor sales order, silakan coba lagi`.

## 14. GET /api/orders

Role: ADMIN, SALES, KASIR. Sales hanya melihat order miliknya; Admin dan Kasir melihat semua.

Query opsional:

| Nama | Keterangan |
|---|---|
| `q` | Cari nomor order atau nama pelanggan (maksimal 100 karakter) |
| `status` | `DRAFT`, `LUNAS`, `PIUTANG`, atau `BATAL` |
| `date_from`, `date_to` | Format `YYYY-MM-DD`; `date_to` tidak boleh sebelum `date_from` |
| `page`, `limit` | Default `1`/`10`; `limit` maksimal `100` |

Respons: `data.orders` dan `data.pagination`. Setiap order memuat field header yang sama
seperti endpoint 13, ditambah `items` dan `payments`. Tidak ada field `password`/hash.

Error `400`: `Status tidak valid`, `Tanggal awal tidak valid`, `Tanggal akhir tidak valid`,
`Tanggal akhir tidak boleh sebelum tanggal awal`, `Halaman tidak valid`,
`Limit maksimal 100`, `ID sales order tidak valid`.

## 15. GET /api/orders/:id

Role: ADMIN, SALES, KASIR. `data.order` berisi header, `items`, dan `payments`. Order milik
Sales lain menjadi `404` `Order tidak ditemukan` bukan `403`, agar tidak membocorkan keberadaan
order. ID bukan integer positif → `400 ID sales order tidak valid`.

## 16. POST /api/orders/:id/payments

Role: **KASIR only**. Request body:

```json
{
  "payment_type": "TUNAI",
  "method": "TUNAI",
  "nominal": "800000.00",
  "note": "opsional"
}
```

- `payment_type`: `TUNAI` atau `KREDIT`. Ini berbeda dengan `method` pada tabel `payments`.
- `method`: `TUNAI` atau `TRANSFER`.
- `nominal`: nominal uang yang diterima; boleh `0` hanya untuk `KREDIT`.
- `amount` pada `payments` menyimpan nominal diterima, `change_amount` menyimpan kembalian.
  Nilai terpakai = `amount − change_amount`.

Sukses `200`: `data = { order, payment }`. Status akhir selalu `LUNAS` atau `PIUTANG`.
Kredit tanpa uang muka menghasilkan `PIUTANG` dan **tidak** membuat baris `payments`.

Satu transaksi mencakup: lock order → lock customer → cek limit piutang → lock produk → cek
stok → `UPDATE products SET stock = stock - ? ... AND stock >= ?` → `stock_movements`
`KELUAR` sekali per order → insert payment bila nominal > 0 → update status order. Rollback
penuh bila salah satu gagal; order tetap DRAFT.

Pesan error persis:

| Status | `message` | Kondisi |
|---|---|---|
| `400` | `Nominal tidak valid` | Nominal negatif/rusak atau TUNAI dengan nominal 0 |
| `400` | `Transfer tidak boleh melebihi total` | `method = TRANSFER` dan nominal > total |
| `400` | `Nominal kurang Rp{selisih}` | TUNAI dengan nominal < total |
| `409` | `Melebihi limit kredit` | Kredit sebagian melebihi sisa limit atau limit = 0 |
| `409` | `Stok tidak cukup, tersedia {n}` | Stok berubah saat pembayaran |
| `409` | `Order sudah diproses` | Order bukan DRAFT atau guard update gagal |
| `404` | `Order tidak ditemukan` | ID tidak ada |

Contoh kanonik: tagihan `Rp750000.00`, nominal diterima `Rp800000.00` → `LUNAS`,
`change_amount = "50000.00"`. Kredit penuh (`nominal >= total`) → `LUNAS`, `due_date = NULL`;
kredit sebagian → `PIUTANG`, `due_date` dihitung dari `payment_term_days`.

## 17. GET /api/orders/:id/invoice.pdf

Role: ADMIN, KASIR. Query opsional `format=a4|80mm` (default `a4`).

Respons **bukan JSON**: `200`, `Content-Type: application/pdf`,
`Content-Disposition: inline; filename="invoice-SO-YYYYMMDD-NNN.pdf"`, `Cache-Control: no-store`.
Body adalah Buffer PDF yang dapat dibuka/dicetak di browser.

Invoice memuat kop DistriFlow, nomor order, tanggal, pelanggan, sales, status, rincian barang,
subtotal, diskon, total tagihan, nominal bayar, kembalian atau sisa piutang, dan jatuh tempo
untuk kredit. Tidak ada PPN. Alamat dan telepon distributor tidak tersedia sebagai data kanonik,
jadi PDF menampilkan `tidak tercatat pada data transaksi` daripada mengarang data.

Error: `400 Format invoice tidak valid`, `404 Order tidak ditemukan`, `409`
`Invoice hanya tersedia untuk order LUNAS atau PIUTANG`. Endpoint ini hanya membaca data;
tidak mengubah status, stok, atau pembayaran.

---

## 18. POST /api/orders/:id/cancel

Khusus ADMIN. Body: `{ "reason": "Pelanggan membatalkan pesanan" }`. Alasan wajib,
maksimal 255 karakter, disimpan di `sales_orders.cancel_reason`.

Hanya order `DRAFT` atau `PIUTANG` yang boleh dibatalkan:

- `DRAFT`: status berubah menjadi `BATAL`, **stok tidak diubah** karena DRAFT belum pernah
  mengurangi stok.
- `PIUTANG`: status berubah menjadi `BATAL`, stok **dikembalikan** (`products.stock = stock + qty`)
  dan satu `stock_movements` per produk dengan `type = 'BATAL'`, `reference = order_no`,
  dan `user_id` = Admin. Pelunasan uang muka dilakukan manual di luar sistem.

Order dikunci `SELECT ... FOR UPDATE` di awal transaksi, sehingga pembatalan ganda
menghasilkan `409`, bukan pengembalian stok dua kali. Sukses `200`:
`data.order` memuat `status`, `cancel_reason`, `cancelled_by`, `cancelled_at`.

Error: `400 ID sales order tidak valid` / `Alasan pembatalan wajib diisi` /
`Alasan pembatalan maksimal 255 karakter`; `403` untuk selain ADMIN;
`404 Order tidak ditemukan`; `409 Order tidak dapat dibatalkan` / `Order sudah dibatalkan` /
`Order LUNAS tidak dapat dibatalkan`.

## 19. GET /api/customers/:id

Khusus ADMIN. `data.customer` memuat semua field pelanggan termasuk `is_active`.
`404 Pelanggan tidak ditemukan`; `400 ID pelanggan tidak valid`.

## 20. POST /api/customers

Khusus ADMIN. Body:

```json
{
  "code": "PLG-010",
  "name": "Toko Baru",
  "address": "Bandung",
  "phone": "081234567890",
  "price_level": "GROSIR",
  "credit_limit": "5000000.00",
  "payment_term_days": 14
}
```

`price_level` = `RETAIL|GROSIR` (default `RETAIL`). `credit_limit` dan
`payment_term_days` non-negatif; nomor telepon opsional maksimal 20 karakter.
Sukses `201`: `data.customer` seperti endpoint 19. Kode duplikat → `409`.
Pelanggan baru selalu aktif. Tidak ada endpoint `DELETE /api/customers/:id`.

## 21. PUT /api/customers/:id

Khusus ADMIN. Field yang sama dengan endpoint 20, semuanya opsional. `is_active`
sengaja diabaikan pada PUT; gunakan PATCH. Kode duplikat → `409`; pelanggan tidak
ditemukan → `404`.

## 22. PATCH /api/customers/:id

Khusus ADMIN. Body `{ "is_active": false }` (boolean wajib). Menonaktifkan pelanggan
mencegah pemakaian pada order baru, tetapi piutang lama tetap terbaca pada
`/api/receivables`. Tidak menghapus data atau sesi. `400 Status harus boolean`.

## 23. GET /api/products/restock

Role: ADMIN, GUDANG. Tanpa query. Rekomendasi dihitung dari database:

- Rata-rata penjualan harian = total qty `sales_order_items` untuk order
  `LUNAS`/`PIUTANG` dalam 30 hari terakhir dibagi 30.
- Produk masuk daftar bila `stock <= min_stock` **atau** estimasi habis
  `floor(stock / avg_daily) <= 7` hari. `avg_daily = 0` menghasilkan
  `estimated_days: null`.
- `suggested_qty = max(ceil(avg_daily * 14 - stock), min_stock - stock, 0)`.
- Hanya produk aktif, maksimal 100 baris, diurutkan berdasarkan urgensi.

```json
{
  "data": {
    "products": [{
      "id": 3,
      "code": "SBN-08",
      "name": "Sabun Cuci 800 g",
      "unit": "pcs",
      "stock": 9,
      "min_stock": 10,
      "avg_daily": 0.5,
      "estimated_days": 18,
      "suggested_qty": 1,
      "reason": "Stok mencapai batas minimum"
    }],
    "generated_at": "2026-11-27T08:15:00.000Z"
  }
}
```

`reason`: `Stok mencapai batas minimum`, `Estimasi habis dalam 7 hari`, atau
`Stok minimum dan estimasi habis dalam 7 hari`.

## 24. GET /api/products/:id

Role: ADMIN, GUDANG. `data.product` memuat field endpoint 11 ditambah `is_active`.
Termasuk produk nonaktif agar Admin dapat mengubahnya. `404 Produk tidak ditemukan`.

## 25. POST /api/products

Khusus ADMIN. Body:

```json
{
  "code": "BRS-99",
  "name": "Beras Pandan Wangi",
  "unit": "karung",
  "price_retail": "75000.00",
  "price_wholesale": "72000.00",
  "min_stock": 50
}
```

Field `stock` **ditolak** dengan `400 Stok awal harus dicatat melalui barang masuk`;
stok awal selalu `0` dan hanya bertambah lewat `/api/stock-in`. Harga harus > 0,
maksimal dua desimal; `min_stock` bilangan bulat >= 0. Sukses `201`:
`data.product` seperti endpoint 24. Kode duplikat → `409`.

## 26. PUT /api/products/:id

Khusus ADMIN. Field sama dengan endpoint 25, opsional. `stock` tetap ditolak dan
status hanya diubah lewat PATCH. `404 Produk tidak ditemukan`; kode duplikat → `409`.

## 27. PATCH /api/products/:id

Khusus ADMIN. Body `{ "is_active": false }`. Tidak mengubah stok. Produk nonaktif
tidak muncul pada `/api/products`, `/api/products/by-code/:code`, atau transaksi baru.
`400 Status harus boolean`.

## 28. POST /api/stock-in

Role: ADMIN, GUDANG. Body:

```json
{
  "product_id": 1,
  "qty": 12,
  "document_no": "SJ.0112",
  "invoice_match": true,
  "note": "opsional",
  "confirm_duplicate": false
}
```

`invoice_match` wajib `true` (kesesuaian dengan detail faktur). `qty` bilangan bulat
>= 1; `document_no` maksimal 50 karakter. Seluruh proses berada dalam satu transaksi:
lock produk → cek aktif → cek duplikat → insert `stock_movements` `MASUK` →
`UPDATE products SET stock = stock + ?`.

Duplikat `document_no` **bukan** pemblokiran permanen. Permintaan pertama menjawab:

```json
{ "success": false, "message": "No. dokumen sudah dicatat", "needConfirm": true }
```

Kirim ulang payload yang sama dengan `"confirm_duplicate": true` untuk tetap mencatat.
Sukses `201`: `data.movement = { id, product_id, product_code, product_name, qty,
reference, type: 'MASUK', user_id, created_at, stock_after }`.

Catatan: `note` divalidasi tetapi tidak dipersisten karena `stock_movements` tidak
memiliki kolom `note` pada schema kanonik; skema sengaja tidak diubah.

## 29. GET /api/stock-in

Role: ADMIN, GUDANG. Query opsional: `search` (nomor dokumen/kode/nama barang),
`date_from`, `date_to` (`YYYY-MM-DD`), `page`, `limit` (maksimal 100).
Respons: `data.movements` dan `data.pagination = { page, limit, total, totalPages }`.

## 30. GET /api/receivables

Role: ADMIN, KASIR. Query opsional: `search`, `status` (default `PIUTANG`),
`date_from`, `date_to`, `page`, `limit` (maksimal 100).

```json
{
  "data": {
    "receivables": [{
      "id": 2,
      "order_no": "SO-20261112-001",
      "order_date": "2026-11-12",
      "customer_id": 1,
      "customer_code": "PLG-001",
      "customer_name": "Toko Makmur",
      "total": "2000000.00",
      "paid": "0.00",
      "outstanding": "2000000.00",
      "due_date": "2026-11-20",
      "status": "PIUTANG",
      "risk": "Berisiko",
      "payment_count": 0
    }],
    "pagination": { "page": 1, "limit": 10, "total": 1, "totalPages": 1 }
  }
}
```

`risk` memakai aturan FR-22 yang disetujui: `Berisiko` bila
`outstanding >= 0.8 * credit_limit` dan `credit_limit > 0`, jika tidak `Aman`.
Tidak ada `risk_score`/`risk_label` numerik.

## 31. GET /api/receivables/:id

Role: ADMIN, KASIR. `data.receivable` memuat field endpoint 30 ditambah
`payments: [...]`, `credit_limit`, dan `customer_outstanding` (total piutang
pelanggan, bukan hanya order ini). `404` bila order tidak ada atau bukan `PIUTANG`.

## 32. POST /api/receivables/:id/pay

Khusus KASIR. Body:

```json
{
  "nominal": "100000.00",
  "method": "TRANSFER",
  "reference": "BKK-202611-042",
  "note": "opsional"
}
```

`nominal` antara `0.01` dan `outstanding`; `method` = `TUNAI|TRANSFER`.
Pembayaran sebagian dibolehkan; status berubah menjadi `LUNAS` hanya bila sisa menjadi nol.

Urutan di dalam transaksi: validasi & normalisasi → lock order `FOR UPDATE` →
cek `idempotency_key` → cek warisan `REF:` pada `note` (hanya baris lama tanpa
kunci, jendela 60 detik) → cek status → hitung ulang outstanding → insert
`payments` → update status bersyarat → baca ulang hasil.

Idempotency tidak lagi bergantung pada jendela waktu. Kunci biner
`payments.idempotency_key` berisi `REF:<reference>` bila reference dikirim, atau
`AUTO:<sha256 payload>` bila tidak. Kunci dilindungi
`UNIQUE KEY uq_payments_order_idem (sales_order_id, idempotency_key)`, sehingga dua
request identik yang bersamaan maupun diulang setelah 60 detik tetap mengembalikan
satu payment yang sama. `payments.request_hash` menyimpan sidik jari
`(order, kunci, nominal, metode, kasir)`; kunci yang sama dengan payload berbeda
ditolak. Awalan `REF:<kunci>|` pada `note` tetap dipertahankan untuk kompatibilitas
respons, PDF, dan data historis.

- Retry identik (kapan saja, termasuk setelah order `LUNAS`): `201` dengan
  `message: "Pembayaran sudah tercatat sebelumnya"` dan `data.payment` berisi payment
  yang sudah ada; tidak ada baris baru.
- Kunci sama, nominal/metode berbeda: `409 Referensi pembayaran sudah dipakai untuk
  nominal atau metode berbeda`.
- Reference berbeda pada order yang masih `PIUTANG`: payment baru dibuat, sehingga
  pembayaran parsial dan pelunasan dengan bukti berbeda tetap berjalan.
- Request dengan kunci baru pada order yang bukan `PIUTANG`: `404 Piutang tidak
  ditemukan` (perilaku lama dipertahankan).

Sukses `201`: `data = { payment, receivable }`. Error: `400 Nominal tidak valid` /
`Nominal melebihi sisa piutang` / `Metode pembayaran tidak valid` / `Referensi maksimal
100 karakter`; `404 Piutang tidak ditemukan`; `409` untuk konflik kunci idempotency;
`403` untuk selain KASIR.

Catatan penerapan: `database/01_schema.sql` dan `database/distriflow_lengkap.sql`
sudah memuat kolom/unique key untuk instalasi baru. Database existing memerlukan
`database/03_payment_idempotency.sql`; migrasi ini **belum** diterapkan ke database
utama `distriflow` dan menunggu persetujuan. Baris lama tidak di-backfill.

## 33. GET /api/payments/:id/receipt.pdf

Khusus KASIR. Respons PDF nyata: `200`, `Content-Type: application/pdf`,
`Content-Disposition: inline; filename="receipt-....pdf"`, `Cache-Control: no-store`.
Bukti memuat nomor order, pelanggan, nominal, metode, tanggal, total, dan sisa
piutang. Tidak memuat credential atau hash. `404` bila pembayaran tidak ada.

## 34. GET /api/reports/sales

Khusus ADMIN. Query wajib: `date_from`, `date_to` (`YYYY-MM-DD`, `from <= to`).
Omzet = total order `LUNAS` + `PIUTANG`; `DRAFT` dan `BATAL` dikecualikan.
Ini adalah omzet transaksi, **bukan** uang yang sudah diterima, dan tanpa PPN.
Seluruh angka diagregasi di database, bukan dengan membatasi 100 order di JavaScript.

```json
{
  "data": {
    "period": { "from": "2026-11-01", "to": "2026-11-27" },
    "summary": {
      "omzet": "123456789.00",
      "totalOrders": 42,
      "totalProductsSold": 150,
      "cashTotal": "100000000.00",
      "creditTotal": "23456789.00",
      "receivablesTotal": "5000000.00",
      "topProduct": { "code": "BRS-05", "name": "Beras Premium", "qty": 20, "sales": "1500000.00" }
    },
    "products": [{
      "code": "BRS-05", "name": "Beras Premium", "unit": "karung",
      "qty": 20, "sales": "1500000.00", "contributionPercent": 12.3
    }],
    "daily": [{ "date": "2026-11-27", "orders": 3, "omzet": "225000.00" }]
  }
}
```

Error: `400 Tanggal awal wajib diisi` / `Tanggal akhir wajib diisi` /
`Format tanggal harus YYYY-MM-DD` / `Tanggal awal tidak boleh setelah tanggal akhir`.

## 35. GET /api/reports/sales.pdf

Khusus ADMIN. Filter sama dengan endpoint 34. Respons PDF riil dengan kop DistriFlow,
periode, ringkasan, tabel produk, dan tabel harian. `Content-Type: application/pdf`,
`Content-Disposition: inline; filename="laporan-penjualan-....pdf"`,
`Cache-Control: no-store`. Tidak ada ekspor XLSX pada v1.0.

## 36. GET /api/dashboard/kpi

Semua role login. Satu permintaan mengembalikan KPI dan daftar stok menipis:

```json
{
  "data": {
    "omzetHariIni": "750000.00",
    "orderHariIni": 4,
    "piutangJatuhTempo": "2000000.00",
    "stokMenipis": 2,
    "perluRestock": 3,
    "lowStock": [{ "code": "SBN-08", "name": "Sabun Cuci", "stock": 9, "min_stock": 10, "unit": "pcs" }],
    "generatedAt": "2026-11-27T08:15:00.000Z"
  }
}
```

`omzetHariIni` = total order hari ini `LUNAS` + `PIUTANG`; `orderHariIni` =
order hari ini tanpa `BATAL`; `piutangJatuhTempo` = outstanding `PIUTANG` dengan
`due_date < hari ini`. `stokMenipis` = produk aktif dengan `stock <= min_stock`.
`perluRestock` memakai aturan endpoint 23. Untuk `GUDANG`, angka keuangan sengaja
dikembalikan sebagai `"0.00"`/`0` dan tidak pernah diambil dari database.

---

## Catatan implementasi Sprint 2 + Sprint 3

- Backend melayani `frontend(new)` sebagai root statis dan direktori Page Guard.
  Folder `frontend/` tetap ada sebagai backup dan tidak dihapus.
- Page Guard kini memuat 16 halaman: UI-01…UI-18. Matriks peran:
  `dashboard.html`/`change-password.html` untuk semua role login; `users.html`/
  `user-form.html` ADMIN; `sales-order.html` ADMIN/SALES; `orders.html` dan
  `order-detail.html` ADMIN/SALES/KASIR; `payment.html` dan `receivables.html` KASIR;
  `products.html`/`stock-in.html` ADMIN/GUDANG; `product-form.html`/
  `customer-form.html`/`reports.html` ADMIN; `customers.html` ADMIN/SALES/KASIR.
  Guest diredirect ke login, role lain ke dashboard, HTML di luar allowlist `404`.
- Semua data API dirender dengan `textContent`. Tombol PDF membuka tab lebih dulu
  lalu memuat URL kanonik melalui `window.DistriFlowAPI.openPdf`; cookie sesi tetap
  dikirim dan salah satu guard backend tetap berlaku. Fetch/XHR tidak dipakai untuk
  `openInvoice` karena PDF viewer headless Chrome mengganti respons PDF menjadi 204.
- Tombol XLSX, PO/supplier, kategori/rak, valuasi, DSI, WhatsApp/SMS, auto-lock, dan
  Faktur Hold 50% sengaja dinonaktifkan dengan catatan backlog v1.0. Tidak ada
  `localStorage` sebagai pengganti API, dan tidak ada endpoint rekaan.
- Semua perubahan multi-tabel memakai `withTransaction()`; seluruh SQL memakai
  placeholder `?`. Bukti PDF dihasilkan dari data nyata dan tidak menulis data.
