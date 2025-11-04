// login.js
(function(){
  const API_BASE = (window.API_BASE) || 'https://yura-api.onrender.com';

  const form = document.getElementById('loginForm');
  const msg  = document.getElementById('loginMsg');

  function showMsg(text, ok=false){
    if (!msg) return;
    msg.textContent = text;
    msg.className = 'msg ' + (ok ? 'ok' : 'err');
  }

  async function login(username, password){
    // Jika backend tersedia:
    try {
      const res = await fetch((API_BASE.replace(/\/$/,'') + '/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const e = await res.json().catch(()=> ({}));
        throw new Error(e?.error || `${res.status} ${res.statusText}`);
      }
      const data = await res.json(); // { token, user }
      localStorage.setItem('fm_token', data.token);
      localStorage.setItem('fm_user', JSON.stringify(data.user || { username }));
      location.href = 'index.html';
    } catch (err) {
      // fallback (opsional) kalau API down
      if (username === 'demo' && password === 'demo123') {
        localStorage.setItem('fm_token', 'demo-token');
        localStorage.setItem('fm_user', JSON.stringify({ username:'demo' }));
        location.href = 'index.html';
        return;
      }
      showMsg(err.message || 'Login gagal', false);
    }
  }

  form?.addEventListener('submit', (e)=>{
    e.preventDefault();
    const username = (document.getElementById('username')?.value || '').trim();
    const password = (document.getElementById('password')?.value || '');
    if (!username || !password) return showMsg('Lengkapi data', false);
    showMsg('Memproses…', true);
    login(username, password);
  });
})();
