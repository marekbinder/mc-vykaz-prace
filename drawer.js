/* ===== Drawer v2.3 – bez intervalů, bez těžkého MO, naplnění selectů při otevření ===== */
(function () {
  const onReady = (fn) => (document.readyState === 'complete' || document.readyState === 'interactive')
    ? queueMicrotask(fn) : document.addEventListener('DOMContentLoaded', fn);

  /* Skryj trvale e-mail/odhlášení vpravo */
  (function ensureHideUser() {
    if (!document.getElementById('drawerHardStyle')) {
      const st = document.createElement('style');
      st.id = 'drawerHardStyle';
      st.textContent = '#userBoxTopRight{display:none!important;visibility:hidden!important;pointer-events:none!important}';
      document.head.appendChild(st);
    }
    const bx = document.getElementById('userBoxTopRight');
    if (bx) {
      Object.assign(bx.style, {
        display:'none', visibility:'hidden', pointerEvents:'none',
        position:'absolute', width:'0', height:'0', overflow:'hidden'
      });
    }
  })();

  /* ---- util ---- */
  const uniq = (arr) => Array.from(new Set((arr||[]).filter(Boolean)));

  const getSelectOptionsText = (sel) => {
    const s = document.querySelector(sel);
    if (!s || !s.options) return [];
    return Array.from(s.options).map(o => (o.text || '').trim()).filter(Boolean);
  };

  const uniqueTextsInColumn = (idx /* 1-based */) => {
    const rows = Array.from(document.querySelectorAll('main tr, .tableWrap tr'));
    const texts = rows.map(r => (r.cells && r.cells[idx-1] ? r.cells[idx-1].innerText.trim() : '')).filter(Boolean);
    return uniq(texts);
  };

  const fillSelect = (el, values) => {
    if (!el) return;
    const v = values && values.length ? values : [];
    el.innerHTML = v.map(x => `<option value="${x}">${x}</option>`).join('');
  };

  /* ---- UI scaffold ---- */
  const ensurePlus = () => {
    let b = document.getElementById('openDrawerBtn');
    if (!b) {
      b = document.createElement('button');
      b.id = 'openDrawerBtn';
      b.type = 'button';
      b.setAttribute('aria-label', 'Nástroje');
      b.textContent = '+';
      document.body.appendChild(b);
    }
    // pokud je v DOM, přesuň ho nahoru vpravo (kdyby ho cokoliv vykoplo jinam)
    b.style.cssText += ';position:fixed;top:16px;right:16px;';
    return b;
  };

  const ensureDrawer = () => {
    document.querySelectorAll('.drawer').forEach((d,i)=>{ if(i>0) d.remove(); });
    let dr = document.querySelector('.drawer');
    if (!dr) {
      dr = document.createElement('aside');
      dr.className = 'drawer';
      dr.innerHTML = `
        <div class="drawer__scrim" aria-hidden="true"></div>
        <div class="drawer__panel" role="dialog" aria-modal="true" aria-label="Nástroje">
          <div class="drawer__header">
            <div class="drawer__title">Nástroje</div>
            <button class="drawer__close" type="button" aria-label="Zavřít">×</button>
          </div>
          <div class="drawer__body">
            <section class="drawer__section section-job">
              <h3>Přidání zakázky</h3>
              <div class="form-stack">
                <div class="control"><select id="jobClientSel" aria-label="Klient"></select></div>
                <div class="control"><input  id="jobNameInp" placeholder="Název zakázky" aria-label="Název zakázky"></div>
                <div class="control"><select id="jobStatusSel" aria-label="Status"></select></div>
                <div class="control"><select id="jobAssigneeSel" aria-label="Grafik"></select></div>
                <button id="drawerAddJobBtn" class="btn-primary">Přidat zakázku</button>
              </div>
            </section>

            <section class="drawer__section section-client">
              <h3>Přidání klienta</h3>
              <div class="form-stack">
                <div class="control"><input id="clientNameInp" placeholder="Název klienta" aria-label="Název klienta"></div>
                <button id="drawerAddClientBtn" class="btn-primary">Přidat klienta</button>
              </div>
            </section>
          </div>
        </div>`;
      document.body.appendChild(dr);
    }
    dr.classList.remove('open'); // default zavřeno
    return dr;
  };

  /* ---- naplnění selectů – volá se jen při otevření ---- */
  const populateOptions = (drawer) => {
    const clientSel   = drawer.querySelector('#jobClientSel');
    const statusSel   = drawer.querySelector('#jobStatusSel');
    const assigneeSel = drawer.querySelector('#jobAssigneeSel');

    // Klienti: z řádkového selectu v 1. sloupci, případně z textu 1. sloupce
    let clients = [];
    const rowClientSelect = document.querySelector('td:first-child select, .tableWrap td:first-child select');
    if (rowClientSelect?.options?.length) {
      clients = Array.from(rowClientSelect.options).map(o => (o.text||'').trim());
    }
    if (!clients.length) clients = uniqueTextsInColumn(1);

    // Status: z horního filtru, jinak default
    let statuses = [];
    const allSelects = Array.from(document.querySelectorAll('select'));
    for (const s of allSelects) {
      const t = Array.from(s.options||[]).map(o => (o.text||'').trim());
      if (['Nová','Probíhá','Hotovo'].some(x => t.includes(x))) { statuses = t; break; }
    }
    if (!statuses.length) statuses = ['Nová','Probíhá','Hotovo'];

    // Grafik: z horního filtru, pokud existuje (často „Grafik: …“), jinak fallback
    let assignees = [];
    for (const s of allSelects) {
      const t = Array.from(s.options||[]).map(o => (o.text||'').trim());
      // heuristika: v textu některé option bývá prefix „Grafik:“
      if (t.some(x => /^Grafik:/i.test(x))) {
        assignees = t.map(x => x.replace(/^Grafik:\s*/i,'').trim()).filter(Boolean);
        break;
      }
    }
    if (!assignees.length) assignees = ['nikdo'];

    fillSelect(clientSel,   uniq(clients));
    fillSelect(statusSel,   uniq(statuses));
    fillSelect(assigneeSel, uniq(assignees));
  };

  /* ---- open / close ---- */
  const wire = (drawer, plus) => {
    const scrim   = drawer.querySelector('.drawer__scrim');
    const panel   = drawer.querySelector('.drawer__panel');
    const closeBt = drawer.querySelector('.drawer__close');

    const open = () => {
      drawer.classList.add('open');
      populateOptions(drawer); // jen teď, ne pořád
      try { panel.focus({preventScroll:true}); } catch(_) {}
    };
    const close = () => drawer.classList.remove('open');

    plus.addEventListener('click', open, { passive:true });
    scrim.addEventListener('click', close, { passive:true });
    closeBt.addEventListener('click', close, { passive:true });
    document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && drawer.classList.contains('open')) close(); }, { passive:true });
  };

  onReady(() => {
    const plus   = ensurePlus();
    const drawer = ensureDrawer();
    wire(drawer, plus);
  });
})();
