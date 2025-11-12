// ====== KONSTANTY & STAV ======
const STEP = 0.5;
const ASSIGNEE_OPTIONS = ['Viki', 'Standa', 'Marek'];

const state = {
  sb: null,
  session: null,
  weekStart: startOfISOWeek(new Date()),
  clients: [],
  statuses: [],
  jobs: [],
  entries: {},        // map[job_id][dateISO] = hours (aktuální týden, jen aktuální uživatel)
  totalsAll: {},      // kumulativní součet přes celé období (ME nebo ALL dle scope)
  filterClient: 'ALL',
  filterStatus: 'ALL',
  totalsScope: 'ME',  // 'ME' | 'ALL'
  filterAssignees: [],
  newJobAssignees: []
};

// ====== HELPERY ======
function startOfISOWeek(d){ const x=new Date(d); const wd=(x.getDay()+6)%7; x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD'); }
function round05(x){ return Math.round(x*2)/2; }
function formatNum(x){ return (x%1===0) ? String(x) : x.toFixed(1); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function showErr(msg){ console.error(msg); const e=document.getElementById('err'); e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none',5500); }
function getDays(){ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))); }
function setWeekRangeLabel(){ document.getElementById('weekRange').textContent = `${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`; }

// ====== SUPABASE INIT ======
async function loadConfig(){
  try{
    const r=await fetch('./config.json?v=fix-1',{cache:'no-store'});
    if(r.ok){ const j=await r.json(); if(j.supabaseUrl&&j.supabaseAnonKey) return j; }
  }catch{}
  const supabaseUrl = localStorage.getItem('vp.supabaseUrl');
  const supabaseAnonKey = localStorage.getItem('vp.supabaseAnonKey');
  if(supabaseUrl && supabaseAnonKey) return {supabaseUrl, supabaseAnonKey};
  throw new Error('Chybí konfigurace Supabase (config.json nebo localStorage).');
}

async function init(){
  const cfg = await loadConfig();
  if(!window.supabase) throw new Error('Chybí knihovna Supabase.');
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}} = await state.sb.auth.getSession();
  state.session = session;
  state.sb.auth.onAuthStateChange((_e, sess)=>{ state.session=sess; render(); });
}

// ====== DB ======
async function ensureProfile(){
  const uid = state.session?.user?.id; if(!uid) return;
  await state.sb.from('app_user').upsert({id:uid, full_name: state.session.user.email, role:'admin'}, {onConflict:'id'});
}

async function loadClients(){
  const {data, error} = await state.sb.from('client').select('id,name').order('name');
  if(error) showErr(error.message); return data||[];
}
async function loadStatuses(){
  const {data, error} = await state.sb.from('job_status').select('id,label').order('id');
  if(error) showErr(error.message); return data||[];
}
async function loadJobs(){
  // ZÁMĚRNĚ BEZ .eq('is_active',true) kvůli zpětné kompatibilitě
  const {data, error} = await state.sb
    .from('job')
    .select('id,name,status_id,client_id,assignees, client:client_id (id,name), status:status_id (id,label)')
    .order('name');
  if(error){ showErr(error.message); return []; }
  return (data||[]).map(j=>({
    id: j.id,
    name: j.name,
    client_id: j.client?.id || j.client_id,
    client: j.client?.name || '',
    status_id: j.status_id,
    status: j.status?.label || '',
    assignees: j.assignees || []
  }));
}
async function loadEntriesMine(){
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6));
  const {data, error} = await state.sb.from('time_entry')
    .select('job_id,work_date,hours')
    .gte('work_date',from).lte('work_date',to)
    .eq('user_id', state.session.user.id);
  if(error){ showErr(error.message); return {}; }
  const map={};
  for(const r of (data||[])){
    map[r.job_id] ??= {};
    map[r.job_id][r.work_date] = round05((map[r.job_id][r.work_date]||0) + Number(r.hours||0));
  }
  return map;
}
async function loadTotalsAll(jobIds){
  if(!jobIds.length) return {};
  // Součty: Já
  if(state.totalsScope==='ME'){
    const {data, error} = await state.sb.from('time_entry').select('job_id,hours').in('job_id', jobIds).eq('user_id', state.session.user.id);
    if(error){ showErr(error.message); return {}; }
    const map={}; for(const r of (data||[])){ map[r.job_id]=(map[r.job_id]||0)+Number(r.hours||0); } return map;
  }
  // Součty: Všichni – RPC pokud existuje
  const {data:rpc, error:rpcErr} = await state.sb.rpc('fn_job_totals'); // očekávané: [{job_id, sum_hours}]
  if(!rpcErr && rpc){ const m={}; for(const r of rpc){ m[r.job_id]=Number(r.sum_hours||0); } return m; }
  // Fallback (může padnout na RLS — v tom případě uvidíš jen své)
  const {data, error} = await state.sb.from('time_entry').select('job_id,hours').in('job_id', jobIds);
  if(error){ showErr(error.message); return {}; }
  const map={}; for(const r of (data||[])){ map[r.job_id]=(map[r.job_id]||0)+Number(r.hours||0); } return map;
}

// ====== UI HELPERY ======
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

// ====== RENDER TABULKY ======
function renderTable(){
  const tbody=document.getElementById('tbody'); tbody.innerHTML='';
  const days=getDays();

  const visible = state.jobs
    .filter(j=> (state.filterClient==='ALL'||String(j.client_id)===String(state.filterClient)) )
    .filter(j=> (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
    .filter(j=> jobPassesAssigneeFilter(j));

  for(const j of visible){
    const tr=document.createElement('tr'); tr.dataset.job=j.id;

    // Klient (select)
    const tdC=document.createElement('td');
    const csel=document.createElement('select'); csel.className='pill-select clientSel';
    csel.innerHTML = state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(j.client_id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    csel.onchange=async(e)=>{ await state.sb.from('job').update({client_id:e.target.value}).eq('id', j.id) };
    tdC.append(csel);
    tr.append(tdC);

    // Zakázka (název + status + grafik + koš)
    const tdJ=document.createElement('td'); tdJ.className='jobCell';

    const name=document.createElement('input'); name.className='pill-input jobNameIn'; name.value=j.name;
    let t=null; name.oninput=(e)=>{ clearTimeout(t); t=setTimeout(async()=>{ await state.sb.from('job').update({name:e.target.value}).eq('id', j.id) }, 250); };

    const st=document.createElement('select'); st.className='pill-select statusSel';
    st.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${String(s.id)===String(j.status_id)?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
    colorizeStatus(st); st.onchange=async(e)=>{ colorizeStatus(st); await state.sb.from('job').update({status_id:parseInt(e.target.value,10)}).eq('id', j.id) };

    const del=document.createElement('button'); del.className='jobDelete'; del.textContent='🗑'; del.title='Odstranit';
    del.onclick=()=>deleteJob(j.id);

    // Grafik u řádku
    const assBtn=document.createElement('button'); assBtn.className='assigneePill'; assBtn.type='button';
    const label=document.createElement('span'); label.textContent='Grafik: '+renderAssigneeLabel(j.assignees);
    assBtn.append(label);

    const menu=document.createElement('div'); menu.className='menu assigneeMenu'; menu.hidden=true;
    ASSIGNEE_OPTIONS.forEach(opt=>{
      const L=document.createElement('label'); const I=document.createElement('input'); I.type='checkbox'; I.value=opt; L.append(I, document.createTextNode(' '+opt)); menu.append(L);
    });
    const row=document.createElement('div'); row.className='menuRow';
    const clr=document.createElement('button'); clr.className='pill-btn small'; clr.textContent='Vymazat'; clr.type='button';
    const cls=document.createElement('button'); cls.className='pill-btn small'; cls.textContent='Zavřít'; cls.type='button';
    row.append(clr,cls); menu.append(row);

    assBtn.addEventListener('click', ()=>{ setMenuChecked(menu, j.assignees); toggleMenu(assBtn, menu); });
    clr.addEventListener('click', async ()=>{ j.assignees=[]; setMenuChecked(menu,j.assignees); label.textContent='Grafik: '+renderAssigneeLabel(j.assignees); await state.sb.from('job').update({assignees:j.assignees}).eq('id', j.id); renderTable(); });
    menu.addEventListener('change', async ()=>{ j.assignees=collectMenuChecked(menu); label.textContent='Grafik: '+renderAssigneeLabel(j.assignees); await state.sb.from('job').update({assignees:j.assignees}).eq('id', j.id); renderTable(); });
    cls.addEventListener('click', ()=> menu.hidden=true);

    tdJ.append(name, st, assBtn, del, menu);
    tr.append(tdJ);

    // 5 dnů (Po–Pá)
    for(let i=0;i<5;i++){
      const d=days[i]; const td=document.createElement('td'); td.dataset.day=i;
      const b=document.createElement('button'); b.className='bubble'; b.textContent='0';
      b.onclick=()=>bump(j.id,d,+STEP); b.oncontextmenu=(e)=>{e.preventDefault(); bump(j.id,d,-STEP)};
      td.append(b); tr.append(td);
    }

    // Celkový kumulativní součet (scope ME/ALL)
    const tdT=document.createElement('td'); tdT.className='totalCell'; tdT.textContent=formatNum(state.totalsAll[j.id]||0);
    tr.appendChild(tdT);

    document.getElementById('tbody').appendChild(tr);
    updateRow(j.id);
  }

  updateSumRow(visible);
}

// Menu helpery
function toggleMenu(btn, menu){
  const show = menu.hasAttribute('hidden');
  document.querySelectorAll('.menu').forEach(m=>m.setAttribute('hidden',''));
  if(show) menu.removeAttribute('hidden');
}
function setMenuChecked(menu, values){ const set=new Set(values||[]); menu.querySelectorAll('input[type="checkbox"]').forEach(i=>i.checked=set.has(i.value)); }
function collectMenuChecked(menu){ return [...menu.querySelectorAll('input[type="checkbox"]:checked')].map(i=>i.value); }

// Zavřít menu klikem mimo
document.addEventListener('click', (e)=>{
  document.querySelectorAll('.menu:not([hidden])').forEach(m=>{
    const trigger = m.previousElementSibling;
    if(!m.contains(e.target) && !trigger?.contains(e.target)) m.hidden=true;
  });
});

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return;
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .bubble`); if(b) b.textContent=formatNum(val); });
  tr.querySelector('.totalCell').textContent = formatNum(state.totalsAll[jobId]||0);
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

// Změna hodin (±STEP), nezáporně
async function bump(jobId, dateISO, delta){
  try{
    const curr=cellValue(jobId,dateISO);
    const next=Math.max(0, round05(curr+delta));
    const eff=round05(next-curr); if(eff===0) return;

    state.entries[jobId] ??= {}; state.entries[jobId][dateISO] = next; updateRow(jobId);

    const ins = {job_id:jobId,work_date:dateISO,hours:eff,user_id:state.session.user.id};
    const {error} = await state.sb.from('time_entry').insert(ins);
    if(error){ state.entries[jobId][dateISO]=curr; updateRow(jobId); return showErr(error.message); }

    await refreshTotals(); updateRow(jobId);
  }catch(e){ showErr(e); }
}

// „Mazání“ zakázky (zatím fyzicky — pro ostrý provoz spíše soft-delete)
async function deleteJob(jobId){
  if(!confirm('Opravdu odstranit zakázku?')) return;
  await state.sb.from('job').delete().eq('id', jobId);
  state.jobs = await loadJobs(); await refreshTotals(); renderTable();
}

// Export do Excelu — vynechá řádky bez hodin v daném týdnu
async function exportExcel(){
  const daysISO = getDays();
  const daysTxt = daysISO.map(d=>dayjs(d).format('D. M. YYYY'));

  const visible = state.jobs
    .filter(j=> (state.filterClient==='ALL'||String(j.client_id)===String(state.filterClient)) )
    .filter(j=> (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
    .filter(j=> jobPassesAssigneeFilter(j));

  const withHours = visible.filter(j => daysISO.some(d => cellValue(j.id,d) > 0));

  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Výkaz');
  const user=state.session?.user?.email||'';
  const range=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`;
  ws.addRow([`Uživatel: ${user}`]);
  ws.addRow([`Týden: ${range}`]);
  ws.addRow([]);

  const header=['Klient','Zakázka',...daysTxt];
  ws.addRow(header); ws.getRow(4).font={bold:true};

  for(const j of withHours){
    const vals = daysISO.map(d=>cellValue(j.id,d));
    ws.addRow([j.client, j.name, ...vals]);
  }

  // Denní součty (bez celkového sloupce za zakázku – dle tvého zadání)
  const sums = daysISO.map(d=> withHours.reduce((a,j)=>a+cellValue(j.id,d),0));
  ws.addRow(['Součet za den','', ...sums]);

  ws.columns.forEach((c,idx)=> c.width = idx<3 ? 22 : 14);

  const buf=await wb.xlsx.writeBuffer();
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download=`vykaz-${dayjs(state.weekStart).format('YYYY-MM-DD')}.xlsx`;
  a.click();
}

// ====== REFRESH ======
async function refreshTotals(){ const ids=state.jobs.map(j=>j.id); state.totalsAll = await loadTotalsAll(ids); }
async function refreshData(){ state.entries = await loadEntriesMine(); await refreshTotals(); renderTable(); }

// ====== SHELL (UI) ======
function setWeekHandlers(){
  document.getElementById('prevWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); setWeekRangeLabel(); refreshData(); };
  document.getElementById('nextWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); setWeekRangeLabel(); refreshData(); };
  document.getElementById('exportXlsx').onclick=exportExcel;
}

function buildShellControls(){
  // Filtr klient
  const fClient=document.getElementById('filterClient');
  fClient.innerHTML = `<option value="ALL">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  fClient.value=state.filterClient; fClient.onchange=(e)=>{ state.filterClient=e.target.value; renderTable(); };

  // Filtr status
  const fStat=document.getElementById('filterStatus');
  fStat.innerHTML = `<option value="ALL">Všechny zakázky</option>` + state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  fStat.value=state.filterStatus; fStat.onchange=(e)=>{ state.filterStatus=e.target.value; renderTable(); };

  // Scope součtů
  const scope=document.getElementById('totalsScope');
  scope.value=state.totalsScope; scope.onchange=async(e)=>{ state.totalsScope=e.target.value; await refreshTotals(); renderTable(); };

  // Filtr „Grafik“
  const fBtn=document.getElementById('assigneeFilterBtn');
  const fMenu=document.getElementById('assigneeFilterMenu');
  const fClear=document.getElementById('assigneeFilterClear');
  const fClose=document.getElementById('assigneeFilterClose');
  fBtn.onclick=()=>{ setMenuChecked(fMenu, state.filterAssignees); toggleMenu(fBtn, fMenu); };
  fMenu.onchange=()=>{ state.filterAssignees = collectMenuChecked(fMenu); fBtn.textContent = state.filterAssignees.length ? `Grafik: ${state.filterAssignees.join(', ')}` : 'Grafik: Všichni'; renderTable(); };
  fClear.onclick=()=>{ state.filterAssignees=[]; fBtn.textContent='Grafik: Všichni'; setMenuChecked(fMenu,[]); renderTable(); };
  fClose.onclick=()=> fMenu.hidden=true;

  // Přidávání klienta / zakázky
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
  aBtn.onclick=()=>{ setMenuChecked(aMenu, state.newJobAssignees); toggleMenu(aBtn,aMenu); };
  aMenu.onchange=()=>{ state.newJobAssignees=collectMenuChecked(aMenu); aBtn.textContent='Grafik: '+(state.newJobAssignees.length? renderAssigneeLabel(state.newJobAssignees): 'nikdo'); };
  aClear.onclick=()=>{ state.newJobAssignees=[]; setMenuChecked(aMenu,[]); aBtn.textContent='Grafik: nikdo'; };
  aClose.onclick=()=> aMenu.hidden=true;

  document.getElementById('addJobBtn').onclick=async()=>{
    const name=document.getElementById('newJobName').value.trim(); if(!name) return showErr('Zadej název zakázky');
    const client_id=document.getElementById('newJobClient').value;
    const status_id=parseInt(document.getElementById('newJobStatus').value,10);
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
  // Userbox
  const ub=document.getElementById('userBoxTopRight'); ub.innerHTML='';
  if(!state.session){
    const b=document.createElement('button'); b.className='pill-btn'; b.textContent='Přihlásit'; b.onclick=showLogin; ub.append(b);
    document.querySelector('.filters')?.remove(); document.querySelector('.addRow')?.remove(); document.querySelector('.tableWrap')?.remove();
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

// ====== BOOT ======
init().then(render).catch(showErr);
