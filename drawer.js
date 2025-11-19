/* Drawer – plně autonomní:
   - sám vloží <link href="drawer.css"> pokud chybí
   - vytvoří FAB (+), backdrop i zásuvku, pokud chybí
   - otevření/zavření, ESC, klik mimo
   - při otevření naklonuje možnosti z horního filtru klientů do #newJobClient
*/

(function () {
  const onReady = (fn) =>
    document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn)
      : fn();

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

    const openDrawer = () => {
      populateClients();                 // naplníme klienty až při otevření
      fixNativeSelect(selClient);        // nativní vzhled selectu

      drawer.classList.add('open');
      backdrop.classList.add('show');
      drawer.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      hideFab();

      // přeneseme focus
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

    const fixNativeSelect = (el) => {
      if (!el) return;
      el.style.webkitAppearance = 'menulist-button';
      el.style.appearance = 'menulist';
      el.style.backgroundImage = 'none';
      el.style.pointerEvents = 'auto';
    };

    // Naklonuje možnosti z horního filtru klientů
    const populateClients = () => {
      let topClientSelect = null;

      // Kandidáti podle aria-label/ID
      const allSelects = Array.from(document.querySelectorAll('select'));
      for (const s of allSelects) {
        const n = s.options?.length || 0;
        const aria = s.getAttribute('aria-label') || '';
        const id   = s.id || '';
        const firstTxt = (s.options?.[0]?.text || '').toLowerCase();

        if (n >= 2 && ((/klient/i.test(aria)) || (/klient/i.test(id)))) {
          topClientSelect = s;
          break;
        }
        if (!topClientSelect && n >= 2 && /(klient|všichni)/i.test(firstTxt)) {
          topClientSelect = s;
        }
      }

      if (!topClientSelect) {
        // fallback původní kandidát
        topClientSelect = document.querySelector('#filterClient, select[aria-label="Všichni klienti"], select[aria-label="Klient"], .filters select');
      }

      if (!topClientSelect || !topClientSelect.options) return;

      const prev = selClient.value;
      selClient.innerHTML = '';
      for (const opt of topClientSelect.options) {
        const t = (opt.text || '').trim();
        const v = opt.value || t;
        // přeskoč „Všichni klienti“ / ALL
        if (/všichni/i.test(t) || /all/i.test(v)) continue;

        const o = document.createElement('option');
        o.value = v;
        o.text  = t;
        selClient.appendChild(o);
      }
      if (prev) selClient.value = prev;
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

    // Přidání zakázky – vždy status NEW
    btnAddJob.addEventListener('click', () => {
      const cid  = selClient.value || null;
      const name = (inpJobName.value || '').trim();
      if (!cid || !name) return;

      const payload = { clientId: cid, client_id: cid, name, status: 'NEW' };

      // 1) event pro app.js, který poslouchá 'drawer:addJob'
      document.dispatchEvent(new CustomEvent('drawer:addJob', { detail: payload }));
      // 2) fallback – přímé volání, pokud máš funkci
      if (typeof window.addJob === 'function') {
        window.addJob(payload);
      } else {
        console.log('[drawer] Přidat zakázku:', payload);
      }

      // vyčištění názvu a necháme panel otevřený
      inpJobName.value = '';
    });

    btnAddCl.addEventListener('click', () => {
      const name = (inpClName.value || '').trim();
      if (!name) return;

      if (typeof window.addClient === 'function') {
        window.addClient({ name });
      } else {
        document.dispatchEvent(new CustomEvent('drawer:addClient', { detail: { name } }));
        console.log('[drawer] Přidat klienta:', name);
      }
      inpClName.value = '';
    });

    btnLogout.addEventListener('click', () => {
      if (typeof window.logout === 'function') {
        window.logout();
      } else {
        document.dispatchEvent(new CustomEvent('drawer:logout'));
        console.log('[drawer] Odhlásit');
      }
    });
  });
})();
