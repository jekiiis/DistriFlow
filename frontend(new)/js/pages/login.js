/**
 * @file    login.js
 * @author  Tim DistriFlow — Kelompok TUBES CAK3BAB3 (lihat README)
 * @tanggal 10 November 2026
 * UI-01 Login — UC-01 langkah 1–4 dan alternatif 2a, 3a–3c, 4b
 *
 * Disalin dari frontend/js/pages/login.js agar halaman UI-01 di frontend(new)
 * memiliki skrip yang dirujuknya. Logika autentikasi tidak diubah; satu-satunya
 * tambahan adalah menampilkan kalimat penjelas lockout dari frame Figma.
 */
(function () {
  const form = UI.$('#formLogin');
  const label1 = UI.$('#label1');
  const detail = UI.$('#label1Detail');
  const tampil = (msg, cls = 'err') => {
    label1.textContent = msg;
    label1.className = `alert ${cls}`;
    if (detail) detail.hidden = !/terkunci/i.test(msg);
  };

  // Ikon mata pada field password (UI-01, rancangan Figma)
  UI.$('#btnPw').addEventListener('click', () => {
    const pw = UI.$('#password');
    const lihat = pw.type === 'password';
    pw.type = lihat ? 'text' : 'password';
    UI.$('#btnPw').textContent = lihat ? 'Sembunyi' : 'Lihat';
  });

  if (UI.param('expired')) tampil('Sesi berakhir, silakan login kembali', 'warn');            // 4b

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = UI.$('#username').value.trim();
    const password = UI.$('#password').value;
    if (!username || !password) return tampil('Username dan password wajib diisi');           // 2a
    await UI.busy(UI.$('#btnLogin'), async () => {
      try {
        await API.post('/api/auth/login', { username, password });
        window.location.href = 'dashboard.html';
      } catch (err) {
        tampil(err.message);                                                                   // 3a–3c
        UI.$('#password').value = '';
        UI.$('#password').focus();
      }
    });
  });
}());
