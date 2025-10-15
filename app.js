import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const STEP = 0.5
const state = { sb:null, session:null, weekStart: startOfISOWeek(new Date()),
  clients:[], statuses:[], jobs:[], entries:{}, totalsAllJobsAllTime:{}, filterClient:'ALL', filterStatus:'ALL' }

function showErr(msg){ console.error(msg); const e=document.getElementById('err'); if(!e) return; e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none', 7000) }
function step(msg){ const app=document.getElementById('app'); const s=document.createElement('div'); s.className='step'; s.textContent=msg; app.append(s) }

function startOfISOWeek(d){ const dt=new Date(d); const wd=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-wd); dt.setHours(0,0,0,0); return dt }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }
function round05(x){ return Math.round(x*2)/2 }

async function tryLoadConfigFile(){
  try{
    const r=await fetch('./config.json',{cache:'no-store'})
    if(!r.ok) return null
    const json = await r.json()
    if(!json.supabaseUrl || !json.supabaseAnonKey) return null
    return json
  }catch{ return null }
}
function tryLoadConfigFromLocal(){
  const supabaseUrl = localStorage.getItem('vp.supabaseUrl')
  const supabaseAnonKey = localStorage.getItem('vp.supabaseAnonKey')
  if(supabaseUrl && supabaseAnonKey) return { supabaseUrl, supabaseAnonKey }
  return null
}
function renderConfigForm(){
  const app=document.getElementById('app')
  app.innerHTML = `<div class="card"><h3>Není nastavená konfigurace</h3>
  <p>Buď nahraj <code>config.json</code> do kořene repa, nebo vlož hodnoty sem:</p>
  <div style="display:flex;flex-direction:column;gap:10px;max-width:700px">
    <input id="u" class="pill-input" placeholder="supabaseUrl (https://xxxx.supabase.co)">
    <input id="k" class="pill-input" placeholder="supabaseAnonKey (dlouhý řetězec)">
    <div style="display:flex;gap:10px">
      <button id="save" class="pill-btn">Uložit a pokračovat</button>
      <button id="clear" class="pill-btn">Smazat uložené</button>
    </div>
  </div></div>`
  document.getElementById('save').onclick=()=>{
    const u=document.getElementById('u').value.trim()
    const k=document.getElementById('k').value.trim()
    if(!u||!k) return showErr('Doplň obě hodnoty.')
    localStorage.setItem('vp.supabaseUrl',u)
    localStorage.setItem('vp.supabaseAnonKey',k)
    location.reload()
  }
  document.getElementById('clear').onclick=()=>{
    localStorage.removeItem('vp.supabaseUrl'); localStorage.removeItem('vp.supabaseAnonKey'); showErr('Vymazáno. Obnov stránku.')
  }
}

async function initSupabase(){
  step('1/5 – načítám konfiguraci…')
  const cfg = await tryLoadConfigFile() || tryLoadConfigFromLocal()
  if(!cfg){ renderConfigForm(); return false }
  step('2/5 – inicializuji Supabase…')
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{persistSession:true,autoRefreshToken:true} })
  const { data:{ session } } = await state.sb.auth.getSession()
  state.session = session
  state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; render().catch(showErr) })
  return true
}

function userBox(){
  const box=document.getElementById('userBoxTopRight'); box.innerHTML=''
  if(!state.session){
    const b=document.createElement('button'); b.className='pill-btn'; b.textContent='Přihlásit'; b.onclick=showLogin; box.append(b)
  }else{
    const email=document.createElement('span'); email.className='badge'; email.textContent=state.session.user.email
    const out=document.createElement('button'); out.className='pill-btn'; out.textContent='Odhlásit'; out.onclick=async()=>{ await state.sb.auth.signOut() }
    box.append(email,out)
  }
}
function showLogin(){
  const app=document.getElementById('app')
  app.innerHTML = `<div class="card" style="text-align:center">
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

async function ensureProfile(){
  const uid = state.session?.user?.id
  if(!uid) return
  await state.sb.from('app_user').upsert({ id:uid, full_name:state.session.user.email, role:'admin' }, { onConflict:'id' })
}
async function loadClients(){ const {data,error}=await state.sb.from('client').select('id,name').eq('is_active',true).order('name'); if(error) showErr(error); return data||[] }
async function loadStatuses(){ const {data,error}=await state.sb.from('job_status').select('id,label').order('id'); if(error) showErr(error); return data||[] }
async function loadJobs(){
  const {data,error}=await state.sb.from('job').select('id,name,status_id,client_id, client:client_id (id,name), status:status_id (id,label)').eq('is_active',true).order('name')
  if(error) showErr(error)
  return (data||[]).map(j=>({ id:j.id, name:j.name, client_id:j.client?.id||j.client_id, client:j.client?.name||'', status_id:j.status_id, status:j.status?.label||'' }))
}
async function loadEntriesMine(){
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6))
  const {data,error}=await state.sb.from('time_entry').select('job_id,work_date,hours,user_id').gte('work_date',from).lte('work_date',to).eq('user_id', state.session.user.id)
  if(error) showErr(error)
  const map={}; for(const r of (data||[])){ map[r.job_id] ??= {}; map[r.job_id][r.work_date] = round05((map[r.job_id][r.work_date]||0) + Number(r.hours||0)) }
  return map
}
async function loadTotalsAllUsersAllTime(){
  const { data, error } = await state.sb.from('time_entry').select('job_id,hours')
  if(error){ showErr('Nelze načíst týmové součty – pravděpodobně RLS. Aplikace poběží i bez nich.'); return {} }
  const totals = {}; for(const r of (data||[])){ totals[r.job_id] = round05((totals[r.job_id]||0) + Number(r.hours||0)) }
  return totals
}

function pill(tag='div', cls='pill'){ const e=document.createElement(tag); e.className=cls; return e }
function circle(label){ const b=document.createElement('button'); b.className='pill-btn'; b.textContent=label; b.style.borderRadius='999px'; b.style.width='36px'; b.style.height='36px'; b.style.fontWeight='800'; return b }

function buildShell(){
  const app=document.getElementById('app'); app.innerHTML=''

  const nav=document.createElement('div'); nav.className='nav'
  const prev=circle('◀'); const next=circle('▶')
  const range=document.createElement('div'); range.className='pill-btn'; range.style.fontWeight='800'; range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`
  const exportBtn=document.createElement('button'); exportBtn.className='pill-btn'; exportBtn.textContent='Export do Excelu'; exportBtn.onclick=exportExcel
  prev.onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`; refreshData().catch(showErr) }
  next.onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`; refreshData().catch(showErr) }
  nav.append(prev,range,next, exportBtn); app.append(nav)

  const admin=document.createElement('div'); admin.className='card card--plain'
  const row=document.createElement('div'); row.style.display='flex'; row.style.gap='10px'; row.style.alignItems='center'
  const jobClient=document.createElement('select'); jobClient.className='pill-select clientSel'; jobClient.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  const jobName=document.createElement('input'); jobName.className='pill-input'; jobName.placeholder='Název zakázky'
  const jobStatus=document.createElement('select'); jobStatus.className='pill-select'; jobStatus.innerHTML = state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  const addJobBtn=document.createElement('button'); addJobBtn.className='pill-btn'; addJobBtn.textContent='Přidat zakázku'
  addJobBtn.onclick=async()=>{ const name=jobName.value.trim(); if(!name) return showErr('Zadej název zakázky'); const {error}=await state.sb.from('job').insert({ client_id: jobClient.value, name, status_id: parseInt(jobStatus.value,10) }); if(error) return showErr(error.message); jobName.value=''; state.jobs=await loadJobs(); renderTable() }
  row.append(jobClient, jobName, jobStatus, addJobBtn); admin.append(row)
  app.append(admin)

  const card=document.createElement('div'); card.className='card card--table'
  const wrap=document.createElement('div'); wrap.className='tableWrap'; const table=document.createElement('table'); wrap.append(table); card.append(wrap); app.append(card)
  table.innerHTML = `<thead><tr>
    <th style="width:220px">Klient</th>
    <th style="width:460px">Zakázka</th>
    <th>Po</th><th>Út</th><th>St</th><th>Čt</th><th>Pá</th>
    <th>Celkem</th>
  </tr></thead>
  <tbody id="tbody"></tbody>
  <tfoot><tr id="sumRow">
    <td></td><td></td>
    <td class="sumCell"></td><td class="sumCell"></td><td class="sumCell"></td><td class="sumCell"></td><td class="sumCell"></td>
    <td></td>
  </tr></tfoot>`

  renderTable()
}

function renderTable(){
  const tbody=document.getElementById('tbody'); if(!tbody) return
  tbody.innerHTML=''
  const days=getDays()
  const visible = state.jobs
  for(const j of visible){
    const tr=document.createElement('tr'); tr.dataset.job=j.id

    const tdClient=document.createElement('td'); tdClient.textContent=j.client; tr.append(tdClient)

    const tdJob=document.createElement('td'); tdJob.textContent=j.name; tr.append(tdJob)

    days.forEach((d,i)=>{
      const td=document.createElement('td'); td.dataset.day=i
      const b=document.createElement('button'); b.className='pill-btn'; b.style.fontWeight='800'; b.textContent='0'; b.setAttribute('data-job',j.id); b.setAttribute('data-date',d)
      b.onclick=()=>bump(j.id,d,+STEP); b.oncontextmenu=(e)=>{e.preventDefault(); bump(j.id,d,-STEP)}
      td.append(b); tr.append(td)
    })

    const total=document.createElement('td'); total.className='totalCell'; total.textContent= formatNum( state.totalsAllJobsAllTime[j.id] || 0 )
    tr.append(total)

    tbody.append(tr); updateRow(j.id)
  }
  updateSumRow(visible)
}

function getDays(){ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))) }
function cellValue(jobId, dateISO){ return (state.entries[jobId] && state.entries[jobId][dateISO]) ? state.entries[jobId][dateISO] : 0 }
function formatNum(x){ return (x%1===0)? String(x): x.toFixed(1) }

async function bump(jobId,dateISO,delta){
  try{
    state.entries[jobId] ??= {}
    const current = state.entries[jobId][dateISO] || 0
    const next = Math.max(0, round05(current + delta))
    const effective = round05(next - current)
    if (effective === 0) { updateRow(jobId); return }

    state.entries[jobId][dateISO]=next; updateRow(jobId)
    const { error } = await state.sb.from('time_entry').insert({ job_id:jobId, work_date:dateISO, hours:effective, user_id: state.session.user.id })
    if(error){ state.entries[jobId][dateISO]=current; updateRow(jobId); return showErr(error.message) }
    state.totalsAllJobsAllTime[jobId] = round05((state.totalsAllJobsAllTime[jobId]||0) + effective)
    document.querySelector(`tr[data-job="${jobId}"] .totalCell`)?.textContent = formatNum(state.totalsAllJobsAllTime[jobId])
  }catch(e){ showErr(e.message||e) }
}

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .pill-btn`); if(b) b.textContent=formatNum(val) })
  tr.querySelector('.totalCell').textContent = formatNum(state.totalsAllJobsAllTime[jobId]||0)
  queueMicrotask(()=>updateSumRow())
}
function updateSumRow(visibleJobs){
  const days=getDays()
  const visible = visibleJobs || state.jobs
  const sums=days.map(d=>visible.reduce((a,j)=>a+cellValue(j.id,d),0))
  const tds = document.querySelectorAll('#sumRow .sumCell')
  tds.forEach((td,i)=>{
    const h = sums[i]||0
    const cls = h<=3 ? 'background:#ef4444;color:#fff' : (h<=6 ? 'background:#f59e0b;color:#fff' : 'background:#22c55e;color:#fff')
    td.innerHTML = `<span style="display:inline-flex;min-width:36px;height:36px;align-items:center;justify-content:center;border-radius:999px;${cls};font-weight:800">${formatNum(h)}</span>`
  })
}

async function refreshData(){
  try{
    const [mine, totals] = await Promise.all([ loadEntriesMine(), loadTotalsAllUsersAllTime() ])
    state.entries = mine; state.totalsAllJobsAllTime = totals; renderTable()
  }catch(e){ showErr(e) }
}

async function render(){
  try{
    userBox()
    const app=document.getElementById('app')
    if(!state.session){ app.innerHTML='<div class="card" style="text-align:center">Přihlas se, prosím.</div>'; return }
    await ensureProfile()
    state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();
    await refreshData()
    buildShell()
  }catch(e){ showErr(e) }
}

(async function bootstrap(){
  const ok = await initSupabase()
  if(ok) render().catch(showErr)
})()
