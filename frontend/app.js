// app.js — YuRa Personal Finance (OFFLINE) — WITH ANCHOR COMMENTS
// Fitur ringkas:
// - Auth check (localStorage token), tema & density
// - Data localStorage (transactions {id,type,category,amount,date,note})
// - CRUD + Edit modal + Undo 20s (undo latest / undo all)
// - Filter tanggal, daftar transaksi compact
// - Dashboard KPI (ikut Periode 7/30/Bulan Ini & Tipe) + Pie + Line
// - Grafik Bar global
// - Export CSV & XLSX (ExcelJS + FileSaver) + Export ringkasan bulanan (2 sheet)
// - Backup/Import JSON

/* =========================
   [BOOT] ChartDataLabels
   ========================= */
(function registerDatalabelsIfAvailable(){
  try {// GANTI SELURUH fungsi exportMonthlyXlsx() dengan ini
async function exportMonthlyXlsx(){
  try{
    if (typeof ExcelJS==='undefined' || typeof saveAs==='undefined'){
      return alert('ExcelJS/FileSaver belum dimuat');
    }

    const mon = exportMonthSel ? exportMonthSel.value : '';
    const yr  = exportYearSel  ? exportYearSel.value  : '';
    if(!mon || !yr) return alert('Pilih bulan & tahun.');

    const bulanID = (m) => ([
      'Januari','Februari','Maret','April','Mei','Juni',
      'Juli','Agustus','September','Oktober','November','Desember'
    ])[Number(m)-1] || m;

    const start   = `${yr}-${mon}-01`;
    const lastDay = new Date(yr, Number(mon), 0).getDate();
    const end     = `${yr}-${mon}-${String(lastDay).padStart(2,'0')}`;

    // --- kumpulkan transaksi bulan terpilih
    const rows = data.transactions.filter(t => t.date >= start && t.date <= end);
    if(rows.length===0) return alert('Tidak ada transaksi pada bulan tersebut.');

    // --- map kategori
    const incMap = {};
    const expMap = {};
    (data.incomeCategories||[]).forEach(c => incMap[c]=0);
    (data.expenseCategories||[]).forEach(c => expMap[c]=0);

    for(const r of rows){
      const cat = r.category || 'Lainnya';
      if(r.type==='income'){
        if(!(cat in incMap)) incMap[cat]=0;
        incMap[cat] += Number(r.amount||0);
      } else {
        if(!(cat in expMap)) expMap[cat]=0;
        expMap[cat] += Number(r.amount||0);
      }
    }
    // pastikan "Lainnya" selalu ada
    if(!('Lainnya' in incMap)) incMap['Lainnya']=0;
    if(!('Lainnya' in expMap)) expMap['Lainnya']=0;

    // urutan seperti contohmu
    const incOrder = [...(data.incomeCategories||[]), 'Lainnya']
      .filter((v,i,a)=>a.indexOf(v)===i);
    const expOrder = [...(data.expenseCategories||[]), 'Lainnya']
      .filter((v,i,a)=>a.indexOf(v)===i);

    const totalInc = Object.values(incMap).reduce((s,v)=>s+v,0);
    const totalExp = Object.values(expMap).reduce((s,v)=>s+v,0);
    const saldo    = totalInc - totalExp;

    // --- workbook & sheet
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tabel Bulanan');

    // style const
    const DARK  = 'FF203864';
    const WHITE = 'FFFFFFFF';
    const ZEBRA = 'FFF3F6F9';
    const NUMFMT = '"Rp"#,##0;[Red]\\-"Rp"#,##0'; // tanpa desimal

    // lebar kolom
    ws.columns = [{key:'A', width:32}, {key:'B', width:22}];

    // TITLE
    ws.mergeCells('A1:B1');
    ws.getCell('A1').value = `Tabel Pemasukan dan Pengeluaran Bulan (${bulanID(mon)} ${yr})`;
    ws.getCell('A1').font  = { bold:true, size:14, color:{argb:DARK} };
    ws.getCell('A1').alignment = { horizontal:'left' };

    ws.addRow([]); // baris kosong

    // ====== TABEL PEMASUKAN ======
    ws.mergeCells('A3:B3');
    ws.getCell('A3').value = 'Tabel Pemasukan';
    ws.getCell('A3').font  = { bold:true, size:12, color:{argb:DARK} };

    // header pemasukan (row 4)
    const hInc = ws.addRow(['Kategori','Jumlah (Rp)']);
    hInc.eachCell(c=>{
      c.font={bold:true,color:{argb:WHITE}};
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:DARK}};
      c.alignment={horizontal:'center'};
      c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
    });

    let rowIdx = ws.actualRowCount;
    incOrder.forEach((cat,i)=>{
      const r = ws.addRow([cat, incMap[cat]||0]);
      const bg = (i%2===0)?ZEBRA:WHITE;
      r.getCell(1).alignment = {horizontal:'left'};
      r.getCell(2).alignment = {horizontal:'right'};
      r.getCell(2).numFmt = NUMFMT;
      r.eachCell(c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
        c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
      });
    });

    // total pemasukan
    const incTot = ws.addRow(['Total', totalInc]);
    incTot.getCell(1).font = {bold:true};
    incTot.getCell(2).font = {bold:true};
    incTot.getCell(2).numFmt = NUMFMT;
    incTot.getCell(1).alignment = {horizontal:'left'};
    incTot.getCell(2).alignment = {horizontal:'right'};
    incTot.eachCell(c=> c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}});

    ws.addRow([]); // spasi

    // ====== TABEL PENGELUARAN ======
    const expTitleRow = ws.addRow([]);
    const expTitleIdx = expTitleRow.number;
    ws.mergeCells(`A${expTitleIdx}:B${expTitleIdx}`);
    ws.getCell(`A${expTitleIdx}`).value = 'Tabel Pengeluaran';
    ws.getCell(`A${expTitleIdx}`).font  = { bold:true, size:12, color:{argb:DARK} };

    const hExp = ws.addRow(['Kategori','Jumlah (Rp)']);
    hExp.eachCell(c=>{
      c.font={bold:true,color:{argb:WHITE}};
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:DARK}};
      c.alignment={horizontal:'center'};
      c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
    });

    expOrder.forEach((cat,i)=>{
      const r = ws.addRow([cat, expMap[cat]||0]);
      const bg = (i%2===0)?ZEBRA:WHITE;
      r.getCell(1).alignment = {horizontal:'left'};
      r.getCell(2).alignment = {horizontal:'right'};
      r.getCell(2).numFmt = NUMFMT;
      r.eachCell(c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
        c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
      });
    });

    const expTot = ws.addRow(['Total', totalExp]);
    expTot.getCell(1).font = {bold:true};
    expTot.getCell(2).font = {bold:true};
    expTot.getCell(2).numFmt = NUMFMT;
    expTot.getCell(1).alignment = {horizontal:'left'};
    expTot.getCell(2).alignment = {horizontal:'right'};
    expTot.eachCell(c=> c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}});

    ws.addRow([]); // spasi

    // ====== RINGKASAN BAWAH ======
    const r1 = ws.addRow(['Total Pemasukan (Rp)',  totalInc]);
    const r2 = ws.addRow(['Total Pengeluaran (Rp)',totalExp]);
    const r3 = ws.addRow(['Saldo (Rp)',             saldo]);

    [r1,r2,r3].forEach((r,idx)=>{
      r.getCell(2).numFmt = NUMFMT;
      r.getCell(1).alignment = {horizontal:'left'};
      r.getCell(2).alignment = {horizontal:'right'};
      if(idx===2){ // saldo
        r.getCell(2).font = { bold:true, color: saldo<0 ? {argb:'FFFF0000'} : {argb:'FF000000'} };
      }
    });

    // tulis file
    const buf = await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
      `YuRa-Personal-Finance-Laporan-${yr}-${mon}.xlsx`
    );
    alert('✅ Export Bulanan XLSX berhasil.');
  }catch(err){
    console.error('[exportMonthlyXlsx]', err);
    alert('Export Bulanan XLSX gagal');
  }
}

    if (typeof Chart !== 'undefined' && typeof ChartDataLabels !== 'undefined') {
      try { Chart.register(ChartDataLabels); console.log('[ChartDataLabels] registered (safe)'); }
      catch(err){ console.warn('[ChartDataLabels] register ignored:', err?.message || err); }
    }
  } catch (err) { console.error('[registerDatalabelsIfAvailable] unexpected', err); }
})();

/* =========================
   [AUTH CHECK]
   ========================= */
(function(){
  const p = location.pathname;
  if(!p.endsWith('login.html') && !p.endsWith('/login.html')){
    const token = localStorage.getItem('fm_token');
    if(!token) location.href = 'login.html';
  }
})();

/* =========================
   [CONFIG & STORAGE KEYS]
   ========================= */
const API_BASE = 'https://yura-api.onrender.com'; // ganti dgn URL backend kamu
const STORAGE_KEY = 'yura-data-v2';
const TRASH_KEY   = 'yura-trash-v1';

const defaults = {
  incomeCategories: ['Toko','Ramp','Kebun Sawit','Jaringan wifi'],
  expenseCategories: ['Kebutuhan Pribadi','Gaji Karyawan','Operasional Toko','Operasional Jaringan Wifi','Operasional Kebun Sawit'],
  transactions: [] // {id, type, category, amount, date, note}
};

/* =========================
   [HELPERS]
   ========================= */
const $  = sel => document.querySelector(sel);
const qs = sel => Array.from(document.querySelectorAll(sel));
const uid = ()=>'t'+Date.now()+Math.random().toString(36).slice(2,8);
const formatRp = n => 'Rp ' + Number(n||0).toLocaleString('id-ID');
const formatTanggalID = iso => {
  if(!iso) return '';
  const p = String(iso).split('-'); if(p.length!==3) return iso;
  return `${p[2]}-${p[1]}-${p[0]}`; // dd-mm-yyyy
};

// === Helper tanggal Indonesia dd-mm-yyyy ===
function fmtDateID(d){
  const dt = (d instanceof Date) ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const dd = String(dt.getDate()).padStart(2,'0');
  const mm = String(dt.getMonth()+1).padStart(2,'0');
  const yy = dt.getFullYear();
  return `${dd}-${mm}-${yy}`;
}

function getRangeInfo(range){
  const now = new Date();
  let from;
  if(range === 'month'){ from = new Date(now.getFullYear(), now.getMonth(), 1); }
  else { const days = Number(range)||7; from = new Date(); from.setDate(from.getDate()-(days-1)); }
  return { from, to: now, fromISO: from.toISOString().slice(0,10), toISO: now.toISOString().slice(0,10) };
}
function rangeLabel(range){ return range==='month' ? 'Bulan Ini' : `${Number(range)} Hari Terakhir`; }

function loadData(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){ localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults)); return JSON.parse(JSON.stringify(defaults)); }
  try{ return JSON.parse(raw); }
  catch{ localStorage.removeItem(STORAGE_KEY); localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults)); return JSON.parse(JSON.stringify(defaults)); }
}
function saveData(d){ localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
function loadTrash(){ try{ return JSON.parse(localStorage.getItem(TRASH_KEY))||[]; }catch{ return []; } }
function saveTrash(t){ localStorage.setItem(TRASH_KEY, JSON.stringify(t)); }
function getPdfTypeFilter(){
  const el = document.getElementById('pdf-type-filter');
  const val = (el && el.value) ? el.value : 'both';
  return (val==='income' || val==='expense') ? val : 'both';
}
// Warnai elemen merah jika value negatif
function applyNeg(el, value){
  if (!el) return;
  const n = Number(value);
  el.classList.toggle('neg', n < 0);
}


/* =========================
   [STATE & DOM REFS]
   ========================= */
let data  = loadData();
let trash = loadTrash();

let mainChart=null, dashboardChartPie=null, dashboardChartLine=null;

const incomeCatSel = $('#income-category');
const expenseCatSel = $('#expense-category');
const incomeList = $('#income-list');
const expenseList = $('#expense-list');
const totalIncomeEl = $('#total-income');
const totalExpenseEl = $('#total-expense');
const balanceEl = $('#balance');
const undoLatestBtn = $('#undo-latest');
const undoAllBtn = $('#undo-all');
const undoTimer = $('#undo-timer');
const themeSelect = $('#theme-select');
const userInfo = $('#userInfo');
const logoutBtn = $('#logoutBtn');

const filterFromEl = $('#filter-from');
const filterToEl = $('#filter-to');
const applyFilterBtn = $('#applyFilter');
const resetFilterBtn = $('#resetFilter');

const exportCsvBtn = $('#exportCsv');
const exportMonthCsvBtn = $('#exportMonthCsv');
const exportXlsxBtn = $('#exportXlsx');
const exportMonthXlsxBtn = $('#exportMonthXlsx');
const exportMonthSel = $('#export-month');
const exportYearSel  = $('#export-year');

const incomeNoteEl  = $('#income-note');
const expenseNoteEl = $('#expense-note');

const modal = $('#editModal');
const editIdEl = $('#edit-id');
const editCategoryEl = $('#edit-category');
const editAmountEl = $('#edit-amount');
const editDateEl = $('#edit-date');
const editNoteEl = $('#edit-note');
const saveEditBtn = $('#saveEdit');
const cancelEditBtn = $('#cancelEdit');

const dashboardRangeEl = $('#dashboard-range');
const dashboardTypeEl  = $('#dashboard-type');

const densitySelect = $('#densitySelect');

/* =========================
   [CATEGORIES]
   ========================= */
function populateCategorySelectors(){
  if(!incomeCatSel || !expenseCatSel) return;
  incomeCatSel.innerHTML=''; expenseCatSel.innerHTML='';
  data.incomeCategories.forEach(c=> incomeCatSel.append(new Option(c,c)));
  data.expenseCategories.forEach(c=> expenseCatSel.append(new Option(c,c)));
}
function addCategory(type){
  const name = prompt('Nama kategori baru:'); if(!name) return;
  const arr = type==='income' ? data.incomeCategories : data.expenseCategories;
  if(arr.includes(name)) return alert('Kategori sudah ada');
  arr.push(name); saveData(data); populateCategorySelectors();
}
function removeCategory(type){
  const sel = type==='income'?incomeCatSel:expenseCatSel; if(!sel) return;
  const v=sel.value; if(!v) return alert('Pilih kategori');
  if(!confirm('Hapus kategori '+v+'?')) return;
  if(type==='income') data.incomeCategories=data.incomeCategories.filter(x=>x!==v);
  else data.expenseCategories=data.expenseCategories.filter(x=>x!==v);
  saveData(data); populateCategorySelectors();
}

/* =========================
   [ADD TRANSACTION]
   ANCHOR: === [FORM INPUTS] ambil nilai dari form
   ========================= */
async function addTransaction(type){
  const amountEl=$(`#${type}-amount`);
  const dateEl=$(`#${type}-date`);
  const catSel=$(`#${type}-category`);
  const noteEl = type==='income' ? incomeNoteEl : expenseNoteEl;

  const amount=Number(amountEl?.value||0);
  const date=dateEl?.value||new Date().toISOString().slice(0,10);
  if(!amount) return alert('Masukkan jumlah');

  const localTx={
    id:uid(),
    type,
    category:catSel?.value||'',
    amount,
    date,
    note:(noteEl?.value||'').trim()
  };

  data.transactions.push(localTx); saveData(data);
  if(amountEl) amountEl.value=''; if(dateEl) dateEl.value=''; if(noteEl) noteEl.value='';
  renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions()); renderDashboard();
}

/* =========================
   [DELETE / UNDO 20s]
   ========================= */
function schedulePermanentRemoval(txId){
  return setTimeout(()=>{ let cur=loadTrash(); cur=cur.filter(i=>i.tx.id!==txId); saveTrash(cur); refreshUndoUI(); }, 20000);
}
async function deleteTransaction(txId){
  const tx = data.transactions.find(t=>t.id===txId); if(!tx) return;
  const expireAt = Date.now()+20000; const timerId = schedulePermanentRemoval(txId);
  data.transactions = data.transactions.filter(t=>t.id!==txId); saveData(data);
  trash = loadTrash(); trash.push({tx,expireAt,timerId}); saveTrash(trash);
  renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions()); refreshUndoUI(); renderDashboard();
}
async function restoreTransaction(txId){
  trash = loadTrash(); const item = trash.find(t=>t.tx.id===txId); if(!item) return;
  try{ clearTimeout(item.timerId); }catch{}
  data.transactions.push(item.tx); saveData(data);
  trash = trash.filter(t=>t.tx.id!==txId); saveTrash(trash);
  renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions()); refreshUndoUI(); renderDashboard();
}
function undoLatest(){ trash=loadTrash(); if(!trash.length) return; trash.sort((a,b)=>b.expireAt-a.expireAt); restoreTransaction(trash[0].tx.id); }
function undoAll(){ trash=loadTrash(); if(!trash.length) return; for(const it of [...trash]){ try{ clearTimeout(it.timerId);}catch{} data.transactions.push(it.tx); } saveData(data); trash=[]; saveTrash(trash); renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions()); refreshUndoUI(); renderDashboard(); }
function recreateTrashTimers(){
  let current=loadTrash(); const now=Date.now(); const next=[];
  for(const item of current){
    const remaining=item.expireAt-now; if(remaining<=0) continue;
    const timerId=setTimeout(()=>{ let tcur=loadTrash(); tcur=tcur.filter(i=>i.tx.id!==item.tx.id); saveTrash(tcur); refreshUndoUI(); }, remaining);
    next.push({tx:item.tx,expireAt:item.expireAt,timerId});
  }
  saveTrash(next); trash=next; refreshUndoUI();
}
function refreshUndoUI(){
  try{
    trash = loadTrash(); if(!undoLatestBtn||!undoAllBtn||!undoTimer) return;
    if(!trash.length){ undoLatestBtn.disabled=true; undoAllBtn.disabled=true; undoTimer.textContent=''; return; }
    undoLatestBtn.disabled=false; undoAllBtn.disabled=false;
    const soon=Math.min(...trash.map(t=>t.expireAt)); const remain=Math.max(0,Math.round((soon-Date.now())/1000));
    undoTimer.textContent = remain>0 ? `Undo tersedia ${remain}s` : '';
  }catch(e){ console.warn('[refreshUndoUI]',e); }
}
setInterval(refreshUndoUI, 800);

/* =========================
   [FILTER + LIST RENDER]
   ANCHOR: === [LIST RENDER] tampilkan transaksi
   ========================= */
function getFilteredTransactions(){
  const from = filterFromEl?.value || '';
  const to   = filterToEl?.value || '';
  let txs = data.transactions.slice();
  if(from) txs = txs.filter(t=>t.date>=from);
  if(to)   txs = txs.filter(t=>t.date<=to);
  txs.sort((a,b)=> b.date.localeCompare(a.date));
  return txs;
}
function renderLists(list){
  const arr = list || getFilteredTransactions();
  if(incomeList) incomeList.innerHTML=''; if(expenseList) expenseList.innerHTML='';
  const incomes = arr.filter(t=>t.type==='income');
  const expenses= arr.filter(t=>t.type==='expense');
  const make = tx => {
    const notePart = tx.note ? ` — <em class="muted">${tx.note.replace(/</g,'&lt;')}</em>` : '';
    const li=document.createElement('li'); li.className='tx-item';
    li.innerHTML = `
      <div><strong>${formatRp(tx.amount)}</strong>
        <div class="tx-meta">${tx.category} • ${formatTanggalID(tx.date)}${notePart}</div>
      </div>
      <div class="actions">
        <button data-id="${tx.id}" class="edit-tx btn small outlined">Edit</button>
        <button data-id="${tx.id}" class="del-tx btn small outlined danger">Hapus</button>
      </div>`;
    return li;
  };
  incomes.forEach(tx=> incomeList?.appendChild(make(tx)));
  expenses.forEach(tx=> expenseList?.appendChild(make(tx)));
}

/* =========================
   [EDIT MODAL]
   ANCHOR: === [EDIT MODAL] open/save fields
   ========================= */
function openEditModal(id){
  if(!modal) return;
  const tx = data.transactions.find(t=>t.id===id); if(!tx) return alert('Transaksi tidak ditemukan');
  editIdEl.value=tx.id; editCategoryEl.value=tx.category; editAmountEl.value=tx.amount; editDateEl.value=tx.date; editNoteEl.value = tx.note||'';
  modal.classList.remove('hidden');
}
function closeEditModal(){ if(!modal) return; modal.classList.add('hidden'); editIdEl.value=''; editCategoryEl.value=''; editAmountEl.value=''; editDateEl.value=''; editNoteEl.value=''; }
function saveEdit(){
  const id=editIdEl.value; const tx=data.transactions.find(t=>t.id===id); if(!tx) return alert('Transaksi tidak ditemukan');
  const newCat=editCategoryEl.value.trim(); const newAmt=Number(editAmountEl.value); const newDate=editDateEl.value; const newNote=(editNoteEl.value||'').trim();
  if(!newCat||!newAmt||!newDate) return alert('Isi semua data');
  tx.category=newCat; tx.amount=newAmt; tx.date=newDate; tx.note=newNote;
  saveData(data);
  renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions()); closeEditModal(); renderDashboard();
}

/* =========================
   [KPI & MAIN BAR CHART]
   ========================= */
function refreshTotals(txs){
  const arr = txs || data.transactions;
  const inc = arr.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const exp = arr.filter(t=>t.type==='expense').reduce((s,t)=>s+t.amount,0);
  totalIncomeEl && (totalIncomeEl.textContent = formatRp(inc));
  totalExpenseEl && (totalExpenseEl.textContent = formatRp(exp));
  balanceEl && (balanceEl.textContent = formatRp(inc-exp));
  const elBal = document.getElementById('kpiBalance');
  if (elBal) {
    elBal.classList.toggle('neg', (inc - exp) < 0);
  }
}

function renderMainChart(){
  const canvas = document.getElementById('combinedChart');
  if (!canvas) return;

  // === NEW: kecilkan tinggi chart (desktop 280px / mobile 220px)
  const desiredH = window.innerWidth <= 768 ? 220 : 280; // <<— di sini
  canvas.style.height = desiredH + 'px';
  canvas.style.maxHeight = desiredH + 'px';
  canvas.style.width = '100%';

  var ctx = canvas.getContext('2d');

  // Periode ikut dashboard (7/30/bulan ini)
  var range = dashboardRangeEl ? dashboardRangeEl.value : 'month';
  var ser = computeWeeklySeries(range); // {labels, inc, exp}

  var labels = ser.labels;
  var incData = ser.inc;
  var expData = ser.exp;

  if (mainChart) mainChart.destroy();
  mainChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Pemasukan',  data: incData },
        { label: 'Pengeluaran', data: expData }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: function(c){ return (c.dataset.label + ': ' + formatRp(c.parsed.y)); } } },
        datalabels: {
          display: function(c){ return Number(c.dataset.data[c.dataIndex]) > 0; },
          formatter: function(v){ return v ? ('Rp ' + Number(v).toLocaleString('id-ID')) : ''; },
          color: '#1f2937',
          anchor: 'end',
          align: 'top',
          offset: 4,
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderColor: 'rgba(0,0,0,0.12)',
          borderWidth: 1,
          borderRadius: 4,
          padding: { top: 2, right: 6, bottom: 2, left: 6 },
          clip: true
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 12 } },
        y: {
          beginAtZero: true,
          ticks: { callback: function(v){ return 'Rp ' + Number(v).toLocaleString('id-ID'); } },
          grid: { color: 'rgba(0,0,0,0.06)' }
        }
      }
      
    }
  });
}

/* =========================
   [EXPORTERS]
   ANCHOR: === [EXPORT CSV] === [EXPORT XLSX] === [EXPORT PDF]
   ========================= */
function formatRupiahCSV(num){ return Number(num||0).toFixed(2); }
function downloadTextFile(filename,text){
  const blob=new Blob(["\uFEFF"+text],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');
  a.href=url; a.download=filename; document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}
function exportCsv(){
  const rows=getFilteredTransactions(); if(!rows.length) return alert('Tidak ada transaksi');
  const head=['Tanggal','Kategori','Jenis','Jumlah (Rp)','Keterangan'];
  const lines=['"YuRa Personal Finance - Daftar Transaksi"','',head.join(',')];
  let ti=0,te=0;
  for(const r of rows){
    const jenis=r.type==='income'?'Pemasukan':'Pengeluaran';
    const tgl=formatTanggalID(r.date);
    const kat=`"${(r.category||'').replace(/"/g,'""')}"`;
    const ket=`"${(r.note||'').replace(/"/g,'""')}"`;
    const amt=Number(r.amount||0); lines.push([tgl,kat,jenis,formatRupiahCSV(amt),ket].join(','));
    if(r.type==='income') ti+=amt; else te+=amt;
  }
  lines.push('','"Grand Total"','','');
  lines.push(['Total Pemasukan (Rp)',formatRupiahCSV(ti)].join(','));
  lines.push(['Total Pengeluaran (Rp)',formatRupiahCSV(te)].join(','));
  lines.push(['Saldo (Pemasukan - Pengeluaran) (Rp)',formatRupiahCSV(ti-te)].join(','));
  downloadTextFile('YuRa-Personal-Finance-Transaksi-'+new Date().toISOString().slice(0,10)+'.csv', lines.join('\n'));
  alert('✅ Export CSV berhasil!');
}
async function exportXlsx(){
  try{
    if(typeof ExcelJS==='undefined'||typeof saveAs==='undefined') return alert('ExcelJS/FileSaver belum dimuat');
    const rows=getFilteredTransactions(); if(!rows.length) return alert('Tidak ada transaksi');
    const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Transaksi');
    ws.columns=[
      {header:'Tanggal',key:'Tanggal',width:15},
      {header:'Kategori',key:'Kategori',width:30},
      {header:'Jenis',key:'Jenis',width:18},
      {header:'Jumlah (Rp)',key:'Jumlah',width:20},
      {header:'Keterangan',key:'Keterangan',width:40}
    ];
    ws.views=[{state:'frozen',ySplit:1}];
    ws.getRow(1).eachCell(c=>{ c.font={bold:true,color:{argb:'FFFFFFFF'}}; c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF203864'}}; c.alignment={horizontal:'center'}; c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}; });
    let ti=0,te=0;
    rows.forEach((r,i)=>{
      const row=ws.addRow([formatTanggalID(r.date),r.category||'',r.type==='income'?'Pemasukan':'Pengeluaran',Number(r.amount||0),r.note||'']);
      const bg=(i%2===0)?'FFF3F6F9':'FFFFFFFF';
      row.eachCell((c,n)=>{
        c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
        if(n===1) c.alignment={horizontal:'center'};
        else if(n===4) { c.numFmt='"Rp"#,##0.00;[Red]\\-"Rp"#,##0.00'; c.alignment={horizontal:'right'}; }
        else c.alignment={horizontal:'left'};
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
      });
      if(r.type==='income') ti+=Number(r.amount||0); else te+=Number(r.amount||0);
    });
    ws.addRow([]); ws.addRow(['Grand Total']);
    const r1=ws.addRow(['Total Pemasukan (Rp)',ti]); r1.getCell(2).numFmt='"Rp"#,##0.00;[Red]\\-"Rp"#,##0.00';
    const r2=ws.addRow(['Total Pengeluaran (Rp)',te]); r2.getCell(2).numFmt='"Rp"#,##0.00;[Red]\\-"Rp"#,##0.00';
    const r3=ws.addRow(['Saldo (Rp)',ti-te]);          r3.getCell(2).numFmt='"Rp"#,##0.00;[Red]\\-"Rp"#,##0.00';
    const buf=await wb.xlsx.writeBuffer();
    saveAs(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), 'YuRa-Personal-Finance-Transaksi-'+new Date().toISOString().slice(0,10)+'.xlsx');
    alert('✅ Export XLSX sukses');
  }catch(err){ console.error('[exportXlsx]',err); alert('Export gagal'); }
}

async function exportPDF(){
  const hasJspdf = !!(window.jspdf && window.jspdf.jsPDF);
  const hasAutoTable = hasJspdf && !!window.jspdf.jsPDF.API.autoTable;
  if (!hasJspdf || !hasAutoTable){
    alert('Library jsPDF/AutoTable belum termuat. Pastikan urutan script benar.');
    return;
  }
  const jsPDF = window.jspdf.jsPDF;

  // gunakan nama variabel yang unik agar tidak bentrok
  const fromDateStr = (document.getElementById('filter-from')?.value) || '';
  const toDateStr   = (document.getElementById('filter-to')?.value)   || '';

  const tipeSelect = document.getElementById('pdf-type-filter');
  const tipeFilter = (tipeSelect && (tipeSelect.value==='income' || tipeSelect.value==='expense'))
    ? tipeSelect.value : 'both';

  let rows = (typeof getFilteredTransactions === 'function')
    ? getFilteredTransactions()
    : [];

  if (tipeFilter !== 'both') rows = rows.filter(r => r.type === (tipeFilter==='income' ? 'income' : 'expense'));
  if (!rows.length){
    alert('Tidak ada transaksi pada rentang/tipe tersebut.');
    return;
  }

  const fmtRp = (n)=> 'Rp ' + Number(n||0).toLocaleString('id-ID');

  const totalInc = rows.filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount||0),0);
  const totalExp = rows.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount||0),0);
  const saldo    = totalInc - totalExp;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 40;

  doc.setFont('helvetica','bold'); doc.setFontSize(14);
  doc.text('YuRa — Laporan Transaksi (Detail)', marginX, 40);
  doc.setFont('helvetica','normal'); doc.setFontSize(10); 

  const rangeLabel = (fromDateStr || toDateStr)
    ? `${(fromDateStr && fmtDateID(fromDateStr)) || 'awal'} s/d ${(toDateStr && fmtDateID(toDateStr)) || 'akhir'}`
    : 'Semua tanggal';

  doc.text(`Rentang: ${rangeLabel}`, marginX, 58);
  doc.text(`Tgl cetak: ${fmtDateID(new Date())}`, marginX, 72);
  doc.text(`Tipe: ${tipeFilter==='both'?'Semua':(tipeFilter==='income'?'Pemasukan':'Pengeluaran')}`, marginX, 86);

  doc.setFontSize(11);
  doc.text(`Total Pemasukan: ${fmtRp(totalInc)}`, marginX, 106);
  doc.text(`Total Pengeluaran: ${fmtRp(totalExp)}`, marginX+220, 106);
  doc.text(`Saldo: ${fmtRp(saldo)}`, marginX+420, 106);
  // saldo: merah jika negatif (tulis ulang baris saldo saja)
  if (saldo < 0) { doc.setTextColor(185, 28, 28); doc.text(`Saldo: ${fmtRp(saldo)}`, marginX+420, 106); doc.setTextColor(0, 0, 0); }

  const body = rows.map((r, idx) => [
    String(idx+1),
    fmtDateID(r.date),
    (r.type==='income'?'Pemasukan':'Pengeluaran'),
    r.category || '-',
    fmtRp(r.amount||0),
    r.note || ''
  ]);

  doc.autoTable({
    startY: 124,
    head: [['No','Tanggal','Jenis','Kategori','Jumlah (Rp)','Keterangan']],
    body,
    styles: { font:'helvetica', fontSize:10, cellPadding:5, halign:'left' },
    headStyles: { fillColor:[32,56,100], textColor:255, halign:'center' },
    columnStyles: {
      0:{ halign:'center', cellWidth:20 },
      1:{ halign:'center', cellWidth:68 },
      2:{ halign:'center', cellWidth:88 },
      3:{ cellWidth:120 },
      4:{ halign:'right',  cellWidth:90 },
      5:{ cellWidth:'auto' }
    },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
    didDrawPage: (data)=>{
      const y = doc.internal.pageSize.getHeight() - 20;
      doc.setFont('helvetica','normal'); doc.setFontSize(8);
      doc.text('YuRa Personal Finance', marginX, y);
      const pg = `Hal. ${data.pageNumber}`;
      const dim = doc.getTextWidth(pg);
      doc.text(pg, pageW - marginX - dim, y);
    }
  });

  const safe = (s) => String(s || 'ALL').replace(/[^0-9A-Za-z_-]/g,'');
  const fromName = (fromDateStr && fmtDateID(fromDateStr)) || 'ALL';
  const toName   = (toDateStr && fmtDateID(toDateStr)) || 'ALL';
  doc.save(`YuRa_Detail_${safe(fromName)}_${safe(toName)}${tipeFilter!=='both' ? '_'+tipeFilter : ''}.pdf`);
  alert('✅ PDF berhasil diekspor.');
}





/* =========================
   [EXPORT BULANAN RINGKASAN — 2 SHEET]
   ========================= */
function exportMonthlyCsv(){
  const mon = exportMonthSel ? exportMonthSel.value : '';
  const yr  = exportYearSel  ? exportYearSel.value  : '';
  if(!mon || !yr) return alert('Pilih bulan dan tahun untuk export bulanan.');
  const start = `${yr}-${mon}-01`;
  const lastDay = new Date(yr, Number(mon), 0).getDate();
  const end = `${yr}-${mon}-${String(lastDay).padStart(2,'0')}`;
  const rows = data.transactions.filter(t => t.date >= start && t.date <= end);
  if(rows.length===0) return alert('Tidak ada transaksi pada bulan tersebut.');
  const map = {};
  for(const r of rows){
    if(!map[r.date]) map[r.date] = { date: r.date, income:0, expense:0 };
    if(r.type === 'income') map[r.date].income += Number(r.amount||0);
    else map[r.date].expense += Number(r.amount||0);
  }
  const header = ['Tanggal','Pemasukan (Rp)','Pengeluaran (Rp)','Saldo (Rp)'];
  const lines = ['"YuRa Personal Finance - Laporan Bulanan"','', header.join(',')];
  const dates = Object.keys(map).sort();
  for(const d of dates){
    const rec = map[d]; const bal = rec.income - rec.expense;
    lines.push([formatTanggalID(rec.date), rec.income.toFixed(2), rec.expense.toFixed(2), bal.toFixed(2)].join(','));
  }
  const fname = `YuRa-Personal-Finance-Laporan-${mon}-${yr}.csv`;
  downloadTextFile(fname, lines.join('\n'));
  alert('✅ Export Bulanan CSV sukses');
}

// === REPLACE exportMonthlyXlsx WITH THIS VERSION ===
async function exportMonthlyXlsx(){
  try{
    if(typeof ExcelJS==='undefined' || typeof saveAs==='undefined'){
      return alert('ExcelJS/FileSaver belum dimuat');
    }

    const mon = exportMonthSel ? exportMonthSel.value : '';
    const yr  = exportYearSel  ? exportYearSel.value  : '';
    if(!mon || !yr) return alert('Pilih bulan & tahun.');

    const bulanID = (m)=>(
      ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
    )[Number(m)-1] || m;

    const start   = `${yr}-${mon}-01`;
    const lastDay = new Date(yr, Number(mon), 0).getDate();
    const end     = `${yr}-${mon}-${String(lastDay).padStart(2,'0')}`;

    const rows = data.transactions.filter(t => t.date >= start && t.date <= end);
    if(rows.length===0) return alert('Tidak ada transaksi pada bulan tersebut.');

    // ===== Kumpulkan per kategori
    const incMap = {}, expMap = {};
    (data.incomeCategories||[]).forEach(c => incMap[c]=0);
    (data.expenseCategories||[]).forEach(c => expMap[c]=0);

    for(const r of rows){
      const cat = r.category || 'Lainnya';
      const amt = Number(r.amount||0);
      if(r.type==='income'){ if(!(cat in incMap)) incMap[cat]=0; incMap[cat]+=amt; }
      else { if(!(cat in expMap)) expMap[cat]=0; expMap[cat]+=amt; }
    }
    if(!('Lainnya' in incMap)) incMap['Lainnya']=0;
    if(!('Lainnya' in expMap)) expMap['Lainnya']=0;

    const incOrder = [...(data.incomeCategories||[]), 'Lainnya'].filter((v,i,a)=>a.indexOf(v)===i);
    const expOrder = [...(data.expenseCategories||[]), 'Lainnya'].filter((v,i,a)=>a.indexOf(v)===i);

    const totalInc = Object.values(incMap).reduce((s,v)=>s+v,0);
    const totalExp = Object.values(expMap).reduce((s,v)=>s+v,0);

    // ===== Workbook
    const wb = new ExcelJS.Workbook();

    // --- SHEET 1: Ringkasan Bulanan (tetap)
    const ws1 = wb.addWorksheet('Ringkasan Bulanan');
    ws1.columns = [
      {header:'Tanggal', key:'Tanggal', width:15},
      {header:'Pemasukan (Rp)', key:'Pemasukan', width:22},
      {header:'Pengeluaran (Rp)', key:'Pengeluaran', width:22},
      {header:'Saldo (Rp)', key:'Saldo', width:18}
    ];
    ws1.getRow(1).eachCell(c=>{ c.font={bold:true}; c.alignment={horizontal:'center'}; });
    // ringkas harian
    const byDate = {};
    rows.forEach(r=>{
      byDate[r.date] = byDate[r.date] || {i:0,e:0};
      if(r.type==='income') byDate[r.date].i += Number(r.amount||0);
      else byDate[r.date].e += Number(r.amount||0);
    });
    const keys = Object.keys(byDate).sort();
    keys.forEach(k=>{
      const v = byDate[k];
      const row = ws1.addRow([k.split('-').reverse().join('-'), v.i, v.e, v.i-v.e]);
      row.getCell(2).numFmt = '"Rp"#,##0;[Red]\\-"Rp"#,##0';
      row.getCell(3).numFmt = '"Rp"#,##0;[Red]\\-"Rp"#,##0';
      row.getCell(4).numFmt = '"Rp"#,##0;[Red]\\-"Rp"#,##0';
      row.getCell(1).alignment = {horizontal:'center'};
      row.getCell(2).alignment = row.getCell(3).alignment = row.getCell(4).alignment = {horizontal:'right'};
    });

    // --- SHEET 2: Pemasukan & Pengeluaran Kategori (match contoh)
    const ws = wb.addWorksheet('Pemasukan & Pengeluaran Kategori');
    const DARK='FF203864', WHITE='FFFFFFFF', ZEBRA='FFF3F6F9';
    const NUM='"Rp"#,##0;[Red]\\-"Rp"#,##0'; // tanpa desimal

    ws.columns = [{key:'A', width:40}, {key:'B', width:22}];

    // Judul utama
    ws.mergeCells('A1:B1');
    ws.getCell('A1').value = `Tabel Pemasukan dan Pengeluaran Bulan (${bulanID(mon)} ${yr})`;
    ws.getCell('A1').font  = {bold:true, size:14, color:{argb:DARK}};
    ws.getCell('A1').alignment = {horizontal:'left'};

    ws.addRow([]); // baris kosong

    // ==== Blok "Tabel Pemasukan"
    ws.mergeCells('A3:B3');
    ws.getCell('A3').value = 'Tabel Pemasukan';
    ws.getCell('A3').font  = {bold:true, size:12, color:{argb:DARK}};

    const hInc = ws.addRow(['Kategori','Jumlah (Rp)']);
    hInc.eachCell(c=>{
      c.font={bold:true,color:{argb:WHITE}};
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:DARK}};
      c.alignment={horizontal:'center'};
      c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
    });

    incOrder.forEach((cat,i)=>{
      const r = ws.addRow([cat, incMap[cat]||0]);
      const bg = (i%2===0)?ZEBRA:WHITE;
      r.getCell(1).alignment = {horizontal:'left'};
      r.getCell(2).alignment = {horizontal:'right'};
      r.getCell(2).numFmt = NUM;
      r.eachCell(c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
        c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
      });
    });

    // total pemasukan (baris seperti contoh, label "Total" di kolom A, angka tebal di kolom B)
    const incTot = ws.addRow(['Total', totalInc]);
    incTot.getCell(1).font = {bold:true};
    incTot.getCell(2).font = {bold:true};
    incTot.getCell(1).alignment = {horizontal:'left'};
    incTot.getCell(2).alignment = {horizontal:'right'};
    incTot.getCell(2).numFmt = NUM;
    incTot.eachCell(c=> c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}});

    ws.addRow([]); ws.addRow([]); // spasi seperti di contoh

    // ==== Blok "Tabel Pengeluaran"
    const expTitleRow = ws.addRow([]);
    ws.mergeCells(`A${expTitleRow.number}:B${expTitleRow.number}`);
    ws.getCell(`A${expTitleRow.number}`).value = 'Tabel Pengeluaran';
    ws.getCell(`A${expTitleRow.number}`).font  = {bold:true, size:12, color:{argb:DARK}};

    const hExp = ws.addRow(['Kategori','Jumlah (Rp)']);
    hExp.eachCell(c=>{
      c.font={bold:true,color:{argb:WHITE}};
      c.fill={type:'pattern',pattern:'solid',fgColor:{argb:DARK}};
      c.alignment={horizontal:'center'};
      c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
    });

    expOrder.forEach((cat,i)=>{
      const r = ws.addRow([cat, expMap[cat]||0]);
      const bg = (i%2===0)?ZEBRA:WHITE;
      r.getCell(1).alignment = {horizontal:'left'};
      r.getCell(2).alignment = {horizontal:'right'};
      r.getCell(2).numFmt = NUM;
      r.eachCell(c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:bg}};
        c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
      });
    });

    const expTot = ws.addRow(['Total', totalExp]);
    expTot.getCell(1).font = {bold:true};
    expTot.getCell(2).font = {bold:true};
    expTot.getCell(1).alignment = {horizontal:'left'};
    expTot.getCell(2).alignment = {horizontal:'right'};
    expTot.getCell(2).numFmt = NUM;
    expTot.eachCell(c=> c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}});

    // ===== generate file
    const buf = await wb.xlsx.writeBuffer();
    saveAs(
      new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),
      `YuRa-Personal-Finance-Laporan-${mon}-${yr}.xlsx`
    );
    alert('✅ Export Bulanan XLSX siap. Cek sheet "Pemasukan & Pengeluaran Kategori".');

  }catch(err){
    console.error('[exportMonthlyXlsx]', err);
    alert('Export Bulanan XLSX gagal');
  }
}


// ===== Export Bulanan ke PDF (A4 Portrait) =====
async function exportMonthlyPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.API.autoTable) {
    alert('Library jsPDF/AutoTable belum dimuat.'); return;
  }
  const jsPDF = window.jspdf.jsPDF;

  const mon = exportMonthSel ? exportMonthSel.value : '';
  const yr  = exportYearSel  ? exportYearSel.value  : '';
  if (!mon || !yr) return alert('Pilih bulan & tahun dulu.');

  const tipeFilter = getPdfTypeFilter(); // 'both' | 'income' | 'expense'

  const bulanID = (m)=>(
    ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  )[Number(m)-1] || m;

  const start   = `${yr}-${mon}-01`;
  const lastDay = new Date(yr, Number(mon), 0).getDate();
  const end     = `${yr}-${mon}-${String(lastDay).padStart(2,'0')}`;

  // transaksi bulan ini
  let rows = (data.transactions||[]).filter(t => t.date >= start && t.date <= end);
  if (rows.length === 0) return alert('Tidak ada transaksi pada bulan tersebut.');

  // terapkan filter tipe
  if (tipeFilter !== 'both') rows = rows.filter(r => r.type === (tipeFilter==='income'?'income':'expense'));

  // map kategori
  const incMap = {}, expMap = {};
  (data.incomeCategories||[]).forEach(c => incMap[c]=0);
  (data.expenseCategories||[]).forEach(c => expMap[c]=0);

  for (const r of rows) {
    const cat = r.category || 'Lainnya';
    const amt = Number(r.amount||0);
    if (r.type === 'income') { if(!(cat in incMap)) incMap[cat]=0; incMap[cat]+=amt; }
    else { if(!(cat in expMap)) expMap[cat]=0; expMap[cat]+=amt; }
  }
  if(!('Lainnya' in incMap)) incMap['Lainnya']=0;
  if(!('Lainnya' in expMap)) expMap['Lainnya']=0;

  const incOrder = [...(data.incomeCategories||[]), 'Lainnya'].filter((v,i,a)=>a.indexOf(v)===i);
  const expOrder = [...(data.expenseCategories||[]), 'Lainnya'].filter((v,i,a)=>a.indexOf(v)===i);

  const totalInc = Object.values(incMap).reduce((s,v)=>s+v,0);
  const totalExp = Object.values(expMap).reduce((s,v)=>s+v,0);
  const saldo    = totalInc - totalExp;

  const rp = (n)=>'Rp '+Number(n||0).toLocaleString('id-ID');
  const user = JSON.parse(localStorage.getItem('fm_user')||'null');
  const uname = user?.username || 'User';

  const doc = new jsPDF({orientation:'p', unit:'pt', format:'a4'});
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header
  doc.setFont('helvetica','bold'); doc.setFontSize(16);
  doc.text(`Laporan Keuangan ${uname}`, 40, 40);
  doc.setFont('helvetica','normal'); doc.setFontSize(11);
  const tipeLabel = tipeFilter==='income' ? ' (Pemasukan saja)' : (tipeFilter==='expense' ? ' (Pengeluaran saja)' : '');
  doc.text(`Periode: ${bulanID(mon)} ${yr}${tipeLabel}`, 40, 60);

  // Ringkasan
  const y0 = 80;
  const boxW = (pageWidth - 80 - 30) / 3;
  const boxes = [
    { label:'Pemasukan',  value: rp(totalInc) },
    { label:'Pengeluaran',value: rp(totalExp) },
    { label:'Saldo',      value: rp(saldo) }
  ];
  doc.setDrawColor(220); doc.setLineWidth(1);
  boxes.forEach((b, i)=>{
    const x = 40 + i*(boxW+15);
    doc.roundedRect(x, y0, boxW, 52, 6, 6);
    doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.text(b.label, x+12, y0+18);
    doc.setFont('helvetica','bold'); doc.setFontSize(13);
    if (b.label==='Saldo' && (saldo<0)) doc.setTextColor(200,0,0);
    doc.text(b.value, x+12, y0+38);
    doc.setTextColor(0,0,0);
  });

  let cursorY = y0 + 75;

  // Pemasukan (tampilkan jika filter mengizinkan)
  if (tipeFilter !== 'expense') {
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Tabel Pemasukan', 40, cursorY);
    cursorY += 6;

    doc.autoTable({
      startY: cursorY + 6,
      head: [['Kategori', 'Jumlah (Rp)']],
      body: incOrder.map(cat => [cat, rp(incMap[cat]||0)]),
      styles: { font:'helvetica', fontSize:10, cellPadding:6, halign:'left' },
      headStyles: { fillColor:[32,56,100], textColor:255, halign:'center' },
      columnStyles: { 1:{halign:'right'} },
      theme: 'grid',
      margin: { left:40, right:40 }
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY,
      body: [['Total', rp(totalInc)]],
      styles: { font:'helvetica', fontStyle:'bold', fontSize:10, cellPadding:6, halign:'left' },
      columnStyles: { 1:{halign:'right'} },
      theme: 'grid',
      margin: { left:40, right:40 }
    });
    cursorY = doc.lastAutoTable.finalY + 16;
  }

  // Pengeluaran (tampilkan jika filter mengizinkan)
  if (tipeFilter !== 'income') {
    doc.setFont('helvetica','bold'); doc.setFontSize(12);
    doc.text('Tabel Pengeluaran', 40, cursorY);
    cursorY += 6;

    doc.autoTable({
      startY: cursorY + 6,
      head: [['Kategori', 'Jumlah (Rp)']],
      body: expOrder.map(cat => [cat, rp(expMap[cat]||0)]),
      styles: { font:'helvetica', fontSize:10, cellPadding:6, halign:'left' },
      headStyles: { fillColor:[32,56,100], textColor:255, halign:'center' },
      columnStyles: { 1:{halign:'right'} },
      theme: 'grid',
      margin: { left:40, right:40 }
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY,
      body: [['Total', rp(totalExp)], ['Saldo', rp(saldo)]],
      styles: { font:'helvetica', fontStyle:'bold', fontSize:10, cellPadding:6, halign:'left' },
      columnStyles: { 1:{halign:'right'} },
      willDrawCell(data){
        // saldo merah bila negatif
        if(data.row.index===1 && data.column.index===1 && saldo < 0) doc.setTextColor(200,0,0);
      },
      didDrawCell(){ doc.setTextColor(0,0,0); },
      theme: 'grid',
      margin: { left:40, right:40 }
    });
  }

  // footer waktu dibuat
  const madeAt = new Date().toLocaleString('id-ID');
  doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(`Dibuat: ${madeAt}`, 40, doc.internal.pageSize.getHeight()-24);

  doc.save(`YuRa-Laporan-${uname}-${mon}-${yr}${tipeFilter!=='both' ? '-'+tipeFilter : ''}.pdf`);
}


// ===== Export Bulanan (DETAIL) ke PDF =====
async function exportMonthlyDetailPDF(){
  if (!window.jspdf || !window.jspdf.jsPDF || !window.jspdf.jsPDF.API.autoTable) {
    alert('Library jsPDF/AutoTable belum dimuat.'); return;
  }
  const jsPDF = window.jspdf.jsPDF;

  const mon = exportMonthSel ? exportMonthSel.value : '';
  const yr  = exportYearSel  ? exportYearSel.value  : '';
  if (!mon || !yr) return alert('Pilih bulan & tahun.');

  const tipeFilter = getPdfTypeFilter(); // 'both' | 'income' | 'expense'

  const bulanID = (m)=>(
    ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
  )[Number(m)-1] || m;

  const start   = `${yr}-${mon}-01`;
  const lastDay = new Date(yr, Number(mon), 0).getDate();
  const end     = `${yr}-${mon}-${String(lastDay).padStart(2,'0')}`;

  // data
  let rows = (data.transactions||[]).filter(t => t.date >= start && t.date <= end);
  if (tipeFilter !== 'both') rows = rows.filter(r => r.type === (tipeFilter==='income'?'income':'expense'));
  if (rows.length === 0) return alert('Tidak ada transaksi pada bulan/tipe tersebut.');

  const fmtRp = (n)=>'Rp '+Number(n||0).toLocaleString('id-ID');
  const fmtD  = (iso)=>{ const [y,m,d]=String(iso||'').split('-'); return `${d}-${m}-${y}`; };

  // urut tanggal ASC, lalu type
  rows.sort((a,b)=>(a.date===b.date ? (a.type>b.type?1:-1) : (a.date>b.date?1:-1)));

  // ringkasan
  const totalInc = rows.filter(r=>r.type==='income').reduce((s,r)=>s+Number(r.amount||0),0);
  const totalExp = rows.filter(r=>r.type==='expense').reduce((s,r)=>s+Number(r.amount||0),0);
  const saldo    = totalInc - totalExp;

  const user  = JSON.parse(localStorage.getItem('fm_user')||'null');
  const uname = user?.username || 'User';

  const doc = new jsPDF({orientation:'p', unit:'pt', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 40;

  const header = ()=>{
    doc.setFont('helvetica','bold'); doc.setFontSize(16);
    doc.text(`Laporan Keuangan ${uname}`, marginX, 40);
    doc.setFont('helvetica','normal'); doc.setFontSize(11);
    const tipeLabel = tipeFilter==='income' ? ' (Pemasukan saja)' : (tipeFilter==='expense' ? ' (Pengeluaran saja)' : '');
    doc.text(`Periode: ${bulanID(mon)} ${yr}${tipeLabel}`, marginX, 60);
  };
  const footer = ()=>{
    const str = `Hal. ${doc.internal.getNumberOfPages()}`;
    doc.setFont('helvetica','normal'); doc.setFontSize(9);
    doc.text(str, pageW - marginX, pageH - 20, {align:'right'});
  };

  header();

  // kartu ringkasan
  const y0 = 80;
  const boxW = (pageW - marginX*2 - 30) / 3;
  const boxes = [
    { label:'Pemasukan',  value: fmtRp(totalInc) },
    { label:'Pengeluaran',value: fmtRp(totalExp) },
    { label:'Saldo',      value: fmtRp(saldo) }
  ];
  doc.setDrawColor(220); doc.setLineWidth(1);
  boxes.forEach((b,i)=>{
    const x = marginX + i*(boxW+15);
    doc.roundedRect(x, y0, boxW, 52, 6, 6);
    doc.setFont('helvetica','bold'); doc.setFontSize(10);
    doc.text(b.label, x+12, y0+18);
    doc.setFont('helvetica','bold'); doc.setFontSize(13);
    if (b.label==='Saldo' && (saldo<0)) doc.setTextColor(200,0,0);
    doc.text(b.value, x+12, y0+38);
    doc.setTextColor(0,0,0);
  });

  // tabel detail
  let startY = y0 + 80;
  doc.setFont('helvetica','bold'); doc.setFontSize(12);
  doc.text('Daftar Transaksi (Detail Bulanan)', marginX, startY);
  startY += 6;

  const body = rows.map((r,idx)=>[
    String(idx+1),
    fmtD(r.date),
    (r.type==='income'?'Pemasukan':'Pengeluaran'),
    r.category || '-',
    fmtRp(r.amount||0),
    r.note || r.keterangan || ''
  ]);

  doc.autoTable({
    startY: startY + 6,
    head: [['No','Tanggal','Jenis','Kategori','Jumlah (Rp)','Keterangan']],
    body,
    styles: { font:'helvetica', fontSize:10, cellPadding:5, halign:'left' },
    headStyles: { fillColor:[32,56,100], textColor:255, halign:'center' },
    columnStyles: {
      0:{ halign:'center', cellWidth:20 },
      1:{ halign:'center', cellWidth:68 },
      2:{ halign:'center', cellWidth:88 },
      3:{ cellWidth:120 },
      4:{ halign:'right',  cellWidth:90 },
      5:{ cellWidth:'auto' }
    },
    theme: 'grid',
    margin: { left: marginX, right: marginX },
    didDrawPage: (data)=>{ if (data.pageNumber > 1) header(); footer(); }
  });

  // ringkasan akhir
  const yEnd = doc.lastAutoTable.finalY + 14;
  doc.setFont('helvetica','bold'); doc.setFontSize(11);
  doc.text('Ringkasan', marginX, yEnd);
  doc.autoTable({
    startY: yEnd + 6,
    body: [
      ['Total Pemasukan',  fmtRp(totalInc)],
      ['Total Pengeluaran',fmtRp(totalExp)],
      ['Saldo',            fmtRp(saldo)]
    ],
    styles: { font:'helvetica', fontSize:10, cellPadding:5, halign:'left' },
    columnStyles: { 1:{ halign:'right' } },
    willDrawCell: (d)=>{ if (d.row.index===2 && d.column.index===1 && saldo<0){ doc.setTextColor(200,0,0);} },
    didDrawCell: ()=> doc.setTextColor(0,0,0),
    theme: 'grid',
    margin: { left: marginX, right: marginX }
  });

  const fname = `YuRa-Laporan-Detail-${uname}-${mon}-${yr}${tipeFilter!=='both' ? '-'+tipeFilter : ''}.pdf`;
  doc.save(fname);
}



/* =========================
   [DASHBOARD: PIE / LINE / KPI]
   ANCHOR: === [DASHBOARD]
   ========================= */
function computeCategoryTotals(range,typeFilter){
  const {fromISO,toISO}=getRangeInfo(range);
  const txs=data.transactions.filter(t=>t.date>=fromISO && t.date<=toISO);
  const map={};
  for(const t of txs){
    if(typeFilter==='income' && t.type!=='income') continue;
    if(typeFilter==='expense'&& t.type!=='expense') continue;
    const k=t.category||'(Tanpa kategori)'; map[k]=(map[k]||0)+Number(t.amount||0);
  }
  return map;
}
function computeWeeklySeries(range){
  const info=getRangeInfo(range);
  const dayCount = (range==='month')
    ? (Math.floor((new Date(info.toISO) - new Date(info.fromISO))/86400000) + 1)
    : Number(range)||7;

  const labels=[],inc=[],exp=[];
  for(let i=dayCount-1;i>=0;i--){
    const d=new Date(info.to); d.setDate(d.getDate()-i);
    const iso=d.toISOString().slice(0,10);
    labels.push(formatTanggalID(iso));
    const daily=data.transactions.filter(t=>t.date===iso);
    inc.push(daily.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0));
    exp.push(daily.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0));
  }
  return {labels,inc,exp};
}
function computeTopCategories(range,typeFilter,topN=5){
  const map=computeCategoryTotals(range,typeFilter);
  const arr=Object.entries(map).map(([k,v])=>({category:k,amount:v}));
  arr.sort((a,b)=>b.amount-a.amount);
  const total=arr.reduce((s,e)=>s+e.amount,0)||1;
  return { top: arr.slice(0,topN).map(e=>({category:e.category,amount:e.amount,percent:Math.round((e.amount/total)*1000)/10})), total };
}
function renderTopCategories(range,typeFilter){
  const ul=$('#top-categories'); if(!ul) return;
  const {top}=computeTopCategories(range,typeFilter);
  ul.innerHTML = top.length? '' : '<li class="muted">Tidak ada data</li>';
  for(const t of top){
    const li=document.createElement('li');
    li.innerHTML=`<span class="cat">${t.category}</span><span class="pct">${formatRp(t.amount)} • ${t.percent}%</span>`;
    ul.appendChild(li);
  }
}
function renderCategoryPie(range,typeFilter){
  const map=computeCategoryTotals(range,typeFilter);
  const labels=Object.keys(map); const values=labels.map(l=>map[l]);
  const ctxEl=document.getElementById('categoryPie'); if(!ctxEl) return;

    // kecilkan tinggi pie chart
  const desiredH = window.innerWidth <= 768 ? 200 : 240;
  ctxEl.style.height = desiredH + 'px';
  ctxEl.style.maxHeight = desiredH + 'px';
  ctxEl.style.width = '100%';

  const ctx=ctxEl.getContext('2d');
  if(labels.length===0){
    if(dashboardChartPie) dashboardChartPie.destroy();
    dashboardChartPie=new Chart(ctx,{type:'doughnut',data:{labels:['No data'],datasets:[{data:[1],backgroundColor:['#eee']} ]},options:{plugins:{legend:{display:false}}}});
    return;
  }
  const palette = labels.map((_,i)=>`hsl(${(i*47)%360} 70% 50%)`);
  if(typeof ChartDataLabels!=='undefined'){ try{ Chart.register(ChartDataLabels);}catch{} }
  if(dashboardChartPie) dashboardChartPie.destroy();
  dashboardChartPie = new Chart(ctx,{
    type:'doughnut',
    data:{ labels, datasets:[{ data:values, backgroundColor:palette }] },
    options:{ responsive:true, plugins:{
      layout: { padding: { top: 4, right: 8, bottom: 4, left: 8  } },
      legend:{ position:'right' },
      datalabels:{ formatter:(v,ctx)=>{ const s=ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0)||1; const pct=(v/s)*100; return pct>=1?pct.toFixed(1)+'%':'';}, color:'#fff', font:{weight:'600',size:10}},
      tooltip:{ callbacks:{ label:(c)=> `${c.label}: ${formatRp(c.raw||0)}`}}
    }},
    plugins: typeof ChartDataLabels!=='undefined' ? [ChartDataLabels] : []
  });
}
function renderWeeklyLine(range, typeFilter){
  const ser = computeWeeklySeries(range);
  const datasets = [];
  if (typeFilter === 'both' || typeFilter === 'income') {
    datasets.push({ label:'Pemasukan', data:ser.inc, tension:0.3, borderColor:'rgba(46,204,113,0.9)', backgroundColor:'rgba(46,204,113,0.6)', fill:false, pointRadius:3, pointHoverRadius:5 });
  }
  if (typeFilter === 'both' || typeFilter === 'expense') {
    datasets.push({ label:'Pengeluaran', data:ser.exp, tension:0.3, borderColor:'rgba(231,76,60,0.9)', backgroundColor:'rgba(231,76,60,0.6)', fill:false, pointRadius:3, pointHoverRadius:5 });
  }
  const el = document.getElementById('weeklyLine'); if (!el) return;

  // kecilkan tinggi line chart
  const desiredH = window.innerWidth <= 768 ? 200 : 240;
  el.style.height = desiredH + 'px';
  el.style.maxHeight = desiredH + 'px';
  el.style.width = '100%';

  const ctx = el.getContext('2d'); if (dashboardChartLine) dashboardChartLine.destroy();
  dashboardChartLine = new Chart(ctx, {
    type: 'line',
    data: { labels: ser.labels, datasets },
    options: {
      layout: { padding: { top: 4, right: 8, bottom: 4, left: 8 } },
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatRp(ctx.parsed.y)}` } },
        datalabels: {
          display: (ctx) => Number(ctx.dataset.data[ctx.dataIndex]) > 0,
          formatter: (v) => v ? `Rp ${Number(v).toLocaleString('id-ID')}` : null,
          color: '#111827',
          anchor: 'end',
          align: 'top',
          offset: 2,
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderColor: 'rgba(0,0,0,0.12)',
          borderWidth: 1,
          borderRadius: 4,
          padding: { top: 1, right: 4, bottom: 1, left: 4 },
          
          clip: true
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
        y: { beginAtZero: true, ticks: { callback: v => 'Rp ' + Number(v).toLocaleString('id-ID') }, grid: { color: 'rgba(0,0,0,0.06)' } }
      }
    }
  });
}
function renderWeeklyTotals(range='7'){
  const {fromISO,toISO}=getRangeInfo(range);
  const periodTx=data.transactions.filter(t=>t.date>=fromISO && t.date<=toISO);
  const income = periodTx.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0);
  const expense= periodTx.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0);
  $('#week-income') && ($('#week-income').textContent = formatRp(income));
  $('#week-expense')&& ($('#week-expense').textContent= formatRp(expense));
  const labelEl = $('#weekly-label'); if(labelEl) labelEl.textContent = (range==='month') ? 'Bulan Ini:' : `${Number(range)} Hari Terakhir:`;
}
function renderDashboard(){
  const range = dashboardRangeEl ? dashboardRangeEl.value : '30';
  const type  = dashboardTypeEl  ? dashboardTypeEl.value  : 'both';
  const {fromISO,toISO}=getRangeInfo(range);
  const periodTx = data.transactions.filter(t=>t.date>=fromISO && t.date<=toISO);
  const totalInc = periodTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
  const totalExp = periodTx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const balance  = totalInc - totalExp;
  const count    = periodTx.length;
  $('#kpi-income-val')  && ($('#kpi-income-val').textContent  = formatRp(totalInc));
  $('#kpi-expense-val') && ($('#kpi-expense-val').textContent = formatRp(totalExp));
  $('#kpi-balance-val') && ($('#kpi-balance-val').textContent = formatRp(balance));
  $('#kpi-count-val')   && ($('#kpi-count-val').textContent   = String(count));
  const label = rangeLabel(range);
  $('#kpi-income-title')  && ($('#kpi-income-title').textContent  = `Pemasukan (${label})`);
  $('#kpi-expense-title') && ($('#kpi-expense-title').textContent = `Pengeluaran (${label})`);
  $('#kpi-balance-title') && ($('#kpi-balance-title').textContent = `Saldo Bersih (${label})`);
  $('#kpi-count-title')   && ($('#kpi-count-title').textContent   = `Jumlah Transaksi (${label})`);
  $('#trend-title')       && ($('#trend-title').textContent       = `Tren ${label}`);
  renderCategoryPie(range, type); renderWeeklyLine(range, type); renderWeeklyTotals(range); renderTopCategories(range, type);
  // sinkronkan Bar "Pemasukan vs Pengeluaran"
  renderMainChart();
}

/* =========================
   [BINDINGS]
   ========================= */
function _kbHandler(e){
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='e'){ e.preventDefault(); downloadBackup(); }
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='i'){ e.preventDefault(); promptImport(); }
}
function bindDashboardControls(){
  function _onDashChanged(){ renderDashboard(); renderMainChart(); }
  dashboardRangeEl && dashboardRangeEl.addEventListener('change', _onDashChanged);
  dashboardTypeEl  && dashboardTypeEl .addEventListener('change', _onDashChanged);
}
function bindControls(){
  const on=(el,ev,fn)=> el && el.addEventListener(ev,fn);
  on($('#add-income'),'click',()=>addTransaction('income'));
  on($('#add-expense'),'click',()=>addTransaction('expense'));
  on($('#add-income-cat'),'click',()=>addCategory('income'));
  on($('#remove-income-cat'),'click',()=>removeCategory('income'));
  on($('#add-expense-cat'),'click',()=>addCategory('expense'));
  on($('#remove-expense-cat'),'click',()=>removeCategory('expense'));

  on(undoLatestBtn,'click',undoLatest); on(undoAllBtn,'click',undoAll);

  if(themeSelect) themeSelect.addEventListener('change', ()=>{ const t=themeSelect.value; document.body.setAttribute('data-theme',t); localStorage.setItem('fm-theme',t); });
  if(logoutBtn) logoutBtn.addEventListener('click', ()=>{ localStorage.removeItem('fm_token'); localStorage.removeItem('fm_user'); location.href='login.html'; });
  if (document.getElementById('exportMonthPdf'))
    document.getElementById('exportMonthPdf').addEventListener('click', exportMonthlyPDF);


  on(applyFilterBtn,'click',()=>{ const f=getFilteredTransactions(); renderLists(f); refreshTotals(f); });
  on(resetFilterBtn,'click',()=>{ if(filterFromEl) filterFromEl.value=''; if(filterToEl) filterToEl.value=''; renderLists(); refreshTotals(); });

  on(exportCsvBtn,'click',exportCsv);
  on(exportMonthCsvBtn,'click',exportMonthlyCsv);
  on(exportXlsxBtn,'click',exportXlsx);
  on(exportMonthXlsxBtn,'click',exportMonthlyXlsx);
  const btnPDF = document.getElementById('btnPDF');
  if (btnPDF) btnPDF.addEventListener('click', exportPDF);
  on(saveEditBtn,'click',saveEdit);
  on(cancelEditBtn,'click',closeEditModal);
  if(modal) modal.addEventListener('click', e=>{ if(e.target===modal) closeEditModal(); });

  const btnPdfDetail = document.getElementById('exportMonthPdfDetail');
  if (btnPdfDetail) btnPdfDetail.addEventListener('click', exportMonthlyDetailPDF);

  document.body.addEventListener('click', e=>{
    const el=e.target; if(!el) return;
    if(el.matches?.('.del-tx'))  deleteTransaction(el.dataset.id);
    if(el.matches?.('.edit-tx')) openEditModal(el.dataset.id);
  });

  // Density
  if (densitySelect) {
    densitySelect.addEventListener('change', () => {
      const v = densitySelect.value; // 'normal' | 'compact' | 'super'
      document.body.setAttribute('data-density', v);
      localStorage.setItem('yura-density', v);
    });
  }

  try{ document.removeEventListener('keydown', _kbHandler); }catch{}
  document.addEventListener('keydown', _kbHandler);

  bindDashboardControls();
}



/* =========================
   [BACKUP / IMPORT / MONTH-YEAR SELECT]
   ========================= */
function downloadBackup(){
  const a=document.createElement('a');
  a.href='data:application/json,'+encodeURIComponent(JSON.stringify({data,trash}));
  a.download='yura-backup-'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
}
function promptImport(){
  const raw=prompt('Paste backup JSON here'); if(!raw) return;
  try{
    const obj=JSON.parse(raw);
    if(obj.data){
      data=obj.data; trash=obj.trash||[]; saveData(data); saveTrash(trash);
      populateCategorySelectors(); renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions());
      renderDashboard(); alert('Import berhasil');
    } else alert('Format tidak cocok');
  }catch{ alert('JSON tidak valid'); }
}
function populateExportMonthYear(){
  if(!exportMonthSel||!exportYearSel) return;
  exportMonthSel.innerHTML=''; exportYearSel.innerHTML='';
  for(let m=1;m<=12;m++){ const mo=String(m).padStart(2,'0'); exportMonthSel.append(new Option(mo,mo)); }
  const yNow=new Date().getFullYear();
  for(let y=yNow;y>=yNow-5;y--) exportYearSel.append(new Option(String(y),String(y)));
  exportMonthSel.value=String(new Date().getMonth()+1).padStart(2,'0'); exportYearSel.value=String(yNow);
}



/* =========================
   [INIT]
   ========================= */
(function ensureUIInit(){
  try{
    // migrate compact legacy -> density
    try {
      const legacy = localStorage.getItem('yura-compact');
      if (legacy) {
        localStorage.removeItem('yura-compact');
        localStorage.setItem('yura-density', legacy === 'on' ? 'compact' : 'normal');
      }
    } catch {}

    const u=JSON.parse(localStorage.getItem('fm_user')||'null'); if(userInfo) userInfo.textContent = u?`Hi, ${u.username}`:'';
    const saved=localStorage.getItem('fm-theme')||'light'; document.body?.setAttribute('data-theme',saved); themeSelect && (themeSelect.value=saved);

    // restore density
    const savedDensity = localStorage.getItem('yura-density') || 'normal';
    document.body.setAttribute('data-density', savedDensity);
    if (densitySelect) densitySelect.value = savedDensity;

    populateCategorySelectors();
    renderLists(); renderMainChart(); refreshTotals(getFilteredTransactions());
    bindControls(); recreateTrashTimers(); populateExportMonthYear(); renderDashboard();

    console.log('[YuRa] UI initialized (offline)');
  }catch(err){ console.error('[ensureUIInit]',err); }
})();
