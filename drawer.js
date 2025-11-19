(function () {
  const onReady = (fn) =>
    (document.readyState === 'loading'
      ? document.addEventListener('DOMContentLoaded', fn)
      : fn());

  onReady(() => {
    // načíst CSS, pokud chybí
    if (!document.querySelector('link[href$="drawer.css"], link[href*="drawer.css"]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'drawer.css';
      document.head.appendChild(link);
    }

    // FAB
    let fab = document.getElementById('toolsFab');
    if (!fab) {
      fab = document.createElement('button');
      fab.id = 'toolsFab';
      fab.type = 'button';
      fab.setAttribute('aria-label','Nástroje');
      fab.textContent = '+';
      document.body.appendChild(fab);
    }

    // Původní backdrop přejmenuj na dim (pro kompatibilitu)
    let dim = document.getElementById('toolsDim') || document.getElementById('toolsBackdrop');
    if (!dim) {
      dim = document.createElement('div');
      dim.id = 'toolsDim';
      document.body.appendChild(dim);
    } else {
      dim.id = 'toolsDim';
    }
    dim.style.pointerEvents = 'none';

    // Klikací pás vlevo
    let hit = document.getElementById('toolsHit');
    if (!hit) {
      hit = document.createElement('div');
      hit.id = 'toolsHit';
      document.body.appendChild(hit);
    }

    // Drawer
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
        </div>`;
      document.body.appendChild(drawer);
    }

    // ——— utils ———
    const forceZ = () => {
      dim .style.setProperty('z-index','2147483400','important');
      hit .style.setProperty('z-index','2147483450','important');
      drawer.style.setProperty('z-index','2147483600','important');
      drawer.querySelectorAll('select').forEach(s=>{
        s.style.setProperty('z-index','2147483700','important');
        s.style.setProperty('position','relative','important');
      });
    };

    const drawerWidth = () => {
      // šířka je známá i offscreen – CSS width/min()
      const cs = getComputedStyle(drawer);
      const w  = parseFloat(cs.width) || drawer.getBoundingClientRect().width || 420;
      return Math.round(w);
    };

    const setHitRight = () => {
      hit.style.right = drawerWidth() + 'px';
    };

    const topClientSelect = () => {
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
      const src = topClientSelect();
      if (!src || !src.options) return;
      const keep = target.value;
      target.innerHTML = '';
      for (const o of src.options) {
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

    // ——— open / close ———
    let ro = null;

    const openDrawer = () => {
      document.body.classList.add('drawer-open');
      // připrav klikací pás ještě před zobrazením – odstraní „dvojitou“ animaci
      setHitRight();
      // zapnout dim i hit, otevřít drawer najednou
      dim.classList.add('show');
      hit.classList.add('show');
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';
      // naplnit klienty
      populateClients(document.getElementById('newJobClient'));
      forceZ();
      if (ro) ro.disconnect();
      ro = new ResizeObserver(setHitRight);
      ro.observe(drawer);
      setTimeout(() => document.getElementById('newJobClient')?.focus(), 0);
    };

    const closeDrawer = () => {
      drawer.classList.remove('open');
      dim.classList.remove('show');
      hit.classList.remove('show');
      document.body.style.overflow = '';
      document.body.classList.remove('drawer-open');
      if (ro) { ro.disconnect(); ro = null; }
      fab.focus();
    };

    fab.addEventListener('click', openDrawer);
    drawer.querySelector('#toolsClose').addEventListener('click', closeDrawer);
    hit.addEventListener('click', (e) => { if (e.target === hit) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

    // akce do app.js
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
