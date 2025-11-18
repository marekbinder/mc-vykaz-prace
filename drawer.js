// Izolované ovládání pravého panelu (burger). App logiky se netýká.

const body = document.body;
const burgerBtn = document.getElementById('burgerBtn');
const backdrop = document.getElementById('drawerBackdrop');

const userBoxTopRight = document.getElementById('userBoxTopRight');
const drawerUserSlot = document.getElementById('drawerUserSlot');

function openDrawer() {
  // Zkopíruj obsah (e-mail / Odhlásit), který tvůj app.js vykreslí do #userBoxTopRight
  if (userBoxTopRight && drawerUserSlot) {
    drawerUserSlot.innerHTML = userBoxTopRight.innerHTML || '';
  }
  body.classList.add('drawer-open');
  backdrop.hidden = false;
}
function closeDrawer() {
  body.classList.remove('drawer-open');
  backdrop.hidden = true;
}

burgerBtn?.addEventListener('click', () => {
  body.classList.contains('drawer-open') ? closeDrawer() : openDrawer();
});
backdrop?.addEventListener('click', closeDrawer);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && body.classList.contains('drawer-open')) closeDrawer();
});
