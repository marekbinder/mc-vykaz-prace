/* ====== Robustní verze bez tvrdých throw v initu ====== */

const EMAIL_NAME_MAP = {
  "binder.marek@gmail.com": "Marek",
  "grafika@media-consult.cz": "Viki",
  "stanislav.hron@icloud.com": "Standa",
};

// utils
const $  = (s, r=document)=>r.querySelector(s);
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
const warn = (t)=>{ const w=$("#warn"); w.textContent=t; w.classList.remove("hide"); };
const clearWarn = ()=>$("#warn").classList.add("hide");

function toISO(d){ const x=new Date(d.getTime()-d.getTimezoneOffset()*60000); return x.toISOString().slice(0,10); }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function startOfWeek(d){ const x=new Date(d); x.setHours(0,0,0,0); const wd=x.getDay(); const diff=(wd===0?-6:1-wd); x.setDate(x.getDate()+diff); return x; }
function fmtWeekLabel(st,en){ const f=(d)=>d.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"}); return `${f(st)} – ${f(en)}`; }
function emailToName(e){ const k=String(e||"").toLowerCase(); return EMAIL_NAME_MAP[k] || (String(e||"").split("@")[0]||""); }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g,m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }
function num(v){ return (Math.round(v*2)/2).toString().replace(".",","); }
function parseNum(s){ return Number(String(s).replace(",", ".")) || 0; }
function statusClass(s){ if(!s) return "status-new"; const t=s.toLowerCase(); if(t.includes("hotovo"))return"status-done"; if(t.includes("prob"))return"status-doing"; return"status-new"; }
function labelDay(st,plus){ const d=addDays(st,plus); const wd=d.toLocaleDateString("cs-CZ",{weekday:"short"}); const dm=d.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit"}); return `${wd} ${dm}`; }

// state
const state = {
  sb:null,
  user:null,
  weekStart:startOfWeek(new Date()),
  clients:[],
  jobs:[],
  myHours:new Map(),   // jobId -> {date: hours}
  allHours:new Map(),  // jobId -> {date: hours}
};

// init
window.addEventListener("DOMContentLoaded", init);

async function init(){
  bindUI();

  // Týden ukážeme hned, i kdyby data selhala.
  setWeekLabel();

  try {
    const cfg = await (await fetch("config.json")).json();
    state.sb = supabase.createClient(cfg.url, cfg.anon);
  } catch(e){
    console.error(e);
    warn("Nepodařilo se načíst konfiguraci (config.json). UI běží, ale data se nenačtou.");
    return;
  }

  try {
    const { data:{ user } } = await state.sb.auth.getUser();
    state.user = user || { email:"" };
    $("#userEmail").textContent = state.user.email || "";
  } catch(e){
    console.error(e);
    warn("Nepodařilo se načíst uživatele. Pokračuji bez přihlášení.");
  }

  await safeLoadAll();
  renderAll();
}

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

async function safeLoadAll(){
  clearWarn();
  try { await loadClients(); } catch(e){ console.error(e); warn("Chyba při načítání klientů."); }
  try { await loadJobs(); }    catch(e){ console.error(e); warn("Chyba při načítání zakázek."); }
  try { await loadHours(); }   catch(e){ console.error(e); warn("Chyba při načítání hodin."); }
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
    if (typeof j.assignees === "string") { try{ j.assignees = JSON.parse(j.assignees); }catch{ j.assignees=[]; } }
    if (!Array.isArray(j.assignees)) j.assignees = [];
    return j;
  });
}

async function loadHours(){
  state.myHours.clear(); state.allHours.clear();

  const st = state.weekStart, en = addDays(st,4);
  const { data: rows, error } = await state.sb.from("time_entry")
      .select("job_id,date,hours,user_email")
      .gte("date", toISO(st)).lte("date", toISO(en));
  if (error) throw error;

  const me = (state.user?.email||"").toLowerCase();
  for (const r of (rows||[])){
    const key = String(r.job_id);
    if (!state.allHours.has(key)) state.allHours.set(key, {});
    state.allHours.get(key)[r.date] = (state.allHours.get(key)[r.date]||0) + Number(r.hours||0);

    if (String(r.user_email||"").toLowerCase() === me){
      if (!state.myHours.has(key)) state.myHours.set(key,{});
      state.myHours.get(key)[r.date] = (state.myHours.get(key)[r.date]||0) + Number(r.hours||0);
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
  }catch(err){ console.error(err); warn("Uložení změny se nepodařilo."); }
}

async function onTableClick(e){
  const del = e.target.closest("[data-del]");
  if (del){
    const id = Number(del.dataset.del);
    if (confirm("Opravdu odstranit zakázku?")){
      try{
        await state.sb.from("time_entry").delete().eq("job_id",id);
        await state.sb.from("jobs").delete().eq("id",id);
        await safeLoadAll(); renderAll();
      }catch(err){ console.error(err); warn("Odstranění se nepodařilo."); }
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
    }catch(err){ console.error(err); warn("Uložení hodin se nepodařilo."); }
  }
}

async function bumpHours(jobId, dateISO, delta){
  const email = String(state.user?.email||"");
  const { data: rows } = await state.sb.from("time_entry").select("*").eq("job_id",jobId).eq("user_email",email).eq("date",dateISO).limit(1);
  const cur = rows?.[0];
  let hours = Math.max(0, Number(cur?.hours||0) + delta);
  hours = Math.round(hours*2)/2;

  if (!cur && hours>0){
    await state.sb.from("time_entry").insert({ job_id:jobId, user_email:email, date:dateISO, hours });
  } else if (cur && hours>0){
    await state.sb.from("time_entry").update({ hours }).eq("id",cur.id);
  } else if (cur && hours<=0){
    await state.sb.from("time_entry").delete().eq("id",cur.id);
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
  }catch(err){ console.error(err); warn("Přidání klienta se nepodařilo."); }
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
  }catch(err){ console.error(err); warn("Přidání zakázky se nepodařilo."); }
}

// export
async function exportToExcel(){
  try{
    const XLSX = window.XLSX;
    if (!XLSX?.utils) return alert("Chybí XLSX knihovna.");

    const st = state.weekStart, en = addDays(st,4);
    const dates = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));
    const visibleJobs = state.jobs.filter(jobMatchesFilters);

    const rows = [];
    rows.push(["Výkaz práce"]);
    rows.push([`Uživatel: ${emailToName(state.user?.email)}`]);
    rows.push([`Týden: ${st.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"})} – ${en.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"})}`]);
    rows.push([""]);

    rows.push([
      "Klient","Zakázka",
      labelDay(st,0), labelDay(st,1), labelDay(st,2), labelDay(st,3), labelDay(st,4)
    ]);

    const useAll = $("#filterSumMode").value==="all";

    for (const job of visibleJobs){
      const perObj = (useAll ? state.allHours : state.myHours).get(String(job.id)) || {};
      const per = dates.map(d=>Number(perObj[d]||0));
      const sum = per.reduce((a,b)=>a+b,0);
      if (sum<=0) continue; // vynechat prázdné

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
    warn("Export do Excelu se nepodařil.");
  }
}
