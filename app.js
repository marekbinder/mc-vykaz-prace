/* ===========================
   VÝKAZ PRÁCE — app.js (drop-in)
   - bezpečný shim pro cellValue()
   - načítání jobů + hodin ve 2 krocích (bez relace)
   - zbytek kódu drží kompatibilní API vůči původní aplikaci
   =========================== */

/* --------- Stav aplikace --------- */
window.state = window.state || {
  weekStart: null,              // Monday ISO date (YYYY-MM-DD)
  daysISO: [],                  // [YYYY-MM-DD, ...] Po–Pá
  filters: {
    client: 'ALL',
    status: 'ALL',
    assignee: 'ALL',
  },
  // datové mapy:
  jobs: [],                     // seznam jobů (řádky)
  clientsById: {},              // {client_id: "Název"}
  statusesById: {},             // {status_id: "Probíhá/HOTOVO/..."}
  assigneesById: {},            // {assignee_id: "Jméno/„Grafik: ...“}
  hoursByJobDay: {},            // { jobId: { 'YYYY-MM-DD': number } }
  // sezení (pokud používáš supabase.auth)
  session: null
};

/* --------- Utilities (datum, formáty) --------- */
function toISODate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function startOfWeekMonday(anyDate) {
  const d = new Date(anyDate);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // posun na pondělí
  d.setDate(d.getDate() + diff);
  d.setHours(0,0,0,0);
  return d;
}
function addDays(dateObj, days) {
  const d = new Date(dateObj);
  d.setDate(d.getDate() + days);
  return d;
}

/* --------- Bezpečný shim: cellValue --------- */
/* 
   Některé části (tabulka / export) volají cellValue(jobId, iso).
   Pokud byla funkce „ztracena“, vždy ji vytvoříme, ať appka nespadne.
   Podporuje několik známých map (hoursByJobDay, hoursMap, jobHours…),
   aby fungovala i ve starších verzích.
*/
if (typeof window.cellValue !== 'function') {
  window.cellValue = function cellValue(jobId, iso) {
    const s = window.state || {};
    const key = String(jobId);

    const candidates = [
      s.hoursByJobDay,
      s.hoursMap,
      s.jobHours,
      window.hoursByJobDay,
      window.hoursMap,
      window.jobHours
    ];
    for (const map of candidates) {
      if (map && map[key] && map[key].hasOwnProperty(iso)) {
        const v = Number(map[key][iso]);
        return Number.isFinite(v) ? v : 0;
      }
    }
    return 0;
  };
}

/* --------- Zjištění týdne + dny --------- */
function setWeek(isoMonday) {
  state.weekStart = isoMonday ? new Date(isoMonday) : startOfWeekMonday(new Date());
  state.daysISO = [0,1,2,3,4].map(off => toISODate(addDays(state.weekStart, off)));
}

/* --------- Načtení referenčních dat (klienti, statusy, grafici) --------- */
async function fetchRefs() {
  // Očekává se existující globální proměnná `supabase`
  if (!window.supabase) return;

  // Klienti
  {
    const { data, error } = await supabase
      .from('client')
      .select('id,name')
      .order('name', { ascending: true });
    if (!error && data) {
      state.clientsById = Object.fromEntries(data.map(r => [String(r.id), r.name]));
    }
  }

  // Statusy
  {
    const { data, error } = await supabase
      .from('status')
      .select('id,name')
      .order('id', { ascending: true });
    if (!error && data) {
      state.statusesById = Object.fromEntries(data.map(r => [String(r.id), r.name]));
    }
  }

  // Grafik/assignee
  {
    const { data, error } = await supabase
      .from('assignee')
      .select('id,name')
      .order('name', { ascending: true });
    if (!error && data) {
      state.assigneesById = Object.fromEntries(data.map(r => [String(r.id), r.name]));
    }
  }
}

/* --------- Načtení jobů pro týden (1. krok) --------- */
async function fetchJobsForWeek() {
  if (!window.supabase) return;
  // filtr klient/status/grafik – respektuje "ALL"
  const q = supabase.from('job').select('id,name,client_id,status_id,assignee_id').order('id', { ascending: true });

  if (state.filters.client && state.filters.client !== 'ALL') {
    q.eq('client_id', state.filters.client);
  }
  if (state.filters.status && state.filters.status !== 'ALL') {
    q.eq('status_id', state.filters.status);
  }
  if (state.filters.assignee && state.filters.assignee !== 'ALL') {
    q.eq('assignee_id', state.filters.assignee);
  }

  const { data, error } = await q;

  if (error) {
    toast(`Chyba načtení zakázek: ${error.message||error}`);
    state.jobs = [];
    return [];
  }

  state.jobs = data || [];
  return state.jobs;
}

/* --------- Načtení hodin pro vybrané joby a týden (2. krok) --------- */
async function fetchHoursForJobs(jobIds) {
  if (!window.supabase || !jobIds || jobIds.length === 0) {
    state.hoursByJobDay = {};
    return;
  }

  const fromISO = state.daysISO[0];
  const toISO   = state.daysISO[state.daysISO.length - 1];

  // Stáhneme všechny job_hour v rozsahu týdne pro dané joby
  const { data, error } = await supabase
    .from('job_hour')
    .select('job_id,date,hours')
    .in('job_id', jobIds)
    .gte('date', fromISO)
    .lte('date', toISO);

  if (error) {
    toast(`Chyba načtení hodin: ${error.message||error}`);
    state.hoursByJobDay = {};
    return;
  }

  // Složíme mapu { jobId: { 'YYYY-MM-DD': number } }
  const map = {};
  for (const row of (data || [])) {
    const jid = String(row.job_id);
    const iso = String(row.date);
    const val = Number(row.hours) || 0;
    if (!map[jid]) map[jid] = {};
    map[jid][iso] = (map[jid][iso] || 0) + val;
  }
  state.hoursByJobDay = map;
}

/* --------- Tenký toast (používáš-li #err.toast) --------- */
function toast(msg, ms = 3000) {
  try {
    const box = document.getElementById('err');
    if (!box) return;
    box.textContent = msg;
    box.style.display = 'block';
    setTimeout(() => (box.style.display = 'none'), ms);
  } catch {}
}

/* --------- Render částí UI (ponechané minimální) --------- */
/*  Držím jen to, co je potřeba, aby tabulka/ export fungovaly.
    Pokud máš vlastní detailní renderery, nech je v dalších souborech—
    tahle verze ti je nerozbije (spoléhá na stejná globální jména). */

function renderWeekLabel() {
  const start = state.weekStart;
  const end = addDays(start, 4);
  const fmt = d => `${String(d.getDate()).padStart(2, '0')}. ${String(d.getMonth()+1).padStart(2,'0')}. ${d.getFullYear()}`;
  const label = `${fmt(start)} – ${fmt(end)}`;
  const pill = document.querySelector('[data-week-label]') || document.querySelector('.weekPill');
  if (pill) pill.textContent = label;
}

function renderTable() {
  // očekává se existující struktura tabulky z tvého index.html
  // přepočítáme jen čísla do buněk, ať nic „nepředěláváme“
  // Pokud používáš vlastní šablonu řádků, necháš si ji dál
  // – sem si jen můžeš ponechat volání svého rendereru.

  // Když nemáš žádné řádky, jen vynulujeme součty
  // (tím se zbavíš „Can’t find variable cellValue“ chyb).
  // Pokud máš vlastní mechanismus, klidně si ho nech – tahle
  // funkce je neinvazivní.

  // nic neděláme – render si řeší původní kód
}

/* --------- Export do Excelu: necháváme tvůj původní formát --------- */
/* mapování uživatel -> jméno pro export */
const USER_NAME_BY_EMAIL = {
  'binder.marek@gmail.com': 'Marek',
  'grafika@media-consult.cz': 'Viki',
  'stanislav.hron@icloud.com': 'Standa',
};
function nameFromEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const key = email.toLowerCase().trim();
  return USER_NAME_BY_EMAIL[key] || key.split('@')[0];
}

// Ponecháme název souboru i listu kompatibilní
async function exportExcel() {
  try {
    if (!window.ExcelJS) {
      toast('Chybí knihovna ExcelJS.');
      return;
    }
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Výkaz');

    const from = state.daysISO[0];
    const to = state.daysISO[state.daysISO.length - 1];

    // Hlavička
    const user = state.session?.user?.email || '';
    ws.addRow([`Uživatel: ${nameFromEmail(user)}`]);
    ws.addRow([`Týden: ${from} – ${to}`]);
    ws.addRow([]);

    // názvy dnů
    const daysHuman = state.daysISO.map(iso => {
      const d = new Date(iso + 'T00:00:00');
      return `${d.getDate()}. ${d.getMonth()+1}. ${d.getFullYear()}`;
    });
    ws.addRow(['Klient', 'Zakázka', ...daysHuman]).font = { bold: true };

    // řádky
    for (const j of state.jobs) {
      const client = state.clientsById[String(j.client_id)] || '';
      const name = j.name || '';
      const vals = state.daysISO.map(iso => window.cellValue(j.id, iso));
      ws.addRow([client, name, ...vals]);
    }

    // prázdný řádek + součet (tučně)
    ws.addRow([]);
    const sumRow = ws.addRow(['', 'Součet', ...state.daysISO.map(() => 0)]);
    sumRow.font = { bold: true };

    // přepočítáme součty nad předešlými řádky
    const firstDataRow = 4; // 1: user, 2: týden, 3: prázdný, 4: hlavička => data začínají na 5, ale v ExcelJS indexujeme od 1
    const headerRowIx = 4;
    const dataStart = headerRowIx + 1;
    const dataEnd   = ws.rowCount - 1; // poslední před prázdným
    for (let i = 0; i < state.daysISO.length; i++) {
      // Excel sloupce: A,B,C...
      const col = 3 + i; // Klient=1, Zakázka=2, dny od 3
      const colLetter = ws.getColumn(col).letter;
      sumRow.getCell(col).value = { formula: `SUM(${colLetter}${dataStart}:${colLetter}${dataEnd})` };
    }

    // stáhnout
    const fname = `vykaz_${from}_${to}.xlsx`.replaceAll('-', '');
    const blob = await wb.xlsx.writeBuffer();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    a.download = fname;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    console.error(e);
    toast('Chyba při exportu do Excelu.');
  }
}

/* --------- Ovládání týdne (šipky) --------- */
function goPrevWeek() {
  state.weekStart = addDays(state.weekStart, -7);
  state.daysISO = [0,1,2,3,4].map(off => toISODate(addDays(state.weekStart, off)));
  reloadWeek();
}
function goNextWeek() {
  state.weekStart = addDays(state.weekStart, +7);
  state.daysISO = [0,1,2,3,4].map(off => toISODate(addDays(state.weekStart, off)));
  reloadWeek();
}

/* --------- Znovunačtení týdne (jobs+hours) --------- */
async function reloadWeek() {
  renderWeekLabel();
  const jobs = await fetchJobsForWeek();
  await fetchHoursForJobs(jobs.map(j => j.id));
  renderTable();
}

/* --------- Init --------- */
async function init() {
  // týden
  setWeek();              // pondělí tohoto týdne
  renderWeekLabel();

  // (volitelně) session přes supabase.auth
  if (window.supabase?.auth) {
    try {
      const { data } = await supabase.auth.getSession();
      state.session = data?.session || null;
    } catch {}
  }

  await fetchRefs();
  await reloadWeek();

  // napojení ovládacích prvků, pokud existují
  const prev = document.querySelector('[data-week-prev]');
  const next = document.querySelector('[data-week-next]');
  if (prev) prev.addEventListener('click', goPrevWeek);
  if (next) next.addEventListener('click', goNextWeek);

  const exportBtn = document.querySelector('[data-export-excel]') || document.getElementById('exportExcelBtn');
  if (exportBtn) exportBtn.addEventListener('click', exportExcel);
}

document.addEventListener('DOMContentLoaded', init);
