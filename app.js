// ==== KONSTANTY / STAV ====
const STEP = 0.5;
const ASSIGNEE_OPTIONS = ['Viki', 'Standa', 'Marek'];

const state = {
  sb: null,
  session: null,
  weekStart: startOfISOWeek(new Date()),
  clients: [],
  statuses: [],
  jobs: [],
  entries: {},        // map[job_id][dateISO] = hours (týden / já)
  totalsAll: {},      // kumulativní součty (ME/ALL)
  filterClient: 'ALL',
  filterStatus: 'ALL',
  totalsScope: 'ME',
  filterAssignees: [],
  newJobAssignees: []
};


// --- Jména do exportu (email -> zobrazované jméno) ---
const USER_NAME_BY_EMAIL = {
  'binder.marek@gmail.com': 'Marek',
  'grafika@media-consult.cz': 'Viki',
  'stanislav.hron@icloud.com': 'Standa',
};

// Vrátí hezké jméno k e-mailu (fallback: část před @)
function nameFromEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const key = email.toLowerCase().trim();
  return USER_NAME_BY_EMAIL[key] || key.split('@')[0];
}

// ==== HELPERY ====
function startOfISOWeek(d){ const x=new Date(d); const wd=(x.getDay()+6)%7; x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD'); }
function round05(x){ return Math.round(x*2)/2; }
function formatNum(x){ return (x%1===0) ? String(x) : x.toFixed(1); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function showErr(msg){ console.error(msg); const e=document.getElementById('err'); e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none',5200); }
function getDays(){ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))); }
function setWeekRangeLabel(){ document.getElementById('weekRange').textContent = `${dayjs(state.weekStart).format('10. 11. 2025')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`.replace(/^10\. 11\. 2025/, dayjs(state.weekStart).format('D. M. YYYY')); } // jen ochrana proti cache

// ==== SUPABASE INIT ====
async function loadConfig(){
  try{ const r=await fetch('./config.json',{cache:'no-store'}); if(r.ok){ const j=await r.json(); if(j.supabaseUrl&&j.supabaseAnonKey) return j; } }catch{}
  const supabaseUrl=localStorage.getItem('vp.supabaseUrl'); const supabaseAnonKey=localStorage.getItem('vp.supabaseAnonKey');
  if(supabaseUrl && supabaseAnonKey) return {supabaseUrl,supabaseAnonKey};
  throw new Error('Chybí konfigurace Supabase (config.json nebo localStorage).');
}
async function init(){
  const cfg=await loadConfig();
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}} = await state.sb.auth.getSession(); state.session=session;
  state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; render(); });
}

// ==== DATA ====
async function ensureProfile(){
  const uid=state.session?.user?.id; if(!uid) return;
  await state.sb.from('app_user').upsert({id:uid, full_name: state.session.user.email, role:'admin'},{onConflict:'id'});
}
async function loadClients(){ const {data,error}=await state.sb.from('client').select('id,name').order('name'); if(error) showErr(error); return data||[]; }
async function loadStatuses(){ const {data,error}=await state.sb.from('job_status').select('id,label').order('id'); if(error) showErr(error); return data||[]; }
async function loadJobs(){
  const {data,error}=await state.sb.from('job')
    .select('id,name,status_id,client_id,assignees, client:client_id(id,name), status:status_id(id,label)')
    .order('name');
  if(error){ showErr(error); return []; }
  return (data||[]).map(j=>({ id:j.id, name:j.name, client_id:j.client?.id||j.client_id, client:j.client?.name||'', status_id:j.status_id, status:j.status?.label||'', assignees:j.assignees||[] }));
}
async function loadEntriesMine(){
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6));
  const {data,error}=await state.sb.from('time_entry')
    .select('job_id,work_date,hours')
    .gte('work_date',from).lte('work_date',to)
    .eq('user_id', state.session.user.id);
  if(error){ showErr(error); return {}; }
  const map={}; for(const r of (data||[])){ map[r.job_id] ??={}; map[r.job_id][r.work_date]=(map[r.job_id][r.work_date]||0)+Number(r.hours||0); }
  return map;
}
async function loadTotalsAll(jobIds){
  if(!jobIds.length) return {};
  if(state.totalsScope==='ME'){
    const {data,error}=await state.sb.from('time_entry').select('job_id,hours').in('job_id',jobIds).eq('user_id',state.session.user.id);
    if(error){ showErr(error); return {}; }
    const m={}; for(const r of (data||[])){ m[r.job_id]=(m[r.job_id]||0)+Number(r.hours||0); } return m;
  }
  const {data:rpc,error:rpcErr}=await state.sb.rpc('fn_job_totals');
  if(!rpcErr && rpc){ const m={}; for(const r of rpc){ m[r.job_id]=Number(r.sum_hours||0); } return m; }
  const {data,error}=await state.sb.from('time_entry').select('job_id,hours').in('job_id',jobIds);
  if(error){ showErr(error); return {}; }
  const m={}; for(const r of (data||[])){ m[r.job_id]=(m[r.job_id]||0)+Number(r.hours||0); } return m;
}

// ==== UI helpery ====
function colorizeStatus(sel){
  sel.classList.remove('is-nova','is-probiha','is-hotovo');
  const t=(sel.options[sel.selectedIndex]?.text||'').toLowerCase();
  if(t.includes('nov')) sel.classList.add('is-nova');
  else if(t.includes('pro')||t.includes('běh')) sel.classList.add('is-probiha');
  else if(t.includes('hot')) sel.classList.add('is-hotovo');
}
function renderAssigneeLabel(arr){ if(!arr||!arr.length) return 'nikdo'; if(arr.length===1) return arr[0]; return `${arr[0]} +${arr.length-1}`; }
function jobPassesAssigneeFilter(job){ if(!state.filterAssignees.length) return true; const set=new Set(job.assignees||[]); return state.filterAssignees.some(x=>set.has(x)); }
function cellValue(jobId, d){ return state.entries[jobId]?.[d] || 0; }

// ==== TABULKA ====
function renderTable(){
  const tbody=document.getElementById('tbody'); tbody.innerHTML='';
  const days=getDays();

  const visible = state.jobs
    .filter(j=> (state.filterClient==='ALL'||String(j.client_id)===String(state.filterClient)) )
    .filter(j=> (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
    .filter(j=> jobPassesAssigneeFilter(j));

  for(const j of visible){
    const tr=document.createElement('tr'); tr.dataset.job=j.id;

    // klient
    const tdC=document.createElement('td');
    const csel=document.createElement('select'); csel.className='pill-select clientSel';
    csel.innerHTML = state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(j.client_id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    csel.onchange=async(e)=>{ await state.sb.from('job').update({client_id:e.target.value}).eq('id', j.id) };
    tdC.append(csel); tr.append(tdC);

    // zakázka (název + status + grafik + koš)
    const tdJ=document.createElement('td'); tdJ.className='jobCell';

    const name=document.createElement('input'); name.className='pill-input jobNameIn'; name.value=j.name;
    let t=null; name.oninput=(e)=>{ clearTimeout(t); t=setTimeout(async()=>{ await state.sb.from('job').update({name:e.target.value}).eq('id', j.id) }, 250); };

    const st=document.createElement('select'); st.className='pill-select statusSel';
    st.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${String(s.id)===String(j.status_id)?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
    colorizeStatus(st); st.onchange=async(e)=>{ colorizeStatus(st); await state.sb.from('job').update({status_id:+e.target.value}).eq('id', j.id) };

    const del=document.createElement('button'); del.className='pill-btn jobDelete'; del.textContent='🗑'; del.title='Odstranit';

    // inline grafik – jen neutrální tlačítko „Grafik“
    const wrap=document.createElement('div'); wrap.className='menuAnchor';
    const assBtn=document.createElement('button'); assBtn.className='pill-btn assigneeIcon'; assBtn.type='button'; assBtn.textContent='Grafik';
    const menu=document.createElement('div'); menu.className='menu'; menu.hidden=true;
    ASSIGNEE_OPTIONS.forEach(opt=>{
      const L=document.createElement('label'); const I=document.createElement('input'); I.type='checkbox'; I.value=opt; L.append(I, document.createTextNode(' '+opt)); menu.append(L);
    });
    const row=document.createElement('div'); row.className='menuRow';
    const clr=document.createElement('button'); clr.className='pill-btn small'; clr.textContent='Vymazat'; clr.type='button';
    const cls=document.createElement('button'); cls.className='pill-btn small'; cls.textContent='Zavřít'; cls.type='button';
    row.append(clr,cls); menu.append(row);

    assBtn.addEventListener('click', ()=>{ setMenuChecked(menu, j.assignees); toggleMenu(menu); });
    clr.addEventListener('click', async ()=>{ j.assignees=[]; setMenuChecked(menu,[]); await state.sb.from('job').update({assignees:j.assignees}).eq('id', j.id); renderTable(); });
    menu.addEventListener('change', async ()=>{ j.assignees=collectMenuChecked(menu); await state.sb.from('job').update({assignees:j.assignees}).eq('id', j.id); renderTable(); });
    cls.addEventListener('click', ()=> menu.hidden=true);

    wrap.append(assBtn, menu);
    del.onclick=()=>deleteJob(j.id);

    tdJ.append(name, st, wrap, del);
    tr.append(tdJ);

    // dny Po–Pá
    for(let i=0;i<5;i++){
      const d=days[i]; const td=document.createElement('td'); td.dataset.day=i; td.style.textAlign='center';
      const b=document.createElement('button'); b.className='bubble'; b.textContent='0';
      b.onclick=()=>bump(j.id,d,+STEP); b.oncontextmenu=(e)=>{e.preventDefault(); bump(j.id,d,-STEP)};
      td.append(b); tr.append(td);
    }

    // kumulativní celkem – bez podbarvení, střed, stejná velikost
    const tdT=document.createElement('td'); tdT.className='totalCell'; tdT.innerHTML = `<span class="totalVal">${formatNum(state.totalsAll[j.id]||0)}</span>`;
    tr.appendChild(tdT);

    document.getElementById('tbody').appendChild(tr);
    updateRow(j.id);
  }
  updateSumRow(visible);
}

// menu helpery – zavření klikem mimo anchor
function toggleMenu(menu){
  document.querySelectorAll('.menu:not([hidden])').forEach(m=> m.hidden=true);
  menu.hidden = false;
}
function setMenuChecked(menu, values){ const set=new Set(values||[]); menu.querySelectorAll('input[type="checkbox"]').forEach(i=>i.checked=set.has(i.value)); }
function collectMenuChecked(menu){ return [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(i=>i.value); }
document.addEventListener('click',(e)=>{
  document.querySelectorAll('.menu:not([hidden])').forEach(m=>{
    const anchor=m.parentElement;
    if(!anchor.contains(e.target)) m.hidden=true;
  });
});

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return;
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .bubble`); if(b) b.textContent=formatNum(val); });
  const totalCell=tr.querySelector('.totalCell .totalVal'); if(totalCell) totalCell.textContent=formatNum(state.totalsAll[jobId]||0);
  queueMicrotask(()=>updateSumRow());
}
function updateSumRow(visibleJobs){
  const days=getDays(); const visible = visibleJobs || state.jobs;
  const sums = days.map(d => visible.reduce((a,j)=> a + cellValue(j.id, d), 0));
  const tds = document.querySelectorAll('#sumRow .sumCell');
  tds.forEach((td,i)=>{
    const h=sums[i]||0; const cls=h<=3?'sumRed':(h<=6?'sumOrange':'sumGreen');
    td.innerHTML = `<span class="sumBubble ${cls}">${formatNum(h)}</span>`;
  });
}

// změna hodin
async function bump(jobId, dateISO, delta){
  try{
    const curr=cellValue(jobId,dateISO);
    const next=Math.max(0, round05(curr+delta));
    const eff=round05(next-curr); if(eff===0) return;

    state.entries[jobId] ??= {}; state.entries[jobId][dateISO] = next; updateRow(jobId);

    const ins={job_id:jobId,work_date:dateISO,hours:eff,user_id:state.session.user.id};
    const {error}=await state.sb.from('time_entry').insert(ins);
    if(error){ state.entries[jobId][dateISO]=curr; updateRow(jobId); return showErr(error.message); }

    await refreshTotals(); updateRow(jobId);
  }catch(e){ showErr(e); }
}

// mazání zakázky
async function deleteJob(jobId){
  if(!confirm('Opravdu odstranit zakázku?')) return;
  await state.sb.from('job').delete().eq('id', jobId);
  state.jobs=await loadJobs(); await refreshTotals(); renderTable();
}

// Pomocná funkce: najde zobrazované jméno podle e-mailu v existujících mapách.
// Pokud žádná mapa neexistuje nebo e-mail v ní není, vezme se část před '@'.
function resolveDisplayName(email) {
  const candidates = [
    // sem si dosaď jakoukoli tvou existující mapu, pokud máš jiný název
    window.NAME_BY_EMAIL,
    window.EXPORT_NAME_MAP,
    state?.nameMap,
    state?.userNameMap,
  ].filter(Boolean);

  for (const map of candidates) {
    if (map && map[email]) return map[email];
  }
  return email ? email.split('@')[0] : 'Neznámý';
}

// Bezpečně vrátí zobrazované jméno z tvé mapy/funkce (fallback: část před '@')
function resolveDisplayName(email) {
  if (!email || typeof email !== 'string') return 'Neznámý';

  // 1) pokud existuje tvoje funkce, použij ji
  if (typeof nameFromEmail === 'function') {
    const n = nameFromEmail(email);
    if (n && typeof n === 'string' && n.trim()) return n.trim();
  }

  // 2) pokud existuje mapa, zkus ji přímo
  if (typeof USER_NAME_BY_EMAIL === 'object' && USER_NAME_BY_EMAIL) {
    const key = email.toLowerCase().trim();
    if (USER_NAME_BY_EMAIL[key]) return USER_NAME_BY_EMAIL[key];
  }

  // 3) fallback
  return email.split('@')[0];
}

// export do excelu (vynechá řádky bez hodin v týdnu) — bez "Celkem",
// s prázdným řádkem a tučným součtem na konci + jméno v hlavičce i názvu souboru
async function exportExcel() {
  // --- Bezpečné určení zobrazovaného jména ---
  function resolveDisplayName(rawEmail) {
    const email = (rawEmail || '').trim();
    if (!email) return 'Neznámý';

    // 1) zkus tvoji funkci (lokální/globalThis/window – podle bundleru)
    const fnCandidates = [
      (typeof nameFromEmail !== 'undefined' && nameFromEmail) || null,
      (typeof globalThis !== 'undefined' && globalThis.nameFromEmail) || null,
      (typeof window !== 'undefined' && window.nameFromEmail) || null,
    ].filter(f => typeof f === 'function');

    for (const fn of fnCandidates) {
      try {
        const n = fn(email);
        if (n && typeof n === 'string' && n.trim()) return n.trim();
      } catch (_) {}
    }

    // 2) zkus tvoji mapu (lokální/globalThis/window)
    const mapCandidates = [
      (typeof USER_NAME_BY_EMAIL !== 'undefined' && USER_NAME_BY_EMAIL) || null,
      (typeof globalThis !== 'undefined' && globalThis.USER_NAME_BY_EMAIL) || null,
      (typeof window !== 'undefined' && window.USER_NAME_BY_EMAIL) || null,
    ].filter(m => m && typeof m === 'object');

    const key = email.toLowerCase();
    for (const m of mapCandidates) {
      if (m[key]) return m[key];
    }

    // 3) poslední záchrana – interní fallback, aby to VŽDY zobrazilo jméno
    const FALLBACK = {
      'binder.marek@gmail.com': 'Marek',
      'grafika@media-consult.cz': 'Viki',
      'stanislav.hron@icloud.com': 'Standa',
    };
    if (FALLBACK[key]) return FALLBACK[key];

    // 4) úplný fallback: část před @
    return email.split('@')[0];
  }

  const daysISO = getDays(); // 5 pracovních dní
  const daysTxt = daysISO.map(d => dayjs(d).format('D. M. YYYY'));

  // aplikované filtry
  const visible = state.jobs
    .filter(j => (state.filterClient === 'ALL' || String(j.client_id) === String(state.filterClient)))
    .filter(j => (state.filterStatus === 'ALL' || String(j.status_id) === String(state.filterStatus)))
    .filter(j => jobPassesAssigneeFilter(j));

  // jen joby s hodinami v týdnu
  const withHours = visible.filter(j => daysISO.some(d => (cellValue(j.id, d) || 0) > 0));

  // jméno uživatele
  const email = (state.session?.user?.email || '').trim();
  const displayName = resolveDisplayName(email);

  // rozsah týdne
  const start = dayjs(state.weekStart);
  const end = dayjs(addDays(state.weekStart, 4));
  const rangeHuman = `${start.format('D. M. YYYY')} – ${end.format('D. M. YYYY')}`;

  // Excel
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Výkaz');

  // hlavička
  ws.addRow([`Uživatel: ${displayName}`]);
  ws.addRow([`Týden: ${rangeHuman}`]);
  ws.addRow([]);

  // záhlaví bez "Celkem"
  const headerRow = ws.addRow(['Klient', 'Zakázka', ...daysTxt]);
  headerRow.font = { bold: true };

  // data
  for (const j of withHours) {
    const vals = daysISO.map(d => cellValue(j.id, d) || 0);
    const row = ws.addRow([j.client, j.name, ...vals]);
    // číselný formát hodin
    for (let i = 0; i < vals.length; i++) {
      row.getCell(3 + i).numFmt = '0.##';
    }
  }

  // prázdný řádek + součtový řádek (tučně)
  ws.addRow([]);
  const totals = daysISO.map(d => withHours.reduce((sum, j) => sum + (cellValue(j.id, d) || 0), 0));
  const sumRow = ws.addRow(['', 'Součet', ...totals]);
  sumRow.font = { bold: true };
  for (let i = 0; i < totals.length; i++) {
    sumRow.getCell(3 + i).numFmt = '0.##';
  }

  // šířky sloupců
  ws.columns = [
    { width: 28 }, // Klient
    { width: 36 }, // Zakázka
    ...daysISO.map(() => ({ width: 12 })),
  ];

  // název souboru: Vykaz_{Jmeno}_{DD-MM-YYYY}–{DD-MM-YYYY}.xlsx
  const safe = (s) =>
    (s || '')
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9._ -]/g, '')
      .trim() || 'Uzivatel';

  const fileName = `Vykaz_${safe(displayName)}_${start.format('DD-MM-YYYY')}–${end.format('DD-MM-YYYY')}.xlsx`;

  // uložení
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  if (window.saveAs) {
    saveAs(blob, fileName);
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2500);
  }
}


// ==== REFRESH ====
async function refreshTotals(){ const ids=state.jobs.map(j=>j.id); state.totalsAll=await loadTotalsAll(ids); }
async function refreshData(){ state.entries=await loadEntriesMine(); await refreshTotals(); renderTable(); }

// ==== SHELL ====
function setWeekHandlers(){
  document.getElementById('prevWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); setWeekRangeLabel(); refreshData(); };
  document.getElementById('nextWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); setWeekRangeLabel(); refreshData(); };
  document.getElementById('exportXlsx').onclick=exportExcel;
}
function buildShellControls(){
  // filtry klient / status
  const fClient=document.getElementById('filterClient');
  fClient.innerHTML = `<option value="ALL">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  fClient.value=state.filterClient; fClient.onchange=(e)=>{ state.filterClient=e.target.value; renderTable(); };

  const fStat=document.getElementById('filterStatus');
  fStat.innerHTML = `<option value="ALL">Všechny zakázky</option>` + state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  fStat.value=state.filterStatus; fStat.onchange=(e)=>{ state.filterStatus=e.target.value; renderTable(); };

  // scope součtů
  const scope=document.getElementById('totalsScope');
  scope.value=state.totalsScope; scope.onchange=async(e)=>{ state.totalsScope=e.target.value; await refreshTotals(); renderTable(); };

  // filtr „Grafik“
  const fBtn=document.getElementById('assigneeFilterBtn');
  const fMenu=document.getElementById('assigneeFilterMenu');
  const fClear=document.getElementById('assigneeFilterClear');
  const fClose=document.getElementById('assigneeFilterClose');
  fBtn.onclick=()=>{ setMenuChecked(fMenu,state.filterAssignees); toggleMenu(fMenu); };
  fMenu.onchange=()=>{ state.filterAssignees=collectMenuChecked(fMenu); fBtn.textContent = state.filterAssignees.length? `Grafik: ${state.filterAssignees.join(', ')}` : 'Grafik: Všichni'; renderTable(); };
  fClear.onclick=()=>{ state.filterAssignees=[]; fBtn.textContent='Grafik: Všichni'; setMenuChecked(fMenu,[]); renderTable(); };
  fClose.onclick=()=> fMenu.hidden=true;

  // přidávání
  const jobClient=document.getElementById('newJobClient');
  jobClient.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const jobStatus=document.getElementById('newJobStatus');
  jobStatus.innerHTML = state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  colorizeStatus(jobStatus); jobStatus.onchange=()=>colorizeStatus(jobStatus);

  document.getElementById('addClientBtn').onclick=async()=>{
    const name=document.getElementById('newClientName').value.trim(); if(!name) return showErr('Zadej název klienta');
    const {error}=await state.sb.from('client').insert({name}); if(error) return showErr(error.message);
    document.getElementById('newClientName').value=''; state.clients=await loadClients(); buildShellControls();
  };

  // „Grafik“ u nové zakázky
  const aBtn=document.getElementById('assigneesNewBtn');
  const aMenu=document.getElementById('assigneesNewMenu');
  const aClear=document.getElementById('assigneesNewClear');
  const aClose=document.getElementById('assigneesNewClose');
  aBtn.onclick=()=>{ setMenuChecked(aMenu,state.newJobAssignees); toggleMenu(aMenu); };
  aMenu.onchange=()=>{ state.newJobAssignees=collectMenuChecked(aMenu); aBtn.textContent='Grafik: '+(state.newJobAssignees.length? renderAssigneeLabel(state.newJobAssignees): 'nikdo'); };
  aClear.onclick=()=>{ state.newJobAssignees=[]; setMenuChecked(aMenu,[]); aBtn.textContent='Grafik: nikdo'; };
  aClose.onclick=()=> aMenu.hidden=true;

  document.getElementById('addJobBtn').onclick=async()=>{
    const name=document.getElementById('newJobName').value.trim(); if(!name) return showErr('Zadej název zakázky');
    const client_id=document.getElementById('newJobClient').value;
    const status_id=+document.getElementById('newJobStatus').value;
    const assignees=state.newJobAssignees.slice();
    const {error}=await state.sb.from('job').insert({client_id,name,status_id,assignees});
    if(error) return showErr(error.message);
    document.getElementById('newJobName').value=''; state.newJobAssignees=[]; aBtn.textContent='Grafik: nikdo';
    state.jobs=await loadJobs(); await refreshTotals(); renderTable();
  };
}
async function buildShell(){
  setWeekHandlers(); setWeekRangeLabel(); buildShellControls(); renderTable();
}
async function render(){
  const ub=document.getElementById('userBoxTopRight'); ub.innerHTML='';
  if(!state.session){
    const b=document.createElement('button'); b.className='pill-btn'; b.textContent='Přihlásit'; b.onclick=showLogin; ub.append(b);
    return showLogin();
  }else{
    const e=document.createElement('span'); e.className='pill-btn'; e.textContent=state.session.user.email; e.style.background='#ECEEF2';
    const o=document.createElement('button'); o.className='pill-btn'; o.textContent='Odhlásit'; o.onclick=async()=>{ await state.sb.auth.signOut(); };
    ub.append(e,o);
  }
  await ensureProfile();
  state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();
  await buildShell(); await refreshData();
}
function showLogin(){
  const app=document.getElementById('app');
  app.innerHTML = `<div class="card" style="max-width:560px;margin:40px auto;text-align:center">
    <h2>Přihlášení</h2>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
      <input id="email" class="pill-input" type="email" placeholder="name@example.com" style="min-width:260px">
      <button id="send" class="pill-btn accent">Poslat přihlašovací odkaz</button>
    </div>
  </div>`;
  document.getElementById('send').onclick=async()=>{
    const email=document.getElementById('email').value.trim(); if(!email) return showErr('Zadej e-mail');
    const {error}=await state.sb.auth.signInWithOtp({
      email,
      options:{ emailRedirectTo: window.location.origin + window.location.pathname + 'index.html' }
    });
    if(error) return showErr(error.message);
    alert('Zkontroluj si e-mail, poslal jsem odkaz.');
  };
}

// auth.js – Přihlášení e-mail + heslo + reset hesla (overlay, 2 kroky).
// - Používá config.json (supabaseUrl, supabaseAnonKey)
// - UMD supabase-js musí být načtené před tímto souborem
// - Automaticky vytvoří odkaz „Zapomněli jste heslo?“ + reset overlay
// - Recovery flow: po kliknutí z mailu přijdou do URL tokeny (type=recovery),
//   zobrazí se krok „Nové heslo“ a proběhne sb.auth.updateUser({ password })

(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];

  // ---- DOM prvky (login panel přidaný dříve) ----
  const panel   = $('#authPanel');
  const emailEl = $('#authEmail');
  const passEl  = $('#authPassword');
  const btnIn   = $('#authSignIn');
  const btnUp   = $('#authSignUp');
  const msg     = $('#authMsg');

  // ---- Reset overlay – vytvoříme dynamicky (není třeba měnit HTML) ----
  let overlay, ovCard, ovClose, stepRequest, stepNew, reqEmail, reqBtn, reqInfo, reqErr, np1, np2, npBtn, npErr;

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'resetOverlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.background = 'rgba(10,14,20,.45)';
    overlay.style.display = 'none';
    overlay.style.zIndex = '99999';
    overlay.style.backdropFilter = 'blur(1px)';

    ovCard = document.createElement('div');
    ovCard.style.width = 'min(420px, 92vw)';
    ovCard.style.margin = '8vh auto 0';
    ovCard.style.background = '#fff';
    ovCard.style.borderRadius = '14px';
    ovCard.style.boxShadow = '0 18px 48px rgba(0,0,0,.25)';
    ovCard.style.padding = '18px 18px 20px';
    ovCard.style.position = 'relative';

    const title = document.createElement('h3');
    title.textContent = 'Obnovení hesla';
    title.style.margin = '0 0 10px';
    title.style.fontWeight = '800';
    title.style.textAlign = 'center';

    ovClose = document.createElement('button');
    ovClose.type = 'button';
    ovClose.setAttribute('aria-label','Zavřít');
    ovClose.textContent = '✕';
    ovClose.style.position = 'absolute';
    ovClose.style.top = '10px';
    ovClose.style.right = '10px';
    ovClose.style.width = '36px';
    ovClose.style.height = '36px';
    ovClose.style.borderRadius = '10px';
    ovClose.style.border = '1px solid rgba(0,0,0,.08)';
    ovClose.style.background = '#fff';
    ovClose.style.cursor = 'pointer';

    // Krok 1: odeslat reset e-mail
    stepRequest = document.createElement('div');
    stepRequest.innerHTML = `
      <div style="display:grid;gap:10px;margin-top:8px">
        <input id="resetEmail" type="email" placeholder="E-mail"
               style="height:44px;border:1px solid #dfe7f3;border-radius:10px;padding:0 12px;">
        <button id="resetSend" style="height:44px;border-radius:10px;border:0;background:#0b1625;color:#fff;font-weight:700;">
          Poslat odkaz pro obnovení
        </button>
        <p id="resetInfo" style="margin:6px 0 0;color:#0a7d2a;display:none;text-align:center;"></p>
        <p id="resetErr"  style="margin:6px 0 0;color:#c00;display:none;text-align:center;"></p>
      </div>
    `;

    // Krok 2: nastavit nové heslo
    stepNew = document.createElement('div');
    stepNew.style.display = 'none';
    stepNew.innerHTML = `
      <div style="display:grid;gap:10px;margin-top:8px">
        <input id="newPass1" type="password" placeholder="Nové heslo"
               style="height:44px;border:1px solid #dfe7f3;border-radius:10px;padding:0 12px;">
        <input id="newPass2" type="password" placeholder="Zopakovat heslo"
               style="height:44px;border:1px solid #dfe7f3;border-radius:10px;padding:0 12px;">
        <button id="resetConfirm" style="height:44px;border-radius:10px;border:0;background:#0b1625;color:#fff;font-weight:700;">
          Nastavit heslo
        </button>
        <p id="resetNewErr" style="margin:6px 0 0;color:#c00;display:none;text-align:center;"></p>
      </div>
    `;

    ovCard.appendChild(title);
    ovCard.appendChild(ovClose);
    ovCard.appendChild(stepRequest);
    ovCard.appendChild(stepNew);
    overlay.appendChild(ovCard);
    document.body.appendChild(overlay);

    reqEmail = $('#resetEmail', stepRequest);
    reqBtn   = $('#resetSend', stepRequest);
    reqInfo  = $('#resetInfo', stepRequest);
    reqErr   = $('#resetErr', stepRequest);

    np1   = $('#newPass1', stepNew);
    np2   = $('#newPass2', stepNew);
    npBtn = $('#resetConfirm', stepNew);
    npErr = $('#resetNewErr', stepNew);

    ovClose.addEventListener('click', () => closeOverlay());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display === 'block') closeOverlay(); });

    return overlay;
  }

  function openOverlay(step) {
    ensureOverlay();
    overlay.style.display = 'block';
    if (step === 'new') {
      stepRequest.style.display = 'none';
      stepNew.style.display = 'block';
      np1?.focus();
    } else {
      stepRequest.style.display = 'block';
      stepNew.style.display = 'none';
      reqEmail?.focus();
    }
  }

  function closeOverlay() {
    if (!overlay) return;
    overlay.style.display = 'none';
    // vyčistit texty
    if (reqInfo) reqInfo.style.display = 'none';
    if (reqErr)  reqErr.style.display  = 'none';
    if (npErr)   npErr.style.display   = 'none';
  }

  function showAuth(show) { if (panel) panel.style.display = show ? 'block' : 'none'; }
  function setMsg(t, ok = false) {
    if (!msg) return;
    msg.textContent = t || '';
    msg.style.display = t ? 'block' : 'none';
    msg.style.color = ok ? '#0a7d2a' : '#c00';
  }

  // ---- Supabase client z config.json ----
  async function getSb() {
    if (window.__sb) return window.__sb;
    if (!window.supabase) { setMsg('Chybí supabase-js UMD.'); throw new Error('No supabase UMD'); }
    const res = await fetch('config.json');
    if (!res.ok) throw new Error('Nelze načíst config.json');
    const cfg = await res.json();
    window.__sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return window.__sb;
  }

  // ---- Pomocné: parsování hash paramů (pro recovery) ----
  function parseHashParams() {
    const raw = (window.location.hash || '').replace(/^#/, '');
    const p = new URLSearchParams(raw);
    const out = {};
    for (const [k,v] of p.entries()) out[k] = v;
    return out;
  }
  function cleanupUrlHash() {
    // po dokončení flow uklidíme URL, ať nezůstávají tokeny
    history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }

  // ---- Start
  (async () => {
    const sb = await getSb();
    const { data: { session } } = await sb.auth.getSession();

    // Přidat „Zapomněli jste heslo?“ odkaz pod login panel (pokud ještě není)
    if (panel && !$('#authForgot', panel)) {
      const forgot = document.createElement('button');
      forgot.id = 'authForgot';
      forgot.type = 'button';
      forgot.textContent = 'Zapomněli jste heslo?';
      forgot.style.marginTop = '6px';
      forgot.style.background = 'transparent';
      forgot.style.border = '0';
      forgot.style.color = '#0b1625';
      forgot.style.textDecoration = 'underline';
      forgot.style.cursor = 'pointer';

      panel.appendChild(forgot);
      forgot.addEventListener('click', () => openOverlay('request'));
    }

    // Recovery režim z URL? (po kliknutí na odkaz v mailu)
    const hp = parseHashParams();
    const isRecovery = (hp.type === 'recovery') || ('recovery' === new URLSearchParams(window.location.search).get('type'));
    if (isRecovery) {
      try {
        // v některých případech dorazí code=..., jindy access_token/refresh_token v hash
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
          await sb.auth.exchangeCodeForSession(code);
        } else if (hp.access_token && hp.refresh_token) {
          await sb.auth.setSession({ access_token: hp.access_token, refresh_token: hp.refresh_token });
        }
      } catch (e) {
        // když to selže, stejně zkusíme dál – uživatel může být přihlášený
        console.warn('Recovery session set failed:', e);
      }
      // otevři rovnou krok „Nové heslo“
      showAuth(false);
      openOverlay('new');
      // nečistě teď hash, vyčistíme až po dokončení, aby případně zůstala možnost znovu
    } else {
      // běžný režim – když není přihlášen, ukaž login panel
      if (session && session.user) showAuth(false);
      else showAuth(true);
    }

    // ============= LOGIN / SIGNUP =============
    btnIn?.addEventListener('click', async () => {
      setMsg('');
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';
      if (!email || !password) { setMsg('Vyplň e-mail i heslo.'); return; }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setMsg(error.message || 'Přihlášení selhalo.'); return; }
      setMsg('Přihlášeno, načítám…', true);
      location.reload();
    });

    btnUp?.addEventListener('click', async () => {
      setMsg('');
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';
      if (!email || !password) { setMsg('Vyplň e-mail i heslo.'); return; }
      if (password.length < 6) { setMsg('Heslo musí mít aspoň 6 znaků.'); return; }
      const { error } = await sb.auth.signUp({ email, password });
      if (error) { setMsg(error.message || 'Registrace selhala.'); return; }
      setMsg('Účet vytvořen. Zkontroluj e-mail (pokud je vyžadováno potvrzení).', true);
    });

    // ============= RESET: krok 1 – poslat e-mail =============
    ensureOverlay();
    reqBtn?.addEventListener('click', async () => {
      reqInfo.style.display = 'none';
      reqErr.style.display  = 'none';

      const email = (reqEmail?.value || '').trim();
      if (!email) { reqErr.textContent = 'Zadej e-mail.'; reqErr.style.display = 'block'; return; }

      // redirectTo = aktuální stránka (GitHub Pages) – musí být v allowlistu v Supabase
      const redirectTo = window.location.origin + window.location.pathname + '#type=recovery';
      try {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        reqInfo.textContent = 'Odkaz byl odeslán. Zkontroluj schránku.';
        reqInfo.style.display = 'block';
      } catch (e) {
        reqErr.textContent = e.message || 'Odeslání odkazu selhalo.';
        reqErr.style.display = 'block';
      }
    });

    // ============= RESET: krok 2 – nastavit nové heslo =============
    npBtn?.addEventListener('click', async () => {
      npErr.style.display = 'none';
      const p1 = np1?.value || '';
      const p2 = np2?.value || '';
      if (!p1 || !p2) { npErr.textContent = 'Vyplň obě pole.'; npErr.style.display = 'block'; return; }
      if (p1 !== p2)  { npErr.textContent = 'Hesla se neshodují.'; npErr.style.display = 'block'; return; }
      if (p1.length < 6){ npErr.textContent = 'Heslo musí mít aspoň 6 znaků.'; npErr.style.display = 'block'; return; }

      try {
        const { error } = await sb.auth.updateUser({ password: p1 });
        if (error) throw error;
        // hotovo – zavři overlay, vyčisti URL, reload
        closeOverlay();
        cleanupUrlHash();
        alert('Heslo bylo změněno. Přihlašuju…');
        location.reload();
      } catch (e) {
        npErr.textContent = e.message || 'Změna hesla selhala.';
        npErr.style.display = 'block';
      }
    });

    // (volitelně) odhlášení, pokud máš někde #logoutBtn
    $('#logoutBtn')?.addEventListener('click', async () => {
      await sb.auth.signOut().catch(() => {});
      location.reload();
    });
  })();
})();

// ==== BOOT ====
init().then(render).catch(showErr);
