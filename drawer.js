// drawer.js – izolovaný ovladač postranního panelu
(function () {
  const html   = document.documentElement;
  html.classList.add('js'); // umožní skrýt legacy add-row prvky

  const burger = document.getElementById('x-burger');
  const scrim  = document.getElementById('x-scrim');
  const drawer = document.getElementById('x-drawer');
  const close  = drawer?.querySelector('.x-drawer__close');

  if (!burger || !scrim || !drawer || !close) return;

  const open = () => {
    drawer.classList.add('is-open');
    scrim.hidden = false;
    drawer.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    // naplnit select klientů, pokud už máš načtené
    const sel = document.getElementById('newJobClient');
    if (sel && window.state?.clients?.length) {
      sel.innerHTML = window.state.clients
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');
    }
  };
  const closeIt = () => {
    drawer.classList.remove('is-open');
    scrim.hidden = true;
    drawer.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  burger.addEventListener('click', open);
  scrim.addEventListener('click', closeIt);
  close.addEventListener('click', closeIt);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeIt(); });

  // Propojíme tlačítka s existující logikou v app.js (zůstává beze změny).
  const addClientBtn = document.getElementById('addClientBtn');
  const addJobBtn    = document.getElementById('addJobBtn');

  if (addClientBtn) {
    addClientBtn.addEventListener('click', () => {
      // Očekáváme, že app.js poslouchá na #addClientBtn a #newClientName
      // (tj. žádná změna API). Pokud ne, můžeš volat svoji funkci:
      // window.addClient?.(document.getElementById('newClientName').value)
    });
  }

  if (addJobBtn) {
    addJobBtn.addEventListener('click', () => {
      // Očekáváme, že app.js poslouchá na #addJobBtn, #newJobClient, #newJobName, #newJobStatus
      // Případně zde můžeš manuálně zavolat svou funkci:
      // window.addJob?.({
      //   clientId: document.getElementById('newJobClient').value,
      //   name: document.getElementById('newJobName').value,
      //   status: document.getElementById('newJobStatus').value
      // })
    });
  }

  // Odhlášení – pokud máš funkci v app.js, zavolej:
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (typeof window.logout === 'function') {
        window.logout();
      }
    });
  }
})();
