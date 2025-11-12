/* ======================================================
   VÝKAZ PRÁCE – UI PATCH
   - přesun a zarovnání "Přidat zakázku"
   - srovnání koše (bez podbarvení, na střed)
   - žádná změna obchodní logiky
   ====================================================== */

/**
 * Najde tlačítko „Přidat zakázku“ podle textu (bez ohledu na diakritiku)
 * a přesune ho do posledního <th> hlavičky tabulky s „Celkem“.
 * Zároveň doplní značkovací třídu .jobsHeaderRow pro CSS.
 */
(function moveAddButtonToHeader(){
  // 1) najdi tlačítko dle textu
  const normalize = s => (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'');
  const addBtn = [...document.querySelectorAll('button')]
    .find(b => normalize(b.textContent.trim()) === normalize('Přidat zakázku'));

  if(!addBtn){
    // nic neděláme – UI bude fungovat dál
    return;
  }

  // 2) najdi řádek tabulky v záhlaví (thead > tr)
  const headRow =
    document.querySelector('.jobsTable thead tr') ||
    document.querySelector('table thead tr');

  if(!headRow){
    // když tabulka ještě není v DOM (lazy render), zkus po krátké chvilce znovu
    setTimeout(moveAddButtonToHeader, 150);
    return;
  }

  // 3) označ řádek pro naše CSS
  headRow.classList.add('jobsHeaderRow');

  // 4) vezmi poslední <th> (celkem) a vlož tam tlačítko
  const lastTh = headRow.querySelector('th:last-child');
  if(lastTh && !lastTh.contains(addBtn)){
    addBtn.id = 'addJobBtn';               // pro jistotu jednotný selektor
    addBtn.style.position = 'static';      // žádné absolute
    addBtn.style.marginLeft = 'auto';      // držet vpravo v buňce
    lastTh.appendChild(addBtn);
  }
})();

/**
 * Zarovná a „odbarví“ koš (Odstranit) – zůstává jen ikona bez podkladu.
 * Děláme to i JSem, kdyby CSS nestačilo (některé knihovny dopisují inline styly).
 */
(function normalizeTrashButton(){
  const apply = (btn)=>{
    btn.style.background = 'transparent';
    btn.style.border = 'none';
    btn.style.boxShadow = 'none';
    btn.style.padding = '0';
    btn.style.width = '44px';
    btn.style.height = '44px';
    btn.style.display = 'inline-flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
  };

  const run = ()=>{
    const trashBtns = [
      ...document.querySelectorAll('button[title="Odstranit"]'),
      ...document.querySelectorAll('.pill-btn.jobDelete')
    ];
    trashBtns.forEach(apply);
  };

  // první průchod
  run();

  // kdyby UI přerenderovalo řádky (po filtrování atd.)
  const mo = new MutationObserver(run);
  mo.observe(document.body, { childList:true, subtree:true });
})();

/* KONEC – UI PATCH */
