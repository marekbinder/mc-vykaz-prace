/* ===== Drawer – komplet JS (1:1) =====
   - Backdrop je jen vizuální (pointer-events: none)
   - Zavírání klikem mimo panel řešíme globálně
   - FAB se při otevření skryje
   - Staré překryvy (#toolsHit apod.) odstraníme
*/

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  // Odstranit případné staré překryvy
  ['#toolsHit', '#hit', '#backHit'].forEach(id => { const n = $(id); if (n) n.remove(); });

  // FAB
  let fab = $('#toolsFab');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'toolsFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Nástroje');
    fab.textContent = '+';
    document.body.appendChild(fab);
  }

  // Backdrop (jen vizuální)
  let backdrop = $('#toolsBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'toolsBackdrop';
    document.body.appendChild(backdrop);
  }

  // Drawer (panel)
  let drawer = $('#toolsDrawer');
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
        <div class="toolsSection"><h3>Přidání zakázky</h3>
          <select id="newJobClient" class="pill-select"></select>
          <input id="newJobName" class="pill-input" placeholder="Název zakázky">
          <select id="newJobStatus" class="pill-select"></select>
          <button id="btnAddJob" class="pill-btn">Přidat zakázku</button>
        </div>
        <div class="toolsSection"><h3>Přidání klienta</h3>
          <input id="newClientName" class="pill-input" placeholder="Název klienta">
          <button id="btnAddClient" class="pill-btn">Přidat klienta</button>
        </div>
        <div class="toolsSection"><h3>Účet</h3>
          <button id="btnLogout" class="pill-btn">Odhlásit</button>
        </div>
      </div>`;
    document.body.appendChild(drawer);
  }

  const btnClose = $('#toolsClose', drawer);
  const newJobClient = $('#newJobClient', drawer);
  const newJobStatus = $('#newJobStatus', drawer);

  // Zajisti, že backdrop NIKDY nechytá kliky (obrana i proti cizím stylům)
  const ensureBackdropNoHit = () => {
    backdrop.style.pointerEvents = 'none'; // inline
    // navíc vložíme „pojistku“ s !important
    if (!$('#_drawerNoHit')) {
      const st = document.createElement('style');
      st.id = '_drawerNoHit';
      st.textContent = `
        #toolsBackdrop{pointer-events:none !important;}
        #toolsBackdrop.show{pointer-events:none !important;}
      `;
      document.head.appendChild(st);
    }
  };
  ensureBackdropNoHit();

  // nativní vzhled selectů (Safari-friendly)
  const enforceNativeSelect = (sel) => {
    if (!sel) return;
    sel.style.webkitAppearance = 'menulist';
    sel.style.appearance = 'menulist';
    sel.style.backgroundImage = 'none';
    sel.style.pointerEvents = 'auto';
  };
  enforceNativeSelect(newJobClient);
  enforceNativeSelect(newJobStatus);

  const openDrawer = () => {
    ensureBackdropNoHit();
    drawer.classList.add('open');
    backdrop.classList.add('show');
    fab.classList.add('is-hidden');
    drawer.setAttribute('aria-hidden', 'false');

    // Safari občas potřebuje malé zpoždění, aby selecty „ožily“
    setTimeout(() => {
      enforceNativeSelect(newJobClient);
      enforceNativeSelect(newJobStatus);
    }, 0);
  };

  const closeDrawer = () => {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    fab.classList.remove('is-hidden');
    drawer.setAttribute('aria-hidden', 'true');
  };

  // Toggle přes FAB
  fab.addEventListener('click', () => {
    if (drawer.classList.contains('open')) closeDrawer();
    else openDrawer();
  });

  // Křížek
  btnClose?.addEventListener('click', closeDrawer);

  // Esc zavírá
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // Klik mimo panel zavírá (backdrop nechytá kliky, proto posloucháme dokument)
  document.addEventListener('mousedown', (e) => {
    if (!drawer.classList.contains('open')) return;
    if (!drawer.contains(e.target) && !fab.contains(e.target)) closeDrawer();
  });

  // Pokud statusy neplní app.js, vložíme fallback
  if (newJobStatus && newJobStatus.options.length === 0) {
    const basic = [
      { value: 'NEW', label: 'Nová' },
      { value: 'WIP', label: 'Probíhá' },
      { value: 'DONE', label: 'Hotovo' }
    ];
    for (const s of basic) {
      const o = document.createElement('option');
      o.value = s.value; o.textContent = s.label;
      newJobStatus.appendChild(o);
    }
  }
})();
