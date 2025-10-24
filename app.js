// === app.js ===
// Personal Finance Manager + Chart.js with colored bars + month/year/range filter + toast UX + Undo delete

const KEY = 'myfinance_tx_v1';

// 4 sumber pemasukan utama (id => label)
const SOURCES = {
  toko_sembako: 'Toko Sembako',
  kebun_sawit: 'Kebun Sawit',
  jual_beli_tbs: 'Jual Beli TBS (Ramp)',
  jaringan_wifi: 'Jaringan Wifi',
  lainnya: 'Lainnya'
};

// colors per source (consistent)
const COLORS = {
  toko_sembako: '#FF8A65',   // orange
  kebun_sawit:  '#66BB6A',   // green
  jual_beli_tbs: '#42A5F5',  // blue
  jaringan_wifi:'#AB47BC',   // purple
  lainnya:      '#90A4AE'    // grey
};

let txs = []; // array transaksi
let chartInstance = null; // Chart.js instance

// For undo functionality
let lastDeleted = null; // { tx, index, timeoutId }

const UNDO_DURATION = 6000; // ms — how long undo toast stays (6s)

// helpers
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

// ===== Toast utility (supports action button) =====
function showToast(message, type = 'info', opts = {}) {
  // opts: { duration, action: { label, onClick } }
  const container = qs('#toastContainer');
  if(!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const actionHtml = opts.action ? `<button class="action btn-sm" type="button">${opts.action.label}</button>` : '';
  toast.innerHTML = `
    <div class="dot" style="background:${type==='success'? 'var(--toast-success)' : type==='error' ? 'var(--toast-error)' : 'var(--toast-info)'}"></div>
    <div class="text">${message}</div>
    ${actionHtml}
    <button class="close" aria-label="close">&times;</button>
  `;
  container.appendChild(toast);

  // show with animation
  requestAnimationFrame(() => toast.classList.add('show'));

  // close handler
  const remove = () => {
    toast.classList.remove('show');
    setTimeout(() => {
      try { toast.remove(); } catch(e){}
    }, 220);
  };
  toast.querySelector('.close').onclick = remove;

  // action handler
  if(opts.action){
    const btn = toast.querySelector('.action');
    if(btn){
      btn.onclick = (e) => {
        try {
          opts.action.onClick();
        } catch(err) {
          console.error('Toast action error', err);
        }
        remove();
      };
    }
  }

  const duration = opts.duration ?? 3500;
  if(duration > 0){
    const tid = setTimeout(remove, duration);
    // return tid in case caller wants to clear
    return tid;
  }
  return null;
}

// format currency
const formatRupiah = (n) => {
  const x = Math.abs(Number(n) || 0);
  return 'Rp' + x.toLocaleString('id-ID');
};

// load & save
function load(){
  const raw = localStorage.getItem(KEY);
  txs = raw ? JSON.parse(raw) : [];
}
function save(){
  localStorage.setItem(KEY, JSON.stringify(txs));
}

// ---------- FILTER HELPERS ----------
function parseMonthToDateStart(monthStr){
  if(!monthStr) return null;
  const [y,m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
function parseMonthToDateEnd(monthStr){
  if(!monthStr) return null;
  const [y,m] = monthStr.split('-').map(Number);
  return new Date(y, m, 0);
}
function isRangeValid(start, end){
  if(!start || !end) return true;
  const s = parseMonthToDateStart(start);
  const e = parseMonthToDateEnd(end);
  return s <= e;
}

function applyFilters(allTx){
  const start = qs('#rangeStart').value;
  const end = qs('#rangeEnd').value;
  const month = qs('#filterMonth').value;
  const year = qs('#filterYear').value;

  if(start && end){
    if(!isRangeValid(start, end)){
      showToast('Range tidak valid: tanggal akhir lebih awal dari tanggal mulai. Perbaiki pilihan range.', 'error', { duration: 4000 });
      qs('#rangeEnd').value = '';
      return allTx.slice();
    }
    const startDate = parseMonthToDateStart(start);
    const endDate = parseMonthToDateEnd(end);
    return allTx.filter(t => {
      const d = new Date(t.date);
      return d >= startDate && d <= endDate;
    });
  }

  if(month){
    return allTx.filter(t => (t.date || '').slice(0,7) === month);
  }

  if(year){
    return allTx.filter(t => (t.date || '').slice(0,4) === year);
  }

  return allTx.slice();
}

function buildYearOptions(){
  const years = new Set();
  txs.forEach(t => {
    if(t.date && t.date.length >= 4) years.add(t.date.slice(0,4));
  });
  const sel = qs('#filterYear');
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Semua Tahun —</option>';
  Array.from(years).sort((a,b)=> b-a).forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.appendChild(opt);
  });
  if(prev && Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
}

// calculate totals from an array of transactions
function calcTotalsFromArray(arr){
  let totalIncome = 0, totalExpense = 0;
  const perSource = {};
  Object.keys(SOURCES).forEach(k => perSource[k] = 0);

  arr.forEach(t=>{
    const amt = Number(t.amount) || 0;
    if(t.type === 'income'){
      totalIncome += amt;
      if(perSource[t.source] !== undefined) perSource[t.source] += amt;
      else perSource['lainnya'] += amt;
    } else {
      totalExpense += amt;
    }
  });

  const balance = totalIncome - totalExpense;
  return { totalIncome, totalExpense, balance, perSource };
}

// Chart
function renderChart(perSource){
  const labels = Object.keys(SOURCES).map(k => SOURCES[k]);
  const data = Object.keys(SOURCES).map(k => perSource[k] || 0);
  const backgroundColors = Object.keys(SOURCES).map(k => COLORS[k] || '#999');

  const ctx = document.getElementById('sourceChart');
  if(!ctx) return;

  if(chartInstance){
    chartInstance.destroy();
    chartInstance = null;
  }

  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pemasukan per Sumber (Rp)',
        data,
        backgroundColor: backgroundColors,
        borderRadius: 6,
        barThickness: 28
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: {
            callback: function(value){
              return value.toLocaleString('id-ID');
            }
          }
        }
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context){
              const v = context.raw || 0;
              return 'Rp' + Number(v).toLocaleString('id-ID');
            }
          }
        }
      }
    }
  });
}

// render UI (applies filter)
function render(){
  buildYearOptions();
  const filtered = applyFilters(txs);
  const { totalIncome, totalExpense, balance, perSource } = calcTotalsFromArray(filtered);

  qs('#totalBalance').textContent = formatRupiah(balance);
  qs('#totalIncome').textContent = formatRupiah(totalIncome);
  qs('#totalExpense').textContent = formatRupiah(totalExpense);

  let top = {key:null,val:0};
  Object.keys(perSource).forEach(k=>{
    if(perSource[k] > top.val){ top = {key:k, val: perSource[k]}; }
  });
  qs('#topSource').textContent = top.key ? `${SOURCES[top.key]} — ${formatRupiah(top.val)}` : '—';

  const ul = qs('#sourceList');
  ul.innerHTML = '';
  Object.keys(perSource).forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${SOURCES[k]}</span><strong>${formatRupiah(perSource[k])}</strong>`;
    ul.appendChild(li);
  });

  const tbody = qs('#txTable tbody');
  tbody.innerHTML = '';
  const sortedAll = txs.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
  sortedAll.forEach((t,i)=>{
    const isInFilter = filtered.some(f => f.id === t.id);
    const tr = document.createElement('tr');
    tr.style.opacity = isInFilter ? '1' : '0.55';
    tr.innerHTML = `
      <td>${t.date}</td>
      <td class="${t.type === 'income' ? 'tx-type-income' : 'tx-type-expense'}">${t.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}</td>
      <td>${t.source ? (SOURCES[t.source]||t.source) : '-'}</td>
      <td>${t.note || '-'}</td>
      <td style="text-align:right">${formatRupiah(t.amount)}</td>
      <td style="text-align:right"><button class="btn-sm muted" data-id="${t.id}">Hapus</button></td>
    `;
    tbody.appendChild(tr);
  });

  qsa('button[data-id]').forEach(btn => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      // confirm deletion
      if(!confirm('Hapus transaksi ini?')) return;

      // perform delete with undo support
      const idx = txs.findIndex(x => x.id === id);
      if(idx === -1) return;

      const removed = txs.splice(idx, 1)[0]; // remove from array
      save();
      render(); // show changes

      // clear any previous pending deletion (finalize it)
      if(lastDeleted && lastDeleted.timeoutId){
        clearTimeout(lastDeleted.timeoutId);
        lastDeleted = null;
      }

      // store lastDeleted with timeout to finalize
      const timeoutId = setTimeout(() => {
        // finalize deletion by clearing lastDeleted (nothing else needed cause already removed)
        lastDeleted = null;
      }, UNDO_DURATION + 300); // slightly longer than toast

      lastDeleted = { tx: removed, index: idx, timeoutId };

      // show toast with Undo action
      showToast('Transaksi dihapus', 'info', {
        duration: UNDO_DURATION,
        action: {
          label: 'Undo',
          onClick: () => {
            // restore transaction at original index (or push if index > length)
            if(!lastDeleted) {
              showToast('Undo gagal: tidak ada transaksi yang bisa dikembalikan', 'error');
              return;
            }
            clearTimeout(lastDeleted.timeoutId);
            const restored = lastDeleted.tx;
            const insertIndex = Math.min(lastDeleted.index, txs.length);
            txs.splice(insertIndex, 0, restored);
            save();
            showToast('Transaksi dikembalikan', 'success');
            lastDeleted = null;
            render();
          }
        }
      });
    };
  });

  try {
    renderChart(perSource);
  } catch(err){
    console.error('Chart render error:', err);
  }
}

// form handling
function addTx(tx){
  tx.id = (Date.now().toString(36) + Math.random().toString(36).slice(2,8));
  txs.push(tx);
  save();
  showToast('Transaksi ditambahkan', 'success');
  render();
}

// init
function init(){
  load();
  render();

  const form = qs('#txForm');
  form.addEventListener('submit', (ev)=>{
    ev.preventDefault();
    const date = qs('#txDate').value || new Date().toISOString().slice(0,10);
    const type = qs('#txType').value;
    const source = qs('#txSource').value;
    const amount = Number(qs('#txAmount').value || 0);
    const note = qs('#txNote').value.trim();

    if(!amount || amount <= 0){
      showToast('Masukkan jumlah yang valid (lebih besar dari 0)', 'error');
      return;
    }

    addTx({ date, type, source: type === 'income' ? source : 'Pengeluaran', amount, note });
    form.reset();
    qs('#txDate').value = new Date().toISOString().slice(0,10);
  });

  qs('#clearBtn').addEventListener('click', ()=>{
    if(confirm('Hapus semua transaksi dari browser ini?')) {
      txs = [];
      save();
      showToast('Semua transaksi telah dihapus', 'info');
      render();
    }
  });

  // filter controls
  qs('#applyFilter').addEventListener('click', () => {
    const start = qs('#rangeStart').value;
    const end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start, end)){
      showToast('Range tidak valid: tanggal akhir lebih awal dari tanggal mulai. Perbaiki range terlebih dahulu.', 'error');
      return;
    }
    render();
    showToast('Filter diterapkan', 'info');
  });

  qs('#clearFilter').addEventListener('click', () => {
    qs('#filterMonth').value = '';
    qs('#filterYear').value = '';
    qs('#rangeStart').value = '';
    qs('#rangeEnd').value = '';
    render();
    showToast('Filter direset', 'info');
  });

  qs('#filterMonth').addEventListener('change', () => {
    qs('#rangeStart').value = '';
    qs('#rangeEnd').value = '';
    render();
    showToast('Filter bulan diterapkan', 'info');
  });

  qs('#filterYear').addEventListener('change', () => {
    qs('#filterMonth').value = '';
    qs('#rangeStart').value = '';
    qs('#rangeEnd').value = '';
    render();
    showToast('Filter tahun diterapkan', 'info');
  });

  qs('#rangeStart').addEventListener('change', () => {
    qs('#filterMonth').value = '';
    qs('#filterYear').value = '';
    const start = qs('#rangeStart').value;
    const end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start, end)){
      showToast('Range tidak valid: tanggal mulai lebih besar dari tanggal akhir. Silakan perbaiki.', 'error');
      qs('#rangeStart').value = '';
    }
  });

  qs('#rangeEnd').addEventListener('change', () => {
    qs('#filterMonth').value = '';
    qs('#filterYear').value = '';
    const start = qs('#rangeStart').value;
    const end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start, end)){
      showToast('Range tidak valid: tanggal akhir lebih awal dari tanggal mulai. Silakan pilih kembali end.', 'error');
      qs('#rangeEnd').value = '';
      return;
    }
    if(start && end) {
      render();
      showToast('Range diterapkan', 'info');
    }
  });

  qs('#txDate').value = new Date().toISOString().slice(0,10);
}
document.addEventListener('DOMContentLoaded', init);
