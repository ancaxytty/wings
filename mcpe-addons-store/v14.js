/* ============================================================
   MCPE ADDONS STORE — v14.0
   Fondo caricaturesco · Texturizado · Bloque de Minecraft que
   se rompe al bajar y se reconstruye al subir · Emblemas
   profesionales por nivel para usuarios y creadores.
   ------------------------------------------------------------
   Módulo autónomo. Reutiliza DB/State/ADMIN_EMAIL si existen.
   ============================================================ */

'use strict';

/* ============================================================
   EMBLEMAS — niveles de profesionalismo
   ============================================================ */
const V14_TIERS = [
  { id: 0, name: 'Novato',      icon: 'fa-seedling', c1: '#aebbd2', c2: '#5f7088', ring: '#d7e0f0', min: 0 },
  { id: 1, name: 'Aprendiz',    icon: 'fa-leaf',     c1: '#67d98c', c2: '#2f8f55', ring: '#c6f3d6', min: 30 },
  { id: 2, name: 'Constructor', icon: 'fa-hammer',   c1: '#3ad9d2', c2: '#1f8f99', ring: '#c2f5f1', min: 120 },
  { id: 3, name: 'Creador',     icon: 'fa-cube',     c1: '#5aa8ff', c2: '#2b6fd6', ring: '#cbe4ff', min: 350 },
  { id: 4, name: 'Experto',     icon: 'fa-gem',      c1: '#ab8dff', c2: '#7c3aed', ring: '#e4daff', min: 800 },
  { id: 5, name: 'Maestro',     icon: 'fa-crown',    c1: '#ffd166', c2: '#e0941f', ring: '#fff1c4', min: 1800 },
  { id: 6, name: 'Leyenda',     icon: 'fa-dragon',   c1: '#ff8a5a', c2: '#e23b3b', ring: '#ffd9c6', min: 4200 }
];

function v14LevelFromScore(score) {
  let lvl = 0;
  for (let i = 0; i < V14_TIERS.length; i++) if (score >= V14_TIERS[i].min) lvl = i;
  return lvl;
}

function v14IsAdminEmail(email) {
  return (typeof ADMIN_EMAIL !== 'undefined') && email && email === ADMIN_EMAIL;
}

// Calcula el emblema de un usuario a partir de su actividad
function v14GetEmblem(userId, fallbackUser) {
  let u = fallbackUser || null;
  try {
    if (window.DB && window.DB_KEYS) {
      const users = DB.get(DB_KEYS.USERS);
      const found = users.find(x => x.id === userId);
      if (found) u = found;
    }
  } catch (e) { /* noop */ }
  if (!u && window.State && State.user && State.user.id === userId) u = State.user;

  const plan = (u && u.plan) || 'free';
  const isAdmin = v14IsAdminEmail(u && u.email);

  let addonsCount = 0, downloads = 0;
  try {
    if (window.DB && window.DB_KEYS) {
      const mine = DB.get(DB_KEYS.ADDONS).filter(a => a.authorId === userId && a.status !== 'pending' && a.status !== 'rejected');
      addonsCount = mine.length;
      downloads = mine.reduce((s, a) => s + (a.downloads || 0), 0);
    }
  } catch (e) { /* noop */ }

  const planBonus = plan === 'pro' ? 150 : (plan === 'creator' ? 60 : 0);
  const score = addonsCount * 20 + downloads + planBonus;
  let level = v14LevelFromScore(score);
  if (isAdmin) level = 6;

  const tier = V14_TIERS[level];
  const next = V14_TIERS[level + 1] || null;
  return {
    level, name: isAdmin ? 'Staff' : tier.name, icon: isAdmin ? 'fa-shield-halved' : tier.icon,
    c1: tier.c1, c2: tier.c2, ring: tier.ring,
    score, addonsCount, downloads, isAdmin, plan,
    next, nextMin: next ? next.min : null, curMin: tier.min
  };
}
window.v14GetEmblem = v14GetEmblem;

// SVG del medallón hexagonal (parametrizado por color)
function v14MedalSVG(em, shine) {
  const uid = 'em' + Math.random().toString(36).substr(2, 6);
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${em.ring}"/><stop offset="1" stop-color="${em.c2}"/>
      </linearGradient>
      <radialGradient id="${uid}c" cx="38%" cy="32%" r="75%">
        <stop offset="0" stop-color="${em.c1}"/><stop offset="1" stop-color="${em.c2}"/>
      </radialGradient>
    </defs>
    <g class="v14-em-ring">
      <polygon points="50,3 89,25 89,75 50,97 11,75 11,25" fill="url(#${uid}r)"/>
    </g>
    <polygon points="50,12 81,30 81,70 50,88 19,70 19,30" fill="url(#${uid}c)"/>
    <polygon points="50,12 81,30 81,70 50,88 19,70 19,30" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="1.5"/>
    <path d="M50 12 L81 30 L50 50 L19 30 Z" fill="#ffffff" opacity=".14"/>
  </svg>`;
}

// HTML del emblema en tamaño sm|md|lg
function v14EmblemHTML(userId, size, fallbackUser) {
  if (!userId && fallbackUser) userId = fallbackUser.id;
  const em = v14GetEmblem(userId, fallbackUser);
  const cls = size === 'lg' ? 'lg' : (size === 'md' ? 'md' : 'sm');
  const shine = em.level >= 5;
  return `<span class="v14-emblem ${cls}${shine ? ' shine' : ''}" title="${em.name} · Nivel ${em.level + 1}">
    ${v14MedalSVG(em, shine)}
    <span class="v14-em-ic"><i class="fas ${em.icon}"></i></span>
  </span>`;
}
window.v14EmblemHTML = v14EmblemHTML;

// Chip de texto del nivel (para junto al nombre)
function v14LevelChip(userId, fallbackUser) {
  const em = v14GetEmblem(userId, fallbackUser);
  return `<span class="v14-level-chip" style="--em-bg:${em.c2}22;--em-fg:${em.c1};--em-bd:${em.c2}55"><i class="fas ${em.icon}"></i> ${em.name}</span>`;
}
window.v14LevelChip = v14LevelChip;

// Showcase grande para el perfil
function v14EmblemShowcase(userId, fallbackUser) {
  const em = v14GetEmblem(userId, fallbackUser);
  let pct = 100, nextTxt = '¡Nivel máximo alcanzado!';
  if (em.next) {
    const span = em.nextMin - em.curMin;
    const prog = Math.max(0, Math.min(span, em.score - em.curMin));
    pct = span > 0 ? Math.round((prog / span) * 100) : 0;
    nextTxt = `${em.nextMin - em.score} pts para <strong>${em.next.name}</strong>`;
  }
  const levelsRow = V14_TIERS.map(t => `
    <div class="v14-lv ${em.level >= t.id ? 'reached' : ''}">
      <span class="v14-emblem sm"${''}>${v14MedalSVG(t)}<span class="v14-em-ic"><i class="fas ${t.icon}"></i></span></span>
      <small>${t.name}</small>
    </div>`).join('');

  return `
  <div class="v14-emblem-showcase" style="--em-c1:${em.c1};--em-c2:${em.c2};--em-glow:${em.c2}33">
    <span class="v14-emblem lg${em.level >= 5 ? ' shine' : ''}">${v14MedalSVG(em)}<span class="v14-em-ic"><i class="fas ${em.icon}"></i></span></span>
    <div class="v14-es-info">
      <div class="v14-es-name">${em.name} <span class="v14-level-chip" style="--em-bg:${em.c2}22;--em-fg:${em.c1};--em-bd:${em.c2}55">Nivel ${em.level + 1}</span></div>
      <div class="v14-es-sub">Nivel de profesionalismo en MCPE Addons Store</div>
      <div class="v14-es-bar"><div class="v14-es-fill" style="width:${pct}%"></div></div>
      <div class="v14-es-next">${nextTxt}</div>
      <div class="v14-es-stats">
        <div><strong>${em.addonsCount}</strong> Add-ons</div>
        <div><strong>${(em.downloads || 0).toLocaleString()}</strong> Descargas</div>
        <div><strong>${em.score.toLocaleString()}</strong> Puntos</div>
      </div>
      <div class="v14-levels-row">${levelsRow}</div>
    </div>
  </div>`;
}
window.v14EmblemShowcase = v14EmblemShowcase;

/* ============================================================
   FONDO CARICATURESCO (inyectado solo en la tienda)
   ============================================================ */
function v14CloudSVG(w) {
  return `<svg width="${w}" height="${Math.round(w * 0.42)}" viewBox="0 0 240 100" fill="#eaf2ff">
    <rect x="40" y="40" width="160" height="44" rx="6"/>
    <rect x="70" y="20" width="70" height="40" rx="6"/>
    <rect x="120" y="28" width="60" height="36" rx="6"/>
    <rect x="30" y="56" width="40" height="28" rx="6"/>
  </svg>`;
}

function v14BuildCartoonBackground() {
  if (document.getElementById('v14-cartoon-bg')) return;
  const bg = document.createElement('div');
  bg.id = 'v14-cartoon-bg';
  bg.innerHTML = `
    <div class="v14-sun"></div>
    <div class="v14-cloud v14-c1">${v14CloudSVG(200)}</div>
    <div class="v14-cloud v14-c2">${v14CloudSVG(150)}</div>
    <div class="v14-cloud v14-c3">${v14CloudSVG(260)}</div>
    <div class="v14-float v14-f1">
      <svg width="56" height="64" viewBox="0 0 56 64" aria-hidden="true">
        <polygon points="28,2 50,20 28,40 6,20" fill="#7cf3ec"/>
        <polygon points="28,2 50,20 28,24 6,20" fill="#b8fbf6"/>
        <polygon points="6,20 28,24 28,62 6,40" fill="#37c9c0"/>
        <polygon points="50,20 28,24 28,62 50,40" fill="#1fa39b"/>
      </svg>
    </div>
    <div class="v14-float v14-f2">
      <svg width="50" height="58" viewBox="0 0 50 58" aria-hidden="true">
        <rect x="22" y="2" width="10" height="34" fill="#8b5a2b"/>
        <path d="M10 2 H40 V14 H30 V22 H20 V14 H10 Z" fill="#cfd6e2"/>
        <path d="M14 6 H36 V12 H30 V18 H20 V12 H14 Z" fill="#eef2f8"/>
      </svg>
    </div>
    <div class="v14-float v14-f3">
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <polygon points="24,2 45,14 24,26 3,14" fill="#7cc349"/>
        <polygon points="3,14 24,26 24,46 3,34" fill="#6b4a2b"/>
        <polygon points="45,14 24,26 24,46 45,34" fill="#553a22"/>
      </svg>
    </div>
    <div class="v14-ground"></div>`;
  document.body.insertBefore(bg, document.body.firstChild);
}

/* ============================================================
   BLOQUE QUE SE ROMPE AL BAJAR / SE RECONSTRUYE AL SUBIR
   ============================================================ */
function v14BuildBlock() {
  if (document.getElementById('v14-block')) return;
  const el = document.createElement('div');
  el.id = 'v14-block';
  // 4 cuadrantes (piezas) de un bloque de césped/tierra + grietas progresivas
  el.innerHTML = `
    <svg viewBox="-20 -20 140 140" aria-hidden="true">
      <!-- piezas -->
      <g class="v14-piece" data-q="tl">
        <rect x="4"  y="4"  width="44" height="22" fill="#6cbf4f"/>
        <rect x="4"  y="26" width="44" height="22" fill="#7a5230"/>
        <rect x="10" y="10" width="6" height="6" fill="#5aa83f"/>
        <rect x="30" y="32" width="6" height="6" fill="#6b4527"/>
      </g>
      <g class="v14-piece" data-q="tr">
        <rect x="52" y="4"  width="44" height="22" fill="#63b447"/>
        <rect x="52" y="26" width="44" height="22" fill="#71492a"/>
        <rect x="74" y="12" width="6" height="6" fill="#54a23a"/>
        <rect x="60" y="34" width="6" height="6" fill="#62401f"/>
      </g>
      <g class="v14-piece" data-q="bl">
        <rect x="4"  y="52" width="44" height="44" fill="#7a5230"/>
        <rect x="12" y="60" width="7" height="7" fill="#6b4527"/>
        <rect x="30" y="78" width="7" height="7" fill="#8a5f38"/>
      </g>
      <g class="v14-piece" data-q="br">
        <rect x="52" y="52" width="44" height="44" fill="#71492a"/>
        <rect x="70" y="62" width="7" height="7" fill="#62401f"/>
        <rect x="80" y="80" width="7" height="7" fill="#8a5f38"/>
      </g>
      <!-- grietas (se revelan por etapa) -->
      <g stroke="#1a1208" stroke-width="2.4" fill="none" stroke-linecap="round">
        <path class="v14-crack" d="M50 6 L48 26 L52 40"/>
        <path class="v14-crack" d="M50 40 L40 52 L42 70"/>
        <path class="v14-crack" d="M50 40 L62 54 L60 72"/>
        <path class="v14-crack" d="M6 50 L26 48 L40 52"/>
        <path class="v14-crack" d="M94 50 L74 48 L60 52"/>
        <path class="v14-crack" d="M22 18 L30 30 L26 44"/>
        <path class="v14-crack" d="M78 18 L70 30 L74 44"/>
        <path class="v14-crack" d="M30 84 L42 74 L40 60"/>
        <path class="v14-crack" d="M70 84 L58 74 L60 60"/>
      </g>
    </svg>
    <span class="v14-bhint">scroll</span>`;
  document.body.appendChild(el);

  const cracks = el.querySelectorAll('.v14-crack');
  const pieces = el.querySelectorAll('.v14-piece');
  let ticking = false;

  function update() {
    ticking = false;
    const max = (document.documentElement.scrollHeight - window.innerHeight) || 1;
    const ratio = Math.max(0, Math.min(1, (window.scrollY || window.pageYOffset || 0) / max));
    // grietas: cuántas se muestran
    const shown = Math.round(ratio * cracks.length);
    cracks.forEach((c, i) => { c.style.opacity = i < shown ? '1' : '0'; });
    // separación de piezas (romper al bajar, unir al subir)
    const t = ratio * 16;        // px de separación
    const r = ratio * 10;        // rotación
    pieces.forEach(p => {
      const q = p.getAttribute('data-q');
      const sx = q === 'tl' || q === 'bl' ? -t : t;
      const sy = q === 'tl' || q === 'tr' ? -t : t;
      const rot = (q === 'tl' || q === 'br') ? -r : r;
      p.style.transform = `translate(${sx}px, ${sy}px) rotate(${rot}deg)`;
    });
    el.style.opacity = ratio > 0.98 ? '0.65' : '1';
  }

  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', update, { passive: true });
  update();
}

/* ============================================================
   INTEGRACIÓN: re-render de tarjetas/comentarios para que
   los emblemas aparezcan cuando cambien los datos.
   ============================================================ */
function v14HookRealtime() {
  // Cuando cambian add-ons (descargas/aprobaciones) los niveles pueden subir
  window.addEventListener('db-updated', () => {
    if (typeof refreshCommentsUI === 'function') { try { refreshCommentsUI(); } catch (e) {} }
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  // Solo montar fondo + bloque en la tienda (no en el panel admin)
  const isStore = !!document.getElementById('hero');
  if (isStore) {
    v14BuildCartoonBackground();
    v14BuildBlock();
  }
  v14HookRealtime();

  // Refrescar el grid de add-ons una vez (para incluir emblemas de autor)
  if (isStore && typeof applyFilters === 'function') {
    try { applyFilters(); } catch (e) {}
  }
});
