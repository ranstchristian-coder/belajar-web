// login.js — YuRa Personal Finance
const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3000' : '';

const form = document.getElementById('loginForm');
const demoBtn = document.getElementById('demoBtn');
const msg = document.getElementById('loginMsg');

function showMsg(t, isError=false){
  if(msg){ msg.textContent = t; msg.style.color = isError ? '#e74c3c' : '#1f7a3a'; }
}

async function authenticateServer({ username, password }){
  if(!API_BASE) return { ok:false, error:'No API configured' };
  try{
    const res = await fetch(API_BASE + '/api/login', {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ username, password }),
      cache:'no-store'
    });
    const json = await res.json().catch(()=>({ ok:false, error:'Invalid response' }));
    return json;
  }catch(err){
    return { ok:false, error: 'Cannot reach server' };
  }
}

async function doLocalDemoLogin(){
  const token = 'demo-token-' + Date.now();
  const user = { username: 'demo', fullname: 'Pengguna Demo' };
  localStorage.setItem('fm_token', token);
  localStorage.setItem('fm_user', JSON.stringify(user));
  showMsg('Login demo — diarahkan...', false);
  setTimeout(()=> location.href = 'index.html', 300);
}

async function doLogin(e){
  e && e.preventDefault();
  showMsg('Memproses...');
  const u = document.getElementById('username').value.trim();
  const p = document.getElementById('password').value.trim();
  if(!u || !p) return showMsg('Isi username & password', true);

  if(API_BASE){
    const r = await authenticateServer({ username:u, password:p });
    if(r.ok){
      localStorage.setItem('fm_token', r.token);
      localStorage.setItem('fm_user', JSON.stringify(r.user));
      showMsg('Berhasil — diarahkan...');
      return setTimeout(()=> location.href = 'index.html', 300);
    }
    if(r.error && r.error.toLowerCase().includes('invalid')) return showMsg('Username/password salah', true);
    // fallback ke demo jika server tidak terjangkau
    showMsg('Server tidak bisa dijangkau — pakai demo.', false);
    return doLocalDemoLogin();
  } else {
    if(u==='demo' && p==='demo123') return doLocalDemoLogin();
    return showMsg('Tidak ada server. Gunakan Login Demo.', true);
  }
}

form && form.addEventListener('submit', doLogin);
demoBtn && demoBtn.addEventListener('click', (e)=>{ e.preventDefault(); doLocalDemoLogin(); });

// auto-redirect jika sudah login
(function(){ const t = localStorage.getItem('fm_token'); if(t){ setTimeout(()=> location.href='index.html', 100); }})();
