/* drawer.js – čistě UI kontroler pravého vysouvacího panelu
   Bez zásahů do app.js. Používá stejné ID prvků, které app.js už zná.
*/
(function () {
  const qs  = (s,p=document) => p.querySelector(s);
  const qsa = (s,p=document) => Array.from(p.querySelectorAll(s));

  // prvky
  const fab      = qs('#toolsFab');
  const drawer   = qs('#toolsDrawer');
  const backdrop = qs('#toolsBackdrop');
  const closeX   = qs('#toolsClose');

  // Vnitřní prvky, necháváme stejné ID, které očekává app.js
  const addJobBtn     = qs('#addJobBtn');
  const addClientBtn  = qs('#addClientBtn');
  const logoutBtn     = qs('#logoutBtn');

  // helpery
  const lockScroll = (on) => {
    if (on) {
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
    } else {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    }
  };

  const openDrawer = () => {
    drawer.classList.add('open');
    backdrop.classList.add('show');
    lockScroll(true);
    // focus: první pole v sekci Přidání zakázky (select klienta)
    const first = qs('#newJobClient');
    first && first.focus();
  };

  const closeDrawer = () => {
    drawer.classList.remove('open');
    backdrop.classList.remove('show');
    lockScroll(false);
  };

  // vazby
  fab     && fab.addEventListener('click', openDrawer);
  closeX  && closeX.addEventListener('click', closeDrawer);
  backdrop&& backdrop.addEventListener('click', closeDrawer);

  // ESC pro zavření
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer();
  });

  // Pokud app.js připojí vlastní handlery na #addJobBtn/#addClientBtn/#logoutBtn,
  // necháváme to plně na něm. Zde jen prevence defaultu (form uvnitř sidebaru)
  [addJobBtn, addClientBtn, logoutBtn].forEach(btn=>{
    if (!btn) return;
    btn.addEventListener('click', () => {
      // Zavřeme po úspěšném kliku – app.js typicky ukáže toast/refreshne, UI se zavře
      // Pokud potřebuješ zavírat až po potvrzení, můžeš to udělat v app.js po úspěchu.
      // Tady necháme “optimisticky” zavřít:
      setTimeout(()=> {
        if (drawer.classList.contains('open')) closeDrawer();
      }, 120);
    });
  });

  // Hotfix: v některých prohlížečích mohla otravovat “skákající” animace zleva.
  // Jasně definujeme směr zprava:
  if (drawer) {
    drawer.style.transformOrigin = 'right center';
  }

})();
