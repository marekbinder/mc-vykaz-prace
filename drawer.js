/* Drawer – autonomní řešení:
   - přidá <link href="drawer.css"> pokud chybí
   - vytvoří FAB (+), backdrop a zásuvku pokud chybí
   - schová FAB, když je zásuvka otevřená
   - naklonuje klienty z horního filtru do #newJobClient
   - vynutí nativní select (appearance) i pro "Stav zakázky"
*/

(function () {
  const onReady = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

  onReady(() => {
    // 1) přidej drawer.css, pokud není
    if (!document.querySelector('link[href$="drawer.css"], link[href*="drawer.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'drawer.css';
      document.head.appendChild(l);
    }

    // 2) FAB
    let fab = document.getElementById('toolsFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'toolsFab';
      fab.type = 'button';
      fab.setAttribute('aria-label', 'Nástroje');
      fab.textContent = '+';
      document.body.appendChild(fab);
    }

    // 3) Backdrop
    let backdrop = document.getElementById('toolsBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'toolsBackdrop';
      document.body.appendChild(backdrop);
    }

    // 4) Drawer
    let drawer = document.getElementById('toolsDrawer');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.id = 'toolsDrawer';
      drawer.setAttribute('role', 'dialog');
      drawer.setAttribute('aria-label', 'Nástroje');

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
            <select id="newJobStatus" class="pill-select" aria-label="Stav">
              <option value="NEW">Nová</option>
              <option value="INPROGRESS">Probíhá</option>
              <option value="DONE">Hotovo</option>
            </select>
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
      document.body.appendChild(drawer);
    }

    // === refs
    const btnClose   = drawer.querySelector('#toolsClose');
    const btnAddJob  = drawer.querySelector('#btnAddJob');
    const btnAddCl   = drawer.querySelector('#btnAddClient');
    const btnLogout  = drawer.querySelector('#btnLogout');
    const selClient  = drawer.querySelector('#newJobClient');
    const selStatus  = drawer.querySelector('#newJobStatus');
    const inpJobName = drawer.querySelector('#newJobName');
    const inpClName  = drawer.querySelector('#newClientName');

    // === helpery
    const fixNativeSelect = (el) => {
      if (!el) return;
      el.style.webkitAppearance = 'menulist-button';
      el.style.appearance = 'menulist';
      el.style.backgroundImage = 'none';
      el.style.pointerEvents = 'auto';
      el.style.position = 'relative';
      el.style.zIndex = '3';
    };

    const populateClients = () => {
      // najdeme rozumný zdroj (horní filtr klientů)
      let topClientSelect = null;
      const allSelects = Array.from(document.querySelectorAll('select'));

      for (const s of allSelects) {
        const n = s.options?.length || 0;
        const label = (s.getAttribute('aria-label') || s.id || '').toLowerCase();
        const firstTxt = (s.options?.[0]?.text || '').toLowerCase();
        if (n >= 2 && (label.includes('klient') || firstTxt.includes('všichni'))) { topClientSelect = s; break; }
      }

      if (!topClientSelect || !topClientSelect.options) return;
      const prev = selClient.value;
      selClient.innerHTML = '';

      for (const opt of topClientSelect.options) {
        const text = (opt.text || '').trim();
        // přeskoč „Všichni klienti“
        if (/všichni/i.test(text) || /all/i.test(opt.value || '')) continue;
        const o = document.createElement('option');
        o.value = opt.value || text;
        o.text  = text;
        selClient.appendChild(o);
      }
      if (prev) selClient.value = prev;
      if (!selClient.value && selClient.options.length) selClient.selectedIndex = 0;
    };

    const openDrawer = () => {
      populateClients();
      fixNativeSelect(selClient);
      fixNativeSelect(selStatus);

      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';

      // schovej FAB, ať se nepřekrývá s křížkem
      fab.style.opacity = '0';
      fab.style.pointerEvents = 'none';

      setTimeout(() => { (selClient.options.length ? selClient : inpJobName).focus(); }, 0);
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      document.body.style.overflow = '';

      // vrať FAB
      fab.style.opacity = '';
      fab.style.pointerEvents = '';

      fab.focus();
    };

    // === události
    fab.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

    // === akce (napojení nechávám na tvoje app.js funkce; když nejsou, lognu)
    btnAddJob.addEventListener('click', () => {
      const payload = {
        client_id: selClient.value || null,
        name: (inpJobName.value || '').trim(),
        status: selStatus.value || 'NEW'
      };
      if (typeof window.addJob === 'function') window.addJob(payload);
      else console.log('[drawer] Přidat zakázku:', payload);
    });

    btnAddCl.addEventListener('click', () => {
      const name = (inpClName.value || '').trim();
      if (!name) return;
      if (typeof window.addClient === 'function') window.addClient({ name });
      else console.log('[drawer] Přidat klienta:', name);
    });

    btnLogout.addEventListener('click', () => {
      if (typeof window.logout === 'function') window.logout();
      else console.log('[drawer] Odhlásit');
    });
  });
})();
