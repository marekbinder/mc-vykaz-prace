/* === Utility Drawer (off-canvas) =========================================
   - FIXED burger v pravém horním rohu (mimo layout),
   - přesun "Přidat klienta" + "Přidat zakázku" do panelu (i když DOM vznikne později),
   - průběžně skrývá e-mail a "Odhlásit" v horní části,
   - v panelu ukáže e-mail a fungující Odhlásit.
============================================================================ */

(function () {
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- helpery ---------- */

  function ensureFixedBurger() {
    let btn = $('#utilOpen');
    if (!btn) {
      btn = document.createElement('button');
      btn.id        = 'utilOpen';
      btn.type      = 'button';
      btn.className = 'pill-btn util-trigger fixed';
      btn.title     = 'Další';
      btn.setAttribute('aria-expanded', 'false');
      btn.textContent = '☰';
      document.body.appendChild(btn);
    }
    return btn;
  }

  function buildDrawer() {
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
        <strong>Další</strong>
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

  /* ---------- přesuny do panelu ---------- */

  function moveAddClient() {
    const holder = $('#drawerAddClient');
    if (!holder) return false;

    const input = $('#newClientName');
    const btn   = $('#addClientBtn');

    let moved = false;
    if (input && !holder.contains(input)) { holder.appendChild(input); moved = true; }
    if (btn   && !holder.contains(btn))   { holder.appendChild(btn);   moved = true; }

    return moved;
  }

  function moveAddJob() {
    const holder = $('#drawerAddJob');
    if (!holder) return false;

    const jobClient = $('#newJobClient');
    const jobName   = $('#newJobName');
    const jobStat   = $('#newJobStatus');
    const addBtn    = $('#addJobBtn');

    let moved = false;
    [jobClient, jobName, jobStat, addBtn].forEach(el => {
      if (el && !holder.contains(el)) { holder.appendChild(el); moved = true; }
    });

    // fallback: existuje textové tlačítko „Přidat zakázku“ jinde?
    if (!moved) {
      const anyBtn = $$('button').find(
        b => (b.textContent || '').trim().toLowerCase() === 'přidat zakázku'
      );
      if (anyBtn && !holder.contains(anyBtn)) { holder.appendChild(anyBtn); moved = true; }
    }

    return moved;
  }

  // přesun i když DOM vznikne později
  function observeForAddControls() {
    const tryMove = () => { moveAddClient(); moveAddJob(); };

    // 1) pokus hned
    tryMove();

    // 2) interval párkrát po sobě (rychlé buildy)
    let tries = 0;
    const t = setInterval(() => {
      tryMove();
      if (++tries > 10) clearInterval(t);
    }, 250);

    // 3) MutationObserver (když to dojde opravdu pozdě)
    const mo = new MutationObserver(() => tryMove());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- účet v panelu ---------- */

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
      } finally {
        location.reload();
      }
    });
  }

  /* ---------- skrytí horního e-mailu a „Odhlásit“ ---------- */

  function hideTopAccountPieces() {
    const nodes = $$('body *');
    const isEmail = (t) => /.+@.+\..+/.test(t);
    const isLogout = (t) => /odhl/i.test(t);

    nodes.forEach(n => {
      const t = (n.textContent || '').trim();
      if (!t) return;
      const rect = n.getBoundingClientRect();
      // cíleně jen horní pás stránky
      if (rect.top > 160) return;

      if (isEmail(t) || isLogout(t)) {
        n.style.display = 'none';
      }
    });
  }

  function observeTopAccount() {
    hideTopAccountPieces();
    const mo = new MutationObserver(() => hideTopAccountPieces());
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------- init ---------- */

  window.addEventListener('DOMContentLoaded', () => {
    // burger
    const openBtn = ensureFixedBurger();

    // drawer/backdrop
    const { drawer, backdrop } = buildDrawer();

    // účet
    wireAccount(drawer);

    // přesuny (i později vzniklé DOM)
    observeForAddControls();

    // skrýt viditelný e-mail a Odhlásit nahoře
    observeTopAccount();

    // ovládání
    const closeBtn = $('#utilClose', drawer);
    const open  = () => openDrawer(drawer, backdrop, openBtn);
    const close = () => closeDrawer(drawer, backdrop, openBtn);

    openBtn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  });
})();
