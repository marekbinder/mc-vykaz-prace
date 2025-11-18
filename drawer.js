// Toggle postranního panelu – izolováno od app.js
(function(){
  const menuBtn     = document.getElementById('menuBtn');
  const scrim       = document.getElementById('scrim');
  const drawer      = document.getElementById('drawer');
  const drawerClose = document.getElementById('drawerClose');

  function openDrawer(){
    drawer.classList.add('is-open');
    scrim.classList.add('is-visible');
    drawer.setAttribute('aria-hidden','false');
  }
  function closeDrawer(){
    drawer.classList.remove('is-open');
    scrim.classList.remove('is-visible');
    drawer.setAttribute('aria-hidden','true');
  }

  menuBtn?.addEventListener('click', openDrawer);
  scrim?.addEventListener('click', closeDrawer);
  drawerClose?.addEventListener('click', closeDrawer);

  // Zobrazení e-mailu v menu – pokud existuje session v app.js
  try{
    if (window.supabase && window.supabase.auth){
      window.supabase.auth.getSession().then(({data})=>{
        const email = data?.session?.user?.email || 'Nepřihlášený';
        const label = document.getElementById('userEmailLabel');
        if (label) label.textContent = email;
      });
    }
  }catch(e){}

  // Export – volá tvůj existující exportExcel()
  function handleExport(){ if (typeof window.exportExcel==='function') window.exportExcel(); }
  document.getElementById('exportBtn')?.addEventListener('click', handleExport);
  document.getElementById('exportBtnDrawer')?.addEventListener('click', handleExport);

  // Odhlášení – používá Supabase
  document.getElementById('signOutBtn')?.addEventListener('click', async ()=>{
    try{
      await window.supabase.auth.signOut();
      location.reload();
    }catch(e){
      const t=document.getElementById('err'); if(t){ t.textContent='Odhlášení se nezdařilo'; t.style.display='block'; setTimeout(()=>t.style.display='none', 2500); }
    }
  });

  // Týdny – zachováno: jen předává na stávající logiku v app.js
  const weekLabel = document.getElementById('weekLabel');
  function setWeekLabel(start){
    if (!window.dayjs) return;
    const end = new Date(start); end.setDate(end.getDate()+4);
    weekLabel.textContent = `${dayjs(start).format('DD. MM. YYYY')} – ${dayjs(end).format('DD. MM. YYYY')}`;
  }
  // Pokud app.js nastavuje week sám, tohle se přepíše – nevadí.
  if (weekLabel && !weekLabel.textContent.includes('.')) {
    const d = new Date(); const m = new Date(d);
    const diff = (m.getDay()+6)%7; m.setDate(m.getDate()-diff);
    setWeekLabel(m);
  }

})();
