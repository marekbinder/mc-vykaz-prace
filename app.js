/* App – robustní verze s autodetekcí schématu hodin
   - Načítá config.json (url/anon nebo supabaseUrl/supabaseAnonKey)
   - Klik = +0.5h, Alt/Meta/Ctrl+klik = -0.5h (nezáporné)
   - Součty: Já / Všichni
   - Export XLSX: autor = Marek/Viki/Standa (grafika@media-consult.cz), hlavička Po–Pá, vynechá 0h řádky
   - Autodetekce: tabulka time_entry/time_entries + sloupec date/work_date
*/

const EMAIL_NAME_MAP = {
  "binder.marek@gmail.com": "Marek",
  "grafika@media-consult.cz": "Viki",
  "stanislav.hron@icloud.com": "Standa",
};

// utils
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const showWarn = (t)=>{ const w=$("#warn"); w.textContent=t; w.classList.toggle("hide", !t); };

function toISO(d){ const x=new Date(d.getTime()-d.getTimezoneOffset()*60000); return x.toISOString().slice(0,10); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x=new Date(d); x.setHours(0,0,0,0); const wd=x.getDay(); const diff=(wd===0?-6:1-wd); x.setDate(x.getDate()+diff); return x; }
function fmtWeekLabel(st,en){ const f=(d)=>d.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"}); return `${f(st)} – ${f(en)}`; }
function emailToName(e){ const k=String(e||"").toLowerCase(); return EMAIL_NAME_MAP[k] || (String(e||"").split("@")[0]||""); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
function num(v){ return (Math.round(v*2)/2).toString().replace(".",","); }

// state
const state = {
  sb:null,
  user:null,
  weekStart:startOfWeek(new Date()),
  clients:[],
  jobs:[],
  myHours:new Map(),   // jobId -> {date: hours}
  allHours:new Map(),  // jobId -> {date: hours}
  hoursTable:"time_entry",   // autodetekce
  hoursDateCol:"date",       // autodetekce
};

// init
window.addEventListener("DOMContentLoaded", init);

async function init(){
  bindUI();
  setWeekLabel();

  await loadConfig(); // nastaví state.sb nebo ukáže varování
  if (!state.sb) return; // bez DB nemá smysl pokračovat

  try {
    const { data:{ user } } = await state.sb.auth.getUser();
    state.user = user || { email:"" };
  } catch(e){ console.error(e); showWarn("Nepodařilo se načíst uživatele."); }

  $("#userEmail").textContent = state.user?.email || "";

  await safeLoadAll();
  renderAll();
}

// načtení configu (podpora obou schémat klíčů)
async function loadConfig() {
  try {
    const res = await fetch('config.json', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();

    const url  = cfg.url  || cfg.supabaseUrl;
    const anon = cfg.anon || cfg.supabaseAnonKey;

    if (!url || !anon) throw new Error('Chybí "url/anon" nebo "supabaseUrl/supabaseAnonKey".');

    state.sb = window.supabase.createClient(url, anon);
    showWarn(""); // schovat případné varování
  } catch (e) {
    console.error('Config load error:', e);
    showWarn('Nepodařilo se načíst konfiguraci (config.json). UI běží, ale data se nenačtou.');
  }
}

// UI
function bindUI(){
  $("#prevWeek").addEventListener("click", ()=>{ state.weekStart = addDays(state.weekStart,-7); setWeekLabel(); renderAll(); });
  $("#nextWeek").addEventListener("click", ()=>{ state.weekStart = addDays(state.weekStart,+7); setWeekLabel(); renderAll(); });
  $("#btnSignOut").addEventListener("click", async ()=>{ try{ await state.sb?.auth.signOut(); }catch{} location.reload(); });
  $("#btnExport").addEventListener("click", exportToExcel);

  $("#filterClients").addEventListener("change", renderAll);
  $("#filterJobs").addEventListener("change", renderAll);
  $("#filterSumMode").addEventListener("change", renderAll);
  $("#filterAssignee").addEventListener("change", renderAll);

  $("#btnAddClient").addEventListener("click", addClient);
  $("#btnAddJob").addEventListener("click", addJob);
}

function setWeekLabel(){
  const st = state.weekStart, en = addDays(st,4);
  $("#weekLabel").textContent = fmtWeekLabel(st,en);
}

// data
async function safeLoadAll(){
  try { await loadClients(); } catch(e){ console.error(e); showWarn("Chyba při načítání klientů."); }
  try { await loadJobs(); }    catch(e){ console.error(e); showWarn("Chyba při načítání zakázek."); }
  try { await loadHours(); }   catch(e){ console.error(e); showWarn(`Chyba při načítání hodin${e?.message?`: ${e.message}`:"."}`); }
  try { fillFilterSources(); } catch(e){ console.error(e); }
}

async function loadClients(){
  const { data, error } = await state.sb.from("clients").select("*").order("name");
  if (error) throw error;
  state.clients = data || [];
}

async function loadJobs(){
  const { data, error } = await state.sb.from("jobs").select("*").order("id",{ascending:true});
  if (error) throw error;
  state.jobs = (data||[]).map(j=>{
    if (typeof j.assignees === "string") {
      try{ j.assignees = JSON.parse(j.assignees); }catch{ j.assignees=[]; }
    }
    if (!Array.isArray(j.assignees)) j.assignees = [];
    return j;
  });
}

/* === AUTODETEKCE SCHÉMATU HODIN === */
async function loadHours(){
  state.myHours.clear(); state.allHours.clear();

  const st = state.weekStart, en = addDays(st,4);

  const candidates = [
    { table:"time_entry",    dateCol:"date" },
    { table:"time_entry",    dateCol:"work_date" },
    { table:"time_entries",  dateCol:"date" },
    { table:"time_entries",  dateCol:"work_date" },
  ];

  let rows=null, chosen=null, lastErr=null;

  for (const c of candidates){
    try{
      const { data, error } = await state.sb
        .from(c.table)
        .select(`job_id, ${c.dateCol}, hours, user_email`)
        .gte(c.dateCol, toISO(st))
        .lte(c.dateCol, toISO(en));

      if (error) { lastErr = error; continue; }
      rows   = data || [];
      chosen = c;
      break;
    }catch(e){ lastErr=e; }
  }

  if (!chosen) {
    throw lastErr || new Error("Nepodařilo se načíst tabulku hodin (neznámé schéma).");
  }

  // zapamatujeme funkční kombinaci pro další operace (klikání atd.)
  state.hoursTable   = chosen.table;
  state.hoursDateCol = chosen.dateCol;

  const me = (state.user?.email||"").toLowerCase();

  for (const r of rows){
    const jobId = String(r.job_id);
    const dISO  = r[ state.hoursDateCol ];
    const h     = Number(r.hours||0);

    if (!state.allHours.has(jobId)) state.allHours.set(jobId, {});
    state.allHours.get(jobId)[dISO] = (state.allHours.get(jobId)[dISO]||0) + h;

    if (String(r.user_email||"").toLowerCase() === me){
      if (!state.myHours.has(jobId)) state.myHours.set(jobId,{});
      state.myHours.get(jobId)[dISO] = (state.myHours.get(jobId)[dISO]||0) + h;
    }
  }
}

function fillFilterSources(){
  const fc = $("#filterClients");
  fc.innerHTML = `<option value="__all__">Všichni klienti</option>` +
    state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  const nj = $("#newJobClient");
  nj.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  $("#filterJobs").innerHTML = `<option value="__all__">Všechny zakázky</option>`;
}

// render
function renderAll(){
  renderTable();
  renderTotals();
}

function jobMatchesFilters(job){
  const clientFilter = $("#filterClients").value;
  if (clientFilter !== "__all__" && String(job.client_id)!==String(clientFilter)) return false;

  const assignee = $("#filterAssignee").value;
  if (assignee === "__none__" && (job.assignees||[]).length) return false;
  if (assignee !== "__any__" && assignee !== "__none__" && !(job.assignees||[]).includes(assignee)) return false;

  return true;
}

function renderTable(){
  const tb = $("#tbodyJobs");
  tb.innerHTML = "";

  const st = state.weekStart;
  const dates = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));

  const list = state.jobs.filter(jobMatchesFilters);

  for (const job of list){
    const tr = document.createElement("tr");

    const tdClient = document.createElement("td");
    tdClient.className = "cell-client";
    tdClient.innerHTML = `<select data-job="${job.id}" class="clientSel">
      ${state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(job.client_id)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}
    </select>`;
    tr.appendChild(tdClient);

    const tdJob = document.createElement("td");
    tdJob.className = "cell-job";
    tdJob.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px;">
        <input class="jobName" data-job="${job.id}" value="${escapeAttr(job.name||"")}" />
        <span class="status-pill ${statusClass(job.status)}">${escapeHtml(job.status||"")}</span>
        <button class="btn-trash" title="Odstranit" aria-label="Odstranit" data-del="${job.id}">🗑</button>
      </div>`;
    tr.appendChild(tdJob);

    const useAll = $("#filterSumMode").value === "all";
    const perObj = (useAll ? state.allHours : state.myHours).get(String(job.id)) || {};

    for (let i=0;i<5;i++){
      const dISO = dates[i];
      const val = Number(perObj[dISO]||0);
      const td = document.createElement("td");
      td.style.textAlign="center";
      td.innerHTML = `<div class="day-bubble" data-job="${job.id}" data-date="${dISO}">${num(val)}</div>`;
      tr.appendChild(td);
    }

    const sum = [0,1,2,3,4].map(i=>Number(perObj[dates[i]]||0)).reduce((a,b)=>a+b,0);
    const tdSum = document.createElement("td");
    tdSum.className = "sum-right";
    tdSum.textContent = num(sum);
    tr.appendChild(tdSum);

    tb.appendChild(tr);
  }

  // delegace
  tb.addEventListener("change", onTableChange, { once:true });
  tb.addEventListener("click", onTableClick, { once:true });
}

function renderTotals(){
  const st = state.weekStart;
  const dates = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));
  const list = state.jobs.filter(jobMatchesFilters);

  const useAll = $("#filterSumMode").value==="all";
  const byDay = [0,0,0,0,0];

  for (const job of list){
    const per = (useAll ? state.allHours : state.myHours).get(String(job.id)) || {};
    for (let i=0;i<5;i++) byDay[i] += Number(per[dates[i]]||0);
  }

  $$(".total-bubble").forEach((el,i)=> el.textContent = num(byDay[i]) );
}

// editace tabulky
async function onTableChange(e){
  const t = e.target;
  try{
    if (t.classList.contains("clientSel")){
      const jobId = Number(t.dataset.job);
      await state.sb.from("jobs").update({ client_id:Number(t.value) }).eq("id",jobId);
      await safeLoadAll(); renderAll();
    }
    if (t.classList.contains("jobName")){
      const jobId = Number(t.dataset.job);
      await state.sb.from("jobs").update({ name:String(t.value) }).eq("id",jobId);
      await safeLoadAll(); renderAll();
    }
  }catch(err){ console.error(err); showWarn("Uložení změny se nepodařilo."); }
}

async function onTableClick(e){
  const del = e.target.closest("[data-del]");
  if (del){
    const id = Number(del.dataset.del);
    if (confirm("Opravdu odstranit zakázku?")){
      try{
        await state.sb.from(state.hoursTable).delete().eq("job_id",id);
        await state.sb.from("jobs").delete().eq("id",id);
        await safeLoadAll(); renderAll();
      }catch(err){ console.error(err); showWarn("Odstranění se nepodařilo."); }
    }
    return;
  }

  const b = e.target.closest(".day-bubble");
  if (b){
    const jobId = Number(b.dataset.job);
    const dateISO = b.dataset.date;
    const minus = e.altKey || e.metaKey || e.ctrlKey;
    try{
      await bumpHours(jobId, dateISO, minus ? -0.5 : +0.5);
      await loadHours(); renderAll();
    }catch(err){ console.error(err); showWarn("Uložení hodin se nepodařilo."); }
  }
}

async function bumpHours(jobId, dateISO, delta){
  const email = String(state.user?.email||"");

  // najdeme případný existující záznam pro daný den
  const { data: rows } = await state.sb.from(state.hoursTable).select("*")
        .eq("job_id",jobId).eq(state.hoursDateCol,dateISO).eq("user_email",email).limit(1);
  const cur = rows?.[0];

  let hours = Math.max(0, Number(cur?.hours||0) + delta);
  hours = Math.round(hours*2)/2;

  if (!cur && hours>0){
    await state.sb.from(state.hoursTable).insert({ job_id:jobId, user_email:email, [state.hoursDateCol]:dateISO, hours });
  } else if (cur && hours>0){
    await state.sb.from(state.hoursTable).update({ hours }).eq("id",cur.id);
  } else if (cur && hours<=0){
    await state.sb.from(state.hoursTable).delete().eq("id",cur.id);
  }
}

// přidání
async function addClient(){
  const name = $("#newClientName").value.trim();
  if (!name) return;
  try{
    await state.sb.from("clients").insert({ name });
    $("#newClientName").value="";
    await safeLoadAll(); renderAll();
  }catch(err){ console.error(err); showWarn("Přidání klienta se nepodařilo."); }
}

async function addJob(){
  const clientId = Number($("#newJobClient").value);
  const name = $("#newJobName").value.trim();
  const status = $("#newJobStatus").value.trim();
  if (!name) return;
  try{
    await state.sb.from("jobs").insert({ name, status, client_id:clientId });
    $("#newJobName").value="";
    await safeLoadAll(); renderAll();
  }catch(err){ console.error(err); showWarn("Přidání zakázky se nepodařilo."); }
}

// export
async function exportToExcel(){
  try{
    const XLSX = window.XLSX;
    if (!XLSX?.utils) return alert("Chybí XLSX knihovna.");

    const st = state.weekStart, en = addDays(st,4);

    const rows = [];
    rows.push(["Výkaz práce"]);
    rows.push([`Uživatel: ${emailToName(state.user?.email)}`]);
    rows.push([`Týden: ${st.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"})} – ${en.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"})}`]);
    rows.push([""]);

    const header = ["Klient","Zakázka"];
    for (let i=0;i<5;i++){
      const d = addDays(st,i);
      const wd = d.toLocaleDateString("cs-CZ",{weekday:"short"});
      const dm = d.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit"});
      header.push(`${wd} ${dm}`);
    }
    rows.push(header);

    const useAll = $("#filterSumMode").value==="all";
    const datesISO = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));
    const visible = state.jobs.filter(jobMatchesFilters);

    for (const job of visible){
      const perObj = (useAll ? state.allHours : state.myHours).get(String(job.id)) || {};
      const per = datesISO.map(d=>Number(perObj[d]||0));
      const sum = per.reduce((a,b)=>a+b,0);
      if (sum<=0) continue; // vynechat prázdné řádky

      const clientName = state.clients.find(c=>String(c.id)===String(job.client_id))?.name || "";
      rows.push([clientName, job.name || "", ...per.map(v=>Math.round(v*2)/2)]);
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Výkaz");

    const who = emailToName(state.user?.email);
    XLSX.writeFile(wb, `vykaz_${toISO(st)}_${toISO(en)}_${who}.xlsx`);
  }catch(err){
    console.error(err);
    showWarn("Export do Excelu se nepodařil.");
  }
}

function statusClass(s){
  if (!s) return "status-new";
  const t = s.toLowerCase();
  if (t.includes("hotovo")) return "status-done";
  if (t.includes("prob"))   return "status-doing";
  return "status-new";
}
