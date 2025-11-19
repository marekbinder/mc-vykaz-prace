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

    // „pozdní“ hydratace – když filtry dorazí až po fetchi
    function hydrateWithRetries() {
      hydrateForm();
      setTimeout(hydrateForm, 100);
      setTimeout(hydrateForm, 300);
      setTimeout(hydrateForm, 800);
    }

    // Pomocné „nakopnutí“ selectu tam, kde Chrome/Safari trucuje
    function nudgeSelectOpen(sel){
      try {
        // Alt+Down často nativní menu otevře
        const e = new KeyboardEvent('keydown', { key:'ArrowDown', altKey:true, bubbles:true });
        sel.dispatchEvent(e);
      } catch {}
    }
    function attachNudge(id){
      const s = $(id);
      if (!s) return;
      s.addEventListener('mousedown', () => {
        // když by UI neotevřelo menu, zkusíme po krátké prodlevě „šťouchnout“
        setTimeout(() => nudgeSelectOpen(s), 180);
      });
      // jistota, že select je nahoře
      s.style.position = 'relative';
      s.style.zIndex = '2';
    }

    function openDrawer() {
      hydrateWithRetries();

// otevření
drawer.classList.add('open');
backdrop.classList.add('show');
drawer.setAttribute('aria-hidden', 'false');
document.body.style.overflow = 'hidden';

// zavření
drawer.classList.remove('open');
backdrop.classList.remove('show');
drawer.setAttribute('aria-hidden', 'true');
document.body.style.overflow = '';

      // jemný scroll-lock
      document.body.style.overflow = 'hidden';

      // fokus na první vstup
      const first = $(DST_CLIENT) || $('#newJobName');
      if (first) setTimeout(() => first.focus(), 20);

      // připojit „nudge“ až po otevření
      attachNudge(DST_CLIENT);
      attachNudge(DST_STATUS);
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
