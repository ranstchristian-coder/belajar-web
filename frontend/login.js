/* login.js — YuRa Personal Finance (LOGIN PAGE ONLY) */

/* =========================
   Utilities
   ========================= */
function $(s){ return document.querySelector(s); }
function save(k,v){ localStorage.setItem(k, JSON.stringify(v)); }
function load(k,d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } }

/* =========================
   Konfigurasi User Offline
   ========================= */
/* Tambahkan/hapus user di sini */
const USERS = [
  { username: 'christian', password: '11104085', display: 'Christian' },
  { username: 'demo',      password: 'demo123',  display: 'Demo User' } // ← opsional, boleh dihapus
];

/* Token generator sederhana (offline) */
function makeToken(u){
  return 'tok_' + btoa(u.username + '|' + Date.now());
}

/* =========================
   Force tema terang di halaman login
   ========================= */
try { document.body.setAttribute('data-theme', 'light'); } catch {}

/* =========================
   Prefill Remember Username
   ========================= */
(function initRemember(){
  const saved = localStorage.getItem('remember-username') || '';
  const u = $('#username');
  const cb = $('#rememberUser');
  if (u && saved){ u.value = saved; }
  if (cb && saved){ cb.checked = true; }
})();

/* =========================
   Show/Hide Password
   ========================= */
(function bindShowHide(){
  const pwd = $('#password');
  const eye = $('#togglePwd');
  if (!pwd || !eye) return;
  eye.addEventListener('click', () => {
    const t = pwd.getAttribute('type') === 'password' ? 'text' : 'password';
    pwd.setAttribute('type', t);
    eye.setAttribute('aria-pressed', t === 'text' ? 'true' : 'false');
  });
})();

/* =========================
   Submit Login
   ========================= */
(function bindLogin(){
  const form = $('#loginForm');
  const msg  = $('#loginMsg');
  const uEl  = $('#username');
  const pEl  = $('#password');
  const cb   = $('#rememberUser');

  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    msg && (msg.textContent = '');

    const username = (uEl?.value || '').trim();
    const password = pEl?.value || '';

    if (!username || !password){
      showMsg('Mohon isi username & password.', 'error');
      return;
    }

    // === Cek ke daftar USERS (offline-first)
    const found = USERS.find(u => u.username === username);
    if (!found){
      showMsg('Username tidak terdaftar.', 'error'); // UX: pesan rapi
      return;
    }
    if (found.password !== password){
      showMsg('Password salah. Coba lagi.', 'error');
      return;
    }

    // === Berhasil
    const token = makeToken(found);
    // Simpan sesi untuk app.js
    localStorage.setItem('fm_token', token);
    localStorage.setItem('fm_user', JSON.stringify({ username: found.username, display: found.display }));

    // Remember username (hanya username, bukan password)
    if (cb && cb.checked) localStorage.setItem('remember-username', found.username);
    else localStorage.removeItem('remember-username');

    // Redirect ke app utama
    location.href = 'index.html';
  });

  function showMsg(text, kind){
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'msg ' + (kind || 'info'); // kelas CSS: .msg.error / .msg.success
  }
})();

/* =========================
   Theme switcher khusus login (jika ada)
   ========================= */
(function loginTheme(){
  const KEY='login-theme';
  const sel = document.getElementById('loginThemeSelect');
  const body= document.body;
  const saved = localStorage.getItem(KEY) || 'light';
  body.setAttribute('data-login-theme', saved);
  if (sel) sel.value = saved;
  sel && sel.addEventListener('change', () => {
    const v = sel.value || 'light';
    body.setAttribute('data-login-theme', v);
    localStorage.setItem(KEY, v);
  });
})();
