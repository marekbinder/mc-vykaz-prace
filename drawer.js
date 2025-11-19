/* ===== Drawer logic – bez klikacího backdropu ===== */
(() => {
  const $ = s => document.querySelector(s);

  const root       = document.documentElement;
  const fab        = $('#toolsFab');
  const backdrop   = $('#toolsBackdrop');
  const drawer     = $('#toolsDrawer');
  const closeBtn   = $('#toolsClose');

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
    // pojistka: drawer opravdu nad vším
    drawer.style.zIndex = 2147483640;
    // zapneme hlídání kliku mimo
    enableOutsideClose();
  }

  function closeDrawer() {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    root.classList.remove('drawer-open');
    disableOutsideClose();
  }

  fab?.addEventListener('click', openDrawer);
  closeBtn?.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  /* Klik mimo panel – nahrazujeme klikací backdrop */
  function onDocPointer(e){
    if (!drawer.classList.contains('open')) return;
    const inside = e.target.closest('#toolsDrawer') || e.target.closest('#toolsFab');
    if (!inside) closeDrawer();
  }
  function enableOutsideClose(){
    document.addEventListener('pointerdown', onDocPointer, true);
    document.addEventListener('click', onDocPointer, true);
  }
  function disableOutsideClose(){
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('click', onDocPointer, true);
  }

  /* nativní vzhled selectů + jistota klikatelnosti (Safari/Chrome) */
  [selClient, selStatus].forEach(el=>{
    if(!el) return;
    el.classList.add('pill-select');
    el.style.webkitAppearance = 'menulist';
    el.style.appearance = 'menulist';
    el.style.pointerEvents = 'auto';
    el.addEventListener('mousedown', () => {
      // kdyby někde zůstaly masky/clip-path, zrušíme
      backdrop.style.clipPath = 'none';
      backdrop.style.right = '0';
      drawer.style.zIndex = 2147483640;
    });
  });

  /* přeposíláme do existující app.js */
  btnAddJob?.addEventListener('click', () => { if (typeof window.addJob === 'function') window.addJob(); });
  btnAddCli?.addEventListener('click', () => { if (typeof window.addClient === 'function') window.addClient(); });
  btnLogout?.addEventListener('click', () => { if (typeof window.signOut === 'function') window.signOut(); });
})();
