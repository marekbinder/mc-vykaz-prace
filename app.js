import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const STEP = 0.5
const state = { sb:null, session:null, weekStart: startOfISOWeek(new Date()),
  clients:[], statuses:[], jobs:[], entries:{}, totalsAllJobsAllTime:{}, filterClient:'ALL', filterStatus:'ALL' }

function showErr(msg){
  console.error(msg)
  const e=document.getElementById('err'); if(!e) return
  e.textContent = typeof msg==='string' ? msg : (msg?.message||String(msg))
  e.style.display='block'; setTimeout(()=>{ e.style.display='none' }, 6000)
}

function startOfISOWeek(d){ const dt=new Date(d); const wd=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-wd); dt.setHours(0,0,0,0); return dt }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }
function round05(x){ return Math.round(x*2)/2 }

async function loadConfig(){
  const r=await fetch('./config.json', { cache:'no-store' })
  if(!r.ok){ throw new Error('Nenalezen config.json ('+r.status+')') }
  return r.json()
}

async function initSupabase(){
  const cfg = await loadConfig()
  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Doplň supabaseUrl a supabaseAnonKey v config.json')
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{persistSession:true,autoRefreshToken:true} })
  const { data:{ session } } = await state.sb.auth.getSession()
  state.session = session
  state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; render().catch(showErr) })
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
    <div class="pill" style="background:#fff;display:inline-flex;gap:8px">
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
  const {data,error}=await state.sb.from('job')
    .select('id,name,status_id,client_id, client:client_id (id,name), status:status_id (id,label)')
    .eq('is_active',true).order('name')
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
  try{
    const { data, error } = await state.sb.from('time_entry').select('job_id,hours')
    if(error) { showErr('Nelze načíst týmové součty (RLS?): '+error.message); return {} }
    const totals = {}
    for(const r of (data||[])){ totals[r.job_id] = round05((totals[r.job_id]||0) + Number(r.hours||0)) }
    return totals
  }catch(e){ showErr(e); return {} }
}

function pill(tag='div', cls='pill'){ const e=document.createElement(tag); e.className=cls; return e }
function circle(label){ const b=document.createElement('button'); b.className='circle dark'; b.textContent=label; return b }

function buildShell(){
  const app=document.getElementById('app'); app.innerHTML=''

  const nav=document.createElement('div'); nav.className='nav'
  const prev=circle('◀'); const next=circle('▶')
  const range=pill('div','pill dark navRange'); const setRange=()=>range.textContent=`${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`; setRange()
  const exportBtn=document.createElement('button'); exportBtn.className='pill-btn'; exportBtn.textContent='Export do Excelu'; exportBtn.onclick=exportExcel
  prev.onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); setRange(); refreshData().catch(showErr) }
  next.onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); setRange(); refreshData().catch(showErr) }
  nav.append(prev,range,next, exportBtn); app.append(nav)

  const filters=document.createElement('div'); filters.className='filters'
  const label=document.createElement('div'); label.className='label'; label.textContent='Nastavení filtru:'; filters.append(label)
  const fClient=document.createElement('select'); fClient.className='pill-select'; fClient.innerHTML = `<option value="ALL">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  fClient.value = state.filterClient; fClient.onchange=(e)=>{ state.filterClient=e.target.value; renderTable() }
  const fStat=document.createElement('select'); fStat.className='pill-select'; fStat.innerHTML = `<option value="ALL">Všechny zakázky</option>` + state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  fStat.value = state.filterStatus; fStat.onchange=(e)=>{ state.filterStatus=e.target.value; renderTable() }
  filters.append(fClient, fStat); app.append(filters)

  const admin=document.createElement('div'); admin.className='card card--plain'
  const row=document.createElement('div'); row.style.display='flex'; row.style.gap='10px'; row.style.alignItems='center'
  const newClient=document.createElement('input'); newClient.className='pill-input'; newClient.placeholder='Název klienta'
  const addClientBtn=document.createElement('button'); addClientBtn.className='pill-btn'; addClientBtn.textContent='Přidat klienta'
  addClientBtn.onclick=async()=>{ const name=newClient.value.trim(); if(!name) return showErr('Zadej název'); const {error}=await state.sb.from('client').insert({name}); if(error) return showErr(error.message); newClient.value=''; state.clients=await loadClients(); buildShell() }
  const jobClient=document.createElement('select'); jobClient.className='pill-select clientSel'; jobClient.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  const jobName=document.createElement('input'); jobName.className='pill-input jobName'; jobName.placeholder='Název zakázky'
  const jobStatus=document.createElement('select'); jobStatus.className='pill-select statusSel'; jobStatus.innerHTML = state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  const addJobBtn=document.createElement('button'); addJobBtn.className='pill-btn'; addJobBtn.textContent='Přidat zakázku'
  addJobBtn.onclick=async()=>{ const name=jobName.value.trim(); if(!name) return showErr('Zadej název zakázky'); const {error}=await state.sb.from('job').insert({ client_id: jobClient.value, name, status_id: parseInt(jobStatus.value,10) }); if(error) return showErr(error.message); jobName.value=''; state.jobs=await loadJobs(); renderTable() }
  row.append(newClient, addClientBtn, jobClient, jobName, jobStatus, addJobBtn); admin.append(row)
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
  const visible = state.jobs.filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) && (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
  for(const j of visible){
    const tr=document.createElement('tr'); tr.dataset.job=j.id

    const tdClient=document.createElement('td')
    const clientSel=document.createElement('select'); clientSel.className='pill-select clientSel'
    clientSel.innerHTML = state.clients.map(c=>`<option value="${c.id}" ${c.id===j.client_id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')
    clientSel.onchange=async(e)=>{ const {error}=await state.sb.from('job').update({client_id:e.target.value}).eq('id', j.id); if(error) showErr(error); }
    tdClient.append(clientSel)

    const tdJob=document.createElement('td'); tdJob.className='jobCell'
    const name=document.createElement('input'); name.className='pill-input jobName'; name.value=j.name
    let t=null; name.oninput=(e)=>{ clearTimeout(t); t=setTimeout(async()=>{ const {error}=await state.sb.from('job').update({name:e.target.value}).eq('id', j.id); if(error) showErr(error) }, 250) }
    const st=document.createElement('select'); st.className='pill-select statusSel'
    st.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${s.id===j.status_id?'selected':''}>${escapeHtml(s.label)}</option>`).join('')
    colorizeStatus(st); st.onchange=async(e)=>{ colorizeStatus(st); const {error}=await state.sb.from('job').update({status_id:parseInt(e.target.value,10)}).eq('id', j.id); if(error) showErr(error) }
    const del=document.createElement('button'); del.className='jobDelete'; del.title='Odstranit'; del.textContent='🗑'; del.onclick=()=>deleteJob(j.id)
    tdJob.append(name, st, del)

    tr.append(tdClient, tdJob)

    days.forEach((d,i)=>{
      const td=document.createElement('td'); td.dataset.day=i
      const b=document.createElement('button'); b.className='bubble'; b.textContent='0'; b.setAttribute('data-job',j.id); b.setAttribute('data-date',d)
      b.onclick=()=>bump(j.id,d,+STEP); b.oncontextmenu=(e)=>{e.preventDefault(); bump(j.id,d,-STEP)}
      td.append(b); tr.append(td)
    })

    const total=document.createElement('td'); total.className='totalCell'; total.textContent= formatNum( state.totalsAllJobsAllTime[j.id] || 0 )
    tr.append(total)

    tbody.append(tr); updateRow(j.id)
  }
  updateSumRow(visible)
}

function colorizeStatus(sel){
  sel.classList.remove('is-nova','is-probiha','is-hotovo')
  const txt = (sel.options[sel.selectedIndex]?.text || '').toLowerCase()
  if(txt.includes('nov')) sel.classList.add('is-nova')
  else if(txt.includes('pro') || txt.includes('běh')) sel.classList.add('is-probiha')
  else if(txt.includes('hot')) sel.classList.add('is-hotovo')
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
    if(error){ state.entries[jobId][dateISO]=current; updateRow(jobId); return showErr(error) }
    state.totalsAllJobsAllTime[jobId] = round05((state.totalsAllJobsAllTime[jobId]||0) + effective)
    document.querySelector(`tr[data-job="${jobId}"] .totalCell`)?.textContent = formatNum(state.totalsAllJobsAllTime[jobId])
  }catch(e){ showErr(e) }
}

function updateRow(jobId){
  const days=getDays(); const tr=document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return
  days.forEach((d,i)=>{ const val=cellValue(jobId,d); const b=tr.querySelector(`td[data-day="${i}"] .bubble`); if(b) b.textContent=formatNum(val) })
  tr.querySelector('.totalCell').textContent = formatNum(state.totalsAllJobsAllTime[jobId]||0)
  queueMicrotask(()=>updateSumRow())
}
function updateSumRow(visibleJobs){
  const days=getDays()
  const visible = visibleJobs || state.jobs.filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) && (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )
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

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }

async function exportExcel(){
  try{
    const days = [0,1,2,3,4].map(i=>addDays(state.weekStart,i))
    const daysTxt = days.map(d => dayjs(d).format('D. M. YYYY'))
    const visible = state.jobs.filter(j=> (state.filterClient==='ALL'||j.client_id===state.filterClient) && (state.filterStatus==='ALL'||String(j.status_id)===String(state.filterStatus)) )

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
  }catch(e){ showErr(e) }
}

async function refreshData(){
  try{
    state.entries = {}
    document.getElementById('tbody')?.querySelectorAll('.bubble')?.forEach(b=>b.textContent='0')
    updateSumRow([])
    const [mine, totals] = await Promise.all([ loadEntriesMine(), loadTotalsAllUsersAllTime() ])
    state.entries = mine
    state.totalsAllJobsAllTime = totals
    renderTable()
  }catch(e){ showErr(e) }
}

async function render(){
  try{
    userBox()
    const app=document.getElementById('app')
    if(!state.session){ app.innerHTML='<div class="card" style="text-align:center">Přihlas se, prosím.</div>'; return }
    await ensureProfile()
    state.clients=await loadClients(); state.statuses=await loadStatuses(); state.jobs=await loadJobs();
    const [mine, totals] = await Promise.all([ loadEntriesMine(), loadTotalsAllUsersAllTime() ])
    state.entries = mine
    state.totalsAllJobsAllTime = totals
    buildShell()
  }catch(e){ showErr(e) }
}

// Init
initSupabase().then(()=>render().catch(showErr)).catch(showErr)
