/* === Utility Drawer (off-canvas) ========================================
   Co dělá:
   - vloží burger „Další“ do pravého horního rohu místo e-mailu/odhlášení
   - e-mail a „Odhlásit“ z hlavní stránky skryje (zůstanou v panelu)
   - přesune „Přidat klienta“ do panelu
   - přesune i „Přidat zakázku“ (a pokud jsou, tak i #newJobClient/#newJobName/#newJobStatus)

   Nezasahuje do tvojí logiky – přenesené prvky si zachovají event-handlery.
======================================================================== */

(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function findTopbar() {
    return $('.topbar') || $('header') || $('#app .wrap') || document.body;
  }

  function ensureBurgerInTopRight() {
    const topbar = findTopbar();
    if (!topbar) return null;

    // Zkusíme najít stávající kontejner s účtem/odhlášením
    const logoutBtn = $$('button', topbar).find(b => /odhl/i.test(b.textContent || ''));
    const accountChip = logoutBtn ? logoutBtn.previousElementSibling : null;
    const rightContainer = logoutBtn ? logoutBtn.parentElement : topbar;

    // Skryj e-mail i „Odhlásit“ na hlavní stránce
    accountChip?.classList?.add('is-hidden');
    logoutBtn?.classList?.add('is-hidden');

    // Vlož burger (pokud už náhodou neexistuje)
    let btn = $('#utilOpen');
    if (!btn) {
      btn = document.createElement('button');
      btn.id        = 'utilOpen';
      btn.type      = 'button';
      btn.className = 'pill-btn util-trigger';
      btn.title     = 'Další';
      btn.textContent = '☰ Další';
      rightContainer.appendChild(btn);
    }
    return btn;
  }

  function buildDrawerIfMissing() {
    let drawer   = $('#utilityDrawer');
    let backdrop = $('#drawerBackdrop');

    if (drawer && backdrop) return { drawer, backdrop };

    backdrop = document.createElement('div');
    backdrop.id = 'drawerBackdrop';
    backdrop.className = 'backdrop';
    backdrop.hidden = true;

    drawer = document.createElement('aside');
    drawer.id = 'utilityDrawer';
    drawer.className = 'drawer';
    drawer.setAttribute('aria-hidden', 'true');
    drawer.setAttribute('tabindex', '-1');

    drawer.innerHTML = `
      <header class="drawer-head">
        <strong>Další nastavení</strong>
        <button id="utilClose" class="icon-btn" aria-label="Zavřít">✕</button>
      </header>

      <section class="drawer-sec">
        <h4>Přidat klienta</h4>
        <div id="drawerAddClient"></div>
      </section>

      <hr class="drawer-sep">

      <section class="drawer-sec">
        <h4>Přidat zakázku</h4>
        <div id="drawerAddJob"></div>
      </section>

      <hr class="drawer-sep">

      <section class="drawer-sec">
        <h4>Účet</h4>
        <div class="drawer-account">
          <span id="drawerUser" class="userChip"></span>
          <button id="drawerLogout" class="pill-btn ghost" type="button">Odhlásit</button>
        </div>
      </section>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    return { drawer, backdrop };
  }

  function openDrawer(drawer, backdrop, opener) {
    drawer.classList.add('open');
    drawer.removeAttribute('aria-hidden');
    backdrop.hidden = false;
    opener?.setAttribute('aria-expanded', 'true');
    setTimeout(() => drawer.focus(), 0);
  }

  function closeDrawer(drawer, backdrop, opener) {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    backdrop.hidden = true;
    opener?.setAttribute('aria-expanded', 'false');
    opener?.focus?.();
  }

  function moveAddClientToDrawer() {
    const holder = $('#drawerAddClient');
    if (!holder) return;

    const input = $('#newClientName');
    const btn   = $('#addClientBtn');

    if (input) holder.appendChild(input);
    if (btn)   holder.appendChild(btn);
  }

  function moveAddJobToDrawer() {
    const holder = $('#drawerAddJob');
    if (!holder) return;

    // 1) pokus o přesun známých ID
    const jobClient = $('#newJobClient');
    const jobName   = $('#newJobName');
    const jobStat   = $('#newJobStatus');
    const addBtn    = $('#addJobBtn');

    let moved = false;
    [jobClient, jobName, jobStat, addBtn].forEach(el => {
      if (el) { holder.appendChild(el); moved = true; }
    });

    // 2) fallback – jen tlačítko „Přidat zakázku“ (např. to headrové)
    if (!moved) {
      const headBtn = $$('button').find(b => (b.textContent || '').trim().toLowerCase() === 'přidat zakázku');
      if (headBtn) holder.appendChild(headBtn);
    }
  }

  function wireAccount(drawer) {
    const userLbl = $('#drawerUser', drawer);
    const btnOut  = $('#drawerLogout', drawer);

    try {
      const email = window.state?.session?.user?.email || '';
      if (email) userLbl.textContent = email;
    } catch (_) {}

    btnOut.addEventListener('click', async () => {
      try {
        if (typeof window.logout === 'function') {
          await window.logout();
        } else if (window.supabase?.auth?.signOut) {
          await window.supabase.auth.signOut();
        }
      } catch (e) {
        console.error(e);
      } finally {
        location.reload();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    const openBtn = ensureBurgerInTopRight();          // burger vpravo nahoře (místo účtu)
    const { drawer, backdrop } = buildDrawerIfMissing();

    moveAddClientToDrawer();                           // „Přidat klienta“ do panelu
    moveAddJobToDrawer();                              // „Přidat zakázku“ do panelu
    wireAccount(drawer);                               // e-mail + odhlášení v panelu

    const closeBtn = $('#utilClose', drawer);
    const open  = () => openDrawer(drawer, backdrop, openBtn);
    const close = () => closeDrawer(drawer, backdrop, openBtn);

    openBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  });
})();
