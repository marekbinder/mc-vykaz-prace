/* Drawer – autonomní + „kulometně odolné“ roletky:
   - link na drawer.css doplní, pokud chybí
   - postaví FAB, backdrop, zásuvku (když nejsou)
   - při otevření: schová FAB, „odgumuje“ oba SELECTy, vyplní klienty,
     a nasadí fallback, který se snaží roletku rozbalit přes showPicker/klik
*/

(function () {
  const ready = (fn) => (document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', fn)
    : fn());

  ready(() => {
    // CSS link
    if (!document.querySelector('link[href$="drawer.css"], link[href*="drawer.css"]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'drawer.css';
      document.head.appendChild(l);
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

    // Backdrop
    let backdrop = document.getElementById('toolsBackdrop');
    if (!backdrop) {
      backdrop = document.createElement('div');
      backdrop.id = 'toolsBackdrop';
      document.body.appendChild(backdrop);
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

    // refs
    const btnClose   = drawer.querySelector('#toolsClose');
    const btnAddJob  = drawer.querySelector('#btnAddJob');
    const btnAddCl   = drawer.querySelector('#btnAddClient');
    const btnLogout  = drawer.querySelector('#btnLogout');

    // ===== helpery

    // z „pilu“ udělat čistý nativní SELECT + nasadit „otevři se“ fallback
    const unlockSelect = (sel) => {
      if (!sel) return sel;
      const clone = sel.cloneNode(true);
      clone.classList.remove('pill-select');
      clone.style.webkitAppearance = 'menulist-button';
      clone.style.appearance = 'menulist';
      clone.style.backgroundImage = 'none';
      clone.style.pointerEvents = 'auto';
      clone.style.position = 'relative';
      clone.style.zIndex = '2147483600';
      clone.style.minHeight = '44px';
      clone.style.width = '100%';

      // fallback – pokus o otevření pickeru (Chrome/Edge), případně fokus/klik
      const openNative = (el) => {
        try {
          if (typeof el.showPicker === 'function') el.showPicker();
          else { el.focus(); el.click(); }
        } catch { el.focus(); el.click(); }
      };
      clone.addEventListener('pointerdown', () => openNative(clone));
      clone.addEventListener('mousedown',   () => openNative(clone));
      clone.addEventListener('click', (e) => {
        // když je to jen „focus click“, zkus ještě jednou
        setTimeout(() => { if (document.activeElement === clone) openNative(clone); }, 0);
      });

      sel.replaceWith(clone);
      return clone;
    };

    const findTopClientSelect = () => {
      const selects = Array.from(document.querySelectorAll('select'))
        .filter(s => !drawer.contains(s)); // zásuvku ignorovat
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

    const populateClients = (targetSel) => {
      const top = findTopClientSelect();
      if (!top || !top.options) return;
      const prev = targetSel.value;
      targetSel.innerHTML = '';
      for (const o of top.options) {
        const txt = (o.text || '').trim();
        if (/všichni/i.test(txt) || /all/i.test(o.value || '')) continue;
        const opt = document.createElement('option');
        opt.value = o.value || txt;
        opt.text  = txt;
        targetSel.appendChild(opt);
      }
      if (prev) targetSel.value = prev;
      if (!targetSel.value && targetSel.options.length) targetSel.selectedIndex = 0;
    };

    const openDrawer = () => {
      // skryj FAB i záložně přes class
      fab.style.opacity = '0';
      fab.style.pointerEvents = 'none';
      document.body.classList.add('drawer-open');

      // odgumuj selecty
      let selClient = unlockSelect(document.getElementById('newJobClient'));
      let selStatus = unlockSelect(document.getElementById('newJobStatus'));

      // naplň klienty
      populateClients(selClient);

      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.body.style.overflow = 'hidden';

      // fokus do prvního pole
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
      fab.style.opacity = '';
      fab.style.pointerEvents = '';
      fab.focus();
    };

    // Handlery
    fab.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', closeDrawer);
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeDrawer(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

    // akce (napoj na tvoje funkce pokud existují)
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
