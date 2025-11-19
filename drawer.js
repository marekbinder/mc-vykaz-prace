/* Drawer – autonomní:
   - přidá <link href="drawer.css"> pokud chybí
   - vytvoří FAB(+), backdrop a zásuvku, pokud chybí
   - při otevření: skryje FAB (i přes class na <body>), naplní klienty a „odgumuju“ oba selecty
*/

(function () {
  const ready = (fn) => (document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', fn) : fn());

  ready(() => {
    // 1) zajisti CSS
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
      fab.setAttribute('aria-label','Nástroje');
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
      drawer.setAttribute('role','dialog');
      drawer.setAttribute('aria-label','Nástroje');
      drawer.innerHTML = `
        <div class="toolsHead">
          <div class="toolsTitle">Nástroje</div>
          <button id="toolsClose" type="button" aria-label="Zavřít"></button>
        </div>
        <div class="toolsBody">
          <section class="toolsSection" aria-labelledby="sec-add-job">
            <h3 id="sec-add-job">Přidání zakázky</h3>
            <select id="newJobClient" class="pill-select" aria-label="Klient"></select>
            <input  id="newJobName"   class="pill-input" type="text" placeholder="Název zakázky">
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

    // --- refs
    const btnClose   = drawer.querySelector('#toolsClose');
    const btnAddJob  = drawer.querySelector('#btnAddJob');
    const btnAddCl   = drawer.querySelector('#btnAddClient');
    const btnLogout  = drawer.querySelector('#btnLogout');

    // ===== utily
    // „tvrdý reset“ selectu – odstraní pilí třídy a inline vrátí nativní vzhled,
    // plus enhancer pro showPicker (Chrome/Edge).
    const enhanceNativeSelect = (sel) => {
      if (!sel) return sel;
      const clone = sel.cloneNode(true);
      clone.classList.remove('pill-select');
      clone.removeAttribute('style');            // smaž staré inline
      // nativní vzhled – inline, ať to nic nepřepíše
      clone.style.webkitAppearance = 'menulist-button';
      clone.style.appearance = 'menulist';
      clone.style.backgroundImage = 'none';
      clone.style.pointerEvents = 'auto';
      clone.style.position = 'relative';
      clone.style.zIndex = '10';
      clone.style.minHeight = '44px';
      clone.style.width = '100%';

      // „rozbalovač“ i když je prohlížeč opatrný
      const hookShowPicker = (el) => {
        el.addEventListener('mousedown', (e) => {
          if (typeof el.showPicker === 'function') {
            // necháme DOM dostat focus, pak otevřeme picker
            setTimeout(() => el.showPicker(), 0);
          }
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && typeof el.showPicker === 'function') {
            e.preventDefault();
            el.showPicker();
          }
        });
      };

      sel.replaceWith(clone);
      hookShowPicker(clone);
      return clone;
    };

    const findTopClientSelect = () => {
      // Najdi SELECT mimo zásuvku, který je klientský filter
      const selects = Array.from(document.querySelectorAll('select'))
        .filter(s => !drawer.contains(s));  // zásuvku ignoruj

      for (const s of selects) {
        const n = s.options?.length || 0;
        const label = (s.getAttribute('aria-label') || s.id || '').toLowerCase();
        const first = (s.options?.[0]?.text || '').toLowerCase();
        if (n >= 2 && (label.includes('klient') || first.includes('všichni'))) {
          return s;
        }
      }
      return null;
    };

    const populateClients = (selClient) => {
      const top = findTopClientSelect();
      if (!top || !top.options) return;

      const prev = selClient.value;
      selClient.innerHTML = '';
      for (const o of top.options) {
        const txt = (o.text || '').trim();
        if (/všichni/i.test(txt) || /all/i.test(o.value || '')) continue;
        const opt = document.createElement('option');
        opt.value = o.value || txt;
        opt.text  = txt;
        selClient.appendChild(opt);
      }
      if (prev) selClient.value = prev;
      if (!selClient.value && selClient.options.length) selClient.selectedIndex = 0;
    };

    // otevření/zavření
    const openDrawer = () => {
      // schovej FAB (JS + class na body)
      fab.style.opacity = '0';
      fab.style.pointerEvents = 'none';
      document.body.classList.add('drawer-open');

      // „odgumuju“ selecty (vytvořím čisté klony)
      let selClient = document.getElementById('newJobClient');
      let selStatus = document.getElementById('newJobStatus');
      selClient = enhanceNativeSelect(selClient);
      selStatus = enhanceNativeSelect(selStatus);

      // naplním klienty
      populateClients(selClient);

      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';

      // fokus
      setTimeout(() => (selClient.options.length ? selClient : document.getElementById('newJobName')).focus(), 0);
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      document.body.style.overflow = '';
      document.body.classList.remove('drawer-open');
      fab.style.opacity = '';
      fab.style.pointerEvents = '';
      fab.focus();
    };

    // handlery
    fab.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

    // akce – napojení na tvoje funkce, když existují
    const getVal = (id) => (document.getElementById(id)?.value || '').trim();

    btnAddJob.addEventListener('click', () => {
      const payload = {
        client_id: getVal('newJobClient') || null,
        name:      getVal('newJobName'),
        status:    getVal('newJobStatus') || 'NEW'
      };
      if (typeof window.addJob === 'function') window.addJob(payload);
      else console.log('[drawer] Přidat zakázku:', payload);
    });

    btnAddClient.addEventListener('click', () => {
      const name = getVal('newClientName');
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
