import dayjs from 'https://cdn.jsdelivr.net/npm/dayjs@1/+esm'

const state = {
  sb: null,
  session: null,
  weekStart: startOfISOWeek(new Date()),
  jobs: [],
  clients: [],
  statuses: [],
  entries: {}, // jobId -> { dateISO: hours }
  filterClient: 'ALL'
}

function startOfISOWeek(d){
  const dt = new Date(d); const day = (dt.getDay()+6)%7; // 0=Mon
  dt.setDate(dt.getDate()-day); dt.setHours(0,0,0,0); return dt
}
function fmtDate(d){ return dayjs(d).format('YYYY-MM-DD') }
function addDays(d, n){ const x=new Date(d); x.setDate(x.getDate()+n); return x }

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
      <input id="email" type="email" placeholder="name@example.com" />
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
  // všichni budou mít v profilu roli 'admin' (pro konzistenci, i když RLS to nevyžaduje)
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
    map[row.job_id][d] = (map[row.job_id][d] || 0) + (row.hours||0)
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

      <div class="helper">Klik = +1 h, pravé tlačítko = −1 h</div>
      <div class="helper">Zobrazují se všechny aktivní zakázky; hodiny se ukládají k přihlášenému uživateli.</div>
    </div>

    <div class="card" style="margin-top:10px">
      <strong>Přidat klienta / zakázku</strong>
      <div class="controls" style="margin-top:8px">
        <!-- Nový klient -->
        <input id="newClientName" placeholder="Název klienta">
        <button class="btn" id="addClient">Přidat klienta</button>

        <div class="spacer"></div>

        <!-- Nová zakázka -->
        <select id="jobClient" class="btn">
          ${state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}
        </select>
        <input id="newJobName" placeholder="Název zakázky">
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
              <th>Klient</th>
              <th>Zakázka</th>
              <th>Po</th><th>Út</th><th>St</th><th>Čt</th><th>Pá</th>
              <th>Celkem</th>
            </tr>
          </thead>
          <tbody id="tbody"></tbody>
        </table>
      </div>
    </div>
  `
  document.getElementById('prevWeek').onclick = ()=>{ state.weekStart = addDays(state.weekStart, -7); renderBody() }
  document.getElementById('nextWeek').onclick = ()=>{ state.weekStart = addDays(state.weekStart, 7); renderBody() }
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
  // Optimistic update
  state.entries[jobId] = state.entries[jobId] || {}
  state.entries[jobId][dateISO] = Math.max(0, (state.entries[jobId][dateISO] || 0) + delta)
  updateRow(jobId)
  // Persist
  const { error } = await state.sb.from('time_entry').insert({ job_id: jobId, work_date: dateISO, hours: delta })
  if(error){
    state.entries[jobId][dateISO] = Math.max(0, (state.entries[jobId][dateISO] || 0) - delta)
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
    const td = tr.querySelector(`td[data-day="${idx}"] button`)
    if(td) td.textContent = cellValue(jobId, d)
  })
  tr.querySelector('td.total').textContent = sum
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
      <td><span class="client">${escapeHtml(j.client)}</span></td>
      <td>${escapeHtml(j.name)} &nbsp; <span class="status">• ${escapeHtml(j.status||'')}</span></td>
      ${days.map((d,i)=>`<td data-day="${i}" class="tc"><button class="cellBtn" data-date="${d}" data-job="${j.id}">0</button></td>`).join('')}
      <td class="total">0</td>
    `
    tbody.appendChild(tr)
  }
  for(const j of visibleJobs){ updateRow(j.id) }
  tbody.querySelectorAll('.cellBtn').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      const job = e.currentTarget.getAttribute('data-job')
      const dateISO = e.currentTarget.getAttribute('data-date')
      bump(job, dateISO, 1)
    })
    btn.addEventListener('contextmenu', (e)=>{
      e.preventDefault()
      const job = e.currentTarget.getAttribute('data-job')
      const dateISO = e.currentTarget.getAttribute('data-date')
      bump(job, dateISO, -1)
    })
  })
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
  // přestavíme panel i selecty
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
