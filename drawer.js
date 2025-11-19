(function () {
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => [...r.querySelectorAll(s)];

  const $fab       = qs('#toolsFab');
  const $backdrop  = qs('#toolsBackdrop');
  const $drawer    = qs('#toolsDrawer');
  const $close     = qs('#toolsClose');

  const $selClient = qs('#newJobClient');
  const $inpJob    = qs('#newJobName');
  const $btnJob    = qs('#btnAddJob');

  const $inpClient = qs('#newClientName');
  const $btnClient = qs('#btnAddClient');

  // ---------- otevření / zavření ----------
  const open = () => {
    document.body.classList.add('drawer-open');
    $drawer.setAttribute('aria-hidden', 'false');
    $drawer.classList.add('open');

    $backdrop.classList.add('show');
    $backdrop.setAttribute('aria-hidden', 'false');

    // naplnění klientů (klon z #filterClient)
    hydrateClientsFromFilter();
  };

  const close = () => {
    document.body.classList.remove('drawer-open');
    $drawer.setAttribute('aria-hidden', 'true');
    $drawer.classList.remove('open');

    $backdrop.classList.remove('show');
    $backdrop.setAttribute('aria-hidden', 'true');
  };

  $fab?.addEventListener('click', open);
  $close?.addEventListener('click', close);
  $backdrop?.addEventListener('click', close);

  // ---------- výplň klientů z tvého filtru ----------
  function hydrateClientsFromFilter() {
    const filter = qs('#filterClient');     // existuje v horním filtru appky
    if (!filter) return;

    // zachovej výběr, pokud uživatel něco vybral dřív
    const selected = $selClient.value || '';

    // smaž a znovu naplň (bez ALL)
    $selClient.innerHTML = '';
    qsa('option', filter).forEach(opt => {
      const v = String(opt.value || '').trim();
      const t = String(opt.textContent || '').trim();
      if (!v || v === 'ALL') return;
      const o = document.createElement('option');
      o.value = v;
      o.textContent = t;
      $selClient.appendChild(o);
    });

    // když nic, nech první; jinak obnov původní volbu
    if (selected) {
      const has = qsa('option', $selClient).some(o => o.value === selected);
      if (has) $selClient.value = selected;
    }
  }

  // ---------- helper: toast přes tvůj #err ----------
  function toast(msg, ms = 2400) {
    const t = qs('#err');
    if (!t) return alert(msg);
    t.textContent = msg;
    t.style.display = 'block';
    setTimeout(() => { t.style.display = 'none'; }, ms);
  }

  // ---------- API hooky do app.js, pokud existují ----------
  const callApp = (fnName, ...args) => {
    const fn = window && typeof window[fnName] === 'function' ? window[fnName] : null;
    return fn ? fn(...args) : null;
  };

  // ---------- přidání zakázky (bez statusu – DB dá default „Nová“) ----------
  $btnJob?.addEventListener('click', async () => {
    const clientId = ($selClient.value || '').trim();
    const name = ($inpJob.value || '').trim();

    if (!clientId) { toast('Vyber klienta.'); return; }
    if (!name)     { toast('Zadej název zakázky.'); return; }

    // 1) zkus využít funkci z app.js (pokud ji máš)
    try {
      const viaApp = await callApp('createJob', { client_id: clientId, name });
      if (viaApp !== null && viaApp !== undefined) {
        toast('Zakázka přidána.');
        $inpJob.value = '';
        close();
        return;
      }
    } catch (e) {
      // pád ignore – zkusíme fallback
    }

    // 2) fallback – Supabase (pouze pokud máš globálně window.supabase / klíče uvnitř app.js)
    try {
      if (window.supabase && window.__SUPABASE) {
        const { url, key, schema } = window.__SUPABASE; // očekáváno, že sis to v app.js nastavil
        const sb = window.supabase.createClient(url, key, { db: { schema: schema || 'public' } });
        const { error } = await sb.from('job').insert([{ client_id: clientId, name }]);
        if (error) throw error;
        toast('Zakázka přidána.');
        $inpJob.value = '';
        close();
      } else {
        toast('Zakázku se nepodařilo přidat (není dostupné API).');
      }
    } catch (err) {
      console.error(err);
      toast('Chyba při přidání zakázky.');
    }
  });

  // ---------- přidání klienta ----------
  $btnClient?.addEventListener('click', async () => {
    const name = ($inpClient.value || '').trim();
    if (!name) { toast('Zadej název klienta.'); return; }

    // 1) zkus app.js
    try {
      const viaApp = await callApp('createClient', { name });
      if (viaApp !== null && viaApp !== undefined) {
        toast('Klient přidán.');
        $inpClient.value = '';
        hydrateClientsFromFilter(); // po přidání zkus klienty obnovit
        return;
      }
    } catch (e) {}

    // 2) fallback – Supabase
    try {
      if (window.supabase && window.__SUPABASE) {
        const { url, key, schema } = window.__SUPABASE;
        const sb = window.supabase.createClient(url, key, { db: { schema: schema || 'public' } });
        const { error } = await sb.from('client').insert([{ name }]);
        if (error) throw error;
        toast('Klient přidán.');
        $inpClient.value = '';
        hydrateClientsFromFilter();
      } else {
        toast('Klienta se nepodařilo přidat (není dostupné API).');
      }
    } catch (err) {
      console.error(err);
      toast('Chyba při přidání klienta.');
    }
  });

  // ---------- odhlášení ----------
  qs('#btnLogout')?.addEventListener('click', async () => {
    try {
      const viaApp = await callApp('logout');
      if (viaApp !== null && viaApp !== undefined) { close(); return; }
    } catch (e) {}

    try {
      if (window.supabase && window.__SUPABASE) {
        const { url, key, schema } = window.__SUPABASE;
        const sb = window.supabase.createClient(url, key, { db: { schema: schema || 'public' } });
        await sb.auth.signOut();
      }
    } catch (e) {}
    close();
  });

  // Malý komfort: ESC zavře
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $drawer.classList.contains('open')) close();
  });
})();
