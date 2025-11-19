/* ===== Drawer – kompletní JS =====
   - backdrop je jen vizuální (nechytá kliky)
   - mimo panel zavíráme globálním klikem na dokument
   - FAB (+) skrýváme při otevření zásuvky
*/

(() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  // Vytvoř/nahraj FAB, Backdrop a Drawer (když už existují, jen je vezmeme)
  let fab = $('#toolsFab');
  if (!fab) {
    fab = document.createElement('button');
    fab.id = 'toolsFab';
    fab.type = 'button';
    fab.setAttribute('aria-label', 'Nástroje');
    fab.textContent = '+';
    document.body.appendChild(fab);
  }

  let backdrop = $('#toolsBackdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = 'toolsBackdrop';
    document.body.appendChild(backdrop);
  }

  let drawer = $('#toolsDrawer');
  if (!drawer) {
    // očekáváme, že HTML panelu už v DOM máš (podle tvé verze ho tam máš).
    // Pro jistotu vytvoříme minimalistický fallback, kdyby chyběl.
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

  // ——————————————————————————
  // Otevření / zavření panelu
  // ——————————————————————————
  const openDrawer = () => {
    drawer.classList.add('open');
    backdrop.classList.add('show');
    fab.classList.add('is-hidden');
    drawer.setAttribute('aria-hidden', 'false');
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

  // Klik mimo panel zavírá (backdrop nechytá kliky, takže to řešíme globálně)
  document.addEventListener('mousedown', (e) => {
    if (!drawer.classList.contains('open')) return;
    const inDrawer = drawer.contains(e.target);
    const onFab = fab.contains(e.target);
    if (!inDrawer && !onFab) closeDrawer();
  });

  // ——————————————————————————
  // Nativní selecty – jistota, že nejsou maskované
  // ——————————————————————————
  const enforceNativeSelect = (sel) => {
    if (!sel) return;
    sel.style.webkitAppearance = 'menulist';
    sel.style.appearance = 'menulist';
    sel.style.backgroundImage = 'none';
    sel.style.pointerEvents = 'auto';
  };
  enforceNativeSelect(newJobClient);
  enforceNativeSelect(newJobStatus);

  // ——————————————————————————
  // (Volitelné) naplnění statusů, pokud to nemáš z app.js
  // nechá se to klidně prázdné – tvůj app.js si to plní sám
  // ——————————————————————————
  if (newJobStatus && newJobStatus.options.length === 0) {
    const fallbackStatuses = [
      { value: 'NEW', label: 'Nová' },
      { value: 'WIP', label: 'Probíhá' },
      { value: 'DONE', label: 'Hotovo' }
    ];
    for (const s of fallbackStatuses) {
      const opt = document.createElement('option');
      opt.value = s.value;
      opt.textContent = s.label;
      newJobStatus.appendChild(opt);
    }
  }

  // Hotovo
})();
