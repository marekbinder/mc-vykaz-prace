<script>
(() => {
  const body      = document.body;
  const fab       = document.getElementById('toolsFab');
  const drawer    = document.getElementById('toolsDrawer');
  const backdrop  = document.getElementById('toolsBackdrop');
  const btnClose  = document.getElementById('toolsClose');

  const selClient = document.getElementById('newJobClient');
  const selStatus = document.getElementById('newJobStatus');

  function enableNativeSelect(el){
    if (!el) return;
    el.style.pointerEvents = 'auto';
    el.style.webkitAppearance = 'menulist';
    el.style.appearance = 'menulist';
  }

  function setBackdropWidthToDrawer(){
    const w = Math.round(drawer.getBoundingClientRect().width || 420);
    document.documentElement.style.setProperty('--drawer-w', w + 'px');
  }

  function openDrawer(){
    body.classList.add('drawer-open');
    setBackdropWidthToDrawer();

    drawer.setAttribute('aria-hidden','false');
    drawer.classList.add('open');
    backdrop.classList.add('show');

    // pojistky pro nativní selecty
    enableNativeSelect(selClient);
    enableNativeSelect(selStatus);
  }

  function closeDrawer(){
    body.classList.remove('drawer-open');

    drawer.setAttribute('aria-hidden','true');
    drawer.classList.remove('open');
    backdrop.classList.remove('show');

    document.documentElement.style.removeProperty('--drawer-w');
  }

  fab?.addEventListener('click', openDrawer);
  btnClose?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', () => drawer.classList.contains('open') && closeDrawer());
  window.addEventListener('resize', () => drawer.classList.contains('open') && setBackdropWidthToDrawer());
  document.addEventListener('keydown', e => (e.key === 'Escape' && drawer.classList.contains('open')) && closeDrawer());
})();
</script>
