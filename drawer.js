/* drawer.js — kompletní, samostatný ovladač bočního panelu */

/* Mini utilitky */
const $  = (s, r = document) => r.querySelector(s);
const on = (el, ev, fn, opt) => el && el.addEventListener(ev, fn, opt);

/* DOM reference */
const drawer   = $('#toolsDrawer');
const overlay  = $('#drawerOverlay');
const openBtn  = $('#openDrawerBtn');
const closeBtn = $('#drawerCloseBtn');

const selNewJobClient = $('#newJobClient');
const selNewJobStatus = $('#newJobStatus');
const inpNewJobName   = $('#newJobName');
const btnAddJob       = $('#addJobBtn');

const inpNewClientName = $('#newClientName');
const btnAddClient     = $('#addClientBtn');

const logoutBtn        = $('#logoutBtn');

/* Zdroj klientů: horní filtr plněný app.js */
const filterClient = $('#filterClient');

let isOpen = false;

/* ------------ Naplnění polí v panelu ---------------- */

function populateClientsIntoDrawer() {
  if (!selNewJobClient) return;

  // Vezmeme hotové options z horního #filterClient (ignorujeme ALL)
  const src = filterClient?.options;
  if (!src || src.length === 0) return;

  const opts = [];
  for (const opt of src) {
    if (opt.value === 'ALL') continue;
    opts.push(`<option value="${opt.value}">${opt.textContent}</option>`);
  }
  selNewJobClient.innerHTML = opts.join('') || '<option disabled>— žádní klienti —</option>';
}

/* Když nejsou statusy v HTML, doplníme defaulty */
function ensureJobStatuses() {
  if (!selNewJobStatus) return;
  if (selNewJobStatus.options.length) return;

  const statuses = [
    { value: 'NEW',  label: 'Nová' },
    { value: 'RUN',  label: 'Probíhá' },
    { value: 'DONE', label: 'Hotovo' }
  ];
  selNewJobStatus.innerHTML = statuses.map(s => `<option value="${s.value}">${s.label}</option>`).join('');
}

/* ------------ Ovládání panelu ----------------------- */

function openDrawer() {
  if (!drawer || !overlay) return;

  populateClientsIntoDrawer();
  ensureJobStatuses();

  drawer.classList.add('open');
  overlay.classList.add('open');

  drawer.removeAttribute('aria-hidden');
  overlay.setAttribute('aria-hidden', 'false');

  // Zamezíme scrollu na pozadí
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';

  isOpen = true;

  // Fokus do 1. ovládacího prvku
  selNewJobClient?.focus();
}

function closeDrawer() {
  if (!drawer || !overlay) return;

  drawer.classList.remove('open');
  overlay.classList.remove('open');

  drawer.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('aria-hidden', 'true');

  document.documentElement.style.overflow = '';
  document.body.style.overflow = '';

  isOpen = false;
}

/* ------------ Drátování akcí ------------------------ */

on(openBtn,  'click', (e) => { e.preventDefault(); openDrawer(); });
on(closeBtn, 'click', (e) => { e.preventDefault(); closeDrawer(); });
on(overlay,  'click', () => { if (isOpen) closeDrawer(); });
on(document, 'keydown', (e) => { if (e.key === 'Escape' && isOpen) closeDrawer(); });

/* Guardy pro tlačítka uvnitř – samotné přidání řeší app.js podle tvých listenerů */
on(btnAddJob, 'click', (e) => {
  if (!selNewJobClient?.value || !inpNewJobName?.value) {
    e.preventDefault();
    toast('Vyplňte klienta a název zakázky.');
  }
});

on(btnAddClient, 'click', (e) => {
  if (!inpNewClientName?.value) {
    e.preventDefault();
    toast('Zadejte název klienta.');
  }
});

/* Volitelné: nechávám i logout, pokud ho app.js obsluhuje – tady nic */
on(logoutBtn, 'click', () => { /* app.js */ });

/* ------------ Pomocné ------------------------------- */
function toast(msg) {
  const t = $('#err');
  if (!t) return;
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2000);
}

/* Expose pro rychlý self-check v konzoli */
window.toolsDrawer = { open: openDrawer, close: closeDrawer, populateClientsIntoDrawer };
