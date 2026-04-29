(() => {
  const STORAGE_TOKEN = 'saros_auth_token';
  const STORAGE_USER = 'saros_auth_user';
  const API = 'http://localhost:8765';

  const root = document.createElement('div');
  root.id = 'auth-panel';
  root.innerHTML = `
    <div class="auth-head">
      <div>
        <div class="auth-title">Account</div>
        <div class="auth-sub" id="auth-sub">Login or create an account</div>
      </div>
      <span class="auth-badge" id="auth-badge">Guest</span>
    </div>
    <div class="auth-tabs">
      <button class="auth-tab active" data-tab="login">Login</button>
      <button class="auth-tab" data-tab="signup">Sign up</button>
    </div>
    <form id="auth-login" class="auth-form">
      <input class="auth-inp" name="identifier" placeholder="Username or email" autocomplete="username" required>
      <input class="auth-inp" name="password" type="password" placeholder="Password" autocomplete="current-password" required>
      <button class="auth-btn" type="submit">Login</button>
    </form>
    <form id="auth-signup" class="auth-form hidden">
      <input class="auth-inp" name="username" placeholder="Username" autocomplete="username" required>
      <input class="auth-inp" name="email" type="email" placeholder="Email" autocomplete="email" required>
      <input class="auth-inp" name="password" type="password" placeholder="Password" autocomplete="new-password" required>
      <button class="auth-btn" type="submit">Create account</button>
    </form>
    <div class="auth-user hidden" id="auth-userbox">
      <div class="auth-userline" id="auth-userline"></div>
      <button class="auth-btn ghost" id="auth-logout" type="button">Logout</button>
    </div>
    <div class="auth-msg" id="auth-msg"></div>
  `;
  document.body.appendChild(root);

  const style = document.createElement('style');
  style.textContent = `
    #auth-panel{
      position:fixed;top:64px;right:16px;z-index:500;
      width:290px;max-width:calc(100vw - 32px);
      background:rgba(11,18,32,.96);backdrop-filter:blur(14px);
      border:1px solid #263f60;border-radius:10px;
      box-shadow:0 14px 36px rgba(0,0,0,.35);
      padding:12px;color:#cee0f5;font-family:Inter,sans-serif;
    }
    .auth-head{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:10px}
    .auth-title{font-family:Rajdhani,sans-serif;font-size:18px;font-weight:700;letter-spacing:.04em}
    .auth-sub{font-size:11px;color:#6a8aad;margin-top:2px}
    .auth-badge{font-family:'Share Tech Mono',monospace;font-size:10px;color:#0fd18a;background:rgba(15,209,138,.12);border:1px solid rgba(15,209,138,.25);padding:4px 8px;border-radius:999px;white-space:nowrap}
    .auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
    .auth-tab,.auth-btn{border:none;border-radius:8px;padding:9px 10px;cursor:pointer;font-family:Rajdhani,sans-serif;font-weight:700;letter-spacing:.04em}
    .auth-tab{background:#101a2e;color:#6a8aad;border:1px solid #1c2f4a}
    .auth-tab.active{background:#f03a4a;color:#fff;border-color:#f03a4a}
    .auth-form{display:flex;flex-direction:column;gap:8px}
    .auth-inp{width:100%;padding:10px 11px;background:#06090f;border:1px solid #1c2f4a;border-radius:8px;color:#cee0f5;outline:none;font-family:Inter,sans-serif}
    .auth-inp:focus{border-color:#38bdf8}
    .auth-btn{background:#f03a4a;color:#fff;width:100%}
    .auth-btn.ghost{background:#101a2e;color:#cee0f5;border:1px solid #1c2f4a}
    .auth-user{display:flex;gap:8px;align-items:center}
    .auth-userline{font-size:12px;line-height:1.4;color:#cee0f5;flex:1;white-space:pre-line}
    .auth-msg{margin-top:8px;min-height:16px;font-size:11px;color:#6a8aad;line-height:1.4}
    .auth-msg.ok{color:#0fd18a}
    .auth-msg.err{color:#f03a4a}
    .hidden{display:none !important}
    #auth-panel{
      top:98px;right:28px;width:310px;
      background:rgba(255,255,255,.92);backdrop-filter:blur(18px);
      border:1px solid rgba(188,203,213,.76);border-radius:12px;
      box-shadow:0 18px 50px rgba(20,37,54,.14);
      color:#172331;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      padding:14px;
    }
    .auth-title{
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-size:15px;font-weight:900;letter-spacing:0;color:#172331;
    }
    .auth-sub{font-size:12px;color:#647585}
    .auth-badge{
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-size:11px;font-weight:900;color:#12a681;background:rgba(18,166,129,.10);
      border:1px solid rgba(18,166,129,.22);border-radius:999px;padding:5px 9px;
    }
    .auth-tabs{gap:8px}
    .auth-tab,.auth-btn{
      border-radius:8px;padding:10px 11px;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-weight:900;letter-spacing:0;transition:transform .18s,box-shadow .18s,border-color .18s,background .18s;
    }
    .auth-tab{background:#f4f8fb;color:#647585;border:1px solid #d8e3ea}
    .auth-tab.active{background:#df3f52;color:#fff;border-color:#df3f52;box-shadow:0 12px 26px rgba(223,63,82,.18)}
    .auth-form{gap:9px}
    .auth-inp{
      background:#fff;border:1px solid #cfdae3;border-radius:8px;color:#172331;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
      font-size:13px;padding:10px 11px;
    }
    .auth-inp:focus{border-color:#2674b8;box-shadow:0 0 0 4px rgba(38,116,184,.10)}
    .auth-btn{background:#df3f52;color:#fff;box-shadow:0 12px 26px rgba(223,63,82,.18)}
    .auth-btn:hover{transform:translateY(-1px);box-shadow:0 16px 34px rgba(223,63,82,.22)}
    .auth-btn.ghost{background:#fff;color:#263746;border:1px solid #cfdae3;box-shadow:none}
    .auth-userline{font-size:13px;color:#172331}
    .auth-msg{font-size:12px;color:#647585}
    .auth-msg.ok{color:#12a681}
    .auth-msg.err{color:#df3f52}
    @media (max-width:900px){
      #auth-panel{position:static;width:auto;max-width:none;margin:0 10px 10px}
    }
    #auth-panel{
      top:86px;right:24px;width:286px;
      background:rgba(252,254,253,.94);
      border-color:rgba(174,191,186,.78);
      border-radius:10px;
      box-shadow:0 18px 48px rgba(18,32,30,.14);
      color:#17201f;
      overflow:hidden;
      transition:width .18s ease,max-height .18s ease,box-shadow .18s ease;
    }
    #auth-panel:not(:hover):not(:focus-within){
      width:178px;
      max-height:48px;
      padding:10px 12px;
      box-shadow:0 10px 26px rgba(18,32,30,.10);
    }
    #auth-panel:not(:hover):not(:focus-within) .auth-head{margin-bottom:0}
    #auth-panel:not(:hover):not(:focus-within) .auth-sub,
    #auth-panel:not(:hover):not(:focus-within) .auth-tabs,
    #auth-panel:not(:hover):not(:focus-within) .auth-form,
    #auth-panel:not(:hover):not(:focus-within) .auth-user,
    #auth-panel:not(:hover):not(:focus-within) .auth-msg{
      display:none !important;
    }
    .auth-title{color:#17201f}
    .auth-sub{color:#657874}
    .auth-badge{color:#0b9275;background:rgba(11,146,117,.11);border-color:rgba(11,146,117,.24)}
    .auth-tab{background:#f1f6f3;color:#657874;border-color:#cbd9d3}
    .auth-tab.active{background:#df4255;color:#fff;border-color:#df4255;box-shadow:0 12px 26px rgba(223,66,85,.20)}
    .auth-inp{background:#fbfdfc;border-color:#c6d6d0;color:#17201f}
    .auth-inp:focus{border-color:#0b9275;box-shadow:0 0 0 4px rgba(11,146,117,.11)}
    .auth-btn{background:#df4255;box-shadow:0 12px 26px rgba(223,66,85,.20)}
    .auth-btn.ghost{background:#fbfdfc;color:#20302d;border-color:#c6d6d0}
    .auth-msg.ok{color:#0b9275}
    .auth-msg.err{color:#df4255}
    @media (min-width:761px) and (max-width:900px){
      #auth-panel{
        position:fixed;
        top:78px;
        right:16px;
        width:258px;
        transform:scale(.92);
        transform-origin:top right;
      }
    }
    @media (max-width:760px){
      #auth-panel{position:static;width:auto;max-width:none;margin:0 12px 12px;transform:none}
    }
  `;
  document.head.appendChild(style);

  const loginForm = document.getElementById('auth-login');
  const signupForm = document.getElementById('auth-signup');
  const tabs = Array.from(document.querySelectorAll('.auth-tab'));
  const msg = document.getElementById('auth-msg');
  const badge = document.getElementById('auth-badge');
  const sub = document.getElementById('auth-sub');
  const userBox = document.getElementById('auth-userbox');
  const userLine = document.getElementById('auth-userline');
  const logoutBtn = document.getElementById('auth-logout');

  function setMsg(text, type = '') {
    msg.textContent = text || '';
    msg.className = 'auth-msg' + (type ? ` ${type}` : '');
  }

  function getToken() {
    return localStorage.getItem(STORAGE_TOKEN) || '';
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_USER) || 'null');
    } catch {
      return null;
    }
  }

  function setAuth(user, token) {
    localStorage.setItem(STORAGE_TOKEN, token);
    localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem(STORAGE_TOKEN);
    localStorage.removeItem(STORAGE_USER);
  }

  async function api(path, body) {
    const res = await fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || data.error || `HTTP ${res.status}`);
    return data;
  }

  function renderAuth() {
    const user = getUser();
    if (user && user.username) {
      badge.textContent = 'Signed in';
      badge.style.color = '#0fd18a';
      badge.style.borderColor = 'rgba(15,209,138,.25)';
      sub.textContent = 'Your account is linked to the database';
      userBox.classList.remove('hidden');
      loginForm.classList.add('hidden');
      signupForm.classList.add('hidden');
      tabs.forEach(t => t.classList.remove('active'));
      userLine.textContent = `${user.username}\n${user.email || ''}`;
      setMsg('');
    } else {
      badge.textContent = 'Guest';
      badge.style.color = '#0fd18a';
      badge.style.borderColor = 'rgba(15,209,138,.25)';
      sub.textContent = 'Login or create an account';
      userBox.classList.add('hidden');
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === 'login'));
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const which = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      loginForm.classList.toggle('hidden', which !== 'login');
      signupForm.classList.toggle('hidden', which !== 'signup');
      setMsg('');
    });
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(loginForm);
    setMsg('Logging in…');
    try {
      const data = await api('/api/login', {
        identifier: String(fd.get('identifier') || '').trim(),
        password: String(fd.get('password') || '')
      });
      setAuth(data.user, data.token);
      renderAuth();
      setMsg(data.message || 'Login successful.', 'ok');
      loginForm.reset();
    } catch (err) {
      setMsg(err.message, 'err');
    }
  });

  signupForm.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(signupForm);
    setMsg('Creating account…');
    try {
      const data = await api('/api/signup', {
        username: String(fd.get('username') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        password: String(fd.get('password') || '')
      });
      setMsg(data.message || 'Account created. Now log in.', 'ok');
      signupForm.reset();
      tabs.find(t => t.dataset.tab === 'login')?.click();
    } catch (err) {
      setMsg(err.message, 'err');
    }
  });

  logoutBtn.addEventListener('click', async () => {
    const token = getToken();
    try {
      if (token) {
        await api('/api/logout', { token });
      }
    } catch {

    }
    clearAuth();
    renderAuth();
    setMsg('Logged out.', 'ok');
  });

  async function verifyExistingSession() {
    const token = getToken();
    if (!token) {
      renderAuth();
      return;
    }
    try {
      const data = await api('/api/me', { token });
      setAuth(data.user, token);
    } catch {
      clearAuth();
    }
    renderAuth();
  }

  verifyExistingSession();
})();
