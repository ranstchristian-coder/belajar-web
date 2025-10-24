// === app.js ===
// Personal Finance Manager + Chart.js integration

const KEY = 'myfinance_tx_v1';

// 4 sumber pemasukan utama (id => label)
const SOURCES = {
  toko_sembako: 'Toko Sembako',
  kebun_sawit: 'Kebun Sawit',
  jual_beli_tbs: 'Jual Beli TBS (Ramp)',
  jaringan_wifi: 'Jaringan Wifi',
  lainnya: 'Lainnya'
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

// calculate totals
function calcTotals(){
  let totalIncome = 0, totalExpense = 0;
  const perSource = {};
  Object.keys(SOURCES).forEach(k => perSource[k] = 0);

  txs.forEach(t=>{
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
  // prepare labels and data (only income sources)
  const labels = Object.keys(SOURCES).map(k => SOURCES[k]);
  const data = Object.keys(SOURCES).map(k => perSource[k] || 0);

  const ctx = document.getElementById('sourceChart');
  if(!ctx) return;

  // destroy existing chart before creating new one to avoid duplication
  if(chartInstance){
    chartInstance.destroy();
    chartInstance = null;
  }

  // create new bar chart
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Pemasukan per Sumber (Rp)',
        data,
        // Chart.js default color palette will be used
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          ticks: {
            callback: function(value){
              // show abbreviated rupiah in ticks (e.g., 100000 -> 100.000)
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

// render UI
function render(){
  const { totalIncome, totalExpense, balance, perSource } = calcTotals();

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

  // transactions table
  const tbody = qs('#txTable tbody');
  tbody.innerHTML = '';
  // sort by date desc
  const sorted = txs.slice().sort((a,b)=> new Date(b.date) - new Date(a.date));
  sorted.forEach((t,i)=>{
    const tr = document.createElement('tr');
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

  // update chart with perSource
  try {
    renderChart(perSource);
  } catch(err){
    // jika Chart.js belum load atau error, abaikan (tapi log di console)
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
    // reset date to today for convenience
    qs('#txDate').value = new Date().toISOString().slice(0,10);
  });

  qs('#clearBtn').addEventListener('click', ()=>{
    if(confirm('Hapus semua transaksi dari browser ini?')) {
      txs = [];
      save();
      render();
    }
  });

  // prefilling date today
  qs('#txDate').value = new Date().toISOString().slice(0,10);
}
document.addEventListener('DOMContentLoaded', init);
    