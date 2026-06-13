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
  searchQuery:     '',
  page:            1,
  perPage:         12,
  currentAddon:    null,
  purchases:       [],
};

// ─── DOM Ready ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLoadingScreen();
  initParticles();
  initNavbar();
  initGoogleAuth();
  initScrollReveal();
  initTypingEffect();
  loadAddons();
  updateStats();
  restoreSession();
  listenRealtime();
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
  const btn     = document.getElementById('hamburger-btn');
  const menu    = document.getElementById('nav-menu');
  const overlay = document.getElementById('mobile-menu-overlay');

  const isOpen = menu.classList.contains('open');

  if (isOpen) {
    closeHamburger();
  } else {
    btn.classList.add('open');
    menu.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
}

function closeHamburger() {
  const btn     = document.getElementById('hamburger-btn');
  const menu    = document.getElementById('nav-menu');
  const overlay = document.getElementById('mobile-menu-overlay');

  btn.classList.remove('open');
  menu.classList.remove('open');
  overlay.classList.remove('open');
  document.body.style.overflow = '';
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
});

/* ============================================================
   TYPING EFFECT
   ============================================================ */
function initTypingEffect() {
  const words = ['Add-ons', 'Texturas', 'Mapas', 'Mods', 'Skins'];
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
  const addons  = DB.get(DB_KEYS.ADDONS);
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
  State.user = user;
  localStorage.setItem('mcpe_current_user', JSON.stringify(user));

  // Save to users list
  const users = DB.get(DB_KEYS.USERS);
  const idx   = users.findIndex(u => u.id === user.id);
  if (idx === -1) users.push(user); else users[idx] = { ...users[idx], ...user };
  DB.set(DB_KEYS.USERS, users);

  updateAuthUI(user);
  closeModal('auth-modal');
  showToast(`¡Bienvenido, ${user.name}! 👋`, 'success');
  loadPurchases();
  updateStats();
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
  // Mobile menu
  document.getElementById('logged-out-btns').style.display = 'none';
  document.getElementById('logged-in-btns').style.display  = 'block';
  document.getElementById('menu-user-avatar').src  = user.avatar || '';
  document.getElementById('menu-user-name').textContent   = user.name;
  document.getElementById('menu-user-email').textContent  = user.email;

  // Desktop
  document.getElementById('desktop-logged-out').style.display = 'none';
  document.getElementById('desktop-logged-in').style.display  = 'flex';
  document.getElementById('nav-user-avatar').src  = user.avatar || '';
  document.getElementById('nav-user-name').textContent   = user.name.split(' ')[0];
  document.getElementById('dropdown-avatar').src  = user.avatar || '';
  document.getElementById('dropdown-name').textContent   = user.name;
  document.getElementById('dropdown-email').textContent  = user.email;
}

function logout() {
  State.user = null;
  localStorage.removeItem('mcpe_current_user');

  // Mobile menu
  document.getElementById('logged-out-btns').style.display = 'block';
  document.getElementById('logged-in-btns').style.display  = 'none';

  // Desktop
  document.getElementById('desktop-logged-out').style.display = 'block';
  document.getElementById('desktop-logged-in').style.display  = 'none';
  document.getElementById('user-dropdown').classList.remove('open');

  if (typeof google !== 'undefined') google.accounts.id.disableAutoSelect();
  showToast('Sesión cerrada correctamente', 'info');
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
  const title    = document.getElementById('auth-modal-title');
  const subtitle = document.getElementById('auth-modal-subtitle');
  if (mode === 'login') {
    title.textContent    = 'Bienvenido de vuelta';
    subtitle.textContent = 'Inicia sesión para descargar add-ons premium';
  } else {
    title.textContent    = 'Crear cuenta';
    subtitle.textContent = 'Únete a miles de usuarios de MCPE';
  }
  openModal('auth-modal');
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
  let list = [...State.addons];

  // Category filter
  if (State.currentCategory === 'free')    list = list.filter(a => a.price == 0 || a.price === '0');
  else if (State.currentCategory === 'premium') list = list.filter(a => parseFloat(a.price) > 0);
  else if (State.currentCategory !== 'all') list = list.filter(a => a.category === State.currentCategory);

  // Search filter
  if (State.searchQuery) {
    const q = State.searchQuery.toLowerCase();
    list = list.filter(a =>
      a.name.toLowerCase().includes(q) ||
      (a.description || '').toLowerCase().includes(q) ||
      (a.category || '').toLowerCase().includes(q)
    );
  }

  State.filteredAddons = list;
  State.page = 1;
  renderAddons();
  renderFeatured();
}

function setCategory(cat, btn) {
  State.currentCategory = cat;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function filterAddons() {
  State.searchQuery = document.getElementById('search-input').value.trim();
  applyFilters();
}

/* ============================================================
   RENDER ADDONS GRID
   ============================================================ */
function renderAddons() {
  const grid  = document.getElementById('addons-grid');
  const empty = document.getElementById('empty-state');
  const more  = document.getElementById('load-more-wrap');

  const visible = State.filteredAddons.slice(0, State.page * State.perPage);

  if (State.filteredAddons.length === 0) {
    empty.style.display = 'block';
    grid.innerHTML = '';
    grid.appendChild(empty);
    more.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = '';

  visible.forEach((addon, i) => {
    const card = buildAddonCard(addon, i);
    grid.appendChild(card);
  });

  more.style.display = State.filteredAddons.length > visible.length ? 'block' : 'none';
}

function buildAddonCard(addon, index) {
  const el   = document.createElement('div');
  el.className = 'addon-card';
  el.style.animationDelay = `${index * 0.05}s`;

  const isFree    = !addon.price || parseFloat(addon.price) === 0;
  const price     = isFree ? 'Gratis' : `$${parseFloat(addon.price).toFixed(2)}`;
  const priceClass = isFree ? 'free' : 'premium';

  el.innerHTML = `
    ${addon.image
      ? `<img class="addon-card-img" src="${escHtml(addon.image)}" alt="${escHtml(addon.name)}" loading="lazy" onerror="this.outerHTML='<div class=addon-card-img-placeholder>📦</div>'" />`
      : `<div class="addon-card-img-placeholder">${addon.emoji || '📦'}</div>`
    }
    <div class="addon-card-body">
      <div class="addon-card-badges">
        <span class="badge ${isFree ? 'badge-free' : 'badge-premium'}">${isFree ? '🎁 Gratis' : '👑 Premium'}</span>
        ${addon.isNew     ? '<span class="badge badge-new">✨ Nuevo</span>' : ''}
        ${addon.isFeatured? '<span class="badge badge-hot">🔥 Top</span>'  : ''}
        ${addon.category  ? `<span class="badge badge-category">${escHtml(addon.category)}</span>` : ''}
      </div>
      <h3 class="addon-card-title">${escHtml(addon.name)}</h3>
      <p class="addon-card-desc">${escHtml(addon.description || 'Sin descripción disponible.')}</p>
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
           </button>`
      }
    </div>
  `;
  return el;
}

function loadMore() {
  State.page++;
  renderAddons();
}

/* ============================================================
   RENDER FEATURED
   ============================================================ */
function renderFeatured() {
  const container = document.getElementById('featured-slider');
  const featured  = State.addons.filter(a => a.isFeatured);

  if (featured.length === 0) {
    container.innerHTML = `
      <div class="no-featured">
        <i class="fas fa-star"></i>
        <p>Los add-ons destacados aparecerán aquí</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  featured.forEach(addon => {
    const isFree = !addon.price || parseFloat(addon.price) === 0;
    const card   = document.createElement('div');
    card.className = 'featured-card';
    card.onclick = () => openAddonDetail(addon.id);
    card.innerHTML = `
      ${addon.image
        ? `<img class="featured-card-img" src="${escHtml(addon.image)}" alt="${escHtml(addon.name)}" loading="lazy" onerror="this.style.display='none'" />`
        : `<div class="featured-card-img" style="background:linear-gradient(135deg,var(--bg-card2),rgba(0,212,255,.05));display:flex;align-items:center;justify-content:center;font-size:4rem">${addon.emoji||'📦'}</div>`
      }
      <div class="featured-badge">⭐ Destacado</div>
      <div class="featured-card-body">
        <h3 class="featured-card-title">${escHtml(addon.name)}</h3>
        <p style="color:var(--text-muted);font-size:.85rem;margin:.4rem 0 .8rem">${escHtml(addon.description||'').substring(0,80)}…</p>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span class="featured-card-price">${isFree ? '🎁 Gratis' : `💰 $${parseFloat(addon.price).toFixed(2)}`}</span>
          <span class="btn btn-primary btn-sm">Ver más</span>
        </div>
      </div>`;
    container.appendChild(card);
  });
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
      ? `<img class="addon-modal-img" src="${escHtml(addon.image)}" alt="${escHtml(addon.name)}" onerror="this.outerHTML='<div class=addon-modal-img-placeholder>${addon.emoji||'📦'}</div>'" />`
      : `<div class="addon-modal-img-placeholder">${addon.emoji || '📦'}</div>`
    }
    <div class="addon-card-badges" style="margin-bottom:12px">
      <span class="badge ${isFree ? 'badge-free' : 'badge-premium'}">${isFree ? '🎁 Gratis' : '👑 Premium'}</span>
      ${addon.isNew      ? '<span class="badge badge-new">✨ Nuevo</span>'     : ''}
      ${addon.isFeatured ? '<span class="badge badge-hot">🔥 Destacado</span>' : ''}
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
        ${isFree ? '🎁 Gratis' : `$${parseFloat(addon.price).toFixed(2)} USD`}
      </span>
    </div>

    <div id="addon-action-area" style="margin-top:16px"></div>
  `;

  renderAddonAction(addon, isFree);
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
      <p style="text-align:center;color:var(--text-muted);margin-bottom:12px;font-size:.875rem">
        Inicia sesión para comprar
      </p>
      <button class="btn btn-primary btn-full" onclick="closeModal('addon-modal');openAuthModal('login')">
        <i class="fab fa-google"></i> Iniciar Sesión
      </button>`;
    return;
  }

  // PayPal button
  area.innerHTML = `
    <p style="text-align:center;color:var(--text-muted);margin-bottom:8px;font-size:.8rem">
      Pago 100% seguro con PayPal
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
    link.download  = addon.name + '.mcpack';
    link.target    = '_blank';
    link.rel       = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Descargando ${addon.name}… 📥`, 'success');
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
        <div class="purchase-item-img">${addon?.emoji || '📦'}</div>
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

// Expose globally
window.toggleHamburger    = toggleHamburger;
window.closeHamburger     = closeHamburger;
window.openAuthModal      = openAuthModal;
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
window.showToast          = showToast;
window.escHtml            = escHtml;
window.generateId         = generateId;
window.State              = State;
window.savePurchase       = savePurchase;
window.renderAddonAction  = renderAddonAction;
window.hasPurchased       = hasPurchased;
window.updateStats        = updateStats;
