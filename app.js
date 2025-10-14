import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const state = {
  sb: null,
  session: null,
  weekStart: startOfISOWeek(new Date()),
  jobs: [],
  clients: [],
  statuses: [],
  entries: {}, // jobId -> { dateISO: number }
  filterClient: 'ALL'
}

const STEP = 0.5 // půlhodiny

function startOfISOWeek(d){
  const dt = new Date(d); const day = (dt.getDay()+6)%7; // 0=Mon
  dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt
}
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }
function round1(x){ return Math.round(x*2)/2 } // na půlhodiny

async function loadConfig(){
  const res = await fetch('./config.json'); 
  if(!res.ok){ throw new Error('Nelze načíst config.json') }
  return res.json()
}

async function initSupabase(){
  const cfg = await loadConfig()
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { persistSession:true, autoRefreshToken:true }
  })
  state.sb = sb
  const { data: { session } } = await sb.auth.getSession()
  state.session = session
  sb.auth.onAuthStateChange((_evt, s)=>{ state.session = s; render() })
}

function renderUserBox(){
  const el = document.getElementById('userBox')
  el.innerHTML = ''
  if(!state.session){
    const b = document.createElement('button')
    b.textContent = 'Přihlásit e-mailem'
    b.onclick = () => showLogin()
    el.appendChild(b)
  }else{
    const span = document.createElement('span')
    span.className='badge'
    span.textContent = state.session.user.email
    const out = document.createElement('button')
    out.textContent = 'Odhlásit'
    out.onclick = async () => { await state.sb.auth.signOut() }
    el.append(span, out)
  }
}

function showLogin(){
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="card login">
      <h2>Přihlášení</h2>
      <p class="helper">Zadej e-mail, pošleme magic link pro přihlášení.</p>
      <input id="email" type="email" class="text" placeholder="name@example.com" />
      <button id="sendLink" class="btn">Poslat přihlašovací odkaz</button>
    </div>`
  document.getElementById('sendLink').onclick = async () => {
    const email = document.getElementById('email').value.trim()
    if(!email) return alert('Zadej e-mail')
    const { error } = await state.sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + window.location.pathname + 'index.html' }
    })
    if(error) return alert(error.message)
    alert('Zkontroluj schránku, poslal jsem odkaz.')
  }
}

async function ensureProfile(){
  if(!state.session) return
  const uid = state.session.user.id
  await state.sb.from('app_user')
    .upsert({ id: uid, full_name: state.session.user.email, role: 'admin' }, { onConflict: 'id' })
}

async function loadClients(){
  const { data, error } = await state.sb.from('client')
    .select('id,name').eq('is_active', true).order('name')
  if (error) { console.error(error); return [] }
  return data || []
}

async function loadStatuses(){
  const { data, error } = await state.sb.from('job_status')
    .select('id,code,label').order('id')
  if (error) { console.error(error); return [] }
  return data || []
}

async function loadJobs(){
  const { data, error } = await state.sb
    .from('job')
    .select('id,name,status_id,client_id, client:client_id (id,name), status:status_id (id,label)')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if(error){ console.error(error); return [] }
  return (data||[]).map(j => ({
    id: j.id,
    name: j.name,
    client_id: j.client?.id || j.client_id,
    client: j.client?.name || 'Neznámý klient',
    status_id: j.status_id,
    status: j.status?.label || ''
  }))
}

async function loadEntries(){
  const from = fmtDate(state.weekStart)
  const to = fmtDate(addDays(state.weekStart, 6))
  const { data, error } = await state.sb
    .from('time_entry')
    .select('job_id, work_date, hours')
    .gte('work_date', from)
    .lte('work_date', to)
  if(error){ console.error(error); return {} }
  const map = {}
  for(const row of data){
    const d = row.work_date
    if(!map[row.job_id]) map[row.job_id] = {}
    map[row.job_id][d] = round1((map[row.job_id][d] || 0) + Number(row.hours||0))
  }
  return map
}

function buildTable(){
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="card">
      <div class="controls">
        <button class="btn" id="prevWeek">←</button>
        <div class="range">${dayjs(state.weekStart).format('D. M. YYYY')} – ${dayjs(addDays(state.weekStart,4)).format('D. M. YYYY')}</div>
        <button class="btn" id="nextWeek">→</button>

        <select id="filterClient" class="btn">
          <option value="ALL">Všichni klienti</option>
          ${state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>

        <div class="spacer"></div>
        <button class="btn" id="export">Export do Excelu</button>
      </div>

      <div class="helper">Klik = +0,5 h, pravé tlačítko = −0,5 h</div>
      <div class="helper">Ve výpisu lze upravit klienta, název i stav zakázky (inline).</div>
    </div>

    <div class="card" style="margin-top:10px">
      <strong>Přidat klienta / zakázku</strong>
      <div class="controls" style="margin-top:8px">
        <input id="newClientName" class="text" placeholder="Název klienta">
        <button class="btn" id="addClient">Přidat klienta</button>

        <div class="spacer"></div>

        <select id="jobClient" class="btn">
          ${state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <input id="newJobName" class="text" placeholder="Název zakázky">
        <select id="jobStatus" class="btn">
          ${state.statuses.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('')}
        </select>
        <button class="btn" id="addJob">Přidat zakázku</button>
      </div>
    </div>

    <div class="card" style="margin-top:10px">
      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th style="width:240px">Klient</th>
              <th style="width:360px">Zakázka</th>
              <th>Po</th><th>Út</th><th>St</th><th>Čt</th><th>Pá</th>
              <th>Celkem</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
          <tfoot>
            <tr id="sumRow"></tr>
          </tfoot>
        </table>
      </div>
    </div>
  `
  document.getElementById('prevWeek').onclick = ()=>{ state.weekStart = addDays(state.weekStart, -7); refreshData() }
  document.getElementById('nextWeek').onclick = ()=>{ state.weekStart = addDays(state.weekStart, 7); refreshData() }
  document.getElementById('export').onclick = exportExcel
  document.getElementById('filterClient').onchange = (e)=>{ state.filterClient = e.target.value; renderBody(); }
  document.getElementById('addClient').onclick = addClient
  document.getElementById('addJob').onclick = addJob

  renderBody()
}

function getDays(){ return [0,1,2,3,4].map(i => fmtDate(addDays(state.weekStart, i))) }

function cellValue(jobId, dateISO){
  return (state.entries[jobId] && state.entries[jobId][dateISO]) ? state.entries[jobId][dateISO] : 0
}

async function bump(jobId, dateISO, delta){
  // Optimistic update (půlhodiny)
  state.entries[jobId] = state.entries[jobId] || {}
  const next = Math.max(0, round1((state.entries[jobId][dateISO] || 0) + delta))
  state.entries[jobId][dateISO] = next
  updateRow(jobId)
  // Persist do DB
  const { error } = await state.sb.from('time_entry').insert({ job_id: jobId, work_date: dateISO, hours: delta })
  if(error){
    // revert
    state.entries[jobId][dateISO] = round1(next - delta)
    updateRow(jobId)
    alert('Nepovedlo se uložit: ' + error.message)
  }
}

function updateRow(jobId){
  const days = getDays()
  let sum = 0
  for(const d of days){ sum += cellValue(jobId, d) }
  const tr = document.querySelector(`tr[data-job="${jobId}"]`)
  if(!tr) return
  days.forEach((d,idx)=>{
    const btn = tr.querySelector(`td[data-day="${idx}"] button`)
    if(btn) btn.textContent = cellValue(jobId, d).toFixed(1).replace('.0','')
  })
  tr.querySelector('td.total').textContent = sum.toFixed(1).replace('.0','')
  updateTotalsRow()
}

function renderBody(){
  const tbody = document.getElementById('tbody')
  tbody.innerHTML = ''
  const days = getDays()
  const visibleJobs = state.filterClient==='ALL' ? state.jobs : state.jobs.filter(j => j.client_id === state.filterClient)
  for(const j of visibleJobs){
    const tr = document.createElement('tr')
    tr.dataset.job = j.id
    tr.innerHTML = `
      <td>
        <select class="btn jobClientSelect" data-job="${j.id}">
          ${state.clients.map(c => `<option value="${c.id}" ${c.id===j.client_id?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="inlineRow">
          <input type="text" class="text jobNameInput" value="${escapeHtml(j.name)}" data-job="${j.id}" />
          <select class="btn jobStatusSelect" data-job="${j.id}">
            ${state.statuses.map(s => `<option value="${s.id}" ${s.id===j.status_id?'selected':''}>${escapeHtml(s.label)}</option>`).join('')}
          </select>
        </div>
      </td>
      ${days.map((d,i)=>`<td data-day="${i}" class="tc"><button class="cellBtn" data-date="${d}" data-job="${j.id}">0</button></td>`).join('')}
      <td class="total">0</td>
    `
    tbody.appendChild(tr)
  }
  // naplnit hodnoty a navázat handlery
  for(const j of visibleJobs){ updateRow(j.id) }

  tbody.querySelectorAll('.cellBtn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const job = e.currentTarget.getAttribute('data-job')
      const dateISO = e.currentTarget.getAttribute('data-date')
      bump(job, dateISO, +STEP)
    })
    btn.addEventListener('contextmenu', (e)=>{
      e.preventDefault()
      const job = e.currentTarget.getAttribute('data-job')
      const dateISO = e.currentTarget.getAttribute('data-date')
      bump(job, dateISO, -STEP)
    })
  })

  // inline edit job fields
  tbody.querySelectorAll('.jobClientSelect').forEach(sel=>{
    sel.addEventListener('change', async (e)=>{
      const jobId = e.currentTarget.getAttribute('data-job')
      const clientId = e.currentTarget.value
      await updateJob(jobId, { client_id: clientId })
    })
  })
  tbody.querySelectorAll('.jobNameInput').forEach(inp=>{
    let t=null
    inp.addEventListener('input', (e)=>{
      clearTimeout(t)
      const jobId = e.currentTarget.getAttribute('data-job')
      const name = e.currentTarget.value
      t = setTimeout(async ()=>{ await updateJob(jobId, { name }) }, 400)
    })
  })
  tbody.querySelectorAll('.jobStatusSelect').forEach(sel=>{
    sel.addEventListener('change', async (e)=>{
      const jobId = e.currentTarget.getAttribute('data-job')
      const status_id = parseInt(e.currentTarget.value,10)
      await updateJob(jobId, { status_id })
    })
  })

  updateTotalsRow()
}

function updateTotalsRow(){
  const days = getDays()
  const visibleJobs = state.filterClient==='ALL' ? state.jobs : state.jobs.filter(j => j.client_id === state.filterClient)
  const sums = days.map((d)=>{
    let s=0
    for(const j of visibleJobs){ s += cellValue(j.id, d) }
    return round1(s)
  })
  const tr = document.getElementById('sumRow')
  const colorClass = (h)=> h<=3 ? 'sumRed' : (h<=6 ? 'sumOrange' : 'sumGreen')
  tr.innerHTML = `
    <td colspan="2" style="text-align:right">Součet za den:</td>
    ${sums.map(h => `<td class="sumCell ${colorClass(h)}">${h.toFixed(1).replace('.0','')}</td>`).join('')}
    <td></td>
  `
}

async function updateJob(jobId, patch){
  const { error } = await state.sb.from('job').update(patch).eq('id', jobId)
  if(error){ alert('Nelze upravit zakázku: ' + error.message) }
  else{
    // obnovíme jobs (aby se props jako client/status text hned propsaly)
    state.jobs = await loadJobs()
    renderBody()
  }
}

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }

async function exportExcel(){
  const days = getDays()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Souhrn týdne')
  ws.addRow(['Klient','Zakázka','Po','Út','St','Čt','Pá','Celkem'])
  const visibleJobs = state.filterClient==='ALL' ? state.jobs : state.jobs.filter(j => j.client_id === state.filterClient)
  for(const j of visibleJobs){
    const vals = days.map(d => cellValue(j.id, d))
    const total = vals.reduce((a,b)=>a+b,0)
    ws.addRow([j.client, j.name, ...vals, total])
  }
  // poslední řádek: denní součty
  const daySums = days.map(d => visibleJobs.reduce((acc,j)=>acc+cellValue(j.id,d),0))
  ws.addRow(['Součet za den','', ...daySums, ''])

  const buf = await wb.xlsx.writeBuffer()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  a.download = `vykaz-${dayjs(state.weekStart).format('YYYY-MM-DD')}.xlsx`
  a.click()
}

async function addClient(){
  const name = document.getElementById('newClientName').value.trim()
  if(!name) return alert('Zadej název klienta')
  const { error } = await state.sb.from('client').insert({ name })
  if(error){ return alert(error.message) }
  document.getElementById('newClientName').value=''
  state.clients = await loadClients()
  buildTable()
}

async function addJob(){
  const clientId = document.getElementById('jobClient').value
  const name = document.getElementById('newJobName').value.trim()
  const statusId = parseInt(document.getElementById('jobStatus').value,10)
  if(!name) return alert('Zadej název zakázky')
  const { error } = await state.sb.from('job').insert({ client_id: clientId, name, status_id: statusId })
  if(error){ return alert(error.message) }
  document.getElementById('newJobName').value=''
  state.jobs = await loadJobs()
  renderBody()
}

async function refreshData(){
  state.entries  = await loadEntries()
  renderBody()
}

async function render(){
  renderUserBox()
  const app = document.getElementById('app')
  if(!state.session){
    app.innerHTML = '<div class="card"><p>Přihlas se, prosím.</p></div>'
    return
  }
  await ensureProfile()
  state.clients  = await loadClients()
  state.statuses = await loadStatuses()
  state.jobs     = await loadJobs()
  state.entries  = await loadEntries()
  buildTable()
}

// Init
initSupabase().then(render).catch(err=>{
  console.error(err)
  document.getElementById('app').innerHTML = `<div class="card"><p>Chyba inicializace: ${err.message}</p></div>`
})
