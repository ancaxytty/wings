/* ============================================================
   MCPE ADDONS STORE — Comunidad (chat online + valoración)
   v14.0

   Chat en tiempo real para que la comunidad opine sobre la
   página web. Usa Firebase Realtime Database si está disponible
   (window.fbDB); si no, funciona en modo LOCAL (localStorage +
   sincronización entre pestañas del mismo navegador).

   Depende de helpers globales de app.js: State, escHtml,
   showToast, userAvatar, userDisplayName, frameClass, FLAG_URL,
   openAuthModal.
   ============================================================ */

'use strict';

(function () {
  const MSG_MAX      = 280;
  const MSG_KEEP     = 120;     // máximo de mensajes que conservamos
  const SEND_COOLDOWN = 2500;   // ms entre envíos (anti-spam)
  const NODE_CHAT    = 'mcpe_chat';
  const NODE_RATING  = 'mcpe_ratings';
  const LS_CHAT      = 'mcpe_chat_local';
  const LS_RATING    = 'mcpe_ratings_local';
  const LS_SEEN      = 'mcpe_chat_seen';

  let messages = [];
  let ratings  = {};
  let lastSendAt = 0;
  let panelOpen = false;
  const CLOUD = !!(window.FIREBASE_READY && window.fbDB);

  /* ---------- Helpers ---------- */
  const $ = id => document.getElementById(id);
  function esc(s){ return (window.escHtml ? window.escHtml(s) : String(s || '')); }
  function curUser(){ return window.State && window.State.user; }

  function timeAgo(ts){
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'ahora';
    const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
    const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24); if (d < 7) return `hace ${d} d`;
    try { return new Date(ts).toLocaleDateString('es-ES', { day:'numeric', month:'short' }); }
    catch { return ''; }
  }

  /* ---------- Backend (nube o local) ---------- */
  function subscribe(){
    if (CLOUD){
      window.fbDB.ref(NODE_CHAT).limitToLast(MSG_KEEP).on('value', snap => {
        const val = snap.val() || {};
        messages = Object.keys(val).map(k => ({ id:k, ...val[k] })).sort((a,b)=>(a.ts||0)-(b.ts||0));
        renderMessages();
      });
      window.fbDB.ref(NODE_RATING).on('value', snap => { ratings = snap.val() || {}; renderRatings(); });
    } else {
      readLocal(); renderMessages(); renderRatings();
      window.addEventListener('storage', e => {
        if (e.key === LS_CHAT || e.key === LS_RATING){ readLocal(); renderMessages(); renderRatings(); }
      });
      setInterval(() => { readLocal(); renderMessages(); renderRatings(); }, 2500);
    }
  }
  function readLocal(){
    try { messages = JSON.parse(localStorage.getItem(LS_CHAT)) || []; } catch { messages = []; }
    try { ratings  = JSON.parse(localStorage.getItem(LS_RATING)) || {}; } catch { ratings = {}; }
  }
  function pushMessage(msg){
    if (CLOUD){ return window.fbDB.ref(NODE_CHAT).push(msg); }
    messages.push({ id: 'm_' + Date.now(), ...msg });
    if (messages.length > MSG_KEEP) messages = messages.slice(-MSG_KEEP);
    try { localStorage.setItem(LS_CHAT, JSON.stringify(messages)); } catch {}
    renderMessages();
    return Promise.resolve();
  }
  function writeRating(uid, stars){
    if (CLOUD){ return window.fbDB.ref(NODE_RATING + '/' + uid).set(stars); }
    ratings[uid] = stars;
    try { localStorage.setItem(LS_RATING, JSON.stringify(ratings)); } catch {}
    renderRatings();
    return Promise.resolve();
  }

  /* ---------- Valoración ---------- */
  function ratingStats(){
    const vals = Object.values(ratings).map(Number).filter(n => n >= 1 && n <= 5);
    const count = vals.length;
    const avg = count ? (vals.reduce((a,b)=>a+b,0) / count) : 0;
    return { count, avg };
  }
  function starsHTML(value, interactive){
    let h = '';
    for (let i = 1; i <= 5; i++){
      const on = value >= i - 0.25;
      const half = !on && value >= i - 0.75;
      const cls = on ? 'fas fa-star' : (half ? 'fas fa-star-half-stroke' : 'far fa-star');
      h += interactive
        ? `<button type="button" class="star-btn" onclick="rateSite(${i})" aria-label="${i} estrellas"><i class="${cls}"></i></button>`
        : `<i class="${cls}"></i>`;
    }
    return h;
  }
  function renderRatings(){
    const { count, avg } = ratingStats();
    const u = curUser();
    const mine = u && ratings[u.id] ? Number(ratings[u.id]) : 0;

    const summary = `
      <div class="rating-score">${avg ? avg.toFixed(1) : '—'}</div>
      <div class="rating-stars">${starsHTML(avg, false)}</div>
      <div class="rating-count">${count} ${count === 1 ? 'opinión' : 'opiniones'}</div>`;
    const secSum = $('community-rating-summary'); if (secSum) secSum.innerHTML = summary;

    const myStars = $('community-my-rating');
    if (myStars){
      myStars.innerHTML = u
        ? `<span class="rate-label">${mine ? 'Tu valoración:' : '¿Te gusta la página?'}</span>${starsHTML(mine, true)}`
        : `<span class="rate-label">Inicia sesión para valorar la página</span>`;
    }
    const chatSum = $('chat-rating-mini');
    if (chatSum) chatSum.innerHTML = `<i class="fas fa-star"></i> ${avg ? avg.toFixed(1) : '—'} <small>(${count})</small>`;
  }
  function rateSite(stars){
    const u = curUser();
    if (!u){ if (window.openAuthModal) openAuthModal('login'); window.showToast && showToast('Inicia sesión para valorar.', 'info'); return; }
    writeRating(u.id, stars).then(() => window.showToast && showToast('¡Gracias por tu valoración!', 'success'))
      .catch(() => window.showToast && showToast('No se pudo guardar tu valoración.', 'error'));
  }

  /* ---------- Mensajes ---------- */
  function messageHTML(m, mine){
    const av = m.avatar || '';
    const fr = m.frame && m.frame !== 'none' ? ('av-frame av-' + m.frame) : '';
    const flag = (m.country && window.FLAG_URL) ? `<img class="cm-flag" src="${window.FLAG_URL(m.country)}" alt="" loading="lazy">` : '';
    return `
      <div class="chat-msg ${mine ? 'mine' : ''}">
        <img class="cm-avatar ${fr}" src="${esc(av)}" alt="" onerror="this.style.visibility='hidden'">
        <div class="cm-body">
          <div class="cm-head"><strong>${esc(m.name || 'Usuario')}</strong>${flag}<span class="cm-time">${timeAgo(m.ts || Date.now())}</span></div>
          <div class="cm-text">${esc(m.text)}</div>
        </div>
      </div>`;
  }
  function renderMessages(){
    const u = curUser();
    const box = $('chat-messages');
    if (box){
      if (!messages.length){
        box.innerHTML = `<div class="chat-empty"><i class="fas fa-comments"></i><p>Sé el primero en opinar sobre la página.</p></div>`;
      } else {
        const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        box.innerHTML = messages.map(m => messageHTML(m, u && m.uid === u.id)).join('');
        if (atBottom || panelOpen) box.scrollTop = box.scrollHeight;
      }
    }
    // Vista previa en la sección Comunidad (últimos 4)
    const feed = $('community-feed');
    if (feed){
      const last = messages.slice(-4);
      feed.innerHTML = last.length
        ? last.map(m => messageHTML(m, u && m.uid === u.id)).join('')
        : `<div class="chat-empty"><i class="fas fa-comments"></i><p>Aún no hay mensajes. ¡Abre el chat y comenta!</p></div>`;
    }
    renderComposer();
    updateBadge();
  }
  function renderComposer(){
    const wrap = $('chat-composer');
    if (!wrap) return;
    const u = curUser();
    if (u){
      wrap.innerHTML = `
        <textarea id="chat-input" rows="1" maxlength="${MSG_MAX}" placeholder="Escribe tu opinión..." onkeydown="chatKey(event)" oninput="chatGrow(this)"></textarea>
        <button type="button" class="chat-send" onclick="sendChat()" aria-label="Enviar"><i class="fas fa-paper-plane"></i></button>`;
    } else {
      wrap.innerHTML = `
        <button type="button" class="btn btn-primary btn-full" onclick="openAuthModal('login')">
          <i class="fas fa-right-to-bracket"></i> Inicia sesión para participar
        </button>`;
    }
  }

  function sendChat(){
    const u = curUser();
    if (!u){ if (window.openAuthModal) openAuthModal('login'); return; }
    const input = $('chat-input');
    if (!input) return;
    let text = (input.value || '').trim().replace(/\s{3,}/g, '  ');
    if (!text){ return; }
    if (text.length > MSG_MAX) text = text.slice(0, MSG_MAX);
    const now = Date.now();
    if (now - lastSendAt < SEND_COOLDOWN){ window.showToast && showToast('Espera un momento antes de enviar otro mensaje.', 'warning'); return; }
    lastSendAt = now;
    const msg = {
      uid: u.id,
      name: window.userDisplayName ? userDisplayName(u) : (u.name || 'Usuario'),
      avatar: window.userAvatar ? userAvatar(u) : (u.avatar || ''),
      frame: u.frame || 'none',
      country: u.country || '',
      text,
      ts: now
    };
    input.value = ''; chatGrow(input);
    pushMessage(msg).catch(() => window.showToast && showToast('No se pudo enviar el mensaje.', 'error'));
  }
  function chatKey(e){
    if (e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendChat(); }
  }
  function chatGrow(el){
    if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(96, el.scrollHeight) + 'px';
  }

  /* ---------- Panel ---------- */
  function toggleChat(force){
    const w = $('chat-widget');
    if (!w) return;
    panelOpen = (force === undefined) ? !w.classList.contains('open') : !!force;
    w.classList.toggle('open', panelOpen);
    if (panelOpen){
      markSeen();
      const box = $('chat-messages');
      if (box) box.scrollTop = box.scrollHeight;
      const input = $('chat-input'); if (input) setTimeout(()=>input.focus(), 120);
    }
    updateBadge();
  }
  function openCommunityChat(){ toggleChat(true); const w=$('chat-widget'); if(w) w.scrollIntoView ? null : null; }

  function markSeen(){ try { localStorage.setItem(LS_SEEN, String(messages.length)); } catch {} }
  function updateBadge(){
    const badge = $('chat-badge');
    if (!badge) return;
    let seen = 0; try { seen = parseInt(localStorage.getItem(LS_SEEN) || '0', 10) || 0; } catch {}
    const unread = panelOpen ? 0 : Math.max(0, messages.length - seen);
    if (panelOpen) markSeen();
    if (unread > 0){ badge.style.display = 'grid'; badge.textContent = unread > 9 ? '9+' : String(unread); }
    else { badge.style.display = 'none'; }
  }

  /* ---------- Init ---------- */
  function init(){
    subscribe();
    renderComposer();
    window.addEventListener('auth-changed', () => { renderComposer(); renderRatings(); renderMessages(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ---------- Exponer ---------- */
  window.toggleChat = toggleChat;
  window.openCommunityChat = openCommunityChat;
  window.sendChat = sendChat;
  window.chatKey = chatKey;
  window.chatGrow = chatGrow;
  window.rateSite = rateSite;
})();
