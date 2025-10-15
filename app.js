import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const STEP = 0.5
const state = { sb:null, session:null, weekStart: startOfISOWeek(new Date()),
  clients:[], statuses:[], jobs:[], entries:{}, totalsAll:{}, filterClient:'ALL', filterStatus:'ALL', totalsScope:'ALL' }

function startOfISOWeek(d){ const dt=new Date(d); const wd=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-wd); dt.setHours(0,0,0,0); return dt }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }
function round05(x){ return Math.round(x*2)/2 }
function formatNum(x){ return (x%1===0)? String(x): x.toFixed(1) }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"\'":'&#39;'}[m])) }
function showErr(msg){ console.error(msg); const e=document.getElementById('err'); if(!e) return; e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none', 7000) }

async function loadConfig(){
  try{ const r=await fetch('./config.json?v=12',{cache:'no-store'}); if(r.ok){ const j=await r.json(); if(j.supabaseUrl&&j.supabaseAnonKey) return j } }catch{}
  const supabaseUrl = localStorage.getItem('vp.supabaseUrl')
  const supabaseAnonKey = localStorage.getItem('vp.supabaseAnonKey')
  if(supabaseUrl && supabaseAnonKey) return { supabaseUrl, supabaseAnonKey }
  throw new Error('Chybí konfigurace Supabase.')
}
async function init(){
  const cfg = await loadConfig()
  if(!window.supabase) throw new Error('Knihovna Supabase není načtená.')
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{persistSession:true,autoRefreshToken:true} })
  const { data:{ session } } = await state.sb.auth.getSession()
  state.session = session
  state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; render() })
}

async function ensureProfile(){
  const uid = state.session?.user?.id
  if(!uid) return
  await state.sb.from('app_user').upsert({ id:uid, full_name:state.session.user.email, role:'admin' }, { onConflict:'id' })
}
async function loadClients(){ const {data}=await state.sb.from('client').select('id,name').eq('is_active',true).order('name'); return data||[] }
async function loadStatuses(){ const {data}=await state.sb.from('job_status').select('id,label').order('id'); return data||[] }
async function loadJobs(){
  const {data}=await state.sb.from('job').select('id,name,status_id,client_id, client:client_id (id,name), status:status_id (id,label)').eq('is_active',true).order('name')
  return (data||[]).map(j=>({ id:j.id, name:j.name, client_id:j.client?.id||j.client_id, client:j.client?.name||'', status_id:j.status_id, status:j.status?.label||'' }))
}
async function loadEntriesMine(){
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6))
  const {data}=await state.sb.from('time_entry').select('job_id,work_date,hours,user_id').gte('work_date',from).lte('work_date',to).eq('user_id', state.session.user.id)
  const map={}; for(const r of (data||[])){ map[r.job_id] ??= {}; map[r.job_id][r.work_date] = round05((map[r.job_id][r.work_date]||0) + Number(r.hours||0)) }
  return map
}

async function loadTotalsAll(jobIds){
  if(!jobIds.length) return {}
  if(state.totalsScope === 'ME'){
    const { data, error } = await state.sb.from('time_entry').select('job_id,hours').in('job_id', jobIds).eq('user_id', state.session.user.id)
    if(error){ showErr(error.message); return {} }
    const map={}; for(const r of (data||[])){ map[r.job_id]=(map[r.job_id]||0)+Number(r.hours||0) } return map
  }else{
    const { data:rpcData, error:rpcErr } = await state.sb.rpc('fn_job_totals')
    if(!rpcErr && rpcData){
      const map={}; for(const r of rpcData){ map[r.job_id]=Number(r.sum_hours||0) } return map
    }else{
      const { data, error } = await state.sb.from('time_entry').select('job_id,hours').in('job_id', jobIds)
      if(error){ showErr(error.message); return {} }
      if(!data?.length){ showErr('Souhrn za VŠECHNY uživatele je prázdný – pravděpodobně brání RLS. Přidej RPC fn_job_totals (viz návod).') }
      const map={}; for(const r of (data||[])){ map[r.job_id]=(map[r.job_id]||0)+Number(r.hours||0) } return map
    }
  }
}

function setWeekRangeLabel(){ document.getElementById('weekRange').textContent = `${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}` }
function colorizeStatus(sel){
  sel.classList.remove('is-nova','is-probiha','is-hotovo')
  const txt = (sel.options[sel.selectedIndex]?.text || '').toLowerCase()
  if(txt.includes('nov')) sel.classList.add('is-nova')
  else if(txt.includes('pro') || txt.includes('běh')) sel.classList.add('is-probiha')
  else if(txt.includes('hot')) sel.classList.add('is-hotovo')
}
function getDays(){ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))) }
function cellValue(jobId, dateISO){ return (state.entries[jobId] && state.entries[jobId][dateISO]) ? state.entries[jobId][dateISO] : 0 }

function renderTable(){
  const tbody=document.getElementById('tbody'); if(!tbody) return
  tbody.innerHTML=''
  const days=getDays()
  const visible = state.jobs.filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) && (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
  for(const j of visible){
    const tr=document.createElement('tr'); tr.dataset.job=j.id

    const tdClient=document.createElement('td')
    const clientSel=document.createElement('select'); clientSel.className='pill-select clientSel'
    clientSel.innerHTML = state.clients.map(c=>`<option value="${c.id}" ${c.id===j.client_id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')
    clientSel.onchange=async(e)=>{ await state.sb.from('job').update({client_id:e.target.value}).eq('id', j.id) }
    tdClient.append(clientSel)

    const tdJob=document.createElement('td'); tdJob.className='jobCell'
    const name=document.createElement('input'); name.className='pill-input jobNameIn'; name.value=j.name
    let t=null; name.oninput=(e)=>{ clearTimeout(t); t=setTimeout(async()=>{ await state.sb.from('job').update({name:e.target.value}).eq('id', j.id) }, 250) }
    const st=document.createElement('select'); st.className='pill-select statusSel'
    st.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${s.id===j.status_id?'selected':''}>${escapeHtml(s.label)}</option>`).join('')
    colorizeStatus(st); st.onchange=async(e)=>{ colorizeStatus(st); await state.sb.from('job').update({status_id:parseInt(e.target.value,10)}).eq('id', j.id) }
    const del=document.createElement('button'); del.className='jobDelete'; del.title='Odstranit'; del.textContent='🗑'; del.onclick=()=>deleteJob(j.id)
    tdJob.append(name, st, del)

    tr.append(tdClient, tdJob)

    days.forEach((d,i)=>{
      const td=document.createElement('td'); td.dataset.day=i
      const b=document.createElement('button'); b.className='bubble'; b.textContent='0'
      b.onclick=()=>bump(j.id,d,+STEP); b.oncontextmenu=(e)=>{e.preventDefault(); bump(j.id,d,-STEP)}
      td.append(b); tr.append(td)
    })

    const total=document.createElement('td'); total.className='totalCell'; total.textContent= formatNum(state.totalsAll[j.id]||0)
    tr.append(total)

    tbody.append(tr); updateRow(j.id)
  }
  updateSumRow(visible)
}
try { window.renderTable = renderTable; } catch(e){}

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .bubble`); if(b) b.textContent=formatNum(val) })
  const cum = state.totalsAll[jobId] || 0
  tr.querySelector('.totalCell').textContent = formatNum(cum)
  queueMicrotask(()=>updateSumRow())
}
function updateSumRow(visibleJobs){
  const days=getDays()
  const visible = visibleJobs || state.jobs
  const sums=days.map(d=>visible.reduce((a,j)=>a+cellValue(j.id,d),0))
  const tds = document.querySelectorAll('#sumRow .sumCell')
  tds.forEach((td,i)=>{
    const h = sums[i]||0
    const cls = h<=3 ? 'sumRed' : (h<=6 ? 'sumOrange' : 'sumGreen')
    td.innerHTML = `<span class="sumBubble ${cls}">${formatNum(h)}</span>`
  })
}

async function bump(jobId,dateISO,delta){
  try{
    const current = cellValue(jobId,dateISO)
    const next = Math.max(0, round05(current + delta))
    const eff = round05(next - current)
    if (eff === 0) return
    state.entries[jobId] ??= {}; state.entries[jobId][dateISO] = next
    updateRow(jobId)
    const payload = { job_id: jobId, work_date: dateISO, hours: eff, user_id: state.session.user.id }
    const { error } = await state.sb.from('time_entry').insert(payload)
    if(error){ state.entries[jobId][dateISO] = current; updateRow(jobId); return showErr(error.message) }
    // refresh cumulative for this job according to scope
    if(state.totalsScope==='ALL'){
      const { data:rpcData, error:rpcErr } = await state.sb.rpc('fn_job_totals')
      if(!rpcErr && rpcData){
        const row = rpcData.find(r=>r.job_id===jobId)
        if(row){ state.totalsAll[jobId]=Number(row.sum_hours||0); updateRow(jobId); return }
      }
      const { data } = await state.sb.from('time_entry').select('hours').eq('job_id', jobId)
      state.totalsAll[jobId] = (data||[]).reduce((a,r)=>a+Number(r.hours||0),0)
    }else{
      const { data } = await state.sb.from('time_entry').select('hours').eq('job_id', jobId).eq('user_id', state.session.user.id)
      state.totalsAll[jobId] = (data||[]).reduce((a,r)=>a+Number(r.hours||0),0)
    }
    updateRow(jobId)
  }catch(e){ showErr(e.message||e) }
}
async function deleteJob(jobId){
  if(!confirm('Opravdu odstranit zakázku? (Bude skryta)')) return
  await state.sb.from('job').update({ is_active:false }).eq('id', jobId)
  state.jobs = await loadJobs(); await refreshTotals(); renderTable()
}

async function exportExcel(){
  const days = [0,1,2,3,4].map(i=>addDays(state.weekStart,i))
  const daysTxt = days.map(d => dayjs(d).format('D. M. YYYY'))
  const visible = state.jobs.filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) && (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Výkaz')
  const user = state.session?.user?.email || ''
  const rangeText = `${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`
  ws.addRow([`Uživatel: ${user}`]); ws.addRow([`Týden: ${rangeText}`]); ws.addRow([])
  const header = ['Klient','Zakázka', ...daysTxt]; ws.addRow(header); ws.getRow(4).font = { bold:true }
  for(let i=3;i<=7;i++){ ws.getColumn(i).alignment = { horizontal:'right' } }
  for(const j of visible){ const vals = days.map(d => cellValue(j.id, dayjs(d).format('YYYY-MM-DD'))); ws.addRow([j.client, j.name, ...vals]) }
  const daySums = days.map(d => visible.reduce((acc,job)=> acc + cellValue(job.id, dayjs(d).format('YYYY-MM-DD')), 0))
  ws.addRow(['Součet za den','', ...daySums])
  ws.columns.forEach((col, idx) => { col.width = idx<3 ? 22 : 14 })
  const buf = await wb.xlsx.writeBuffer()
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=`vykaz-${dayjs(state.weekStart).format('YYYY-MM-DD')}.xlsx`; a.click()
}

async function refreshTotals(){ const visibleJobIds = state.jobs.map(j=>j.id); state.totalsAll = await loadTotalsAll(visibleJobIds) }
async function refreshData(){ state.entries = {}; const mine = await loadEntriesMine(); state.entries = mine; await refreshTotals(); renderTable() }

function setWeekHandlers(){
  document.getElementById('prevWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); setWeekRangeLabel(); refreshData() }
  document.getElementById('nextWeek').onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); setWeekRangeLabel(); refreshData() }
  document.getElementById('exportXlsx').onclick=exportExcel
}
async function buildShell(){
  setWeekHandlers()
  const fClient=document.getElementById('filterClient')
  fClient.innerHTML = `<option value="ALL">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  fClient.value = state.filterClient
  fClient.onchange=(e)=>{ state.filterClient=e.target.value; renderTable() }

  const fStat=document.getElementById('filterStatus')
  fStat.innerHTML = `<option value="ALL">Všechny zakázky</option>` + state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  fStat.value = state.filterStatus
  fStat.onchange=(e)=>{ state.filterStatus=e.target.value; renderTable() }

  const scope=document.getElementById('totalsScope')
  scope.value = state.totalsScope
  scope.onchange = async (e)=>{ state.totalsScope = e.target.value; await refreshTotals(); renderTable() }

  const jobClient=document.getElementById('newJobClient')
  jobClient.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  const jobStatus=document.getElementById('newJobStatus')
  jobStatus.innerHTML = state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  colorizeStatus(jobStatus); jobStatus.onchange=()=>colorizeStatus(jobStatus)

  document.getElementById('addClientBtn').onclick=async()=>{
    const name=document.getElementById('newClientName').value.trim()
    if(!name) return showErr('Zadej název klienta')
    const {error}=await state.sb.from('client').insert({name})
    if(error) return showErr(error.message)
    document.getElementById('newClientName').value=''
    state.clients=await loadClients(); await buildShell()
  }
  document.getElementById('addJobBtn').onclick=async()=>{
    const name=document.getElementById('newJobName').value.trim()
    if(!name) return showErr('Zadej název zakázky')
    const client_id=document.getElementById('newJobClient').value
    const status_id=parseInt(document.getElementById('newJobStatus').value,10)
    const {error}=await state.sb.from('job').insert({ client_id, name, status_id })
    if(error) return showErr(error.message)
    document.getElementById('newJobName').value=''
    state.jobs=await loadJobs(); await refreshTotals(); renderTable()
  }

  setWeekRangeLabel()
  renderTable()
}

async function render(){
  const box=document.getElementById('userBoxTopRight'); box.innerHTML=''
  if(!state.session){
    const b=document.createElement('button'); b.className='pill-btn'; b.textContent='Přihlásit'; b.onclick=showLogin; box.append(b)
  }else{
    const email=document.createElement('span'); email.className='badge'; email.textContent=state.session.user.email
    const out=document.createElement('button'); out.className='pill-btn'; out.textContent='Odhlásit'; out.onclick=async()=>{ await state.sb.auth.signOut() }
    box.append(email,out)
  }

  const app=document.getElementById('app')
  if(!state.session){ app.querySelector('.filters')?.remove(); app.querySelector('.addRow')?.remove(); app.querySelector('.tableWrap')?.remove(); return showLogin() }
  await ensureProfile()
  state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();
  await buildShell(); await refreshData()
}

function showLogin(){
  const app=document.getElementById('app')
  app.innerHTML = `<div class="card" style="max-width:600px;margin:0 auto;text-align:center">
    <div style="display:inline-flex;gap:8px">
      <input id="email" class="pill-input" type="email" placeholder="name@example.com" style="width:260px">
      <button id="send" class="pill-btn">Poslat přihlašovací odkaz</button>
    </div>
  </div>`
  document.getElementById('send').onclick = async ()=>{
    const email = document.getElementById('email').value.trim()
    if(!email) return showErr('Zadej e-mail')
    const { error } = await state.sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: window.location.origin + window.location.pathname + 'index.html' } })
    if(error) return showErr(error.message)
    alert('Zkontroluj e-mail.')
  }
}

init().then(render).catch(showErr)
