/* ====== STATE ====== */
const state = {
  sb: null,
  session: null,
  weekStart: startOfISOWeek(new Date()),
  clients: [],
  statuses: [],
  jobs: [],
  totals: {},
  filterClient: 'ALL',
  filterStatus: 'ALL',
  totalsScope: 'ME',
  assigneeFilter: new Set(),        // pro filtr "Grafik"
  newJobAssignees: []               // pro přidání zakázky
};

/* ====== HELPERY ====== */
function startOfISOWeek(d){ const x=new Date(d); const wd=(x.getDay()+6)%7; x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD'); }
function round05(x){ return Math.round(x*2)/2; }
function formatNum(x){ return (x%1===0) ? String(x) : x.toFixed(1); }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function showErr(msg){ console.error(msg); const e=document.getElementById('err'); if(!e) return; e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none',5200); }
function getDays(){ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))); }
function setWeekRangeLabel(){ document.getElementById('weekRange').textContent = `${dayjs(state.weekStart).format('10. 11. 2025')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`.replace(/^10\. 11\. 2025/, dayjs(state.weekStart).format('D. M. YYYY')); } // cache guard

/* ====== SUPABASE INIT ====== */
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

/* ====== DATA ====== */
async function ensureProfile(){
  const uid=state.session?.user?.id; if(!uid) return;
  await state.sb.from('app_user').upsert({id:uid, full_name: state.session.user.email, role:'admin'},{onConflict:'id'});
}
async function loadClients(){ const {data,error}=await state.sb.from('client').select('id,name').order('name'); if(error) showErr(error); return data||[]; }
async function loadStatuses(){ const {data,error}=await state.sb.from('job_status').select('id,label').order('id'); if(error) showErr(error); return data||[]; }
async function loadJobs(){
  const {data,error}=await state.sb.from('job')
    .select('id,name,status_id,client_id,assignees, client:client_id(id,name), hours:job_hour(date,hours)')
    .order('id',{ascending:true});
  if(error){ showErr(error); return []; }
  return (data||[]).map(j=>({
    id:j.id, name:j.name, status_id:j.status_id, client_id:j.client_id,
    client:j.client?.name||'', assignees:j.assignees||[], hours:j.hours||[]
  }));
}
function cellValue(jobId, dayISO){
  const j = state.jobs.find(x=>x.id===jobId); if(!j) return 0;
  const h = j.hours?.find(r=>r.date===dayISO); return h ? (h.hours||0) : 0;
}

/* ====== UI: TABULKA & FILTRY ====== */
function jobPassesAssigneeFilter(job){
  if(!state.assigneeFilter.size) return true;
  return job.assignees?.some(a=>state.assigneeFilter.has(a));
}
function renderTable(){
  const tbody=document.getElementById('tbody'); if(!tbody) return;
  tbody.innerHTML='';

  const daysISO = getDays();
  const visible = state.jobs
    .filter(j => (state.filterClient === 'ALL' || String(j.client_id) === String(state.filterClient)))
    .filter(j => (state.filterStatus === 'ALL' || String(j.status_id) === String(state.filterStatus)))
    .filter(j => jobPassesAssigneeFilter(j));

  for(const j of visible){
    const tr=document.createElement('tr');

    // Klient
    const tdClient=document.createElement('td');
    const sel=document.createElement('select'); sel.className='pill-select clientSel'; sel.disabled=true;
    sel.innerHTML=`<option>${escapeHtml(j.client||'')}</option>`;
    tdClient.append(sel);
    tr.append(tdClient);

    // Zakázka + status + grafik + koš
    const tdJob=document.createElement('td'); tdJob.className='jobCell';
    const jobName=document.createElement('input'); jobName.className='pill-input jobNameIn'; jobName.value=j.name; jobName.disabled=true;
    const status=document.createElement('select'); status.className='pill-select statusSel'; status.disabled=true;
    status.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${s.id===j.status_id?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
    if(j.status_id===1) status.classList.add('is-nova');
    if(j.status_id===2) status.classList.add('is-probiha');
    if(j.status_id===3) status.classList.add('is-hotovo');

    const assBtn=document.createElement('button'); assBtn.className='pill-btn assigneeIcon'; assBtn.title=j.assignees?.join(', ')||'';
    assBtn.textContent='Grafik';

    const del=document.createElement('button'); del.className='pill-btn jobDelete'; del.innerHTML='🗑';

    tdJob.append(jobName,status,assBtn,del); tr.append(tdJob);

    // dny
    for(const d of daysISO){
      const td=document.createElement('td'); td.style.textAlign='center';
      const b=document.createElement('button'); b.className='bubble'; b.textContent=formatNum(cellValue(j.id,d)||0);
      td.append(b); tr.append(td);
    }

    // celkem
    const total=daysISO.reduce((s,d)=>s+(cellValue(j.id,d)||0),0);
    const tdTotal=document.createElement('td'); tdTotal.className='totalCell';
    const tv=document.createElement('div'); tv.className='totalVal'; tv.textContent=formatNum(total);
    tdTotal.append(tv); tr.append(tdTotal);

    tbody.append(tr);
  }

  // součty do patičky
  const tds=[...document.querySelectorAll('#sumRow .sumCell')];
  tds.forEach((td,i)=>{
    const sum=visible.reduce((s,j)=>s+(cellValue(j.id,daysISO[i])||0),0);
    td.innerHTML=`<span class="sumBubble ${sum>=7?'sumGreen':sum>=5?'sumOrange':'sumRed'}">${formatNum(sum)}</span>`;
  });
}

function setWeekHandlers(){
  document.getElementById('prevWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); setWeekRangeLabel(); renderTable(); };
  document.getElementById('nextWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); setWeekRangeLabel(); renderTable(); };
}

/* ====== SHELL (filtry + přidávací ovládání) ====== */
function buildShellControls(){
  // filtry klient/status
  const selClient=document.getElementById('filterClient');
  selClient.innerHTML=`<option value="ALL">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  selClient.onchange=e=>{ state.filterClient=e.target.value; renderTable(); };

  const selStatus=document.getElementById('filterStatus');
  selStatus.innerHTML=`<option value="ALL">Všechny zakázky</option>` + state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  selStatus.onchange=e=>{ state.filterStatus=e.target.value; renderTable(); };

  // Součty
  const totalsSel=document.getElementById('totalsScope');
  totalsSel.value = state.totalsScope;
  totalsSel.onchange=e=>{ state.totalsScope=e.target.value; renderTable(); };

  // filtr „Grafik“
  const fBtn = document.getElementById('assigneeFilterBtn');
  const fMenu = document.getElementById('assigneeFilterMenu');
  const fClose= document.getElementById('assigneeFilterClose');
  const fClear= document.getElementById('assigneeFilterClear');
  fBtn.onclick=()=>{ fMenu.hidden=!fMenu.hidden; };
  fClose.onclick=()=>{ fMenu.hidden=true; };
  fClear.onclick=()=>{ state.assigneeFilter.clear(); fBtn.textContent='Grafik: Všichni'; fMenu.querySelectorAll('input[type=checkbox]').forEach(i=>i.checked=false); renderTable(); };
  fMenu.querySelectorAll('input[type=checkbox]').forEach(ch=>{
    ch.onchange=()=>{
      if(ch.checked) state.assigneeFilter.add(ch.value); else state.assigneeFilter.delete(ch.value);
      fBtn.textContent = state.assigneeFilter.size? ('Grafik: '+[...state.assigneeFilter].join(', ')) : 'Grafik: Všichni';
      renderTable();
    };
  });

  /* === Přidání zakázky v DRAWERU === */
  // klient
  const newJobClient=document.getElementById('newJobClient');
  newJobClient.innerHTML=state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  // status
  const newJobStatus=document.getElementById('newJobStatus');
  newJobStatus.innerHTML=state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  if(state.statuses.length){ newJobStatus.value = state.statuses[0].id; }

  // „Grafik: …“ (výběr)
  const aBtn = document.getElementById('assigneesNewBtn');
  const aMenu= document.getElementById('assigneesNewMenu');
  const aClose=document.getElementById('assigneesNewClose');
  const aClear=document.getElementById('assigneesNewClear');

  aBtn.onclick=()=>{ aMenu.hidden=!aMenu.hidden; };
  aClose.onclick=()=>{ aMenu.hidden=true; };
  aClear.onclick=()=>{ state.newJobAssignees=[]; aBtn.textContent='Grafik: nikdo'; aMenu.querySelectorAll('input[type=checkbox]').forEach(i=>i.checked=false); };

  aMenu.querySelectorAll('input[type=checkbox]').forEach(ch=>{
    ch.onchange=()=>{
      const v=ch.value;
      if(ch.checked){ if(!state.newJobAssignees.includes(v)) state.newJobAssignees.push(v); }
      else{ state.newJobAssignees=state.newJobAssignees.filter(x=>x!==v); }
      aBtn.textContent = state.newJobAssignees.length ? ('Grafik: ' + state.newJobAssignees.join(', ')) : 'Grafik: nikdo';
    };
  });

  // přidání klienta
  document.getElementById('addClientBtn').onclick=async()=>{
    const name=document.getElementById('newClientName').value.trim(); if(!name) return showErr('Zadej název klienta');
    const {error}=await state.sb.from('client').insert({name});
    if(error) return showErr(error.message);
    document.getElementById('newClientName').value='';
    state.clients=await loadClients();
    // refresh dropdownu v přidání zakázky
    newJobClient.innerHTML=state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  };

  // přidání zakázky
  document.getElementById('addJobBtn').onclick=async()=>{
    const name=document.getElementById('newJobName').value.trim(); if(!name) return showErr('Zadej název zakázky');
    const client_id=document.getElementById('newJobClient').value;
    const status_id=+document.getElementById('newJobStatus').value;
    const assignees=state.newJobAssignees.slice();
    const {error}=await state.sb.from('job').insert({client_id,name,status_id,assignees});
    if(error) return showErr(error.message);
    document.getElementById('newJobName').value=''; state.newJobAssignees=[]; aBtn.textContent='Grafik: nikdo';
    state.jobs=await loadJobs(); renderTable();
  };
}

/* ====== EXPORT XLSX (tvoje verze) ====== */
document.getElementById('exportXlsx').onclick = exportExcel;
async function exportExcel(){
  function resolveDisplayName(email){
    if(!email) return '';
    // 1) user poskytl mapu?
    if (typeof USER_NAME_BY_EMAIL === 'object' && USER_NAME_BY_EMAIL) {
      const hit = USER_NAME_BY_EMAIL[email.toLowerCase()]; if(hit) return hit;
    }
    // 2) fallbacky (globalThis/window)
    const mapCandidates = [
      (typeof USER_NAME_BY_EMAIL !== 'undefined' && USER_NAME_BY_EMAIL) || null,
      (typeof globalThis !== 'undefined' && globalThis.USER_NAME_BY_EMAIL) || null,
      (typeof window !== 'undefined' && window.USER_NAME_BY_EMAIL) || null,
    ].filter(m => m && typeof m === 'object');
    const key = email.toLowerCase();
    for (const m of mapCandidates) { if (m[key]) return m[key]; }
    // 3) interní nouzová mapa
    const FALLBACK = {'binder.marek@gmail.com':'Marek','grafika@media-consult.cz':'Viki','stanislav.hron@icloud.com':'Standa'};
    if (FALLBACK[key]) return FALLBACK[key];
    // 4) úplný fallback
    return email.split('@')[0];
  }

  const daysISO = getDays();
  const daysTxt = daysISO.map(d => dayjs(d).format('D. M. YYYY'));

  const visible = state.jobs
    .filter(j => (state.filterClient === 'ALL' || String(j.client_id) === String(state.filterClient)))
    .filter(j => (state.filterStatus === 'ALL' || String(j.status_id) === String(state.filterStatus)))
    .filter(j => jobPassesAssigneeFilter(j));

  const withHours = visible.filter(j => daysISO.some(d => (cellValue(j.id, d) || 0) > 0));

  const email = (state.session?.user?.email || '').trim();
  const displayName = resolveDisplayName(email);

  const start = dayjs(state.weekStart);
  const end = dayjs(addDays(state.weekStart, 4));
  const rangeHuman = `${start.format('D. M. YYYY')} – ${end.format('D. M. YYYY')}`;

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Výkaz');

  ws.addRow([`Uživatel: ${displayName}`]);
  ws.addRow([`Týden: ${rangeHuman}`]);
  ws.addRow([]);

  const headerRow = ws.addRow(['Klient', 'Zakázka', ...daysTxt]);
  headerRow.font = { bold: true };

  for (const j of withHours) {
    const vals = daysISO.map(d => cellValue(j.id, d) || 0);
    const row = ws.addRow([j.client, j.name, ...vals]);
    for (let i = 0; i < vals.length; i++) row.getCell(3 + i).numFmt = '0.##';
  }

  ws.addRow([]);
  const totals = daysISO.map(d => withHours.reduce((sum, j) => sum + (cellValue(j.id, d) || 0), 0));
  const sumRow = ws.addRow(['', 'Součet', ...totals]);
  sumRow.font = { bold: true };
  for (let i = 0; i < totals.length; i++) sumRow.getCell(3 + i).numFmt = '0.##';

  ws.columns = [{ width: 28 }, { width: 36 }, ...daysISO.map(() => ({ width: 12 }))];

  const safe = (s)=> (s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._ -]/g,'').trim() || 'Uzivatel';
  const fileName = `Vykaz_${safe(displayName)}_${start.format('DD-MM-YYYY')}–${end.format('DD-MM-YYYY')}.xlsx`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (window.saveAs) saveAs(blob, fileName);
  else { const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileName; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2500); }
}

/* ====== DRAWER – OVLÁDÁNÍ ====== */
(function drawerInit(){
  const overlay = document.getElementById('drawerOverlay');
  const drawer  = document.getElementById('drawer');
  const openBtn = document.getElementById('drawerOpenBtn');
  const closeBtn= document.getElementById('drawerCloseBtn');

  if(!overlay || !drawer || !openBtn || !closeBtn) return;

  const open = ()=>{ drawer.classList.add('open'); overlay.classList.add('show'); document.documentElement.classList.add('no-scroll'); drawer.setAttribute('aria-hidden','false'); overlay.setAttribute('aria-hidden','false'); };
  const close= ()=>{ drawer.classList.remove('open'); overlay.classList.remove('show'); document.documentElement.classList.remove('no-scroll'); drawer.setAttribute('aria-hidden','true'); overlay.setAttribute('aria-hidden','true'); };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
})();

/* ====== RENDER ====== */
async function buildShell(){
  setWeekHandlers(); setWeekRangeLabel(); buildShellControls(); renderTable();
}
async function refreshData(){
  // případné dopočty/součty – vynecháno, zůstává kompatibilní
}
async function render(){
  // UI login box – necháváme logiku (element je v CSS skrytý, ale DOM zůstává)
  const ub=document.getElementById('userBoxTopRight'); if(ub) ub.innerHTML='';
  if(!state.session){
    const b=document.createElement('button'); b.className='pill-btn'; b.textContent='Přihlásit'; b.onclick=showLogin; ub?.append(b);
    return showLogin();
  }else{
    const e=document.createElement('span'); e.className='pill-btn'; e.textContent=state.session.user.email; e.style.background='#ECEEF2';
    const o=document.createElement('button'); o.className='pill-btn'; o.textContent='Odhlásit'; o.onclick=async()=>{ await state.sb.auth.signOut(); };
    ub?.append(e,o);
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

/* ====== BOOT ====== */
init().then(render).catch(showErr);
