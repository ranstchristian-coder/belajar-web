// === app.js ===
// Personal Finance Manager + Chart.js with colored bars + month/year/range filter + range validation

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

// helpers
const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

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

// utility: parse "YYYY-MM" into Date for first day of month
function parseMonthToDateStart(monthStr){
  if(!monthStr) return null;
  const [y,m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1);
}
// utility: parse "YYYY-MM" into Date for last day of month
function parseMonthToDateEnd(monthStr){
  if(!monthStr) return null;
  const [y,m] = monthStr.split('-').map(Number);
  // create date day 0 of next month to get last day of this month
  return new Date(y, m, 0);
}

// validate that start <= end (both are "YYYY-MM" strings)
function isRangeValid(start, end){
  if(!start || !end) return true;
  const s = parseMonthToDateStart(start);
  const e = parseMonthToDateEnd(end);
  return s <= e;
}

// returns filtered array according to controls (with validation)
function applyFilters(allTx){
  const start = qs('#rangeStart').value; // YYYY-MM or ''
  const end = qs('#rangeEnd').value;     // YYYY-MM or ''
  const month = qs('#filterMonth').value; // YYYY-MM or ''
  const year = qs('#filterYear').value;   // YYYY or ''

  // If user provided a range, validate it first
  if(start && end){
    if(!isRangeValid(start, end)){
      // invalid range: do not apply and let caller handle (we return all data)
      alert('Range tidak valid: tanggal akhir (end) lebih awal dari tanggal mulai (start). Silakan perbaiki pilihan range.');
      // clear invalid end to prompt user to re-select (optional UX choice)
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

  // single month filter
  if(month){
    return allTx.filter(t => (t.date || '').slice(0,7) === month);
  }

  // year filter
  if(year){
    return allTx.filter(t => (t.date || '').slice(0,4) === year);
  }

  // no filter
  return allTx.slice();
}

// build list of available years from data (for dropdown)
function buildYearOptions(){
  const years = new Set();
  txs.forEach(t => {
    if(t.date && t.date.length >= 4) years.add(t.date.slice(0,4));
  });
  const sel = qs('#filterYear');
  const prev = sel.value; // remember current selection if still available
  sel.innerHTML = '<option value="">— Semua Tahun —</option>';
  Array.from(years).sort((a,b)=> b-a).forEach(y => {
    const opt = document.createElement('option');
    opt.value = y; opt.textContent = y;
    sel.appendChild(opt);
  });
  // restore selection when possible
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

// Chart: create or update
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
  // prepare controls
  buildYearOptions(); // update year dropdown from existing txs
  const filtered = applyFilters(txs);
  const { totalIncome, totalExpense, balance, perSource } = calcTotalsFromArray(filtered);

  qs('#totalBalance').textContent = formatRupiah(balance);
  qs('#totalIncome').textContent = formatRupiah(totalIncome);
  qs('#totalExpense').textContent = formatRupiah(totalExpense);

  // top source
  let top = {key:null,val:0};
  Object.keys(perSource).forEach(k=>{
    if(perSource[k] > top.val){ top = {key:k, val: perSource[k]}; }
  });
  qs('#topSource').textContent = top.key ? `${SOURCES[top.key]} — ${formatRupiah(top.val)}` : '—';

  // source list
  const ul = qs('#sourceList');
  ul.innerHTML = '';
  Object.keys(perSource).forEach(k => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${SOURCES[k]}</span><strong>${formatRupiah(perSource[k])}</strong>`;
    ul.appendChild(li);
  });

  // transactions table (show all txs but highlight filtered ones)
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

  // bind delete buttons
  qsa('button[data-id]').forEach(btn => {
    btn.onclick = (e) => {
      const id = e.target.dataset.id;
      if(confirm('Hapus transaksi ini?')) {
        txs = txs.filter(x => x.id !== id);
        save();
        render();
      }
    };
  });

  // update chart with perSource (filtered)
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

    if(!amount || amount <= 0){ alert('Masukkan jumlah yang valid'); return; }

    addTx({ date, type, source: type === 'income' ? source : 'Pengeluaran', amount, note });
    form.reset();
    qs('#txDate').value = new Date().toISOString().slice(0,10);
  });

  qs('#clearBtn').addEventListener('click', ()=>{
    if(confirm('Hapus semua transaksi dari browser ini?')) {
      txs = [];
      save();
      render();
    }
  });

  // filter controls
  qs('#applyFilter').addEventListener('click', () => {
    // before applying, validate range
    const start = qs('#rangeStart').value;
    const end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start, end)){
      alert('Range tidak valid: tanggal akhir (end) lebih awal dari tanggal mulai (start). Perbaiki range terlebih dahulu.');
      return;
    }
    render();
  });

  qs('#clearFilter').addEventListener('click', () => {
    qs('#filterMonth').value = '';
    qs('#filterYear').value = '';
    qs('#rangeStart').value = '';
    qs('#rangeEnd').value = '';
    render();
  });

  // quick change handlers with validation
  qs('#filterMonth').addEventListener('change', () => {
    qs('#rangeStart').value = '';
    qs('#rangeEnd').value = '';
    render();
  });

  qs('#filterYear').addEventListener('change', () => {
    qs('#filterMonth').value = '';
    qs('#rangeStart').value = '';
    qs('#rangeEnd').value = '';
    render();
  });

  qs('#rangeStart').addEventListener('change', () => {
    qs('#filterMonth').value = '';
    qs('#filterYear').value = '';
    // if end already set, validate immediately
    const start = qs('#rangeStart').value;
    const end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start, end)){
      alert('Range tidak valid: tanggal mulai (start) lebih besar dari tanggal akhir (end). Silakan perbaiki.');
      // clear start to force re-pick
      qs('#rangeStart').value = '';
    }
  });

  qs('#rangeEnd').addEventListener('change', () => {
    qs('#filterMonth').value = '';
    qs('#filterYear').value = '';
    const start = qs('#rangeStart').value;
    const end = qs('#rangeEnd').value;
    if(start && end && !isRangeValid(start, end)){
      alert('Range tidak valid: tanggal akhir (end) lebih awal dari tanggal mulai (start). Silakan pilih kembali end.');
      qs('#rangeEnd').value = '';
      return;
    }
    // auto-apply if both valid
    if(start && end) render();
  });

  // prefilling date today
  qs('#txDate').value = new Date().toISOString().slice(0,10);
}
document.addEventListener('DOMContentLoaded', init);
