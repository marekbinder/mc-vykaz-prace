/* drawer.js – build a right-side tools drawer
 * Bez zásahu do index.html: vše si vytvoříme sami a z UI
 * přesuneme existující prvky (ponechají si své listenery z app.js).
 */
(() => {
  const qs  = (s, r=document) => r.querySelector(s);
  const qsa = (s, r=document) => Array.from(r.querySelectorAll(s));

  // ==== 1) Vytvoříme tlačítko, overlay a samotný drawer
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'drawerToggle';
  toggleBtn.className = 'drawer-toggle';
  toggleBtn.type = 'button';
  toggleBtn.setAttribute('aria-label', 'Otevřít nástroje');
  toggleBtn.textContent = '+'; // kulaté + v rohu
  document.body.appendChild(toggleBtn);

  const overlay = document.createElement('div');
  overlay.id = 'drawerOverlay';
  overlay.className = 'drawer-overlay';
  document.body.appendChild(overlay);

  const drawer = document.createElement('aside');
  drawer.id = 'drawer';
  drawer.className = 'drawer';
  drawer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(drawer);

  // ==== 2) Hlavička draweru
  const header = document.createElement('div');
  header.className = 'drawer-header';
  header.innerHTML = `<h2>Nástroje</h2>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'drawer-close';
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Zavřít panel');
  closeBtn.textContent = '×';
  header.appendChild(closeBtn);
  drawer.appendChild(header);

  // Helper pro sekce (titulek + wrap)
  const makeSection = (title) => {
    const sec = document.createElement('section');
    sec.className = 'tool-section';
    const h3 = document.createElement('h3');
    h3.textContent = title;
    const wrap = document.createElement('div');
    wrap.className = 'tool-wrap'; // svislé řazení
    sec.appendChild(h3);
    sec.appendChild(wrap);
    drawer.appendChild(sec);
    return wrap;
  };

  // ==== 3) Přesun existujících prvků do dvou sekcí
  // Na stránce je původní „addRow“ – kompletně schováme.
  const addRow = qs('#addRow');
  if (addRow) addRow.style.display = 'none';

  // IDs starých prvků (už mají listenery z app.js):
  //  - klient:     #newClientName  + #addClientBtn
  //  - zakázka:    #newJobClient, #newJobName, #newJobStatus, #addJobBtn
  const newClientName = qs('#newClientName');
  const addClientBtn  = qs('#addClientBtn');

  const newJobClient  = qs('#newJobClient');
  const newJobName    = qs('#newJobName');
  const newJobStatus  = qs('#newJobStatus');
  const addJobBtn     = qs('#addJobBtn');

  // Sekce 1 – Přidání zakázky
  const jobWrap = makeSection('Přidání zakázky');
  if (newJobClient)  jobWrap.appendChild(newJobClient);
  if (newJobName)    jobWrap.appendChild(newJobName);
  if (newJobStatus)  jobWrap.appendChild(newJobStatus);
  if (addJobBtn)     jobWrap.appendChild(addJobBtn);

  // Sekce 2 – Přidání klienta
  const clientWrap = makeSection('Přidání klienta');
  if (newClientName) clientWrap.appendChild(newClientName);
  if (addClientBtn)  clientWrap.appendChild(addClientBtn);

  // ==== 4) Ovládání open/close
  const open = () => {
    drawer.classList.add('open');
    overlay.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    // fokus do 1. prvku v panelu
    const focusable = qsa('input,select,button', drawer).find(el => !el.disabled);
    if (focusable) focusable.focus();
  };

  const close = () => {
    drawer.classList.remove('open');
    overlay.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    toggleBtn.focus();
  };

  toggleBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', close);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) close();
  });
})();
