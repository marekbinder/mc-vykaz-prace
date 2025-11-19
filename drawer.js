/* Drawer – plně autonomní:
   - sám vloží <link href="drawer.css"> pokud chybí
   - vytvoří FAB (+), backdrop i zásuvku, pokud chybí
   - otevření/zavření, ESC, klik mimo
   - při otevření naklonuje možnosti z horního filtru klientů do #newJobClient
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

    const btnClose   = drawer.querySelector('#toolsClose');
    const btnAddJob  = drawer.querySelector('#btnAddJob');
    const btnAddCl   = drawer.querySelector('#btnAddClient');
    const btnLogout  = drawer.querySelector('#btnLogout');
    const selClient  = drawer.querySelector('#newJobClient');
    const selStatus  = drawer.querySelector('#newJobStatus');
    const inpJobName = drawer.querySelector('#newJobName');
    const inpClName  = drawer.querySelector('#newClientName');

    // ===== Helpery
    const openDrawer = () => {
      populateClients();                 // naplníme klienty až při otevření
      // jistota: nativní vzhled selectů (přebíjí případné globální pilly)
      fixNativeSelect(selClient);
      fixNativeSelect(selStatus);

      drawer.classList.add('open');
      backdrop.classList.add('show');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      // přeneseme focus
      setTimeout(() => { (selClient.options.length ? selClient : inpJobName).focus(); }, 0);
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      drawer.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      fab.focus();
    };

    const fixNativeSelect = (el) => {
      if (!el) return;
      el.style.webkitAppearance = 'menulist-button';
      el.style.appearance = 'menulist';
      el.style.backgroundImage = 'none';
      el.style.pointerEvents = 'auto';
    };

    // Naklonuje možnosti z horního filtru klientů (id může být #filterClient nebo podobné)
    const populateClients = () => {
      // najdeme první select nahoře, který vypadá jako filtr klientů
      const cand = document.querySelector('#filterClient, select[aria-label="Všichni klienti"], select[aria-label="Klient"], .filters select');
      // Pokud máme více selectů ve filtrech, vezmeme ten, kde je > 1 option a první má hodnotu typu "ALL" nebo placeholder
      let topClientSelect = null;
      const allSelects = Array.from(document.querySelectorAll('select'));
      for (const s of allSelects) {
        const n = s.options?.length || 0;
        const txt = (s.options?.[0]?.text || '').toLowerCase();
        if (n >= 2 && /klient/i.test(s.getAttribute('aria-label') || '') || /klient/i.test(s.id)) {
          topClientSelect = s; break;
        }
        if (!topClientSelect && n >= 2 && /(klient|všichni)/i.test(txt)) topClientSelect = s;
      }
      if (!topClientSelect) topClientSelect = cand;

      // pokud nic, necháme jak je (uživatel může dopsat ručně)
      if (!topClientSelect || !topClientSelect.options) return;

      const prev = selClient.value;
      selClient.innerHTML = ''; // reset
      for (const opt of topClientSelect.options) {
        // přeskoč případné "Všichni klienti"/"ALL"
        const t = (opt.text || '').trim();
        if (/všichni/i.test(t) || /all/i.test(opt.value || '') ) continue;
        const o = document.createElement('option');
        o.value = opt.value || t;
        o.text  = t;
        selClient.appendChild(o);
      }
      // pokus o zachování volby
      if (prev) selClient.value = prev;
      // fallback: vyber první
      if (!selClient.value && selClient.options.length) selClient.selectedIndex = 0;
    };

    // ===== Události
    fab.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeDrawer();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });

    // Placeholder akce (ponechávám volání na tvoje existující funkce, pokud v app.js jsou)
    btnAddJob.addEventListener('click', () => {
      const payload = {
        client_id: selClient.value || null,
        name: (inpJobName.value || '').trim(),
        status: selStatus.value || 'NEW'
      };
      // Pokud máš v app.js metodu addJob(payload), zavolej ji:
      if (typeof window.addJob === 'function') {
        window.addJob(payload);
      } else {
        console.log('[drawer] Přidat zakázku:', payload);
      }
    });

    btnAddCl.addEventListener('click', () => {
      const name = (inpClName.value || '').trim();
      if (!name) return;
      if (typeof window.addClient === 'function') {
        window.addClient({ name });
      } else {
        console.log('[drawer] Přidat klienta:', name);
      }
    });

    btnLogout.addEventListener('click', () => {
      if (typeof window.logout === 'function') {
        window.logout();
      } else {
        console.log('[drawer] Odhlásit');
      }
    });

  });
})();
