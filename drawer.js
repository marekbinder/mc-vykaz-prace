// drawer.js – boční panel „Nástroje“ (otevření/zavření + hydratace selectů)
(function () {
  // --- utilita: spustit po načtení DOMu
  const ready = (fn) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  };

  ready(() => {
    const qs  = (s, p = document) => p.querySelector(s);
    const qsa = (s, p = document) => Array.from(p.querySelectorAll(s));

    const drawer   = qs('#toolsDrawer');
    const backdrop = qs('#toolsBackdrop');
    const fab      = qs('#toolsFab');
    const btnClose = qs('#toolsClose');

    if (!drawer || !backdrop) {
      console.warn('[drawer] Missing #toolsDrawer or #toolsBackdrop.');
      return;
    }

    // --- zdroje (filtry na hlavní ploše) a cíle (formulář v panelu)
    const SRC_CLIENT = '#filterClient';
    const SRC_STATUS = '#filterStatus';
    const DST_CLIENT = '#newJobClient';
    const DST_STATUS = '#newJobStatus';

    // bezpečné kopírování <option> mezi <selecty>
    function copyOptions(srcSel, dstSel, { skipValues = [] } = {}) {
      const src = qs(srcSel);
      const dst = qs(dstSel);

      if (!src)  { console.info('[drawer] Nenalezen zdroj', srcSel); return; }
      if (!dst)  { console.info('[drawer] Nenalezen cíl', dstSel);  return; }

      // když už v cíli něco je, nepřepisujeme (minimalizace blikání)
      if (dst.options && dst.options.length > 0) {
        return;
      }

      const opts = Array.from(src.options || []);
      if (!opts.length) return;

      const frag = document.createDocumentFragment();
      opts.forEach(opt => {
        const v = String(opt.value ?? '');
        if (skipValues.includes(v)) return;
        const o = document.createElement('option');
        o.value = v;
        o.textContent = opt.textContent || v;
        frag.appendChild(o);
      });

      if (frag.childNodes.length) {
        dst.innerHTML = '';
        dst.appendChild(frag);
      }
    }

    // doplnit data do formuláře v panelu
    function hydrateAddForm() {
      copyOptions(SRC_CLIENT, DST_CLIENT, { skipValues: ['ALL'] });
      copyOptions(SRC_STATUS, DST_STATUS, { skipValues: ['ALL'] });
    }

    // kdyby filtry dorazily později, sledujeme jejich <option>
    [SRC_CLIENT, SRC_STATUS].forEach(sel => {
      const el = qs(sel);
      if (!el) return;
      const mo = new MutationObserver(() => hydrateAddForm());
      mo.observe(el, { childList: true });
    });

    // --- otevření/zavření panelu
    function openDrawer() {
      hydrateAddForm();

      drawer.classList.add('open');
      backdrop.classList.add('show');

      // a11y: panel je viditelný a modální
      drawer.setAttribute('aria-hidden', 'false');
      drawer.setAttribute('aria-modal', 'true');

      // scroll lock
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';

      // fokus na první vstup
      const first = qs(DST_CLIENT);
      if (first) setTimeout(() => first.focus(), 10);
    }

    function closeDrawer() {
      drawer.classList.remove('open');
      backdrop.classList.remove('show');

      // a11y: po zavření je panel mimo čtení
      drawer.setAttribute('aria-hidden', 'true');
      drawer.removeAttribute('aria-modal');

      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }

    // --- ovládání klikem
    document.addEventListener('click', (e) => {
      const openEl  = e.target.closest('#toolsFab, [data-open-drawer]');
      const closeEl = e.target.closest('#toolsClose, [data-close-drawer]');

      if (openEl)  { e.preventDefault(); openDrawer(); }
      if (closeEl) { e.preventDefault(); closeDrawer(); }

      // klik do backdropu zavírá
      if (drawer.classList.contains('open') && e.target === backdrop) {
        closeDrawer();
      }
    });

    // klávesa Esc zavře
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) {
        e.preventDefault();
        closeDrawer();
      }
    });

    // expozice pro ruční testování v konzoli
    window.drawer = { open: openDrawer, close: closeDrawer, el: drawer };
  });
})();
