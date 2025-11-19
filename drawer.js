(function () {
  const ready = (fn) => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn)
    : fn());

  ready(() => {
    // ——— CSS jistota
    if (!document.querySelector('link[href$="drawer.css"], link[href*="drawer.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'drawer.css';
      document.head.appendChild(l);
    }

    // ——— FAB
    let fab = document.getElementById('toolsFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'toolsFab';
      fab.type = 'button';
      fab.setAttribute('aria-label','Nástroje');
      fab.textContent = '+';
      document.body.appendChild(fab);
    }

    // ——— Backdrop
    let backdrop = document.getElementById('toolsBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'toolsBackdrop';
      document.body.appendChild(backdrop);
    }

    // ——— Drawer
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

    // ——— Pojistky z-indexů (když by je něco přepsalo)
    const forceTop = () => {
      backdrop.style.setProperty('z-index','2147483400','important');
      drawer  .style.setProperty('z-index','2147483600','important');
      drawer.querySelectorAll('select').forEach(s=>{
        s.style.setProperty('z-index','2147483700','important');
        s.style.setProperty('position','relative','important');
      });
    };
    forceTop();

    // ——— Pomocné funkce
    const unlockSelect = (sel) => {
      if (!sel) return sel;
      const c = sel.cloneNode(true);
      c.classList.remove('pill-select');
      c.style.webkitAppearance = 'menulist-button';
      c.style.appearance = 'menulist';
      c.style.backgroundImage = 'none';
      c.style.pointerEvents = 'auto';
      c.style.position = 'relative';
      c.style.zIndex = '2147483700';
      c.style.minHeight = '44px';
      c.style.width = '100%';
      sel.replaceWith(c);
      return c;
    };

    const findTopClientSelect = () => {
      const selects = Array.from(document.querySelectorAll('select')).filter(s => !drawer.contains(s));
      for (const s of selects) {
        const n = s.options?.length || 0;
        const label = (s.getAttribute('aria-label') || s.id || '').toLowerCase();
        const first = (s.options?.[0]?.text || '').toLowerCase();
        if (n >= 2 && (label.includes('klient') || first.includes('všichni'))) return s;
      }
      return null;
    };

    const populateClients = (target) => {
      const top = findTopClientSelect();
      if (!top || !top.options) return;
      const keep = target.value;
      target.innerHTML = '';
      for (const o of top.options) {
        const txt = (o.text || '').trim();
        if (/všichni/i.test(txt) || /all/i.test(o.value || '')) continue;
        const opt = document.createElement('option');
        opt.value = o.value || txt;
        opt.text  = txt;
        target.appendChild(opt);
      }
      if (keep) target.value = keep;
      if (!target.value && target.options.length) target.selectedIndex = 0;
    };

    // ——— Backdrop „s dírou“
    let resizeObserver;
    const fitBackdropHole = () => {
      // nastavíme pravý okraj backdropu na aktuální šířku draweru → oblast pod drawerem není zakrytá
      const w = Math.round(drawer.getBoundingClientRect().width);
      backdrop.style.right = w + 'px';
    };

    const openDrawer = () => {
      document.body.classList.add('drawer-open');

      // odemkni nativní selecty
      const selClient = unlockSelect(document.getElementById('newJobClient'));
      unlockSelect(document.getElementById('newJobStatus'));

      // naplň klienty
      populateClients(selClient);

      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';

      forceTop();
      fitBackdropHole();                        // vytvoř „díru“ v backdropu pod drawerem

      // reaguj i na změnu šířky (responsivně)
      const ro = new ResizeObserver(fitBackdropHole);
      ro.observe(drawer);
      resizeObserver = ro;

      setTimeout(() => {
        if (selClient.options.length) selClient.focus();
        else document.getElementById('newJobName')?.focus();
      }, 0);
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      document.body.style.overflow = '';
      document.body.classList.remove('drawer-open');
      backdrop.style.right = '0px';             // vrátit backdrop přes celou šířku
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }
      fab.style.opacity = '';
      fab.style.pointerEvents = '';
      fab.focus();
    };

    // ——— Ovládání
    fab.addEventListener('click', openDrawer);
    drawer.querySelector('#toolsClose') .addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

    // ——— Akce (napoj si na svoje funkce)
    const val = (id) => (document.getElementById(id)?.value || '').trim();

    drawer.querySelector('#btnAddJob').addEventListener('click', () => {
      const payload = {
        client_id: val('newJobClient') || null,
        name:      val('newJobName'),
        status:    val('newJobStatus') || 'NEW'
      };
      if (typeof window.addJob === 'function') window.addJob(payload);
      else console.log('[drawer] Přidat zakázku:', payload);
    });

    drawer.querySelector('#btnAddClient').addEventListener('click', () => {
      const name = val('newClientName');
      if (!name) return;
      if (typeof window.addClient === 'function') window.addClient({ name });
      else console.log('[drawer] Přidat klienta:', name);
    });

    drawer.querySelector('#btnLogout').addEventListener('click', () => {
      if (typeof window.logout === 'function') window.logout();
      else console.log('[drawer] Odhlásit');
    });
  });
})();
