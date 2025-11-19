// drawer.js – kompletní
document.addEventListener('DOMContentLoaded', () => {
  const body     = document.body;
  const fab      = document.getElementById('toolsFab');
  const drawer   = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsBackdrop');
  const btnClose = document.getElementById('toolsClose');

  const selClient = document.getElementById('newJobClient');
  const selStatus = document.getElementById('newJobStatus');

  const enableNativeSelect = (el) => {
    if (!el) return;
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
    setDrawerWidthVar();                 // 1) stanov pruh vpravo
    body.classList.add('drawer-open');   // 2) schovej FAB
    backdrop.classList.add('show');      // 3) zapni backdrop (jen fade)
    drawer.classList.add('open');        // 4) vyjeď zásuvku
    drawer.setAttribute('aria-hidden', 'false');

    enableNativeSelect(selClient);
    enableNativeSelect(selStatus);
  };

  const closeDrawer = () => {
    body.classList.remove('drawer-open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('show');
    document.documentElement.style.removeProperty('--drawer-w');
  };

  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);

  // klik mimo panel zavře (backdrop NIKDY nepokrývá pruh zásuvky)
  backdrop?.addEventListener('click', () => {
    if (drawer.classList.contains('open')) closeDrawer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // přepočet pruhu při resize
  let rAF;
  window.addEventListener('resize', () => {
    if (!drawer.classList.contains('open')) return;
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(setDrawerWidthVar);
  });
});
