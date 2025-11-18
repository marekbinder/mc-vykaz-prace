/* ===== Drawer – kompletní, samoopravný init + skrytí e-mailu/odhlášení ===== */
(function () {
  const READY = () =>
    document.readyState === 'complete' || document.readyState === 'interactive';

  const run = () => {
    /* 1) ZAJIŠTĚNÍ MARKUPU (vytvoříme sami, pokud chybí) */
    let drawer = document.querySelector('.drawer');
    if (!drawer) {
      drawer = document.createElement('aside');
      drawer.className = 'drawer';
      drawer.innerHTML = `
        <div class="drawer__scrim" aria-hidden="true"></div>
        <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="Nástroje">
          <div class="drawer__header">
            <div class="drawer__title">Nástroje</div>
            <button class="drawer__close" type="button" aria-label="Zavřít">×</button>
          </div>
          <div class="drawer__body"></div>
        </div>`;
      document.body.appendChild(drawer);
    }
    const panel  = drawer.querySelector('.drawer__panel');
    const scrim  = drawer.querySelector('.drawer__scrim');
    const body   = drawer.querySelector('.drawer__body');

    /* 2) TLAČÍTKO „+“ – vytvoříme vždy, pokud chybí */
    let btnOpen = document.querySelector('#openDrawerBtn');
    if (!btnOpen) {
      btnOpen = document.createElement('button');
      btnOpen.id = 'openDrawerBtn';
      btnOpen.type = 'button';
      btnOpen.setAttribute('aria-label', 'Nástroje');
      btnOpen.textContent = '+';
      document.body.appendChild(btnOpen);
    }

    const btnClose = drawer.querySelector('.drawer__close');

    const ensureSelectInteractable = (root) => {
      root.querySelectorAll('select').forEach(s => {
        s.disabled = false;
        s.style.pointerEvents = 'auto';
        s.style.position = 'relative';
        s.style.zIndex = 1004;
      });
    };

    const open = () => {
      drawer.classList.add('open');
      panel.style.pointerEvents = 'auto';
      drawer.style.pointerEvents = 'auto';
      scrim.style.pointerEvents  = 'auto';

      requestAnimationFrame(() => {
        panel.setAttribute('tabindex', '-1');
        try { panel.focus({ preventScroll: true }); } catch (e) {}
        ensureSelectInteractable(drawer);
      });
    };

    const close = () => {
      drawer.classList.remove('open');
      scrim.style.pointerEvents  = 'none';
      panel.style.pointerEvents  = 'none';
    };

    btnOpen.addEventListener('click', open);
    if (btnClose) btnClose.addEventListener('click', close);
    if (scrim)   scrim.addEventListener('click', close);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    /* 3) OBSAH PANELU – dvě oddělené sekce (Zakázka / Klient) */
    const ensureSection = (sel, html) => {
      if (!drawer.querySelector(sel)) {
        const sec = document.createElement('section');
        sec.className = `drawer__section ${sel.replace('.', '')}`;
        sec.innerHTML = html;
        body.appendChild(sec);
      }
    };

    ensureSection('.section-job', `
      <h3>Přidání zakázky</h3>
      <div class="form-stack" id="drawerJobStack">
        <div class="control"><select id="jobClientSel" aria-label="Klient"></select></div>
        <div class="control"><input  id="jobNameInp" placeholder="Název zakázky" aria-label="Název zakázky"></div>
        <div class="control"><select id="jobStatusSel" aria-label="Status"></select></div>
        <div class="control"><select id="jobAssigneeSel" aria-label="Grafik"></select></div>
        <button id="drawerAddJobBtn" class="btn-primary">Přidat zakázku</button>
      </div>
    `);

    ensureSection('.section-client', `
      <h3>Přidání klienta</h3>
      <div class="form-stack" id="drawerClientStack">
        <div class="control"><input id="clientNameInp" placeholder="Název klienta" aria-label="Název klienta"></div>
        <button id="drawerAddClientBtn" class="btn-primary">Přidat klienta</button>
      </div>
    `);

    /* 4) NAPLNĚNÍ SELECTŮ – zkopírujeme možnosti, pokud existují na stránce */
    const copyOptions = (fromSel, toSel) => {
      const from = document.querySelector(fromSel);
      const to   = drawer.querySelector(toSel);
      if (from && to && !to.options.length) {
        to.innerHTML = from.innerHTML;
        to.value = from.value;
      }
    };

    /* pokud máte zdrojové selecty, nastavte jim data-source atributy:
       <select data-source="client-list">…</select> atd. */
    copyOptions('[data-source="client-list"]',   '#jobClientSel');
    copyOptions('[data-source="status-list"]',   '#jobStatusSel');
    copyOptions('[data-source="assignee-list"]', '#jobAssigneeSel');
    ensureSelectInteractable(drawer);

    /* 5) HOOKY – pokud máš globální funkce, napojíme je */
    const addJobBtn = drawer.querySelector('#drawerAddJobBtn');
    if (addJobBtn && typeof window.addJobFromDrawer === 'function') {
      addJobBtn.onclick = () => {
        const payload = {
          clientId: drawer.querySelector('#jobClientSel')?.value,
          name:     drawer.querySelector('#jobNameInp')?.value?.trim(),
          statusId: drawer.querySelector('#jobStatusSel')?.value,
          assignee: drawer.querySelector('#jobAssigneeSel')?.value
        };
        window.addJobFromDrawer(payload);
      };
    }
    const addClientBtn = drawer.querySelector('#drawerAddClientBtn');
    if (addClientBtn && typeof window.addClientFromDrawer === 'function') {
      addClientBtn.onclick = () => {
        const name = drawer.querySelector('#clientNameInp')?.value?.trim();
        window.addClientFromDrawer({ name });
      };
    }

    /* 6) NEMILOSRDNÉ SKRÝVÁNÍ E-MAILU A „ODHLÁSIT“ (i při re-renderu) */
    const isEmail    = (t) => /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(t);
    const isLogout   = (t) => /odhl[aá]sit/i.test(t);

    const hideAuthChips = () => {
      const candidates = document.querySelectorAll('a,button,div,span');
      candidates.forEach(el => {
        const txt = (el.textContent || el.innerText || '').trim();
        if (!txt) return;
        if (isEmail(txt) || isLogout(txt)) {
          el.style.visibility    = 'hidden';
          el.style.pointerEvents = 'none';
          el.style.position      = 'absolute';
          el.style.width         = '0';
          el.style.height        = '0';
          el.style.overflow      = 'hidden';
        }
      });
    };

    // první průchod + několik retry pokusů (kdyby se vše kreslilo později)
    hideAuthChips();
    let retry = 0;
    const timer = setInterval(() => {
      hideAuthChips();
      if (++retry > 20) clearInterval(timer);
    }, 300);

    // a watcher na přerenderování
    const mo = new MutationObserver(hideAuthChips);
    mo.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  };

  if (READY()) run();
  else document.addEventListener('DOMContentLoaded', run);
})();
