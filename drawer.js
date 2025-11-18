/* ===== Drawer v2 – robustní init, injekce „+“ a tvrdé skrytí user boxu ===== */
(function () {
  const READY = () => /complete|interactive/.test(document.readyState);

  /* Tvrdá style injekce (pro případ, že se CSS nenačte dřív) */
  (function ensureStyle() {
    if (!document.getElementById('drawerHardStyle')) {
      const st = document.createElement('style');
      st.id = 'drawerHardStyle';
      st.textContent = `
        #userBoxTopRight { display:none !important; visibility:hidden !important; pointer-events:none !important; }
      `;
      document.head.appendChild(st);
    }
  })();

  /* Opakovaně schovávej e-mail/odhlásit, kdyby app re-renderovala */
  const hideTopRightBox = () => {
    const box = document.getElementById('userBoxTopRight');
    if (box) {
      box.style.display = 'none';
      box.style.visibility = 'hidden';
      box.style.pointerEvents = 'none';
      box.style.position = 'absolute';
      box.style.width = '0'; box.style.height = '0'; box.style.overflow = 'hidden';
    }
  };

  /* Injekce a udržování tlačítka „+“ */
  const injectPlus = () => {
    let btn = document.getElementById('openDrawerBtn');
    if (!btn) {
      btn = document.createElement('button');
      btn.id = 'openDrawerBtn';
      btn.type = 'button';
      btn.setAttribute('aria-label', 'Nástroje');
      btn.textContent = '+';
      document.body.appendChild(btn);
    }
    // jistota pozice i po reflow
    btn.style.cssText += ';position:fixed;top:16px;right:16px;z-index:2147483647;';
    return btn;
  };

  /* Vytvoření panelu a obsahu */
  const ensureDrawer = () => {
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
    const body = drawer.querySelector('.drawer__body');

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

    // copy helper (bez chyb, když zdroj není)
    const copyOptions = (fromSel, toSel) => {
      const from = document.querySelector(fromSel);
      const to   = drawer.querySelector(toSel);
      if (from && to && !to.options.length) {
        to.innerHTML = from.innerHTML;
        to.value = from.value;
      }
    };

    // pokud máš zdrojové selecty, nastav jim data-source atributy
    copyOptions('[data-source="client-list"]',   '#jobClientSel');
    copyOptions('[data-source="status-list"]',   '#jobStatusSel');
    copyOptions('[data-source="assignee-list"]', '#jobAssigneeSel');

    // selecty vždy klikatelné
    drawer.querySelectorAll('select').forEach(s => {
      s.disabled = false;
      s.style.pointerEvents = 'auto';
      s.style.position = 'relative';
      s.style.zIndex = 1004;
    });

    return drawer;
  };

  const wireOpenClose = (drawer, plusBtn) => {
    const scrim = drawer.querySelector('.drawer__scrim');
    const panel = drawer.querySelector('.drawer__panel');
    const closeBtn = drawer.querySelector('.drawer__close');

    const open = () => {
      drawer.classList.add('open');
      requestAnimationFrame(() => { try { panel.focus({ preventScroll: true }); } catch(_){} });
    };
    const close = () => drawer.classList.remove('open');

    plusBtn.addEventListener('click', open);
    scrim .addEventListener('click', close);
    closeBtn.addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) close(); });
  };

  const boot = () => {
    hideTopRightBox();                    // okamžitě pryč
    const plus = injectPlus();            // ať je vždy
    const drawer = ensureDrawer();        // panel + obsah
    wireOpenClose(drawer, plus);

    // opakované pojistky (kdyby app něco překreslovala)
    let n = 0;
    const keep = setInterval(() => {
      injectPlus();
      hideTopRightBox();
      if (++n > 30) clearInterval(keep);
    }, 300);

    const mo = new MutationObserver(() => {
      hideTopRightBox();
      injectPlus();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
  };

  if (READY()) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
