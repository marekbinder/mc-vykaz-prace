/* ===== Drawer v2.2 – populate selectů + fix re-render ===== */
(function () {
  const READY = () => /complete|interactive/.test(document.readyState);

  // trvale schovat e-mail/odhlášení v topbar
  (function ensureStyle() {
    if (!document.getElementById('drawerHardStyle')) {
      const st = document.createElement('style');
      st.id = 'drawerHardStyle';
      st.textContent = `#userBoxTopRight{display:none!important;visibility:hidden!important;pointer-events:none!important}`;
      document.head.appendChild(st);
    }
  })();

  const hideTopRightBox = () => {
    const box = document.getElementById('userBoxTopRight');
    if (box) {
      Object.assign(box.style, {
        display:'none', visibility:'hidden', pointerEvents:'none',
        position:'absolute', width:'0', height:'0', overflow:'hidden'
      });
    }
  };

  /* ---------- helpers ---------- */

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean)));

  const textArrayFromSelect = (sel) => {
    const s = document.querySelector(sel);
    if (!s || !s.options?.length) return [];
    return Array.from(s.options).map(o => (o.text || '').trim()).filter(Boolean);
  };

  // posbírej texty z buněk první/ druhé/… kolony – fallback
  const uniqueTextsInColumn = (colIndex = 1) => {
    // najdeme řádky v tabulce (mívají 1. sloupec Klient, 2. Zakázka, 3. Stav…)
    const rows = Array.from(document.querySelectorAll('main .tableWrap tr, main tr')).filter(r => r.cells && r.cells.length >= colIndex);
    const texts = rows.map(r => (r.cells[colIndex-1]?.innerText || '').trim()).filter(Boolean);
    return uniq(texts);
  };

  const fillSelect = (select, values) => {
    if (!select) return;
    const current = select.value;
    const html = values.map(v => `<option value="${v}">${v}</option>`).join('');
    if (html) {
      select.innerHTML = html;
      if (values.includes(current)) select.value = current;
    }
  };

  /* ---------- UI scaffold ---------- */

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
    btn.style.cssText += ';position:fixed;top:16px;right:16px;z-index:2147483647;';
    return btn;
  };

  const ensureDrawer = () => {
    document.querySelectorAll('.drawer').forEach((d, i) => { if (i > 0) d.remove(); });

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
    } else {
      drawer.classList.remove('open');
    }

    const body = drawer.querySelector('.drawer__body');

    const ensureSection = (key, html) => {
      if (!drawer.querySelector(key)) {
        const sec = document.createElement('section');
        sec.className = `drawer__section ${key.replace('.', '')}`;
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

    drawer.classList.remove('open'); // default zavřeno

    return drawer;
  };

  const wireOpenClose = (drawer, plusBtn) => {
    const scrim = drawer.querySelector('.drawer__scrim');
    const panel = drawer.querySelector('.drawer__panel');
    const closeBtn = drawer.querySelector('.drawer__close');

    const open = () => {
      drawer.classList.add('open');
      requestAnimationFrame(() => { try { panel.focus({ preventScroll:true }); } catch(_){} });
      // Pokaždé při otevření doplníme volby (kdyby se mezitím re-renderovala tabulka)
      populateDrawerOptions(drawer);
    };
    const close = () => drawer.classList.remove('open');

    plusBtn.addEventListener('click', open);
    scrim .addEventListener('click', close);
    closeBtn.addEventListener('click', close);

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });
  };

  /* ---------- Naplnění selectů z DOM ---------- */

  const populateDrawerOptions = (drawer) => {
    const clientSel   = drawer.querySelector('#jobClientSel');
    const statusSel   = drawer.querySelector('#jobStatusSel');
    const assigneeSel = drawer.querySelector('#jobAssigneeSel');

    // 1) Klienti
    let clientValues = [];
    // Kandidát: jakýkoli dropdown v prvním sloupci seznamu (u řádků mívá kompletní seznam klientů)
    const rowClientSelect = document.querySelector('main td:first-child select, .tableWrap td:first-child select');
    if (rowClientSelect && rowClientSelect.options?.length > 1) {
      clientValues = Array.from(rowClientSelect.options).map(o => (o.text || '').trim());
    }
    // Fallback: posbíráme texty z prvního sloupce tabulky
    if (!clientValues.length) clientValues = uniqueTextsInColumn(1);
    // Záloha: pokud se nic nenašlo, necháme prázdné (uživatel má aspoň možnost psát název dřív, než přidáme zdroj)

    // 2) Statusy – ideálně z horního “status” filtru (ten mívá hodnoty Nová/Probíhá/Hotovo)
    let statusValues = [];
    // zkuste vyhledat select, jehož vybraná položka je jedna z [Nová, Probíhá, Hotovo]
    const candidateSelects = Array.from(document.querySelectorAll('main select, header select, .wrap select'));
    for (const s of candidateSelects) {
      const opts = Array.from(s.options).map(o => (o.text || '').trim());
      const hasStatuses = ['Nová','Probíhá','Hotovo'].some(x => opts.includes(x));
      if (hasStatuses) { statusValues = opts.filter(Boolean); break; }
    }
    if (!statusValues.length) statusValues = ['Nová','Probíhá','Hotovo'];

    // 3) Grafik – ideálně z horního “Grafik: …” filtru
    let assigneeValues = [];
    for (const s of candidateSelects) {
      const opts = Array.from(s.options).map(o => (o.text || '').trim());
      if (opts.some(t => /^Grafik:/i.test(t))) {
        // z „Grafik: xxx“ uděláme jen jméno (bez prefixu), zároveň přidáme „nikdo“
        assigneeValues = uniq(
          opts.map(t => t.replace(/^Grafik:\s*/i,'').trim())
        );
        break;
      }
    }
    if (!assigneeValues.length) assigneeValues = ['nikdo'];

    fillSelect(clientSel,   uniq(clientValues));
    fillSelect(statusSel,   uniq(statusValues));
    fillSelect(assigneeSel, uniq(assigneeValues));
  };

  /* ---------- boot ---------- */

  const boot = () => {
    hideTopRightBox();

    const plus = injectPlus();
    const drawer = ensureDrawer();
    wireOpenClose(drawer, plus);

    // jednou po načtení zkusíme popsat (když už jsou na stránce selecty)
    populateDrawerOptions(drawer);

    // držíme stav i při re-renderu
    let ticks = 0;
    const keep = setInterval(() => {
      injectPlus();
      hideTopRightBox();
      // pokud je zavřený, držíme ho zavřený
      if (!drawer.classList.contains('open')) drawer.classList.remove('open');
      if (++ticks > 40) clearInterval(keep);
    }, 300);

    // když app překreslí DOM, znovu schovej user box a doplň options při otevření
    const mo = new MutationObserver(() => {
      hideTopRightBox();
      // options doplňujeme až při otevření (rychlejší), ale můžeme i zde, pokud je panel otevřený:
      if (drawer.classList.contains('open')) populateDrawerOptions(drawer);
    });
    mo.observe(document.documentElement, { childList:true, subtree:true });
  };

  if (READY()) boot();
  else document.addEventListener('DOMContentLoaded', boot);
})();
