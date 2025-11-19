(() => {
  const DEFAULT_STATUS_CODE = 'NEW'; // nová zakázka se vytváří jako NEW

  const $ = (sel, root = document) => root.querySelector(sel);
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn, { passive: true });

  const fab       = $('#toolsFab');
  const backdrop  = $('#toolsBackdrop');
  const drawer    = $('#toolsDrawer');
  const btnClose  = $('#toolsClose');

  const inDrawer  = {
    client : $('#newJobClient'),
    name   : $('#newJobName'),
    addJob : $('#btnCreateJob'),
    newCli : $('#newClientName'),
    addCli : $('#btnCreateClient'),
    signOut: $('#btnSignOut'),
  };

  /** otevření / zavření **/
  const openDrawer = () => {
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('show');
    backdrop.setAttribute('aria-hidden','false');
    document.body.classList.add('tools-open');
    // po otevření fokus do prvního pole – ale až po paintu (kvůli iOS)
    requestAnimationFrame(() => inDrawer.client?.focus());
  };

  const closeDrawer = () => {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden','true');
    document.body.classList.remove('tools-open');
  };

  on(fab, 'click', openDrawer);
  on(backdrop, 'click', closeDrawer);
  on(btnClose, 'click', closeDrawer);
  on(document, 'keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  /** odesílání – necháváme tvoje stávající funkce; jen doplníme status NEW */
  on(inDrawer.addJob, 'click', async () => {
    const clientId = inDrawer.client?.value || '';
    const jobName  = (inDrawer.name?.value || '').trim();
    if (!clientId || !jobName) return;

    // Pokud máš v app.js globální funkci createJob -> použijeme ji.
    if (typeof window.createJob === 'function') {
      try {
        await window.createJob({
          client_id: clientId,
          name: jobName,
          status_code: DEFAULT_STATUS_CODE, // <— důležité
        });
        inDrawer.name.value = '';
        closeDrawer();
      } catch (err) {
        console.error('[drawer] createJob failed', err);
        alert('Nepodařilo se přidat zakázku.');
      }
      return;
    }

    // Fallback: pokud používáš Supabase klient jako window.supabase
    if (window.supabase) {
      try {
        // získej id statusu podle kódu
        const { data: st } = await window.supabase
          .from('job_status')
          .select('id,code')
          .eq('code', DEFAULT_STATUS_CODE)
          .maybeSingle();

        const status_id = st?.id ?? null;

        const { error } = await window.supabase
          .from('job')
          .insert([{ client_id: clientId, name: jobName, status_id }]);

        if (error) throw error;

        inDrawer.name.value = '';
        closeDrawer();

        // ať si appka zrefrešne přehled, pokud máš globální načítání
        if (typeof window.reloadJobs === 'function') window.reloadJobs();
      } catch (e) {
        console.error('[drawer] supabase insert failed', e);
        alert('Nepodařilo se přidat zakázku.');
      }
      return;
    }

    // úplně nejzákladnější fallback
    alert('Chybí napojení na createJob / Supabase – zkontroluj app.js.');
  });

  on(inDrawer.addCli, 'click', async () => {
    const name = (inDrawer.newCli?.value || '').trim();
    if (!name) return;

    if (typeof window.createClient === 'function') {
      try {
        await window.createClient({ name });
        inDrawer.newCli.value = '';
      } catch (e) {
        console.error('[drawer] createClient failed', e);
        alert('Nepodařilo se přidat klienta.');
      }
      return;
    }

    if (window.supabase) {
      try {
        const { error } = await window.supabase.from('client').insert([{ name }]);
        if (error) throw error;
        inDrawer.newCli.value = '';
        if (typeof window.reloadClients === 'function') window.reloadClients();
      } catch (e) {
        console.error('[drawer] supabase client insert failed', e);
        alert('Nepodařilo se přidat klienta.');
      }
      return;
    }

    alert('Chybí napojení na createClient / Supabase – zkontroluj app.js.');
  });

  on(inDrawer.signOut, 'click', async () => {
    if (typeof window.handleSignOut === 'function') return window.handleSignOut();
    if (window.supabase) {
      try { await window.supabase.auth.signOut(); location.reload(); }
      catch(e){ console.error(e); }
    }
  });
})();
