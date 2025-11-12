/* Stabilní verze – bez „přejmenovávání“ v Excelu a bez autodetekce schématu.
   Hodiny: tabulka time_entry { id, job_id, user_email, date, hours }.
   Klik = +0.5h, (Alt/Ctrl/Meta)+klik = -0.5h. Hodiny nejdou pod nulu.
*/

const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));

const state = {
  sb:null,
  user:null,
  weekStart:startOfWeek(new Date()),
  clients:[],
  jobs:[],
  myHours:new Map(),
  allHours:new Map()
};

window.addEventListener("DOMContentLoaded", init);

async function init(){
  bindUI();
  setWeekLabel();

  await loadConfig();
  if (!state.sb) return;

  try{
    const { data:{ user } } = await state.sb.auth.getUser();
    state.user = user || { email:"" };
  }catch(e){ console.error(e); }
  $("#userEmail").textContent = state.user?.email || "";

  await loadEverything();
  renderAll();
}

/* ---------- UI ---------- */
function bindUI(){
  $("#prevWeek").addEventListener("click", ()=>{ state.weekStart = addDays(state.weekStart,-7); setWeekLabel(); renderAll(); });
  $("#nextWeek").addEventListener("click", ()=>{ state.weekStart = addDays(state.weekStart,+7); setWeekLabel(); renderAll(); });
  $("#btnSignOut").addEventListener("click", async ()=>{ try{ await state.sb.auth.signOut(); }catch{} location.reload(); });
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
  $("#weekLabel").textContent = `${fmtDate(st)} – ${fmtDate(en)}`;
}

/* ---------- DATA ---------- */
async function loadConfig(){
  try{
    const res = await fetch('config.json', { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const cfg = await res.json();

    const url  = cfg.url  || cfg.supabaseUrl;
    const anon = cfg.anon || cfg.supabaseAnonKey;
    if (!url || !anon) throw new Error("Chybí url/anon v config.json.");

    state.sb = supabase.createClient(url, anon);
    $("#warn").classList.add("hide");
  }catch(err){
    console.error(err);
    showWarn("Nepodařilo se načíst konfiguraci (config.json). UI běží, ale data se nenačtou.");
  }
}

async function loadEverything(){
  try{
    await Promise.all([loadClients(), loadJobs()]);
    fillFilterSources();
    await loadHours();   // my + all
  }catch(err){
    console.error(err);
    showWarn("Chyba při načítání dat.");
  }
}

async function loadClients(){
  const { data, error } = await state.sb.from("clients").select("*").order("name");
  if (error) throw error;
  state.clients = data || [];
}

async function loadJobs(){
  const { data, error } = await state.sb.from("jobs").select("*").order("id");
  if (error) throw error;
  state.jobs = data || [];
}

async function loadHours(){
  state.myHours.clear();
  state.allHours.clear();

  const stISO = toISO(state.weekStart);
  const enISO = toISO(addDays(state.weekStart,4));

  const { data, error } = await state.sb
    .from("time_entry")
    .select("job_id,user_email,date,hours");
  if (error) throw error;

  const rows = (data||[]).filter(r => r.date >= stISO && r.date <= enISO);
  const me = (state.user?.email||"").toLowerCase();

  for (const r of rows){
    const id = String(r.job_id);
    // ALL
    if (!state.allHours.has(id)) state.allHours.set(id,{});
    state.allHours.get(id)[r.date] = (state.allHours.get(id)[r.date]||0) + Number(r.hours||0);

    // ME
    if (String(r.user_email||"").toLowerCase()===me){
      if (!state.myHours.has(id)) state.myHours.set(id,{});
      state.myHours.get(id)[r.date] = (state.myHours.get(id)[r.date]||0) + Number(r.hours||0);
    }
  }
}

function fillFilterSources(){
  const fc = $("#filterClients");
  fc.innerHTML = `<option value="__all__">Všichni klienti</option>` +
    state.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");

  $("#newJobClient").innerHTML =
    state.clients.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");

  $("#filterJobs").innerHTML = `<option value="__all__">Všechny zakázky</option>`;
}

/* ---------- RENDER ---------- */
function renderAll(){
  renderTable();
  renderTotals();
}

function renderTable(){
  const tb = $("#tbodyJobs");
  tb.innerHTML = "";

  const st = state.weekStart;
  const days = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));

  const useAll = $("#filterSumMode").value==="all";
  const assignee = $("#filterAssignee").value;
  const clientFilter = $("#filterClients").value;

  const rows = state.jobs.filter(j=>{
    if (clientFilter!=="__all__" && String(j.client_id)!==String(clientFilter)) return false;
    if (assignee==="__none__" && j.assignees && j.assignees.length) return false;
    if (assignee!=="__none__" && assignee!=="__any__" && !(j.assignees||[]).includes(assignee)) return false;
    return true;
  });

  for (const job of rows){
    const tr = document.createElement("tr");

    // klient
    const tdC = document.createElement("td");
    tdC.className="cell-client";
    tdC.innerHTML = `<select class="clientSel" data-job="${job.id}">
      ${state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(job.client_id)?"selected":""}>${esc(c.name)}</option>`).join("")}
    </select>`;
    tr.appendChild(tdC);

    // zakázka + status + koš
    const tdJ = document.createElement("td");
    tdJ.className="cell-job";
    tdJ.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <input class="jobName" data-job="${job.id}" value="${escAttr(job.name||"")}" />
        <span class="status-pill ${statusClass(job.status)}">${esc(job.status||"")}</span>
        <button class="btn-trash" data-del="${job.id}" title="Odstranit" aria-label="Odstranit">🗑</button>
      </div>`;
    tr.appendChild(tdJ);

    // dny
    const per = (useAll?state.allHours:state.myHours).get(String(job.id)) || {};
    for (let i=0;i<5;i++){
      const h = Number(per[days[i]]||0);
      const td = document.createElement("td");
      td.innerHTML = `<div class="day-bubble" data-job="${job.id}" data-date="${days[i]}">${fmtNum(h)}</div>`;
      tr.appendChild(td);
    }

    // celkem
    const sum = [0,1,2,3,4].map(i=>Number(per[days[i]]||0)).reduce((a,b)=>a+b,0);
    const tdS = document.createElement("td");
    tdS.className = "sum-right";
    tdS.textContent = fmtNum(sum);
    tr.appendChild(tdS);

    tb.appendChild(tr);
  }

  tb.addEventListener("change", onTableChange, { once:true });
  tb.addEventListener("click", onTableClick, { once:true });
}

function renderTotals(){
  const st = state.weekStart;
  const days = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));
  const useAll = $("#filterSumMode").value==="all";
  const clientFilter = $("#filterClients").value;
  const assignee = $("#filterAssignee").value;

  const rows = state.jobs.filter(j=>{
    if (clientFilter!=="__all__" && String(j.client_id)!==String(clientFilter)) return false;
    if (assignee==="__none__" && j.assignees && j.assignees.length) return false;
    if (assignee!=="__none__" && assignee!=="__any__" && !(j.assignees||[]).includes(assignee)) return false;
    return true;
  });

  const byDay = [0,0,0,0,0];
  for (const j of rows){
    const per = (useAll?state.allHours:state.myHours).get(String(j.id)) || {};
    for (let i=0;i<5;i++) byDay[i] += Number(per[days[i]]||0);
  }
  $$(".total-bubble").forEach((el,i)=> el.textContent = fmtNum(byDay[i]) );
}

/* ---------- EDITACE ---------- */
async function onTableChange(e){
  const t = e.target;
  try{
    if (t.classList.contains("clientSel")){
      const jobId = Number(t.dataset.job);
      await state.sb.from("jobs").update({ client_id:Number(t.value) }).eq("id",jobId);
      await loadEverything(); renderAll();
    }
    if (t.classList.contains("jobName")){
      const jobId = Number(t.dataset.job);
      await state.sb.from("jobs").update({ name:String(t.value) }).eq("id",jobId);
      await loadEverything(); renderAll();
    }
  }catch(err){ console.error(err); showWarn("Uložení změny se nepodařilo."); }
}

async function onTableClick(e){
  const del = e.target.closest("[data-del]");
  if (del){
    const id = Number(del.dataset.del);
    if (confirm("Opravdu odstranit zakázku?")){
      try{
        await state.sb.from("time_entry").delete().eq("job_id",id);
        await state.sb.from("jobs").delete().eq("id",id);
        await loadEverything(); renderAll();
      }catch(err){ console.error(err); showWarn("Odstranění se nepodařilo."); }
    }
    return;
  }

  const b = e.target.closest(".day-bubble");
  if (b){
    const jobId = Number(b.dataset.job);
    const dateISO = b.dataset.date;
    const minus = e.altKey || e.ctrlKey || e.metaKey;
    try{
      await bumpHours(jobId, dateISO, minus?-0.5:+0.5);
      await loadHours(); renderAll();
    }catch(err){ console.error(err); showWarn("Uložení hodin se nepodařilo."); }
  }
}

async function bumpHours(jobId, dateISO, delta){
  const email = String(state.user?.email||"");
  const { data, error } = await state.sb.from("time_entry")
    .select("*").eq("job_id",jobId).eq("date",dateISO).eq("user_email",email).limit(1);
  if (error) throw error;

  const cur = data?.[0];
  let hours = Math.max(0, Number(cur?.hours||0) + delta);
  hours = Math.round(hours*2)/2;

  if (!cur && hours>0){
    await state.sb.from("time_entry").insert({ job_id:jobId, user_email:email, date:dateISO, hours });
  }else if (cur && hours>0){
    await state.sb.from("time_entry").update({ hours }).eq("id",cur.id);
  }else if (cur && hours<=0){
    await state.sb.from("time_entry").delete().eq("id",cur.id);
  }
}

/* ---------- PŘIDÁNÍ ---------- */
async function addClient(){
  const name = $("#newClientName").value.trim();
  if (!name) return;
  try{
    await state.sb.from("clients").insert({ name });
    $("#newClientName").value="";
    await loadEverything(); renderAll();
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
    await loadEverything(); renderAll();
  }catch(err){ console.error(err); showWarn("Přidání zakázky se nepodařilo."); }
}

/* ---------- EXPORT ---------- */
async function exportToExcel(){
  try{
    const XLSX = window.XLSX;
    const st = state.weekStart, en = addDays(st,4);
    const days = [0,1,2,3,4].map(i=>addDays(st,i));

    const rows = [];
    rows.push(["Výkaz práce"]);
    rows.push([`Uživatel: ${state.user?.email || ""}`]);
    rows.push([`Týden: ${fmtDate(st)} – ${fmtDate(en)}`]);
    rows.push([]);

    const header = ["Klient","Zakázka"];
    for (const d of days){
      const wd = d.toLocaleDateString("cs-CZ",{weekday:"short"});
      const dm = d.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit"});
      header.push(`${wd} ${dm}`);
    }
    rows.push(header);

    const
