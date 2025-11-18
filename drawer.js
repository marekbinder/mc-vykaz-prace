// drawer.js – robust opener/closer, binds after DOM is ready
(function () {
  const ready = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  ready(() => {
    const qs  = (s,p=document)=>p.querySelector(s);
    const drawer   = qs('#toolsDrawer');
    const backdrop = qs('#toolsBackdrop');

    if (!drawer || !backdrop) {
      console.warn('[drawer] Missing #toolsDrawer or #toolsBackdrop in DOM.');
      return;
    }

    const closeBtn = qs('#toolsClose', drawer);
    const open = () => {
      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      // focus první pole v přidání zakázky
      const first = qs('#newJobClient');
      if (first) setTimeout(()=> first.focus(), 10);
    };
    const close = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };

    // Delegated open/close (works for #toolsFab and any [data-open-drawer]/[data-close-drawer])
    document.addEventListener('click', (e) => {
      const openEl  = e.target.closest('[data-open-drawer], #toolsFab');
      const closeEl = e.target.closest('[data-close-drawer], #toolsClose');
      if (openEl)  { e.preventDefault(); open();  }
      if (closeEl) { e.preventDefault(); close(); }
      // klik mimo sheet zavře
      if (drawer.classList.contains('open')) {
        const sheet = drawer; // whole aside is our sheet
        if (!sheet.contains(e.target) && !openEl) {
          // klik na backdrop
          if (backdrop.contains(e.target)) close();
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    // expose for quick testing in console
    window.drawer = { open, close, el: drawer };
  });
})();
