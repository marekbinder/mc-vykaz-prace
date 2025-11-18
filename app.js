/* app.js — kompletní verze pro index.html + style.css z tohoto vlákna
   Schéma:
     client(id uuid, name text, is_active bool)
     job(id uuid, client_id uuid, name text, status_id int2, is_active bool, assignees _text / JSON)
     job_status(id int2, code text, label text)
     time_entry(id int8, user_id uuid, job_id uuid, work_date date, hours numeric)
     app_user(id uuid, full_name text, role text, created_at timestamptz)

   Poznámky:
   - „Součty: Já“ používá přihlášeného uživatele ze supabase.auth.getUser() (je-li k dispozici).
   - Assignee („Grafik“) se ukládá jako JSON pole jmen do job.assignees.
   - Export XLSX: klient, zakázka, 5 dní (bez sloupce celkem).
*/

(() => {
  // ---------- Pomůcky ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const toastBox = $('#err');
  const showToast = (msg, ms = 3500) => {
    toastBox.textContent = msg;
    toastBox.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => (toastBox.style.display = 'none'), ms);
  };

  // Day.js helpers
  const djs = dayjs; // načtený z CDN
  const mondayOf = (d) => {
    const wd = d.day(); // 0..6 (0=neděle)
    const off = wd === 0 ? -6 : 1 - wd;
    return d.add(off, 'day').startOf('day');
  };
  const rangeMonToFri = (monday) =>
    [0, 1, 2, 3, 4].map((i) => monday.add(i, 'day'));
  const fmtD = (d) => d.format('YYYY-MM-DD');
  const niceD = (d) => d.format('D. M. YYYY');

  // ---------- Supabase client ----------
  const pick = (a, b) => (a == null || a === '' ? b : a);
  const SB_URL =
    pick(window.SUPABASE_URL, pick(window.SUPABASE_URL, null)) ||
    pick(typeof SUPABASE_URL !== 'undefined' ? SUPABASE_URL : null, null) ||
    localStorage.getItem('sbUrl');

  const SB_KEY =
    pick(window.SUPABASE_ANON_KEY, null) ||
    pick(typeof SUPABASE_ANON_KEY !== 'undefined' ? SUPABASE_ANON_KEY : null, null) ||
    localStorage.getItem('sbKey');

  if (!SB_URL || !SB_KEY) {
    showToast('Chybí Supabase URL/Key (SUPABASE_URL / SUPABASE_ANON_KEY).');
  }

  const sb = (SB_URL && SB_KEY) ? window.supabase.createClient(SB_URL, SB_KEY) : null;

  // ---------- Stav ----------
  const state = {
    weekStart: mondayOf(djs()),

    // data cache
    clients: [],
    statuses: [], // {id, code, label}
    jobs: [],     // aktuálně z DB podle filtrů
    entries: [],  // time_entry pro týden (pouze pro viditelné joby)

    // session
    user: null,       // supabase.auth user
    appUserId: null,  // UUID pro time_entry.user_id ( = auth user id )

    // filtry
    filterClient: 'ALL', // uuid nebo 'ALL'
    filterStatus: 'ALL', // int nebo 'ALL'
    totalsScope: 'ME',   // 'ME' | 'ALL'
    filterAssignees: [], // ['Marek', 'Viki', 'Standa']

    // add new job (sidebar/řádek nahoře)
    newAssignees: [], // pro „Grafik: nikdo“ v add-row
  };

  // map jmen (pro export – můžeš libovolně upravit)
  const USER_NAME_BY_EMAIL = {
    'binder.marek@gmail.com': 'Marek',
    'grafika@media-consult.cz': 'Viki',
    'stanislav.hron@icloud.com': 'Standa',
  };
  const nameFromEmail = (email) => {
    if (!email || typeof email !== 'string') return '';
    const key = email.toLowerCase().trim();
    return USER_NAME_BY_EMAIL[key] || key.split('@')[0];
  };

  // ---------- DOM odkazy ----------
  const elWeek = $('#weekRange');
  const elPrev = $('#prevWeek');
  const elNext = $('#nextWeek');

  const elFilterClient = $('#filterClient');
  const elFilterStatus = $('#filterStatus');
  const elTotals = $('#totalsScope');

  const elAssigneeFilterBtn = $('#assigneeFilterBtn');
  const elAssigneeFilterMenu = $('#assigneeFilterMenu');
  const elAssigneeFilterClose = $('#assigneeFilterClose');
  const elAssigneeFilterClear = $('#assigneeFilterClear');

  const elNewClient = $('#newClientName');
  const elAddClient = $('#addClientBtn');

  const elNewJobClient = $('#newJobClient');
  const elNewJobName = $('#newJobName');
  const elNewJobStatus = $('#newJobStatus');
  const elAssigneesNewBtn = $('#assigneesNewBtn');
  const elAssigneesNewMenu = $('#assigneesNewMenu');
  const elAssigneesNewClose = $('#assigneesNewClose');
  const elAssigneesNewClear = $('#assigneesNewClear');

  const elAddJob = $('#addJobBtn');

  const elTbody = $('#tbody');
  const elFooterCells = $$('#sumRow .sumCell');
  const elExport = $('#exportXlsx');

  // ---------- UI – týden ----------
  const refreshWeekLabel = () => {
    const days = rangeMonToFri(state.weekStart);
    elWeek.textContent = `${niceD(days[0])} – ${niceD(days[4])}`;
  };

  elPrev.addEventListener('click', () => {
    state.weekStart = state.weekStart.add(-7, 'day');
    refreshWeekLabel();
    loadAndRender();
  });
  elNext.addEventListener('click', () => {
    state.weekStart = state.weekStart.add(7, 'day');
    refreshWeekLabel();
    loadAndRender();
  });

  // ---------- Načtení uživatele ----------
  async function fetchUser() {
    if (!sb) return;
    try {
      const { data } = await sb.auth.getUser();
      state.user = data?.user || null;
      state.appUserId = state.user?.id || null;
      // není povinné pro čtení, ale hodí se pro „Součty: Já“ a zápis hodin
    } catch (e) {
      // ignoruj
    }
  }

  // ---------- Základní číselníky ----------
  async function fetchClientsStatuses() {
    if (!sb) return;
    const { data: clients, error: ce } = await sb
      .from('client')
      .select('id,name,is_active')
      .order('name', { ascending: true });
    if (ce) {
      showToast('Nepodařilo se načíst klienty.');
      return;
    }
    state.clients = clients || [];

    const { data: statuses, error: se } = await sb
      .from('job_status')
      .select('id,code,label')
      .order('id', { ascending: true });
    if (se) {
      showToast('Nepodařilo se načíst statusy.');
      return;
    }
    state.statuses = statuses || [];

    // naplnění filtrů / add-row selectů
    elFilterClient.innerHTML = `<option value="ALL">Všichni klienti</option>` +
      state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    elFilterStatus.innerHTML = `<option value="ALL">Všechny zakázky</option>` +
      state.statuses.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');

    elNewJobClient.innerHTML =
      state.clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

    elNewJobStatus.innerHTML =
      state.statuses.map(s => `<option value="${s.id}">${escapeHtml(s.label)}</option>`).join('');
  }

  // ---------- Filtry – change handlers ----------
  elFilterClient.addEventListener('change', () => {
    state.filterClient = elFilterClient.value || 'ALL';
    loadAndRender();
  });
  elFilterStatus.addEventListener('change', () => {
    state.filterStatus = elFilterStatus.value || 'ALL';
    loadAndRender();
  });
  elTotals.addEventListener('change', () => {
    state.totalsScope = elTotals.value || 'ME';
    render(); // stačí přepočítat
  });

  // ---------- „Assignee“ filter menu ----------
  // menu toggle
  const toggleMenu = (btn, menu, open) => {
    const show = open ?? menu.hasAttribute('hidden');
    if (show) {
      menu.removeAttribute('hidden');
      // click outside -> close
      const closeOnClick = (e) => {
        if (!menu.contains(e.target) && !btn.contains(e.target)) {
          menu.setAttribute('hidden', '');
          document.removeEventListener('mousedown', closeOnClick, true);
        }
      };
      setTimeout(() => document.addEventListener('mousedown', closeOnClick, true), 0);
    } else {
      menu.setAttribute('hidden', '');
    }
  };
  elAssigneeFilterBtn.addEventListener('click', () =>
    toggleMenu(elAssigneeFilterBtn, elAssigneeFilterMenu)
  );
  elAssigneeFilterClose.addEventListener('click', () =>
    elAssigneeFilterMenu.setAttribute('hidden', '')
  );
  elAssigneeFilterClear.addEventListener('click', () => {
    state.filterAssignees = [];
    for (const cb of $$('input[type=checkbox]', elAssigneeFilterMenu)) cb.checked = false;
    updateAssigneeFilterBtn();
    loadAndRender();
  });
  // změny checkboxů
  for (const cb of $$('input[type=checkbox]', elAssigneeFilterMenu)) {
    cb.addEventListener('change', () => {
      const vals = $$('input[type=checkbox]', elAssigneeFilterMenu)
        .filter(x => x.checked)
        .map(x => x.value);
      state.filterAssignees = vals;
      updateAssigneeFilterBtn();
      loadAndRender();
    });
  }
  const updateAssigneeFilterBtn = () => {
    elAssigneeFilterBtn.textContent =
      state.filterAssignees.length ? `Grafik: ${state.filterAssignees.join(', ')}` : 'Grafik: Všichni';
  };

  // ---------- „Assignees“ v přidávacím řádku ----------
  elAssigneesNewBtn.addEventListener('click', () =>
    toggleMenu(elAssigneesNewBtn, elAssigneesNewMenu)
  );
  elAssigneesNewClose.addEventListener('click', () =>
    elAssigneesNewMenu.setAttribute('hidden', '')
  );
  elAssigneesNewClear.addEventListener('click', () => {
    state.newAssignees = [];
    for (const cb of $$('input[type=checkbox]', elAssigneesNewMenu)) cb.checked = false;
    updateAssigneesNewLabel();
  });
  for (const cb of $$('input[type=checkbox]', elAssigneesNewMenu)) {
    cb.addEventListener('change', () => {
      state.newAssignees = $$('input[type=checkbox]', elAssigneesNewMenu)
        .filter(x => x.checked).map(x => x.value);
      updateAssigneesNewLabel();
    });
  }
  const updateAssigneesNewLabel = () => {
    elAssigneesNewBtn.textContent =
      state.newAssignees.length ? `Grafik: ${state.newAssignees.join(', ')}` : 'Grafik: nikdo';
  };

  // ---------- Přidání klienta / zakázky ----------
  elAddClient.addEventListener('click', async () => {
    if (!sb) return;
    const name = (elNewClient.value || '').trim();
    if (!name) return;
    const { error } = await sb.from('client').insert({ name, is_active: true });
    if (error) return showToast('Nepodařilo se přidat klienta.');
    elNewClient.value = '';
    await fetchClientsStatuses();
    showToast('Klient přidán.');
  });

  elAddJob.addEventListener('click', async () => {
    if (!sb) return;
    const client_id = elNewJobClient.value;
    const name = (elNewJobName.value || '').trim();
    const status_id = Number(elNewJobStatus.value);
    if (!client_id || !name || !status_id) return;

    const assignees = state.newAssignees.length ? JSON.stringify(state.newAssignees) : null;
    const { error } = await sb.from('job').insert({
      client_id, name, status_id, is_active: true, assignees
    });
    if (error) return showToast('Nepodařilo se přidat zakázku.');
    elNewJobName.value = '';
    state.newAssignees = [];
    for (const cb of $$('input[type=checkbox]', elAssigneesNewMenu)) cb.checked = false;
    updateAssigneesNewLabel();
    await loadAndRender();
    showToast('Zakázka přidána.');
  });

  // ---------- Načtení jobů + time_entry ----------
  function visibleFilters(job) {
    if (state.filterClient !== 'ALL' && String(job.client_id) !== String(state.filterClient))
      return false;
    if (state.filterStatus !== 'ALL' && String(job.status_id) !== String(state.filterStatus))
      return false;
    if (state.filterAssignees.length) {
      const as = parseAssignees(job.assignees);
      if (!as.length) return false;
      // alespoň 1 shoda
      if (!state.filterAssignees.some(a => as.includes(a))) return false;
    }
    return true;
  }

  async function loadJobs() {
    if (!sb) return;
    // joby – jen aktivní
    const { data: jobs, error } = await sb
      .from('job')
      .select('id, client_id, name, status_id, is_active, assignees')
      .eq('is_active', true)
      .order('name', { ascending: true });

    if (error) {
      showToast('Nepodařilo se načíst zakázky.');
      state.jobs = [];
      state.entries = [];
      return;
    }

    const filtered = (jobs || []).filter(visibleFilters);
    state.jobs = filtered;

    // načti time_entry pro tyto joby v týdnu
    if (!filtered.length) {
      state.entries = [];
      return;
    }
    const jobIds = filtered.map(j => j.id);
    const days = rangeMonToFri(state.weekStart).map(fmtD);
    const { data: entries, error: e2 } = await sb
      .from('time_entry')
      .select('job_id, user_id, work_date, hours')
      .in('job_id', jobIds)
      .gte('work_date', days[0])
      .lte('work_date', days[4]);

    if (e2) {
      showToast('Nepodařilo se načíst hodiny.');
      state.entries = [];
      return;
    }
    state.entries = entries || [];
  }

  // ---------- Render tabulky ----------
  function parseAssignees(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      const v = JSON.parse(val);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }
  const clientNameById = (id) => state.clients.find(c => String(c.id) === String(id))?.name || '';

  const statusById = (id) => state.statuses.find(s => Number(s.id) === Number(id));

  const daysISO = () => rangeMonToFri(state.weekStart).map(fmtD);

  function valueFor(jobId, isoDate) {
    const scope = state.totalsScope;
    const all = state.entries.filter(e => String(e.job_id) === String(jobId) && e.work_date === isoDate);
    if (scope === 'ALL') {
      return sum(all.map(e => Number(e.hours) || 0));
    }
    // ME
    if (!state.appUserId) return sum(all.map(e => Number(e.hours) || 0));
    return sum(all.filter(e => String(e.user_id) === String(state.appUserId)).map(e => Number(e.hours) || 0));
  }

  function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0); }

  function render() {
    // týdenní štítek
    refreshWeekLabel();

    // vykreslení řádků
    elTbody.innerHTML = '';
    const dISO = daysISO();

    for (const j of state.jobs) {
      const tr = document.createElement('tr');

      // Klient (pill-select by byl pěkný, ale zůstaneme u textu)
      const tdClient = document.createElement('td');
      tdClient.textContent = clientNameById(j.client_id);
      tr.appendChild(tdClient);

      // Zakázka + malý „Grafik“
      const tdJob = document.createElement('td');
      tdJob.className = 'jobCell';

      const nm = document.createElement('div');
      nm.className = 'jobNameIn';
      nm.textContent = j.name;
      tdJob.appendChild(nm);

      const as = parseAssignees(j.assignees);
      const btnAss = document.createElement('button');
      btnAss.type = 'button';
      btnAss.className = 'pill-btn assigneeIcon';
      btnAss.textContent = as.length ? `Grafik` : 'Grafik';
      btnAss.title = as.length ? `Grafik: ${as.join(', ')}` : 'Grafik: nikdo';
      btnAss.addEventListener('click', () => openAssigneesInline(j, btnAss));
      tdJob.appendChild(btnAss);

      // „koš“ – smazání zakázky (deaktivace)
      const del = document.createElement('button');
      del.className = 'pill-btn jobDelete';
      del.innerHTML = '🗑';
      del.title = 'Smazat (deaktivovat) zakázku';
      del.addEventListener('click', () => deleteJob(j));
      tdJob.appendChild(del);

      tr.appendChild(tdJob);

      // 5 dnů
      let total = 0;
      for (const iso of dISO) {
        const td = document.createElement('td');
        td.style.textAlign = 'center';
        const b = document.createElement('button');
        b.className = 'bubble';
        const v = valueFor(j.id, iso);
        total += v;
        b.textContent = String(v || 0);
        b.addEventListener('click', () => editCellHours(j, iso, v));
        td.appendChild(b);
        tr.appendChild(td);
      }

      // celkem
      const tdTot = document.createElement('td');
      tdTot.className = 'totalCell';
      const tv = document.createElement('div');
      tv.className = 'totalVal';
      tv.textContent = String(total || 0);
      tdTot.appendChild(tv);
      tr.appendChild(tdTot);

      elTbody.appendChild(tr);
    }

    // součty za dny (spodní řádek)
    const sums = [0, 1, 2, 3, 4].map(i => {
      const iso = dISO[i];
      return sum(state.jobs.map(j => valueFor(j.id, iso)));
    });
    elFooterCells.forEach((cell, idx) => {
      const v = sums[idx] || 0;
      cell.innerHTML = '';
      const div = document.createElement('div');
      div.className = 'sumBubble ' + (v === 0 ? 'sumRed' : v < 7 ? 'sumOrange' : 'sumGreen');
      div.textContent = String(v);
      cell.appendChild(div);
    });
  }

  async function deleteJob(job) {
    if (!sb) return;
    if (!confirm(`Opravdu smazat „${job.name}“?`)) return;
    const { error } = await sb.from('job').update({ is_active: false }).eq('id', job.id);
    if (error) return showToast('Nepodařilo se smazat zakázku.');
    await loadAndRender();
  }

  // inline assignees menu pro jednotlivý job
  function openAssigneesInline(job, anchorBtn) {
    // vytvoříme jednoduché plovoucí menu (stejné checkboxy jako ve filtrech)
    const menu = document.createElement('div');
    menu.className = 'menu';
    menu.style.minWidth = '200px';

    const names = ['Viki', 'Standa', 'Marek'];
    const pre = new Set(parseAssignees(job.assignees));
    for (const n of names) {
      const lab = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = n;
      cb.checked = pre.has(n);
      lab.append(cb, document.createTextNode(' ' + n));
      menu.appendChild(lab);
    }
    const row = document.createElement('div');
    row.className = 'menuRow';
    const cancel = document.createElement('button');
    cancel.className = 'pill-btn small';
    cancel.textContent = 'Zavřít';
    const save = document.createElement('button');
    save.className = 'pill-btn small';
    save.textContent = 'Uložit';
    row.append(cancel, save);
    menu.appendChild(row);

    document.body.appendChild(menu);
    // pozice u tlačítka
    const r = anchorBtn.getBoundingClientRect();
    menu.style.position = 'fixed';
    menu.style.left = `${r.left}px`;
    menu.style.top = `${r.bottom + 8}px`;

    const close = () => {
      document.removeEventListener('mousedown', onOut, true);
      menu.remove();
    };
    const onOut = (e) => {
      if (!menu.contains(e.target) && e.target !== anchorBtn) close();
    };
    setTimeout(() => document.addEventListener('mousedown', onOut, true), 0);

    cancel.addEventListener('click', close);
    save.addEventListener('click', async () => {
      const sel = [...menu.querySelectorAll('input[type=checkbox]:checked')].map(x => x.value);
      const assignees = sel.length ? JSON.stringify(sel) : null;
      const { error } = await sb.from('job').update({ assignees }).eq('id', job.id);
      if (error) showToast('Nepodařilo se uložit grafika.');
      close();
      await loadAndRender();
    });
  }

  // editace bubliny
  async function editCellHours(job, isoDate, currentVal) {
    if (!sb) return;
    const txt = prompt(`Zadej hodiny pro ${niceD(djs(isoDate))} (zakázka: ${job.name})`, String(currentVal || 0));
    if (txt == null) return;
    const val = Number(txt.replace(',', '.'));
    if (Number.isNaN(val) || val < 0) return;

    // najdi existující záznam pro ME/ALL:
    // zapisujeme pouze za aktuálního uživatele; pokud user není znám, zapisujeme bez user_id (nebo zkusíme default?)
    let user_id = state.appUserId || null;

    // existuje?
    const { data: exist, error: e0 } = await sb
      .from('time_entry')
      .select('id')
      .eq('job_id', job.id)
      .eq('work_date', isoDate)
      .eq('user_id', user_id)
      .limit(1);

    if (e0) return showToast('Chyba při čtení záznamu hodin.');

    if (exist && exist.length) {
      const id = exist[0].id;
      const { error } = await sb.from('time_entry').update({ hours: val }).eq('id', id);
      if (error) return showToast('Nepodařilo se uložit hodiny.');
    } else {
      const { error } = await sb.from('time_entry').insert({ user_id, job_id: job.id, work_date: isoDate, hours: val });
      if (error) return showToast('Nepodařilo se vložit hodiny.');
    }
    await loadJobs(); // pouze jobs+entries
    render();
  }

  // ---------- Export do Excelu ----------
  elExport.addEventListener('click', async () => {
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Výkaz');

      const days = rangeMonToFri(state.weekStart);
      const daysTxt = days.map(niceD);

      // hlavička
      const range = `${niceD(days[0])} – ${niceD(days[4])}`;
      const userEmail = state.user?.email || '';
      const userNice = nameFromEmail(userEmail);
      ws.addRow([`Uživatel: ${userNice}`]);
      ws.addRow([`Týden: ${range}`]);
      ws.addRow([]);

      ws.addRow(['Klient', 'Zakázka', ...daysTxt]).font = { bold: true };

      for (const j of state.jobs) {
        const rowVals = days.map(d => valueFor(j.id, fmtD(d)));
        ws.addRow([clientNameById(j.client_id), j.name, ...rowVals]);
      }

      // prázdný řádek + součet
      ws.addRow([]);
      const sumRow = ['Součet za den', ''];
      for (const d of days) {
        const v = sum(state.jobs.map(j => valueFor(j.id, fmtD(d))));
        sumRow.push(v);
      }
      const r = ws.addRow(sumRow);
      r.font = { bold: true };

      const buf = await wb.xlsx.writeBuffer();
      const a = document.createElement('a');
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      a.href = URL.createObjectURL(blob);
      a.download = `vykaz_${days[0].format('YYYY-MM-DD')}_${days[4].format('YYYY-MM-DD')}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showToast('Export se nepodařil.');
    }
  });

  // ---------- Utility ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[m]));
  }

  // ---------- Hlavní načtení ----------
  async function loadAndRender() {
    await loadJobs();
    render();
  }

  async function boot() {
    refreshWeekLabel();
    updateAssigneeFilterBtn();
    updateAssigneesNewLabel();

    await fetchUser();
    await fetchClientsStatuses();
    await loadAndRender();
  }

  boot();
})();
