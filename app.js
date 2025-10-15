import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const STEP = 0.5
const state = { sb:null, session:null, weekStart: startOfISOWeek(new Date()),
  clients:[], statuses:[], jobs:[], entries:{}, totalsAllJobsAllTime:{}, filterClient:'ALL', filterStatus:'ALL' }

function startOfISOWeek(d){ const dt=new Date(d); const wd=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-wd); dt.setHours(0,0,0,0); return dt }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }
function round05(x){ return Math.round(x*2)/2 }
function showErr(msg){ console.error(msg); const e=document.getElementById('err'); if(!e) return; e.textContent=(msg?.message)||String(msg); e.style.display='block'; setTimeout(()=>e.style.display='none', 7000) }

async function loadConfig(){
  // prefer config.json; fallback localStorage
  try{ const r=await fetch('./config.json?v=110',{cache:'no-store'}); if(r.ok){ const j=await r.json(); if(j.supabaseUrl&&j.supabaseAnonKey) return j } }catch{}
  const supabaseUrl = localStorage.getItem('vp.supabaseUrl')
  const supabaseAnonKey = localStorage.getItem('vp.supabaseAnonKey')
  if(supabaseUrl && supabaseAnonKey) return { supabaseUrl, supabaseAnonKey }
  throw new Error('Chybí konfigurace Supabase (config.json nebo localStorage).')
}

async function init(){
  const cfg = await loadConfig()
  if(!window.supabase) throw new Error('Knihovna Supabase není načtená.')
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{persistSession:true,autoRefreshToken:true} })
  const { data:{ session } } = await state.sb.auth.getSession()
  state.session = session
  state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; render() })
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

async function loadClients(){ const {data}=await state.sb.from('client').select('id,name').eq('is_active',true).order('name'); return data||[] }
async function loadStatuses(){ const {data}=await state.sb.from('job_status').select('id,label').order('id'); return data||[] }
async function loadJobs(){
  const {data}=await state.sb.from('job')
    .select('id,name,status_id,client_id, client:client_id (id,name), status:status_id (id,label)')
    .eq('is_active',true).order('name')
  return (data||[]).map(j=>({ id:j.id, name:j.name, client_id:j.client?.id||j.client_id, client:j.client?.name||'', status_id:j.status_id, status:j.status?.label||'' }))
}
async function loadEntriesMine(){
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6))
  const {data}=await state.sb.from('time_entry').select('job_id,work_date,hours,user_id').gte('work_date',from).lte('work_date',to).eq('user_id', state.session.user.id)
  const map={}; for(const r of (data||[])){ map[r.job_id] ??= {}; map[r.job_id][r.work_date] = round05((map[r.job_id][r.work_date]||0) + Number(r.hours||0)) }
  return map
}
async function loadTotalsAllUsersAllTime(){
  const { data } = await state.sb.from('time_entry').select('job_id,hours')
  const totals = {}; for(const r of (data||[])){ totals[r.job_id] = round05((totals[r.job_id]||0) + Number(r.hours||0)) }
  return totals
}

function circle(label){ const b=document.createElement('button'); b.className='pill-btn'; b.style.width='var(--h)'; b.style.height='var(--h)'; b.textContent=label; b.style.fontWeight='800'; return b }

function buildShell(){
  const app=document.getElementById('app'); app.innerHTML=''

  const nav=document.createElement('div'); nav.className='nav'
  const prev=circle('◀'); const next=circle('▶')
  const range=document.createElement('div'); range.className='pill-btn navRange'; range.style.fontWeight='800'; range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`
  const exportBtn=document.createElement('button'); exportBtn.className='pill-btn'; exportBtn.textContent='Export do Excelu'; exportBtn.onclick=exportExcel
  prev.onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`; refreshData() }
  next.onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`; refreshData() }
  nav.append(prev,range,next, exportBtn); app.append(nav)

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

function colorizeStatus(sel){
  sel.classList.remove('is-nova','is-probiha','is-hotovo')
  const txt = (sel.options[sel.selectedIndex]?.text || '').toLowerCase()
  if(txt.includes('nov')) sel.classList.add('is-nova')
  else if(txt.includes('pro') || txt.includes('běh')) sel.classList.add('is-probiha')
  else if(txt.includes('hot')) sel.classList.add('is-hotovo')
}

function renderTable(){
  const tbody=document.getElementById('tbody'); if(!tbody) return
  tbody.innerHTML=''
  const days=getDays()
  const visible = state.jobs.filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) && (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
  for(const j of visible){
    const tr=document.createElement('tr'); tr.dataset.job=j.id

    const tdClient=document.createElement('td'); tdClient.textContent = j.client; tr.append(tdClient)

    const tdJob=document.createElement('td'); tdJob.className='jobCell'
    const name=document.createElement('input'); name.className='pill-input jobName'; name.value=j.name
    let t=null; name.oninput=(e)=>{ clearTimeout(t); t=setTimeout(async()=>{ await state.sb.from('job').update({name:e.target.value}).eq('id', j.id) }, 250) }
    const st=document.createElement('select'); st.className='pill-select statusSel'
    st.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${s.id===j.status_id?'selected':''}>${s.label}</option>`).join('')
    colorizeStatus(st); st.onchange=async(e)=>{ colorizeStatus(st); await state.sb.from('job').update({status_id:parseInt(e.target.value,10)}).eq('id', j.id) }
    const del=document.createElement('button'); del.className='jobDelete'; del.title='Odstranit'; del.textContent='🗑'; del.onclick=()=>deleteJob(j.id)
    tdJob.append(name, st, del)
    tr.append(tdClient, tdJob)

    days.forEach((d,i)=>{
      const td=document.createElement('td'); td.dataset.day=i
      const b=document.createElement('button'); b.className='bubble'; b.textContent='0'
      b.dataset.job = String(j.id); b.dataset.date = d
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
    const job_id = parseInt(jobId, 10)
    if(!Number.isFinite(job_id)) return showErr('Chyba: neplatné job_id')
    if(!dateISO) return showErr('Chyba: prázdné datum')

    state.entries[job_id] ??= {}
    const current = state.entries[job_id][dateISO] || 0
    const next = Math.max(0, round05(current + delta))
    const effective = round05(next - current)
    if (effective === 0) { updateRow(job_id); return }

    state.entries[job_id][dateISO]=next; updateRow(job_id)

    const payload = { job_id, work_date:dateISO, hours:effective, user_id: state.session.user.id }
    const { error } = await state.sb.from('time_entry').insert(payload)
    if(error){ state.entries[job_id][dateISO]=current; updateRow(job_id); return showErr(error.message) }
    state.totalsAllJobsAllTime[job_id] = round05((state.totalsAllJobsAllTime[job_id]||0) + effective)
    document.querySelector(`tr[data-job="${job_id}"] .totalCell`)?.textContent = formatNum(state.totalsAllJobsAllTime[job_id])
  }catch(e){ showErr(e.message||e) }
}

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .bubble`); if(b) b.textContent=formatNum(val) })
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
    const cls = h<=3 ? 'sumRed' : (h<=6 ? 'sumOrange' : 'sumGreen')
    td.innerHTML = `<span class="sumBubble ${cls}">${formatNum(h)}</span>`
  })
}

async function deleteJob(jobId){
  if(!confirm('Opravdu odstranit zakázku? (Bude skryta)')) return
  const { error } = await state.sb.from('job').update({ is_active:false }).eq('id', jobId)
  if(error) return showErr(error)
  state.jobs = await loadJobs()
  renderTable()
}

async function exportExcel(){
  const days = [0,1,2,3,4].map(i=>addDays(state.weekStart,i))
  const daysTxt = days.map(d => dayjs(d).format('D. M. YYYY'))
  const visible = state.jobs

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Výkaz')

  const user = state.session?.user?.email || ''
  const rangeText = `${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`
  ws.addRow([`Uživatel: ${user}`])
  ws.addRow([`Týden: ${rangeText}`])
  ws.addRow([])

  const header = ['Klient','Zakázka', ...daysTxt]
  ws.addRow(header)
  ws.getRow(4).font = { bold:true }
  for(let i=3;i<=7;i++){ ws.getColumn(i).alignment = { horizontal:'right' } }

  for(const j of visible){
    const vals = days.map(d => cellValue(j.id, dayjs(d).format('YYYY-MM-DD')))
    ws.addRow([j.client, j.name, ...vals])
  }

  const daySums = days.map(d => visible.reduce((acc,job)=> acc + cellValue(job.id, dayjs(d).format('YYYY-MM-DD')), 0))
  ws.addRow(['Součet za den','', ...daySums])

  ws.columns.forEach((col, idx) => { col.width = idx<3 ? 22 : 14 })

  const buf = await wb.xlsx.writeBuffer()
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=`vykaz-${dayjs(state.weekStart).format('YYYY-MM-DD')}.xlsx`; a.click()
}

async function refreshData(){
  state.entries = {}
  const [mine, totals] = await Promise.all([ loadEntriesMine(), loadTotalsAllUsersAllTime() ])
  state.entries = mine
  state.totalsAllJobsAllTime = totals
  renderTable()
}

async function render(){
  userBox()
  const app=document.getElementById('app')
  if(!state.session){ app.innerHTML='<div class="card" style="text-align:center">Přihlas se, prosím.</div>'; return }
  await ensureProfile()
  state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();
  await refreshData()
  buildShell()
}

init().then(render).catch(showErr)
