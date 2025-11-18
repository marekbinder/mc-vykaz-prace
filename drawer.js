// drawer.js – sidebar “Nástroje” + hydratace selectů v přidání zakázky
(function () {
  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else fn();
  };

  onReady(() => {
    const qs  = (s, r = document) => r.querySelector(s);
    const drawer   = qs('#toolsDrawer');
    const backdrop = qs('#toolsBackdrop');
    const fab      = qs('#toolsFab');
    const closeBtn = qs('#toolsClose');
    const mainLike = qs('main, #app, .wrap, body');   // pro inert

    if (!drawer || !backdrop || !fab) {
      console.warn('[drawer] Chybí DOM prvky (drawer/backdrop/fab).');
      return;
    }

    // zdroje (filtry na hlavní stránce) → cíle (selecty v panelu)
    const SRC_CLIENT = '#filterClient';
    const SRC_STATUS = '#filterStatus';
    const DST_CLIENT = '#newJobClient';
    const DST_STATUS = '#newJobStatus';

    function copyOptions(srcSel, dstSel, { skip = [] } = {}) {
      const src = qs(srcSel);
      const dst = qs(dstSel);
      if (!src || !dst) return;

      // pokud už cíl má data, nepřepisujeme
      if (dst.options && dst.options.length) return;

      const opts = Array.from(src.options || []);
      const frag = document.createDocumentFragment();
      opts.forEach(o => {
        const v = String(o.value ?? '');
        if (skip.includes(v)) return;
        const n = document.createElement('option');
        n.value = v;
        n.textContent = o.textContent || v;
        frag.appendChild(n);
      });
      if (frag.childNodes.length) {
        dst.innerHTML = '';
        dst.appendChild(frag);
      }
    }

    function hydrate() {
      copyOptions(SRC_CLIENT, DST_CLIENT, { skip: ['ALL'] });
      copyOptions(SRC_STATUS, DST_STATUS, { skip: ['ALL'] });

      // jistota: povolíme selecty (kdyby někde zůstaly disabled)
      const c = qs(DST_CLIENT);
      const s = qs(DST_STATUS);
      if (c) c.disabled = false;
      if (s) s.disabled = false;
    }

    function open() {
      hydrate();

      drawer.classList.add('open');
      backdrop.classList.add('show');

      // ARIA / fokus / “zbytek stránky”
      drawer.removeAttribute('aria-hidden');
      if (mainLike) mainLike.setAttribute('inert', '');
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      // focus na první ovládací prvek
      const first = qs(DST_CLIENT) || qs('#toolsClose');
      if (first) setTimeout(() => first.focus(), 15);
    }

    function close() {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');

      // vrátit ARIA/inert/scroll
      drawer.setAttribute('aria-hidden', 'true');
      if (mainLike) mainLike.removeAttribute('inert');
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      fab?.focus();
    }

    // ovládání
    fab.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    // Pokud se filtry naplní až později, rehydruj selecty
    [SRC_CLIENT, SRC_STATUS].forEach(sel => {
      const el = qs(sel);
      if (!el) return;
      const mo = new MutationObserver(hydrate);
      mo.observe(el, { childList: true });
    });

    // Exponujeme pro rychlý test
    window.toolsDrawer = { open, close };
  });
})();
