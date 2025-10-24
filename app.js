// === app.js ===
// MyFinance — multi-undo (10s) + toast countdown + Undo last & Undo all + filters + chart

const KEY = 'myfinance_tx_v1';

// 4 sumber pemasukan utama (id => label)
const SOURCES = {
  toko_sembako: 'Toko Sembako',
  kebun_sawit: 'Kebun Sawit',
  jual_beli_tbs: 'Jual Beli TBS (Ramp)',
  jaringan_wifi: 'Jaringan Wifi',
  lainnya: 'Lainnya'
};

// colors per source
const COLORS = {
  toko_sembako: '#FF8A65',
  kebun_sawit:  '#66BB6A',
  jual_beli_tbs: '#42A5F5',
  jaringan_wifi:'#AB47BC',
  lainnya:      '#90A4AE'
};

let txs = [];
let chartInstance = null;

// multi-undo stack
let lastDeletedStack = [];
const UNDO_DURATION = 10000; // 10 seconds

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

// Toast utility with countdown progress. Returns object { timeoutId, intervalId, toastEl }
function showToast(message, type = 'info', opts = {}) {
  // opts: { duration, action: { label, onClick } , showProgress: boolean }
  const container = qs('#toastContainer');
  if(!container) return null;
  const duration = opts.duration ?? 3500;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const actionHtml = opts.action ? `<button class="action btn-sm" type="button">${opts.action.label}</button>` : '';
  toast.innerHTML = `
    <div class="dot" style="background:${type==='success'? 'var(--toast-success)' : type==='error' ? 'var(--toast-error)' : 'var(--toast-info)'}"></div>
    <div class="text">${message}</div>
    ${actionHtml}
    <button class="close" aria-label="close">&times;</button>
  `;
  // optionally add progress bar
  if(opts.showProgress && duration > 0){
    const prog = document.createElement('div');
    prog.className = 'progress';
    prog.innerHTML = `<div class="bar"></div>`;
    toast.appendChild(prog);
  }

  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));

  // removal helper
  const remove = () => {
    toast.classList.remove('show');
    setTimeout(()=> { try{ toast.remove(); } catch(e){} }, 220);
    // clear any interval stored
    if(toast._intervalId) clearInterval(toast._intervalId);
    if(toast._timeoutId) clearTimeout(toast._timeoutId);
  };

  toast.querySelector('.close').onclick = remove;

  // action handler
  if(opts.action){
    const btn = toast.querySelector('.action');
    if(btn) btn.onclick = () => { try{ opts.action.onClick(); } catch(e){ console.error(e); } remove(); };
  }

  // progress animation (reduce width every 100ms)
  if(opts.showProgress && duration > 0){
    const bar = toast.querySelector('.bar');
    const start = Date.now();
    const total = duration;
    toast._intervalId = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 1 - elapsed / total);
      if(bar) bar.style.width = (pct * 100) + '%';
    }, 100);
  }

  // auto remove after duration
  if(duration > 0){
    toast._timeoutId = setTimeout(remove, duration);
  }

  return { timeoutId: toast._timeoutId, intervalId: toast._intervalId, toastEl: toast };
}

const formatRupiah = (n) => {
  const x = Math.abs(Number(n) || 0);
  return 'Rp' + x.toLocaleString('id-ID');
};

// storage
function load(){ const raw = localStorage.getItem(KEY); txs = raw ? JSON.parse(raw) : []; }
function save(){ localStorage.setItem(KEY, JSON.stringify(txs)); }

// filter helpers
function parseMonthToDateStart(monthStr){ if(!monthStr) return null; const [y,m] = monthStr.split('-').map(Number); return new Date(y, m -1, 1); }
function parseMonthToDateEnd(monthStr){ if(!monthStr) return null; const [y,m] = monthStr.split('-').map(Number); return new Date(y, m, 0); }
function isRangeValid(start,end){ if(!start||!end) return true; const s=parseMonthToDateStart(start), e=parseMonthToDateEnd(end); return s<=e; }

function applyFilters(allTx){
  const start = qs('#rangeStart').value;
  const end = qs('#rangeEnd').value;
  const month = qs('#filterMonth').value;
  const year = qs('#filterYear').value;

  if(start && end){
    if(!isRangeValid(start,end)){
      showToast('Range tidak valid: tanggal akhir lebih awal dari tanggal mulai. Perbaiki pilihan range.', 'error', { duration: 4000 });
      qs('#rangeEnd').value = '';
      return allTx.slice();
    }
    const s = parseMonthToDateStart(start), e = parseMonthToDateEnd(end);
    return allTx.filter(t => { const d = new Date(t.date); return d >= s && d <= e; });
  }
  if(month) return allTx.filter(t => (t.date||'').slice(0,7) === month);
  if(year) return allTx.filter(t => (t.date||'').slice(0,4) === year);
  return allTx.slice();
}

function buildYearOptions(){
  const years = new Set(); txs.forEach(t => { if(t.date && t.date.length>=4) years.add(t.date.slice(0,4)); });
  const sel = qs('#filterYear'); const prev = sel.value;
  sel.innerHTML = '<option value="">— Semua Tahun —</option>';
  Array.from(years).sort((a,b)=> b-a).forEach(y => { const opt = document.createElement('option'); opt.value=y; opt.textContent=y; sel.appendChild(opt); });
  if(prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

function calcTotalsFromArray(arr){
  let totalIncome=0, totalExpense=0; const perSource={}; Object.keys(SOURCES).forEach(k=>perSource[k]=0);
  arr.forEach(t=>{ const amt=Number(t.amount)||0; if(t.type==='income'){ totalIncome+=amt; if(perSource[t.source]!==undefined) perSource[t.source]+=amt; else perSource['lainnya']+=amt; } else totalExpense+=amt; });
  const balance = totalIncome - totalExpense; return { totalIncome, totalExpense, balance, perSource };
}

function renderChart(perSource){
  const labels = Object.keys(SOURCES).map(k => SOURCES[k]);
  const data = Object.keys(SOURCES).map(k => perSource[k] || 0);
  const backgroundColors = Object.keys(SOURCES).map(k => COLORS[k] || '#999');
  const ctx = document.getElementById('sourceChart'); if(!ctx) return;
  if(chartInstance){ chartInstance.destroy(); chartInstance = null; }
  chartInstance = new Chart(ctx, {
    type:'bar',
    data:{ labels, datasets:[{ label:'Pemasukan per Sumber (Rp)', data, backgroundColor: backgroundColors, borderRadius:6, barThickness:28 }]},
    options:{ responsive:true, maintainAspectRatio:false, scales:{ y:{ ticks:{ callback:function(v){ return v.toLocaleString('id-ID'); } } } }, plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:function(c){ const v=c.raw||0; return 'Rp'+Number(v).toLocaleString('id-ID'); } } } } }
  });
}

// Undo widget
function updateUndoWidget(){
  const widget = qs('#undoWidget');
  const countEl = qs('#undoCount');
  if(!widget || !countEl) return;
  const n = lastDeletedStack.length;
  if(n === 0){ widget.hidden = true; return; }
  countEl.textContent = String(n);
  widget.hidden = false;
}

function undoAllPending(){
  if(lastDeletedStack.length === 0){ showToast('Tidak ada penghapusan untuk di-undo', 'info'); return; }
  // sort by original index ascending to insert correctly
  const items = lastDeletedStack.slice().sort((a,b)=> a.index - b.index);
  items.forEach(it => { if(it.timeoutId) clearTimeout(it.timeoutId); });
  items.forEach(it => {
    const insertIndex = Math.min(it.index, txs.length);
    txs.splice(insertIndex, 0, it.tx);
  });
  save();
  lastDeletedStack = [];
  updateUndoWidget();
  showToast('Semua penghapusan dikembalikan', 'success');
  render();
}

function undoLastPending(){
  if(lastDeletedStack.length === 0){ showToast('Tidak ada penghapusan untuk di-undo', 'info'); return; }
  const item = lastDeletedStack.pop(); // LIFO
  if(item.timeoutId) clearTimeout(item.timeoutId);
  const insertIndex = Math.min(item.index, txs.length);
  txs.splice(insertIndex, 0, item.tx);
  save();
  updateUndoWidget();
  showToast('Transaksi terakhir dikembalikan', 'success');
  render();
}

// render / UI
function render(){
  buildYearOptions();
  updateUndoWidget();
  const filtered = applyFilters(txs);
  const { totalIncome, totalExpense, balance, perSource } = calcTotalsFromArray(filtered);
  qs('#totalBalance').textContent = formatRupiah(balance);
  qs('#totalIncome').textContent = formatRupiah(totalIncome);
  qs('#totalExpense').textContent = formatRupiah(totalExpense);

  let top = {key:null,val:0};
  Object.keys(perSource).forEach(k=>{ if(perSource[k] > top.val){ top = {key:k, val: perSource[k]}; } });
  qs('#topSource').textContent = top.key ? `${SOURCES[top.key]} — ${formatRupiah(top.val)}` : '—';

  const ul = qs('#sourceList'); ul.innerHTML = '';
  Object.keys(perSource).forEach(k => { const li = document.createElement('li'); li.innerHTML = `<span>${SOURCES[k]}</span><strong>${formatRupiah(perSource[k])}</strong>`; ul.appendChild(li); });

  const tbody = qs('#txTable tbody'); tbody.innerHTML = '';
  const sortedAll = txs.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
  sortedAll.forEach((t,i)=> {
    const isInFilter = filtered.some(f => f.id === t.id);
    const tr = document.createElement('tr');
    tr.style.opacity = isInFilter ? '1' : '0.55';
    tr.innerHTML = `<td>${t.date}</td><td class="${t.type==='income'?'tx-type-income':'tx-type-expense'}">${t.type==='income'?'Pemasukan':'Pengeluaran'}</td><td>${t.source? (SOURCES[t.source]||t.source): '-'}</td><td>${t.note||'-'}</td><td style="text-align:right">${formatRupiah(t.amount)}</td><td style="text-align:right"><button class="btn-sm muted" data-id="${t.id}">Hapus</button></td>`;
    tbody.appendChild(tr);
  });

  qsa('button[data-id]').forEach(btn => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      if(!confirm('Hapus transaksi ini?')) return;
      const idx = txs.findIndex(x => x.id === id);
      if(idx === -1) return;
      const removed = txs.splice(idx,1)[0];
      save();
      render();

      // push to stack
      const stackItem = { id: removed.id, tx: removed, index: idx, timeoutId: null };
      lastDeletedStack.push(stackItem);

      // set timeout to finalize
      stackItem.timeoutId = setTimeout(()=> {
        const pos = lastDeletedStack.findIndex(x=>x.id===stackItem.id);
        if(pos !== -1) lastDeletedStack.splice(pos,1);
        updateUndoWidget();
      }, UNDO_DURATION + 300);

      updateUndoWidget();

      // show toast with Undo for this item and progress
      showToast('Transaksi dihapus', 'info', {
        duration: UNDO_DURATION,
        showProgress: true,
        action: {
          label: 'Undo',
          onClick: () => {
            const pos = lastDeletedStack.findIndex(x=>x.id===stackItem.id);
            if(pos === -1){ showToast('Undo tidak tersedia (waktu habis)', 'error'); return; }
            const item = lastDeletedStack[pos];
            if(item.timeoutId) clearTimeout(item.timeoutId);
            const insertIndex = Math.min(item.index, txs.length);
            txs.splice(insertIndex, 0, item.tx);
            save();
            lastDeletedStack.splice(pos,1);
            updateUndoWidget();
            showToast('Transaksi dikembalikan', 'success');
            render();
          }
        }
      });
    };
  });

  try { renderChart(perSource); } catch(err){ console.error('Chart render error:', err); }
}

// add tx
function addTx(tx){
  tx.id = (Date.now().toString(36) + Math.random().toString(36).slice(2,8));
  txs.push(tx); save(); showToast('Transaksi ditambahkan','success'); render();
}

// init
function init(){
  load(); render();
  const form = qs('#txForm');
  form.addEventListener('submit', (ev)=> {
    ev.preventDefault();
    const date = qs('#txDate').value || new Date().toISOString().slice(0,10);
    const type = qs('#txType').value;
    const source = qs('#txSource').value;
    const amount = Number(qs('#txAmount').value || 0);
    const note = qs('#txNote').value.trim();
    if(!amount || amount <=0){ showToast('Masukkan jumlah yang valid (lebih besar dari 0)','error'); return; }
    addTx({ date, type, source: type==='income'?source:'Pengeluaran', amount, note });
    form.reset(); qs('#txDate').value = new Date().toISOString().slice(0,10);
  });

  qs('#clearBtn').addEventListener('click', ()=> {
    if(confirm('Hapus semua transaksi dari browser ini?')) {
      txs = []; save(); showToast('Semua transaksi telah dihapus','info'); render();
    }
  });

  // undo widget
  qs('#undoAllBtn').addEventListener('click', () => undoAllPending());
  qs('#undoLastBtn').addEventListener('click', () => undoLastPending());

  qs('#applyFilter').addEventListener('click', () => {
    const start = qs('#rangeStart').value, end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start,end)){ showToast('Range tidak valid: tanggal akhir lebih awal dari tanggal mulai. Perbaiki range terlebih dahulu.','error'); return; }
    render(); showToast('Filter diterapkan','info');
  });

  qs('#clearFilter').addEventListener('click', () => {
    qs('#filterMonth').value=''; qs('#filterYear').value=''; qs('#rangeStart').value=''; qs('#rangeEnd').value='';
    render(); showToast('Filter direset','info');
  });

  qs('#filterMonth').addEventListener('change', () => { qs('#rangeStart').value=''; qs('#rangeEnd').value=''; render(); showToast('Filter bulan diterapkan','info'); });
  qs('#filterYear').addEventListener('change', () => { qs('#filterMonth').value=''; qs('#rangeStart').value=''; qs('#rangeEnd').value=''; render(); showToast('Filter tahun diterapkan','info'); });

  qs('#rangeStart').addEventListener('change', () => {
    qs('#filterMonth').value=''; qs('#filterYear').value='';
    const start = qs('#rangeStart').value, end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start,end)){ showToast('Range tidak valid: tanggal mulai lebih besar dari tanggal akhir. Silakan perbaiki.','error'); qs('#rangeStart').value=''; }
  });

  qs('#rangeEnd').addEventListener('change', () => {
    qs('#filterMonth').value=''; qs('#filterYear').value='';
    const start = qs('#rangeStart').value, end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start,end)){ showToast('Range tidak valid: tanggal akhir lebih awal dari tanggal mulai. Silakan pilih kembali end.','error'); qs('#rangeEnd').value=''; return; }
    if(start && end) { render(); showToast('Range diterapkan','info'); }
  });

  qs('#txDate').value = new Date().toISOString().slice(0,10);
}

document.addEventListener('DOMContentLoaded', init);
