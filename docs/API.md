# DistriFlow — Dokumentasi API (Sprint 1 + Sprint 2)

Dokumen ini mencatat endpoint yang **benar-benar tersedia** setelah Sprint 2. Sumber kebenaran:
`backend/src/routes/`, `controllers/`, `services/`, `middleware/validators/`, dan `models/`.

> Jumlah endpoint aktual adalah **17**: 8 endpoint Sprint 1, 4 endpoint katalog Sprint 2,
> 3 endpoint order, 1 endpoint pembayaran, dan 1 endpoint invoice. Planning Sprint 2
> memperkirakan 18 endpoint; tidak ada endpoint kanonik ke-18 yang diimplementasikan, jadi
> daftar ini sengaja tidak ditambahi endpoint rekaan.

FR-09 (pembatalan order) dan FR-22 (`risk_score`/`risk_label`) ditunda ke Sprint 3. Tidak ada
endpoint cancel order dan tidak ada field risiko pada respons API.

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
`risk_score` dan `risk_label` **tidak ada** (FR-22 ditunda ke Sprint 3). `404`:
`Pelanggan tidak ditemukan`; `400`: `ID pelanggan tidak valid`.

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

## Catatan implementasi Sprint 2

- Halaman yang diizinkan Page Guard: `/pages/sales-order.html` (ADMIN, SALES),
  `/pages/orders.html` dan `/pages/order-detail.html` (ADMIN, SALES, KASIR),
  `/pages/payment.html` (KASIR). Guest diredirect ke login, role lain ke dashboard,
  HTML di luar allowlist tetap `404`.
- Sidebar frontend mengikuti `PAGE_ACCESS`; tidak ada menu KPI (Sprint 3).
- Semua data API dirender dengan `textContent`. Tombol "Cetak Invoice" membuka URL kanonik
  `/api/orders/:id/invoice.pdf?format=...` di tab baru melalui `window.DistriFlowAPI.openInvoice`.
  Fetch/XHR tidak dipakai untuk PDF karena PDF viewer bawaan Chrome mengganti respons
  `application/pdf` menjadi HTTP 204 kosong pada pengujian headless; navigasi tab memakai session
  cookie yang sama dan tetap melalui role guard backend. Tidak ada endpoint tambahan.
- Tidak ada endpoint pembatalan order dan tidak ada field risiko kredit pada Sprint 2.
