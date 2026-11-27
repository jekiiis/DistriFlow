# DistriFlow — Audit Read-Only Pasca UI-01…UI-18

Tanggal audit: 27 November 2026.

Audit ini dilakukan setelah penyelesaian pekerjaan UI-06…UI-18 di direktori kerja lokal. Batasan
yang dipakai: **tidak ada perubahan file existing, tidak ada migrasi, tidak ada perubahan database,
tidak ada commit, tidak ada push, dan tidak ada implementasi rekomendasi**. Satu-satunya file yang
dibuat oleh audit ini adalah `docs/POST_UI_AUDIT.md`.

Catatan tata kelola: `AGENTS.md` (file ignored) masih menyatakan Sprint 2 dan Sprint 3 belum
dikerjakan, sementara direktori kerja sudah berisi implementasi UI-06…UI-18. Audit ini melaporkan
kondisi aktual working tree dan tidak mengambil keputusan bisnis baru. Klaim bahwa use case
UC-01…UC-07 sudah production-ready tidak dibuat di laporan ini.

---

## 1. Ringkasan eksekutif

| Area | Temuan |
|---|---|
| Git | Tidak ada file terlacak yang termodifikasi. Seluruh hasil kerja UI-06…UI-18 masih **untracked**. |
| `frontend(new)/` | **Untracked, tidak ignored, tidak termasuk `git ls-files`.** |
| Dokumen penyelesaian | `docs/UI_COMPLETION_REPORT.md` dan `docs/UI_COMPLETION_BACKEND_GAP.md` **untracked**. |
| UI-06…UI-18 | Seluruh file halaman dan skrip yang diharapkan **ada** di `frontend(new)/`. UI-10 adalah endpoint PDF, UI-17 adalah modal di `receivables.html`. |
| Halaman tersedia | 16 file HTML di `frontend(new)/pages/` dan juga di working tree `frontend/pages/`. |
| Backend static | `app.js` masih menyajikan `../../frontend`, bukan `frontend(new)`. |
| Page guard | Allowlist baru berisi 9 halaman Sprint 1/2. 7 halaman UI-11…UI-18 belum diizinkan. |
| Akses saat ini | `frontend(new)/` **belum dapat diakses melalui backend**. UI-06…UI-09 sudah ada di allowlist, tetapi versi yang disajikan backend adalah versi di `frontend/`, bukan `frontend(new)/`. |
| Risiko utama | Kontrak global `API`/`UI`, test coupling, role menu vs pageGuard, duplikasi shell, dan sisa file untracked. |
| Rekomendasi | Integrasi bertahap: pertahankan `frontend/` sebagai default, sajikan `frontend(new)` pada prefix terpisah dengan guard yang prefix-aware, verifikasi UI-01…UI-18, baru pertimbangkan switching default. |

---

## 2. Kondisi Git dan file tracking

### 2.1 `git status --short`

Output pada awal audit (sebelum `docs/POST_UI_AUDIT.md` dibuat):

```text
?? docs/UI_COMPLETION_BACKEND_GAP.md
?? docs/UI_COMPLETION_REPORT.md
?? frontend(new)/
?? frontend/js/layout.js
?? frontend/js/pages/
?? frontend/pages/customer-form.html
?? frontend/pages/customers.html
?? frontend/pages/product-form.html
?? frontend/pages/products.html
?? frontend/pages/receivables.html
?? frontend/pages/reports.html
?? frontend/pages/stock-in.html
```

Interpretasi:

- Tidak ada entri ` M`, `M `, `A `, `D `, atau sejenisnya pada file terlacak.
- Pekerjaan baru berada di:
  - `frontend(new)/` — direktori baru utama untuk UI-06…UI-18.
  - `frontend/js/layout.js` dan `frontend/js/pages/` — salinan skrip baru di dalam frontend lama.
  - 7 file HTML baru di dalam `frontend/pages/`.
  - 2 dokumen markdown baru di `docs/`.
- Artinya, working tree `frontend/` saat ini bukan lagi baseline Sprint 1 murni; ia sudah merupakan
  campuran file terlacak lama dan file untracked baru.

### 2.2 `git status --ignored --short`

Output pada awal audit:

```text
?? docs/UI_COMPLETION_BACKEND_GAP.md
?? docs/UI_COMPLETION_REPORT.md
?? frontend(new)/
?? frontend/js/layout.js
?? frontend/js/pages/
?? frontend/pages/customer-form.html
?? frontend/pages/customers.html
?? frontend/pages/product-form.html
?? frontend/pages/products.html
?? frontend/pages/receivables.html
?? frontend/pages/reports.html
?? frontend/pages/stock-in.html
!! AGENTS.md
!! "DPPL DistriFlow.pdf"
!! "SKPL DistriFlow (1).pdf"
!! "User Manual DistriFlow.pdf"
!! backend/.env
!! backend/node_modules/
!! figma/
```

File/direktori yang ignored sesuai `.gitignore`:

- `AGENTS.md`
- `*.pdf` (termasuk dokumen sumber dan `figma/Export Figma.pdf`)
- `figma/`
- `backend/.env`
- `backend/node_modules/`

Tidak ada aturan yang mengabaikan `frontend(new)/`, `docs/UI_COMPLETION_REPORT.md`,
`docs/UI_COMPLETION_BACKEND_GAP.md`, atau `docs/POST_UI_AUDIT.md`.

### 2.3 Status tracking detail

| Pemeriksaan | Hasil |
|---|---|
| `git ls-files frontend` | 21 file terlacak. |
| `git ls-files frontend(new)` | Kosong. |
| `git ls-files docs/UI_COMPLETION_REPORT.md docs/UI_COMPLETION_BACKEND_GAP.md docs/POST_UI_AUDIT.md` | Kosong pada awal audit. |
| `git check-ignore -v --no-index frontend(new)/css/style.css` | `NOT_IGNORED`. |
| `git check-ignore -v --no-index frontend(new)/pages/products.html` | `NOT_IGNORED`. |
| `git check-ignore -v --no-index frontend(new)/js/pages/products.js` | `NOT_IGNORED`. |
| `git check-ignore -v --no-index docs/UI_COMPLETION_REPORT.md` | `NOT_IGNORED`. |

21 file terlacak pada `frontend/` adalah baseline UI-01…UI-05:

```text
frontend/css/style.css
frontend/js/api.js
frontend/js/change-password.js
frontend/js/dashboard.js
frontend/js/login.js
frontend/js/order-detail.js
frontend/js/orders.js
frontend/js/payment.js
frontend/js/sales-order.js
frontend/js/ui.js
frontend/js/user-form.js
frontend/js/users.js
frontend/pages/change-password.html
frontend/pages/dashboard.html
frontend/pages/login.html
frontend/pages/order-detail.html
frontend/pages/orders.html
frontend/pages/payment.html
frontend/pages/sales-order.html
frontend/pages/user-form.html
frontend/pages/users.html
```

Kesimpulan tracking: seluruh implementasi baru masih lokal dan belum masuk index Git.Operasi pembersihan seperti `git clean` berisiko menghilangkan pekerjaan ini bila dilakukan tanpa
persetujuan.

---

## 3. Daftar halaman yang tersedia

### 3.1 File HTML

Kedua direktori berikut memiliki 16 file HTML yang sama:

```text
change-password.html
customer-form.html
customers.html
dashboard.html
login.html
order-detail.html
orders.html
payment.html
product-form.html
products.html
receivables.html
reports.html
sales-order.html
stock-in.html
user-form.html
users.html
```

UI-10 bukan file HTML tersendiri; UI-10 adalah integrasi PDF melalui endpoint:

```text
GET /api/orders/:id/invoice.pdf?format=a4|80mm
```

UI-17 bukan file HTML tersendiri; UI-17 adalah modal di dalam `pages/receivables.html`.

### 3.2 Pemetaan UI, peran frontend, dan status backend

Peran pada kolom “Frontend `data-roles`” diambil dari atribut `<body>` di `frontend(new)`. Kolom
“Backend saat ini” merujuk ke `PAGE_ACCESS` di `backend/src/middleware/pageGuard.js`.

| UI | Halaman / resource | Frontend `data-roles` | Backend saat ini | Keterangan |
|---|---|---|---|---|
| UI-01 | `/pages/login.html` | Publik | `PUBLIC` | Sudah diizinkan. |
| UI-02 | `/pages/dashboard.html` | Semua role login | `AUTHENTICATED` | Sudah diizinkan. |
| UI-03 | `/pages/change-password.html` | Semua role login | `AUTHENTICATED` | Sudah diizinkan. |
| UI-04 | `/pages/users.html` | `ADMIN` | `ADMIN` | Sudah diizinkan. |
| UI-05 | `/pages/user-form.html` | `ADMIN` | `ADMIN` | Sudah diizinkan. |
| UI-06 | `/pages/sales-order.html` | `SALES,ADMIN` | `['SALES','ADMIN']` | Sudah diizinkan. |
| UI-07 | `/pages/orders.html` | `ADMIN,SALES,KASIR` | `['ADMIN','SALES','KASIR']` | Sudah diizinkan. |
| UI-08 | `/pages/order-detail.html` | `ADMIN,SALES,KASIR` | `['ADMIN','SALES','KASIR']` | Sudah diizinkan. |
| UI-09 | `/pages/payment.html` | `KASIR` | `KASIR` | Sudah diizinkan. |
| UI-10 | `/api/orders/:id/invoice.pdf` | `ADMIN,KASIR` | Diatur router API | Bukan halaman statis. |
| UI-11 | `/pages/products.html` | `ADMIN,GUDANG` | **Belum ada** | 404 via guard. |
| UI-12 | `/pages/product-form.html` | `ADMIN` | **Belum ada** | 404 via guard. `data-page="products"`. |
| UI-13 | `/pages/stock-in.html` | `GUDANG` | **Belum ada** | 404 via guard. |
| UI-14 | `/pages/customers.html` | `ADMIN,SALES,KASIR` | **Belum ada** | 404 via guard. Menu `layout.js` hanya `ADMIN,KASIR`. |
| UI-15 | `/pages/customer-form.html` | `ADMIN` | **Belum ada** | 404 via guard. `data-page="customers"`. |
| UI-16 | `/pages/receivables.html` | `KASIR` | **Belum ada** | 404 via guard. |
| UI-17 | Modal di `receivables.html` | `KASIR` | Mengikuti UI-16 | Bukan route tersendiri. |
| UI-18 | `/pages/reports.html` | `ADMIN` | **Belum ada** | 404 via guard. |

Tujuh halaman yang belum masuk allowlist:

```text
/pages/products.html
/pages/product-form.html
/pages/stock-in.html
/pages/customers.html
/pages/customer-form.html
/pages/receivables.html
/pages/reports.html
```

### 3.3 Verifikasi keberadaan file UI-06…UI-18

Seluruh file berikut ditemukan di `frontend(new)/`:

```text
pages/sales-order.html          js/pages/sales-order.js
pages/orders.html               js/pages/orders.js
pages/order-detail.html         js/pages/order-detail.js
pages/payment.html              js/pages/payment.js
pages/products.html             js/pages/products.js
pages/product-form.html         js/pages/product-form.js
pages/stock-in.html             js/pages/stock-in.js
pages/customers.html            js/pages/customers.js
pages/customer-form.html        js/pages/customer-form.js
pages/receivables.html          js/pages/receivables.js
pages/reports.html              js/pages/reports.js
js/api.js
js/layout.js
css/style.css
```

Tidak ditemukan file yang hilang dari daftar yang diharapkan.

---

## 4. Kondisi frontend lama dan baru

### 4.1 Perbandingan file

| Metrik | `frontend/` (working tree saat audit) | `frontend(new)/` |
|---:|---:|---:|
| Total file | 45 | 37 |
| File terlacak Git | 21 | 0 |
| Path relatif sama | 36 | 36 |
| Path sama dengan hash SHA-256 identik | 0 | 0 |
| Path sama tetapi hash berbeda | 36 | 36 |
| Hanya ada di `frontend/` | 9 | 0 |
| Hanya ada di `frontend(new)/` | 0 | 1 |

Seluruh 36 file yang memiliki path relatif sama berbeda hash. Artinya, `frontend(new)` bukan sekadar
salinan identik; ia adalah revisi menyeluruh terhadap CSS, helper API/UI, shell, dan skrip halaman.

File yang hanya ada di `frontend/` (9 skrip lama UI-01…UI-05):

```text
js/change-password.js
js/dashboard.js
js/login.js
js/order-detail.js
js/orders.js
js/payment.js
js/sales-order.js
js/user-form.js
js/users.js
```

File yang hanya ada di `frontend(new)/`:

```text
js/pages/users-shell.js
```

### 4.2 Perbedaan kontrak yang paling penting

| Aspek | `frontend/` | `frontend(new)/` | Dampak integrasi |
|---|---|---|---|
| API helper | `js/api.js` mengekspos `window.DistriFlowAPI` dan `module.exports`. Path relatif terhadap `/api`, mis. `/auth/login`. | `js/api.js` mendefinisikan `const API` dengan path lengkap `/api/...`, `credentials: 'same-origin'`, dan `openPdf()`. Tidak mengekspos `window.DistriFlowAPI`. | Halaman baru yang memanggil `API.*` akan gagal jika tetap memuat `frontend/js/api.js` yang lama. |
| UI helper | `js/ui.js` mengekspos `window.DistriFlowUI`, berisi `MENU_BY_ROLE`, `notify()`, `renderRows()`. | `js/ui.js` mendefinisikan `const UI`, berisi `el()`, `toast()`, `fillTable()`, `roleLabel()`. Tidak ada `MENU_BY_ROLE`. | `layout.js` memakai `UI.el`; akan gagal jika memuat `frontend/js/ui.js` lama. Test menu juga masih bergantung ke helper lama. |
| Shell | Tiap halaman lama memakai skrip `js/<page>.js` dengan gaya Sprint 1. | `js/layout.js` untuk UI-06…UI-18; `js/pages/users-shell.js` khusus UI-04. | Dua implementasi shell dengan role dan label lokasi berbeda. |
| Tag script | `defer` digunakan, mis. `../js/api.js`, `../js/ui.js`, `../js/orders.js`. | Tanpa `defer`, mis. `../js/api.js`, `../js/ui.js`, `../js/layout.js`, `../js/pages/orders.js`. | Perilaku eksekusi berubah; skrip baru membungkus inisialisasi dengan `DOMContentLoaded` melalui `Layout.start()`. |
| PDF | `DistriFlowAPI.openInvoice()` melakukan navigasi langsung ke `/api/orders/:id/invoice.pdf?...`. | `API.openPdf()` melakukan `fetch`, membuat object URL, lalu membuka tab. | Perilaku cetak/headless dan penanganan error berbeda. |
| Redirect 401 | Memanggil hook `window.DistriFlowUI.onUnauthorized()` dan tetap menampilkan pesan login saat kredensial salah. | Hardcode `window.location.href = '/pages/login.html?expired=1'`. | Jika frontend baru dipasang di prefix, redirect dapat keluar ke frontend lama. |

### 4.3 Kondisi `frontend/` saat ini

`frontend/` berisi 21 file terlacak UI-01…UI-05 ditambah 24 file untracked:

- `frontend/js/layout.js`
- 16 file di `frontend/js/pages/`
- 7 file HTML baru di `frontend/pages/`

Hal ini penting: jika backend tetap menyajikan `frontend/`, maka halaman-halaman baru akan tersedia
secara fisik, tetapi mereka memuat `../js/api.js` dan `../js/ui.js` yang masih versi lama. Karena
halaman baru membutuhkan global `API` dan `UI`, kombinasi ini berisiko `API is not defined` /
`UI is not defined`. Menambahkan allowlist saja tidak cukup untuk mode hybrid ini.

---

## 5. Kondisi routing dan pageGuard

### 5.1 `backend/src/app.js`

Urutan middleware yang relevan:

```text
helmet + CSP
express.json / express.urlencoded
sessionMiddleware
createPageGuard()
app.use('/api', routes)
express.static(path.resolve(__dirname, '../../frontend'), { index:false, redirect:false, dotfiles:'ignore' })
404 handler
error handler
```

Poin penting:

- Guard dipasang **sebelum** static. Ini benar secara keamanan: HTML terlindungi tidak bisa diambil
  langsung melewati `express.static`.
- Static root saat ini adalah `../../frontend`, bukan `../../frontend(new)`.
- Guard dipanggil tanpa opsi, sehingga memakai `pagesDir` default `../../frontend/pages`.
- Unknown `.html` dikembalikan 404 oleh guard sebelum static.
- `/api/*` lolos dari guard karena bukan `.html` dan bukan path dalam allowlist, lalu ditangani
  router API.

### 5.2 `backend/src/middleware/pageGuard.js`

Allowlist kanonik saat ini:

```js
'/pages/login.html'          -> PUBLIC
'/pages/dashboard.html'      -> AUTHENTICATED
'/pages/change-password.html'-> AUTHENTICATED
'/pages/users.html'          -> 'ADMIN'
'/pages/user-form.html'      -> 'ADMIN'
'/pages/sales-order.html'    -> ['SALES','ADMIN']
'/pages/orders.html'         -> ['ADMIN','SALES','KASIR']
'/pages/order-detail.html'   -> ['ADMIN','SALES','KASIR']
'/pages/payment.html'        -> 'KASIR'
```

Perilaku guard:

- Hanya memproses `GET` dan `HEAD`.
- `/` diarahkan ke login bila guest atau dashboard bila sudah login.
- `PUBLIC` mengarahkan user yang sudah login ke dashboard.
- Rule bukan `PUBLIC` dicek terhadap `req.session.user.role`.
- Guest ditandai `false` sehingga `canAccess()` selalu menolak halaman terlindungi.
- Penolakan: guest ke `/pages/login.html`, user login ke `/pages/dashboard.html`.
- `sendFile()` mengambil filename dari `path.basename(pathname)` dengan root `pagesDir`, bukan dari
  input bebas.
- `LOGIN_PAGE` dan `DASHBOARD_PAGE` saat ini hardcode ke `/pages/...`.
- `PAGE_ACCESS` diekspor dan dipakai `backend/tests/uiMenu.test.js`.

### 5.3 Konsekuensi routing saat ini

1. Jika pengguna membuka `/pages/products.html`, guard tidak menemukan rule, path berakhir `.html`,
   dan mengembalikan 404.
2. Jika rule ditambahkan tetapi `pagesDir` masih `frontend/pages`, file yang dikirim adalah salinan
   di `frontend/pages`, bukan file di `frontend(new)/pages`.
3. Jika `pagesDir` diarahkan ke `frontend(new)/pages` tetapi static root tetap `frontend`, HTML baru
   memuat CSS/JS lama yang kontraknya berbeda.
4. Jika static root diarahkan ke `frontend(new)` tetapi `pagesDir` tetap lama, HTML lama dikirim
   dengan aset baru.
5. Karena itu, static root dan `pagesDir` harus konsisten bila `frontend(new)/` ingin disajikan
   secara utuh.

---

## 6. Perubahan minimum yang diperlukan agar frontend baru dapat diakses

Audit ini hanya mengidentifikasi; tidak mengubah kode.

### 6.1 Minimum mutlak untuk halaman UI-06…UI-18 yang sudah disalin ke `frontend/`

Jika yang dimaksud “dapat diakses” hanyalah 7 halaman yang sudah ada secara fisik di
`frontend/pages/`, maka perubahan minimal pada backend adalah menambahkan 7 entri `PAGE_ACCESS`:

```text
'/pages/products.html'      -> ['ADMIN','GUDANG']
'/pages/product-form.html'  -> 'ADMIN'
'/pages/stock-in.html'      -> 'GUDANG'
'/pages/customers.html'     -> ['ADMIN','SALES','KASIR']   (lihat risk role mismatch)
'/pages/customer-form.html' -> 'ADMIN'
'/pages/receivables.html'   -> 'KASIR'
'/pages/reports.html'       -> 'ADMIN'
```

Namun ini **tidak direkomendasikan** sebagai solusi akhir. Tanpa perubahan aset, halaman tersebut
memuat `frontend/js/api.js` dan `frontend/js/ui.js` lama, yang tidak menyediakan global `API` dan
`UI` yang dipakai skrip baru. Hasilnya dapat berupa halaman 200 tetapi JavaScript gagal.

### 6.2 Minimum untuk menyajikan `frontend(new)/` sebagai satu bundel yang konsisten

Perubahan minimum yang dimaksud adalah:

1. Extend `PAGE_ACCESS` dengan 7 halaman di atas.
2. Arahkan static root ke `frontend(new)`, misalnya dengan satu konstanta direktori frontend aktif.
3. Berikan `pagesDir` ke `createPageGuard()` sehingga `sendFile()` mengambil HTML dari
   `frontend(new)/pages`.
4. Pastikan `backend/tests/uiMenu.test.js` diperbarui atau dilengkapi agar menguji helper/menu yang
   benar-benar disajikan. File test saat ini masih mengimpor `../../frontend/js/ui`.
5. Pertahankan direktori `frontend/` di disk; jangan hapus atau timpa baseline UI-01…UI-05.

Secara konseptual, dua baris yang perlu selaras adalah:

```js
app.use(createPageGuard({ pagesDir: <frontend aktif>/pages }));
app.use(express.static(<frontend aktif>, { index:false, redirect:false, dotfiles:'ignore' }));
```

Tidak ada perubahan migrasi, schema, seed, `.env`, atau dependency yang diperlukan hanya untuk
melayani file statis dan menambah allowlist. Namun fitur Sprint 3 yang tombolnya dinonaktifkan tidak
akan menjadi aktif hanya dengan perubahan ini.

### 6.3 Opsi paling aman: integrasi bertahap dengan prefix

Rekomendasi audit:

- Pertahankan `frontend/` sebagai root default agar UI-01…UI-05 tetap stabil.
- Sajikan `frontend(new)/` pada prefix terpisah, misalnya `/new` atau `/ui2`, dengan guard dan static
  mount sendiri.
- Guard untuk prefix perlu prefix-aware karena `LOGIN_PAGE`/`DASHBOARD_PAGE` saat ini hardcode ke
  `/pages/...`; tanpa itu, user dapat “keluar” ke frontend lama saat forbidden/login.
- `frontend(new)/js/api.js` juga perlu penanganan redirect 401 yang prefix-aware, karena saat ini
  hardcode `/pages/login.html?expired=1`.
- Setelah smoke test per role untuk UI-01…UI-18 lolos, baru pertimbangkan menjadikan
  `frontend(new)/` sebagai root default.

---

## 7. Risiko integrasi

### 7.1 Risiko tinggi

| Risiko | Bukti | Dampak |
|---|---|---|
| Kontrak API global berubah | Old: `window.DistriFlowAPI`; new: `const API`, tanpa export `DistriFlowAPI`. | Halaman baru gagal jika memuat `api.js` lama; halaman lama gagal jika memuat `api.js` baru tanpa adapter. |
| Kontrak UI global berubah | Old: `window.DistriFlowUI` + `MENU_BY_ROLE`; new: `const UI`, tanpa `MENU_BY_ROLE`. | `layout.js` dan `users-shell.js` bergantung `UI.el`; test menu masih bergantung helper lama. |
| Hybrid `frontend/` rapuh | `frontend/pages/products.html` memuat `../js/api.js` dan `../js/ui.js` lama, sedangkan `frontend/js/pages/products.js` memakai `API`/`UI` baru. | Bisa terjadi halaman terbuka tetapi kosong/error JS. |
| `pageGuard` dan static root harus berpasangan | `app.js` memakai `frontend`, guard memakai `frontend/pages`. | Mengubah salah satu saja menghasilkan HTML/aset yang tidak cocok. |
| Semua kerja baru untracked | `git status --short` dan `git ls-files`. | Pekerjaan bisa hilang saat cleanup; tidak akan ikut deploy berbasis tracked files. |

### 7.2 Risiko menengah

| Risiko | Bukti | Dampak |
|---|---|---|
| Role `customers` tidak konsisten | `layout.js`: `ADMIN,KASIR`; `customers.html`: `ADMIN,SALES,KASIR`; `users-shell.js`: `ADMIN,KASIR`. | Keputusan backend perlu ditetapkan: SALES boleh mengakses langsung atau tidak. Audit tidak memilih. |
| Dua shell dengan data berbeda | `layout.js` memakai lokasi `Gudang Utama Bandung`; `users-shell.js` memakai `Gudang Utama Pasteur`. | Navigasi dan tampilan tidak konsisten antara UI-04 dan UI-06…UI-18. |
| Menu availability berbeda | `users-shell.js` menandai products/customers/receivables/reports sebagai unavailable; `layout.js` menampilkannya aktif. | Dari halaman users, menu baru tampak mati; dari dashboard, tampak aktif. |
| Redirect 401 hardcode | `frontend(new)/js/api.js` mengarahkan ke `/pages/login.html?expired=1`. | Jika dipasang di prefix, redirect keluar dari bundel baru. |
| PDF behavior berbeda | `openInvoice()` lama vs `openPdf()` baru. | Perlu regresi cetak invoice, terutama pada browser/headless dan popup blocker. |
| Test coupling | `backend/tests/uiMenu.test.js` mengimpor `../../frontend/js/ui`. | Test tetap lulus tetapi tidak menguji UI yang sebenarnya disajikan setelah switch. |

### 7.3 Risiko kompatibilitas/perubahan perilaku UI-01…UI-05

Berdasarkan perbandingan file dan isi helper:

- UI-01…UI-05 lama bergantung pada `DistriFlowAPI`, `DistriFlowUI`, skrip `js/<page>.js`, dan
  `defer`.
- UI-01…UI-05 versi baru bergantung pada `API`, `UI`, `js/pages/<page>.js`, `users-shell.js`, dan
  tanpa `defer`.
- `frontend(new)/js/ui.js` tidak memiliki `MENU_BY_ROLE`, sehingga migrasi test/menu tidak bisa
  dilakukan dengan sekadar mengganti path import.
- `users-shell.js` sengaja dibuat terpisah agar UI-01/02/03/05 “tidak berubah”, tetapi tetap
  mengganti mekanisme shell dan global yang dipakai. Oleh karena itu, status “tidak berubah” perlu
  dipahami sebagai **file lama tidak disentuh**, bukan sebagai kompatibilitas runtime otomatis.
- Sebelum switch default, perlu regression test nyata untuk login, dashboard, ganti password,
  daftar user, dan form user.

### 7.4 Risiko fungsi bisnis

- Banyak tombol pada UI-11…UI-18 sengaja dinonaktifkan karena endpoint Sprint 3 belum ada.
- UI-17 tidak menyimpan pelunasan karena endpoint pembayaran yang ada hanya menerima order
  `DRAFT`.
- UI-16 dan UI-18 memakai agregat lokal dari maksimal 100 order, bukan endpoint laporan resmi.
- UI-10 sudah terhubung ke endpoint PDF nyata, tetapi verifikasi browser headless menghasilkan 204;
  ini keterbatasan viewer, bukan bukti endpoint gagal.
- Sesuai `AGENTS.md`, jangan mengklaim UC-01…UC-07 selesai production-ready tanpa keputusan dan
  verifikasi lanjutan.

---

## 8. Rekomendasi langkah integrasi paling aman

1. **Amankan working tree dulu.** Pastikan `frontend(new)/`, `frontend/js/layout.js`,
   `frontend/js/pages/`, 7 HTML baru, dan kedua dokumen completion sengaja dimasukkan ke Git saat
   diizinkan. Jangan jalankan cleanup yang menghapus untracked files.
2. **Jangan hapus atau timpa `frontend/`.** Pertahankan baseline UI-01…UI-05 sebagai fallback.
3. **Gunakan integrasi bertahap.** Pasang `frontend(new)/` pada prefix terpisah dengan:
   - `createPageGuard()` instance sendiri yang memakai `frontend(new)/pages`;
   - static mount ke `frontend(new)`;
   - 7 entri allowlist baru;
   - redirect login/dashboard yang prefix-aware;
   - penanganan 401 di `api.js` yang tidak meninggalkan prefix.
4. **Sampler role sebelum switch.** Uji ADMIN, SALES, KASIR, GUDANG, dan guest untuk:
   - UI-01…UI-05 regression;
   - UI-06…UI-09 transaksi;
   - UI-11…UI-18 dengan tombol disabled/gap yang sesuai;
   - 7 halaman baru tidak 404;
   - role yang ditolak tidak membocorkan konten.
5. **Selaraskan kontrak helper.** Putuskan satu kontrak global yang stabil, misalnya adapter agar
   `window.DistriFlowAPI` dan `API` keduanya tersedia selama transisi, atau migrasikan seluruh
   halaman secara eksplisit. Hal yang sama untuk `window.DistriFlowUI` dan `UI`.
6. **Selaraskan menu dan role.** Tentukan satu sumber kebenaran untuk menu, terutama role
   `customers`, dan samakan label/lokasi antara `users-shell.js` dan `layout.js`.
7. **Perbarui test secara eksplisit.** Jangan hanya mengganti path import; tambahkan test yang
   memastikan menu yang diuji adalah menu yang dipakai frontend aktif dan semua allowlist memiliki
   halaman yang benar-benar tersedia di `pagesDir`.
8. **Baru pertimbangkan switch default.** Setelah regression hijau, arahkan root default ke
   `frontend(new)` dengan `pagesDir` yang konsisten, sambil menyimpan `frontend/` sebagai fallback.
9. **Jangan implementasikan Sprint 3 dalam langkah integrasi ini.** Endpoint write, pelunasan piutang,
   ekspor, dan laporan resmi tetap gap tersendiri.

---

## 9. Batas audit

- Audit ini tidak menjalankan migrasi, tidak mengubah database, tidak mengubah file source, tidak
  melakukan commit, dan tidak melakukan push.
- Audit ini tidak menjalankan perubahan konfigurasi backend.
- Audit ini tidak mengimplementasikan rekomendasi di atas.
- Satu-satunya file yang dibuat adalah `docs/POST_UI_AUDIT.md`.
- Pekerjaan dihentikan setelah laporan ini selesai sesuai instruksi.
