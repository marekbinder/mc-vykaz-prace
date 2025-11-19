// drawer.js – bez závislostí
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

  // Backdrop má reálnou šířku jen po levý okraj zásuvky
  const setBackdropForDrawer = () => {
    const w = Math.round(drawer.getBoundingClientRect().width || 420);
    // clamping (pro malé viewporty) + vyhnout se negativním hodnotám
    const right = Math.max(0, Math.min(window.innerWidth, w));
    backdrop.style.right = right + 'px';
    backdrop.style.left  = '0';
  };

  const resetBackdrop = () => {
    // po zavření zase přes celou šířku
    backdrop.style.right = '0';
    backdrop.style.left  = '0';
  };

  const openDrawer = () => {
    setBackdropForDrawer();             // 1) vymezit prostor pro zásuvku
    body.classList.add('drawer-open');  // 2) schovat FAB
    backdrop.classList.add('show');     // 3) fade overlay
    drawer.classList.add('open');       // 4) vyjet zásuvku
    drawer.setAttribute('aria-hidden', 'false');

    // jistota pro Safari
    enableNativeSelect(selClient);
    enableNativeSelect(selStatus);
  };

  const closeDrawer = () => {
    body.classList.remove('drawer-open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('show');
    resetBackdrop();
  };

  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);

  // klik mimo panel zavře (overlay NIKDY nepokrývá oblast zásuvky)
  backdrop?.addEventListener('click', () => {
    if (drawer.classList.contains('open')) closeDrawer();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // přepočet při změně velikosti okna
  let rAF;
  window.addEventListener('resize', () => {
    if (!drawer.classList.contains('open')) return;
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(setBackdropForDrawer);
  });
});
