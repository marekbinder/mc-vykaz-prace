// drawer.js – kompletní
document.addEventListener('DOMContentLoaded', () => {
  const body     = document.body;
  const fab      = document.getElementById('toolsFab');
  const drawer   = document.getElementById('toolsDrawer');
  const backdrop = document.getElementById('toolsBackdrop');
  const btnClose = document.getElementById('toolsClose');

  // prvky v panelu (kvůli nativním selectům)
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
    // reálná šířka (kvůli clip-path na backdropu)
    const w = Math.round(drawer.getBoundingClientRect().width || 420);
    document.documentElement.style.setProperty('--drawer-w', `${w}px`);
  };

  const openDrawer = () => {
    if (!drawer) return;
    setDrawerWidthVar();

    // vše najednou – žádné zdvojené animace
    body.classList.add('drawer-open');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop?.classList.add('show');

    enableNativeSelect(selClient);
    enableNativeSelect(selStatus);
  };

  const closeDrawer = () => {
    body.classList.remove('drawer-open');
    drawer?.classList.remove('open');
    drawer?.setAttribute('aria-hidden', 'true');
    backdrop?.classList.remove('show');
    document.documentElement.style.removeProperty('--drawer-w');
  };

  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', () => drawer?.classList.contains('open') && closeDrawer());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer?.classList.contains('open')) closeDrawer();
  });

  let rAF;
  window.addEventListener('resize', () => {
    if (!drawer?.classList.contains('open')) return;
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(setDrawerWidthVar);
  });
});
