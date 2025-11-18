/* === Utility Drawer (off-canvas) ========================================
   Přesune:
   - #newClientName + #addClientBtn do postranního panelu
   Zobrazí:
   - e-mail aktuálního uživatele (bere z window.state.session.user.email)
   - tlačítko Odhlásit (volá logout() / supabase.auth.signOut() / reload)
======================================================================== */

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  function ensureButtonInTopbar() {
    // malé tlačítko v topbaru – pokud už neexistuje, vytvoříme
    const topbar = $('.topbar') || $('#app .wrap') || document.body;
    if (!topbar) return null;

    let btn = $('#utilOpen');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'utilOpen';
      btn.className = 'pill-btn';
      btn.type = 'button';
      btn.setAttribute('aria-controls', 'utilityDrawer');
      btn.setAttribute('aria-expanded', 'false');
      btn.title = 'Další nastavení';
      btn.textContent = '☰ Další';

      // vlož na konec topbaru (nebo klidně hned za export)
      const exportBtn = topbar.querySelector('[data-export], #exportExcelBtn, .exportExcelBtn');
      if (exportBtn?.parentNode) {
        exportBtn.parentNode.insertBefore(btn, exportBtn.nextSibling);
      } else {
        topbar.appendChild(btn);
      }
    }
    return btn;
  }

  function injectDrawer() {
    if ($('#utilityDrawer')) return { drawer: $('#utilityDrawer'), backdrop: $('#drawerBackdrop') };

    const backdrop = document.createElement('div');
    backdrop.id = 'drawerBackdrop';
    backdrop.className = 'backdrop';
    backdrop.hidden = true;

    const drawer = document.createElement('aside');
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

    // Pokud existují, přesuneme (appendChild prvek fyzicky přesune, event handlery zůstanou)
    if (input) holder.appendChild(input);
    if (btn)   holder.appendChild(btn);
  }

  function wireAccount(drawer) {
    const userLbl = $('#drawerUser', drawer);
    const btnOut  = $('#drawerLogout', drawer);

    // propíšeme e-mail uživatele ze state (pokud je)
    try {
      const email =
        (window.state && window.state.session && window.state.session.user && window.state.session.user.email) || '';
      if (email) userLbl.textContent = email;
    } catch (_) {}

    btnOut.addEventListener('click', async () => {
      try {
        if (typeof window.logout === 'function') {
          await window.logout();
        } else if (window.supabase?.auth?.signOut) {
          await window.supabase.auth.signOut();
        } else {
          // poslední záchrana – reload
          location.reload();
        }
      } catch (e) {
        console.error(e);
      }
    });
  }

  // init po načtení DOM
  window.addEventListener('DOMContentLoaded', () => {
    const openBtn = ensureButtonInTopbar();
    const { drawer, backdrop } = injectDrawer();

    // přesun klienta + napojení účtu
    moveAddClientToDrawer();
    wireAccount(drawer);

    // ovládání panelu
    const closeBtn = $('#utilClose', drawer);

    const open = () => openDrawer(drawer, backdrop, openBtn);
    const close = () => closeDrawer(drawer, backdrop, openBtn);

    openBtn?.addEventListener('click', open);
    closeBtn?.addEventListener('click', close);
    backdrop?.addEventListener('click', close);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  });
})();
