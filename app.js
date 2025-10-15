// PRVNÍ VĚC: viditelný banner => víme, že app.js se spustil
(function(){ window.__vpBanner && __vpBanner('APP START — OK', '#dbeafe'); })();

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
    const r=await fetch('./config.json?v=103',{cache:'no-store'})
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
  <p>Vlož klíče nebo nahraj <code>config.json</code> do repa.</p>
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
  }catch(e){ showErr(e.message||e) }
}

function row(j){ const days=getDays(); return `<tr data-job="${j.id}">
  <td>${j.client||''}</td>
  <td>${j.name||''}</td>
  ${days.map((d,i)=>`<td data-day="${i}"><button class="pill-btn" data-job="${j.id}" data-date="${d}" data-idx="${i}">0</button></td>`).join('')}
  <td class="totalCell">${formatNum(state.totalsAllJobsAllTime[j.id]||0)}</td>
</tr>` }

function renderTable(){
  const tbody=document.getElementById('tbody'); if(!tbody) return
  const visible = state.jobs
  tbody.innerHTML = visible.map(row).join('')
  // bind events
  tbody.querySelectorAll('button.pill-btn').forEach(b=>{
    const job=+b.dataset.job, date=b.dataset.date
    b.onclick=()=>bump(job,date,+STEP)
    b.oncontextmenu=(e)=>{e.preventDefault(); bump(job,date,-STEP)}
  })
  visible.forEach(j=>updateRow(j.id))
  updateSumRow(visible)
}

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .pill-btn`); if(b) b.textContent=formatNum(val) })
  tr.querySelector('.totalCell').textContent = formatNum(state.totalsAllJobsAllTime[jobId]||0)
}
function updateSumRow(visible){
  const days=getDays()
  const sums=days.map(d=>visible.reduce((a,j)=>a+cellValue(j.id,d),0))
  const tds = document.querySelectorAll('#sumRow .sumCell')
  tds.forEach((td,i)=>{ const h=sums[i]||0; td.innerHTML = `<span class="pill-btn" style="font-weight:800">${formatNum(h)}</span>` })
}

async function refreshData(){
  try{
    const [mine, totals] = await Promise.all([ loadEntriesMine(), loadTotalsAllUsersAllTime() ])
    state.entries = mine; state.totalsAllJobsAllTime = totals; renderTable()
  }catch(e){ showErr(e) }
}

async function render(){
  try{
    const app=document.getElementById('app')
    if(!state.session){ app.innerHTML='<div class="card" style="text-align:center">Přihlas se, prosím.</div>'; return }
    // data
    step('3/5 – načítám klienty/stavy/zakázky…')
    state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();
    step('4/5 – načítám tvoje zápisy + týmové součty…')
    const [mine, totals] = await Promise.all([ loadEntriesMine(), loadTotalsAllUsersAllTime() ])
    state.entries = mine; state.totalsAllJobsAllTime = totals
    // UI
    step('5/5 – vykresluji…')
    buildShell()
  }catch(e){ showErr(e) }
}

function buildShell(){
  const app=document.getElementById('app'); app.innerHTML=''
  const nav=document.createElement('div'); nav.className='step'; nav.textContent='UI běží'; app.append(nav)
  // tabulka
  const card=document.createElement('div'); card.className='card'
  card.innerHTML = `<div class="tableWrap"><table style="width:100%">
    <thead><tr><th>Klient</th><th>Zakázka</th><th>Po</th><th>Út</th><th>St</th><th>Čt</th><th>Pá</th><th>Celkem</th></tr></thead>
    <tbody id="tbody"></tbody>
    <tfoot><tr id="sumRow"><td></td><td></td><td class="sumCell"></td><td class="sumCell"></td><td class="sumCell"></td><td class="sumCell"></td><td class="sumCell"></td><td></td></tr></tfoot>
  </table></div>`
  app.append(card)
  renderTable()
}

// bootstrap
(async function(){
  const ok = await initSupabase()
  if(ok) render().catch(showErr)
})()
