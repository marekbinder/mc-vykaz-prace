// auth.js — Login e-mail+heslo + reset/změna hesla (overlay) + floating "Odhlásit" + "Změnit heslo"
// - funguje s config.json (supabaseUrl, supabaseAnonKey)
// - UMD supabase-js MUSÍ být načteno před tímto souborem

(function () {
  const $ = (s, r = document) => r.querySelector(s);

  // ----------- UI: login panel (pokud ho máš v HTML) -----------
  const panel   = $('#authPanel');
  const emailEl = $('#authEmail');
  const passEl  = $('#authPassword');
  const btnIn   = $('#authSignIn');
  const btnUp   = $('#authSignUp');
  const msg     = $('#authMsg');

  function showAuth(show) { if (panel) panel.style.display = show ? 'block' : 'none'; }
  function setMsg(t, ok = false) {
    if (!msg) return;
    msg.textContent = t || '';
    msg.style.display = t ? 'block' : 'none';
    msg.style.color = ok ? '#0a7d2a' : '#c00';
  }

  // ----------- Overlay (reset/změna hesla) -----------
  let overlay, stepRequest, stepNew, reqEmail, reqBtn, reqInfo, reqErr, np1, np2, npBtn, npErr, ovClose;

  function ensureOverlay() {
    if (overlay) return overlay;

    overlay = document.createElement('div');
    Object.assign(overlay, { id: 'resetOverlay' });
    Object.assign(overlay.style, {
      position:'fixed', inset:'0', background:'rgba(10,14,20,.45)', display:'none',
      zIndex:'99999', backdropFilter:'blur(1px)'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      width:'min(420px,92vw)', margin:'8vh auto 0', background:'#fff', borderRadius:'14px',
      boxShadow:'0 18px 48px rgba(0,0,0,.25)', padding:'18px 18px 20px', position:'relative'
    });

    const title = document.createElement('h3');
    title.textContent = 'Obnovení / změna hesla';
    Object.assign(title.style, {margin:'0 0 10px', fontWeight:'800', textAlign:'center'});

    ovClose = document.createElement('button');
    ovClose.type = 'button';
    ovClose.setAttribute('aria-label','Zavřít');
    ovClose.textContent = '✕';
    Object.assign(ovClose.style, {
      position:'absolute', top:'10px', right:'10px', width:'36px', height:'36px',
      borderRadius:'10px', border:'1px solid rgba(0,0,0,.08)', background:'#fff', cursor:'pointer'
    });

    // Krok 1: odeslat reset e-mailem
    stepRequest = document.createElement('div');
    stepRequest.innerHTML = `
      <div style="display:grid;gap:10px;margin-top:8px">
        <input id="resetEmail" type="email" placeholder="E-mail"
               style="height:44px;border:1px solid #dfe7f3;border-radius:10px;padding:0 12px;">
        <button id="resetSend" style="height:44px;border-radius:10px;border:0;background:#0b1625;color:#fff;font-weight:700;">
          Poslat odkaz pro obnovení
        </button>
        <p id="resetInfo" style="margin:6px 0 0;color:#0a7d2a;display:none;text-align:center;"></p>
        <p id="resetErr"  style="margin:6px 0 0;color:#c00;display:none;text-align:center;"></p>
      </div>
    `;

    // Krok 2: nastavit nové heslo
    stepNew = document.createElement('div');
    stepNew.style.display = 'none';
    stepNew.innerHTML = `
      <div style="display:grid;gap:10px;margin-top:8px">
        <input id="newPass1" type="password" placeholder="Nové heslo"
               style="height:44px;border:1px solid #dfe7f3;border-radius:10px;padding:0 12px;">
        <input id="newPass2" type="password" placeholder="Zopakovat heslo"
               style="height:44px;border:1px solid #dfe7f3;border-radius:10px;padding:0 12px;">
        <button id="resetConfirm" style="height:44px;border-radius:10px;border:0;background:#0b1625;color:#fff;font-weight:700;">
          Nastavit heslo
        </button>
        <p id="resetNewErr" style="margin:6px 0 0;color:#c00;display:none;text-align:center;"></p>
      </div>
    `;

    card.appendChild(title);
    card.appendChild(ovClose);
    card.appendChild(stepRequest);
    card.appendChild(stepNew);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    reqEmail = stepRequest.querySelector('#resetEmail');
    reqBtn   = stepRequest.querySelector('#resetSend');
    reqInfo  = stepRequest.querySelector('#resetInfo');
    reqErr   = stepRequest.querySelector('#resetErr');

    np1   = stepNew.querySelector('#newPass1');
    np2   = stepNew.querySelector('#newPass2');
    npBtn = stepNew.querySelector('#resetConfirm');
    npErr = stepNew.querySelector('#resetNewErr');

    ovClose.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeOverlay(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.style.display === 'block') closeOverlay(); });

    return overlay;
  }

  function openOverlay(step) {
    Overlay();
    overlay.style.display = 'block';
    if (step === 'new') {
      stepRequest.style.display = 'none';
      stepNew.style.display = 'block';
      setTimeout(() => np1?.focus(), 0);
    } else {
      stepRequest.style.display = 'block';
      stepNew.style.display = 'none';
      setTimeout(() => reqEmail?.focus(), 0);
    }
  }
  function closeOverlay() {
    if (!overlay) return;
    overlay.style.display = 'none';
    if (reqInfo) reqInfo.style.display = 'none';
    if (reqErr)  reqErr.style.display  = 'none';
    if (npErr)   npErr.style.display   = 'none';
  }

  // ----------- Supabase klient z config.json -----------
  async function getSb() {
    if (window.__sb) return window.__sb;
    if (!window.supabase) { setMsg('Chybí supabase-js UMD.'); throw new Error('No supabase UMD'); }
    const res = await fetch('config.json');
    if (!res.ok) throw new Error('Nelze načíst config.json');
    const cfg = await res.json();
    window.__sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return window.__sb;
  }

  // ----------- URL helpers (návrat z mailu) -----------
  function getHashParams() {
    const raw = (window.location.hash || '').replace(/^#/, '');
    const p = new URLSearchParams(raw);
    const out = {};
    for (const [k,v] of p.entries()) out[k] = v;
    return out;
  }
  function cleanupUrl() {
    history.replaceState({}, document.title, window.location.pathname + window.location.search);
  }

  // ----------- Floating tlačítka (změna hesla + odhlásit) -----------
  function hideSignedInEmailUI() {
    // Skryj typický box s e-mailem / odhlášením (pokud existuje)
    const style = document.createElement('style');
    style.textContent = `
      #userBoxTopRight { display: none !important; }
      /* přidej sem případně další selektory, pokud máš jiné umístění e-mailu */
    `;
    document.head.appendChild(style);
  }

function ensureFloatingButtons(sb) {
  // ZMĚNIT HESLO (nahoře)
  if (!document.getElementById('authChangePwd')) {
    const change = document.createElement('button');
    change.id = 'authChangePwd';
    change.type = 'button';
    change.textContent = 'Nastavit/změnit heslo';
    Object.assign(change.style, {
      position:'fixed', right:'16px', bottom:'72px',
      background:'#fff', border:'1px solid #e8eef7', borderRadius:'10px',
      padding:'10px 12px', boxShadow:'0 6px 18px rgba(0,0,0,.08)',
      cursor:'pointer', zIndex: 9999, color:'#0b1625', fontWeight:'700'
    });
    change.addEventListener('click', () => openOverlay('new'));
    document.body.appendChild(change);
  }

  // ODHlÁSIT (níž) – stejný styl jako výše
  if (!document.getElementById('authLogoutFab')) {
    const logout = document.createElement('button');
    logout.id = 'authLogoutFab';
    logout.type = 'button';
    logout.textContent = 'Odhlásit';
    Object.assign(logout.style, {
      position:'fixed', right:'16px', bottom:'16px',
      background:'#fff', border:'1px solid #e8eef7', borderRadius:'10px',
      padding:'10px 12px', boxShadow:'0 6px 18px rgba(0,0,0,.08)',
      cursor:'pointer', zIndex: 9999, color:'#0b1625', fontWeight:'700'
    });
    logout.addEventListener('click', async () => {
      try { await sb.auth.signOut(); } catch {}
      cleanupUrl();
      location.reload();
    });
    document.body.appendChild(logout);
  }
}

  // ----------- Start -----------
  (async () => {
    const sb = await getSb();
    const { data: { session } } = await sb.auth.getSession();

    // Přidej "Zapomněli jste heslo?" do login panelu (pokud je vidět)
    if (panel && !$('#authForgot', panel)) {
      const forgot = document.createElement('button');
      forgot.id = 'authForgot';
      forgot.type = 'button';
      forgot.textContent = 'Zapomněli jste heslo?';
      Object.assign(forgot.style, {
        marginTop:'6px', background:'transparent', border:'0',
        color:'#0b1625', textDecoration:'underline', cursor:'pointer'
      });
      panel.appendChild(forgot);
      forgot.addEventListener('click', () => openOverlay('request'));
    }

    // Režim návratu z e-mailu (type=recovery / code=…)
    const hash = getHashParams();
    const urlQ = new URLSearchParams(window.location.search);
    const isRecovery = hash.type === 'recovery' || urlQ.get('type') === 'recovery' || urlQ.get('code');

    if (isRecovery) {
      try {
        const code = urlQ.get('code');
        if (code) {
          await sb.auth.exchangeCodeForSession(code);
        } else if (hash.access_token && hash.refresh_token) {
          await sb.auth.setSession({ access_token: hash.access_token, refresh_token: hash.refresh_token });
        }
        showAuth(false);
        openOverlay('new');
      } catch (e) {
        console.warn('Recovery session set failed:', e);
        openOverlay('new');
      }
    } else {
      // běžný režim – zobraz login jen když není session
      showAuth(!(session && session.user));
    }

    // Pokud JSI přihlášený → skryj e-mail v UI a přidej plovoucí knoflíky
    if (session?.user) {
      hideSignedInEmailUI();
      ensureFloatingButtons(sb);
    }

    // ===== Login (email+heslo) =====
    btnIn?.addEventListener('click', async () => {
      setMsg('');
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';
      if (!email || !password) { setMsg('Vyplň e-mail i heslo.'); return; }
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) { setMsg(error.message || 'Přihlášení selhalo.'); return; }
      setMsg('Přihlášeno, načítám…', true);
      cleanupUrl();
      location.reload();
    });

    // ===== Registrace =====
    btnUp?.addEventListener('click', async () => {
      setMsg('');
      const email = (emailEl?.value || '').trim();
      const password = passEl?.value || '';
      if (!email || !password) { setMsg('Vyplň e-mail i heslo.'); return; }
      if (password.length < 6) { setMsg('Heslo musí mít aspoň 6 znaků.'); return; }
      const { error } = await sb.auth.signUp({ email, password });
      if (error) { setMsg(error.message || 'Registrace selhala.'); return; }
      setMsg('Účet vytvořen. Zkontroluj e-mail (pokud je vyžadováno potvrzení).', true);
    });

    // ===== Reset – krok 1 (poslat e-mail) =====
    ensureOverlay();
    const redirectTo = window.location.origin + window.location.pathname + '#type=recovery';
    reqBtn?.addEventListener('click', async () => {
      reqInfo.style.display = 'none';
      reqErr.style.display  = 'none';

      const email = (reqEmail?.value || '').trim();
      if (!email) { reqErr.textContent = 'Zadej e-mail.'; reqErr.style.display = 'block'; return; }

      try {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        reqInfo.textContent = 'Odkaz byl odeslán. Zkontroluj schránku.';
        reqInfo.style.display = 'block';
      } catch (e) {
        reqErr.textContent = e.message || 'Odeslání odkazu selhalo.';
        reqErr.style.display = 'block';
      }
    });

    // ===== Reset/Změna – krok 2 (nové heslo) =====
    npBtn?.addEventListener('click', async () => {
      npErr.style.display = 'none';
      const p1 = np1?.value || '';
      const p2 = np2?.value || '';
      if (!p1 || !p2) { npErr.textContent = 'Vyplň obě pole.'; npErr.style.display = 'block'; return; }
      if (p1 !== p2)  { npErr.textContent = 'Hesla se neshodují.'; npErr.style.display = 'block'; return; }
      if (p1.length < 6){ npErr.textContent = 'Heslo musí mít aspoň 6 znaků.'; npErr.style.display = 'block'; return; }

      try {
        const { error } = await sb.auth.updateUser({ password: p1 });
        if (error) throw error;
        closeOverlay();
        cleanupUrl();
        alert('Heslo bylo změněno. Přihlašuju…');
        location.reload();
      } catch (e) {
        npErr.textContent = e.message || 'Změna hesla selhala.';
        npErr.style.display = 'block';
      }
    });

    // (Volitelně) stále funguje i případný starý #logoutBtn, pokud ho někde máš
    document.getElementById('logoutBtn')?.addEventListener('click', async () => {
      await sb.auth.signOut().catch(() => {});
      cleanupUrl();
      location.reload();
    });
  })();
})();
