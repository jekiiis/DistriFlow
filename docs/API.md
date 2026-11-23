# DistriFlow — Dokumentasi API (Sprint 1)

Dokumen ini mencatat **tepat 8 endpoint** yang benar-benar tersedia pada Sprint 1.
Sumber kebenaran: `backend/src/routes/`, `controllers/`, `services/`, `middleware/validators/`, dan `models/`.
Endpoint di luar daftar ini **belum ada**; Sprint 2 dan Sprint 3 belum dikerjakan.

Semua endpoint menggunakan prefix `/api`. Format respons mengikuti `src/helpers/response.js`:

- Sukses: `{ "success": true, "message": "...", "data": ... }`
- Gagal: `{ "success": false, "message": "...", "errors": [{ "field": "...", "message": "..." }] }`
  (`errors` hanya ada pada kegagalan validasi)

Semua request/response bertipe JSON. Karena sesi disimpan di server melalui cookie, klien harus
mengirim cookie yang sama pada setiap request (`credentials: 'same-origin'` di browser).
Nama cookie sesi: `distriflow.sid`.

> Semua nilai di bawah adalah **data dummy**. Jangan memakai credential asli dalam contoh.

## Ringkasan endpoint

| # | Method | URL | Auth | Role |
|---|---|---|---|---|
| 1 | `POST` | `/api/auth/login` | Tidak | Publik |
| 2 | `POST` | `/api/auth/logout` | Ya | Semua role login |
| 3 | `GET` | `/api/auth/me` | Ya | Semua role login |
| 4 | `PUT` | `/api/auth/password` | Ya | Semua role login |
| 5 | `GET` | `/api/users` | Ya | ADMIN |
| 6 | `GET` | `/api/users/:id` | Ya | ADMIN |
| 7 | `POST` | `/api/users` | Ya | ADMIN |
| 8 | `PUT` | `/api/users/:id` | Ya | ADMIN |

Ketika permintaan ke endpoint user tanpa sesi, backend menjawab `401` dengan pesan
`Sesi berakhir, silakan login kembali`. Role selain ADMIN mendapat `403` dengan pesan
`Anda tidak memiliki hak akses untuk operasi ini`.

---

## 1. POST /api/auth/login

- **Authentication:** tidak diperlukan (publik).
- **Role:** tidak ada.
- **Query parameter:** tidak ada.
- **Request body:**

  ```json
  { "username": "dummy_user", "password": "dummy_pass_123" }
  ```

- **Proses:** `authValidator.login` → `validate` → `authService.login` → `regenerateSession` →
  simpan `req.session.user` → `saveSession`. Session ID diregenerasi setelah kredensial valid.

### Respons sukses — 200

```json
{
  "success": true,
  "message": "Login berhasil",
  "data": {
    "user": {
      "id": 1,
      "name": "Nama Dummy",
      "username": "dummy_user",
      "role": "ADMIN"
    }
  }
}
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `400` | `Username dan password wajib diisi` | Field kosong/tidak ada (dari validator) |
| `400` | `Username dan password wajib diisi` | Field kosong setelah trim (dari service) |
| `401` | `Username atau password salah` | Username tidak ditemukan atau password salah |
| `401` | `Akun terkunci sementara, coba lagi dalam 5 menit` | Akun dalam masa lockout 5 menit |
| `401` | `Akun tidak aktif, hubungi Admin` | Password benar tetapi akun nonaktif |
| `500` | `Terjadi kesalahan pada server` | Error tak tertangani di luar `AppError` |

Contoh error:

```json
{ "success": false, "message": "Username atau password salah" }
```

Contoh error validasi:

```json
{
  "success": false,
  "message": "Username dan password wajib diisi",
  "errors": [
    { "field": "username", "message": "Username dan password wajib diisi" }
  ]
}
```

### Validasi dan business rules

- `username` dan `password` wajib ada dan tidak falsy.
- Password dibandingkan dengan hash bcrypt cost 10; hash tidak pernah dikembalikan.
- **5 kali gagal** menaikkan `failed_attempts`, lalu pada percobaan kelima memasang lockout 5 menit
  dan mengembalikan `failed_attempts` ke 0. Percobaan kelima masih gagal; setelah itu login ditolak
  dengan pesan lockout sampai masa berlaku habis.
- Login berhasil mereset `failed_attempts`, menghapus `locked_until`, dan mencatat `last_login_at`.
- Akun nonaktif ditolak; statusnya dicek setelah pencocokan password.
- Session ID diregenerasi setelah login berhasil (mencegah session fixation).

---

## 2. POST /api/auth/logout

- **Authentication:** wajib (`requireLogin`).
- **Role:** semua role yang login.
- **Query parameter:** tidak ada.
- **Request body:** tidak ada.
- **Proses:** `req.session.destroy()` lalu `res.clearCookie('distriflow.sid', ...)`.

### Respons sukses — 200

```json
{ "success": true, "message": "Logout berhasil", "data": null }
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |
| `500` | `Terjadi kesalahan pada server` | Gagal menghancurkan sesi |

### Validasi dan business rules

- Logout selalu menghancurkan sesi dan menghapus cookie di sisi klien.
- Tidak ada endpoint logout semua perangkat pada Sprint 1.

---

## 3. GET /api/auth/me

- **Authentication:** wajib (`requireLogin`).
- **Role:** semua role yang login.
- **Query parameter:** tidak ada.
- **Request body:** tidak ada.

### Respons sukses — 200

```json
{
  "success": true,
  "message": "Data sesi",
  "data": {
    "user": {
      "id": 1,
      "name": "Nama Dummy",
      "username": "dummy_user",
      "role": "ADMIN"
    }
  }
}
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |

### Validasi dan business rules

- Data berasal dari `req.session.user`, bukan dari query database baru.
- Endpoint ini tidak mengembalikan `password`, hash, `failed_attempts`, atau informasi sensitif lain.
- Dipakai frontend untuk mengecek sesi dan menampilkan identitas pengguna.

---

## 4. PUT /api/auth/password

- **Authentication:** wajib (`requireLogin`).
- **Role:** semua role yang login.
- **Query parameter:** tidak ada.
- **Request body:**

  ```json
  {
    "oldPassword": "dummy_pass_lama",
    "newPassword": "dummy_pass_baru",
    "confirmPassword": "dummy_pass_baru"
  }
  ```

### Respons sukses — 200

```json
{ "success": true, "message": "Password berhasil diubah", "data": null }
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `400` | `Field wajib diisi` | Salah satu field kosong/tidak ada |
| `400` | `Password minimal 8 karakter` | `newPassword` kurang dari 8 karakter |
| `400` | `Password maksimal 72 byte` | `newPassword` lebih dari 72 byte UTF-8 |
| `400` | `Password lama salah` | `oldPassword` tidak cocok dengan hash tersimpan |
| `400` | `Konfirmasi password tidak sama` | `newPassword` ≠ `confirmPassword` |
| `400` | `Password baru harus berbeda dari password lama` | `newPassword` sama persis dengan `oldPassword` |
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |
| `404` | `Pengguna tidak ditemukan` | Pengguna pada sesi sudah tidak ada |
| `500` | `Terjadi kesalahan pada server` | Error tak tertangani |

Contoh error validasi:

```json
{
  "success": false,
  "message": "Password minimal 8 karakter",
  "errors": [
    { "field": "newPassword", "message": "Password minimal 8 karakter" }
  ]
}
```

### Validasi dan business rules

- Minimal 8 karakter dan maksimal 72 byte UTF-8; hash disimpan dengan bcrypt cost 10.
- `newPassword` harus berbeda dari `oldPassword` dan sama dengan `confirmPassword`.
- Pembarasan password berada dalam satu transaksi (`withTransaction`) bersama `findById` dan
  `updatePassword`.
- **Session saat ini tetap aktif** setelah ganti password berhasil; sesi tidak dihancurkan.
- Endpoint ini tidak menghapus lockout. Reset lockout hanya terjadi pada login berhasil.

---

## 5. GET /api/users

- **Authentication:** wajib.
- **Role:** khusus `ADMIN` (`requireRole('ADMIN')` dipasang di router).
- **Response shape:** `data` berisi `{ users: [...], pagination: {...} }`, bukan array langsung.

### Query parameter

| Nama | Wajib | Tipe | Keterangan |
|---|---|---|---|
| `q` atau `search` | tidak | string | Pencarian pada `name` atau `username` (`LIKE`). `q` lebih diutamakan bila keduanya ada. |
| `role` | tidak | string | Filter peran: `ADMIN`, `SALES`, `KASIR`, `GUDANG`. Kosong = semua. |
| `is_active` | tidak | string | Hanya `'true'` atau `'false'` yang dipakai sebagai filter; nilai lain diabaikan menjadi tanpa filter. |
| `page` | tidak | integer | Halaman, minimal `1`; default `1` bila tidak valid. |
| `limit` | tidak | integer | Jumlah per halaman, minimal `1`, maksimal `100`; default `10`. |

Contoh: `GET /api/users?q=dummy&role=SALES&is_active=true&page=1&limit=10`.

### Respons sukses — 200

```json
{
  "success": true,
  "message": "Daftar pengguna",
  "data": {
    "users": [
      {
        "id": 2,
        "name": "Nama Dummy Sales",
        "username": "dummy_sales",
        "role": "SALES",
        "is_active": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 1,
      "totalPages": 1
    }
  }
}
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |
| `403` | `Anda tidak memiliki hak akses untuk operasi ini` | Role bukan ADMIN |
| `500` | `Terjadi kesalahan pada server` | Error database/tak tertangani |

### Validasi dan business rules

- Urutan tetap `ORDER BY name ASC, id ASC`. Frontend tidak mengirim parameter `sort`.
- Field yang dikembalikan hanya `id`, `name`, `username`, `role`, `is_active`. Tidak ada `password`.
- Filter status memakai sentinel `NULL` agar `is_active = 0` tidak dianggap filter kosong
  (perbandingan MySQL `0 = ''` bernilai benar dan pernah menonaktifkan filter status).
- `limit` dibatasi maksimal 100; `offset` dihitung `(page - 1) * limit`.
- Pencarian dan filter memakai query parameterized, bukan konkatenasi string.

---

## 6. GET /api/users/:id

- **Authentication:** wajib.
- **Role:** khusus `ADMIN`.
- **Path parameter:** `id` — integer positif (validator `isInt({ min: 1 })`).
- **Query parameter:** tidak ada.
- **Request body:** tidak ada.

Contoh: `GET /api/users/2`.

### Respons sukses — 200

```json
{
  "success": true,
  "message": "Detail pengguna",
  "data": {
    "user": {
      "id": 2,
      "name": "Nama Dummy Sales",
      "username": "dummy_sales",
      "role": "SALES",
      "is_active": true
    }
  }
}
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `400` | `ID pengguna tidak valid` | `id` bukan integer positif |
| `400` | `ID pengguna tidak valid` | `id` gagal parsing di service |
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |
| `403` | `Anda tidak memiliki hak akses untuk operasi ini` | Role bukan ADMIN |
| `404` | `Pengguna tidak ditemukan` | Tidak ada baris dengan `id` tersebut |
| `500` | `Terjadi kesalahan pada server` | Error tak tertangani |

Contoh error validasi:

```json
{
  "success": false,
  "message": "ID pengguna tidak valid",
  "errors": [{ "field": "id", "message": "ID pengguna tidak valid" }]
}
```

### Validasi dan business rules

- `id` divalidasi dua kali: di route (`param`) dan di service (`parseId`).
- Respons hanya memuat field publik; password/hash tidak pernah dikirim.

---

## 7. POST /api/users

- **Authentication:** wajib.
- **Role:** khusus `ADMIN`.
- **Query parameter:** tidak ada.
- **Request body:**

  ```json
  {
    "name": "Nama Dummy Baru",
    "username": "dummy_baru",
    "password": "dummy_pass_123",
    "role": "GUDANG"
  }
  ```

### Respons sukses — 201

```json
{
  "success": true,
  "message": "Pengguna berhasil ditambahkan",
  "data": {
    "user": {
      "id": 9,
      "name": "Nama Dummy Baru",
      "username": "dummy_baru",
      "role": "GUDANG",
      "is_active": true
    }
  }
}
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `400` | `Field wajib diisi` | `name`, `username`, `password`, atau `role` kosong |
| `400` | `Nama maksimal 100 karakter` | `name` lebih dari 100 karakter |
| `400` | `Username tidak boleh mengandung spasi` | `username` mengandung spasi |
| `400` | `Password minimal 8 karakter` | `password` kurang dari 8 karakter |
| `400` | `Password maksimal 72 byte` | `password` lebih dari 72 byte UTF-8 |
| `400` | `Role tidak valid` | `role` bukan salah satu dari empat peran |
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |
| `403` | `Anda tidak memiliki hak akses untuk operasi ini` | Role bukan ADMIN |
| `409` | `Username sudah terdaftar` | Username duplikat (termasuk dari `ER_DUP_ENTRY`) |
| `500` | `Terjadi kesalahan pada server` | Error tak tertangani |

### Validasi dan business rules

- Role yang diizinkan persis: `ADMIN`, `SALES`, `KASIR`, `GUDANG`.
- Username tidak boleh mengandung spasi dan harus unik; duplikat menghasilkan `409`.
- Password minimal 8 karakter, maksimal 72 byte UTF-8, di-hash dengan bcrypt cost 10.
- **Pengguna baru selalu aktif** (`is_active = TRUE`) terlepas dari input; field status tidak dikirim
  pada mode Tambah UI-05.
- Kolom `failed_attempts` dan `locked_until` tidak disentuh saat pembuatan.
- Penyisipan memakai parameter `?`, bukan konkatenasi nilai pengguna.

---

## 8. PUT /api/users/:id

- **Authentication:** wajib.
- **Role:** khusus `ADMIN`.
- **Path parameter:** `id` — integer positif.
- **Query parameter:** tidak ada.
- **Request body (semua opsional, tetapi minimal satu field boleh diubah):**

  ```json
  {
    "name": "Nama Dummy Diubah",
    "role": "SALES",
    "is_active": false,
    "password": "dummy_pass_baru"
  }
  ```

  Field yang diizinkan: `name?`, `role?`, `is_active?`, `password?`.
  **`username` dilarang** dan akan ditolak.

### Respons sukses — 200

```json
{
  "success": true,
  "message": "Pengguna berhasil diperbarui",
  "data": {
    "user": {
      "id": 2,
      "name": "Nama Dummy Diubah",
      "username": "dummy_sales",
      "role": "SALES",
      "is_active": false
    }
  }
}
```

### Respons error

| Status | `message` | Penyebab |
|---|---|---|
| `400` | `ID pengguna tidak valid` | `id` bukan integer positif |
| `400` | `Username tidak dapat diubah` | Body memuat field `username` |
| `400` | `Field wajib diisi` | `name` dikirim kosong |
| `400` | `Nama maksimal 100 karakter` | `name` lebih dari 100 karakter |
| `400` | `Role tidak valid` | `role` bukan salah satu dari empat peran |
| `400` | `Status harus boolean` | `is_active` bukan boolean/0/1/'0'/'1'/'true'/'false' |
| `400` | `Password minimal 8 karakter` | `password` dikirim dan kurang dari 8 karakter |
| `400` | `Password maksimal 72 byte` | `password` dikirim dan lebih dari 72 byte UTF-8 |
| `400` | `Tidak ada field yang dapat diperbarui` | Tidak ada field yang diizinkan dikirim |
| `401` | `Sesi berakhir, silakan login kembali` | Tidak ada sesi aktif |
| `403` | `Anda tidak memiliki hak akses untuk operasi ini` | Role bukan ADMIN |
| `404` | `Pengguna tidak ditemukan` | `id` tidak ditemukan |
| `409` | `Minimal harus ada satu Admin aktif` | Update mengurangi jumlah Admin aktif terakhir |
| `500` | `Terjadi kesalahan pada server` | Error tak tertangani |

Contoh error konflik:

```json
{ "success": false, "message": "Minimal harus ada satu Admin aktif" }
```

### Validasi dan business rules

- `username` bersifat immutable; **tidak boleh dikirim** pada endpoint ini.
- `is_active` menerima boolean atau representasi `0`, `1`, `"0"`, `"1"`, `"true"`, `"false"`;
  diubah menjadi boolean di service. Filter `?is_active=false` pada `GET /api/users` memakai aturan
  yang sama.
- Minimal harus ada satu Admin aktif. Penurunan peran Admin atau penonaktifan Admin terakhir
  ditolak dengan `409`. Locking baris (`FOR UPDATE`, urutan `id ASC`) mencegah dua transaksi
  bersamaan mengurangi jumlah Admin aktif.
- Admin boleh menonaktifkan dirinya sendiri selama masih ada Admin aktif lain.
- Seluruh pembaruan berada dalam satu transaksi: lock Admin aktif → lock baris target → validasi
  last-admin → `UPDATE users` → hapus sesi bila perlu → baca data publik.
- **Menonaktifkan pengguna menghapus sesi pengguna target.** Reset password (field `password`)
  juga menghapus sesi target, tetapi **tidak membuka lockout** yang sedang berjalan.
- `password` bila dikirim di-hash bcrypt cost 10 dan tidak pernah dikembalikan dalam respons.
- Tidak ada endpoint penghapusan permanen pengguna pada Sprint 1.

---

## Endpoint yang belum tersedia

Endpoint berikut **tidak ada** pada Sprint 1 dan tidak boleh didokumentasikan sebagai tersedia:
manajemen pelanggan, produk, sales order, pembayaran, stok, piutang, dashboard KPI, dan seluruh
use case UC-01…UC-07. Rencana Sprint 2 dan Sprint 3 tercatat di `docs/ASSUMPTIONS.md`, bukan di API ini.

Untuk endpoint di luar delapan endpoint di atas, router mengembalikan `404` dengan pesan
`Endpoint tidak ditemukan` (format `{ "success": false, "message": "..." }`).
