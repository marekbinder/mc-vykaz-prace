// drawer.js – boční panel „Nástroje“ (otevření/zavření + hydratace selectů)
(function () {
  const onReady = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  onReady(() => {
    const $  = (s, p = document) => p.querySelector(s);
    const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

    const drawer   = $('#toolsDrawer');
    const backdrop = $('#toolsBackdrop');
    const fab      = $('#toolsFab');
    const btnClose = $('#toolsClose');

    if (!drawer || !backdrop || !fab || !btnClose) {
      console.warn('[drawer] Chybí jeden z prvků (drawer/backdrop/fab/close).');
      return;
    }

    // zdroje (filtry na hlavní stránce) a cíle (selecty v panelu)
    const SRC_CLIENT = '#filterClient';
    const SRC_STATUS = '#filterStatus';
    const DST_CLIENT = '#newJobClient';
    const DST_STATUS = '#newJobStatus';

    function copyOptions(srcSel, dstSel, { skipValues = [] } = {}) {
      const src = $(srcSel);
      const dst = $(dstSel);
      if (!src || !dst) return;

      // když už jsou v cíli options, nepřepisuj
      if (dst.options && dst.options.length > 0) return;

      const opts = Array.from(src.options || []);
      if (!opts.length) return;

      const frag = document.createDocumentFragment();
      for (const opt of opts) {
        const v = String(opt.value ?? '');
        if (skipValues.includes(v)) continue;
        const o = document.createElement('option');
        o.value = v;
        o.textContent = opt.textContent || v;
        frag.appendChild(o);
      }
      if (frag.childNodes.length) {
        dst.innerHTML = '';
        dst.appendChild(frag);
      }
    }

    function hydrateForm() {
      copyOptions(SRC_CLIENT, DST_CLIENT, { skipValues: ['ALL'] });
      copyOptions(SRC_STATUS, DST_STATUS, { skipValues: ['ALL'] });
    }

    // kdyby se filtry naplnily až po čase, sledujeme jejich změny
    [SRC_CLIENT, SRC_STATUS].forEach(sel => {
      const el = $(sel);
      if (!el) return;
      const mo = new MutationObserver(() => hydrateForm());
      mo.observe(el, { childList: true });
    });

    // pro jistotu spustíme hydrataci i „pozdě“ (když by filtry přijely pozdě)
    function hydrateWithRetries() {
      hydrateForm();
      setTimeout(hydrateForm, 100);
      setTimeout(hydrateForm, 400);
    }

    function openDrawer() {
      hydrateWithRetries();

      drawer.classList.add('open');
      backdrop.classList.add('show');
      drawer.setAttribute('aria-hidden', 'false');
      drawer.setAttribute('aria-modal', 'true');

      // jemný scroll-lock (necháváme <html> být)
      document.body.style.overflow = 'hidden';

      // fokus na první vstup
      const first = $(DST_CLIENT) || $('#newJobName');
      if (first) setTimeout(() => first.focus(), 10);
    }

    function closeDrawer() {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');
      drawer.setAttribute('aria-hidden', 'true');
      drawer.removeAttribute('aria-modal');
      document.body.style.overflow = '';
    }

    // ovládání
    fab.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
    btnClose.addEventListener('click', (e) => { e.preventDefault(); closeDrawer(); });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && drawer.classList.contains('open')) closeDrawer();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
    });

    // export pro rychlé ladění
    window.drawer = { open: openDrawer, close: closeDrawer, el: drawer };
  });
})();
