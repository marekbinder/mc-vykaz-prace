/* drawer.js — kompletní verze */

/* Helpers */
const $ = (sel, root = document) => root.querySelector(sel);
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);

/* DOM */
const drawer    = $('#toolsDrawer');
const overlay   = $('#drawerOverlay');
const openBtn   = $('#openDrawerBtn');   // kulaté + vpravo nahoře
const closeBtn  = $('#drawerCloseBtn');  // křížek v hlavičce panelu

/* Ovládací prvky uvnitř panelu */
const selNewJobClient = $('#newJobClient');   // select klientů
const selNewJobStatus = $('#newJobStatus');   // select statusu
const inpNewJobName   = $('#newJobName');     // input názvu
const btnAddJob       = $('#addJobBtn');

const inpNewClientName = $('#newClientName');
const btnAddClient     = $('#addClientBtn');

/* Zdroj pro naplnění klientů – přebereme hotové options z horního filtru */
const filterClient = $('#filterClient'); // existuje na stránce, plní ho app.js

/* Stav */
let isOpen = false;

/* ---------- Populate ---------- */

/** Naplní <select> #newJobClient z horního filtru #filterClient (ignoruje ALL) */
function populateClientsIntoDrawer() {
  if (!selNewJobClient) return;
  if (!filterClient || !filterClient.options || filterClient.options.length === 0) return;

  const opts = [];
  for (const opt of filterClient.options) {
    if (opt.value === 'ALL') continue;
    opts.push(`<option value="${opt.value}">${opt.textContent}</option>`);
  }
  selNewJobClient.innerHTML = opts.join('') || '<option disabled>— žádní klienti —</option>';
}

/** Volitelné: doplnění statusů, pokud nejsou v HTML napevno */
function ensureJobStatuses() {
  if (!selNewJobStatus) return;
  if (selNewJobStatus.options.length > 0) return; // už je naplněno
  const statuses = [
    { value: 'NEW',    label: 'Nová' },
    { value: 'RUN',    label: 'Probíhá' },
    { value: 'DONE',   label: 'Hotovo' }
  ];
  selNewJobStatus.innerHTML = statuses.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
}

/* ---------- Drawer toggle ---------- */

function openDrawer() {
  if (!drawer || !overlay) return;

  // Naplníme klienty vždy při otevření (kdyby se mezitím změnili nahoře)
  populateClientsIntoDrawer();
  ensureJobStatuses();

  // Viditelnost
  drawer.classList.add('open');
  overlay.classList.add('open');

  // Správné ARIA
  drawer.removeAttribute('aria-hidden');
  overlay.setAttribute('aria-hidden', 'false');

  // Zabraň scrollu pozadí
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  isOpen = true;

  // Fokus do prvního pole (bezpečné)
  if (selNewJobClient) selNewJobClient.focus();
}

function closeDrawer() {
  if (!drawer || !overlay) return;

  drawer.classList.remove('open');
  overlay.classList.remove('open');

  // ARIA zpět
  drawer.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-hidden', 'true');

  // Obnov scroll pozadí
  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';

  isOpen = false;
}

/* ---------- Actions uvnitř panelu (drátování jen, logiku přidání má app.js) ---------- */

on(btnAddJob, 'click', (e) => {
  e.preventDefault();
  // necháváme na app.js – tady jen sanity kontrola vstupů
  if (!selNewJobClient?.value || !inpNewJobName?.value) {
    showToast('Vyplňte klienta a název zakázky.');
    return;
  }
  // Pokud app.js poslouchá #addJobBtn, necháme akci proběhnout normálně
});

on(btnAddClient, 'click', (e) => {
  e.preventDefault();
  if (!inpNewClientName?.value) {
    showToast('Zadejte název klienta.');
    return;
  }
  // Přenecháno app.js (listener na #addClientBtn)
});

/* ---------- Eventy otevření / zavření ---------- */

on(openBtn,  'click', (e) => { e.preventDefault(); openDrawer(); });
on(closeBtn, 'click', (e) => { e.preventDefault(); closeDrawer(); });
on(overlay,  'click', () => { if (isOpen) closeDrawer(); });
on(document, 'keydown', (e) => {
  if (e.key === 'Escape' && isOpen) closeDrawer();
});

/* ---------- Pomocné ---------- */
function showToast(txt) {
  try {
    const toast = $('#err');
    if (!toast) return;
    toast.textContent = txt;
    toast.style.display = 'block';
    setTimeout(() => (toast.style.display = 'none'), 2200);
  } catch (_) {}
}

/* ---------- Expose pro self-check ---------- */
window.toolsDrawer = { open: openDrawer, close: closeDrawer, populateClientsIntoDrawer };
