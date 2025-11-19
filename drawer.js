// drawer.js – robustní verze (backdrop jen vizuální, kliky řeší #toolsHit)
document.addEventListener('DOMContentLoaded', () => {
  const body      = document.body;
  const fab       = document.getElementById('toolsFab');
  const drawer    = document.getElementById('toolsDrawer');
  let   backdrop  = document.getElementById('toolsBackdrop');
  let   hit       = document.getElementById('toolsHit');
  const btnClose  = document.getElementById('toolsClose');

  // vytvoříme chybějící vrstvy (pro jistotu)
  if (!backdrop){
    backdrop = document.createElement('div');
    backdrop.id = 'toolsBackdrop';
    document.body.appendChild(backdrop);
  }
  if (!hit){
    hit = document.createElement('div');
    hit.id = 'toolsHit';
    document.body.appendChild(hit);
  }

  const selClient = document.getElementById('newJobClient');
  const selStatus = document.getElementById('newJobStatus');

  const enableNativeSelect = (el) => {
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.style.webkitAppearance = 'menulist';
    el.style.appearance = 'menulist';
  };

  // nastaví pravý okraj obou overlayů tak, aby nikdy nekryly zásuvku
  const sizeOverlaysForDrawer = () => {
    const w = Math.round(drawer.getBoundingClientRect().width || 420);
    const right = Math.max(0, Math.min(window.innerWidth, w));
    // vizuální backdrop (jen efekt – pointer-events zůstanou none)
    backdrop.style.right = right + 'px';
    backdrop.style.left  = '0';
    // hit layer pro kliknutí
    hit.style.right = right + 'px';
    hit.style.left  = '0';
  };

  const resetOverlays = () => {
    backdrop.style.right = '0';  backdrop.style.left = '0';
    hit.style.right = '0';        hit.style.left = '0';
  };

  const openDrawer = () => {
    sizeOverlaysForDrawer();
    body.classList.add('drawer-open');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');

    // zapnout vizuální fade & hit layer až po vyjetí do stejného framu
    requestAnimationFrame(() => {
      backdrop.classList.add('show');
      hit.classList.add('show');          // začne chytat kliky vlevo
    });

    // Safari jistota
    enableNativeSelect(selClient);
    enableNativeSelect(selStatus);
  };

  const closeDrawer = () => {
    body.classList.remove('drawer-open');
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('show');
    hit.classList.remove('show');         // přestane chytat kliky
    resetOverlays();
  };

  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  hit?.addEventListener('click', () => drawer.classList.contains('open') && closeDrawer());
  document.addEventListener('keydown', (e) => (e.key === 'Escape' && drawer.classList.contains('open')) && closeDrawer());

  // přepočet při resize (pokud je otevřeno)
  let rAF;
  window.addEventListener('resize', () => {
    if (!drawer.classList.contains('open')) return;
    cancelAnimationFrame(rAF);
    rAF = requestAnimationFrame(sizeOverlaysForDrawer);
  });
});
