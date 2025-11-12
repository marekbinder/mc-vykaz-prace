/* ===========================================================================
   UI PATCH – zarovnání a stabilizace UI prvků
   - Přesun „Přidat zakázku“ do posledního th (sloupec Celkem) a zarovnání vpravo
   - Koš: bez podbarvení + svislé centrování
   - Zachováno maximálně neinvazivně (MutationObserver)
   =========================================================================== */

(function(){
  const norm = s => (s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');

  function findAddBtn(){
    // Hledej podle textu (Přidat zakázku) – jistota i když se mění šablona
    const btn = [...document.querySelectorAll('button')]
      .find(b => norm(b.textContent.trim()) === norm('Přidat zakázku'));
    return btn || null;
  }

  function anchorHeader(){
    const head =
      document.querySelector('.jobsTable thead tr') ||
      document.querySelector('table thead tr') ||
      document.querySelector('.jobsHeaderRow') ||
      document.querySelector('.tableHeader thead tr');

    if (!head) return null;
    head.classList.add('jobsHeaderRow'); // pro CSS
    const lastTh = head.querySelector('th:last-child');
    return lastTh || null;
  }

  function moveAddButton(){
    const btn = findAddBtn();
    const lastTh = anchorHeader();
    if (!btn || !lastTh) return;

    // Přidej ID i datový atribut (abychom ho věděli stylovat i bez ID)
    if (!btn.id) btn.id = 'addJobBtn';
    btn.setAttribute('data-role', 'add-job');

    // Když už je správně umístěn, nic nedělej
    if (lastTh.contains(btn)) return;

    // Zruš absolutní pozicování, pokud ho má
    btn.style.position = 'static';
    btn.style.marginLeft = 'auto';

    lastTh.appendChild(btn);
  }

  function fixTrashButtons(){
    const apply = (b)=>{
      b.style.background = 'transparent';
      b.style.border = 'none';
      b.style.boxShadow = 'none';
      b.style.padding = '0';
      b.style.width = '44px';
      b.style.height = '44px';
      b.style.display = 'inline-flex';
      b.style.alignItems = 'center';
      b.style.justifyContent = 'center';
      b.style.borderRadius = '50%';
    };
    [...document.querySelectorAll('button[title="Odstranit"], .pill-btn.jobDelete')].forEach(apply);
  }

  // Úvodní průchod po načtení
  function initOnce(){
    moveAddButton();
    fixTrashButtons();
  }

  // Sleduj změny DOMu (UI se překresluje při přepínání týdnů/filtrů)
  const mo = new MutationObserver(() => {
    moveAddButton();
    fixTrashButtons();
  });

  function startObserver(){
    mo.observe(document.body, { childList:true, subtree:true });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', () => { initOnce(); startObserver(); });
  } else {
    initOnce(); startObserver();
  }
})();
