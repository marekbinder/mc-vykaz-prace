/* ========================================================================
   drawer.js — COMPLETE
   Pravostranný šuplík s overlayem, focus-trapem a veřejným API
   ===================================================================== */

/* Pomocné: selektor fokusovatelných prvků */
const FOCUSABLE_SEL =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), ' +
  'select:not([disabled]), textarea:not([disabled]), button:not([disabled]), ' +
  'iframe, object, embed, [tabindex]:not([tabindex="-1"]), [contenteditable="true"]';

(function initDrawer() {
  const drawer   = document.getElementById('drawer');
  const overlay  = document.getElementById('drawerOverlay');
  const fab      = document.getElementById('drawerFab');       // kulaté + vpravo nahoře
  const closeBtn = document.getElementById('drawerClose') ||
                   (drawer ? drawer.querySelector('[data-close]') : null);

  if (!drawer || !overlay || !fab) {
    // Není v DOM – nic neinicializujeme, ale nepadáme
    console.warn('[drawer] Missing DOM nodes (drawer/overlay/fab).');
    return;
  }

  let isOpen = false;
  let lastActive = null;

  function getFocusable(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE_SEL))
      .filter(el => el.offsetParent !== null || el === document.activeElement);
  }

  function trapFocus(e) {
    if (!isOpen) return;
    if (!drawer.contains(e.target)) {
      // pokud klik mimo drawer, posuň fokus dovnitř
      const els = getFocusable(drawer);
      (els[0] || drawer).focus();
      e.preventDefault();
    }
  }

  function onKeyDown(e) {
    if (!isOpen) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      closeDrawer();
      return;
    }

    if (e.key === 'Tab') {
      // focus trap
      const focusables = getFocusable(drawer);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last  = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function preventTouchScroll(e) {
    // zabráníme scrollu podkladu při otevřeném šuplíku (iOS)
    if (!drawer.contains(e.target)) e.preventDefault();
  }

  function openDrawer() {
    if (isOpen) return;
    isOpen = true;

    lastActive = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    // zapneme overlay + animaci šuplíku
    overlay.classList.add('show');
    // „force reflow“ pro Safari/Chrome, aby navazující transform vždy proběhl
    // eslint-disable-next-line no-unused-expressions
    drawer.offsetWidth;
    drawer.classList.add('open');

    // přístupnost + tělo bez scrollu
    drawer.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('noscroll');

    // posluchače
    document.addEventListener('keydown', onKeyDown, { passive: false });
    document.addEventListener('focus', trapFocus, true);
    document.addEventListener('touchmove', preventTouchScroll, { passive: false });

    // fokus dovnitř
    const els = getFocusable(drawer);
    (els[0] || drawer).focus();
  }

  function closeDrawer() {
    if (!isOpen) return;
    isOpen = false;

    drawer.classList.remove('open');
    overlay.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('noscroll');

    document.removeEventListener('keydown', onKeyDown, { passive: false });
    document.removeEventListener('focus', trapFocus, true);
    document.removeEventListener('touchmove', preventTouchScroll, { passive: false });

    if (lastActive && typeof lastActive.focus === 'function') {
      lastActive.focus();
      lastActive = null;
    }
  }

  // ——— Události ————————————————————————————————————————————————
  fab.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openDrawer(); });
  overlay.addEventListener('click', closeDrawer);
  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  // kliky uvnitř šuplíku nepouštíme na overlay
  drawer.addEventListener('click', (e) => e.stopPropagation());

  // API ven
  window.vpDrawer = {
    open:  openDrawer,
    close: closeDrawer,
    isOpen: () => isOpen
  };
})();
