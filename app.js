/* app.js — kompletní verze (MC výkaz práce) */
'use strict';

/* =========================
   KONSTANTY & STAV APLIKACE
   ========================= */
const STEP = 0.5; // krok přičítání/odčítání hodin
const ASSIGNEE_OPTIONS = ['Viki', 'Standa', 'Marek']; // položky „Grafik“

const state = {
  sb: null,                 // supabase client
  session: null,            // supabase session (kvůli user.id/email)
  weekStart: startOfISOWeek(new Date()),

  clients: [],              // [{id,name}]
  statuses: [],             // [{id,label}]
  jobs: [],                 // [{id,name,client_id,client,status_id,status,assignees:[]}]
  entries: {},              // map[job_id][YYYY-MM-DD] = hours (jen aktuální týden & přihlášený)
  totalsAll: {},            // map[job_id] = součet hodin (ME nebo ALL)

  // filtry
  filterClient: 'ALL',
  filterStatus: 'ALL',
  totalsScope: 'ME',        // 'ME' | 'ALL'
  filterAssignees: [],      // vybrané osoby ve filtru „Grafik“
  newJobAssignees: [],      // pro případné budoucí rozšíření v přidávání zakázky
};

/* --- (volitelná) mapa jmen pro export (email -> zobrazované jméno) --- */
const USER_NAME_BY_EMAIL = {
  'binder.marek@gmail.com': 'Marek',
  'grafika@media-consult.cz': 'Viki',
  'stanislav.hron@icloud.com': 'Standa',
};
function nameFromEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const key = email.toLowerCase().trim();
  return USER_NAME_BY_EMAIL[key] || key.split('@')[0];
}

/* =============
   POMOCNÉ FUNKCE
   ============= */
function startOfISOWeek(d) { const x = new Date(d); const wd = (x.getDay()+6)%7; x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD'); }
function round05(x){ return Math.round(x*2)/2; }
function formatNum(x){ return (x%1===0) ? String(x) : x.toFixed(1); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function showErr(msg){
  console.error(msg);
  const e = document.getElementById('err');
  if(!e) return;
  e.textContent = (msg?.message) || String(msg);
  e.style.display = 'block';
  setTimeout(()=> e.style.display='none', 5200);
}
function getDays(){ return [0,1,2,3,4].map(i => fmtDate(addDays(state.weekStart, i))); }
function setWeekRangeLabel(){
  const el = document.getElementById('weekRange');
  if(!el) return;
  const a = dayjs(state.weekStart).format('D. M. YYYY');
  const b = dayjs(addDays(state.weekStart,4)).format('D. M. YYYY');
  el.textContent = `${a} – ${b}`;
}

/* =============
   START / INIT
   ============= */
async function loadConfig(){
  // Pružné načtení klíčů (nic nemusíš doplňovat – bere, co už máš).
  const fromGlobal =
    (typeof window !== 'undefined' && (window.APP_CONFIG || window.__CONFIG)) || {};
  if (fromGlobal.supabaseUrl && fromGlobal.supabaseAnonKey) return fromGlobal;

  const url = window.SUPABASE_URL || (document.querySelector('meta[name="supabase-url"]')?.content) || '';
  const key = window.SUPABASE_ANON_KEY || (document.querySelector('meta[name="supabase-anon-key"]')?.content) || '';
  return { supabaseUrl: url, supabaseAnonKey: key };
}

async function init(){
  const cfg = await loadConfig();
  state.sb = window.supabase.createClient(
    cfg.supabaseUrl,
    cfg.supabaseAnonKey,
    { auth: { persistSession: true, autoRefreshToken: true } }
  );

  const { data: { session } } = await state.sb.auth.getSession();
  state.session = session;
  state.sb.auth.onAuthStateChange((_e, s)=>{ state.session = s; render(); });
}

/* =====
   DATA
   ===== */
async function ensureProfile(){
  const uid = state.session?.user?.id; if(!uid) return;
  await state.sb.from('app_user').upsert(
    { id: uid, full_name: state.session.user.email, role: 'admin' },
    { onConflict: 'id' }
  );
}

async function loadClients(){
  const { data, error } = await state.sb.from('client').select('id,name').order('name');
  if (error) showErr(error);
  return data || [];
}
async function loadStatuses(){
  const { data, error } = await state.sb.from('job_status').select('id,label').order('id');
  if (error) showErr(error);
  return data || [];
}
async function loadJobs(){
  const { data, error } = await state.sb
    .from('job')
    .select('id,name,status_id,client_id,assignees, client:client_id(id,name), status:status_id(id,label)')
    .order('name');
  if (error){ showErr(error); return []; }

  return (data||[]).map(j => ({
    id: j.id,
    name: j.name,
    client_id: j.client?.id ?? j.client_id,
    client: j.client?.name || '',
    status_id: j.status_id,
    status: j.status?.label || '',
    assignees: j.assignees || []
  }));
}
async function loadEntriesMine(){
  const from = fmtDate(state.weekStart);
  const to   = fmtDate(addDays(state.weekStart, 6));
  const { data, error } = await state.sb
    .from('time_entry')
    .select('job_id,work_date,hours')
    .gte('work_date', from).lte('work_date', to)
    .eq('user_id', state.session.user.id);
  if (error){ showErr(error); return {}; }

  const map = {};
  for (const r of (data||[])) {
    map[r.job_id] ??= {};
    map[r.job_id][r.work_date] = (map[r.job_id][r.work_date] || 0) + Number(r.hours||0);
  }
  return map;
}
async function loadTotalsAll(jobIds){
  if(!jobIds.length) return {};
  if(state.totalsScope === 'ME'){
    const { data, error } = await state.sb.from('time_entry')
      .select('job_id,hours').in('job_id', jobIds).eq('user_id', state.session.user.id);
    if(error){ showErr(error); return {}; }
    const m={}; for(const r of (data||[])){ m[r.job_id]=(m[r.job_id]||0)+Number(r.hours||0); } return m;
  }
  // 1) preferované RPC (pokud existuje)
  const { data:rpc, error:rpcErr } = await state.sb.rpc('fn_job_totals');
  if(!rpcErr && rpc){ const m={}; for(const r of rpc){ m[r.job_id]=Number(r.sum_hours||0); } return m; }
  // 2) fallback dotazem
  const { data, error } = await state.sb.from('time_entry').select('job_id,hours').in('job_id',jobIds);
  if(error){ showErr(error); return {}; }
  const m={}; for(const r of (data||[])){ m[r.job_id]=(m[r.job_id]||0)+Number(r.hours||0); } return m;
}

/* =================
   UI / TABULKA / UX
   ================= */
function colorizeStatus(sel){
  sel.classList.remove('is-nova','is-probiha','is-hotovo');
  const t = (sel.options[sel.selectedIndex]?.text || '').toLowerCase();
  if(t.includes('nov')) sel.classList.add('is-nova');
  else if(t.includes('pro') || t.includes('běh')) sel.classList.add('is-probiha');
  else if(t.includes('hot')) sel.classList.add('is-hotovo');
}
function renderAssigneeLabel(arr){
  if(!arr || !arr.length) return 'nikdo';
  if(arr.length === 1) return arr[0];
  return `${arr[0]} +${arr.length-1}`;
}
function jobPassesAssigneeFilter(job){
  if(!state.filterAssignees.length) return true;
  const set = new Set(job.assignees || []);
  return state.filterAssignees.some(x => set.has(x));
}
function cellValue(jobId, d){ return state.entries[jobId]?.[d] || 0; }

// ——— tabulka
function renderTable(){
  const tbody = document.getElementById('tbody');
  if(!tbody) return;
  tbody.innerHTML = '';

  const days = getDays();

  const visible = state.jobs
    .filter(j => (state.filterClient==='ALL'  || String(j.client_id)===String(state.filterClient)) )
    .filter(j => (state.filterStatus==='ALL' || String(j.status_id)===String(state.filterStatus)) )
    .filter(j => jobPassesAssigneeFilter(j));

  for (const j of visible){
    const tr = document.createElement('tr'); tr.dataset.job = j.id;

    // --- klient
    const tdC = document.createElement('td');
    const csel = document.createElement('select'); csel.className = 'pill-select clientSel';
    csel.innerHTML = state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(j.client_id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    csel.onchange = async (e)=>{ await state.sb.from('job').update({client_id:e.target.value}).eq('id', j.id) };
    tdC.append(csel);
    tr.append(tdC);

    // --- zakázka (název + status + grafik + koš)
    const tdJ = document.createElement('td'); tdJ.className = 'jobCell';

    const name = document.createElement('input'); name.className='pill-input jobNameIn'; name.value=j.name;
    let t=null;
    name.oninput = (e)=>{ clearTimeout(t); t=setTimeout(async()=>{ await state.sb.from('job').update({name:e.target.value}).eq('id', j.id) }, 250); };

    const st = document.createElement('select'); st.className='pill-select statusSel';
    st.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${String(s.id)===String(j.status_id)?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
    colorizeStatus(st);
    st.onchange = async (e)=>{ colorizeStatus(st); await state.sb.from('job').update({status_id:+e.target.value}).eq('id', j.id) };

    const del = document.createElement('button'); del.className='pill-btn jobDelete'; del.textContent='🗑'; del.title='Odstranit';
    del.onclick = ()=> deleteJob(j.id);

    // — inline „Grafik“ (kotvené menu)
    const wrap = document.createElement('div'); wrap.className = 'menuAnchor';
    const assBtn = document.createElement('button'); assBtn.className='pill-btn assigneeIcon'; assBtn.type='button';
    assBtn.textContent = `Grafik: ${renderAssigneeLabel(j.assignees)}`;

    const menu = document.createElement('div'); menu.className='menu'; menu.hidden = true;
    menu.innerHTML = `
      ${ASSIGNEE_OPTIONS.map(a=>`<label><input type="checkbox" value="${a}"> ${a}</label>`).join('')}
      <div class="menuRow"><button type="button" class="pill-btn small closeBtn">Zavřít</button></div>
    `;
    // nastavení zaškrtnutí & ovládání
    setMenuChecked(menu, j.assignees);
    assBtn.onclick = (e)=>{ e.stopPropagation(); toggleMenu(menu); };
    menu.addEventListener('change', async ()=>{
      const sel = collectMenuChecked(menu);
      await state.sb.from('job').update({ assignees: sel }).eq('id', j.id);
      j.assignees = sel.slice();
      assBtn.textContent = `Grafik: ${renderAssigneeLabel(j.assignees)}`;
    });
    menu.querySelector('.closeBtn').onclick = ()=> menu.hidden = true;

    wrap.append(assBtn, menu);

    tdJ.append(name, st, wrap, del);
    tr.append(tdJ);

    // --- dny Po–Pá
    for(let i=0;i<5;i++){
      const d = days[i];
      const td = document.createElement('td'); td.dataset.day=i; td.style.textAlign='center';
      const b = document.createElement('button'); b.className='bubble'; b.textContent='0';
      b.onclick = ()=> bump(j.id, d, +STEP);
      b.oncontextmenu = (e)=>{ e.preventDefault(); bump(j.id, d, -STEP); };
      td.append(b); tr.append(td);
    }

    // --- kumulativní celkem (vpravo) — stejná velikost jako bubliny
    const tdT = document.createElement('td'); tdT.className='totalCell';
    tdT.innerHTML = `<span class="totalVal">${formatNum(state.totalsAll[j.id]||0)}</span>`;
    tr.appendChild(tdT);

    tbody.appendChild(tr);
    updateRow(j.id);
  }

  updateSumRow(visible);
}

// ——— pomocníci pro menu „Grafik“
function toggleMenu(menu){
  document.querySelectorAll('.menu:not([hidden])').forEach(m=> m.hidden=true);
  menu.hidden = false;
}
function setMenuChecked(menu, values){
  const set = new Set(values||[]);
  menu.querySelectorAll('input[type="checkbox"]').forEach(i=> i.checked = set.has(i.value));
}
function collectMenuChecked(menu){
  return [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(i=> i.value);
}
document.addEventListener('click', (e)=>{
  document.querySelectorAll('.menu:not([hidden])').forEach(m=>{
    const anchor = m.parentElement;
    if(!anchor.contains(e.target)) m.hidden = true;
  });
});

// ——— aktualizace řádku a součtového řádku
function updateRow(jobId){
  const days = getDays();
  const tr = document.querySelector(`tr[data-job="${jobId}"]`);
  if(!tr) return;

  days.forEach((d,i)=>{
    const val = cellValue(jobId, d);
    const b = tr.querySelector(`td[data-day="${i}"] .bubble`);
    if(b) b.textContent = formatNum(val);
  });

  const totalCell = tr.querySelector('.totalCell .totalVal');
  if(totalCell) totalCell.textContent = formatNum(state.totalsAll[jobId]||0);

  queueMicrotask(()=> updateSumRow());
}
function updateSumRow(visibleJobs){
  const days = getDays();
  const visible = visibleJobs || state.jobs;
  const sums = days.map(d => visible.reduce((a,j)=> a + cellValue(j.id, d), 0));
  const tds = document.querySelectorAll('#sumRow .sumCell');
  tds.forEach((td,i)=>{
    const h = sums[i] || 0;
    const cls = h<=3 ? 'sumRed' : (h<=6 ? 'sumOrange' : 'sumGreen');
    td.innerHTML = `<span class="sumBubble ${cls}">${formatNum(h)}</span>`;
  });
}

/* ============================
   ULOŽENÍ / ZMĚNA HODIN & SMAZÁNÍ
   ============================ */
async function bump(jobId, dateISO, delta){
  try{
    const curr = cellValue(jobId, dateISO);
    const next = Math.max(0, round05(curr + delta));
    const eff  = round05(next - curr);
    if(eff === 0) return;

    // optimistic UI
    state.entries[jobId] ??= {};
    state.entries[jobId][dateISO] = next;
    updateRow(jobId);

    const ins = { job_id: jobId, work_date: dateISO, hours: eff, user_id: state.session.user.id };
    const { error } = await state.sb.from('time_entry').insert(ins);
    if(error){
      // revert
      state.entries[jobId][dateISO] = curr;
      updateRow(jobId);
      return showErr(error.message);
    }

    await refreshTotals();
    updateRow(jobId);
  }catch(e){ showErr(e); }
}

async function deleteJob(jobId){
  if(!confirm('Opravdu odstranit zakázku?')) return;
  await state.sb.from('job').delete().eq('id', jobId);
  state.jobs = await loadJobs();
  await refreshTotals();
  renderTable();
}

/* ==========
   EXPORT XLSX
   ========== */
async function exportExcel(){
  // bezpečné určení zobrazovaného jména
  function safeDisplayName(rawEmail){
    const email = (rawEmail || '').trim();
    if(!email) return 'Neznámý';

    // 1) tvoje funkce (pokud existuje)
    if (typeof nameFromEmail === 'function') {
      const n = nameFromEmail(email);
      if (n && typeof n === 'string' && n.trim()) return n.trim();
    }
    // 2) mapa
    const maps = [USER_NAME_BY_EMAIL, window.USER_NAME_BY_EMAIL, window.NAME_BY_EMAIL].filter(Boolean);
    const key = email.toLowerCase();
    for(const m of maps){ if(m && m[key]) return m[key]; }
    // 3) fallback
    return email.split('@')[0];
  }

  const daysISO = getDays();
  const daysTxt = daysISO.map(d => dayjs(d).format('D. M. YYYY'));

  // stejné filtry jako v tabulce
  const visible = state.jobs
    .filter(j => (state.filterClient==='ALL'  || String(j.client_id)===String(state.filterClient)) )
    .filter(j => (state.filterStatus==='ALL' || String(j.status_id)===String(state.filterStatus)) )
    .filter(j => jobPassesAssigneeFilter(j));

  // jen zakázky s hodinami v aktuálním týdnu
  const withHours = visible.filter(j => daysISO.some(d => (cellValue(j.id,d)||0) > 0));

  const email = (state.session?.user?.email || '').trim();
  const displayName = safeDisplayName(email);

  const start = dayjs(state.weekStart);
  const end   = dayjs(addDays(state.weekStart, 4));
  const rangeHuman = `${start.format('D. M. YYYY')} – ${end.format('D. M. YYYY')}`;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Výkaz');

  ws.addRow([`Uživatel: ${displayName}`]);
  ws.addRow([`Týden: ${rangeHuman}`]);
  ws.addRow([]);

  const headerRow = ws.addRow(['Klient','Zakázka', ...daysTxt]);
  headerRow.font = { bold:true };

  for(const j of withHours){
    const vals = daysISO.map(d => cellValue(j.id,d) || 0);
    const row = ws.addRow([j.client, j.name, ...vals]);
    for(let i=0;i<vals.length;i++){ row.getCell(3+i).numFmt='0.##'; }
  }

  ws.addRow([]);
  const totals = daysISO.map(d => withHours.reduce((s,j)=> s + (cellValue(j.id,d)||0), 0));
  const sumRow = ws.addRow(['','Součet', ...totals]);
  sumRow.font = { bold: true };
  for(let i=0;i<totals.length;i++){ sumRow.getCell(3+i).numFmt='0.##'; }

  ws.columns = [
    { width:28 },  // klient
    { width:36 },  // zakázka
    ...daysISO.map(()=> ({ width:12 })),
  ];

  const safe = (s)=> (s||'')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^A-Za-z0-9._ -]/g,'')
    .trim() || 'Uzivatel';

  const fileName = `Vykaz_${safe(displayName)}_${start.format('DD-MM-YYYY')}–${end.format('DD-MM-YYYY')}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if (window.saveAs) saveAs(blob, fileName);
  else {
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileName; a.click();
    setTimeout(()=> URL.revokeObjectURL(a.href), 2500);
  }
}

/* ================
   RENDER & HANDLERY
   ================ */
function buildFiltersUI(){
  // klient
  const selC = document.getElementById('filterClient');
  if (selC){
    selC.innerHTML = `<option value="ALL">Všichni klienti</option>` +
      state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    selC.value = state.filterClient;
    selC.onchange = (e)=>{ state.filterClient = e.target.value; renderTable(); };
  }

  // status
  const selS = document.getElementById('filterStatus');
  if (selS){
    selS.innerHTML = `<option value="ALL">Všechny zakázky</option>` +
      state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
    selS.value = state.filterStatus;
    selS.onchange = (e)=>{ state.filterStatus = e.target.value; renderTable(); };
  }

  // součty (ME/ALL) – pokud je ve stránce
  const selT = document.getElementById('totalsScope');
  if (selT){
    selT.value = state.totalsScope;
    selT.onchange = async (e)=>{ state.totalsScope = e.target.value; await refreshTotals(); renderTable(); };
  }

  // filtr „Grafik“ – ukotvené menu (pokud existuje)
  const btn = document.getElementById('assigneeFilterBtn');
  const menu = document.getElementById('assigneeFilterMenu');
  if (btn && menu){
    const label = ()=> btn.textContent = state.filterAssignees.length
      ? `Grafik: ${state.filterAssignees.join(', ')}`
      : 'Grafik: Všichni';

    setMenuChecked(menu, state.filterAssignees);
    label();

    btn.onclick = (e)=>{ e.stopPropagation(); toggleMenu(menu); };
    menu.addEventListener('change', ()=>{
      state.filterAssignees = collectMenuChecked(menu);
      label(); renderTable();
    });
    const btnClear = document.getElementById('assigneeFilterClear');
    const btnClose = document.getElementById('assigneeFilterClose');
    if (btnClear) btnClear.onclick = ()=>{ state.filterAssignees=[]; setMenuChecked(menu,[]); label(); renderTable(); };
    if (btnClose) btnClose.onclick = ()=> menu.hidden = true;
  }
}

function buildAddRowUI(){
  // select klient pro „Přidat zakázku“
  const s = document.getElementById('newJobClient');
  if (s){
    s.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  // select status
  const st = document.getElementById('newJobStatus');
  if (st){
    st.innerHTML = state.statuses.map(x=>`<option value="${x.id}">${escapeHtml(x.label)}</option>`).join('');
  }

  // add klient
  const addClientBtn = document.getElementById('addClientBtn');
  if (addClientBtn){
    addClientBtn.onclick = async ()=>{
      const name = document.getElementById('newClientName').value.trim();
      if(!name) return;
      const { error } = await state.sb.from('client').insert({ name });
      if(error) return showErr(error.message);
      document.getElementById('newClientName').value = '';
      state.clients = await loadClients();
      buildFiltersUI(); buildAddRowUI();
    };
  }

  // add job
  const addJobBtn = document.getElementById('addJobBtn');
  if (addJobBtn){
    addJobBtn.onclick = async ()=>{
      const client_id = document.getElementById('newJobClient')?.value;
      const name = document.getElementById('newJobName')?.value?.trim();
      const status_id = +(document.getElementById('newJobStatus')?.value || 0);
      if(!client_id || !name || !status_id) return;

      const payload = { client_id, name, status_id, assignees: state.newJobAssignees };
      const { error } = await state.sb.from('job').insert(payload);
      if(error) return showErr(error.message);

      document.getElementById('newJobName').value = '';
      state.jobs = await loadJobs();
      await refreshTotals();
      renderTable();
    };
  }
}

function setWeekHandlers(){
  const prev = document.getElementById('prevWeek');
  const next = document.getElementById('nextWeek');
  if(prev) prev.onclick = async ()=>{ state.weekStart = addDays(state.weekStart, -7); await refreshData(); };
  if(next) next.onclick = async ()=>{ state.weekStart = addDays(state.weekStart,  +7); await refreshData(); };
}

async function refreshTotals(){
  const ids = state.jobs.map(j=> j.id);
  state.totalsAll = await loadTotalsAll(ids);
}

async function refreshData(){
  setWeekRangeLabel();
  await ensureProfile();
  [state.clients, state.statuses, state.jobs] = await Promise.all([
    loadClients(), loadStatuses(), loadJobs()
  ]);
  state.entries = await loadEntriesMine();
  await refreshTotals();
  buildFiltersUI();
  buildAddRowUI();
  renderTable();
}

async function render(){
  setWeekRangeLabel();
  buildFiltersUI();
  buildAddRowUI();
  renderTable();
}

/* ==============
   BOOTSTRAPPING
   ============== */
window.addEventListener('DOMContentLoaded', async ()=>{
  await init();
  setWeekHandlers();

  const exportBtn = document.getElementById('exportXlsx');
  if (exportBtn) exportBtn.onclick = exportExcel;

  await refreshData();
});
