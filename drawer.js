(() => {
  const html          = document.documentElement;
  const fab           = document.getElementById('toolsFab');
  const drawer        = document.getElementById('toolsDrawer');
  const backdrop      = document.getElementById('toolsBackdrop');
  const btnClose      = document.getElementById('toolsClose');

  // formuláře
  const selClient     = document.getElementById('newJobClient');
  const inpJobName    = document.getElementById('newJobName');
  const selStatus     = document.getElementById('newJobStatus');
  const btnAddJob     = document.getElementById('btnAddJob');
  const inpClientName = document.getElementById('newClientName');
  const btnAddClient  = document.getElementById('btnAddClient');
  const btnLogout     = document.getElementById('btnLogout');

  // --- pomocné ---
  const setVar = (name, val) => html.style.setProperty(name, val);

  function openDrawer(){
    // nastavíme skutečnou šířku panelu do CSS proměnné (pro výřez v backdropu)
    const w = Math.round(drawer.getBoundingClientRect().width);
    setVar('--drawerW', w + 'px');

    backdrop.classList.add('show');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    html.classList.add('drawer-open');

    // zaměř první prvek (kvůli a11y)
    setTimeout(() => {
      (selClient || selStatus || btnClose).focus({preventScroll:true});
    }, 0);
  }

  function closeDrawer(){
    backdrop.classList.remove('show');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    html.classList.remove('drawer-open');
    // vrátíme fokus zpět na FAB
    setTimeout(() => fab && fab.focus({preventScroll:true}), 0);
  }

  // Ovládání
  fab && fab.addEventListener('click', openDrawer);
  btnClose && btnClose.addEventListener('click', closeDrawer);
  // klik vedle zásuvky zavírá
  backdrop && backdrop.addEventListener('click', closeDrawer);
  // Esc zavírá
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      closeDrawer();
    }
  });

  // === DEMO napojení – jen sloty; tvůj app.js plní data ===
  // Ujisti se, že app.js po načtení doplňuje <option> do #newJobClient a #newJobStatus.
  // Tady jen ohlídáme fallback, aby bylo s čím testovat:
  function ensureOptions(){
    if (selClient && selClient.options.length === 0) {
      selClient.innerHTML = `
        <option value="">Vyber klienta…</option>
        <option value="demo-1">ALKO</option>
        <option value="demo-2">E.ON</option>
      `;
    }
    if (selStatus && selStatus.options.length === 0) {
      selStatus.innerHTML = `
        <option value="NEW">Nová</option>
        <option value="RUN">Probíhá</option>
        <option value="DONE">Hotovo</option>
      `;
    }
  }
  ensureOptions();

  // Sem si zapojíš své existující handler funkce z app.js
  btnAddJob && btnAddJob.addEventListener('click', () => {
    // tvoje logika z app.js (pouze příklad):
    // addJob(selClient.value, inpJobName.value, selStatus.value);
  });
  btnAddClient && btnAddClient.addEventListener('click', () => {
    // tvoje logika z app.js
    // addClient(inpClientName.value);
  });
  btnLogout && btnLogout.addEventListener('click', () => {
    // tvoje logika z app.js
    // logout();
  });
})();
