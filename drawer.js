// drawer.js – kompletní, bez <script> tagů
document.addEventListener('DOMContentLoaded', () => {
  const body     = document.body;
  const fab      = document.getElementById('toolsFab');
  const drawer   = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsBackdrop');
  const btnClose = document.getElementById('toolsClose');

  // selecty v panelu
  const selClient = document.getElementById('newJobClient');
  const selStatus = document.getElementById('newJobStatus');

  // --- util ---
  const enableNativeSelect = (el) => {
    if (!el) return;
    // nativní UI (i na iOS Safari)
    el.style.pointerEvents = 'auto';
    el.style.webkitAppearance = 'menulist';
    el.style.appearance = 'menulist';
  };

  const setDrawerWidthVar = () => {
    if (!drawer) return;
    const w = Math.round(drawer.getBoundingClientRect().width || 420);
    document.documentElement.style.setProperty('--drawer-w', `${w}px`);
  };

  const openDrawer = () => {
    if (!drawer) return;
    setDrawerWidthVar();
    body.classList.add('drawer-open');           // pro CSS (schování FAB, lock scrollu ap.)
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    if (backdrop) backdrop.classList.add('show');

    // povolit nativní selecty
    enableNativeSelect(selClient);
    enableNativeSelect(selStatus);
  };

  const closeDrawer = () => {
    if (!drawer) return;
    body.classList.remove('drawer-open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    if (backdrop) backdrop.classList.remove('show');
    document.documentElement.style.removeProperty('--drawer-w');
  };

  // --- listeners ---
  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);

  // klik mimo panel (na backdrop)
  backdrop?.addEventListener('click', () => {
    if (drawer.classList.contains('open')) closeDrawer();
  });

  // ESC zavře
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // po změně rozměru aktualizuj CSS var
  let rAF;
  window.addEventListener('resize', () => {
    if (!drawer.classList.contains('open')) return;
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(setDrawerWidthVar);
  });
});
