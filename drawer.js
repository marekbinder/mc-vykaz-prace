/* ===== Drawer (postranní panel) – kompletní ===== */

(function () {
  const drawer = document.querySelector('.drawer');
  if (!drawer) return;

  const panel  = drawer.querySelector('.drawer__panel');
  const scrim  = drawer.querySelector('.drawer__scrim');
  const btnOpen = document.querySelector('#openDrawerBtn'); // plovoucí „+“
  const btnClose = drawer.querySelector('.drawer__close');

  const open = () => {
    drawer.classList.add('open');

    // jistota, že ovládací prvky jsou interaktivní
    panel.style.pointerEvents = 'auto';
    drawer.style.pointerEvents = 'auto';
    scrim.style.pointerEvents = 'auto';

    // některé mobilní prohlížeče potřebují panel získat fokus
    requestAnimationFrame(() => {
      panel.setAttribute('tabindex', '-1');
      panel.focus({ preventScroll: true });
    });

    // pro jistotu zvednout z-index rozbalovacím selectům
    drawer.querySelectorAll('select').forEach(s => {
      s.disabled = false;
      s.style.pointerEvents = 'auto';
      s.style.position = 'relative';
      s.style.zIndex = 1004;
    });
  };

  const close = () => {
    drawer.classList.remove('open');
    // po zavření už panel nic neodchytává
    scrim.style.pointerEvents  = 'none';
    panel.style.pointerEvents  = 'none';
  };

  if (btnOpen)  btnOpen.addEventListener('click', open);
  if (btnClose) btnClose.addEventListener('click', close);
  if (scrim)    scrim.addEventListener('click', close);

  // ESC zavře
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });

  // --- Přesun „Přidat zakázku“ a „Přidat klienta“ do panelu (pokud už nejsou) ---
  // Očekává: v hlavní stránce existují prvky s id #addJobForm a #addClientForm (nebo jejich části)
  const host = drawer.querySelector('.drawer__body');
  if (host) {
    const addJobForm    = document.querySelector('#addJobForm');
    const addClientForm = document.querySelector('#addClientForm');

    // vytvoření UI, když nebylo součástí HTML (bezpečná varianta)
    if (!drawer.querySelector('.drawer__section.section-job')) {
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

    if (!drawer.querySelector('.drawer__section.section-client')) {
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

    // napojení na tvou existující logiku
    // – tady jen přesměruj akce na stejné handler funkce jako na hlavní stránce
    const ids = {
      clientSel:   '#jobClientSel',
      jobName:     '#jobNameInp',
      statusSel:   '#jobStatusSel',
      assigneeSel: '#jobAssigneeSel',
      addJobBtn:   '#drawerAddJobBtn',
      clientName:  '#clientNameInp',
      addClientBtn:'#drawerAddClientBtn'
    };

    // data do selectů (přebíráme z existujících selectů na stránce, ať je vše konzistentní)
    const copyOptions = (fromSel, toSel) => {
      const from = document.querySelector(fromSel);
      const to   = drawer.querySelector(toSel);
      if (from && to && !to.options.length) {
        to.innerHTML = from.innerHTML;
        to.value = from.value;
      }
    };

    copyOptions('[data-source="client-list"]', ids.clientSel);
    copyOptions('[data-source="status-list"]', ids.statusSel);
    copyOptions('[data-source="assignee-list"]', ids.assigneeSel);

    // pro jistotu znovu uvolnit pointer events
    drawer.querySelectorAll(`${ids.clientSel},${ids.statusSel},${ids.assigneeSel}`).forEach(el => {
      el.disabled = false;
      el.style.pointerEvents = 'auto';
    });

    // Předpoklad: globální funkce addJobFromDrawer / addClientFromDrawer
    // Pokud používáš jiné názvy, jen je tu zavolej.
    const addJobBtn = drawer.querySelector(ids.addJobBtn);
    if (addJobBtn && typeof window.addJobFromDrawer === 'function') {
      addJobBtn.onclick = () => {
        const payload = {
          clientId: drawer.querySelector(ids.clientSel)?.value,
          name:     drawer.querySelector(ids.jobName)?.value?.trim(),
          statusId: drawer.querySelector(ids.statusSel)?.value,
          assignee: drawer.querySelector(ids.assigneeSel)?.value
        };
        window.addJobFromDrawer(payload);
      };
    }

    const addClientBtn = drawer.querySelector(ids.addClientBtn);
    if (addClientBtn && typeof window.addClientFromDrawer === 'function') {
      addClientBtn.onclick = () => {
        const name = drawer.querySelector(ids.clientName)?.value?.trim();
        window.addClientFromDrawer({ name });
      };
    }
  }

  // export ovládací funkce, kdybys je potřeboval z app.js
  window._drawer = { open, close, el: drawer };
})();
