(() => {
  const DEFAULT_STATUS_CODE = 'NEW'; // nová zakázka se vytváří jako NEW

  const $  = (sel, root = document) => root.querySelector(sel);
  const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt || { passive: true });

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

  /* ---------- open / close ---------- */
  const openDrawer = () => {
    if (drawer.classList.contains('open')) return;
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.classList.add('show');
    backdrop.setAttribute('aria-hidden','false');
    document.body.classList.add('tools-open');
    // fokus po repaintu (Safari/iOS)
    requestAnimationFrame(() => inDrawer.client && inDrawer.client.focus());
  };

  const closeDrawer = () => {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('show');
    backdrop.setAttribute('aria-hidden','true');
    document.body.classList.remove('tools-open');
  };

  on(fab, 'click', openDrawer);
  on(btnClose, 'click', closeDrawer);
  on(document, 'keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // Backdrop je pouze vizuální (pointer-events:none), proto zavírání řešíme zde:
  const outsideClose = (e) => {
    if (!drawer.classList.contains('open')) return;
    const target = e.target;
    if (target.closest('#toolsDrawer')) return;     // klik uvnitř panelu
    if (target.closest('#toolsFab')) return;        // klik na FAB nechte otevřít/ignorovat
    closeDrawer();
  };
  on(document, 'mousedown', outsideClose, true);
  on(document, 'touchstart', outsideClose, true);

  /* ---------- create job (status NEW) ---------- */
  on(inDrawer.addJob, 'click', async () => {
    const clientId = inDrawer.client?.value || '';
    const jobName  = (inDrawer.name?.value || '').trim();
    if (!clientId || !jobName) return;

    // preferuj globální funkci, ať to sedí na tvoje app.js
    if (typeof window.createJob === 'function') {
      try {
        await window.createJob({
          client_id: clientId,
          name: jobName,
          status_code: DEFAULT_STATUS_CODE,
        });
        inDrawer.name.value = '';
        closeDrawer();
      } catch (err) {
        console.error('[drawer] createJob failed', err);
        alert('Nepodařilo se přidat zakázku.');
      }
      return;
    }

    // fallback: supabase
    if (window.supabase) {
      try {
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
        if (typeof window.reloadJobs === 'function') window.reloadJobs();
      } catch (e) {
        console.error('[drawer] supabase insert failed', e);
        alert('Nepodařilo se přidat zakázku.');
      }
      return;
    }

    alert('Chybí napojení na createJob / Supabase – zkontroluj app.js.');
  });

  /* ---------- create client ---------- */
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

  /* ---------- sign out ---------- */
  on(inDrawer.signOut, 'click', async () => {
    if (typeof window.handleSignOut === 'function') return window.handleSignOut();
    if (window.supabase) {
      try { await window.supabase.auth.signOut(); location.reload(); }
      catch(e){ console.error(e); }
    }
  });
})();
