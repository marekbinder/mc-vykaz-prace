// Jednoduché řízení draweru (otevření/zavření) – bez zásahu do app.js
(function(){
  const drawer   = document.querySelector('.drawer');
  const overlay  = document.querySelector('.drawer-overlay');
  const btnOpen  = document.getElementById('drawerOpenBtn');
  const btnClose = document.getElementById('drawerCloseBtn');

  if(!drawer || !overlay || !btnOpen || !btnClose) return;

  function openDrawer(){
    drawer.classList.add('open');
    overlay.classList.add('show');
    document.documentElement.classList.add('no-scroll');
  }
  function closeDrawer(){
    drawer.classList.remove('open');
    overlay.classList.remove('show');
    document.documentElement.classList.remove('no-scroll');
  }

  btnOpen.addEventListener('click', openDrawer);
  btnClose.addEventListener('click', closeDrawer);
  overlay.addEventListener('click', closeDrawer);
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeDrawer(); });
})();
