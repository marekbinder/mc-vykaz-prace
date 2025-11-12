/* app.js – kompletní */

const EMAIL_NAME_MAP = {
  "binder.marek@gmail.com": "Marek",
  "mac@media-consult.cz": "Viki",
  "stanislav.hron@icloud.com": "Standa",
};

// ---------- Pomocné ----------
const $  = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function toISO(d){ const x=new Date(d.getTime()-d.getTimezoneOffset()*60000); return x.toISOString().slice(0,10); }
function fromISO(s){ const d=new Date(s); d.setHours(0,0,0,0); return d; }
function startOfWeek(d){ const x=new Date(d); x.setHours(0,0,0,0); const wd=x.getDay(); const diff=(wd===0?-6:1-wd); x.setDate(x.getDate()+diff); return x; }
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtWeekLabel(st, en){
  const f = (d)=> d.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"});
  return `${f(st)} – ${f(en)}`;
}
function emailToName(email){
  const key = String(email||"").toLowerCase();
  return EMAIL_NAME_MAP[key] || key.split("@")[0] || "";
}

// ---------- Stav ----------
const state = {
  sb: null,
  user: null,
  weekStart: startOfWeek(new Date()),
  clients: [],
  jobs: [],
  // map jobId-> { 'YYYY-MM-DD' : hoursForCurrentUser }
  myHours: new Map(),
  // map jobId-> { 'YYYY-MM-DD' : sumAllUsers }
  allHours: new Map(),
};

// ---------- Inicializace ----------
window.addEventListener("DOMContentLoaded", init);

async function init(){
  bindUI();

  // Načti config a připoj Supabase
  const cfg = await (await fetch("config.json")).json();
  state.sb = supabase.createClient(cfg.url, cfg.anon);

  // Uživatel
  const { data: { user } } = await state.sb.auth.getUser();
  state.user = user || { email: "(nepřihlášen)" };
  $("#userEmail").textContent = state.user.email;

  await loadAllData();
  renderAll();
}

// ---------- UI vazby ----------
function bindUI(){
  $("#prevWeek").addEventListener("click", ()=>{ state.weekStart = addDays(state.weekStart, -7); renderAll(); });
  $("#nextWeek").addEventListener("click", ()=>{ state.weekStart = addDays(state.weekStart, +7); renderAll(); });
  $("#btnSignOut").addEventListener("click", async ()=>{
    await state.sb.auth.signOut(); location.reload();
  });
  $("#btnExport").addEventListener("click", exportToExcel);

  $("#filterClients").addEventListener("change", renderAll);
  $("#filterJobs").addEventListener("change", renderAll);
  $("#filterSumMode").addEventListener("change", renderAll);
  $("#filterAssignee").addEventListener("change", renderAll);

  $("#btnAddClient").addEventListener("click", addClient);
  $("#btnAddJob").addEventListener("click", addJob);
}

// ---------- Načtení dat ----------
async function loadAllData(){
  await Promise.all([loadClients(), loadJobs()]);
  await loadHours();
  fillFilterSources();
}

async function loadClients(){
  const { data, error } = await state.sb.from("clients").select("*").order("name");
  if (error) throw error;
  state.clients = data || [];
}

async function loadJobs(){
  const { data, error } = await state.sb.from("jobs").select("*").order("id", { ascending: true });
  if (error) throw error;
  // normalizace assignees
  state.jobs = (data||[]).map(j=>{
    if (typeof j.assignees === "string") {
      try { j.assignees = JSON.parse(j.assignees); } catch { j.assignees = []; }
    }
    if (!Array.isArray(j.assignees)) j.assignees = [];
    return j;
  });
}

async function loadHours(){
  state.myHours.clear();
  state.allHours.clear();

  const st = state.weekStart, en = addDays(st, 4);
  // všichni
  const { data: allRows, error: e1 } = await state.sb.from("time_entry")
    .select("job_id,date,hours,user_email")
    .gte("date", toISO(st)).lte("date", toISO(en));
  if (e1) throw e1;

  for (const r of (allRows||[])) {
    const key = String(r.job_id);
    if (!state.allHours.has(key)) state.allHours.set(key, {});
    const per = state.allHours.get(key);
    per[r.date] = (per[r.date] || 0) + Number(r.hours || 0);

    if ((state.user?.email || "").toLowerCase() === String(r.user_email||"").toLowerCase()) {
      if (!state.myHours.has(key)) state.myHours.set(key, {});
      const me = state.myHours.get(key);
      me[r.date] = (me[r.date] || 0) + Number(r.hours || 0);
    }
  }
}

function fillFilterSources(){
  // klienti filtry
  const fc = $("#filterClients");
  fc.innerHTML = `<option value="__all__">Všichni klienti</option>` + state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  // přidání zakázky – výběr klienta
  const nj = $("#newJobClient");
  nj.innerHTML = state.clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");

  // zakázky filtr – jen pro přehled; necháváme „Všechny“
  $("#filterJobs").innerHTML = `<option value="__all__">Všechny zakázky</option>`;
}

// ---------- Render ----------
function renderAll(){
  // Týden label
  const st = state.weekStart, en = addDays(st,4);
  $("#weekLabel").textContent = fmtWeekLabel(st, en);

  renderTable();
  renderTotals();
}

function jobMatchesFilters(job){
  const clientFilter = $("#filterClients").value;
  if (clientFilter !== "__all__" && String(job.client_id) !== String(clientFilter)) return false;

  const assignee = $("#filterAssignee").value;
  if (assignee === "__none__" && (job.assignees||[]).length) return false;
  if (assignee !== "__any__" && assignee !== "__none__" && !(job.assignees||[]).includes(assignee)) return false;

  return true;
}

function renderTable(){
  const tb = $("#tbodyJobs");
  tb.innerHTML = "";

  const jobs = state.jobs.filter(jobMatchesFilters);
  const st = state.weekStart;
  const dates = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));

  for (const job of jobs) {
    const tr = document.createElement("tr");

    // klient
    const tdClient = document.createElement("td");
    tdClient.className = "cell-client";
    tdClient.innerHTML = `<select data-job="${job.id}" class="clientSel">
      ${state.clients.map(c=>`<option value="${c.id}" ${String(c.id)===String(job.client_id)?"selected":""}>${escapeHtml(c.name)}</option>`).join("")}
    </select>`;
    tr.appendChild(tdClient);

    // zakázka
    const tdJob = document.createElement("td");
    tdJob.className = "cell-job";
    tdJob.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px;">
        <input class="jobName" data-job="${job.id}" value="${escapeAttr(job.name||"")}" />
        <span class="status-pill ${statusClass(job.status)}">${escapeHtml(job.status||"")}</span>
        <button class="btn-trash" title="Odstranit" aria-label="Odstranit" data-del="${job.id}">🗑</button>
      </div>
    `;
    tr.appendChild(tdJob);

    // denní bubliny
    const myPer = state.myHours.get(String(job.id)) || {};
    const allPer = state.allHours.get(String(job.id)) || {};
    for (let i=0;i<5;i++){
      const dISO = dates[i];
      const td = document.createElement("td");
      td.style.textAlign = "center";
      const val = Number($("#filterSumMode").value==="all" ? (allPer[dISO]||0) : (myPer[dISO]||0));
      td.innerHTML = `<div class="day-bubble" data-job="${job.id}" data-date="${dISO}">${num(val)}</div>`;
      tr.appendChild(td);
    }

    // celkový součet vpravo (zarovnání na střed pod „Celkem“)
    const sum = [0,1,2,3,4].map(i=>{
      const d = dates[i];
      const v = Number($("#filterSumMode").value==="all" ? (allPer[d]||0) : (myPer[d]||0));
      return v;
    }).reduce((a,b)=>a+b,0);

    const tdSum = document.createElement("td");
    tdSum.className = "sum-right";
    tdSum.textContent = num(sum);
    tr.appendChild(tdSum);

    tb.appendChild(tr);
  }

  // události
  tb.addEventListener("change", onTableChange, { once:true });
  tb.addEventListener("click", onTableClick, { once:true });
}

function renderTotals(){
  const st = state.weekStart;
  const jobs = state.jobs.filter(jobMatchesFilters);
  const dates = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));
  const byDay = [0,0,0,0,0];

  for (const job of jobs){
    const per = ($("#filterSumMode").value==="all"
      ? state.allHours.get(String(job.id))
      : state.myHours.get(String(job.id))) || {};
    for (let i=0;i<5;i++){
      byDay[i] += Number(per[dates[i]] || 0);
    }
  }

  $$(".total-bubble").forEach((el,i)=> el.textContent = num(byDay[i]) );
}

function statusClass(s){
  if (!s) return "status-new";
  const t = s.toLowerCase();
  if (t.includes("hotovo")) return "status-done";
  if (t.includes("prob"))   return "status-doing";
  return "status-new";
}

function num(v){ return (Math.round(v*2)/2).toString().replace(".", ","); }
function parseNum(s){ return Number(String(s).replace(",", ".")) || 0; }
function escapeHtml(s){ return String(s).replace(/[&<>"]/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[m])); }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,"&quot;"); }

// ---------- Události tabulky ----------
async function onTableChange(e){
  const t = e.target;

  // změna klienta u jobu
  if (t.classList.contains("clientSel")){
    const jobId = Number(t.dataset.job);
    await state.sb.from("jobs").update({ client_id: Number(t.value) }).eq("id", jobId);
    await loadAllData(); renderAll();
  }

  // změna názvu jobu
  if (t.classList.contains("jobName")){
    const jobId = Number(t.dataset.job);
    await state.sb.from("jobs").update({ name: String(t.value) }).eq("id", jobId);
    await loadAllData(); renderAll();
  }
}

async function onTableClick(e){
  const del = e.target.closest("[data-del]");
  if (del){
    const id = Number(del.dataset.del);
    if (confirm("Opravdu odstranit zakázku?")) {
      await state.sb.from("time_entry").delete().eq("job_id", id);
      await state.sb.from("jobs").delete().eq("id", id);
      await loadAllData(); renderAll();
    }
    return;
  }

  const bub = e.target.closest(".day-bubble");
  if (bub){
    const jobId = Number(bub.dataset.job);
    const dateISO = bub.dataset.date;
    const isMinus = e.altKey || e.metaKey || e.ctrlKey;
    await bumpHours(jobId, dateISO, isMinus ? -0.5 : +0.5);
    await loadHours(); renderAll();
  }
}

async function bumpHours(jobId, dateISO, delta){
  // přidat/ubrat hodiny pro aktuálního uživatele
  const email = String(state.user?.email || "");
  const { data: rows, error } = await state.sb.from("time_entry")
      .select("*")
      .eq("job_id", jobId).eq("user_email", email).eq("date", dateISO).limit(1);
  if (error) throw error;

  const cur = rows?.[0];
  let hours = Math.max(0, Number(cur?.hours||0) + delta);
  hours = Math.round(hours*2)/2;

  if (!cur && hours>0){
    await state.sb.from("time_entry").insert({ job_id: jobId, user_email: email, date: dateISO, hours });
  } else if (cur && hours>0){
    await state.sb.from("time_entry").update({ hours }).eq("id", cur.id);
  } else if (cur && hours<=0){
    await state.sb.from("time_entry").delete().eq("id", cur.id);
  }
}

// ---------- Přidávání ----------
async function addClient(){
  const name = $("#newClientName").value.trim();
  if (!name) return;
  await state.sb.from("clients").insert({ name });
  $("#newClientName").value = "";
  await loadAllData(); renderAll();
}

async function addJob(){
  const clientId = Number($("#newJobClient").value);
  const name = $("#newJobName").value.trim();
  const status = $("#newJobStatus").value.trim();
  const assignees = Array.from($("#newJobAssignees").selectedOptions).map(o=>o.value);

  if (!name) return;
  await state.sb.from("jobs").insert({
    name, status, client_id: clientId,
    assignees: JSON.stringify(assignees)
  });
  $("#newJobName").value = "";
  await loadAllData(); renderAll();
}

// ---------- Export do Excelu ----------
async function exportToExcel(){
  const XLSX = window.XLSX;
  if (!XLSX || !XLSX.utils) return alert("Chybí XLSX knihovna.");

  const st = state.weekStart, en = addDays(st,4);
  const dates = [0,1,2,3,4].map(i=>toISO(addDays(st,i)));
  const visibleJobs = state.jobs.filter(jobMatchesFilters);

  // Build rows: vynechat joby se 0h v týdnu (dle zvoleného režimu Součty: Já/Všichni)
  const rows = [];
  const header = [
    ["Výkaz práce"],
    [`Uživatel: ${emailToName(state.user?.email)}`],
    [`Týden: ${st.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"})} – ${en.toLocaleDateString("cs-CZ",{day:"2-digit",month:"2-digit",year:"numeric"})}`],
    [""],
    ["Klient","Zakázka",
      labelDay(st,0), labelDay(st,1), labelDay(st,2), labelDay(st,3), labelDay(st,4)
    ]
  ];
  rows.push(...header);

  for (const job of visibleJobs){
    const perObj = ($("#filterSumMode").value==="all" ? state.allHours : state.myHours).get(String(job.id)) || {};
    const per = dates.map(d=>Number(perObj[d]||0));
    const week = per.reduce((a,b)=>a+b,0);
    if (week<=0) continue; // přesně požadavek – vynechat prázdné

    const clientName = (state.clients.find(c=>String(c.id)===String(job.client_id))?.name) || "";

    rows.push([
      clientName, job.name || "",
      ...per.map(v=>Math.round(v*2)/2)
    ]);
  }

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Výkaz");

  const fileName = `vykaz_${toISO(st)}_${toISO(en)}_${emailToName(state.user?.email)}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

function labelDay(st, plus){
  const d = addDays(st, plus);
  const wd = d.toLocaleDateString("cs-CZ",{ weekday:"short" }); // po, út…
  const dm = d.toLocaleDateString("cs-CZ",{ day:"2-digit", month:"2-digit" });
  return `${wd} ${dm}`;
}
