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
    const closeBtn = qs('#toolsClose');

    if (!drawer || !backdrop) {
      console.warn('[drawer] Missing #toolsDrawer or #toolsBackdrop in DOM.');
      return;
    }

    // --- HYDRATACE SELECTŮ V SIDEBARU ---------------------------------------
    const srcClientsSel = '#filterClient';   // existující filtr z app.js (obsahuje "ALL" + klienty)
    const srcStatusSel  = '#filterStatus';   // existující filtr z app.js (obsahuje "ALL" + statusy)

    const dstClientSel  = '#newJobClient';   // select v add-formu (sidebar)
    const dstStatusSel  = '#newJobStatus';   // select v add-formu (sidebar)

    function copyOptions(srcSel, dstSel, { skipValues = [] } = {}) {
      const src = qs(srcSel);
      const dst = qs(dstSel);
      if (!src || !dst) return;

      // Když už je v cíli něco rozumného, nepřepisuj.
      if (dst.options && dst.options.length > 0) return;

      const frag = document.createDocumentFragment();
      Array.from(src.options || []).forEach(opt => {
        const v = String(opt.value || '');
        if (skipValues.includes(v)) return;      // např. "ALL"
        const o = document.createElement('option');
        o.value = v;
        o.textContent = opt.textContent || v;
        frag.appendChild(o);
      });

      // pouze když máme co vložit
      if (frag.childNodes.length > 0) {
        dst.innerHTML = '';
        dst.appendChild(frag);
      }
    }

    function hydrateAddForm() {
      // Klienti: vezmi z #filterClient všechno kromě "ALL"
      copyOptions(srcClientsSel, dstClientSel, { skipValues: ['ALL'] });
      // Statusy: vezmi z #filterStatus všechno kromě "ALL"
      copyOptions(srcStatusSel,  dstStatusSel,  { skipValues: ['ALL'] });
    }

    // Pokud se filtry naplní až po chvíli, sleduj je a doplň dodatečně.
    function observeFilter(sel, fillFn) {
      const el = qs(sel);
      if (!el) return;
      const mo = new MutationObserver(() => fillFn());
      mo.observe(el, { childList: true });
    }
    observeFilter(srcClientsSel, hydrateAddForm);
    observeFilter(srcStatusSel,  hydrateAddForm);

    // --- OTEVŘÍT/ZAVŘÍT ------------------------------------------------------
    const open = () => {
      hydrateAddForm(); // vždy zkus doplnit při otevření
      drawer.classList.add('open');
      backdrop.classList.add('show');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      // focus na první prvek (klient)
      const first = qs('#newJobClient');
      if (first) setTimeout(() => first.focus(), 10);
    };

    const close = () => {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };

    // Delegated open/close (funguje pro #toolsFab i [data-open-drawer]/[data-close-drawer])
    document.addEventListener('click', (e) => {
      const openEl  = e.target.closest('[data-open-drawer], #toolsFab');
      const closeEl = e.target.closest('[data-close-drawer], #toolsClose');
      if (openEl)  { e.preventDefault(); open();  }
      if (closeEl) { e.preventDefault(); close(); }

      // klik na backdrop zavře
      if (drawer.classList.contains('open')) {
        if (backdrop.contains(e.target)) close();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    // Expozice pro rychlý test
    window.drawer = { open, close, el: drawer };
  });
})();
