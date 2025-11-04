// login.js — Validasi UX: Show/Hide password, Remember Me, Error messages
document.body.setAttribute('data-theme', 'light');
// Force light on login page (defensive)
try { document.body.setAttribute('data-theme', 'light'); } catch {}
(function(){
  const $ = (s)=>document.querySelector(s);

  const form = $('#loginForm');
  const userEl = $('#username');
  const passEl = $('#password');
  const msgEl  = $('#loginMsg');
  const btn    = $('#loginBtn');
  const toggle = $('#togglePw');
  const remember = $('#rememberMe');

  // ===== Helpers
  const API_BASE = (window.API_BASE || 'https://yura-api.onrender.com').replace(/\/$/,''); // jika backend aktif
  function showMsg(text, type='error'){
    if(!msgEl) return;
    msgEl.textContent = text || '';
    msgEl.className = 'msg ' + (type || '');
  }
  function setLoading(on){
    if(!btn) return;
    btn.disabled = !!on;
    btn.textContent = on ? 'Memeriksa…' : 'Log In';
  }
  function loadRemembered(){
    try{
      const saved = localStorage.getItem('yura-remember-username');
      const flag  = localStorage.getItem('yura-remember-me') === '1';
      if(saved && userEl) userEl.value = saved;
      if(remember) remember.checked = flag;
    }catch{}
  }
  function saveRemembered(username){
    try{
      if(remember && remember.checked){
        localStorage.setItem('yura-remember-username', username || '');
        localStorage.setItem('yura-remember-me', '1');
      }else{
        localStorage.removeItem('yura-remember-username');
        localStorage.removeItem('yura-remember-me');
      }
    }catch{}
  }
  function storeLogin(token, user){
    try{
      if(token) localStorage.setItem('fm_token', token);
      if(user)  localStorage.setItem('fm_user', JSON.stringify(user));
    }catch{}
  }

  // ===== Show/Hide password
  if (toggle && passEl){
    toggle.addEventListener('click', ()=>{
      const isPw = passEl.type === 'password';
      passEl.type = isPw ? 'text' : 'password';
      toggle.classList.toggle('is-on', isPw);
      toggle.setAttribute('aria-label', isPw ? 'Sembunyikan password' : 'Tampilkan password');
    });
  }

  // ===== Muat Remember Me
  loadRemembered();

  // ===== Client-side validation ringan
  function validate(){
    if(!userEl || !passEl) return false;
    const u = (userEl.value||'').trim();
    const p = (passEl.value||'').trim();
    if(!u){ showMsg('Username wajib diisi.'); userEl.focus(); return false; }
    if(!p){ showMsg('Password wajib diisi.'); passEl.focus(); return false; }
    return {u,p};
  }

  // ===== Fallback demo checker (offline)
  function offlineAuth(u,p){
    // Demo default (tetap dukung mode lama): demo/demo123
    if (u !== 'demo') {
      return { ok:false, code:'NO_USER', message:'Username tidak terdaftar.' };
    }
    if (p !== 'demo123') {
      return { ok:false, code:'BAD_PASS', message:'Password salah.' };
    }
    return { ok:true, token:'demo-token', user:{ username:'demo' } };
  }

  // ===== Submit handler
  if (form){
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      showMsg('');
      const v = validate();
      if(!v) return;

      const {u,p} = v;
      setLoading(true);

      // Coba ke backend jika tersedia, jika gagal → fallback offline
      let usedBackend = false;
      try{
        // Jika ingin mematikan backend sementara, set window.USE_BACKEND=false
        if (window.USE_BACKEND !== false){
          const res = await fetch(API_BASE + '/auth/login', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ username:u, password:p })
          });
          usedBackend = true;
          if (!res.ok){
            // Terjemahkan error agar user-friendly
            if (res.status === 404) throw new Error('Username tidak terdaftar.');
            if (res.status === 401) throw new Error('Password salah.');
            throw new Error('Gagal login. Coba lagi.');
          }
          const j = await res.json();
          // Normalisasi
          const token = j.token || j.access_token || '';
          const user  = j.user  || { username: u };
          storeLogin(token, user);
          saveRemembered(u);
          showMsg('Login berhasil. Mengalihkan…', 'success');
          location.href = 'index.html';
          return;
        }
      }catch(err){
        console.warn('[login] backend login failed → fallback offline', err?.message || err);
      }

      // Fallback offline
      const r = offlineAuth(u,p);
      if(!r.ok){
        // Kode error ke message rapi
        showMsg(r.message || 'Login gagal.'); // "Username tidak terdaftar." | "Password salah."
        setLoading(false);
        return;
      }
      // Sukses offline
      storeLogin(r.token, r.user);
      saveRemembered(u);
      showMsg('Login berhasil (offline demo).', 'success');
      location.href = 'index.html';
    });
  }
})();
