/* ===== Drawer logic – plně izolované ===== */
(() => {
  const $ = s => document.querySelector(s);

  const root       = document.documentElement;  // kvůli .drawer-open
  const fab        = $('#toolsFab');
  const backdrop   = $('#toolsBackdrop');
  const drawer     = $('#toolsDrawer');
  const closeBtn   = $('#toolsClose');
  const hit        = $('#toolsHit');

  // formuláře
  const selClient  = $('#newJobClient');
  const selStatus  = $('#newJobStatus');
  const inpName    = $('#newJobName');
  const btnAddJob  = $('#btnAddJob');
  const inpNewCli  = $('#newClientName');
  const btnAddCli  = $('#btnAddClient');
  const btnLogout  = $('#btnLogout');

  function openDrawer() {
    drawer.classList.add('open');
    backdrop.classList.add('show');
    root.classList.add('drawer-open');
    // 100% klikatelný panel (nejvyšší z-index)
    drawer.style.zIndex = 2147483640;
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    root.classList.remove('drawer-open');
  }

  // Toggle
  fab?.addEventListener('click', openDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  /* --- SAFARI/CHROME: zajistíme nativní vzhled i klikatelnost selectů --- */
  function forceNativeSelect(selectEl){
    if (!selectEl) return;
    selectEl.classList.add('pill-select'); // kvůli CSS pravidlům výš
    selectEl.style.webkitAppearance = 'menulist';
    selectEl.style.appearance = 'menulist';
    selectEl.style.pointerEvents = 'auto';
  }
  forceNativeSelect(selClient);
  forceNativeSelect(selStatus);

  /* --- Pro jistotu: nic nad selecty nepřekrýváme --- */
  [selClient, selStatus].forEach(el=>{
    el?.addEventListener('mousedown', () => {
      // zrušíme případné clip-pathy/„hity“, kdyby něco zůstalo z dřívějška
      if (backdrop) {
        backdrop.style.clipPath = 'none';
        backdrop.style.right = '0';
      }
      if (hit) hit.style.pointerEvents = 'none';
    });
  });

  /* --- Drátování akčních tlačítek (udrženo kompatibilní se stávajícím app.js) --- */
  btnAddJob?.addEventListener('click', () => {
    // Vyvoláme existující globální addJob, pokud ho app.js poskytuje
    if (typeof window.addJob === 'function') {
      window.addJob();
    }
  });

  btnAddCli?.addEventListener('click', () => {
    if (typeof window.addClient === 'function') {
      window.addClient();
    }
  });

  btnLogout?.addEventListener('click', () => {
    if (typeof window.signOut === 'function') {
      window.signOut();
    }
  });

  /* --- ochrana: kdyby měl header nějaký vysoký z-index, drawer zvedneme --- */
  const raise = () => { drawer.style.zIndex = 2147483640; };
  ['focus','mousedown','touchstart'].forEach(evt => {
    selClient?.addEventListener(evt, raise);
    selStatus?.addEventListener(evt, raise);
    drawer?.addEventListener(evt, raise, true);
  });
})();
