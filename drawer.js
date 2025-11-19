// drawer.js – sidebar s hydratační logikou pro klienty/statusy v add-formu
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
    const qsa = (s,p=document)=>Array.from(p.querySelectorAll(s));

    const drawer   = qs('#toolsDrawer');
    const backdrop = qs('#toolsBackdrop');

    if (!drawer || !backdrop) {
      console.warn('[drawer] Missing #toolsDrawer or #toolsBackdrop in DOM.');
      return;
    }

    // --- zdroje (filtry na hlavní stránce) a cíle (formulář v panelu)
    const SRC_CLIENT  = '#filterClient';
    // const SRC_STATUS  = '#filterStatus'; // Odstraněno
    const DST_CLIENT  = '#newJobClient';
    // const DST_STATUS  = '#newJobStatus'; // Odstraněno

    function copyOptions(srcSel, dstSel, { skipValues = [] } = {}) {
      const src = qs(srcSel);
      const dst = qs(dstSel);

      if (!src)  { console.info('[drawer] Nenalezen zdroj', srcSel); return; }
      if (!dst)  { console.info('[drawer] Nenalezen cíl', dstSel);  return; }

      // Když už v cíli nějaké položky jsou, nepřepisujeme
      if (dst.options && dst.options.length > 0) return;

      // Vyčistíme staré položky
      dst.innerHTML = '';

      // Zkopírujeme nové
      const srcOptions = qsa('option', src)
        .filter(opt => !skipValues.includes(opt.value));

      srcOptions.forEach(opt => {
        const clone = opt.cloneNode(true);
        dst.appendChild(clone);
      });
    }

    function hydrateAddForm() {
      // 1. Klienti (z filterClient do newJobClient)
      copyOptions(SRC_CLIENT, DST_CLIENT, { skipValues: ['ALL'] });

      // 2. Statusy (odstraněno)
      // copyOptions(SRC_STATUS, DST_STATUS, { skipValues: ['ALL'] });
    }


    // Pokud se zdroje změní, zkus rehydratovat
    // Původní: [SRC_CLIENT, SRC_STATUS]
    [SRC_CLIENT].forEach(sel => { // Změněno: sledování pouze SRC_CLIENT
      const el = qs(sel);
      if (!el) return;
      const mo = new MutationObserver(() => hydrateAddForm());
      mo.observe(el, { childList: true });
    });

    const open = () => {
      hydrateAddForm(); // vždy zkus doplnit při otevření
      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      // Focus na první prvek
      const first = qs(DST_CLIENT);
      if (first) setTimeout(() => first.focus(), 10);
    };

    const close = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };

    // Otevírání/zavírání
    document.addEventListener('click', (e) => {
      const openEl  = e.target.closest('[data-open-drawer], #toolsFab');
      const closeEl = e.target.closest('[data-close-drawer], #toolsClose');

      if (openEl)  { e.preventDefault(); open();  }
      if (closeEl) { e.preventDefault(); close(); }

      if (drawer.classList.contains('open') && e.target === backdrop) {
        close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        close();
      }
    });

  });
})();
