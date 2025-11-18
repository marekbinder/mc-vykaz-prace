/* === Utility Drawer (off-canvas) ========================================
   Co dělá:
   - vytvoří FIXED burger „Další“ v pravém horním rohu (mimo layout),
   - robustně skryje v horní části prvky s e-mailem a tlačítko „Odhlásit“,
   - přesune „Přidat klienta“ a „Přidat zakázku“ do postranního panelu,
   - v panelu ukáže e-mail + umožní odhlášení.
======================================================================== */

(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* Snažíme se skrýt e-mail/chip a „Odhlásit“ v horní části stránky,
     i kdyby se změnilo rozvržení. */
  function hideTopAccountPieces() {
    const nodes = $$('body *');
    const isEmail = (t) => /.+@.+\..+/.test(t);
    const isLogout = (t) => /odhl/i.test(t);

    nodes.forEach(n => {
      const t = (n.textContent || '').trim();
      if (!t) return;
      const rect = n.getBoundingClientRect();
      // bereme jen horní pás (abychom neodstřelili něco v obsahu)
      if (rect.top > 160) return;

      if (isEmail(t) || isLogout(t)) {
        n.style.display = 'none';
      }
    });
  }

  function createFixedBurger() {
    let btn = $('#utilOpen');
    if (!btn) {
      btn = document.createElement('button');
      btn.id        = 'utilOpen';
      btn.type      = 'button';
      btn.className = 'pill-btn util-trigger fixed';
      btn.title     = 'Další';
      btn.textContent = '☰ Další';
      document.body.appendChild(btn); // FIXED – nezasahuje do layoutu hlavičky
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

    const jobClient = $('#newJobClient');
    const jobName   = $('#newJobName');
    const jobStat   = $('#newJobStatus');
    const addBtn    = $('#addJobBtn');

    let moved = false;
    [jobClient, jobName, jobStat, addBtn].forEach(el => {
      if (el) { holder.appendChild(el); moved = true; }
    });

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
    // 1) Skryj původní email/odhlášení v horní části
    hideTopAccountPieces();

    // 2) Vytvoř a umísti FIXED burger vpravo nahoře
    const openBtn = createFixedBurger();

    // 3) Vytvoř drawer/backdrop
    const { drawer, backdrop } = buildDrawerIfMissing();

    // 4) Přesuny do panelu
    moveAddClientToDrawer();
    moveAddJobToDrawer();

    // 5) Účet v panelu
    wireAccount(drawer);

    // 6) Ovládání panelu
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
