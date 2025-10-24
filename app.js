/* app.js
  MyFinance — frontend-only features:
  - Multi-user (register/login) with password hashed using SHA-256 (Web Crypto)
  - Per-user data stored under localStorage key "myfinance_<userid>_tx_v1"
  - PDF export (jsPDF), print
  - Local browser reminders using Notification API (works when browser open)
  - Theme (dark/light) toggle saved to localStorage
  - All previous features: chart, filters, toast, multi-undo, undo widget
*/

/* ----------------------------
   Constants & helpers
   ----------------------------*/
const APP_PREFIX = 'myfinance';
const USER_LIST_KEY = `${APP_PREFIX}_users_v1`;
const CURRENT_USER_KEY = `${APP_PREFIX}_current_user`;
const UNDO_DURATION = 10000; // 10s
const SOURCES = {
  toko_sembako: 'Toko Sembako',
  kebun_sawit: 'Kebun Sawit',
  jual_beli_tbs: 'Jual Beli TBS (Ramp)',
  jaringan_wifi: 'Jaringan Wifi',
  lainnya: 'Lainnya'
};
const COLORS = { toko_sembako:'#FF8A65', kebun_sawit:'#66BB6A', jual_beli_tbs:'#42A5F5', jaringan_wifi:'#AB47BC', lainnya:'#90A4AE' };

let currentUser = null; // {id, username}
let txs = []; // transactions for current user
let chartInstance = null;
let lastDeletedStack = [];
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

/* ----------------------------
   Storage helpers
   ----------------------------*/
function usersLoad(){ const raw = localStorage.getItem(USER_LIST_KEY); return raw ? JSON.parse(raw) : []; }
function usersSave(users){ localStorage.setItem(USER_LIST_KEY, JSON.stringify(users)); }

function userStorageKey(userId){ return `${APP_PREFIX}_${userId}_tx_v1`; }
function loadUserTransactions(userId){
  const raw = localStorage.getItem(userStorageKey(userId));
  return raw ? JSON.parse(raw) : [];
}
function saveUserTransactions(userId, data){
  localStorage.setItem(userStorageKey(userId), JSON.stringify(data));
}

/* ----------------------------
   Crypto: SHA-256 hashing for password (Web Crypto)
   ----------------------------*/
async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2,'0')).join('');
}

/* ----------------------------
   Auth & Multi-user
   - users list stored as [{id, username, passHash}]
   - current user id stored in CURRENT_USER_KEY
   ----------------------------*/
function generateId(prefix='u'){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

async function registerUser(username, password){
  const users = usersLoad();
  if(users.some(u => u.username === username)) throw new Error('Username sudah dipakai');
  const id = generateId('u');
  const passHash = await sha256Hex(password);
  users.push({ id, username, passHash });
  usersSave(users);
  // initialize empty tx storage
  saveUserTransactions(id, []);
  return { id, username };
}

async function loginUser(username, password){
  const users = usersLoad();
  const passHash = await sha256Hex(password);
  const u = users.find(x => x.username === username && x.passHash === passHash);
  if(!u) throw new Error('Username atau password salah');
  localStorage.setItem(CURRENT_USER_KEY, u.id);
  return { id: u.id, username: u.username };
}

function logoutUser(){
  localStorage.removeItem(CURRENT_USER_KEY);
  currentUser = null;
  txs = [];
  renderAuthArea();
  render(); // redraw empty or guest
}

function loadCurrentUserFromStorage(){
  const id = localStorage.getItem(CURRENT_USER_KEY);
  if(!id) return null;
  const users = usersLoad();
  const u = users.find(x => x.id === id);
  return u ? { id: u.id, username: u.username } : null;
}

/* ----------------------------
   Toast helper (reuse previous toast with progress)
   ----------------------------*/
function showToast(message, type='info', opts={}){ 
  const container = qs('#toastContainer'); if(!container) return null;
  const duration = opts.duration ?? 3500;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const actionHtml = opts.action ? `<button class="action btn-sm">${opts.action.label}</button>` : '';
  toast.innerHTML = `<div class="dot" style="background:${type==='success'?'var(--toast-success)': type==='error'?'var(--toast-error)':'var(--toast-info)'}"></div><div class="text">${message}</div>${actionHtml}<button class="close">&times;</button>`;
  if(opts.showProgress && duration > 0){ const prog = document.createElement('div'); prog.className='progress'; prog.innerHTML='<div class="bar"></div>'; toast.appendChild(prog); }
  container.appendChild(toast); requestAnimationFrame(()=>toast.classList.add('show'));
  toast.querySelector('.close').onclick = ()=>{ toast.classList.remove('show'); setTimeout(()=>toast.remove(),220); if(toast._interval) clearInterval(toast._interval); if(toast._timeout) clearTimeout(toast._timeout); };
  if(opts.action){ const btn = toast.querySelector('.action'); if(btn) btn.onclick = ()=>{ try{ opts.action.onClick(); } catch(e){console.error(e);} toast.querySelector('.close').click(); }; }
  if(opts.showProgress && duration>0){
    const bar = toast.querySelector('.bar'); const start = Date.now();
    toast._interval = setInterval(()=>{ const elapsed = Date.now()-start; const pct = Math.max(0,1-elapsed/duration); if(bar) bar.style.width = (pct*100)+'%'; },100);
  }
  if(duration>0) toast._timeout = setTimeout(()=>{ toast.classList.remove('show'); setTimeout(()=>toast.remove(),220); if(toast._interval) clearInterval(toast._interval); }, duration);
  return toast;
}

/* ----------------------------
   Theme (dark/light)
   ----------------------------*/
function applyTheme(theme){
  document.body.setAttribute('data-theme', theme);
  localStorage.setItem(`${APP_PREFIX}_theme`, theme);
  qs('#themeToggle').checked = theme === 'light';
}
function initTheme(){
  const saved = localStorage.getItem(`${APP_PREFIX}_theme`) || 'dark';
  applyTheme(saved);
  qs('#themeToggle').addEventListener('change', ()=>{ applyTheme(qs('#themeToggle').checked ? 'light' : 'dark'); });
}

/* ----------------------------
   Per-user data load/save & wrapper key
   ----------------------------*/
function loadUserData(){
  if(!currentUser) return;
  txs = loadUserTransactions(currentUser.id);
}
function saveUserData(){
  if(!currentUser) return;
  saveUserTransactions(currentUser.id, txs);
}

/* ----------------------------
   Chart & rendering (uses Chart.js)
   ----------------------------*/
function calcTotalsFromArray(arr){
  let totalIncome=0, totalExpense=0; const perSource={}; Object.keys(SOURCES).forEach(k=>perSource[k]=0);
  arr.forEach(t=>{ const amt=Number(t.amount)||0; if(t.type==='income'){ totalIncome+=amt; perSource[t.source]= (perSource[t.source]||0)+amt; } else totalExpense+=amt; });
  return { totalIncome, totalExpense, balance: totalIncome - totalExpense, perSource };
}
function renderChart(perSource){
  const labels = Object.keys(SOURCES).map(k=>SOURCES[k]);
  const data = Object.keys(SOURCES).map(k=>perSource[k]||0);
  const bg = Object.keys(SOURCES).map(k=>COLORS[k]||'#999');
  const ctx = document.getElementById('sourceChart');
  if(!ctx) return;
  if(chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, { type:'bar', data:{ labels, datasets:[{data, backgroundColor: bg, borderRadius:6, barThickness:28 }]}, options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ ticks:{ callback:(v)=> v.toLocaleString('id-ID') } } }, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=> 'Rp'+Number(ctx.raw).toLocaleString('id-ID') } } } } });
}

/* ----------------------------
   Filters (month/year/range)
   ----------------------------*/
function applyFilters(allTx){
  const start = qs('#rangeStart').value; const end = qs('#rangeEnd').value; const month = qs('#filterMonth').value; const year = qs('#filterYear').value;
  if(start && end){
    const s = new Date(start + '-01'); const [y,m] = end.split('-'); const e = new Date(Number(y), Number(m), 0);
    if(s>e){ showToast('Range tidak valid', 'error'); qs('#rangeEnd').value = ''; return allTx.slice(); }
    return allTx.filter(t=>{ const d=new Date(t.date); return d>=s && d<=e; });
  }
  if(month) return allTx.filter(t => (t.date||'').slice(0,7)===month);
  if(year) return allTx.filter(t => (t.date||'').slice(0,4)===year);
  return allTx.slice();
}
function buildYearOptions(){ const yrs = new Set(); txs.forEach(t=>{ if(t.date && t.date.length>=4) yrs.add(t.date.slice(0,4)); }); const sel = qs('#filterYear'); const prev=sel.value; sel.innerHTML='<option value="">— Semua Tahun —</option>'; Array.from(yrs).sort((a,b)=>b-a).forEach(y=>{ const o=document.createElement('option'); o.value=y; o.textContent=y; sel.appendChild(o); }); if(prev && Array.from(sel.options).some(o=>o.value===prev)) sel.value=prev; }

/* ----------------------------
   Undo multi stack (same as before)
   ----------------------------*/
function updateUndoWidget(){
  const w = qs('#undoWidget'); const cnt = qs('#undoCount'); if(!w || !cnt) return; const n = lastDeletedStack.length; if(n===0){ w.hidden=true; } else { cnt.textContent = String(n); w.hidden=false; } }
function undoAllPending(){
  if(lastDeletedStack.length===0){ showToast('Tidak ada untuk di-undo','info'); return; }
  const items = lastDeletedStack.slice().sort((a,b)=> a.index - b.index);
  items.forEach(it=>{ if(it.timeoutId) clearTimeout(it.timeoutId); const insertIndex = Math.min(it.index, txs.length); txs.splice(insertIndex,0,it.tx); });
  saveUserData(); lastDeletedStack=[]; updateUndoWidget(); showToast('Semua dikembalikan','success'); render();
}
function undoLastPending(){
  if(lastDeletedStack.length===0){ showToast('Tidak ada untuk di-undo','info'); return; }
  const it = lastDeletedStack.pop(); if(it.timeoutId) clearTimeout(it.timeoutId); const insertIndex = Math.min(it.index, txs.length); txs.splice(insertIndex,0,it.tx); saveUserData(); updateUndoWidget(); showToast('Transaksi terakhir dikembalikan','success'); render();
}

/* ----------------------------
   Render UI (auth area, table, summary)
   ----------------------------*/
function renderAuthArea(){
  const area = qs('#authArea'); area.innerHTML = '';
  if(!currentUser){
    // show login/register
    const loginBtn = document.createElement('button'); loginBtn.textContent='Login'; loginBtn.className='btn-sm muted';
    const regBtn = document.createElement('button'); regBtn.textContent='Register'; regBtn.className='btn-sm';
    loginBtn.onclick = showLoginModal; regBtn.onclick = showRegisterModal;
    area.appendChild(loginBtn); area.appendChild(regBtn);
  } else {
    const nameSpan = document.createElement('div'); nameSpan.textContent = currentUser.username; nameSpan.className='muted';
    const logoutBtn = document.createElement('button'); logoutBtn.textContent='Logout'; logoutBtn.className='btn-sm muted';
    logoutBtn.onclick = ()=>{ logoutUser(); showToast('Logged out','info'); };
    area.appendChild(nameSpan); area.appendChild(logoutBtn);
  }
}

function render(){
  buildYearOptions(); updateUndoWidget();
  const filtered = applyFilters(txs);
  const totals = calcTotalsFromArray(filtered);
  qs('#totalBalance').textContent = formatRupiah(totals.balance);
  qs('#totalIncome').textContent = formatRupiah(totals.totalIncome);
  qs('#totalExpense').textContent = formatRupiah(totals.totalExpense);
  // top source
  let top={key:null,val:0}; Object.keys(totals.perSource).forEach(k=>{ if(totals.perSource[k]>top.val){ top={key:k,val:totals.perSource[k]}; }});
  qs('#topSource').textContent = top.key ? `${SOURCES[top.key]} — ${formatRupiah(top.val)}` : '—';
  // source list
  const ul = qs('#sourceList'); ul.innerHTML='';
  Object.keys(totals.perSource).forEach(k=>{ const li = document.createElement('li'); li.innerHTML=`<span>${SOURCES[k]}</span><strong>${formatRupiah(totals.perSource[k])}</strong>`; ul.appendChild(li); });
  // table
  const tbody = qs('#txTable tbody'); tbody.innerHTML='';
  const sorted = txs.slice().sort((a,b)=> new Date(b.date)-new Date(a.date));
  sorted.forEach(t=>{
    const tr = document.createElement('tr');
    const filteredFlag = filtered.some(f=>f.id===t.id);
    tr.style.opacity = filteredFlag ? '1' : '0.55';
    tr.innerHTML = `<td>${t.date}</td><td class="${t.type==='income'?'tx-type-income':'tx-type-expense'}">${t.type==='income'?'Pemasukan':'Pengeluaran'}</td><td>${t.source? (SOURCES[t.source]||t.source):'-'}</td><td>${t.note||'-'}</td><td style="text-align:right">${formatRupiah(t.amount)}</td><td style="text-align:right"><button class="btn-sm muted" data-id="${t.id}">Hapus</button></td>`;
    tbody.appendChild(tr);
  });
  // bind delete
  qsa('button[data-id]').forEach(btn=>{
    btn.onclick = (e)=>{
      const id = e.target.dataset.id; if(!confirm('Hapus transaksi ini?')) return;
      const idx = txs.findIndex(x=>x.id===id); if(idx===-1) return;
      const removed = txs.splice(idx,1)[0]; saveUserData(); render();
      // push to undo stack
      const item = { id: removed.id, tx: removed, index: idx, timeoutId: null };
      lastDeletedStack.push(item); updateUndoWidget();
      item.timeoutId = setTimeout(()=>{ const pos = lastDeletedStack.findIndex(x=>x.id===item.id); if(pos!==-1) lastDeletedStack.splice(pos,1); updateUndoWidget(); }, UNDO_DURATION+300);
      // toast with progress and undo action
      showToast('Transaksi dihapus','info',{duration: UNDO_DURATION, showProgress:true, action:{label:'Undo', onClick: ()=>{ const pos = lastDeletedStack.findIndex(x=>x.id===item.id); if(pos===-1){ showToast('Undo tidak tersedia','error'); return; } const it = lastDeletedStack[pos]; if(it.timeoutId) clearTimeout(it.timeoutId); const insertIdx = Math.min(it.index, txs.length); txs.splice(insertIdx,0,it.tx); saveUserData(); lastDeletedStack.splice(pos,1); updateUndoWidget(); showToast('Transaksi dikembalikan','success'); render(); } } });
    };
  });
  // update chart
  try{ renderChart(totals.perSource); } catch(e){ console.error(e); }
}

/* ----------------------------
   Add / Clear transactions
   ----------------------------*/
function addTx(tx){
  tx.id = generateId('t');
  txs.push(tx); saveUserData(); showToast('Transaksi ditambahkan','success'); render();
}

/* ----------------------------
   PDF export (jsPDF)
   ----------------------------*/
async function exportPdfForCurrentFilter(){
  if(!currentUser){ showToast('Login dulu untuk export','error'); return; }
  // get filtered data
  const filtered = applyFilters(txs);
  const totals = calcTotalsFromArray(filtered);
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'portrait', unit:'pt', format:'a4' });
  const margin = 40;
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 40;
  doc.setFontSize(16); doc.text(`Laporan MyFinance — ${currentUser.username}`, margin, y); y+=24;
  const rangeLabel = (()=>{ const s = qs('#rangeStart').value, e=qs('#rangeEnd').value, m=qs('#filterMonth').value, yv=qs('#filterYear').value; if(s && e) return `Range: ${s} → ${e}`; if(m) return `Bulan: ${m}`; if(yv) return `Tahun: ${yv}`; return 'Semua data'; })();
  doc.setFontSize(11); doc.text(rangeLabel, margin, y); y+=18;
  doc.text(`Total Pemasukan: ${formatRupiah(totals.totalIncome)}`, margin, y); y+=16;
  doc.text(`Total Pengeluaran: ${formatRupiah(totals.totalExpense)}`, margin, y); y+=16;
  doc.text(`Saldo: ${formatRupiah(totals.balance)}`, margin, y); y+=22;
  doc.text('Ringkasan per Sumber:', margin, y); y+=14;
  Object.keys(totals.perSource).forEach(k=>{
    doc.text(`• ${SOURCES[k]}: ${formatRupiah(totals.perSource[k])}`, margin+10, y); y+=14;
  });
  y+=8;
  // table header
  doc.setFontSize(12); doc.text('Daftar transaksi:', margin, y); y+=14;
  doc.setFontSize(10);
  const tableCols = ['Tanggal','Type','Sumber','Catatan','Jumlah'];
  const colX = [margin, margin+90, margin+170, margin+310, pageWidth-140];
  // header row
  tableCols.forEach((c,i)=> doc.text(c, colX[i], y));
  y+=12;
  // rows
  const rows = filtered.slice().sort((a,b)=> new Date(b.date)-new Date(a.date));
  rows.forEach(r=>{
    if(y > doc.internal.pageSize.getHeight() - 60){ doc.addPage(); y = 40; }
    doc.text(r.date, colX[0], y);
    doc.text(r.type==='income'?'Pemasukan':'Pengeluaran', colX[1], y);
    doc.text(r.source? (SOURCES[r.source]||r.source) : '-', colX[2], y);
    const note = r.note || '-';
    doc.text(note.length>30 ? note.slice(0,30)+'…' : note, colX[3], y);
    doc.text(formatRupiah(r.amount), colX[4], y, { align:'right' });
    y+=14;
  });
  // finalize
  const fileName = `myfinance_report_${currentUser.username}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fileName);
  showToast('PDF diunduh', 'success');
}

/* ----------------------------
   Reminder: Notification API & scheduling (local)
   - Works while browser open. For background/closed, need Push API + service worker + server.
   ----------------------------*/
function requestNotificationPermission(){
  if(!('Notification' in window)) return Promise.resolve('denied');
  return Notification.requestPermission();
}
let reminderTimer = null;
function setReminder(timeStr){
  // store per user
  if(!currentUser) { showToast('Login untuk atur reminder', 'error'); return; }
  localStorage.setItem(`${APP_PREFIX}_${currentUser.id}_reminder`, timeStr);
  scheduleReminder();
  showToast(`Reminder di-set pada ${timeStr}`, 'info');
}
function clearReminder(){
  if(!currentUser) return;
  localStorage.removeItem(`${APP_PREFIX}_${currentUser.id}_reminder`);
  if(reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = null;
  showToast('Reminder dibersihkan', 'info');
}
function scheduleReminder(){
  if(reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  if(!currentUser) return;
  const timeStr = localStorage.getItem(`${APP_PREFIX}_${currentUser.id}_reminder`);
  if(!timeStr) return;
  // compute ms until next occurrence
  const [hh, mm] = timeStr.split(':').map(Number);
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hh, mm, 0, 0);
  if(next <= now) next.setDate(next.getDate()+1);
  const ms = next - now;
  reminderTimer = setTimeout(async ()=> {
    // show notification if permission
    const perm = await Notification.requestPermission();
    if(perm === 'granted'){
      new Notification('MyFinance Reminder', { body: 'Jangan lupa catat pemasukan/pengeluaran hari ini.' });
    } else {
      showToast('Reminder: buka browser dan catat transaksi!', 'info');
    }
    // schedule next day
    scheduleReminder();
  }, ms);
}

/* ----------------------------
   Small UI helpers
   ----------------------------*/
function formatRupiah(n){ const x = Math.abs(Number(n)||0); return 'Rp'+ x.toLocaleString('id-ID'); }
function generateId(prefix='x'){ return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

/* ----------------------------
   Modals (simple prompt-based for login/register)
   ----------------------------*/
function showRegisterModal(){
  const username = prompt('Pilih username (tanpa spasi):');
  if(!username) return;
  const password = prompt('Pilih password (min 4 karakter):');
  if(!password || password.length < 4){ alert('Password terlalu pendek'); return; }
  registerUserFlow(username, password).catch(err => showToast(err.message || 'Register gagal','error'));
}
async function registerUserFlow(username, password){
  try{
    const u = await registerUser(username, password);
    showToast('Registrasi berhasil — langsung login', 'success');
    currentUser = u;
    localStorage.setItem(CURRENT_USER_KEY, u.id);
    loadUserData(); renderAuthArea(); render();
  }catch(e){ showToast(e.message || 'Register gagal','error'); }
}
function showLoginModal(){
  const username = prompt('Username:');
  if(!username) return;
  const password = prompt('Password:');
  if(!password) return;
  loginUserFlow(username, password).catch(err => showToast(err.message || 'Login gagal','error'));
}
async function loginUserFlow(username, password){
  try{
    const u = await loginUser(username, password);
    currentUser = u;
    loadUserData();
    renderAuthArea();
    scheduleReminder(); // load reminder if set
    render();
    showToast('Login sukses','success');
  }catch(e){ showToast(e.message || 'Login gagal','error'); }
}

/* ----------------------------
   Bind UI & init
   ----------------------------*/
function attachUi(){
  // theme
  initTheme();

  // auth area
  currentUser = loadCurrentUserFromStorage();
  if(currentUser) loadUserData();
  renderAuthArea();

  // tx form
  qs('#txForm').addEventListener('submit', ev=>{
    ev.preventDefault();
    if(!currentUser){ showToast('Login dulu untuk menyimpan transaksi','error'); return; }
    const date = qs('#txDate').value || new Date().toISOString().slice(0,10);
    const type = qs('#txType').value;
    const source = qs('#txSource').value;
    const amount = Number(qs('#txAmount').value || 0);
    const note = qs('#txNote').value.trim();
    if(!amount || amount <= 0){ showToast('Masukkan jumlah valid','error'); return; }
    addTx({ id: generateId('t'), date, type, source: type==='income'?source:'pengeluaran', amount, note });
    qs('#txForm').reset(); qs('#txDate').value = new Date().toISOString().slice(0,10);
  });

  qs('#clearBtn').addEventListener('click', ()=>{ if(!currentUser){ showToast('Login dulu','error'); return; } if(confirm('Hapus semua transaksi dari akun ini?')){ txs=[]; saveUserData(); render(); showToast('Semua transaksi dihapus','info'); } });

  // filters
  qs('#applyFilter').addEventListener('click', ()=>{ render(); showToast('Filter diterapkan','info'); });
  qs('#clearFilter').addEventListener('click', ()=>{ qs('#filterMonth').value=''; qs('#filterYear').value=''; qs('#rangeStart').value=''; qs('#rangeEnd').value=''; render(); showToast('Filter direset','info'); });
  qs('#filterMonth').addEventListener('change', ()=>{ qs('#rangeStart').value=''; qs('#rangeEnd').value=''; render(); });
  qs('#filterYear').addEventListener('change', ()=>{ qs('#filterMonth').value=''; qs('#rangeStart').value=''; qs('#rangeEnd').value=''; render(); });

  // undo widget
  qs('#undoAllBtn').addEventListener('click', ()=>undoAllPending());
  qs('#undoLastBtn').addEventListener('click', ()=>undoLastPending());

  // export/print
  qs('#exportPdfBtn').addEventListener('click', ()=>exportPdfForCurrentFilter());
  qs('#printBtn').addEventListener('click', ()=>{ window.print(); });

  // reminder
  qs('#setReminderBtn').addEventListener('click', async ()=>{
    if(!currentUser){ showToast('Login untuk set reminder','error'); return; }
    const t = qs('#reminderTime').value;
    if(!t){ showToast('Pilih jam terlebih dahulu','error'); return; }
    const perm = await requestNotificationPermission();
    if(perm !== 'granted'){ showToast('Izin notifikasi ditolak — reminder akan tampil sebagai toast', 'info'); }
    setReminder(t);
  });
  qs('#clearReminderBtn').addEventListener('click', ()=>{ clearReminder(); });
  // load stored reminder time into input
  if(currentUser){
    const r = localStorage.getItem(`${APP_PREFIX}_${currentUser.id}_reminder`); if(r) qs('#reminderTime').value = r;
  }

  // prefill date
  qs('#txDate').value = new Date().toISOString().slice(0,10);

  // chart initial render
  render();
  // schedule reminder
  scheduleReminder();
}

/* ----------------------------
   Exposed auth functions used by modal code
   ----------------------------*/
async function registerUser(username,password){
  const users = usersLoad();
  if(users.some(u=>u.username===username)) throw new Error('Username sudah ada');
  const id = generateId('u');
  const passHash = await sha256Hex(password);
  users.push({ id, username, passHash });
  usersSave(users);
  saveUserTransactions(id, []);
  return { id, username };
}
async function loginUser(username,password){
  const users = usersLoad();
  const passHash = await sha256Hex(password);
  const u = users.find(x=>x.username===username && x.passHash===passHash);
  if(!u) throw new Error('Username/password salah');
  localStorage.setItem(CURRENT_USER_KEY, u.id);
  return { id: u.id, username: u.username };
}
function logoutUser(){ localStorage.removeItem(CURRENT_USER_KEY); currentUser=null; txs=[]; renderAuthArea(); render(); }

/* ----------------------------
   Init app
   ----------------------------*/
document.addEventListener('DOMContentLoaded', ()=>{
  attachUi();
});
