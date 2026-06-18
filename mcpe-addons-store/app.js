/* ============================================================
   MCPE ADDONS STORE V2 – Main Application Logic
   Google Auth + Hamburger Menu + Real-time Data + 0 Initial Data
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────
const State = {
  user:            null,
  addons:          [],
  filteredAddons:  [],
  currentCategory: 'all',
  currentPlatform: 'all',
  searchQuery:     '',
  sort:            'recent',
  billing:         'monthly',
  page:            1,
  perPage:         10,
  currentAddon:    null,
  purchases:       [],
};

// Subidas de usuario en memoria (data URLs)
let _upImage = null, _upFile = null, _upFileName = null;
let _profAvatar = null, _profFrame = 'none';

// Palabras del buscador que corresponden a una categoría exacta
const SEARCH_CAT_KEYWORDS = {
  'addon':'addon','addons':'addon','add-on':'addon','add-ons':'addon',
  'mundo':'world','mundos':'world','world':'world','worlds':'world',
  'skin':'skin','skins':'skin',
  'textura':'texture','texturas':'texture','texture':'texture','textures':'texture','pack':'texture',
  'mapa':'map','mapas':'map','map':'map','maps':'map',
  'mod':'mod','mods':'mod',
  'plugin':'plugin','plugins':'plugin',
  'shader':'shader','shaders':'shader'
};

// ─── DOM Ready ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLoadingScreen();
  initParticles();
  initNavbar();
  initSheetDrag();
  initGoogleAuth();
  initScrollReveal();
  initTypingEffect();
  loadAddons();
  updateStats();
  restoreSession();
  listenRealtime();
  renderPlans();
  populateUploadTypes();
});

/* ============================================================
   LOADING SCREEN
   ============================================================ */
function initLoadingScreen() {
  const fill = document.getElementById('loading-bar-fill');
  let progress = 0;
  const iv = setInterval(() => {
    progress += Math.random() * 18;
    if (progress >= 100) {
      progress = 100;
      clearInterval(iv);
      setTimeout(() => {
        document.getElementById('loading-screen').classList.add('hidden');
      }, 300);
    }
    fill.style.width = progress + '%';
  }, 120);
}

/* ============================================================
   PARTICLES CANVAS
   ============================================================ */
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles = [];

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const COLORS = ['#00d4ff', '#7c3aed', '#a78bfa', '#f59e0b', '#10b981'];

  class Particle {
    constructor() { this.reset(true); }
    reset(init = false) {
      this.x    = Math.random() * W;
      this.y    = init ? Math.random() * H : H + 10;
      this.size = Math.random() * 2 + 0.5;
      this.speedY = -(Math.random() * 0.4 + 0.1);
      this.speedX =  (Math.random() - 0.5) * 0.2;
      this.alpha  = Math.random() * 0.5 + 0.1;
      this.color  = COLORS[Math.floor(Math.random() * COLORS.length)];
    }
    update() {
      this.x += this.speedX;
      this.y += this.speedY;
      if (this.y < -20) this.reset();
    }
    draw() {
      ctx.globalAlpha = this.alpha;
      ctx.fillStyle   = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  for (let i = 0; i < 80; i++) particles.push(new Particle());

  function animate() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    ctx.globalAlpha = 1;
    requestAnimationFrame(animate);
  }
  animate();
}

/* ============================================================
   NAVBAR (scroll behavior)
   ============================================================ */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 40);
    // Highlight active nav link
    const sections = ['hero','addons','featured','pricing','contact'];
    let current = '';
    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && window.scrollY >= el.offsetTop - 100) current = id;
    });
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active', l.getAttribute('href') === '#' + current);
    });
  });
}

/* ============================================================
   HAMBURGER MENU
   ============================================================ */
function toggleHamburger() {
  // Compatibilidad: ahora el menú móvil es el bottom sheet
  if (typeof openSheet === 'function') { openSheet(); return; }
}

function closeHamburger() {
  ['hamburger-btn', 'nav-menu', 'mobile-menu-overlay'].forEach(id => {
    const e = document.getElementById(id); if (e) e.classList.remove('open');
  });
  document.body.style.overflow = '';
}

/* ============================================================
   MENÚ MÓVIL v6.0 — Bottom sheet deslizable y profesional
   ============================================================ */
function renderSheet() {
  const body = document.getElementById('msheet-body');
  if (!body) return;
  const u = State.user;

  const links = `
    <nav class="msheet-links">
      <a href="#hero" onclick="closeSheet()"><i class="fas fa-house"></i> Inicio</a>
      <a href="#addons" onclick="closeSheet()"><i class="fas fa-puzzle-piece"></i> Add-ons</a>
      <a href="#featured" onclick="closeSheet()"><i class="fas fa-fire"></i> Destacados</a>
      <a href="#pricing" onclick="closeSheet()"><i class="fas fa-crown"></i> Planes</a>
      <a href="#" onclick="closeSheet();openCart();return false"><i class="fas fa-cart-shopping"></i> Carrito</a>
      <a href="#contact" onclick="closeSheet()"><i class="fas fa-envelope"></i> Contacto</a>
      <a href="admin.html" class="msheet-admin"><i class="fas fa-user-shield"></i> Panel Admin</a>
    </nav>`;

  let userSection;
  if (u) {
    userSection = `
      <div class="msheet-user">
        <img class="msheet-avatar ${frameClass(u.frame)}" src="${escHtml(userAvatar(u))}" alt="" onerror="this.style.opacity=0" />
        <div class="msheet-user-info">
          <strong>${escHtml(userDisplayName(u))}</strong>
          <small>${escHtml(u.email || '')}</small>
        </div>
      </div>
      <div class="msheet-actions">
        <button class="btn btn-primary btn-full" onclick="closeSheet();openUploadModal()"><i class="fas fa-cloud-arrow-up"></i> Subir Add-on</button>
        <button class="btn btn-outline btn-full" onclick="closeSheet();openProfileModal()"><i class="fas fa-id-badge"></i> Mi Perfil</button>
        <button class="btn btn-outline btn-full" onclick="closeSheet();openPurchasesModal()"><i class="fas fa-box"></i> Mis Compras</button>
        <button class="btn btn-ghost btn-full logout-link" onclick="closeSheet();logout()"><i class="fas fa-sign-out-alt"></i> Cerrar sesión</button>
      </div>`;
  } else {
    userSection = `
      <div class="msheet-actions">
        <button class="btn btn-primary btn-full btn-glow" onclick="closeSheet();openAuthModal('login')"><i class="fab fa-google"></i> Iniciar sesión con Google</button>
      </div>`;
  }

  body.innerHTML = links + '<div class="msheet-divider"></div>' + userSection;
}

function openSheet() {
  renderSheet();
  const sheet = document.getElementById('msheet');
  const bd = document.getElementById('sheet-backdrop');
  if (!sheet) return;
  sheet.style.transform = '';
  sheet.classList.add('open');
  bd.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  const sheet = document.getElementById('msheet');
  const bd = document.getElementById('sheet-backdrop');
  if (!sheet) return;
  sheet.classList.remove('open');
  bd.classList.remove('open');
  sheet.style.transform = '';
  document.body.style.overflow = '';
}

function initSheetDrag() {
  const sheet = document.getElementById('msheet');
  const grip  = document.getElementById('msheet-grip');
  const body  = document.getElementById('msheet-body');
  if (!sheet) return;

  let sy = 0, dy = 0, dragging = false, fromGrip = false;

  function start(y, isGrip) {
    sy = y; dy = 0; dragging = true; fromGrip = !!isGrip;
    sheet.style.transition = 'none';
  }
  function move(y) {
    if (!dragging) return;
    dy = y - sy;
    const atTop = !body || body.scrollTop <= 0;
    // Solo se cierra arrastrando hacia abajo (desde el grip, o desde arriba del contenido)
    if (dy > 0 && (fromGrip || atTop)) {
      sheet.style.transform = `translateY(${dy}px)`;
    } else if (dy < 0) {
      sheet.style.transform = '';
    }
  }
  function end() {
    if (!dragging) return;
    dragging = false;
    sheet.style.transition = '';
    if (dy > 110) closeSheet();
    else sheet.style.transform = '';
  }

  // Touch (móvil)
  sheet.addEventListener('touchstart', e => start(e.touches[0].clientY, e.target === grip), { passive: true });
  sheet.addEventListener('touchmove',  e => move(e.touches[0].clientY), { passive: true });
  sheet.addEventListener('touchend', end);
  sheet.addEventListener('touchcancel', end);

  // Mouse en el grip (para escritorio/pruebas)
  grip.addEventListener('mousedown', e => {
    start(e.clientY, true); e.preventDefault();
    const mm = ev => move(ev.clientY);
    const mu = () => { end(); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); };
    document.addEventListener('mousemove', mm);
    document.addEventListener('mouseup', mu);
  });

  // Cerrar con tecla Escape
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
}

/* ============================================================
   USER DROPDOWN (Desktop)
   ============================================================ */
function toggleUserDropdown() {
  const dd  = document.getElementById('user-dropdown');
  const btn = document.querySelector('.user-avatar-btn');
  dd.classList.toggle('open');
  btn.classList.toggle('open');
}

document.addEventListener('click', e => {
  if (!e.target.closest('.user-avatar-btn') && !e.target.closest('.user-dropdown')) {
    document.getElementById('user-dropdown')?.classList.remove('open');
    document.querySelector('.user-avatar-btn')?.classList.remove('open');
  }
  if (!e.target.closest('.search-input-wrap') && !e.target.closest('.search-suggest')) {
    document.getElementById('search-suggest')?.classList.remove('open');
  }
});

/* ============================================================
   TYPING EFFECT
   ============================================================ */
function initTypingEffect() {
  const words = [
    'los mejores add-ons', 'las mejores skins', 'los mejores mundos',
    'las mejores texturas', 'los mejores mapas', 'los mejores mods', 'los mejores plugins'
  ];
  const el    = document.getElementById('typing-text');
  if (!el) return;
  let wi = 0, ci = 0, deleting = false;

  function tick() {
    const word = words[wi];
    if (deleting) {
      el.textContent = word.substring(0, ci--);
      if (ci < 0) { deleting = false; wi = (wi + 1) % words.length; setTimeout(tick, 400); return; }
    } else {
      el.textContent = word.substring(0, ci++);
      if (ci > word.length) { deleting = true; setTimeout(tick, 1800); return; }
    }
    setTimeout(tick, deleting ? 60 : 110);
  }
  tick();
}

/* ============================================================
   SCROLL REVEAL
   ============================================================ */
function initScrollReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.1 });

  document.querySelectorAll('.section-header, .feature-item, .pricing-card').forEach(el => {
    el.classList.add('reveal');
    obs.observe(el);
  });
}

/* ============================================================
   STATS (Real values from DB - starts at 0)
   ============================================================ */
function updateStats() {
  const all     = DB.get(DB_KEYS.ADDONS);
  const addons  = all.filter(a => a.status !== 'pending' && a.status !== 'rejected');
  const users   = DB.get(DB_KEYS.USERS);
  const totalDl = addons.reduce((s, a) => s + (a.downloads || 0), 0);

  document.getElementById('stat-addons').textContent    = addons.length;
  document.getElementById('stat-users').textContent     = users.length;
  document.getElementById('stat-downloads').textContent = totalDl;
}

/* ============================================================
   GOOGLE AUTH
   ============================================================ */
function initGoogleAuth() {
  if (typeof google === 'undefined') {
    setTimeout(initGoogleAuth, 500);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback:  handleGoogleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  google.accounts.id.renderButton(
    document.getElementById('google-signin-btn'),
    {
      theme:   'filled_black',
      size:    'large',
      shape:   'pill',
      text:    'signin_with',
      width:   280,
    }
  );
}

function handleGoogleCredential(response) {
  try {
    const payload = parseJwt(response.credential);
    const user = {
      id:      payload.sub,
      name:    payload.name,
      email:   payload.email,
      avatar:  payload.picture,
      token:   response.credential,
      loginAt: Date.now(),
    };
    loginUser(user);
  } catch (err) {
    showToast('Error al iniciar sesión. Intenta de nuevo.', 'error');
    console.error(err);
  }
}

function parseJwt(token) {
  const base64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(atob(base64));
}

function loginUser(user) {
  // Conservar datos de perfil existentes (plan, marco, país, bio, etc.)
  const users = DB.get(DB_KEYS.USERS);
  const idx   = users.findIndex(u => u.id === user.id);
  const existing = idx !== -1 ? users[idx] : {};
  const merged = { ...existing, ...user };
  merged.plan        = existing.plan        || 'free';
  merged.frame       = existing.frame       || 'none';
  merged.country     = existing.country     || '';
  merged.bio         = existing.bio         || '';
  if (existing.displayName)  merged.displayName  = existing.displayName;
  if (existing.customAvatar) merged.customAvatar = existing.customAvatar;

  State.user = merged;
  localStorage.setItem('mcpe_current_user', JSON.stringify(merged));

  if (idx === -1) users.push(merged); else users[idx] = merged;
  DB.set(DB_KEYS.USERS, users);

  updateAuthUI(merged);
  closeModal('auth-modal');
  showToast(`¡Bienvenido, ${userDisplayName(merged)}!`, 'success');
  loadPurchases();
  updateStats();
  renderPlans();
  try { window.dispatchEvent(new CustomEvent('mcpe-auth-changed')); } catch (e) {}
}

function restoreSession() {
  try {
    const saved = localStorage.getItem('mcpe_current_user');
    if (saved) {
      const user = JSON.parse(saved);
      if (Date.now() - user.loginAt < 7 * 24 * 3600 * 1000) {
        State.user = user;
        updateAuthUI(user);
        loadPurchases();
      } else {
        localStorage.removeItem('mcpe_current_user');
      }
    }
  } catch { localStorage.removeItem('mcpe_current_user'); }
}

function updateAuthUI(user) {
  const av = userAvatar(user), dname = userDisplayName(user), fcls = frameClass(user.frame);
  const hide = id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  const show = (id, d) => { const e = document.getElementById(id); if (e) e.style.display = d; };
  const txt  = (id, t) => { const e = document.getElementById(id); if (e) e.textContent = t; };
  const img  = (id, src, cls) => { const e = document.getElementById(id); if (e) { e.src = src; if (cls != null) e.className = cls; } };

  hide('logged-out-btns'); show('logged-in-btns', 'block');
  img('menu-user-avatar', av, 'user-avatar-small ' + fcls);
  txt('menu-user-name', dname); txt('menu-user-email', user.email);

  hide('desktop-logged-out'); show('desktop-logged-in', 'flex');
  img('nav-user-avatar', av, 'user-avatar-small ' + fcls);
  txt('nav-user-name', dname.split(' ')[0]);
  img('dropdown-avatar', av, fcls);
  txt('dropdown-name', dname); txt('dropdown-email', user.email);
}

function logout() {
  State.user = null;
  localStorage.removeItem('mcpe_current_user');
  const show = (id, d) => { const e = document.getElementById(id); if (e) e.style.display = d; };
  const hide = id => { const e = document.getElementById(id); if (e) e.style.display = 'none'; };
  show('logged-out-btns', 'block'); hide('logged-in-btns');
  show('desktop-logged-out', 'block'); hide('desktop-logged-in');
  const dd = document.getElementById('user-dropdown'); if (dd) dd.classList.remove('open');

  if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
  showToast('Sesión cerrada correctamente', 'info');
  renderPlans();
  try { window.dispatchEvent(new CustomEvent('mcpe-auth-changed')); } catch (e) {}
}

/* ============================================================
   MODALS
   ============================================================ */
function openModal(id) {
  document.getElementById(id)?.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove('open');
  document.body.style.overflow = '';
}

window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => {
      m.classList.remove('open');
      document.body.style.overflow = '';
    });
  }
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }
  });
});

function openAuthModal(mode = 'login') {
  openModal('auth-modal');
  switchAuthTab(mode === 'register' ? 'register' : 'login');
}

/* ============================================================
   AUTENTICACIÓN POR CORREO (Firebase Auth) + recuperación
   ============================================================ */
function switchAuthTab(mode) {
  authMsg('');
  const loginF = document.getElementById('auth-login-form');
  const regF   = document.getElementById('auth-register-form');
  const recF   = document.getElementById('auth-recover-form');
  const tabL   = document.getElementById('tab-login');
  const tabR   = document.getElementById('tab-register');
  const tabs   = document.getElementById('auth-tabs');
  const title  = document.getElementById('auth-modal-title');
  const sub    = document.getElementById('auth-modal-subtitle');
  [loginF, regF, recF].forEach(f => { if (f) f.style.display = 'none'; });
  tabL && tabL.classList.remove('active');
  tabR && tabR.classList.remove('active');
  if (tabs) tabs.style.display = (mode === 'recover') ? 'none' : 'flex';

  if (mode === 'register') {
    if (regF) regF.style.display = 'flex';
    tabR && tabR.classList.add('active');
    if (title) title.textContent = 'Crear cuenta';
    if (sub) sub.textContent = 'Únete a la comunidad de MCPE';
  } else if (mode === 'recover') {
    if (recF) recF.style.display = 'flex';
    if (title) title.textContent = 'Recuperar cuenta';
    if (sub) sub.textContent = 'Restablece tu contraseña por correo';
  } else {
    if (loginF) loginF.style.display = 'flex';
    tabL && tabL.classList.add('active');
    if (title) title.textContent = 'Bienvenido';
    if (sub) sub.textContent = 'Inicia sesión o crea tu cuenta';
  }
}

function togglePass(id, btn) {
  const inp = document.getElementById(id);
  if (!inp) return;
  const icon = btn.querySelector('i');
  if (inp.type === 'password') { inp.type = 'text'; if (icon) icon.className = 'fas fa-eye-slash'; }
  else { inp.type = 'password'; if (icon) icon.className = 'fas fa-eye'; }
}

function authAvatar(name) {
  const n = encodeURIComponent(((name || 'U').trim()) || 'U');
  return `https://ui-avatars.com/api/?name=${n}&background=00d4ff&color=041018&bold=true&size=128`;
}

function authErrorMsg(err) {
  const c = (err && err.code) || '';
  const map = {
    'auth/invalid-email': 'Correo electrónico inválido.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/wrong-password': 'Contraseña incorrecta.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/email-already-in-use': 'Ese correo ya está registrado. Inicia sesión.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un momento.',
    'auth/operation-not-allowed': 'El acceso por correo no está habilitado. Actívalo en Firebase → Authentication → Email/Password.',
    'auth/configuration-not-found': 'Firebase Authentication no está activado. Entra a Firebase → Authentication → "Comenzar" y habilita Email/Password.',
    'auth/admin-restricted-operation': 'Operación restringida. Activa Email/Password en Firebase → Authentication.',
    'auth/network-request-failed': 'Error de red. Revisa tu conexión.'
  };
  return map[c] || ('Error: ' + (err && err.message ? err.message : (c || 'desconocido')));
}

function ensureAuth() {
  if (!window.fbAuth) {
    showToast('El acceso por correo requiere Firebase Auth. Por ahora usa Google, o habilita Email/Password en Firebase.', 'warning', 7000);
    return false;
  }
  return true;
}

/* --- Detalles UX: mensajes, carga, fuerza de contraseña --- */
function authMsg(text, type) {
  const el = document.getElementById('auth-msg');
  if (!el) return;
  if (!text) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const ic = type === 'error' ? 'circle-exclamation' : (type === 'success' ? 'circle-check' : 'circle-info');
  el.className = 'auth-msg ' + (type || 'info');
  el.innerHTML = `<i class="fas fa-${ic}"></i> <span>${text}</span>`;
  el.style.display = 'flex';
}

function setAuthLoading(btnId, loading, label) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) {
    btn.dataset.html = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label || 'Procesando…'}`;
  } else {
    btn.disabled = false;
    if (btn.dataset.html) btn.innerHTML = btn.dataset.html;
  }
}

function passScore(p) {
  let s = 0; if (!p) return 0;
  if (p.length >= 6) s++;
  if (p.length >= 10) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
function updatePassStrength() {
  const p = (document.getElementById('reg-pass') || {}).value || '';
  const bar = document.getElementById('pass-strength-bar');
  const txt = document.getElementById('pass-strength-text');
  const score = passScore(p);
  const pct = [0, 30, 55, 80, 100][score];
  const colors = ['#ef4444', '#ef4444', '#f59e0b', '#00d4ff', '#10b981'];
  const labels = ['', 'Débil', 'Media', 'Buena', 'Fuerte'];
  if (bar) { bar.style.width = pct + '%'; bar.style.background = colors[score]; }
  if (txt) { txt.textContent = p ? ('Seguridad: ' + labels[score]) : ''; txt.style.color = colors[score]; }
}
function checkPassMatch() {
  const p  = (document.getElementById('reg-pass') || {}).value || '';
  const p2 = (document.getElementById('reg-pass2') || {}).value || '';
  const ic = document.getElementById('reg-match-ic');
  if (ic) ic.style.display = (p2 && p === p2) ? 'block' : 'none';
}
function checkRegEmail() {
  const v = (document.getElementById('reg-email') || {}).value || '';
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
  const ic = document.getElementById('reg-email-ok');
  if (ic) ic.style.display = ok ? 'block' : 'none';
}

function loginEmail(e) {
  if (e && e.preventDefault) e.preventDefault();
  authMsg('');
  if (!ensureAuth()) return;
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;
  setAuthLoading('login-submit-btn', true, 'Entrando…');
  window.fbAuth.signInWithEmailAndPassword(email, pass)
    .then(cred => {
      const fu = cred.user;
      loginUser({ id: fu.uid, name: fu.displayName || email.split('@')[0], email: fu.email || email, avatar: fu.photoURL || authAvatar(fu.displayName || email), loginAt: Date.now(), authProvider: 'email' });
    })
    .catch(err => authMsg(authErrorMsg(err), 'error'))
    .finally(() => setAuthLoading('login-submit-btn', false));
}

function registerEmail(e) {
  if (e && e.preventDefault) e.preventDefault();
  authMsg('');
  if (!ensureAuth()) return;
  const name  = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;
  const pass2 = document.getElementById('reg-pass2').value;
  if (!name) { authMsg('Escribe tu nombre.', 'error'); return; }
  if (pass !== pass2) { authMsg('Las contraseñas no coinciden.', 'error'); return; }
  if (pass.length < 6) { authMsg('La contraseña debe tener al menos 6 caracteres.', 'error'); return; }
  setAuthLoading('reg-submit-btn', true, 'Creando cuenta…');
  window.fbAuth.createUserWithEmailAndPassword(email, pass)
    .then(cred => {
      const fu = cred.user;
      return fu.updateProfile({ displayName: name, photoURL: authAvatar(name) }).catch(() => {}).then(() => {
        loginUser({ id: fu.uid, name: name, email: fu.email || email, avatar: authAvatar(name), loginAt: Date.now(), authProvider: 'email' });
        showToast('¡Cuenta creada con éxito! Bienvenido.', 'success');
        sendWelcomeEmail(name, email);
      });
    })
    .catch(err => authMsg(authErrorMsg(err), 'error'))
    .finally(() => setAuthLoading('reg-submit-btn', false));
}

/* ============================================================
   EMAILJS — correos con diseño propio (bienvenida / contacto)
   ============================================================ */
function sendWelcomeEmail(name, email) {
  if (!window.EMAILJS_READY || typeof emailjs === 'undefined') return;
  emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateWelcome, {
    to_name:  name,
    to_email: email,
    from_name: 'MCPE Addons Store',
    message:  '¡Tu cuenta fue creada con éxito! Ya puedes descargar y subir add-ons.'
  }).then(
    () => console.log('[MCPE Store] Correo de bienvenida enviado.'),
    (err) => console.warn('[MCPE Store] No se pudo enviar el correo de bienvenida:', err)
  );
}

function subscribeNewsletter() {
  const input = document.getElementById('newsletter-email');
  const email = (input && input.value.trim()) || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showToast('Escribe un correo válido.', 'error');
    return;
  }
  if (!window.EMAILJS_READY || typeof emailjs === 'undefined') {
    showToast('¡Gracias por suscribirte! (Configura EmailJS para recibir correos reales.)', 'info', 6000);
    if (input) input.value = '';
    return;
  }
  emailjs.send(EMAILJS_CONFIG.serviceId, EMAILJS_CONFIG.templateContact, {
    to_name:  'Suscriptor',
    to_email: email,
    from_name: 'MCPE Addons Store',
    message:  'Te has suscrito para recibir novedades de MCPE Addons Store.'
  }).then(
    () => { showToast('¡Suscripción confirmada! Revisa tu correo.', 'success'); if (input) input.value = ''; },
    (err) => { console.warn(err); showToast('No se pudo enviar. Intenta más tarde.', 'error'); }
  );
}

function recoverPassword(e) {
  if (e && e.preventDefault) e.preventDefault();
  authMsg('');
  if (!ensureAuth()) return;
  const email = document.getElementById('rec-email').value.trim();
  setAuthLoading('rec-submit-btn', true, 'Enviando…');
  window.fbAuth.sendPasswordResetEmail(email)
    .then(() => {
      authMsg('Listo. Revisa tu correo (y la carpeta de spam) para restablecer tu contraseña.', 'success');
      showToast('Correo de recuperación enviado.', 'success', 6000);
    })
    .catch(err => authMsg(authErrorMsg(err), 'error'))
    .finally(() => setAuthLoading('rec-submit-btn', false));
}

function openPurchasesModal() {
  document.getElementById('user-dropdown')?.classList.remove('open');
  renderPurchases();
  openModal('purchases-modal');
}

/* ============================================================
   LOAD ADDONS (Real-time from localStorage - starts empty)
   ============================================================ */
function loadAddons() {
  const addons = DB.get(DB_KEYS.ADDONS);
  State.addons = addons;
  applyFilters();
}

function listenRealtime() {
  window.addEventListener('db-updated', e => {
    if (e.detail.key === DB_KEYS.ADDONS) {
      State.addons = e.detail.data;
      applyFilters();
      updateStats();
    }
  });
  // Poll every 3s for cross-tab updates
  setInterval(() => {
    const fresh = DB.get(DB_KEYS.ADDONS);
    if (JSON.stringify(fresh) !== JSON.stringify(State.addons)) {
      State.addons = fresh;
      applyFilters();
      updateStats();
    }
  }, 3000);
}

function applyFilters() {
  // Solo se muestran add-ons aprobados (los pendientes/rechazados se ocultan).
  // Los add-ons sin estado (legacy o del admin) se consideran visibles.
  let list = State.addons.filter(a => a.status !== 'pending' && a.status !== 'rejected');

  // Platform filter
  if (State.currentPlatform !== 'all') {
    list = list.filter(a => (a.platform || 'bedrock') === State.currentPlatform);
  }

  // Category / content-type filter
  const cat = State.currentCategory;
  if (cat === 'free')         list = list.filter(a => a.price == 0 || a.price === '0');
  else if (cat === 'premium') list = list.filter(a => parseFloat(a.price) > 0);
  else if (cat !== 'all')     list = list.filter(a => (a.contentType || a.category || 'addon') === cat);

  // Search filter (vinculado a categorías: "mundo" => solo mundos, "skins" => solo skins, etc.)
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase().trim();
    const catKeyword = SEARCH_CAT_KEYWORDS[q];
    if (catKeyword) {
      list = list.filter(a => (a.contentType || a.category || 'addon') === catKeyword);
    } else {
      list = list.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.authorName || '').toLowerCase().includes(q)
      );
    }
  }

  State.filteredAddons = list;
  sortFilteredAddons();
  State.page = 1;
  renderAddons();
  renderFeatured();
}

function sortFilteredAddons() {
  const s = State.sort || 'recent';
  const list = State.filteredAddons;
  const price = a => parseFloat(a.price) || 0;
  if (s === 'recent')        list.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  else if (s === 'downloads') list.sort((a, b) => (b.downloads || 0) - (a.downloads || 0));
  else if (s === 'name')      list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  else if (s === 'price-low') list.sort((a, b) => price(a) - price(b));
  else if (s === 'price-high')list.sort((a, b) => price(b) - price(a));
}

function setSort(val) {
  State.sort = val;
  applyFilters();
}

function setPlatform(p, btn) {
  State.currentPlatform = p;
  document.querySelectorAll('.ptab').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else syncFilterUI();
  applyFilters();
}

// Sincroniza el estado visual de chips y pestañas con el State
function syncFilterUI() {
  document.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.dataset.cat === State.currentCategory));
  document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.platform === State.currentPlatform));
}

// Acceso rápido desde el inicio: muestra exactamente esa categoría
function heroCategory(cat) {
  const javaOnly = ['mod', 'plugin'].includes(cat);
  State.currentPlatform = javaOnly ? 'java' : 'all';
  State.currentCategory = cat;
  syncFilterUI();
  applyFilters();
  const target = document.getElementById('addons');
  if (target) target.scrollIntoView({ behavior: 'smooth' });
}

function setCategory(cat, btn) {
  State.currentCategory = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  else syncFilterUI();
  applyFilters();
}

function filterAddons() {
  State.searchQuery = document.getElementById('search-input').value.trim();
  const clr = document.getElementById('search-clear');
  if (clr) clr.style.display = State.searchQuery ? 'flex' : 'none';
  updateSuggestions();
  applyFilters();
}

function clearSearch() {
  const inp = document.getElementById('search-input');
  if (inp) inp.value = '';
  State.searchQuery = '';
  const clr = document.getElementById('search-clear');
  if (clr) clr.style.display = 'none';
  const box = document.getElementById('search-suggest');
  if (box) box.classList.remove('open');
  applyFilters();
}

/* Sugerencias en vivo (autocompletado de nombres) */
function updateSuggestions() {
  const box = document.getElementById('search-suggest');
  if (!box) return;
  const q = (State.searchQuery || '').toLowerCase().trim();
  if (!q) { box.classList.remove('open'); box.innerHTML = ''; return; }
  const pool = State.addons.filter(a => a.status !== 'pending' && a.status !== 'rejected');
  const catKeyword = SEARCH_CAT_KEYWORDS[q];
  const matches = (catKeyword
    ? pool.filter(a => (a.contentType || a.category) === catKeyword)
    : pool.filter(a =>
        a.name.toLowerCase().includes(q) ||
        (a.contentType || '').toLowerCase().includes(q))
  ).slice(0, 6);
  if (!matches.length) { box.classList.remove('open'); box.innerHTML = ''; return; }
  box.innerHTML = matches.map(a => `
    <button type="button" class="suggest-item" onclick="pickSuggest('${a.id}')">
      <span class="suggest-ic">${a.image ? `<img src="${escHtml(a.image)}" alt="" onerror="this.outerHTML='&#9638;'">` : '<i class="fas fa-cube"></i>'}</span>
      <span class="suggest-info"><strong>${escHtml(a.name)}</strong><small>${escHtml(typeName(a.contentType || a.category) || 'Add-on')}</small></span>
      <i class="fas fa-arrow-right suggest-go"></i>
    </button>`).join('');
  box.classList.add('open');
}

function pickSuggest(id) {
  const box = document.getElementById('search-suggest');
  if (box) box.classList.remove('open');
  openAddonDetail(id);
}

/* ============================================================
   RENDER ADDONS GRID
   ============================================================ */
function renderAddons() {
  const grid  = document.getElementById('addons-grid');
  const empty = document.getElementById('empty-state');
  const total = State.filteredAddons.length;
  const totalPages = Math.max(1, Math.ceil(total / State.perPage));
  if (State.page > totalPages) State.page = totalPages;

  const rc = document.getElementById('results-count');
  if (rc) rc.textContent = total === 0 ? '' : `${total} resultado${total !== 1 ? 's' : ''}`;

  if (total === 0) {
    if (empty) empty.style.display = 'block';
    grid.innerHTML = '';
    if (empty) grid.appendChild(empty);
    renderPagination(0);
    return;
  }

  if (empty) empty.style.display = 'none';
  grid.innerHTML = '';
  const start = (State.page - 1) * State.perPage;
  const visible = State.filteredAddons.slice(start, start + State.perPage);
  visible.forEach((addon, i) => grid.appendChild(buildAddonCard(addon, i)));
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  const wrap = document.getElementById('pagination');
  if (!wrap) return;
  if (totalPages <= 1) { wrap.innerHTML = ''; wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  const p = State.page;
  let html = `<button class="pg-btn pg-nav" ${p <= 1 ? 'disabled' : ''} onclick="goToPage(${p - 1})" aria-label="Anterior"><i class="fas fa-chevron-left"></i></button>`;
  let nums = [];
  for (let i = 1; i <= totalPages; i++) nums.push(i);
  if (totalPages > 7) {
    const keep = new Set([1, 2, totalPages - 1, totalPages, p - 1, p, p + 1]);
    nums = nums.filter(i => keep.has(i));
  }
  let last = 0;
  nums.forEach(i => {
    if (i - last > 1) html += `<span class="pg-dots">…</span>`;
    html += `<button class="pg-btn ${i === p ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    last = i;
  });
  html += `<button class="pg-btn pg-nav" ${p >= totalPages ? 'disabled' : ''} onclick="goToPage(${p + 1})" aria-label="Siguiente"><i class="fas fa-chevron-right"></i></button>`;
  wrap.innerHTML = html;
}

function goToPage(n) {
  const total = State.filteredAddons.length;
  const totalPages = Math.max(1, Math.ceil(total / State.perPage));
  State.page = Math.min(Math.max(1, n), totalPages);
  renderAddons();
  const sec = document.getElementById('addons');
  if (sec) sec.scrollIntoView({ behavior: 'smooth' });
}

function loadMore() { goToPage(State.page + 1); }

function buildAddonCard(addon, index) {
  const el   = document.createElement('div');
  el.className = 'addon-card';
  el.style.animationDelay = `${index * 0.05}s`;

  const isFree    = !addon.price || parseFloat(addon.price) === 0;
  const price     = isFree ? 'Gratis' : `$${parseFloat(addon.price).toFixed(2)}`;
  const priceClass = isFree ? 'free' : 'premium';

  el.innerHTML = `
    ${addon.image
      ? `<img class="addon-card-img" src="${escHtml(addon.image)}" alt="${escHtml(addon.name)}" loading="lazy" onerror="this.outerHTML='<div class=addon-card-img-placeholder>&#9638;</div>'" />`
      : `<div class="addon-card-img-placeholder">${addon.emoji ? escHtml(addon.emoji) : '<i class=\"fas fa-cube\"></i>'}</div>`
    }
    <div class="addon-card-body">
      <div class="addon-card-badges">
        <span class="badge ${isFree ? 'badge-free' : 'badge-premium'}">${isFree ? '<i class="fas fa-gift"></i> Gratis' : '<i class="fas fa-crown"></i> Premium'}</span>
        ${addon.platform ? `<span class="badge badge-platform"><i class="fas ${addon.platform === 'java' ? 'fa-desktop' : 'fa-mobile-screen-button'}"></i> ${platformShort(addon.platform)}</span>` : ''}
        ${(addon.contentType || addon.category) ? `<span class="badge badge-category">${escHtml(typeName(addon.contentType || addon.category))}</span>` : ''}
        ${addon.isNew     ? '<span class="badge badge-new"><i class="fas fa-certificate"></i> Nuevo</span>' : ''}
        ${addon.isFeatured? '<span class="badge badge-hot"><i class="fas fa-fire"></i> Top</span>'  : ''}
      </div>
      <h3 class="addon-card-title">${escHtml(addon.name)}</h3>
      <p class="addon-card-desc">${escHtml(addon.description || 'Sin descripción disponible.')}</p>
      ${addon.authorName ? `<div class="addon-card-author"><i class="fas fa-user"></i> ${escHtml(addon.authorName)}</div>` : ''}
      <div class="addon-card-meta">
        <span class="addon-card-price ${priceClass}">${price}</span>
        <span class="addon-card-downloads">
          <i class="fas fa-download"></i> ${(addon.downloads || 0).toLocaleString()}
        </span>
      </div>
    </div>
    <div class="addon-card-actions">
      <button class="btn btn-outline btn-sm" onclick="openAddonDetail('${addon.id}')">
        <i class="fas fa-info-circle"></i> Detalles
      </button>
      ${isFree
        ? `<button class="btn btn-success btn-sm" onclick="downloadAddon(event,'${addon.id}')">
             <i class="fas fa-download"></i> Descargar
           </button>`
        : `<button class="btn btn-gold btn-sm" onclick="openAddonDetail('${addon.id}')">
             <i class="fas fa-crown"></i> Comprar
           </button>
           <button class="btn btn-cart btn-sm" onclick="cartAdd('${addon.id}')" title="Agregar al carrito" aria-label="Agregar al carrito">
             <i class="fas fa-cart-plus"></i>
           </button>`
      }
    </div>
  `;
  return el;
}

/* ============================================================
   RENDER FEATURED (slider rotativo continuo)
   ============================================================ */
function renderFeatured() {
  const container = document.getElementById('featured-slider');
  const featured  = State.addons.filter(a => a.isFeatured && a.status !== 'pending' && a.status !== 'rejected');

  if (featured.length === 0) {
    container.className = 'featured-slider';
    container.innerHTML = `
      <div class="no-featured">
        <i class="fas fa-star"></i>
        <p>Los add-ons destacados aparecerán aquí</p>
      </div>`;
    return;
  }

  function featuredCardHTML(addon) {
    const isFree = !addon.price || parseFloat(addon.price) === 0;
    return `
      <div class="featured-card" onclick="openAddonDetail('${addon.id}')">
        ${addon.image
          ? `<img class="featured-card-img" src="${escHtml(addon.image)}" alt="${escHtml(addon.name)}" loading="lazy" onerror="this.style.display='none'" />`
          : `<div class="featured-card-img" style="background:linear-gradient(135deg,var(--bg-card2),rgba(0,212,255,.05));display:flex;align-items:center;justify-content:center;font-size:4rem">${addon.emoji ? escHtml(addon.emoji) : '<i class=\"fas fa-cube\"></i>'}</div>`
        }
        <div class="featured-badge"><i class="fas fa-star"></i> Destacado</div>
        <div class="featured-card-body">
          <h3 class="featured-card-title">${escHtml(addon.name)}</h3>
          <p style="color:var(--text-muted);font-size:.85rem;margin:.4rem 0 .8rem">${escHtml(addon.description||'').substring(0,80)}…</p>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span class="featured-card-price">${isFree ? '<i class="fas fa-gift"></i> Gratis' : `<i class="fas fa-dollar-sign"></i> $${parseFloat(addon.price).toFixed(2)}`}</span>
            <span class="btn btn-primary btn-sm">Ver más</span>
          </div>
        </div>
      </div>`;
  }

  // Slider rotativo continuo (marquee). Duplicamos las tarjetas para un loop sin cortes.
  const loop = featured.concat(featured);
  const cards = loop.map(featuredCardHTML).join('');
  // Velocidad proporcional a la cantidad de tarjetas
  const duration = Math.max(18, featured.length * 6);
  container.className = 'featured-slider featured-marquee';
  container.innerHTML = `<div class="featured-track" style="animation-duration:${duration}s">${cards}</div>`;
}

/* ============================================================
   ADDON DETAIL MODAL
   ============================================================ */
function openAddonDetail(id) {
  const addon = State.addons.find(a => a.id === id);
  if (!addon) return;
  State.currentAddon = addon;

  const isFree = !addon.price || parseFloat(addon.price) === 0;
  const inner  = document.getElementById('addon-modal-inner');

  inner.innerHTML = `
    ${addon.image
      ? `<img class="addon-modal-img" src="${escHtml(addon.image)}" alt="${escHtml(addon.name)}" onerror="this.outerHTML='<div class=addon-modal-img-placeholder>${addon.emoji ? escHtml(addon.emoji) : '&#9638;'}</div>'" />`
      : `<div class="addon-modal-img-placeholder">${addon.emoji ? escHtml(addon.emoji) : '<i class=\"fas fa-cube\"></i>'}</div>`
    }
    <div class="addon-card-badges" style="margin-bottom:12px">
      <span class="badge ${isFree ? 'badge-free' : 'badge-premium'}">${isFree ? '<i class="fas fa-gift"></i> Gratis' : '<i class="fas fa-crown"></i> Premium'}</span>
      ${addon.isNew      ? '<span class="badge badge-new"><i class="fas fa-certificate"></i> Nuevo</span>'     : ''}
      ${addon.isFeatured ? '<span class="badge badge-hot"><i class="fas fa-fire"></i> Destacado</span>' : ''}
      ${addon.category   ? `<span class="badge badge-category">${escHtml(addon.category)}</span>` : ''}
    </div>
    <h2 class="addon-modal-title">${escHtml(addon.name)}</h2>
    <p class="addon-modal-desc">${escHtml(addon.description || 'Sin descripción disponible.')}</p>
    <div class="addon-modal-meta">
      <div class="addon-modal-meta-item"><i class="fas fa-download"></i> ${(addon.downloads||0).toLocaleString()} descargas</div>
      <div class="addon-modal-meta-item"><i class="fas fa-tag"></i> ${escHtml(addon.category || 'General')}</div>
      ${addon.version ? `<div class="addon-modal-meta-item"><i class="fas fa-code-branch"></i> v${escHtml(addon.version)}</div>` : ''}
      ${addon.mcVersion ? `<div class="addon-modal-meta-item"><i class="fas fa-cube"></i> MCPE ${escHtml(addon.mcVersion)}</div>` : ''}
    </div>

    <div class="addon-modal-price-row">
      <span class="addon-modal-price ${isFree ? 'free' : ''}">
        ${isFree ? '<i class="fas fa-gift"></i> Gratis' : `$${parseFloat(addon.price).toFixed(2)} USD`}
      </span>
    </div>

    <div id="addon-action-area" style="margin-top:16px"></div>
  `;

  renderAddonAction(addon, isFree);
  // v13.0 — Comentarios en tiempo real
  if (typeof renderComments === 'function') {
    const wrap = document.createElement('div');
    wrap.innerHTML = renderComments(addon.id);
    if (wrap.firstElementChild) inner.appendChild(wrap.firstElementChild);
  }
  openModal('addon-modal');
}

function renderAddonAction(addon, isFree) {
  const area = document.getElementById('addon-action-area');
  if (!area) return;

  if (isFree) {
    area.innerHTML = `
      <button class="btn btn-success btn-full" onclick="downloadAddon(event,'${addon.id}')">
        <i class="fas fa-download"></i> Descargar Gratis
      </button>`;
    return;
  }

  // Check if already purchased
  if (hasPurchased(addon.id)) {
    area.innerHTML = `
      <div style="margin-bottom:12px;padding:12px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);border-radius:10px;text-align:center;color:var(--green)">
        <i class="fas fa-check-circle"></i> Ya tienes este add-on
      </div>
      <button class="btn btn-success btn-full" onclick="downloadAddon(event,'${addon.id}')">
        <i class="fas fa-download"></i> Descargar
      </button>`;
    return;
  }

  if (!State.user) {
    area.innerHTML = `
      <button class="btn btn-cart btn-full" style="margin-bottom:10px" onclick="cartAdd('${addon.id}')">
        <i class="fas fa-cart-plus"></i> Agregar al carrito
      </button>
      <p style="text-align:center;color:var(--text-muted);margin-bottom:12px;font-size:.875rem">
        Inicia sesión para comprar
      </p>
      <button class="btn btn-primary btn-full" onclick="closeModal('addon-modal');openAuthModal('login')">
        <i class="fab fa-google"></i> Iniciar Sesión
      </button>`;
    return;
  }

  // PayPal button + carrito
  area.innerHTML = `
    <button class="btn btn-cart btn-full" style="margin-bottom:10px" onclick="cartAdd('${addon.id}')">
      <i class="fas fa-cart-plus"></i> Agregar al carrito
    </button>
    <p style="text-align:center;color:var(--text-muted);margin-bottom:8px;font-size:.8rem">
      o compra ahora — Pago 100% seguro con PayPal
    </p>
    <div id="paypal-button-container"></div>`;

  renderPayPalButton(addon);
}

/* ============================================================
   DOWNLOAD ADDON
   ============================================================ */
function downloadAddon(event, id) {
  if (event) event.stopPropagation();
  const addon = State.addons.find(a => a.id === id);
  if (!addon) return;

  // Increment download counter
  const addons = DB.get(DB_KEYS.ADDONS);
  const idx    = addons.findIndex(a => a.id === id);
  if (idx !== -1) {
    addons[idx].downloads = (addons[idx].downloads || 0) + 1;
    DB.set(DB_KEYS.ADDONS, addons);
  }

  if (addon.downloadUrl) {
    const link     = document.createElement('a');
    link.href      = addon.downloadUrl;
    link.download  = addon.downloadName || (addon.name + '.mcaddon');
    if (!/^data:/i.test(addon.downloadUrl)) {
      link.target = '_blank';
      link.rel    = 'noopener';
    }
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Descargando ${addon.name}…`, 'success');
  } else {
    showToast('El enlace de descarga no está disponible aún.', 'warning');
  }

  updateStats();
}

/* ============================================================
   PURCHASES
   ============================================================ */
function loadPurchases() {
  if (!State.user) { State.purchases = []; return; }
  const orders = DB.get(DB_KEYS.ORDERS);
  State.purchases = orders.filter(o => o.userId === State.user.id && o.status === 'completed');
}

function hasPurchased(addonId) {
  return State.purchases.some(p => p.addonId === addonId);
}

function savePurchase(addon, paypalOrder) {
  const orders = DB.get(DB_KEYS.ORDERS);
  orders.push({
    id:        'ord_' + Date.now(),
    userId:    State.user.id,
    addonId:   addon.id,
    addonName: addon.name,
    price:     addon.price,
    currency:  'USD',
    paypalOrderId: paypalOrder.id,
    status:    'completed',
    date:      new Date().toISOString(),
  });
  DB.set(DB_KEYS.ORDERS, orders);
  loadPurchases();
}

function renderPurchases() {
  const list = document.getElementById('purchases-list');
  if (!State.user) {
    list.innerHTML = `<div class="empty-purchases"><i class="fas fa-lock"></i><p>Inicia sesión para ver tus compras</p></div>`;
    return;
  }
  if (State.purchases.length === 0) {
    list.innerHTML = `<div class="empty-purchases"><i class="fas fa-shopping-bag"></i><p>No tienes compras aún</p></div>`;
    return;
  }
  list.innerHTML = State.purchases.map(p => {
    const addon = State.addons.find(a => a.id === p.addonId);
    return `
      <div class="purchase-item">
        <div class="purchase-item-img">${addon?.emoji ? escHtml(addon.emoji) : '<i class="fas fa-cube"></i>'}</div>
        <div class="purchase-item-info">
          <div class="purchase-item-name">${escHtml(p.addonName)}</div>
          <div class="purchase-item-date">${new Date(p.date).toLocaleDateString('es-ES')}</div>
        </div>
        <div class="purchase-item-price">$${parseFloat(p.price).toFixed(2)}</div>
        <button class="btn btn-success btn-sm" onclick="downloadAddon(event,'${p.addonId}')">
          <i class="fas fa-download"></i>
        </button>
      </div>`;
  }).join('');
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]} toast-icon"></i><span>${message}</span>`;
  toast.addEventListener('click', () => removeToast(toast));
  container.appendChild(toast);
  setTimeout(() => removeToast(toast), duration);
}

function removeToast(toast) {
  toast.classList.add('hide');
  setTimeout(() => toast.remove(), 300);
}

/* ============================================================
   UTILITY
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateId() {
  return 'addon_' + Date.now() + '_' + Math.random().toString(36).substr(2,6);
}

/* ============================================================
   V3.0 — Helpers de usuario, planes y marcos
   ============================================================ */
function userDisplayName(u){ return (u && (u.displayName || u.name)) || 'Usuario'; }
function userAvatar(u){ return (u && (u.customAvatar || u.avatar)) || ''; }
function frameClass(frameId){ return frameId && frameId !== 'none' ? ('av-frame av-' + frameId) : ''; }
function platformShort(id){ const p=(window.PLATFORMS||[]).find(x=>x.id===id); return p?p.short:id; }
function typeName(id){ const t=(window.CONTENT_TYPES||[]).find(x=>x.id===id); return t?t.name:id; }
function userPlanId(u){ return (u && u.plan) || 'free'; }
function flagRingHTML(radius, count){
  const list = (window.COUNTRIES || []);
  if (!list.length) return '';
  let html = '';
  for (let i = 0; i < count; i++){
    const c = list[i % list.length];
    const ang = (360 / count) * i;
    html += `<img class="ring-flag" src="${FLAG_URL(c.code)}" alt="" loading="lazy" style="transform:rotate(${ang}deg) translateY(-${radius}px) rotate(${-ang}deg)" />`;
  }
  return html;
}
function todayKey(){ return new Date().toISOString().slice(0,10); }
function countTodayUploads(userId){
  const today = todayKey();
  return DB.get(DB_KEYS.ADDONS).filter(a => a.authorId === userId && (a.createdAt||'').slice(0,10) === today).length;
}
function persistCurrentUser(){
  if (!State.user) return;
  localStorage.setItem('mcpe_current_user', JSON.stringify(State.user));
  const users = DB.get(DB_KEYS.USERS);
  const idx = users.findIndex(u => u.id === State.user.id);
  if (idx === -1) users.push(State.user); else users[idx] = { ...users[idx], ...State.user };
  DB.set(DB_KEYS.USERS, users);
  updateAuthUI(State.user);
}

/* ============================================================
   PLANES
   ============================================================ */
function renderPlans(){
  const grid = document.getElementById('plans-grid');
  if (!grid || !window.PLANS) return;
  const currentPlan = State.user ? userPlanId(State.user) : null;
  const annual = State.billing === 'annual';
  grid.innerHTML = window.PLANS.map(p => {
    const eff = planPrice(p);
    const priceHtml = p.price === 0
      ? 'Gratis'
      : `$${eff.toFixed(2)}<span>${annual ? '/año' : '/mes'}</span>`;
    return `
    <div class="plan-card ${p.popular ? 'plan-popular' : ''} ${currentPlan===p.id?'plan-current':''}" style="--plan-color:${p.color}">
      ${p.popular ? '<div class="plan-tag"><i class="fas fa-star"></i> Más popular</div>' : ''}
      ${currentPlan===p.id ? '<div class="plan-current-tag"><i class="fas fa-check"></i> Tu plan</div>' : ''}
      <div class="plan-icon"><i class="fas ${p.icon}"></i></div>
      <h3 class="plan-name">${p.name}</h3>
      <div class="plan-price">${priceHtml}</div>
      ${annual && p.price > 0 ? `<div class="plan-annual-note">Equivale a $${(eff/12).toFixed(2)}/mes</div>` : ''}
      <div class="plan-uploads"><i class="fas fa-cloud-arrow-up"></i> ${p.dailyUploads} add-ons por día</div>
      <ul class="plan-features">
        ${p.features.map(f => `<li><i class="fas fa-check"></i> ${escHtml(f)}</li>`).join('')}
      </ul>
      <button class="btn ${p.popular?'btn-primary btn-glow':'btn-outline'} btn-full" onclick="selectPlan('${p.id}')">
        ${currentPlan===p.id ? 'Plan actual' : (p.price===0 ? 'Usar Gratis' : 'Elegir '+p.name)}
      </button>
    </div>`;
  }).join('');
}

// Precio efectivo según facturación (anual = 10 meses = 2 meses gratis)
function planPrice(plan){
  if (!plan || !plan.price) return 0;
  return State.billing === 'annual' ? Math.round(plan.price * 10 * 100) / 100 : plan.price;
}

function setBilling(b){
  State.billing = b;
  document.querySelectorAll('.bt-opt').forEach(x => x.classList.toggle('active', x.dataset.bill === b));
  renderPlans();
}

function selectPlan(planId){
  if (!State.user){ openAuthModal('login'); showToast('Inicia sesión para elegir un plan.', 'info'); return; }
  const plan = getPlanById(planId);
  if (planId === 'free'){
    State.user.plan = 'free';
    persistCurrentUser();
    renderPlans();
    showToast('Estás en el plan Gratis.', 'info');
    return;
  }
  if (userPlanId(State.user) === planId){
    showToast(`Ya tienes el plan ${plan.name}.`, 'info');
    return;
  }
  openPlanCheckout(plan);
}

function openPlanCheckout(plan){
  const body = document.getElementById('plan-modal-body');
  if (!body) return;
  const eff = planPrice(plan);
  const period = State.billing === 'annual' ? 'año' : 'mes';
  const checkoutPlan = { ...plan, price: eff, period: State.billing };
  body.innerHTML = `
    <div class="plan-checkout-head">
      <div class="plan-icon" style="--plan-color:${plan.color};margin:0 auto 10px"><i class="fas ${plan.icon}"></i></div>
      <h2>Plan ${plan.name}</h2>
      <div class="plan-price" style="margin:4px 0">$${eff.toFixed(2)}<span>/${period}</span></div>
      <div class="plan-uploads" style="margin:8px auto"><i class="fas fa-cloud-arrow-up"></i> ${plan.dailyUploads} add-ons por día</div>
    </div>
    <ul class="plan-features" style="max-width:300px;margin:14px auto 18px">
      ${plan.features.map(f => `<li><i class="fas fa-check"></i> ${escHtml(f)}</li>`).join('')}
    </ul>
    <p style="text-align:center;color:var(--text-muted);font-size:.78rem;margin-bottom:8px">Pago seguro con PayPal · facturación ${State.billing === 'annual' ? 'anual' : 'mensual'}</p>
    <div id="plan-paypal-container"></div>
  `;
  openModal('plan-modal');
  if (typeof renderPlanPayPalButton === 'function') renderPlanPayPalButton(checkoutPlan);
}

function activatePlanAfterPayment(plan, details){
  if (!State.user) return;
  State.user.plan = plan.id;
  State.user.planSince = new Date().toISOString();
  persistCurrentUser();
  // Registrar la orden del plan
  try {
    const orders = DB.get(DB_KEYS.ORDERS);
    orders.push({
      id: 'plan_' + Date.now(),
      userId: State.user.id,
      type: 'plan',
      planId: plan.id,
      addonName: `Plan ${plan.name} (mensual)`,
      price: plan.price,
      currency: 'USD',
      paypalOrderId: details && details.id,
      status: 'completed',
      date: new Date().toISOString()
    });
    DB.set(DB_KEYS.ORDERS, orders);
  } catch(e){ console.error(e); }
  closeModal('plan-modal');
  renderPlans();
  const name = (details && details.payer && details.payer.name && details.payer.name.given_name) || '';
  showToast(`¡Plan ${plan.name} activado${name ? ', '+name : ''}! Ahora puedes subir ${plan.dailyUploads} add-ons al día.`, 'success', 6000);
}

/* ============================================================
   SUBIR ADD-ON (usuarios registrados, con límite diario)
   ============================================================ */
function populateUploadTypes(){
  const sel = document.getElementById('up-type');
  if (!sel || !window.CONTENT_TYPES) return;
  const platform = (document.getElementById('up-platform')||{}).value || 'bedrock';
  const types = window.CONTENT_TYPES.filter(t => t.platform === 'both' || t.platform === platform);
  sel.innerHTML = types.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
}
function onUploadPlatformChange(){ populateUploadTypes(); }

function openUploadModal(){
  document.getElementById('user-dropdown')?.classList.remove('open');
  if (!State.user){ openAuthModal('login'); showToast('Inicia sesión para subir add-ons.', 'info'); return; }
  _upImage=null; _upFile=null; _upFileName=null;
  const f = document.getElementById('user-upload-form'); if (f) f.reset();
  document.getElementById('up-image-name').textContent = 'Ningún archivo';
  document.getElementById('up-file-name').textContent  = 'Ningún archivo';
  document.getElementById('up-image-preview').style.display = 'none';
  populateUploadTypes();
  const limit = getDailyLimit(userPlanId(State.user));
  const used  = countTodayUploads(State.user.id);
  const info  = document.getElementById('upload-limit-info');
  if (info) info.innerHTML = `Plan <strong>${getPlanById(userPlanId(State.user)).name}</strong> &middot; Hoy: <strong>${used}/${limit}</strong> add-ons`;
  openModal('upload-modal');
}

function handleUploadImage(input){
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')){ showToast('Selecciona una imagen válida.', 'error'); input.value=''; return; }
  document.getElementById('up-image-name').textContent = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const MAX=800; let w=img.width, h=img.height;
      if (w>MAX||h>MAX){ if(w>=h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;} }
      const c=document.createElement('canvas'); c.width=w; c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      try{ _upImage=c.toDataURL('image/jpeg',0.85); }catch(err){ _upImage=e.target.result; }
      document.getElementById('up-image-url').value='';
      document.getElementById('up-image-preview-img').src=_upImage;
      document.getElementById('up-image-preview').style.display='block';
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

function handleUploadFile(input){
  const file = input.files && input.files[0];
  if (!file) return;
  const mb = file.size/(1024*1024);
  if (mb>8){ showToast(`El archivo pesa ${mb.toFixed(1)} MB. Máximo 8 MB; usa un enlace para archivos más grandes.`, 'error'); input.value=''; return; }
  document.getElementById('up-file-name').textContent = `${file.name} (${mb.toFixed(2)} MB)`;
  const reader=new FileReader();
  reader.onload=e=>{ _upFile=e.target.result; _upFileName=file.name; document.getElementById('up-download-url').value=''; };
  reader.readAsDataURL(file);
}

function submitUserAddon(e){
  if (e && e.preventDefault) e.preventDefault();
  try {
    if (!State.user){ openAuthModal('login'); return; }
    const limit = getDailyLimit(userPlanId(State.user));
    const used  = countTodayUploads(State.user.id);
    if (used >= limit){
      showToast(`Alcanzaste tu límite de ${limit} add-ons por hoy. Mejora tu plan para subir más.`, 'warning', 7000);
      return;
    }
    const name = document.getElementById('up-name').value.trim();
    const platform = document.getElementById('up-platform').value;
    const contentType = document.getElementById('up-type').value;
    const description = document.getElementById('up-desc').value.trim();
    const price = 0; // Las subidas de usuarios son SIEMPRE gratis (solo el admin puede poner precio)
    const version = document.getElementById('up-version').value.trim();
    const mcVersion = document.getElementById('up-mcversion').value.trim();
    const image = _upImage || document.getElementById('up-image-url').value.trim();
    const downloadUrl = _upFile || document.getElementById('up-download-url').value.trim();
    const downloadName = _upFile ? _upFileName : '';

    if (!name){ showToast('Ponle un nombre a tu add-on.', 'error'); return; }
    const fileInput = document.getElementById('up-file');
    if (fileInput.files.length>0 && !_upFile){ showToast('El archivo aún se procesa, espera un momento.', 'warning'); return; }
    if (!downloadUrl){ showToast('Sube un archivo o pega un enlace de descarga.', 'error'); return; }

    const addons = DB.get(DB_KEYS.ADDONS);
    addons.push({
      id: 'addon_'+Date.now()+'_'+Math.random().toString(36).substr(2,6),
      name, platform, contentType, category: contentType,
      description, price, version, mcVersion,
      image, downloadUrl, downloadName,
      emoji:'', isFeatured:false, isNew:true,
      downloads:0, purchases:0,
      status: 'pending', approved: false,
      authorId: State.user.id, authorName: userDisplayName(State.user), authorAvatar: userAvatar(State.user),
      createdAt: new Date().toISOString()
    });

    Promise.resolve(DB.set(DB_KEYS.ADDONS, addons))
      .then(()=>{
        showToast('¡Add-on enviado! Quedó pendiente de aprobación del administrador.', 'success', 6000);
        closeModal('upload-modal');
        loadAddons(); updateStats();
      })
      .catch(err=>{
        if (err && err.message==='LOCAL_STORAGE_FULL') showToast('El archivo es muy grande. Usa un enlace de descarga.', 'error', 7000);
        else showToast('Publicado localmente, pero la nube falló. Revisa las reglas de Firebase.', 'warning', 8000);
      });
  } catch(err){
    console.error('[Upload] error:', err);
    showToast('Error al publicar: '+(err && err.message ? err.message : err), 'error');
  }
}

/* ============================================================
   PERFIL (ver / editar / marcos / selección)
   ============================================================ */
function openProfileModal(){
  document.getElementById('user-dropdown')?.classList.remove('open');
  if (!State.user){ openAuthModal('login'); showToast('Inicia sesión para ver tu perfil.', 'info'); return; }
  renderProfile(false);
  openModal('profile-modal');
}

function renderProfile(editMode){
  const u = State.user;
  const view = document.getElementById('profile-view');
  if (!u || !view) return;
  const plan = getPlanById(userPlanId(u));
  const myAddons = DB.get(DB_KEYS.ADDONS).filter(a => a.authorId === u.id);
  const totalDl = myAddons.reduce((s,a)=>s+(a.downloads||0),0);
  const country = (window.COUNTRIES||[]).find(c=>c.code===u.country);

  if (!editMode){
    view.innerHTML = `
      <div class="profile-cover"></div>
      <div class="profile-head">
        <div class="profile-avatar-wrap ${frameClass(u.frame)}">
          ${u.frame === 'flags' ? `<div class="flag-ring">${flagRingHTML(52, 16)}</div>` : ''}
          <img class="pf-avatar-img" src="${escHtml(userAvatar(u))}" alt="" onerror="this.style.opacity=0" />
        </div>
        ${country ? `<img class="profile-flag" src="${FLAG_URL(country.code)}" alt="${escHtml(country.name)}" title="${escHtml(country.name)}" />` : ''}
        <h2 class="profile-name">${escHtml(userDisplayName(u))}</h2>
        <span class="profile-plan-badge plan-${plan.id}"><i class="fas ${plan.icon}"></i> ${plan.name}</span>
        <p class="profile-bio ${u.bio?'':'muted'}">${u.bio ? escHtml(u.bio) : 'Sin biografía aún.'}</p>
      </div>
      <div class="profile-stats">
        <div><strong>${myAddons.length}</strong><span>Add-ons</span></div>
        <div><strong>${totalDl.toLocaleString()}</strong><span>Descargas</span></div>
        <div><strong>${plan.dailyUploads}</strong><span>Límite/día</span></div>
      </div>
      <div class="profile-actions">
        <button class="btn btn-primary btn-full" onclick="renderProfile(true)"><i class="fas fa-pen"></i> Editar perfil</button>
        <button class="btn btn-outline btn-full" onclick="closeModal('profile-modal');openUploadModal()"><i class="fas fa-cloud-arrow-up"></i> Subir add-on</button>
      </div>
      <h3 class="profile-section-title"><i class="fas fa-box"></i> Mis Add-ons (${myAddons.length})</h3>
      <div class="profile-addons">
        ${myAddons.length === 0 ? '<p class="muted" style="text-align:center;padding:14px 0">Aún no has subido add-ons.</p>' :
          myAddons.map(a => {
            const st = a.status === 'pending' ? '<span class="st-badge st-pending"><i class="fas fa-clock"></i> Pendiente</span>'
                     : a.status === 'rejected' ? '<span class="st-badge st-rejected"><i class="fas fa-ban"></i> Rechazado</span>'
                     : '<span class="st-badge st-approved"><i class="fas fa-check"></i> Aprobado</span>';
            return `
            <div class="profile-addon-item">
              <div class="profile-addon-ic">${a.image ? `<img src="${escHtml(a.image)}" alt="" onerror="this.outerHTML='&#9638;'"/>` : '<i class="fas fa-cube"></i>'}</div>
              <div class="profile-addon-info"><strong>${escHtml(a.name)}</strong><small>${(a.downloads||0).toLocaleString()} descargas · ${st}</small></div>
              <button class="btn btn-sm btn-danger" onclick="deleteMyAddon('${a.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>
            </div>`; }).join('')}
      </div>
    `;
    return;
  }

  _profAvatar = null; _profFrame = u.frame || 'none';
  const isPremiumPlan = userPlanId(u) !== 'free';
  view.innerHTML = `
    <h2 class="profile-edit-title"><i class="fas fa-pen"></i> Editar perfil</h2>
    <div class="pf-group">
      <label>Nombre para mostrar</label>
      <input type="text" id="pf-name" class="uinput" value="${escHtml(userDisplayName(u))}" maxlength="40" />
    </div>
    <div class="pf-group">
      <label>Foto de perfil</label>
      <div class="file-pick">
        <input type="file" id="pf-avatar-file" accept="image/*" onchange="handleProfileAvatar(this)" hidden />
        <button type="button" class="file-pick-btn" onclick="document.getElementById('pf-avatar-file').click()"><i class="fas fa-image"></i> Subir foto</button>
        <span class="file-pick-name" id="pf-avatar-name">Actual</span>
      </div>
    </div>
    <div class="pf-group">
      <label>Biografía</label>
      <textarea id="pf-bio" class="uinput utextarea" rows="2" maxlength="160" placeholder="Cuéntanos sobre ti...">${escHtml(u.bio||'')}</textarea>
    </div>
    <div class="pf-group">
      <label>Selección (Mundial 2026)</label>
      <select id="pf-country" class="uinput">
        <option value="">Sin selección</option>
        ${(window.COUNTRIES||[]).map(c=>`<option value="${c.code}" ${u.country===c.code?'selected':''}>${escHtml(c.name)}</option>`).join('')}
      </select>
    </div>
    <div class="pf-group">
      <label>Marco del avatar</label>
      <div class="frames-grid" id="frames-grid">
        ${(window.FRAMES||[]).map(fr=>`
          <button type="button" class="frame-pick ${_profFrame===fr.id?'active':''} ${fr.premium && !isPremiumPlan ? 'locked':''}" data-frame="${fr.id}" onclick="pickFrame('${fr.id}', ${fr.premium})">
            <span class="frame-demo av-frame av-${fr.id}">${fr.id==='flags' ? `<span class="flag-ring flag-ring-mini">${flagRingHTML(17,10)}</span><i class="fas fa-user"></i>` : '<i class="fas fa-user"></i>'}</span>
            <small>${fr.name}${fr.premium?' <i class="fas fa-lock"></i>':''}</small>
          </button>`).join('')}
      </div>
    </div>
    <div class="profile-actions">
      <button class="btn btn-secondary btn-full" onclick="renderProfile(false)">Cancelar</button>
      <button class="btn btn-primary btn-full" onclick="saveProfile()"><i class="fas fa-save"></i> Guardar</button>
    </div>
  `;
}

function pickFrame(frameId, premium){
  if (premium && userPlanId(State.user) === 'free'){
    showToast('Este marco es premium. Mejora a Creator o Pro para usarlo.', 'warning');
    return;
  }
  _profFrame = frameId;
  document.querySelectorAll('.frame-pick').forEach(b=>b.classList.toggle('active', b.dataset.frame===frameId));
}

function handleProfileAvatar(input){
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')){ showToast('Selecciona una imagen.', 'error'); return; }
  document.getElementById('pf-avatar-name').textContent = file.name;
  const reader=new FileReader();
  reader.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      const MAX=400; let w=img.width, h=img.height;
      if(w>MAX||h>MAX){ if(w>=h){h=Math.round(h*MAX/w);w=MAX;}else{w=Math.round(w*MAX/h);h=MAX;} }
      const c=document.createElement('canvas');c.width=w;c.height=h;
      c.getContext('2d').drawImage(img,0,0,w,h);
      try{_profAvatar=c.toDataURL('image/jpeg',0.85);}catch(err){_profAvatar=e.target.result;}
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(file);
}

function saveProfile(){
  if (!State.user) return;
  const name = document.getElementById('pf-name').value.trim();
  const bio  = document.getElementById('pf-bio').value.trim();
  const country = document.getElementById('pf-country').value;
  State.user.displayName = name || State.user.name;
  State.user.bio = bio;
  State.user.country = country;
  State.user.frame = _profFrame || 'none';
  if (_profAvatar) State.user.customAvatar = _profAvatar;
  persistCurrentUser();
  showToast('Perfil actualizado.', 'success');
  renderProfile(false);
}

function deleteMyAddon(id){
  if (!State.user) return;
  const addons = DB.get(DB_KEYS.ADDONS);
  const target = addons.find(a=>a.id===id);
  if (!target || target.authorId !== State.user.id){ showToast('No puedes eliminar este add-on.', 'error'); return; }
  if (!confirm('¿Eliminar este add-on? No se puede deshacer.')) return;
  DB.set(DB_KEYS.ADDONS, addons.filter(a=>a.id!==id));
  loadAddons(); updateStats(); renderProfile(false);
  showToast('Add-on eliminado.', 'warning');
}

// Vincular el formulario de subida cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  const upForm = document.getElementById('user-upload-form');
  if (upForm) upForm.addEventListener('submit', submitUserAddon);
  const regEmail = document.getElementById('reg-email');
  if (regEmail) regEmail.addEventListener('input', checkRegEmail);
});

// Expose globally
window.toggleHamburger    = toggleHamburger;
window.closeHamburger     = closeHamburger;
window.openSheet          = openSheet;
window.closeSheet         = closeSheet;
window.openAuthModal      = openAuthModal;
window.switchAuthTab      = switchAuthTab;
window.togglePass         = togglePass;
window.loginEmail         = loginEmail;
window.registerEmail      = registerEmail;
window.recoverPassword    = recoverPassword;
window.subscribeNewsletter = subscribeNewsletter;
window.updatePassStrength = updatePassStrength;
window.checkPassMatch     = checkPassMatch;
window.clearSearch        = clearSearch;
window.updateSuggestions  = updateSuggestions;
window.pickSuggest        = pickSuggest;
window.closeModal         = closeModal;
window.openModal          = openModal;
window.toggleUserDropdown = toggleUserDropdown;
window.logout             = logout;
window.setCategory        = setCategory;
window.filterAddons       = filterAddons;
window.openAddonDetail    = openAddonDetail;
window.downloadAddon      = downloadAddon;
window.openPurchasesModal = openPurchasesModal;
window.loadMore           = loadMore;
window.goToPage           = goToPage;
window.showToast          = showToast;
window.escHtml            = escHtml;
window.generateId         = generateId;
window.State              = State;
window.savePurchase       = savePurchase;
window.renderAddonAction  = renderAddonAction;
window.hasPurchased       = hasPurchased;
window.updateStats        = updateStats;
window.setPlatform        = setPlatform;
window.setSort            = setSort;
window.setBilling         = setBilling;
window.planPrice          = planPrice;
window.heroCategory       = heroCategory;
window.syncFilterUI       = syncFilterUI;
window.renderPlans        = renderPlans;
window.selectPlan         = selectPlan;
window.openPlanCheckout   = openPlanCheckout;
window.activatePlanAfterPayment = activatePlanAfterPayment;
window.openUploadModal    = openUploadModal;
window.onUploadPlatformChange = onUploadPlatformChange;
window.handleUploadImage  = handleUploadImage;
window.handleUploadFile   = handleUploadFile;
window.submitUserAddon    = submitUserAddon;
window.openProfileModal   = openProfileModal;
window.renderProfile      = renderProfile;
window.pickFrame          = pickFrame;
window.handleProfileAvatar= handleProfileAvatar;
window.saveProfile        = saveProfile;
window.deleteMyAddon      = deleteMyAddon;
window.populateUploadTypes= populateUploadTypes;
