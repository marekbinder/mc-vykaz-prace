/* ===== Drawer (postranní panel) – kompletní ===== */
(function () {
  const drawer = document.querySelector('.drawer');
  if (!drawer) return;

  const panel   = drawer.querySelector('.drawer__panel');
  const scrim   = drawer.querySelector('.drawer__scrim');
  let   btnOpen = document.querySelector('#openDrawerBtn');
  const btnClose = drawer.querySelector('.drawer__close');

  /* Pokud tlačítko „+“ v DOM není, vytvoříme ho sami. */
  if (!btnOpen) {
    btnOpen = document.createElement('button');
    btnOpen.id = 'openDrawerBtn';
    btnOpen.type = 'button';
    btnOpen.setAttribute('aria-label', 'Nástroje');
    btnOpen.textContent = '+';
    document.body.appendChild(btnOpen);
  }

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
      panel.focus({ preventScroll: true });
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

  /* --- Sekce v panelu – vytvoření pokud chybí --- */
  const host = drawer.querySelector('.drawer__body');

  if (host && !drawer.querySelector('.drawer__section.section-job')) {
    const secJob = document.createElement('section');
    secJob.className = 'drawer__section section-job';
    secJob.innerHTML = `
      <h3>Přidání zakázky</h3>
      <div class="form-stack" id="drawerJobStack">
        <div class="control"><select id="jobClientSel"></select></div>
        <div class="control"><input  id="jobNameInp" placeholder="Název zakázky"></div>
        <div class="control"><select id="jobStatusSel"></select></div>
        <div class="control"><select id="jobAssigneeSel"></select></div>
        <button id="drawerAddJobBtn" class="btn-primary">Přidat zakázku</button>
      </div>`;
    host.appendChild(secJob);
  }

  if (host && !drawer.querySelector('.drawer__section.section-client')) {
    const secClient = document.createElement('section');
    secClient.className = 'drawer__section section-client';
    secClient.innerHTML = `
      <h3>Přidání klienta</h3>
      <div class="form-stack" id="drawerClientStack">
        <div class="control"><input id="clientNameInp" placeholder="Název klienta"></div>
        <button id="drawerAddClientBtn" class="btn-primary">Přidat klienta</button>
      </div>`;
    host.appendChild(secClient);
  }

  /* Naplnění selectů z existujících zdrojů na stránce (pokud jsou) */
  const copyOptions = (fromSel, toSel) => {
    const from = document.querySelector(fromSel);
    const to   = drawer.querySelector(toSel);
    if (from && to && !to.options.length) {
      to.innerHTML = from.innerHTML;
      to.value = from.value;
    }
  };
  copyOptions('[data-source="client-list"]',   '#jobClientSel');
  copyOptions('[data-source="status-list"]',   '#jobStatusSel');
  copyOptions('[data-source="assignee-list"]', '#jobAssigneeSel');
  ensureSelectInteractable(drawer);

  /* Napojení na vaši logiku – pokud existují globální handler funkce */
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

  /* ===== Schování e-mailového chipu a „Odhlásit“ vpravo nahoře =====
     – řešeno skriptem (nezávislé na třídách/ID), běží i při změnách DOM */
  const looksLikeEmail = (txt) => /.+@.+\..+/.test(txt);
  const looksLikeLogout = (txt) => /odhl[aá]sit/i.test(txt);

  const hideAuthChips = () => {
    // zkus nejdřív header/topbar
    const header = document.querySelector('header, .topbar, .appbar, .navbar') || document.body;
    header.querySelectorAll('a,button,div,span').forEach(el => {
      const t = (el.textContent || '').trim();
      if (!t) return;
      if (looksLikeEmail(t) || looksLikeLogout(t)) {
        el.style.display = 'none';
      }
    });
  };
  hideAuthChips();

  // když UI něco přerenderuje, schovej znovu
  const mo = new MutationObserver(() => hideAuthChips());
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // export pro případné potřeby
  window._drawer = { open, close, el: drawer };
})();
