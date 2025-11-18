/* MC Vykaz prace – robustní app.js (komplet) */
'use strict';

/* -------------------- util datumu (bez dayjs) -------------------- */
function startOfISOWeek(d){
  const x = new Date(d); const wd = (x.getDay()+6)%7;
  x.setDate(x.getDate()-wd); x.setHours(0,0,0,0); return x;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtISO(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0'); return `${y}-${m}-${dd}`; }
function fmtHuman(d){
  try { if (window.dayjs) return dayjs(d).format('D. M. YYYY'); } catch {}
  const dd=d.getDate(), mm=d.getMonth()+1, yy=d.getFullYear();
  return `${dd}. ${mm}. ${yy}`;
}

/* -------------------- state -------------------- */
const STEP=0.5;
const ASSIGNEE_OPTIONS=['Viki','Standa','Marek'];
const state={
  sb:null, session:null,
  weekStart: startOfISOWeek(new Date()),
  clients:[], statuses:[], jobs:[],
  entries:{}, totalsAll:{},
  filterClient:'ALL', filterStatus:'ALL', totalsScope:'ME',
  filterAssignees:[], newJobAssignees:[]
};

/* -------------------- helpers -------------------- */
const USER_NAME_BY_EMAIL={
  'binder.marek@gmail.com':'Marek',
  'grafika@media-consult.cz':'Viki',
  'stanislav.hron@icloud.com':'Standa',
};
function nameFromEmail(email){
  if(!email) return 'Neznámý';
  const key=email.toLowerCase().trim();
  return USER_NAME_BY_EMAIL[key] || key.split('@')[0];
}
function showErr(e){
  console.error(e);
  const el=document.getElementById('err'); if(!el) return;
  el.textContent=(e&&e.message)||String(e); el.style.display='block';
  setTimeout(()=>el.style.display='none',5200);
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function round05(x){ return Math.round(x*2)/2; }
function formatNum(x){ return (x%1===0)? String(x) : x.toFixed(1); }
function getDays(){ return [0,1,2,3,4].map(i=>fmtISO(addDays(state.weekStart,i))); }
function cellValue(jobId, iso){ return state.entries[jobId]?.[iso] || 0; }
function jobPassesAssigneeFilter(j){
  if(!state.filterAssignees.length) return true;
  const set=new Set(j.assignees||[]); return state.filterAssignees.some(a=>set.has(a));
}

/* -------------------- week label & arrows -------------------- */
function findWeekLabelEl(){
  return document.querySelector('#weekRange, #weekLabel, [data-week-range]') ||
         document.querySelector('[data-role="week-pill"]') ||
         // auto – prostřední pilulka mezi dvěma šipkami
         (()=>{
            const pills=[...document.querySelectorAll('.weekbar .pill, .week-pill, .date-pill')];
            return pills.length ? pills[Math.floor(pills.length/2)] : null;
         })();
}
function setWeekLabel(){
  const el=findWeekLabelEl(); if(!el) return;
  const a=fmtHuman(state.weekStart); const b=fmtHuman(addDays(state.weekStart,4));
  el.textContent=`${a} – ${b}`;
}
function wireWeekArrows(){
  const prev = document.querySelector('#prevWeek, [data-week="prev"]') ||
               document.querySelector('.weekbar [data-dir="prev"]') ||
               document.querySelector('.icon-prev, .btn-prev');
  const next = document.querySelector('#nextWeek, [data-week="next"]') ||
               document.querySelector('.weekbar [data-dir="next"]') ||
               document.querySelector('.icon-next, .btn-next');
  if(prev) prev.onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); setWeekLabel(); refreshData(); };
  if(next) next.onclick=()=>{ state.weekStart=addDays(state.weekStart,+7); setWeekLabel(); refreshData(); };
}

/* -------------------- drawer (funguje i bez drawer.js) -------------------- */
function wireDrawer(){
  const drawer = document.querySelector('#drawer, [data-drawer]');
  if(!drawer) return;
  const scrim  = document.querySelector('#drawerScrim, [data-drawer-scrim]');
  const open = ()=>{ drawer.classList.add('open'); document.body.classList.add('drawer-open'); };
  const close= ()=>{ drawer.classList.remove('open'); document.body.classList.remove('drawer-open'); };

  // openers – delegace (stačí aby + mělo jednu z těchto tříd/atributů)
  document.addEventListener('click', (e)=>{
    const t=e.target;
    if(t.closest('[data-open-drawer], #drawerOpen, #burgerBtn, #plusFab, .fab-plus, .btn-plus, .open-drawer, .openSidebar')) { open(); }
    if(t.closest('[data-close-drawer], #drawerClose, #drawerX, .drawerClose')) { close(); }
  });
  if(scrim) scrim.addEventListener('click', close);
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });
}

/* -------------------- Supabase init (neblokuje UI) -------------------- */
function sbConfig(){
  const url = window.SUPABASE_URL || window.__SUPABASE_URL ||
              (window.APP_CONFIG&&APP_CONFIG.supabaseUrl) ||
              (document.querySelector('meta[name="supabase-url"]')?.content)||'';
  const key = window.SUPABASE_ANON_KEY || window.SUPABASE_KEY || window.__SUPABASE_KEY ||
              (window.APP_CONFIG&&APP_CONFIG.supabaseAnonKey) ||
              (document.querySelector('meta[name="supabase-anon-key"]')?.content)||'';
  return {url,key};
}
async function sbInit(){
  try{
    if(window.__sbClient){ state.sb=window.__sbClient; return; }
    const {url,key}=sbConfig(); if(!url||!key) return; // UI poběží i bez SB
    state.sb = window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true}});
    const { data:{session} } = await state.sb.auth.getSession(); state.session=session||null;
    state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; refreshData(); });
  }catch(e){ showErr(e); }
}

/* -------------------- DB load -------------------- */
async function loadClients(){ try{
  if(!state.sb) return [];
  const { data, error } = await state.sb.from('client').select('id,name').order('name');
  if(error) throw error; return data||[];
}catch(e){ showErr(e); return []; } }
async function loadStatuses(){ try{
  if(!state.sb) return [];
  const { data, error } = await state.sb.from('job_status').select('id,label').order('id');
  if(error) throw error; return data||[];
}catch(e){ showErr(e); return []; } }
async function loadJobs(){ try{
  if(!state.sb) return [];
  const { data, error } = await state.sb
    .from('job')
    .select('id,name,status_id,client_id,assignees, client:client_id(id,name), status:status_id(id,label)')
    .order('name');
  if(error) throw error;
  return (data||[]).map(j=>({
    id:j.id, name:j.name, status_id:j.status_id,
    client_id: j.client?.id ?? j.client_id,
    client: j.client?.name || '',
    status: j.status?.label || '',
    assignees: j.assignees || []
  }));
}catch(e){ showErr(e); return []; } }
async function loadEntriesMine(){ try{
  if(!state.sb || !state.session?.user?.id) return {};
  const from=fmtISO(state.weekStart), to=fmtISO(addDays(state.weekStart,6));
  const { data, error } = await state.sb
    .from('time_entry').select('job_id,work_date,hours')
    .gte('work_date',from).lte('work_date',to).eq('user_id',state.session.user.id);
  if(error) throw error;
  const map={}; for(const r of (data||[])){ (map[r.job_id]??={})[r.work_date]=(map[r.job_id][r.work_date]||0)+Number(r.hours||0); }
  return map;
}catch(e){ showErr(e); return {}; } }
async function loadTotalsAll(jobIds){ try{
  if(!state.sb || !jobIds.length) return {};
  if(state.totalsScope==='ME'){
    const uid=state.session?.user?.id||'__none__';
    const { data, error } = await state.sb.from('time_entry').select('job_id,hours').in('job_id',jobIds).eq('user_id',uid);
    if(error) throw error;
    const m={}; for(const r of (data||[])) m[r.job_id]=(m[r.job_id]||0)+Number(r.hours||0); return m;
  }
  const { data, error } = await state.sb.from('time_entry').select('job_id,hours').in('job_id',jobIds);
  if(error) throw error;
  const m={}; for(const r of (data||[])) m[r.job_id]=(m[r.job_id]||0)+Number(r.hours||0); return m;
}catch(e){ showErr(e); return {}; } }

/* -------------------- render tabulky -------------------- */
function colorizeStatus(sel){
  sel.classList.remove('is-nova','is-probiha','is-hotovo');
  const t=(sel.options[sel.selectedIndex]?.text||'').toLowerCase();
  if(t.includes('nov')) sel.classList.add('is-nova');
  else if(t.includes('pro')||t.includes('běh')) sel.classList.add('is-probiha');
  else if(t.includes('hot')) sel.classList.add('is-hotovo');
}
function renderTable(){
  const tbody=document.getElementById('tbody'); if(!tbody) return;
  tbody.innerHTML='';
  const vis = state.jobs
    .filter(j=> state.filterClient==='ALL'||String(j.client_id)===String(state.filterClient))
    .filter(j=> state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus))
    .filter(jobPassesAssigneeFilter);

  const days=getDays();
  for(const j of vis){
    const tr=document.createElement('tr'); tr.dataset.job=j.id;

    // klient
    const tdC=document.createElement('td');
    const csel=document.createElement('select'); csel.className='pill-select';
    csel.innerHTML=state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(j.client_id)?'selected':''}>${escapeHtml(c.name)}</option>`).join('');
    csel.onchange=async(e)=>{ if(!state.sb) return; await state.sb.from('job').update({client_id:e.target.value}).eq('id',j.id); };
    tdC.appendChild(csel); tr.appendChild(tdC);

    // zakázka + status + grafik
    const tdJ=document.createElement('td');

    const nm=document.createElement('input'); nm.className='pill-input'; nm.value=j.name;
    let t=null; nm.oninput=(e)=>{ clearTimeout(t); t=setTimeout(async()=>{ if(!state.sb) return; await state.sb.from('job').update({name:e.target.value}).eq('id',j.id); },250); };

    const st=document.createElement('select'); st.className='pill-select';
    st.innerHTML=state.statuses.map(s=>`<option value="${s.id}" ${String(s.id)===String(j.status_id)?'selected':''}>${escapeHtml(s.label)}</option>`).join('');
    colorizeStatus(st);
    st.onchange=async(e)=>{ colorizeStatus(st); if(!state.sb) return; await state.sb.from('job').update({status_id:+e.target.value}).eq('id',j.id); };

    const assBtn=document.createElement('button'); assBtn.className='pill-btn'; assBtn.textContent=`Grafik: ${ (j.assignees&&j.assignees.length)? (j.assignees.length===1?j.assignees[0]:`${j.assignees[0]} +${j.assignees.length-1}`) : 'nikdo' }`;
    const menu=document.createElement('div'); menu.className='menu'; menu.hidden=true;
    menu.innerHTML=ASSIGNEE_OPTIONS.map(a=>`<label><input type="checkbox" value="${a}" ${j.assignees?.includes(a)?'checked':''}> ${a}</label>`).join('')+
                   `<div class="menuRow"><button type="button" class="pill-btn small closeBtn">Zavřít</button></div>`;
    assBtn.onclick=(e)=>{ e.stopPropagation(); menu.hidden=!menu.hidden; };
    menu.addEventListener('change', async ()=>{
      const sel=[...menu.querySelectorAll('input:checked')].map(i=>i.value);
      if(state.sb) await state.sb.from('job').update({assignees:sel}).eq('id',j.id);
      j.assignees=sel; assBtn.textContent=`Grafik: ${ sel.length? (sel.length===1?sel[0]:`${sel[0]} +${sel.length-1}`) : 'nikdo' }`;
    });
    menu.querySelector('.closeBtn').onclick=()=> menu.hidden=true;
    document.addEventListener('click',(e)=>{ if(!menu.contains(e.target) && !assBtn.contains(e.target)) menu.hidden=true; });

    const del=document.createElement('button'); del.className='pill-btn'; del.textContent='🗑'; del.onclick=async()=>{ if(confirm('Odstranit zakázku?') && state.sb){ await state.sb.from('job').delete().eq('id',j.id); refreshData(); } };

    const anchor=document.createElement('div'); anchor.className='menuAnchor'; anchor.append(assBtn,menu);
    tdJ.append(nm,st,anchor,del); tr.appendChild(tdJ);

    // Po–Pá
    for(let i=0;i<5;i++){
      const iso=days[i];
      const td=document.createElement('td'); td.style.textAlign='center';
      const b=document.createElement('button'); b.className='bubble'; b.textContent=formatNum(cellValue(j.id,iso));
      b.onclick = ()=> bump(j.id, iso, +STEP);
      b.oncontextmenu=(e)=>{ e.preventDefault(); bump(j.id, iso, -STEP); };
      td.appendChild(b); tr.appendChild(td);
    }

    // celkem
    const tdT=document.createElement('td'); tdT.className='totalCell';
    tdT.innerHTML=`<span class="totalVal">${formatNum(state.totalsAll[j.id]||0)}</span>`;
    tr.appendChild(tdT);

    document.getElementById('tbody').appendChild(tr);
  }
  updateSumRow(vis);
}
function updateSumRow(visibleJobs){
  const vis=visibleJobs||state.jobs; const days=getDays();
  const sums=days.map(d=> vis.reduce((a,j)=> a+(cellValue(j.id,d)||0),0));
  const row=document.getElementById('sumRow'); if(!row) return;
  row.innerHTML = sums.map(s=>{
    const cls = s<=3 ? 'sumRed' : (s<=6 ? 'sumOrange' : 'sumGreen');
    return `<td class="sumCell"><span class="sumBubble ${cls}">${formatNum(s)}</span></td>`;
  }).join('');
}

/* -------------------- změna hodin -------------------- */
async function bump(jobId, iso, delta){
  const curr=cellValue(jobId,iso);
  const next=Math.max(0, round05(curr+delta));
  const eff=round05(next-curr);
  if(eff===0) return;

  // optimistic
  state.entries[jobId] ??= {}; state.entries[jobId][iso]=next; renderTable();

  if(!state.sb || !state.session?.user?.id){ showErr('Pro zapisování hodin se přihlaš.'); return; }
  try{
    const { error } = await state.sb.from('time_entry').insert({ job_id:jobId, work_date:iso, hours:eff, user_id:state.session.user.id });
    if(error) throw error;
    await refreshTotals(); renderTable();
  }catch(e){ state.entries[jobId][iso]=curr; renderTable(); showErr(e); }
}

/* -------------------- export -------------------- */
async function exportExcel(){
  if(!window.ExcelJS){ showErr('Chybí ExcelJS'); return; }
  const wb=new ExcelJS.Workbook(); const ws=wb.addWorksheet('Výkaz');

  const days=getDays(); const daysTxt=days.map(d=>fmtHuman(new Date(d)));
  const visible=state.jobs.filter(j=>
      (state.filterClient==='ALL'||String(j.client_id)===String(state.filterClient)) &&
      (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) &&
      jobPassesAssigneeFilter(j)
  );
  const withHours=visible.filter(j=> days.some(d=> (cellValue(j.id,d)||0)>0 ));
  const userName=nameFromEmail(state.session?.user?.email||'');

  ws.addRow([`Uživatel: ${userName}`]);
  ws.addRow([`Týden: ${fmtHuman(state.weekStart)} – ${fmtHuman(addDays(state.weekStart,4))}`]);
  ws.addRow([]);
  ws.addRow(['Klient','Zakázka',...daysTxt]).font={bold:true};

  for(const j of withHours){
    const vals=days.map(d=>cellValue(j.id,d)||0);
    const r=ws.addRow([j.client, j.name, ...vals]);
    for(let i=0;i<vals.length;i++) r.getCell(3+i).numFmt='0.##';
  }
  ws.addRow([]);
  const totals=days.map(d=> withHours.reduce((s,j)=> s+(cellValue(j.id,d)||0),0));
  const sum=ws.addRow(['','Součet', ...totals]); sum.font={bold:true};
  for(let i=0;i<totals.length;i++) sum.getCell(3+i).numFmt='0.##';

  ws.columns=[{width:28},{width:36},...days.map(()=>({width:12}))];

  const safe=(s)=> (s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._ -]/g,'').trim()||'Uzivatel';
  const fileName=`Vykaz_${safe(userName)}_${fmtISO(state.weekStart)}.xlsx`;
  const buf=await wb.xlsx.writeBuffer();
  const blob=new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=fileName; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

/* -------------------- UI build -------------------- */
function buildFilters(){
  const fc=document.getElementById('filterClient'); if(fc){ fc.innerHTML=`<option value="ALL">Všichni klienti</option>`+state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join(''); fc.value=state.filterClient; fc.onchange=e=>{state.filterClient=e.target.value; renderTable();}; }
  const fs=document.getElementById('filterStatus'); if(fs){ fs.innerHTML=`<option value="ALL">Všechny zakázky</option>`+state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join(''); fs.value=state.filterStatus; fs.onchange=e=>{state.filterStatus=e.target.value; renderTable();}; }
  const ts=document.getElementById('totalsScope'); if(ts){ ts.value=state.totalsScope; ts.onchange=async e=>{state.totalsScope=e.target.value; await refreshTotals(); renderTable();}; }

  const btn=document.getElementById('assigneeFilterBtn'); const menu=document.getElementById('assigneeFilterMenu');
  if(btn && menu){
    const setLabel=()=> btn.textContent = state.filterAssignees.length? `Grafik: ${state.filterAssignees.join(', ')}` : 'Grafik: Všichni';
    menu.innerHTML=ASSIGNEE_OPTIONS.map(a=>`<label><input type="checkbox" value="${a}" ${state.filterAssignees.includes(a)?'checked':''}> ${a}</label>`).join('')+`<div class="menuRow"><button class="pill-btn small" id="assClose">Zavřít</button></div>`;
    btn.onclick=(e)=>{ e.stopPropagation(); menu.hidden=!menu.hidden; };
    menu.addEventListener('change',()=>{ state.filterAssignees=[...menu.querySelectorAll('input:checked')].map(i=>i.value); setLabel(); renderTable(); });
    menu.querySelector('#assClose').onclick=()=> menu.hidden=true;
    setLabel();
  }

  const addC=document.getElementById('addClientBtn');
  if(addC){ addC.onclick=async()=>{ const name=document.getElementById('newClientName')?.value?.trim(); if(!name||!state.sb) return; const {error}=await state.sb.from('client').insert({name}); if(error) return showErr(error); document.getElementById('newClientName').value=''; state.clients=await loadClients(); buildFilters(); buildAddRow(); }; }
}
function buildAddRow(){
  const jc=document.getElementById('newJobClient'); if(jc) jc.innerHTML=state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const js=document.getElementById('newJobStatus'); if(js) js.innerHTML=state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  const btn=document.getElementById('addJobBtn');
  if(btn){ btn.onclick=async()=>{ if(!state.sb) return showErr('Přihlášení / DB není k dispozici'); const client_id=jc?.value, name=document.getElementById('newJobName')?.value?.trim(), status_id=+(js?.value||0); if(!client_id||!name||!status_id) return; const {error}=await state.sb.from('job').insert({client_id,name,status_id,assignees:state.newJobAssignees}); if(error) return showErr(error); document.getElementById('newJobName').value=''; await refreshData(); }; }
}

/* -------------------- refresh -------------------- */
async function refreshTotals(){ state.totalsAll = await loadTotalsAll(state.jobs.map(j=>j.id)); }
async function refreshData(){
  try{
    setWeekLabel();
    if(state.sb){
      [state.clients, state.statuses, state.jobs] = await Promise.all([loadClients(), loadStatuses(), loadJobs()]);
      state.entries = await loadEntriesMine();
      await refreshTotals();
    }
    buildFilters(); buildAddRow(); renderTable();
  }catch(e){ showErr(e); }
}

/* -------------------- boot -------------------- */
window.addEventListener('DOMContentLoaded', async ()=>{
  setWeekLabel();
  wireWeekArrows();
  wireDrawer();

  // export
  const ex=document.getElementById('exportXlsx'); if(ex) ex.onclick=exportExcel;

  await sbInit();       // nespustí-li se, UI i tak žije
  await refreshData();  // zkusíme načíst, ale renderujeme i bez SB
});
