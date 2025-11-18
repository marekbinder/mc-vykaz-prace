// Ovládání pravého vysouvacího panelu.
// Záměrně izolované – nesaháme do app.js ani do stávající logiky.

const body = document.body;
const burgerBtn = document.getElementById('burgerBtn');
const backdrop = document.getElementById('drawerBackdrop');

// Div, do kterého tvůj původní kód vypisuje e-mail/odhlášení:
const userBoxTopRight = document.getElementById('userBoxTopRight');
// Slot v panelu, kam to zkopírujeme (jen HTML; nic nepřesouváme)
const drawerUserSlot = document.getElementById('drawerUserSlot');

function openDrawer() {
  // Vyrobíme kopii aktuálního HTML s e-mailem/odhlášením (původní app.js to tam rendruje)
  if (userBoxTopRight && drawerUserSlot) {
    drawerUserSlot.innerHTML = userBoxTopRight.innerHTML || '';
    // Malé doladění: obalíme to kapslí, aby ladilo s UI
    if (drawerUserSlot.firstElementChild) {
      drawerUserSlot.firstElementChild.style.display = 'inline-flex';
      drawerUserSlot.firstElementChild.style.gap = '8px';
      drawerUserSlot.firstElementChild.style.alignItems = 'center';
    }
  }
  body.classList.add('drawer-open');
  backdrop.hidden = false;
}

function closeDrawer() {
  body.classList.remove('drawer-open');
  backdrop.hidden = true;
}

burgerBtn?.addEventListener('click', () => {
  if (body.classList.contains('drawer-open')) closeDrawer();
  else openDrawer();
});

backdrop?.addEventListener('click', closeDrawer);

// Zavřít ESC
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && body.classList.contains('drawer-open')) {
    closeDrawer();
  }
});
