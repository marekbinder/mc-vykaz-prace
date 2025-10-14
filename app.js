import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const STEP = 0.5 // půlhodina
const state = {
  sb:null, session:null,
  weekStart: startOfISOWeek(new Date()),
  clients:[], statuses:[], jobs:[], entries:{},
  filterClient:'ALL', filterStatus:'ALL'
}

function startOfISOWeek(d){ const dt=new Date(d); const wd=(dt.getDay()+6)%7; dt.setDate(dt.getDate()-wd); dt.setHours(0,0,0,0); return dt }
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }
function round05(x){ return Math.round(x*2)/2 }

async function loadConfig(){ const r=await fetch('./config.json'); if(!r.ok) throw new Error('config.json'); return r.json() }
async function initSupabase(){
  const cfg = await loadConfig()
  state.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth:{persistSession:true,autoRefreshToken:true} })
  const { data:{ session } } = await state.sb.auth.getSession()
  state.session = session
  state.sb.auth.onAuthStateChange((_e,s)=>{ state.session=s; render() })
}

function renderUserBox(){
  const h = document.querySelector('.siteHeader .rightSlot')
  h.innerHTML = ''
  if(!state.session){
    const b = el('button','btn','Přihlásit'); b.onclick = showLogin; h.append(b)
  }else{
    h.append(el('span','badge',state.session.user.email), el('button','btn','Odhlásit'))
    h.querySelector('.btn:last-child').onclick = async ()=>{ await state.sb.auth.signOut() }
  }
}
function showLogin(){
  const app = document.getElementById('app')
  app.innerHTML = `<div class="card"><div class="adminBar" style="justify-content:center">
      <input id="email" class="text" type="email" placeholder="name@example.com" style="max-width:280px">
      <button id="send" class="btn">Poslat přihlašovací odkaz</button>
  </div></div>`
  document.getElementById('send').onclick = async ()=>{
    const email = document.getElementById('email').value.trim()
    if(!email) return alert('Zadej e-mail')
    const { error } = await state.sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: window.location.origin + window.location.pathname + 'index.html' } })
    if(error) return alert(error.message)
    alert('Zkontroluj e-mail.')
  }
}

async function ensureProfile(){
  const uid = state.session.user.id
  await state.sb.from('app_user').upsert({ id:uid, full_name:state.session.user.email, role:'admin' }, { onConflict:'id' })
}
async function loadClients(){ const {data}=await state.sb.from('client').select('id,name').eq('is_active',true).order('name'); return data||[] }
async function loadStatuses(){ const {data}=await state.sb.from('job_status').select('id,label').order('id'); return data||[] }
async function loadJobs(){
  const {data,error}=await state.sb.from('job')
    .select('id,name,status_id,client_id, client:client_id(id,name), status:status_id(id,label)')
    .eq('is_active',true).order('name')
  if(error) { console.error(error); return [] }
  return (data||[]).map(j=>({ id:j.id, name:j.name, client_id:j.client?.id||j.client_id, client:j.client?.name||'', status_id:j.status_id, status:j.status?.label||'' }))
}
async function loadEntries(){
  const from=fmtDate(state.weekStart), to=fmtDate(addDays(state.weekStart,6))
  const {data}=await state.sb.from('time_entry').select('job_id,work_date,hours').gte('work_date',from).lte('work_date',to)
  const map={}; for(const r of (data||[])){ map[r.job_id] ??= {}; map[r.job_id][r.work_date] = round05((map[r.job_id][r.work_date]||0) + Number(r.hours||0)) }
  return map
}

function el(tag, cls, text){ const x=document.createElement(tag); if(cls) x.className=cls; if(text!=null) x.textContent=text; return x }

function buildShell(){
  const app=document.getElementById('app'); app.innerHTML=''
  // navigace týdne
  const nav = el('div','nav')
  const prev = el('button','navBtn','◀'); const next = el('button','navBtn','▶')
  const range = el('div','navRange', `${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}`)
  prev.onclick=()=>{ state.weekStart=addDays(state.weekStart,-7); refreshData() }
  next.onclick=()=>{ state.weekStart=addDays(state.weekStart, 7); refreshData() }
  nav.append(prev,range,next); app.append(nav)

  // filtry
  const filters = el('div','filters')
  const fc = el('div','pill'); fc.append(el('span',null,'Nastavení filtru:'), el('span',null,''))
  const clientSel = el('select'); clientSel.innerHTML = `<option value="ALL">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  clientSel.onchange = (e)=>{ state.filterClient=e.target.value; renderTable() }
  const statSel = el('select'); statSel.innerHTML = `<option value="ALL">Všechny zakázky</option>` + state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  statSel.onchange = (e)=>{ state.filterStatus=e.target.value; renderTable() }
  const pill1 = el('div','pill'); pill1.append(clientSel)
  const pill2 = el('div','pill'); pill2.append(statSel)
  filters.append(el('div','pill', 'Nastavení filtru:'), pill1, pill2)
  app.append(filters)

  // admin bar (přidání klienta/zakázky)
  const admin = el('div','card')
  const bar = el('div','adminBar')
  const newClient = el('input','text'); newClient.placeholder='Název klienta'
  const addClientBtn=el('button','btn','Přidat klienta')
  addClientBtn.onclick = async ()=>{
    const name=newClient.value.trim(); if(!name) return alert('Zadej název klienta')
    const {error}=await state.sb.from('client').insert({name}); if(error) return alert(error.message)
    newClient.value=''; state.clients=await loadClients(); buildShell()
  }
  const jobClient = el('select','btn'); jobClient.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')
  const jobName = el('input','text'); jobName.placeholder='Název zakázky'
  const jobStatus = el('select','btn'); jobStatus.innerHTML = state.statuses.map(s=>`<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')
  const addJobBtn = el('button','btn','Přidat zakázku')
  addJobBtn.onclick = async ()=>{
    const name=jobName.value.trim(); if(!name) return alert('Zadej název zakázky')
    const {error}=await state.sb.from('job').insert({ client_id: jobClient.value, name, status_id: parseInt(jobStatus.value,10) })
    if(error) return alert(error.message)
    jobName.value=''; state.jobs=await loadJobs(); renderTable()
  }
  bar.append(newClient,addClientBtn, el('span',null,'  '), jobClient, jobName, jobStatus, addJobBtn)
  admin.append(bar, el('div','helper','Klik = +0,5 h, pravé tlačítko = −0,5 h'))
  app.append(admin)

  // tabulka
  const card = el('div','card'); const wrap = el('div','tableWrap'); const table = el('table'); wrap.append(table); card.append(wrap); app.append(card)
  table.innerHTML = `<thead><tr>
    <th style="width:220px">Klient</th>
    <th style="width:460px">Zakázka</th>
    <th>Po</th><th>Út</th><th>St</th><th>Čt</th><th>Pá</th>
    <th>Celkem</th>
  </tr></thead>
  <tbody id="tbody"></tbody>
  <tfoot><tr><td colspan="2"></td><td colspan="5"><div id="sumBar" class="sumBar"></div></td><td></td></tr></tfoot>`

  renderTable()
}

function renderTable(){
  const tbody = document.getElementById('tbody'); if(!tbody) return
  tbody.innerHTML=''
  const days = getDays()
  const visible = state.jobs.filter(j=> (state.filterClient==='ALL' || j.client_id===state.filterClient) && (state.filterStatus==='ALL' || String(j.status_id)===String(state.filterStatus)) )

  for(const j of visible){
    const tr = document.createElement('tr'); tr.dataset.job=j.id
    const tdClient = document.createElement('td'); tdClient.className='clientCell'
    const clientSel = document.createElement('select'); clientSel.className='btn'; clientSel.innerHTML = state.clients.map(c=>`<option value="${c.id}" ${c.id===j.client_id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')
    clientSel.onchange = async (e)=>{ await updateJob(j.id, { client_id: e.target.value }) }
    tdClient.append(clientSel)

    const tdJob = document.createElement('td'); tdJob.className='jobCell'
    const nameInp = document.createElement('input'); nameInp.className='text jobName'; nameInp.value=j.name
    let t=null; nameInp.oninput = (e)=>{ clearTimeout(t); t=setTimeout(async()=>{ await updateJob(j.id, { name: e.target.value }) }, 350) }
    const statusSel = document.createElement('select'); statusSel.className='statusSel'
    statusSel.innerHTML = state.statuses.map(s=>`<option value="${s.id}" ${s.id===j.status_id?'selected':''}>${escapeHtml(s.label)}</option>`).join('')
    statusSel.onchange = async (e)=>{ await updateJob(j.id, { status_id: parseInt(e.target.value,10) }) }
    const delBtn = document.createElement('button'); delBtn.className='jobDelete'; delBtn.textContent='🗑'
    delBtn.title='Odstranit zakázku'; delBtn.onclick = ()=> deleteJob(j.id)

    tdJob.append(nameInp, statusSel, delBtn)

    tr.append(tdClient, tdJob)

    // day cells
    days.forEach((d,i)=>{
      const td = document.createElement('td'); td.dataset.day=i
      const b = el('button','bubble','0')
      b.setAttribute('data-job', j.id); b.setAttribute('data-date', d)
      b.onclick = (e)=>{ bump(j.id, d, +STEP) }
      b.oncontextmenu = (e)=>{ e.preventDefault(); bump(j.id, d, -STEP) }
      td.append(b); tr.append(td)
    })

    const tdTotal = el('td','totalCell','0'); tr.append(tdTotal)

    tbody.append(tr)
    updateRow(j.id)
  }
  updateSumBar(visible)
}

function getDays(){ return [0,1,2,3,4].map(i=>fmtDate(addDays(state.weekStart,i))) }

function cellValue(jobId, dateISO){
  return (state.entries[jobId] && state.entries[jobId][dateISO]) ? state.entries[jobId][dateISO] : 0
}

async function bump(jobId, dateISO, delta){
  state.entries[jobId] ??= {}
  const next = Math.max(0, round05((state.entries[jobId][dateISO]||0) + delta))
  state.entries[jobId][dateISO] = next
  updateRow(jobId)
  const { error } = await state.sb.from('time_entry').insert({ job_id: jobId, work_date: dateISO, hours: delta })
  if(error){ state.entries[jobId][dateISO] = round05(next - delta); updateRow(jobId); alert(error.message) }
}

function updateRow(jobId){
  const days = getDays()
  let sum=0
  const tr = document.querySelector(`tr[data-job="${jobId}"]`); if(!tr) return
  days.forEach((d,i)=>{
    const val = cellValue(jobId,d)
    sum += val
    const b = tr.querySelector(`td[data-day="${i}"] .bubble`)
    if(b) b.textContent = (val%1===0)? String(val): val.toFixed(1)
  })
  tr.querySelector('.totalCell').textContent = (sum%1===0)? String(sum): sum.toFixed(1)
}

function updateSumBar(visibleJobs){
  const days = getDays()
  const sums = days.map(d => visibleJobs.reduce((acc,j)=> acc + cellValue(j.id,d), 0))
  const bar = document.getElementById('sumBar'); if(!bar) return
  bar.innerHTML = sums.map(h => {
    const cls = h<=3 ? 'sumRed' : (h<=6 ? 'sumOrange' : 'sumGreen')
    const label = (h%1===0)? String(h): h.toFixed(1)
    return `<span class="sumBubble ${cls}">${label}</span>`
  }).join('')
}

async function updateJob(jobId, patch){
  const { error } = await state.sb.from('job').update(patch).eq('id', jobId)
  if(error) return alert('Nelze upravit zakázku: ' + error.message)
  state.jobs = await loadJobs()
  renderTable()
}

async function deleteJob(jobId){
  if(!confirm('Opravdu odstranit zakázku? (Bude jen skrytá)')) return
  const { error } = await state.sb.from('job').update({ is_active:false }).eq('id', jobId)
  if(error) return alert('Nelze odstranit zakázku: ' + error.message)
  state.jobs = await loadJobs()
  renderTable()
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }

async function exportExcel(){
  const days = getDays()
  const visible = state.jobs.filter(j=> (state.filterClient==='ALL' || j.client_id===state.filterClient) && (state.filterStatus==='ALL' || String(j.status_id)===String(state.filterStatus)) )
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Souhrn týdne')
  ws.addRow(['Klient','Zakázka','Po','Út','St','Čt','Pá','Celkem'])
  for(const j of visible){
    const vals = days.map(d=>cellValue(j.id,d)); const total = vals.reduce((a,b)=>a+b,0)
    ws.addRow([j.client, j.name, ...vals, total])
  }
  const daySums = days.map(d => visible.reduce((acc,j)=>acc+cellValue(j.id,d),0))
  ws.addRow(['Součet za den','', ...daySums, ''])
  const buf = await wb.xlsx.writeBuffer()
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([buf],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})); a.download=`vykaz-${fmtDate(state.weekStart)}.xlsx`; a.click()
}

async function refreshData(){ state.entries=await loadEntries(); renderTable() }

async function render(){
  renderUserBox()
  const app=document.getElementById('app')
  if(!state.session){ app.innerHTML='<div class="card"><p style="text-align:center">Přihlas se, prosím.</p></div>'; return }
  await ensureProfile()
  state.clients=await loadClients()
  state.statuses=await loadStatuses()
  state.jobs=await loadJobs()
  state.entries=await loadEntries()
  buildShell()
}

// Init
initSupabase().then(render).catch(err=>{
  console.error(err)
  document.getElementById('app').innerHTML = `<div class="card"><p>Chyba inicializace: ${err.message}</p></div>`
})
