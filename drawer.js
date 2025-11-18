/* Drawer plugin – bezpečný doplněk, který:
   - přidá burger vpravo nahoře
   - udělá scrim + drawer
   - najde „řádek přidání klienta/zakázky“ na hlavní stránce a přesune ho do draweru
   - hlavní app logiky (týden, Supabase, export) se NEDOTÝKÁ
*/
(function(){
  const S = (sel,root=document)=>root.querySelector(sel);
  const SA= (sel,root=document)=>root.querySelectorAll(sel);

  // Počkej na DOM
  document.addEventListener('DOMContentLoaded', () => {
    // označ HTML kvůli případným CSS (kdyby bylo potřeba)
    document.documentElement.classList.add('js');

    // 1) Vytvoř burger, scrim a drawer
    const burger = document.createElement('button');
    burger.className = 'x-burger';
    burger.type = 'button';
    burger.setAttribute('aria-label','Nástroje');
    burger.innerHTML = '<span></span><span></span><span></span>';

    const scrim = document.createElement('div');
    scrim.className = 'x-scrim';
    scrim.hidden = true;

    const drawer = document.createElement('aside');
    drawer.className = 'x-drawer';
    drawer.setAttribute('aria-hidden','true');

    drawer.innerHTML = `
      <div class="x-drawer__head">
        <div class="x-drawer__title">Nástroje</div>
        <button class="x-drawer__close" type="button" aria-label="Zavřít">✕</button>
      </div>
      <div class="x-drawer__body" id="xDrawerBody">
        <!-- sem přesuneme přidávací řádek -->
      </div>
    `;

    document.body.appendChild(burger);
    document.body.appendChild(scrim);
    document.body.appendChild(drawer);

    const body = S('#xDrawerBody', drawer);
    const closeBtn = S('.x-drawer__close', drawer);

    // 2) Najdi „přidávací“ řádek v existující app a přesuň do draweru
    // Cíleně hledáme vstup „Název klienta“ a tlačítko „Přidat klienta“,
    // případně wrapper, kde to obvykle bývá.
    // Hledáme bezpečně a nic nerozbíjíme, když to nenajdeme – jen zobrazíme prázdný panel.
    let addRow = null;

    // Kandidáti wrapperů v app – použijeme první, co obsahuje input + button
    const candidates = [
      '.addRow',              // časté pojmenování
      '.add-row',
      'section.addRow',
      'section.add-row'
    ];

    for (const sel of candidates) {
      const el = S(sel);
      if (el && (S('input', el) || S('select', el)) && S('button', el)) {
        addRow = el;
        break;
      }
    }

    // Nenašli jsme wrapper? Zkusíme poskládat z částí (inputy + tlačítko)
    if (!addRow) {
      const block = document.createElement('div');
      block.className = 'x-block';
      const parts = [];

      const nameInput = SA('input, select');
      const btns      = SA('button');

      // rozumné minimum: 1 input/select + 1 button
      const firstInput = Array.from(nameInput).find(el=>{
        const ph = (el.getAttribute('placeholder')||'').toLowerCase();
        return ph.includes('klient') || ph.includes('zakázk') || ph.includes('název');
      });
      const addBtn = Array.from(btns).find(el=>{
        const t = (el.textContent||'').toLowerCase();
        return t.includes('přidat') && (t.includes('klient') || t.includes('zakázk'));
      });

      if (firstInput && addBtn) {
        // vezmeme jejich rodiče – ať se přenesou i styly „pill“
        const inWrap = firstInput.closest('.pill-input, .pill-select, div') || firstInput;
        const btnWrap= addBtn.closest('div') || addBtn;

        const header = document.createElement('div');
        header.className = 'x-block__title';
        header.textContent = 'Přidání klienta/zakázky';
        block.appendChild(header);

        block.appendChild(inWrap.cloneNode(true));
        // zkusit dohledat i další selecty stejné řady (klient, status, grafik)
        const siblingSelects = Array.from(SA('select')).filter(s=>{
          const ph = (s.getAttribute('placeholder')||'') + (s.getAttribute('name')||'');
          return ph.toLowerCase().includes('klient') ||
                 ph.toLowerCase().includes('status') ||
                 ph.toLowerCase().includes('grafik');
        }).slice(0,3);
        siblingSelects.forEach(s=>{
          block.appendChild((s.closest('.pill-select, div')||s).cloneNode(true));
        });

        block.appendChild(btnWrap.cloneNode(true));

        body.appendChild(block);
      }
    } else {
      // Přesuneme wrapper 1:1 (DOM move), takže na hlavní stránce zmizí.
      const box = document.createElement('div');
      box.className = 'x-block';
      const title = document.createElement('div');
      title.className = 'x-block__title';
      title.textContent = 'Přidání klienta/zakázky';
      box.appendChild(title);
      box.appendChild(addRow);
      body.appendChild(box);
    }

    // 3) Případně účet/odhlášení – když ho v app najdeme, přesuneme taky
    const logoutBtn = Array.from(SA('button, a')).find(el=>{
      const t=(el.textContent||'').toLowerCase();
      return t.trim()==='odhlásit' || t.includes('logout');
    });
    const emailEl = Array.from(SA('div, span')).find(el=>{
      const t=(el.textContent||'').trim();
      return /@.+\./.test(t);
    });

    if (logoutBtn || emailEl) {
      const acc = document.createElement('div');
      acc.className = 'x-block';
      const title = document.createElement('div');
      title.className = 'x-block__title';
      title.textContent = 'Účet';
      acc.appendChild(title);

      if (emailEl) acc.appendChild(emailEl);
      if (logoutBtn) acc.appendChild(logoutBtn);

      body.appendChild(acc);
    }

    // Doplňkové tlačítko dole – když by primární „Přidat zakázku“ nebylo součástí wrapperu
    const addBtnCandidates = Array.from(SA('button')).filter(b=>{
      const t=(b.textContent||'').toLowerCase();
      return t.includes('přidat') && (t.includes('zakázk')||t.includes('klient'));
    });
    if (!addBtnCandidates.some(b => body.contains(b))) {
      const fallback = document.createElement('button');
      fallback.className = 'x-primary';
      fallback.type='button';
      fallback.textContent='Přidat zakázku';
      fallback.addEventListener('click', ()=> {
        // najít primární „přidat“ v app a kliknout na něj
        const btn = Array.from(SA('button')).find(b=>{
          const t=(b.textContent||'').toLowerCase();
          return t.includes('přidat') && (t.includes('zakázk')||t.includes('klient'));
        });
        if (btn) btn.click();
      });
      body.appendChild(fallback);
    }

    // 4) Otevření/zavření
    const open = () => {
      scrim.hidden = false;
      drawer.setAttribute('aria-hidden','false');
      document.body.classList.add('x-noScroll');
    };
    const close = () => {
      scrim.hidden = true;
      drawer.setAttribute('aria-hidden','true');
      document.body.classList.remove('x-noScroll');
    };

    burger.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    scrim.addEventListener('click', close);

    // Esc = zavřít
    document.addEventListener('keydown', (e)=>{
      if (e.key==='Escape' && drawer.getAttribute('aria-hidden')==='false') close();
    });
  });
})();
