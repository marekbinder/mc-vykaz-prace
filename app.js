{\rtf1\ansi\ansicpg1250\cocoartf2865
\cocoatextscaling0\cocoaplatform0{\fonttbl\f0\fswiss\fcharset0 Helvetica;}
{\colortbl;\red255\green255\blue255;}
{\*\expandedcolortbl;;}
\paperw11900\paperh16840\margl1440\margr1440\vieww11520\viewh8400\viewkind0
\pard\tx566\tx1133\tx1700\tx2267\tx2834\tx3401\tx3968\tx4535\tx5102\tx5669\tx6236\tx6803\pardirnatural\partightenfactor0

\f0\fs24 \cf0 import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'\
\
const ASSIGNEE_OPTIONS = ['Viki','Standa','Marek']\
const STEP = 0.5\
const state = \{ sb:null, session:null, weekStart: startOfISOWeek(new Date()),\
  clients:[], statuses:[], jobs:[], entries:\{\}, totalsAll:\{\},\
  filterClient:'ALL', filterStatus:'ALL', totalsScope:'ALL',\
  filterAssignees: [], newJobAssignees: []\
\}\
\
function startOfISOWeek(d)\{ const dt=new Date(d); const wd=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-wd); dt.setHours(0,0,0,0); return dt \}\
function fmtDate(d)\{ return dayjs(d).format('YYYY-MM-DD') \}\
function addDays(d,n)\{ const x=new Date(d); x.setDate(x.getDate()+n); return x \}\
function round05(x)\{ return Math.round(x*2)/2 \}\
function formatNum(x)\{ return (x%1===0)? String(x): x.toFixed(1) \}\
function escapeHtml(s)\{ return String(s).replace(/[&<>"']/g, m => (\{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"\\\\'":'&#39;'\}[m])) \}\
function showErr(msg)\{ console.error(msg); const e=document.getElementById('err'); if(!e) return; e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none', 7000) \}\
\
async function loadConfig()\{\
  try\{ const r=await fetch('./config.json?v=13.1',\{cache:'no-store'\}); if(r.ok)\{ const j=await r.json(); if(j.supabaseUrl&&j.supabaseAnonKey) return j \} \}catch\{\}\
  const supabaseUrl = localStorage.getItem('vp.supabaseUrl')\
  const supabaseAnonKey = localStorage.getItem('vp.supabaseAnonKey')\
  if(supabaseUrl && supabaseAnonKey) return \{ supabaseUrl, supabaseAnonKey \}\
  throw new Error('Chyb\'ed konfigurace Supabase.')\
\}\
async function init()\{\
  const cfg = await loadConfig()\
  if(!window.supabase) throw new Error('Knihovna Supabase nen\'ed na\uc0\u269 ten\'e1.')\
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, \{ auth:\{persistSession:true,autoRefreshToken:true\} \})\
  const \{ data:\{ session \} \} = await state.sb.auth.getSession()\
  state.session = session\
  state.sb.auth.onAuthStateChange((_e,s)=>\{ state.session=s; render() \})\
\}\
\
async function ensureProfile()\{\
  const uid = state.session?.user?.id\
  if(!uid) return\
  await state.sb.from('app_user').upsert(\{ id:uid, full_name:state.session.user.email, role:'admin' \}, \{ onConflict:'id' \})\
\}\
async function loadClients()\{ const \{data\}=await state.sb.from('client').select('id,name').eq('is_active',true).order('name'); return data||[] \}\
async function loadStatuses()\{ const \{data\}=await state.sb.from('job_status').select('id,label').order('id'); return data||[] \}\
async function loadJobs()\{\
  const \{data\}=await state.sb.from('job').select('id,name,status_id,client_id,assignees, client:client_id (id,name), status:status_id (id,label)').eq('is_active',true).order('name')\
  return (data||[]).map(j=>(\{ id:j.id, name:j.name, client_id:j.client?.id||j.client_id, client:j.client?.name||'', status_id:j.status_id, status:j.status?.label||'', assignees: j.assignees || [] \}))\
\}\
async function loadEntriesMine()\{\
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6))\
  const \{data\}=await state.sb.from('time_entry').select('job_id,work_date,hours,user_id').gte('work_date',from).lte('work_date',to).eq('user_id', state.session.user.id)\
  const map=\{\}; for(const r of (data||[]))\{ map[r.job_id] ??= \{\}; map[r.job_id][r.work_date] = round05((map[r.job_id][r.work_date]||0) + Number(r.hours||0)) \}\
  return map\
\}\
async function loadTotalsAll(jobIds)\{\
  if(!jobIds.length) return \{\}\
  if(state.totalsScope === 'ME')\{\
    const \{ data, error \} = await state.sb.from('time_entry').select('job_id,hours').in('job_id', jobIds).eq('user_id', state.session.user.id)\
    if(error)\{ showErr(error.message); return \{\} \}\
    const map=\{\}; for(const r of (data||[]))\{ map[r.job_id]=(map[r.job_id]||0)+Number(r.hours||0) \} return map\
  \}else\{\
    const \{ data:rpcData, error:rpcErr \} = await state.sb.rpc('fn_job_totals')\
    if(!rpcErr && rpcData)\{\
      const map=\{\}; for(const r of rpcData)\{ map[r.job_id]=Number(r.sum_hours||0) \} return map\
    \}else\{\
      const \{ data, error \} = await state.sb.from('time_entry').select('job_id,hours').in('job_id', jobIds)\
      if(error)\{ showErr(error.message); return \{\} \}\
      if(!data?.length)\{ showErr('Souhrn za V\'8aECHNY u\'9eivatele je pr\'e1zdn\'fd \'96 pravd\uc0\u283 podobn\u283  br\'e1n\'ed RLS. P\u345 idej RPC fn_job_totals (viz n\'e1vod).') \}\
      const map=\{\}; for(const r of (data||[]))\{ map[r.job_id]=(map[r.job_id]||0)+Number(r.hours||0) \} return map\
    \}\
  \}\
\}\
function setWeekRangeLabel()\{ document.getElementById('weekRange').textContent = `$\{dayjs(state.weekStart).format('D. M. YYYY')\} \'96 $\{dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')\}` \}\
function colorizeStatus(sel)\{\
  sel.classList.remove('is-nova','is-probiha','is-hotovo')\
  const txt = (sel.options[sel.selectedIndex]?.text || '').toLowerCase()\
  if(txt.includes('nov')) sel.classList.add('is-nova')\
  else if(txt.includes('pro') || txt.includes('b\uc0\u283 h')) sel.classList.add('is-probiha')\
  else if(txt.includes('hot')) sel.classList.add('is-hotovo')\
\}\
function getDays()\{ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))) \}\
function cellValue(jobId, dateISO)\{ return (state.entries[jobId] && state.entries[jobId][dateISO]) ? state.entries[jobId][dateISO] : 0 \}\
\
/* ----- assignees helpers ----- */\
function renderAssigneeLabel(arr)\{\
  if(!arr || !arr.length) return 'nikdo'\
  if(arr.length===1) return arr[0]\
  return `$\{arr[0]\} +$\{arr.length-1\}`\
\}\
function toggleMenu(btn, menu)\{\
  const show = menu.hasAttribute('hidden')\
  document.querySelectorAll('.menu').forEach(m=>m.setAttribute('hidden',''))\
  if(show)\{ menu.removeAttribute('hidden') \}\
\}\
function collectMenuChecked(menu)\{ return Array.from(menu.querySelectorAll('input[type="checkbox"]:checked')).map(i=>i.value) \}\
function setMenuChecked(menu, values)\{\
  const set = new Set(values||[])\
  menu.querySelectorAll('input[type="checkbox"]').forEach(i=>\{ i.checked = set.has(i.value) \})\
\}\
function jobPassesAssigneeFilter(job)\{\
  if(!state.filterAssignees.length) return true\
  const set = new Set(job.assignees||[])\
  return state.filterAssignees.some(x=>set.has(x))\
\}\
\
/* ----- render table ----- */\
function renderTable()\{\
  const tbody=document.getElementById('tbody'); if(!tbody) return\
  tbody.innerHTML=''\
  const days=getDays()\
  const visible = state.jobs\
    .filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) )\
    .filter(j=> (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )\
    .filter(j=> jobPassesAssigneeFilter(j))\
\
  for(const j of visible)\{\
    const tr=document.createElement('tr'); tr.dataset.job=j.id\
\
    const tdClient=document.createElement('td')\
    const clientSel=document.createElement('select'); clientSel.className='pill-select clientSel'\
    clientSel.innerHTML = state.clients.map(c=>`<option value="$\{c.id\}" $\{c.id===j.client_id?'selected':''\}>$\{escapeHtml(c.name)\}</option>`).join('')\
    clientSel.onchange=async(e)=>\{ await state.sb.from('job').update(\{client_id:e.target.value\}).eq('id', j.id) \}\
    tdClient.append(clientSel)\
\
    const tdJob=document.createElement('td'); tdJob.className='jobCell'\
    const name=document.createElement('input'); name.className='pill-input jobNameIn'; name.value=j.name\
    let t=null; name.oninput=(e)=>\{ clearTimeout(t); t=setTimeout(async()=>\{ await state.sb.from('job').update(\{name:e.target.value\}).eq('id', j.id) \}, 250) \}\
    const st=document.createElement('select'); st.className='pill-select statusSel'\
    st.innerHTML = state.statuses.map(s=>`<option value="$\{s.id\}" $\{s.id===j.status_id?'selected':''\}>$\{escapeHtml(s.label)\}</option>`).join('')\
    colorizeStatus(st); st.onchange=async(e)=>\{ colorizeStatus(st); await state.sb.from('job').update(\{status_id:parseInt(e.target.value,10)\}).eq('id', j.id) \}\
    const del=document.createElement('button'); del.className='jobDelete'; del.title='Odstranit'; del.textContent='\uc0\u55357 \u56785 '; del.onclick=()=>deleteJob(j.id)\
\
    // \'84Grafik\'93\
    const btn=document.createElement('button'); btn.className='assigneePill'; btn.type='button'\
    const label=document.createElement('span'); label.textContent='Grafik: '+renderAssigneeLabel(j.assignees)\
    btn.append(label)\
\
    const menu=document.createElement('div'); menu.className='menu assigneeMenu'; menu.hidden=true\
    ASSIGNEE_OPTIONS.forEach(opt=>\{\
      const lab=document.createElement('label'); const inp=document.createElement('input'); inp.type='checkbox'; inp.value=opt\
      lab.append(inp, document.createTextNode(' '+opt)); menu.append(lab)\
    \})\
    const row=document.createElement('div'); row.className='menuRow'\
    const clearB=document.createElement('button'); clearB.className='pill-btn small'; clearB.type='button'; clearB.textContent='Vymazat'\
    const closeB=document.createElement('button'); closeB.className='pill-btn small'; closeB.type='button'; closeB.textContent='Zav\uc0\u345 \'edt'\
    row.append(clearB, closeB); menu.append(row)\
\
    btn.addEventListener('click', ()=>\{ setMenuChecked(menu, j.assignees); toggleMenu(btn, menu) \})\
    clearB.addEventListener('click', async ()=>\{ j.assignees=[]; setMenuChecked(menu, j.assignees); label.textContent='Grafik: '+renderAssigneeLabel(j.assignees); await state.sb.from('job').update(\{assignees: j.assignees\}).eq('id', j.id); renderTable() \})\
    closeB.addEventListener('click', ()=> menu.hidden=true)\
    menu.addEventListener('change', async ()=>\{\
      j.assignees = collectMenuChecked(menu)\
      label.textContent = 'Grafik: '+renderAssigneeLabel(j.assignees)\
      await state.sb.from('job').update(\{assignees: j.assignees\}).eq('id', j.id)\
      renderTable()\
    \})\
\
    tdJob.append(name, st, btn, del, menu)\
\
    getDays().forEach((d,i)=>\{\
      const td=document.createElement('td'); td.dataset.day=i\
      const b=document.createElement('button'); b.className='bubble'; b.textContent='0'\
      b.onclick=()=>bump(j.id,d,+STEP); b.oncontextmenu=(e)=>\{e.preventDefault(); bump(j.id,d,-STEP)\}\
      td.append(b); tr.append(td)\
    \})\
\
    const total=document.createElement('td'); total.className='totalCell'; total.textContent= formatNum(state.totalsAll[j.id]||0)\
    tr.append(total)\
\
    tbody.append(tr); updateRow(j.id)\
  \}\
  updateSumRow(visible)\
\}\
try \{ window.renderTable = renderTable; \} catch(e)\{\}\
\
function updateRow(jobId)\{\
  const days=getDays(); const tr=document.querySelector(`tr[data-job="$\{jobId\}"]`); if(!tr) return\
  days.forEach((d,i)=>\{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="$\{i\}"] .bubble`); if(b) b.textContent=formatNum(val) \})\
  const cum = state.totalsAll[jobId] || 0\
  tr.querySelector('.totalCell').textContent = formatNum(cum)\
  queueMicrotask(()=>updateSumRow())\
\}\
function updateSumRow(visibleJobs)\{\
  const days=getDays()\
  const visible = visibleJobs || state.jobs\
  const sums=days.map(d=>visible.reduce((a,j)=>a+cellValue(j.id,d),0))\
  const tds = document.querySelectorAll('#sumRow .sumCell')\
  tds.forEach((td,i)=>\{\
    const h = sums[i]||0\
    const cls = h<=3 ? 'sumRed' : (h<=6 ? 'sumOrange' : 'sumGreen')\
    td.innerHTML = `<span class="sumBubble $\{cls\}">$\{formatNum(h)\}</span>`\
  \})\
\}\
\
async function bump(jobId,dateISO,delta)\{\
  try\{\
    const current = cellValue(jobId,dateISO)\
    const next = Math.max(0, round05(current + delta))\
    const eff = round05(next - current)\
    if (eff === 0) return\
    state.entries[jobId] ??= \{\}; state.entries[jobId][dateISO] = next\
    updateRow(jobId)\
    const payload = \{ job_id: jobId, work_date: dateISO, hours: eff, user_id: state.session.user.id \}\
    const \{ error \} = await state.sb.from('time_entry').insert(payload)\
    if(error)\{ state.entries[jobId][dateISO] = current; updateRow(jobId); return showErr(error.message) \}\
    if(state.totalsScope==='ALL')\{\
      const \{ data:rpcData, error:rpcErr \} = await state.sb.rpc('fn_job_totals')\
      if(!rpcErr && rpcData)\{\
        const row = rpcData.find(r=>r.job_id===jobId)\
        if(row)\{ state.totalsAll[jobId]=Number(row.sum_hours||0); updateRow(jobId); return \}\
      \}\
      const \{ data \} = await state.sb.from('time_entry').select('hours').eq('job_id', jobId)\
      state.totalsAll[jobId] = (data||[]).reduce((a,r)=>a+Number(r.hours||0),0)\
    \}else\{\
      const \{ data \} = await state.sb.from('time_entry').select('hours').eq('job_id', jobId).eq('user_id', state.session.user.id)\
      state.totalsAll[jobId] = (data||[]).reduce((a,r)=>a+Number(r.hours||0),0)\
    \}\
    updateRow(jobId)\
  \}catch(e)\{ showErr(e.message||e) \}\
\}\
async function deleteJob(jobId)\{\
  if(!confirm('Opravdu odstranit zak\'e1zku? (Bude skryta)')) return\
  await state.sb.from('job').update(\{ is_active:false \}).eq('id', jobId)\
  state.jobs = await loadJobs(); await refreshTotals(); renderTable()\
\}\
\
async function exportExcel()\{\
  const days = [0,1,2,3,4].map(i=>addDays(state.weekStart,i))\
  const daysISO = days.map(d => dayjs(d).format('YYYY-MM-DD'))\
  const daysTxt = days.map(d => dayjs(d).format('D. M. YYYY'))\
\
  const visible = state.jobs\
    .filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) )\
    .filter(j=> (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )\
\
  const withHours = visible.filter(j => daysISO.some(d => cellValue(j.id, d) > 0))\
\
  const wb = new ExcelJS.Workbook()\
  const ws = wb.addWorksheet('V\'fdkaz')\
  const user = state.session?.user?.email || ''\
  const rangeText = `$\{dayjs(state.weekStart).format('D. M. YYYY')\} \'96 $\{dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')\}`\
  ws.addRow([`U\'9eivatel: $\{user\}`]); ws.addRow([`T\'fdden: $\{rangeText\}`]); ws.addRow([])\
  const header = ['Klient','Zak\'e1zka', ...daysTxt]; ws.addRow(header); ws.getRow(4).font = \{ bold:true \}\
  for(let i=3;i<=7;i++)\{ ws.getColumn(i).alignment = \{ horizontal:'right' \} \}\
\
  for(const j of withHours)\{\
    const vals = daysISO.map(d => cellValue(j.id, d))\
    ws.addRow([j.client, j.name, ...vals])\
  \}\
\
  const daySums = daysISO.map(d => withHours.reduce((acc,job)=> acc + cellValue(job.id, d), 0))\
  ws.addRow(['Sou\uc0\u269 et za den','', ...daySums])\
\
  ws.columns.forEach((col, idx) => \{ col.width = idx<3 ? 22 : 14 \})\
  const buf = await wb.xlsx.writeBuffer()\
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],\{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'\})); a.download=`vykaz-$\{dayjs(state.weekStart).format('YYYY-MM-DD')\}.xlsx`; a.click()\
\}\
\
async function refreshTotals()\{ const visibleJobIds = state.jobs.map(j=>j.id); state.totalsAll = await loadTotalsAll(visibleJobIds) \}\
async function refreshData()\{ state.entries = \{\}; const mine = await loadEntriesMine(); state.entries = mine; await refreshTotals(); renderTable() \}\
\
function setWeekHandlers()\{\
  document.getElementById('prevWeek').onclick=()=>\{ state.weekStart=addDays(state.weekStart,-7); setWeekRangeLabel(); refreshData() \}\
  document.getElementById('nextWeek').onclick=()=>\{ state.weekStart=addDays(state.weekStart, 7); setWeekRangeLabel(); refreshData() \}\
  document.getElementById('exportXlsx').onclick=exportExcel\
\}\
async function buildShell()\{\
  setWeekHandlers()\
  const fClient=document.getElementById('filterClient')\
  fClient.innerHTML = `<option value="ALL">V\'9aichni klienti</option>` + state.clients.map(c=>`<option value="$\{c.id\}">$\{escapeHtml(c.name)\}</option>`).join('')\
  fClient.value = state.filterClient\
  fClient.onchange=(e)=>\{ state.filterClient=e.target.value; renderTable() \}\
\
  const fStat=document.getElementById('filterStatus')\
  fStat.innerHTML = `<option value="ALL">V\'9aechny zak\'e1zky</option>` + state.statuses.map(s=>`<option value="$\{s.id\}">$\{escapeHtml(s.label)\}</option>`).join('')\
  fStat.value = state.filterStatus\
  fStat.onchange=(e)=>\{ state.filterStatus=e.target.value; renderTable() \}\
\
  const scope=document.getElementById('totalsScope')\
  scope.value = state.totalsScope\
  scope.onchange = async (e)=>\{ state.totalsScope = e.target.value; await refreshTotals(); renderTable() \}\
\
  // filtr \'84Grafik\'93\
  const assBtn = document.getElementById('assigneeFilterBtn')\
  const assMenu = document.getElementById('assigneeFilterMenu')\
  const assClear = document.getElementById('assigneeFilterClear')\
  const assClose = document.getElementById('assigneeFilterClose')\
\
  assBtn.onclick = () => \{\
    ;[...assMenu.querySelectorAll('input[type="checkbox"]')].forEach(ch=> ch.checked = state.filterAssignees.includes(ch.value))\
    toggleMenu(assBtn, assMenu)\
  \}\
  assMenu.onchange = () => \{\
    state.filterAssignees = [...assMenu.querySelectorAll('input:checked')].map(i=>i.value)\
    assBtn.textContent = state.filterAssignees.length ? `Grafik: $\{state.filterAssignees.join(', ')\}` : 'Grafik: V\'9aichni'\
    renderTable()\
  \}\
  assClear.onclick = () => \{\
    state.filterAssignees = []\
    assBtn.textContent = 'Grafik: V\'9aichni'\
    assMenu.querySelectorAll('input[type="checkbox"]').forEach(i=>i.checked=false)\
    renderTable()\
  \}\
  assClose.onclick = () => assMenu.hidden = true\
\
  // \'84Grafik\'93 u nov\'e9 zak\'e1zky\
  const assNewBtn = document.getElementById('assigneesNewBtn')\
  const assNewMenu = document.getElementById('assigneesNewMenu')\
  const assNewClear = document.getElementById('assigneesNewClear')\
  const assNewClose = document.getElementById('assigneesNewClose')\
\
  assNewBtn.onclick = () => \{\
    assNewMenu.querySelectorAll('input[type="checkbox"]').forEach(ch=> ch.checked = state.newJobAssignees.includes(ch.value))\
    toggleMenu(assNewBtn, assNewMenu)\
  \}\
  assNewMenu.onchange = () => \{\
    state.newJobAssignees = [...assNewMenu.querySelectorAll('input:checked')].map(i=>i.value)\
    assNewBtn.textContent = 'Grafik: ' + (state.newJobAssignees.length ? renderAssigneeLabel(state.newJobAssignees) : 'nikdo')\
  \}\
  assNewClear.onclick = () => \{\
    state.newJobAssignees = []\
    assNewMenu.querySelectorAll('input[type="checkbox"]').forEach(i=>i.checked=false)\
    assNewBtn.textContent = 'Grafik: nikdo'\
  \}\
  assNewClose.onclick = () => assNewMenu.hidden = true\
\
  const jobClient=document.getElementById('newJobClient')\
  jobClient.innerHTML = state.clients.map(c=>`<option value="$\{c.id\}">$\{escapeHtml(c.name)\}</option>`).join('')\
  const jobStatus=document.getElementById('newJobStatus')\
  jobStatus.innerHTML = state.statuses.map(s=>`<option value="$\{s.id\}">$\{escapeHtml(s.label)\}</option>`).join('')\
  colorizeStatus(jobStatus); jobStatus.onchange=()=>colorizeStatus(jobStatus)\
\
  document.getElementById('addClientBtn').onclick=async()=>\{\
    const name=document.getElementById('newClientName').value.trim()\
    if(!name) return showErr('Zadej n\'e1zev klienta')\
    const \{error\}=await state.sb.from('client').insert(\{name\})\
    if(error) return showErr(error.message)\
    document.getElementById('newClientName').value=''\
    state.clients=await loadClients(); await buildShell()\
  \}\
  document.getElementById('addJobBtn').onclick=async()=>\{\
    const name=document.getElementById('newJobName').value.trim()\
    if(!name) return showErr('Zadej n\'e1zev zak\'e1zky')\
    const client_id=document.getElementById('newJobClient').value\
    const status_id=parseInt(document.getElementById('newJobStatus').value,10)\
    const assignees = state.newJobAssignees.slice()\
    const \{error\}=await state.sb.from('job').insert(\{ client_id, name, status_id, assignees \})\
    if(error) return showErr(error.message)\
    document.getElementById('newJobName').value=''\
    state.newJobAssignees = []\
    document.getElementById('assigneesNewBtn').textContent = 'Grafik: nikdo'\
    state.jobs=await loadJobs(); await refreshTotals(); renderTable()\
  \}\
\
  setWeekRangeLabel()\
  renderTable()\
\}\
\
async function render()\{\
  const box=document.getElementById('userBoxTopRight'); box.innerHTML=''\
  if(!state.session)\{\
    const b=document.createElement('button'); b.className='pill-btn'; b.textContent='P\uc0\u345 ihl\'e1sit'; b.onclick=showLogin; box.append(b)\
  \}else\{\
    const email=document.createElement('span'); email.className='badge'; email.textContent=state.session.user.email\
    const out=document.createElement('button'); out.className='pill-btn'; out.textContent='Odhl\'e1sit'; out.onclick=async()=>\{ await state.sb.auth.signOut() \}\
    box.append(email,out)\
  \}\
\
  const app=document.getElementById('app')\
  if(!state.session)\{ app.querySelector('.filters')?.remove(); app.querySelector('.addRow')?.remove(); app.querySelector('.tableWrap')?.remove(); return showLogin() \}\
  await ensureProfile()\
  state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();\
  await buildShell(); await refreshData()\
\}\
\
function showLogin()\{\
  const app=document.getElementById('app')\
  app.innerHTML = `<div class="card" style="max-width:600px;margin:0 auto;text-align:center">\
    <div style="display:inline-flex;gap:8px">\
      <input id="email" class="pill-input" type="email" placeholder="name@example.com" style="width:260px">\
      <button id="send" class="pill-btn">Poslat p\uc0\u345 ihla\'9aovac\'ed odkaz</button>\
    </div>\
  </div>`\
  document.getElementById('send').onclick = async ()=>\{\
    const email = document.getElementById('email').value.trim()\
    if(!email) return showErr('Zadej e-mail')\
    const \{ error \} = await state.sb.auth.signInWithOtp(\{ email, options:\{ emailRedirectTo: window.location.origin + window.location.pathname + 'index.html' \} \})\
    if(error) return showErr(error.message)\
    alert('Zkontroluj e-mail.')\
  \}\
\}\
\
init().then(render).catch(showErr)\
}