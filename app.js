/* =========================================================
   Jednoduchý „Výkaz práce“ – front-end k Supabase
   Kompletní soubor – stačí nahradit v repu.
   ---------------------------------------------------------
   DB předpoklady (beze změn oproti předchozím verzím):
   - clients(id, name)
   - jobs(id, client_id, name, status, assignees json/text[]  – pole stringů)
   - time_entry(id, job_id, user_email, date, hours NUMERIC)
   Pozn.: assignees držíme jako textový JSON string ["Viki", ...]
   ========================================================= */

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // Mapování email -> jméno do exportu / UI
  const USERNAME_MAP = {
    'binder.marek@gmail.com': 'Marek',
    'mac@media-consult.cz'  : 'Viki',
    'stanislav.hron@icloud.com': 'Standa',
  };
  const emailToName = (email) => {
    if (!email) return 'Neznámý';
    const key = String(email).toLowerCase();
    return USERNAME_MAP[key] || email.split('@')[0];
  };

  // Globální stav
  const state = {
    sb: null,
    user: null,
    weekStart: mondayOf(new Date()),
    clients: [],
    jobs: [],
    entriesByJobDay: new Map(), // klíč `${jobId}:${dayIndex}` -> {hours}
    totalsPerDay: [0,0,0,0,0],
    filter: {
      clientId: 'all',
      jobState: 'all',         // all|new|open|done
      totals: 'mine',          // mine|all
      assignee: 'all',         // all|none|Viki|Standa|Marek
    }
  };

  // DOM refs
  const weekLabel   = $('#weekLabel');
  const userEmailEl = $('#userEmail');
  const logoutBtn   = $('#logoutBtn');
  const prevWeekBtn = $('#prevWeek');
  const nextWeekBtn = $('#nextWeek');
  const exportBtn   = $('#exportBtn');

  const fltClients  = $('#fltClients');
  const fltJobs     = $('#fltJobs');
  const fltTotals   = $('#fltTotals');
  const fltAssignee = $('#fltAssignee');

  const newClientName = $('#newClientName');
  const addClientBtn  = $('#addClientBtn');

  const newJobClient   = $('#newJobClient');
  const newJobName     = $('#newJobName');
  const newJobStatus   = $('#newJobStatus');
  const newJobAssignees= $('#newJobAssignees');
  const addJobBtn      = $('#addJobBtn');

  const tableBody   = $('#tableBody');
  const tfootChips  = $$('#weekTotalsRow td.tfoot-chip');

  // Assignee popover
  const popover = $('#assigneePopover');
  const popoverClear = $('#assigneesClear');
  const popoverClose = $('#assigneesClose');
  let popoverJobId = null;

  init();

  // ----------------------- Init -----------------------
  async function init(){
    // načteni configu
    const cfg = await fetch('config.json').then(r=>r.json());
    state.sb  = supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

    // auth
    const { data:{ user } } = await state.sb.auth.getUser();
    state.user = user || null;

    if(!state.user){
      // jednoduché přihlášení magic linkem – stranou (kdo už je přihlášený, neřeší)
      const email = prompt('Zadej e-mail pro přihlášení (Magický odkaz):');
      if(email){
        await state.sb.auth.signInWithOtp({ email, options:{ emailRedirectTo: window.location.href }});
        alert('Zkontroluj e-mail a otevři odkaz. Pak stránku načti znovu.');
      }
      return;
    }

    userEmailEl.textContent = state.user.email;

    // UI bindy
    prevWeekBtn.onclick = () => { shiftWeek(-7); };
    nextWeekBtn.onclick = () => { shiftWeek(+7); };
    logoutBtn.onclick   = logout;
    exportBtn.onclick   = exportToExcel;

    fltClients.onchange  = () => { state.filter.clientId = fltClients.value; render(); };
    fltJobs.onchange     = () => { state.filter.jobState = fltJobs.value; render(); };
    fltTotals.onchange   = () => { state.filter.totals = fltTotals.value; renderTotalsOnly(); };
    fltAssignee.onchange = () => { state.filter.assignee = fltAssignee.value; render(); };

    addClientBtn.onclick = addClient;
    addJobBtn.onclick    = addJob;

    // popover events
    popoverClear.onclick = () => {
      $$('input[type="checkbox"]', popover).forEach(ch => ch.checked = false);
    };
    popoverClose.onclick = () => saveAssignees();

    document.addEventListener('click', (e)=>{
      if(!popover.classList.contains('hidden')){
        if(!popover.contains(e.target) && !e.target.closest('.assignee-badge')){
          hidePopover();
        }
      }
    });

    // první load
    await loadAll();
    renderWeekLabel();
    render();
  }

  async function loadAll(){
    // clients
    const { data:cl } = await state.sb.from('clients').select('id,name').order('name',{ascending:true});
    state.clients = cl || [];
    fillClientsSelects();

    // jobs
    const { data:jobs } = await state.sb.from('jobs')
      .select('id,client_id,name,status,assignees')
      .order('id',{ascending:true});
    state.jobs = (jobs||[]).map(j => ({
      ...j,
      assignees: normalizeAssignees(j.assignees)
    }));

    // entries pro aktuální týden jen pro aktuálního uživatele (k editaci)
    await loadWeekEntries();
  }

  function normalizeAssignees(val){
    if(Array.isArray(val)) return val;
    if(!val) return [];
    try { return JSON.parse(val); } catch { return []; }
  }

  async function loadWeekEntries(){
    const start = state.weekStart;
    const end   = addDays(start, 6);
    const { data:rows } = await state.sb.from('time_entry')
      .select('job_id,date,hours,user_email')
      .gte('date', iso(start))
      .lte('date', iso(end));

    state.entriesByJobDay.clear();
    state.totalsPerDay = [0,0,0,0,0];

    (rows||[]).forEach(r=>{
      const d = new Date(r.date);
      const day = d.getDay(); // 0=Ne, 1=Po
      if(day<1 || day>5) return;
      const idx = day-1;
      const key = `${r.job_id}:${idx}`;

      // ukládáme per uživatel zvlášť (abychom věděli své editace)
      const rec = state.entriesByJobDay.get(key) || { byUser:new Map() };
      const ukey = (r.user_email||'').toLowerCase();
      const prev = rec.byUser.get(ukey) || 0;
      rec.byUser.set(ukey, prev + Number(r.hours||0));
      state.entriesByJobDay.set(key, rec);

      // denní součet (všichni) – pro spodní řádek
      state.totalsPerDay[idx] += Number(r.hours||0);
    });
  }

  function fillClientsSelects(){
    fltClients.innerHTML = `<option value="all">Všichni klienti</option>` + 
      state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    newJobClient.innerHTML = `<option value="">— vyber klienta —</option>` +
      state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  function renderWeekLabel(){
    const s = state.weekStart;
    const e = addDays(s, 4); // Po–Pá
    weekLabel.textContent = `${fmtDate(s)} – ${fmtDate(e)}`;
  }

  function shiftWeek(deltaDays){
    state.weekStart = addDays(state.weekStart, deltaDays);
    renderWeekLabel();
    loadWeekEntries().then(render);
  }

  function renderTotalsOnly(){
    // Přepočti jen pravý sloupec (celkové součty za job)
    render(); // je rychlé, necháme kompletně (kvůli filtru)
  }

  function jobMatchesFilters(job){
    if(state.filter.clientId !== 'all' && String(job.client_id) !== String(state.filter.clientId)) return false;
    if(state.filter.jobState !== 'all' && job.status !== state.filter.jobState) return false;

    // Assignee filtr
    const arr = job.assignees || [];
    const flt = state.filter.assignee;
    if(flt === 'none' && arr.length > 0) return false;
    if(flt !== 'none' && flt !== 'all' && !arr.includes(flt)) return false;

    return true;
  }

  async function render(){
    // přefiltruj jobs
    const jobs = state.jobs.filter(jobMatchesFilters);

    // Připrav obsah TB
    tableBody.innerHTML = '';
    const currentEmail = (state.user?.email||'').toLowerCase();

    // day header uses Po–Pá; pro data budeme držet dayIdx 0..4 (Po..Pá)
    const frag = document.createDocumentFragment();

    for(const job of jobs){
      const tr = document.createElement('tr');

      // klient
      const tdClient = document.createElement('td');
      tdClient.className = 'client-cell';
      const cl = state.clients.find(c=>String(c.id)===String(job.client_id));
      tdClient.innerHTML = `<div class="cell-pill">${escapeHtml(cl?.name || '')}</div>`;
      tr.appendChild(tdClient);

      // zakázka (inline edit názvu)
      const tdJob = document.createElement('td');
      tdJob.className = 'job-cell';
      const jobInput = document.createElement('input');
      jobInput.value = job.name;
      jobInput.className = 'cell-pill';
      jobInput.onchange = async () => {
        await state.sb.from('jobs').update({ name: jobInput.value }).eq('id', job.id);
        job.name = jobInput.value;
      };
      tdJob.appendChild(jobInput);
      tr.appendChild(tdJob);

      // status (pill)
      const tdStatus = document.createElement('td');
      tdStatus.style.textAlign = 'left';
      const st = document.createElement('button');
      st.className = 'status';
      applyStatusClass(st, job.status);
      st.textContent = statusLabel(job.status);
      st.onclick = async ()=>{
        const order = ['new','open','done'];
        const next = order[(order.indexOf(job.status)+1)%order.length];
        await state.sb.from('jobs').update({ status: next }).eq('id', job.id);
        job.status = next;
        applyStatusClass(st, next);
        st.textContent = statusLabel(next);
      };
      tdStatus.appendChild(st);

      // assignee badge (otevírá popover)
      const badge = document.createElement('button');
      badge.className = 'assignee-badge';
      badge.textContent = 'Grafik';
      badge.onclick = (ev) => openAssignees(job, ev.clientX, ev.clientY);
      tdStatus.appendChild(document.createTextNode(' '));
      tdStatus.appendChild(badge);

      // koš – bez podbarvení
      const del = document.createElement('button');
      del.className = 'btn-trash';
      del.innerHTML = '🗑️';
      del.title = 'Smazat zakázku';
      del.onclick = async ()=>{
        if(confirm('Smazat zakázku i s časem?')){
          await state.sb.from('time_entry').delete().eq('job_id', job.id);
          await state.sb.from('jobs').delete().eq('id', job.id);
          // stáhni znovu lokální data
          await loadAll();
          render();
        }
      };
      tdStatus.appendChild(document.createTextNode(' '));
      tdStatus.appendChild(del);

      tr.appendChild(tdStatus);

      // Po–Pá bubliny
      for(let d=0; d<5; d++){
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        const bub = document.createElement('div');
        bub.className = 'bubble';

        const key = `${job.id}:${d}`;
        const rec = state.entriesByJobDay.get(key);
        const myHours = rec?.byUser?.get(currentEmail) || 0;
        bub.textContent = formatHours(myHours);

        // klikání: +0.5 / -0.5 (pravé tlačítko)
        bub.onclick = async (ev) => {
          await adjustHours(job.id, d, +0.5);
        };
        bub.oncontextmenu = async (ev) => {
          ev.preventDefault();
          await adjustHours(job.id, d, -0.5);
        };

        td.appendChild(bub);
        tr.appendChild(td);
      }

      // total cell – podle „Součty: Já/Všichni“
      const tdTotal = document.createElement('td');
      tdTotal.className = 'total-cell';
      const spanTotal = document.createElement('span');
      spanTotal.className = 'total';
      spanTotal.textContent = await getTotalForJob(job.id);
      tdTotal.appendChild(spanTotal);
      tr.appendChild(tdTotal);

      frag.appendChild(tr);
    }

    tableBody.appendChild(frag);

    // spodní řádek (součty za den) – přepočítat po renderu
    updateFooterDayTotals();
  }

  function applyStatusClass(el, st){
    el.classList.remove('is-new','is-open','is-done');
    if(st==='new') el.classList.add('is-new');
    else if(st==='open') el.classList.add('is-open');
    else el.classList.add('is-done');
  }
  function statusLabel(st){
    if(st==='new') return 'Nová';
    if(st==='open') return 'Probíhá';
    return 'Hotovo';
  }

  async function getTotalForJob(jobId){
    // Součet napříč všemi týdny. Pokud filter.totals==='mine', jen můj e-mail.
    const q = state.sb.from('time_entry').select('hours').eq('job_id', jobId);
    if(state.filter.totals === 'mine'){
      q.eq('user_email', state.user.email);
    }
    const { data } = await q;
    const sum = (data||[]).reduce((s,r)=>s + Number(r.hours||0), 0);
    return formatHours(sum);
  }

  function updateFooterDayTotals(){
    // denní součty přes všechny jobs (všichni uživatelé)
    tfootChips.forEach((cell, idx)=>{
      cell.textContent = formatHours(state.totalsPerDay[idx]);
    });
  }

  async function adjustHours(jobId, dayIdx, delta){
    // změna zapsaná pro aktuálního uživatele a konkrétní den
    const date = addDays(state.weekStart, dayIdx+1-1); // Po je dayIdx=0 → Po
    const dStr = iso(date);
    const me = state.user.email;

    // načti existující záznam pro (jobId, date, me)
    const { data:rows } = await state.sb.from('time_entry')
      .select('id,hours')
      .eq('job_id', jobId).eq('date', dStr).eq('user_email', me);

    const prev = (rows && rows[0]) ? Number(rows[0].hours||0) : 0;
    let next = prev + delta;
    if(next < 0) next = 0;       // nezáporné (žádané chování)
    next = Math.round(next*2)/2; // krok 0,5

    if(rows && rows[0]){
      if(next === 0){
        await state.sb.from('time_entry').delete().eq('id', rows[0].id);
      }else{
        await state.sb.from('time_entry').update({ hours: next }).eq('id', rows[0].id);
      }
    }else{
      if(next > 0){
        await state.sb.from('time_entry').insert({
          job_id: jobId, user_email: me, date: dStr, hours: next
        });
      }
    }

    // refresh pouze týdenních dat (rychlé)
    await loadWeekEntries();
    render();
  }

  // --------- assignee popover ----------
  function openAssignees(job, clientX, clientY){
    popoverJobId = job.id;
    // vyplň checkboxy
    const set = new Set(job.assignees||[]);
    $$('input[type="checkbox"]', popover).forEach(ch=>{
      ch.checked = set.has(ch.value);
    });

    popover.style.left = Math.min(window.innerWidth-240, clientX+8)+'px';
    popover.style.top  = Math.min(window.innerHeight-200, clientY+8)+'px';
    popover.classList.remove('hidden');
  }
  function hidePopover(){
    popover.classList.add('hidden');
    popoverJobId = null;
  }
  async function saveAssignees(){
    if(!popoverJobId) return hidePopover();
    const selected = $$('input[type="checkbox"]', popover).filter(ch=>ch.checked).map(ch=>ch.value);
    await state.sb.from('jobs').update({ assignees: JSON.stringify(selected) }).eq('id', popoverJobId);
    const j = state.jobs.find(x=>x.id===popoverJobId);
    if(j) j.assignees = selected;
    hidePopover();
    render();
  }

  // --------- akce Přidat klienta / zakázku ----------
  async function addClient(){
    const name = (newClientName.value||'').trim();
    if(!name) return;
    const { data, error } = await state.sb.from('clients').insert({ name }).select('id,name').single();
    if(!error && data){
      state.clients.push(data);
      newClientName.value='';
      fillClientsSelects();
    }
  }

  async function addJob(){
    const clientId = newJobClient.value;
    const name = (newJobName.value||'').trim();
    if(!clientId || !name) return;

    const status = 'open'; // výchozí „Nová / Probíhá“ podle zadání
    const assignees = Array.from(newJobAssignees.selectedOptions).map(o=>o.value);

    const { data, error } = await state.sb.from('jobs')
      .insert({ client_id: clientId, name, status, assignees: JSON.stringify(assignees) })
      .select('id,client_id,name,status,assignees')
      .single();

    if(!error && data){
      data.assignees = normalizeAssignees(data.assignees);
      state.jobs.push(data);
      newJobName.value='';
      render();
    }
  }

  async function exportToExcel(){
    // export zobrazeného týdne, jen řádky s hodinami v týdnu
    const start = state.weekStart;
    const end   = addDays(start, 4);

    // načti týdenní záznamy z DB (všichni uživ.)
    const { data:rows } = await state.sb.from('time_entry')
      .select('job_id,date,hours,user_email')
      .gte('date', iso(start))
      .lte('date', iso(end));

    // data pro export – seskupit podle job_id
    const weekByJob = new Map(); // jobId -> {perDay[5], totalRow}
    (rows||[]).forEach(r=>{
      const d = new Date(r.date); const day = d.getDay(); if(day<1||day>5) return;
      const idx = day-1;
      let o = weekByJob.get(r.job_id);
      if(!o){ o = { perDay:[0,0,0,0,0] }; weekByJob.set(r.job_id,o); }
      o.perDay[idx] += Number(r.hours||0);
    });

    // Připrav list s hlavičkou (Uživatel a rozsah)
    const wb = XLSX.utils.book_new();

    // Hlavička
    const header = [
      ['Výkaz práce'],
      [`Uživatel: ${emailToName(state.user?.email)}`],
      [`Týden: ${fmtDate(start)} – ${fmtDate(end)}`],
      ['']
    ];

    // Hlavička tabulky – místo Po/Út… vypiš datumy
    const headerRow = ['Klient', 'Zakázka',
      fmtDay(start,0),
      fmtDay(start,1),
      fmtDay(start,2),
      fmtDay(start,3),
      fmtDay(start,4)
    ];

    const rowsOut = [ ...header, headerRow ];

    // Seřazený průřez podle filtrů + jen řádky s hodinami v týdnu
    const jobs = state.jobs.filter(jobMatchesFilters);
    for(const job of jobs){
      const w = weekByJob.get(job.id);
      const weekSum = w ? w.perDay.reduce((a,b)=>a+b,0) : 0;
      if(weekSum <= 0) continue; // vynechat prázdné týdny (žádané)

      const cl = state.clients.find(c=>String(c.id)===String(job.client_id));
      rowsOut.push([
        cl?.name || '',
        job.name,
        formatHours(w?.perDay[0]||0),
        formatHours(w?.perDay[1]||0),
        formatHours(w?.perDay[2]||0),
        formatHours(w?.perDay[3]||0),
        formatHours(w?.perDay[4]||0),
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(rowsOut);
    XLSX.utils.book_append_sheet(wb, ws, "Výkaz");

    // název souboru s jménem (ne e-mailem)
    const fileName = `vykaz_${fmtISO(start)}_${fmtISO(end)}_${emailToName(state.user?.email)}.xlsx`;
    XLSX.writeFile(wb, fileName);
  }

  async function logout(){
    await state.sb.auth.signOut();
    location.reload();
  }

  // ---------------- util -----------------
  function mondayOf(d){
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = x.getDay();
    const diff = (day === 0 ? -6 : 1 - day);
    x.setDate(x.getDate()+diff);
    x.setHours(0,0,0,0);
    return x;
  }
  function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function iso(d){ return d.toISOString().slice(0,10); }
  function fmtDate(d){ return d.toLocaleDateString('cs-CZ', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  function fmtISO(d){ return d.toISOString().slice(0,10); }
  function fmtDay(start, offset){
    const d = addDays(start, offset);
    const wd = d.toLocaleDateString('cs-CZ',{ weekday:'short' });
    const ds = d.toLocaleDateString('cs-CZ',{ day:'2-digit', month:'2-digit' });
    return `${wd} ${ds}`;
  }
  function formatHours(n){
    n = Math.round(Number(n||0)*2)/2;
    return (n % 1 === 0) ? String(n) : String(n);
  }
  function escapeHtml(s){ return (s||'').replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
})();
