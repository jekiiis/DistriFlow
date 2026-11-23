# DistriFlow — Asumsi dan Keputusan Revisi C

Dokumen ini mencatat keputusan yang **sudah disetujui pengguna** dan tidak tertulis eksplisit di SKPL/DPPL,
serta batas ruang lingkup versi 1.0. Bukan dokumen kebutuhan.
Implementasi aktual adalah sumber kebenaran untuk dokumentasi teknis; bila ada ketidaksesuaian,
catat sebagai temuan dan jangan mengubah keputusan tanpa persetujuan.

## 1. Referensi
- SKPL: `SKPL-DF-001`, Revisi C, 02-11-2026.
- DPPL: `DPPL-DF-001`, Revisi C, 02-11-2026, 62 halaman.
- Visual: `figma/Export Figma.pdf`, 18 frame = UI-01…UI-18.
- Analisis visual disetujui dengan koreksi A1–A5 dan koreksi struktur Sprint 0.

## 2. Keputusan bisnis yang disetujui

| Topik | Keputusan |
|---|---|
| FR-22 ambang risiko | **80%**. Teks UI-14: "Berisiko jika piutang berjalan mencapai atau melampaui 80% dari limit kredit." |
| Kondisi FR-22 | `outstanding >= 0.8 * credit_limit`, **hanya jika** `credit_limit > 0`. Tidak ada pembagian dengan nol. Skor: 0 = Aman, 1 = Waspada, 2–3 = Berisiko. |
| Faktur Hold 50% | **Tidak diimplementasikan.** FR-22 hanya peringatan; limit kredit ditegakkan pada UC-04. |
| PPN | **Tidak diimplementasikan.** `total = subtotal − discount`, tanpa field pajak di schema maupun invoice. |
| UI-06 | Tidak memuat jenis/metode/nominal pembayaran atau jatuh tempo. Pembayaran hanya di UI-09 (UC-04). |
| UI-13 duplikasi | Peringatan dengan pilihan **Ya, simpan** / **Batal**; bukan pemblokiran otomatis. |
| SO-20261112-001 | Awalnya **DRAFT**, setelah pembayaran tunai Rp800.000 menjadi **LUNAS** dengan kembalian Rp50.000. Tidak ada data "dibayar tetapi masih DRAFT". |
| Data kanonik | PLG-001 GROSIR limit Rp2.500.000, piutang Rp2.000.000 → Berisiko; PLG-007 RETAIL limit Rp5.000.000, piutang Rp0 → Aman; BRS-05 retail Rp75.000/grosir Rp72.000, stok 30, min 50; SBN-08 stok 9, min 10. |
| Referensi tanggal contoh | 12/11/2026. |

## 3. Fitur yang **tidak** diimplementasikan pada v1.0
Purchase Order/modul pengadaan · manajemen armada pengiriman · integrasi WhatsApp/SMS · ekspor Excel · cetak barcode · valuasi persediaan dan DSI · kategori/rak/lokasi rak (bila mengubah skema) · password wajib diganti saat login pertama · rotasi password 90 hari · shortcut F2/F4/F9 sebagai fitur wajib · surat jalan otomatis · PPN · Faktur Hold 50%.

Password strength meter di UI-03 boleh tampil sebagai elemen visual, tetapi **tidak menambah aturan validasi** di luar SKPL/DPPL. Implementasi Sprint 1 tidak menampilkan strength meter maupun catatan rotasi 90 hari.

## 4. Basis data
- `database/01_schema.sql` berisi **tepat 7 tabel bisnis**: `users`, `customers`, `products`, `sales_orders`, `sales_order_items`, `payments`, `stock_movements`.
- Tabel sesi **tidak ditulis** di schema dan **tidak dihitung** sebagai tabel bisnis. `express-mysql-session` membuatnya otomatis (nama default dari `SESSION_TABLE_NAME`, contoh `session`) saat aplikasi berjalan.
- Semua nominal uang `DECIMAL(15,2)`, engine InnoDB, charset utf8mb4.

## 5. Asumsi teknis Sprint 0
- Akun demo: `devrosan` (ADMIN), `raihan` (SALES), `zuriel` (KASIR), `jeki` (GUDANG).
- Password akun demo disimpan dalam bentuk hash bcrypt cost 10. Hash dihasilkan oleh `backend/scripts/seed-users.js`; hanya hash yang tersimpan di `02_seed.sql`.
- Node.js terpasang di lingkungan ini adalah **v24.21.0** (DPPL merencanakan Node.js 20 LTS). Kode ditulis kompatibel dengan keduanya.
- `backend/.env.example` adalah template resmi. File `backend/.env` berisi nilai lokal dan sengaja **tidak di-commit**; `.gitignore` sudah mengabaikannya. Isi credential asli tidak boleh ditulis di dokumentasi atau laporan.
- Jika pengguna MySQL memakai plugin autentikasi `auth_gssapi_client`, `mysql2`/klien MySQL standar tidak dapat terhubung. Gunakan pengguna MySQL dengan `mysql_native_password` atau `caching_sha2_password` untuk verifikasi database.

## 6. Keputusan Sprint 1 — autentikasi dan sesi

| Topik | Keputusan |
|---|---|
| Peran | Empat peran tetap: ADMIN, SALES, KASIR, GUDANG. Semua dapat login bila aktif dan kredensial benar. |
| Dashboard | Dapat diakses oleh semua role yang sudah login. Dashboard Sprint 1 **belum memuat KPI**; KPI direncanakan Sprint 3. |
| Lockout | Lockout setelah **5 kali gagal** selama 5 menit. Status HTTP untuk akun terkunci adalah 401. Pesan bersifat generik sampai akun benar-benar terkunci. |
| Password | Minimal 8 karakter dan maksimal 72 byte UTF-8. Disimpan sebagai hash bcrypt cost 10. Tidak pernah dikembalikan API. |
| Session | Disimpan di MySQL, cookie `HttpOnly` + `SameSite=Strict`, rolling idle 30 menit. Session ID diregenerasi setelah login; logout menghancurkan sesi. |
| Ganti password | Session saat ini tetap aktif setelah ganti password berhasil. |
| Akun nonaktif | Login ditolak dengan pesan khusus. Status HTTP 401. |
| Halaman terproteksi | Allowlist Page Guard tepat 5 halaman: `login.html` (publik), `dashboard.html` dan `change-password.html` (semua role login), `users.html` dan `user-form.html` (ADMIN). |
| Otorisasi | Halaman dan API manajemen pengguna hanya ADMIN. Guest mendapat redirect pada halaman dan 401 pada API; role non-ADMIN mendapat 403 pada API manajemen pengguna. Frontend bukan penentu otorisasi. |

## 7. Keputusan Sprint 1 — manajemen pengguna

| Topik | Keputusan |
|---|---|
| Username | Bersifat tetap. Tidak boleh dikirim pada `PUT /api/users/:id`; backend menolaknya. |
| Status pengguna | Pengguna baru selalu dibuat aktif, sehingga field status disembunyikan pada mode Tambah. Pada mode Ubah, status dikirim sebagai boolean. |
| Admin aktif terakhir | Minimal satu Admin aktif harus selalu ada. Retry dicegah di backend dengan HTTP 409. Admin boleh menonaktifkan dirinya bila masih ada Admin aktif lain. |
| Deaktivasi | Menonaktifkan pengguna menghapus sesi pengguna target dalam transaksi yang sama. Tidak ada penghapusan permanen pengguna. |
| Reset password | Dilakukan melalui `PUT /api/users/:id` dengan field `password`. Reset password **tidak membuka lockout** yang sedang aktif. |
| Proteksi data | Password/hash tidak dikirim ke frontend maupun dicetak di log. Data pengguna dirender dengan `textContent`. |
| Urutan daftar | Backend memakai `ORDER BY name ASC, id ASC`; frontend tidak mengirim parameter `sort`. |

## 8. Business rules yang sudah disepakati untuk Sprint 2 dan Sprint 3

Keputusan berikut tetap berlaku dan belum diubah oleh Sprint 1:

- FR-22 ambang 80% dengan syarat `credit_limit > 0`; teks UI-14 sebagaimana tercantum di bagian 2.
- Total transaksi = `subtotal − diskon`, tanpa PPN dan tanpa field pajak di schema/invoice.
- Pembayaran hanya di UI-09 (UC-04), bukan di UI-06.
- Faktur Hold 50% tidak diimplementasikan.
- Duplikasi nomor dokumen di UI-13 menampilkan peringatan + konfirmasi, bukan pemblokiran.
- SO-20261112-001 berubah dari DRAFT menjadi LUNAS setelah pembayaran tunai Rp800.000 dengan kembalian Rp50.000.
- Jendela rekomendasi restock FR-21 memakai `RESTOCK_DAYS`, default 14 hari.
- KPI dashboard baru dikerjakan pada Sprint 3; sidebar Sprint 1 hanya memuat menu yang tersedia.
- Daftar fitur yang sengaja tidak dibuat pada v1.0 ada di bagian 3.

## 9. Catatan implementasi Task 1.8

- Kontrak endpoint aktual didokumentasikan terpisah di `docs/API.md` agar contoh request/response tidak
  membingungkan README. README tetap memuat tautan ke dokumen tersebut.
- Hasil pengujian Sprint 1 dan dua bug yang diperbaiki tercatat di `docs/SPRINT_1_REPORT.md`.
- Versi MariaDB yang terpakai saat verifikasi Task 1.7 adalah `12.1.2-MariaDB`; aplikasi memakai
  `mysql2`, sehingga MySQL 8 dan MariaDB keduanya dapat dipakai selama koneksi dan schema kompatibel.
- Bagian ini adalah catatan faktis, bukan keputusan bisnis baru.
