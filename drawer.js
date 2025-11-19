(() => {
  const html     = document.documentElement;
  const fab      = document.getElementById('toolsFab');
  const drawer   = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsBackdrop');
  const btnClose = document.getElementById('toolsClose');

  // formuláře
  const selClient     = document.getElementById('newJobClient');
  const inpJobName    = document.getElementById('newJobName');
  const selStatus     = document.getElementById('newJobStatus');
  const btnAddJob     = document.getElementById('btnAddJob');
  const inpClientName = document.getElementById('newClientName');
  const btnAddClient  = document.getElementById('btnAddClient');
  const btnLogout     = document.getElementById('btnLogout');

  const setVar = (n,v)=>html.style.setProperty(n,v);

  // Bezpečnost: vyrážíme s backdropem bez „díry“ a bez kliků
  function resetBackdrop() {
    backdrop.removeAttribute('data-hole');
    backdrop.style.pointerEvents = 'none'; // pojistka k CSS !important
  }

  function openDrawer(){
    // šířka panelu pro „díru“ v backdropu
    const w = Math.round(drawer.getBoundingClientRect().width || 420);
    setVar('--drawerW', w + 'px');

    // výchozí stav – backdrop bez díry, žádné kliky
    resetBackdrop();

    // 1) zviditelníme backdrop (fade)
    backdrop.classList.add('show');
    html.classList.add('drawer-open');

    // 2) necháme projít layout, pak otevřeme panel (slide)
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden','false');
    });

    // 3) po dokončení animace panelu teprve vyřežeme „díru“
    const onDone = (e) => {
      if (e.propertyName !== 'right') return;
      drawer.removeEventListener('transitionend', onDone);
      backdrop.setAttribute('data-hole','on');   // díra až teď → žádný problesk
      // i kdyby prohlížeč ignoroval pointer-events v některých stavech,
      // díra odhalí oblast zásuvky fyzicky.
    };
    drawer.addEventListener('transitionend', onDone, { once: true });

    // fokus do panelu
    setTimeout(() => (selClient || selStatus || btnClose)?.focus({preventScroll:true}), 60);
  }

  function closeDrawer(){
    // 1) nejdřív zacelíme „díru“, ať není vidět pozadí za panelem
    resetBackdrop();

    // 2) necháme chvíli (1 frame) a zavřeme panel
    requestAnimationFrame(() => {
      drawer.classList.remove('open');
      drawer.setAttribute('aria-hidden','true');
    });

    // 3) po dokončení animace panelu teprve schováme backdrop
    const onDone = (e) => {
      if (e.propertyName !== 'right') return;
      drawer.removeEventListener('transitionend', onDone);
      backdrop.classList.remove('show');
      html.classList.remove('drawer-open');
      fab?.focus({preventScroll:true});
    };
    drawer.addEventListener('transitionend', onDone, { once: true });
  }

  // Ovládání
  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer); // pro případ, že bys někdy zapnul pointer-events
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && drawer.classList.contains('open')) closeDrawer(); });

  // --- Fallback options, aby šel hned otestovat select ---
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

  // Hooky na akce – napoj si svoji logiku z app.js
  btnAddJob?.addEventListener('click', () => {
    // addJob(selClient.value, inpJobName.value, selStatus.value);
  });
  btnAddClient?.addEventListener('click', () => {
    // addClient(inpClientName.value);
  });
  btnLogout?.addEventListener('click', () => {
    // logout();
  });
})();
