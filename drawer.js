/* drawer.js – nástroje v pravém panelu
 * Vytvoří FAB „+“, overlay a panel; přesune existující prvky přidání
 * (klient/zakázka/status + přiřazení grafika) z hlavní stránky do panelu.
 */
(() => {
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ---------- UI kostra: FAB + overlay + panel ----------
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'drawerToggle';
  toggleBtn.className = 'drawer-toggle';
  toggleBtn.type = 'button';
  toggleBtn.textContent = '+';
  toggleBtn.setAttribute('aria-label','Otevřít nástroje');
  document.body.appendChild(toggleBtn);

  const overlay = document.createElement('div');
  overlay.id = 'drawerOverlay';
  overlay.className = 'drawer-overlay';
  document.body.appendChild(overlay);

  const drawer = document.createElement('aside');
  drawer.id = 'drawer';
  drawer.className = 'drawer';
  drawer.setAttribute('aria-hidden','true');
  document.body.appendChild(drawer);

  const header = document.createElement('div');
  header.className = 'drawer-header';
  header.innerHTML = `<h2>Nástroje</h2>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.type = 'button';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('aria-label','Zavřít panel');
  header.appendChild(closeBtn);
  drawer.appendChild(header);

  const makeSection = (title) => {
    const sec = document.createElement('section');
    sec.className = 'tool-section';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    const wrap = document.createElement('div');
    wrap.className = 'tool-wrap';
    sec.appendChild(h3);
    sec.appendChild(wrap);
    drawer.appendChild(sec);
    return wrap;
  };

  // ---------- Schovat top-right email + Odhlásit ----------
  const hideTopRightStuff = () => {
    // „Odhlásit“
    const logout = qsa('button, a').find(el => /odhl[aá]sit/i.test(el.textContent));
    if (logout) logout.style.display = 'none';
    // email chip – prvek vpravo nahoře s „@“
    const emailChip = qsa('div,span,a,button').find(el =>
      /@/.test(el.textContent || '') &&
      el.getBoundingClientRect &&
      el.getBoundingClientRect().top < 120 &&
      el.getBoundingClientRect().left > (window.innerWidth * 0.55)
    );
    if (emailChip) emailChip.style.display = 'none';
  };
  hideTopRightStuff();

  // ---------- Přesun prvků do panelu ----------
  // Původní add řádek schováme (ale až po vyjmutí prvků)
  const addRow = qs('#addRow');

  // Základ: jméno klienta + tlačítko
  const newClientName = qs('#newClientName');
  const addClientBtn  = qs('#addClientBtn');

  // Zakázka: klient, název, status, tlačítko
  const newJobClient  = qs('#newJobClient');
  const newJobName    = qs('#newJobName');
  const newJobStatus  = qs('#newJobStatus');
  const addJobBtn     = qs('#addJobBtn');

  // Robustní detekce prvku PRO PŘIŘAZENÍ GRAFIKA (ten „Grafik: …“)
  const findAssigneeControl = () => {
    // nejdřív zkus uvnitř addRow
    const insideAdd = addRow
      ? qsa('*', addRow).find(el =>
          /assignee|grafik/i.test((el.id||'') + ' ' + (el.className||'')) ||
          /^grafik:/i.test((el.textContent||'').trim())
        )
      : null;
    if (insideAdd) return insideAdd;

    // fallback – najdi „pill/select“, co má text „Grafik:“ a není to filtr „Všichni“
    const pills = qsa('.pill-select, .pill-btn, select, button, [role="button"]')
      .filter(el => /grafik/i.test((el.textContent||'') + ' ' + (el.id||'') + ' ' + (el.className||'')));
    const nonFilter = pills.find(el => !/v[šs]ichni/i.test(el.textContent||''));
    return nonFilter || null;
  };

  const newJobAssignee = findAssigneeControl();

  // Sekce 1: Přidání zakázky
  const jobWrap = makeSection('Přidání zakázky');
  if (newJobClient)  jobWrap.appendChild(newJobClient);
  if (newJobName)    jobWrap.appendChild(newJobName);
  if (newJobStatus)  jobWrap.appendChild(newJobStatus);
  if (newJobAssignee) jobWrap.appendChild(newJobAssignee); // <- doplněno
  if (addJobBtn)     jobWrap.appendChild(addJobBtn);

  // Sekce 2: Přidání klienta
  const clientWrap = makeSection('Přidání klienta');
  if (newClientName) clientWrap.appendChild(newClientName);
  if (addClientBtn)  clientWrap.appendChild(addClientBtn);

  // Až teď bezpečně skryj celý původní řádek
  if (addRow) addRow.style.display = 'none';

  // Pokud by někde zůstala zatoulaná „Grafik: …“ pilulka (duplicitní),
  // preventivně ji schovej:
  const strayGrafik = qsa('.pill-select, .pill-btn, select, button, [role="button"]')
    .find(el => /^grafik:/i.test((el.textContent||'').trim()) && !drawer.contains(el));
  if (strayGrafik) strayGrafik.style.display = 'none';

  // ---------- Open / Close ----------
  const open = () => {
    drawer.classList.add('open');
    overlay.classList.add('show');
    drawer.setAttribute('aria-hidden','false');
    const focusable = qsa('input,select,button', drawer).find(el => !el.disabled);
    if (focusable) focusable.focus();
  };
  const close = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('show');
    drawer.setAttribute('aria-hidden','true');
    toggleBtn.focus();
  };

  toggleBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });
})();
