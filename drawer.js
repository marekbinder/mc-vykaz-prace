/* Drawer – autonomní panel nástrojů
   - vloží <link href="drawer.css"> pokud chybí
   - vytvoří FAB (+), backdrop a zásuvku
   - při otevření naklonuje klienty z horního filtru do #newJobClient
   - pole pro stav zakázky JE ODSTRANĚNO (stav = 'NEW')
*/

(function () {
  const onReady = (fn) =>
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn)
      : fn();

  onReady(() => {
    // ===== CSS (pokud chybí)
    if (!document.querySelector('link[href$="drawer.css"], link[href*="drawer.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'drawer.css';
      document.head.appendChild(l);
    }

    // ===== FAB
    let fab = document.getElementById('toolsFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'toolsFab';
      fab.type = 'button';
      fab.setAttribute('aria-label', 'Nástroje');
      fab.textContent = '+';
      document.body.appendChild(fab);
    }

    // ===== Backdrop
    let backdrop = document.getElementById('toolsBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'toolsBackdrop';
      document.body.appendChild(backdrop);
    }

    // ===== Drawer (vždy přepíšu vnitřek na aktuální verzi bez "Stavu")
    let drawer = document.getElementById('toolsDrawer');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.id = 'toolsDrawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-label', 'Nástroje');
      document.body.appendChild(drawer);
    }
    drawer.innerHTML = `
      <div class="toolsHead">
        <div class="toolsTitle">Nástroje</div>
        <button id="toolsClose" type="button" aria-label="Zavřít"></button>
      </div>
      <div class="toolsBody">

        <section class="toolsSection" aria-labelledby="sec-add-job">
          <h3 id="sec-add-job">Přidání zakázky</h3>
          <select id="newJobClient" class="pill-select" aria-label="Klient"></select>
          <input  id="newJobName"   class="pill-input"  type="text" placeholder="Název zakázky">
          <button id="btnAddJob" class="pill-btn" type="button">Přidat zakázku</button>
        </section>

        <section class="toolsSection" aria-labelledby="sec-add-client">
          <h3 id="sec-add-client">Přidání klienta</h3>
          <input id="newClientName" class="pill-input" type="text" placeholder="Název klienta">
          <button id="btnAddClient" class="pill-btn" type="button">Přidat klienta</button>
        </section>

        <section class="toolsSection" aria-labelledby="sec-account">
          <h3 id="sec-account">Účet</h3>
          <button id="btnLogout" class="pill-btn" type="button">Odhlásit</button>
        </section>

      </div>
    `;

    // Kdyby v DOMu náhodou z dřívějška zůstal #newJobStatus, smaž ho:
    const legacyStatus = drawer.querySelector('#newJobStatus');
    if (legacyStatus) legacyStatus.remove();

    // ===== Refs
    const btnClose   = drawer.querySelector('#toolsClose');
    const btnAddJob  = drawer.querySelector('#btnAddJob');
    const btnAddCl   = drawer.querySelector('#btnAddClient');
    const btnLogout  = drawer.querySelector('#btnLogout');
    const selClient  = drawer.querySelector('#newJobClient');
    const inpJobName = drawer.querySelector('#newJobName');
    const inpClName  = drawer.querySelector('#newClientName');

    // ===== Helpery
    const hideFab = () => {
      if (!fab) return;
      fab.setAttribute('aria-hidden', 'true');
      fab.style.opacity = '0';
      fab.style.pointerEvents = 'none';
    };
    const showFab = () => {
      if (!fab) return;
      fab.removeAttribute('aria-hidden');
      fab.style.opacity = '';
      fab.style.pointerEvents = '';
    };

    const fixNativeSelect = (el) => {
      if (!el) return;
      el.style.webkitAppearance = 'menulist-button';
      el.style.appearance = 'menulist';
      el.style.backgroundImage = 'none';
      el.style.pointerEvents = 'auto';
    };

    const populateClients = () => {
      // pokusně najdu horní filtr klientů
      let top = null;
      const all = Array.from(document.querySelectorAll('select'));
      for (const s of all) {
        const n = s.options?.length || 0;
        const aria = s.getAttribute('aria-label') || '';
        const id   = s.id || '';
        const first = (s.options?.[0]?.text || '').toLowerCase();
        if (n >= 2 && ((/klient/i.test(aria)) || (/klient/i.test(id)))) { top = s; break; }
        if (!top && n >= 2 && /(klient|všichni)/i.test(first)) top = s;
      }
      if (!top) top = document.querySelector('#filterClient');

      if (!top || !top.options) return;

      const prev = selClient.value;
      selClient.innerHTML = '';
      for (const opt of top.options) {
        const t = (opt.text || '').trim();
        const v = opt.value || t;
        if (/všichni/i.test(t) || /all/i.test(v)) continue;
        const o = document.createElement('option');
        o.value = v;
        o.text  = t;
        selClient.appendChild(o);
      }
      if (prev) selClient.value = prev;
      if (!selClient.value && selClient.options.length) selClient.selectedIndex = 0;
    };

    const openDrawer = () => {
      populateClients();
      fixNativeSelect(selClient);

      drawer.classList.add('open');
      backdrop.classList.add('show');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      hideFab();

      setTimeout(() => { (selClient.options.length ? selClient : inpJobName).focus(); }, 0);
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      showFab();
      fab.focus();
    };

    // ===== Události UI
    fab.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

    // ===== Přidání zakázky (stav = NEW; maximum kompatibility s existujícím app.js)
    btnAddJob.addEventListener('click', () => {
      const cid  = selClient.value || null;
      const name = (inpJobName.value || '').trim();
      if (!cid || !name) return;

      const detail = { clientId: cid, client_id: cid, name, status: 'NEW' };

      // 1) CustomEvent pro případný listener v app.js
      try { document.dispatchEvent(new CustomEvent('drawer:addJob', { detail })); } catch {}

      // 2) Fallbacky na možné signatury
      let called = false;
      try {
        if (typeof window.addJob === 'function') {
          if (window.addJob.length >= 2) { window.addJob(cid, name); called = true; }
          else { window.addJob(detail); called = true; }
        } else if (typeof window.addNewJob === 'function') {
          if (window.addNewJob.length >= 2) { window.addNewJob(cid, name); called = true; }
          else { window.addNewJob(detail); called = true; }
        }
      } catch (e) {
        console.error('[drawer] addJob call failed:', e);
      }

      if (!called) console.log('[drawer] Přidat zakázku (fallback log):', detail);

      // necháme panel otevřený, jen vyčistíme název
      inpJobName.value = '';
      inpJobName.focus();
    });

    // ===== Přidání klienta
    btnAddCl.addEventListener('click', () => {
      const name = (inpClName.value || '').trim();
      if (!name) return;

      let called = false;
      try {
        if (typeof window.addClient === 'function') { window.addClient({ name }); called = true; }
      } catch (e) {
        console.error('[drawer] addClient call failed:', e);
      }
      if (!called) {
        try { document.dispatchEvent(new CustomEvent('drawer:addClient', { detail: { name } })); } catch {}
        console.log('[drawer] Přidat klienta (fallback log):', name);
      }
      inpClName.value = '';
      inpClName.focus();
    });

    // ===== Odhlášení
    btnLogout.addEventListener('click', () => {
      if (typeof window.logout === 'function') window.logout();
      else {
        try { document.dispatchEvent(new CustomEvent('drawer:logout')); } catch {}
        console.log('[drawer] Odhlásit (fallback log)');
      }
    });
  });
})();
