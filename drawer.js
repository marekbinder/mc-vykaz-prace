// drawer.js – malý, samostatný ovladač postranního panelu

(function () {
  const drawer = document.getElementById('drawer');
  if (!drawer) {
    console.warn('[drawer] #drawer element not found – add the markup from the instructions.');
    return;
  }

  const sheet = drawer.querySelector('.drawer__sheet');
  const backdrop = drawer.querySelector('.drawer__backdrop');
  const closeBtn = drawer.querySelector('[data-close-drawer]');
  const focusablesSel = 'a,button,input,select,textarea,[tabindex]:not([tabindex="-1"])';

  const open = () => {
    if (drawer.classList.contains('open')) return;
    drawer.classList.add('open');
    document.body.style.overflow = 'hidden';
    // první focus
    const f = sheet.querySelector(focusablesSel);
    if (f) setTimeout(() => f.focus(), 10);
  };

  const close = () => {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    document.body.style.overflow = '';
  };

  // Delegace pro otevření – stačí mít cokoli s data-open-drawer nebo .fab-plus apod.
  document.addEventListener('click', (e) => {
    const openEl = e.target.closest('[data-open-drawer], #plusFab, .fab-plus, .btn-plus, .open-drawer');
    if (openEl) {
      e.preventDefault();
      open();
      return;
    }
    if (
      e.target.closest('[data-close-drawer]') ||
      (!sheet.contains(e.target) && drawer.classList.contains('open'))
    ) {
      // klik mimo nebo na close
      e.preventDefault();
      close();
    }
  });

  // ESC zavření
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      e.preventDefault();
      close();
    }
  });

  // Export na window pro případné ruční ovládání
  window.drawer = { open, close, el: drawer };
})();
