/* ============================================================
   MCPE ADDONS STORE — Asistente Virtual "Nova" (IA)
   v15.0

   Asistente conversacional profesional para la tienda. Entiende
   las preguntas del usuario (instalación, planes, pagos, subir
   contenido, perfil, etc.), busca en el catálogo y ofrece
   acciones rápidas. Funciona 100% en el navegador, sin claves ni
   servidores externos (motor de intenciones + recuperación).

   Depende de globales de app.js: State, escHtml, showToast,
   openModal, openUploadModal, openAuthModal, openAddonDetail,
   setCategory, goPricing, openProfileModal, openCommunityChat,
   window.PLANS, window.CONTENT_TYPES.
   ============================================================ */

'use strict';

(function () {
  const NAME = 'Nova';
  let opened = false;
  let greeted = false;

  const $ = id => document.getElementById(id);
  const esc = s => (window.escHtml ? window.escHtml(s) : String(s == null ? '' : s));
  const norm = s => (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // quitar acentos
    .replace(/[¿?¡!.,;:]/g, ' ').replace(/\s+/g, ' ').trim();

  /* ---------- Catálogo ---------- */
  function pool(){
    const all = (window.State && window.State.addons) || [];
    return all.filter(a => a.status !== 'pending' && a.status !== 'rejected');
  }
  const STOP = new Set(['busca','buscar','quiero','necesito','recomienda','recomiendame','recomiéndame','dame','muestra','muestrame','enseña','ensename','algun','alguna','algo','un','una','unos','unas','de','del','para','con','el','la','los','las','y','o','por','favor','me','mi','tienes','hay','sobre','que','cual','cuales','addon','addons','add-on','minecraft','mcpe','bedrock','java','quisiera','gustaria']);
  const CAT_WORDS = {
    skin:'skin', skins:'skin', mundo:'world', mundos:'world', world:'world',
    textura:'texture', texturas:'texture', mapa:'map', mapas:'map', map:'map',
    mod:'mod', mods:'mod', plugin:'plugin', plugins:'plugin',
    shader:'shader', shaders:'shader', addon:'addon'
  };

  function searchAddons(query){
    const words = norm(query).split(' ').filter(w => w.length > 2 && !STOP.has(w));
    const list = pool();
    if (!words.length){
      return list.slice().sort((a,b)=>(b.downloads||0)-(a.downloads||0)).slice(0,3);
    }
    const scored = list.map(a => {
      const hay = norm(`${a.name} ${a.description||''} ${a.contentType||a.category||''} ${a.platform||''}`);
      let score = 0;
      words.forEach(w => {
        const cat = CAT_WORDS[w];
        if (cat && (a.contentType||a.category) === cat) score += 3;
        if (hay.includes(w)) score += 2;
        if (norm(a.name).includes(w)) score += 2;
      });
      return { a, score };
    }).filter(x => x.score > 0).sort((x,y)=> y.score - x.score || (y.a.downloads||0)-(x.a.downloads||0));
    return scored.slice(0,3).map(x => x.a);
  }

  function addonCardsHTML(addons){
    if (!addons.length) return '';
    return `<div class="ai-cards">${addons.map(a => {
      const free = !a.price || Number(a.price) === 0;
      const price = free ? 'Gratis' : ('$' + Number(a.price).toFixed(2));
      const img = a.image
        ? `<img src="${esc(a.image)}" alt="" onerror="this.outerHTML='<span class=&quot;ai-card-ph&quot;><i class=&quot;fas fa-cube&quot;></i></span>'">`
        : `<span class="ai-card-ph"><i class="fas fa-cube"></i></span>`;
      return `<button type="button" class="ai-card" onclick="aiAction('addon','${a.id}')">
        <span class="ai-card-img">${img}</span>
        <span class="ai-card-info"><strong>${esc(a.name)}</strong><small>${esc(price)}</small></span>
        <i class="fas fa-arrow-right"></i>
      </button>`;
    }).join('')}</div>`;
  }

  function planSummaryHTML(){
    const plans = window.PLANS || [];
    if (!plans.length) return '';
    return `<div class="ai-plans">${plans.map(p => {
      const price = (!p.price || p.price === 0) ? 'Gratis' : ('$' + Number(p.price).toFixed(2) + '/mes');
      return `<div class="ai-plan"><i class="fas ${p.icon}" style="color:${p.color}"></i> <strong>${esc(p.name)}</strong> · ${esc(price)} · ${p.dailyUploads} subidas/día</div>`;
    }).join('')}</div>`;
  }

  /* ---------- Acciones rápidas ---------- */
  function aiAction(kind, arg){
    const close = () => toggleAssistant(false);
    const scrollTo = id => { const el = $(id); if (el) el.scrollIntoView({ behavior:'smooth' }); };
    switch (kind){
      case 'plans':     close(); (window.goPricing ? goPricing() : scrollTo('pricing')); break;
      case 'upload':    close(); (window.State && State.user) ? (window.openUploadModal && openUploadModal()) : (window.openAuthModal && openAuthModal('login')); break;
      case 'profile':   close(); window.openProfileModal && openProfileModal(); break;
      case 'login':     close(); window.openAuthModal && openAuthModal('login'); break;
      case 'community': close(); window.openCommunityChat && openCommunityChat(); break;
      case 'free':      close(); window.setCategory && setCategory('free'); scrollTo('addons'); break;
      case 'category':  close(); window.setCategory && setCategory(arg); scrollTo('addons'); break;
      case 'addon':     close(); window.openAddonDetail && openAddonDetail(arg); break;
      case 'explore':   close(); scrollTo('addons'); break;
    }
  }
  window.aiAction = aiAction;

  /* ---------- Motor de intenciones ---------- */
  const INTENTS = [
    { id:'greet', re:/\b(hola|buenas|hey|holi|saludos|que tal|qué tal|buenos dias|buenas tardes|buenas noches)\b/,
      reply:() => ({ text:`¡Hola! Soy <strong>${NAME}</strong>, tu asistente de MCPE Addons Store. Puedo ayudarte a encontrar contenido, explicarte los planes, o guiarte para subir tu propio add-on. ¿Qué necesitas?`, chips:DEFAULT_CHIPS }) },

    { id:'who', re:/\b(quien eres|quién eres|que eres|qué eres|como te llamas|cómo te llamas|tu nombre|eres un bot|eres una ia)\b/,
      reply:() => ({ text:`Soy <strong>${NAME}</strong>, el asistente virtual de la tienda. Conozco el catálogo, los planes y cómo funciona todo. Pregúntame con confianza 🙂`, chips:DEFAULT_CHIPS }) },

    { id:'install', re:/\b(instal|como uso|cómo uso|como se usa|importar|mcaddon|mcpack|mcworld|abrir el archivo|no me funciona el addon)\b/,
      reply:() => ({ text:`<strong>Cómo instalar:</strong><br>• <u>Minecraft PE / Bedrock</u>: descarga el archivo <strong>.mcaddon</strong> o <strong>.mcpack</strong> y ábrelo; Minecraft lo importa solo. Luego actívalo en los ajustes del mundo.<br>• <u>Java</u>: coloca el archivo en la carpeta correcta (<em>mods</em>, <em>resourcepacks</em>, <em>saves</em>) según el tipo.`, chips:['Ver catálogo','¿Es gratis?'] }) },

    { id:'plans', re:/\b(plan|planes|precio|precios|cuesta|cuanto vale|cuánto vale|premium|suscrip|creator|pro|mejorar mi plan|membresia|membresía)\b/,
      reply:() => ({ text:`Tenemos estos planes para creadores:`, extra:planSummaryHTML(), actions:[{ label:'Ver planes', kind:'plans', icon:'fa-crown' }], chips:['¿Cómo subo contenido?','¿El pago es seguro?'] }) },

    { id:'upload', re:/\b(subir|publicar|cargar|compartir mi|mi addon|mi contenido|vender|como subo|cómo subo|quiero subir)\b/,
      reply:() => ({ text:`Para publicar tu contenido: inicia sesión, abre <strong>Subir Add-on</strong>, completa el formulario y envíalo. El equipo lo revisa antes de publicarlo. El número de subidas por día depende de tu plan.`, actions:[{ label:'Subir Add-on', kind:'upload', icon:'fa-cloud-arrow-up' }], chips:['Ver planes','Editar mi perfil'] }) },

    { id:'free', re:/\b(gratis|gratuito|free|sin pagar|no quiero pagar|gratuitos)\b/,
      reply:() => ({ text:`¡La mayoría del contenido es gratis y se descarga al instante! Puedo mostrarte solo lo gratuito si quieres.`, actions:[{ label:'Ver gratis', kind:'free', icon:'fa-gift' }], chips:['Recomiéndame algo','¿Cómo instalo?'] }) },

    { id:'payment', re:/\b(pago|pagar|paypal|tarjeta|seguro|reembolso|factura|metodo de pago|método de pago|estafa)\b/,
      reply:() => ({ text:`Los pagos del contenido y planes premium se procesan de forma <strong>segura con PayPal</strong>. Nunca guardamos los datos de tu tarjeta. La activación es inmediata tras el pago.`, chips:['Ver planes','¿Es gratis?'] }) },

    { id:'profile', re:/\b(perfil|mi cuenta|mi avatar|cambiar foto|editar perfil|marco|insignia|bandera|seleccion|selección)\b/,
      reply:() => ({ text:`En tu perfil puedes cambiar tu foto, biografía, enlace, marco de avatar y tu selección del Mundial 2026. También ves tu plan y tus add-ons.`, actions:[{ label:'Abrir mi perfil', kind:'profile', icon:'fa-id-badge' }], chips:['Ver planes','Subir Add-on'] }) },

    { id:'community', re:/\b(opinar|opinion|opinión|valorar|valoracion|valoración|estrella|comentar|comunidad|chat|feedback|reseña|resena)\b/,
      reply:() => ({ text:`Puedes valorar la página con estrellas y comentar con la comunidad en el chat en vivo. ¡Tu opinión nos ayuda muchísimo!`, actions:[{ label:'Abrir chat de comunidad', kind:'community', icon:'fa-comments' }], chips:['Ver catálogo'] }) },

    { id:'categories', re:/\b(que hay|qué hay|catalogo|catálogo|categoria|categoría|tipos|que tienen|qué tienen|que puedo descargar)\b/,
      reply:() => ({ text:`Tenemos add-ons, skins, mundos, texturas, mapas, mods, plugins y shaders, para Minecraft PE (Bedrock) y Java. ¿Qué te interesa?`,
        chips:['Skins','Mundos','Texturas','Mods'], actions:[{ label:'Explorar catálogo', kind:'explore', icon:'fa-compass' }] }) },

    { id:'thanks', re:/\b(gracias|thank|genial|perfecto|excelente|buenisimo|buenísimo)\b/,
      reply:() => ({ text:`¡Con gusto! Si necesitas algo más, aquí estoy 💚`, chips:DEFAULT_CHIPS }) },

    { id:'bye', re:/\b(adios|adiós|chau|bye|hasta luego|nos vemos)\b/,
      reply:() => ({ text:`¡Hasta pronto! Que disfrutes tu Minecraft 🎮`, chips:[] }) }
  ];

  const DEFAULT_CHIPS = ['Recomiéndame add-ons','Ver planes','¿Cómo instalo?','Subir contenido'];

  function getReply(raw){
    const text = norm(raw);
    // Intención explícita de búsqueda/recomendación
    if (/\b(recomien|busca|buscar|quiero|necesito|muestra|dame|tienes|algun|algún|mapa de|skin de|addon de|mundo de)\b/.test(text)){
      const results = searchAddons(raw);
      if (results.length){
        return { text:`Esto es lo que encontré para ti:`, cards:results, chips:['Ver catálogo','Ver planes'] };
      }
      return { text:`No encontré coincidencias exactas, pero puedes explorar todo el catálogo o decirme qué tipo buscas (skin, mundo, mod...).`, actions:[{ label:'Explorar catálogo', kind:'explore', icon:'fa-compass' }], chips:['Skins','Mundos','Mods'] };
    }
    for (const it of INTENTS){ if (it.re.test(text)) return it.reply(); }

    // Búsqueda implícita: ¿coincide con algún add-on?
    const results = searchAddons(raw);
    if (results.length && norm(raw).split(' ').some(w => w.length > 2 && !STOP.has(w))){
      return { text:`Quizá te interese esto:`, cards:results, chips:DEFAULT_CHIPS };
    }
    return { text:`No estoy seguro de haber entendido 🤔. Puedo ayudarte con el catálogo, los planes, los pagos, subir contenido o tu perfil. Elige una opción:`, chips:DEFAULT_CHIPS };
  }

  /* ---------- Render ---------- */
  function time(){ return new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }); }

  function pushUser(text){
    const box = $('ai-messages'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'ai-msg ai-user';
    el.innerHTML = `<div class="ai-bubble">${esc(text)}</div><span class="ai-time">${time()}</span>`;
    box.appendChild(el); box.scrollTop = box.scrollHeight;
  }
  function pushBot(reply){
    const box = $('ai-messages'); if (!box) return;
    let actions = '';
    if (reply.actions && reply.actions.length){
      actions = `<div class="ai-actions">${reply.actions.map(a =>
        `<button type="button" class="ai-act-btn" onclick="aiAction('${a.kind}'${a.arg ? `,'${a.arg}'` : ''})"><i class="fas ${a.icon||'fa-arrow-right'}"></i> ${esc(a.label)}</button>`).join('')}</div>`;
    }
    const cards = reply.cards ? addonCardsHTML(reply.cards) : '';
    const el = document.createElement('div');
    el.className = 'ai-msg ai-bot';
    el.innerHTML = `<span class="ai-msg-avatar"><i class="fas fa-robot"></i></span>
      <div class="ai-bubble-wrap">
        <div class="ai-bubble">${reply.text}</div>
        ${reply.extra || ''}${cards}${actions}
        <span class="ai-time">${time()}</span>
      </div>`;
    box.appendChild(el); box.scrollTop = box.scrollHeight;
    renderChips(reply.chips || DEFAULT_CHIPS);
  }
  function typing(on){
    const box = $('ai-messages'); if (!box) return;
    let t = $('ai-typing');
    if (on){
      if (t) return;
      t = document.createElement('div'); t.id = 'ai-typing'; t.className = 'ai-msg ai-bot';
      t.innerHTML = `<span class="ai-msg-avatar"><i class="fas fa-robot"></i></span><div class="ai-bubble ai-dots"><span></span><span></span><span></span></div>`;
      box.appendChild(t); box.scrollTop = box.scrollHeight;
    } else if (t){ t.remove(); }
  }
  function renderChips(chips){
    const wrap = $('ai-quick'); if (!wrap) return;
    wrap.innerHTML = (chips || []).map(c => `<button type="button" class="ai-chip" onclick="aiChip('${esc(c).replace(/'/g,"\\'")}')">${esc(c)}</button>`).join('');
  }

  function respondTo(text){
    pushUser(text);
    typing(true);
    const reply = getReply(text);
    setTimeout(() => { typing(false); pushBot(reply); }, 480 + Math.random()*420);
  }

  function aiSend(){
    const inp = $('ai-input'); if (!inp) return;
    const text = (inp.value || '').trim();
    if (!text) return;
    inp.value = '';
    respondTo(text);
  }
  function aiKey(e){ if (e.key === 'Enter'){ e.preventDefault(); aiSend(); } }
  function aiChip(text){ respondTo(text); }

  function greet(){
    if (greeted) return; greeted = true;
    typing(true);
    setTimeout(() => {
      typing(false);
      pushBot({ text:`¡Hola! 👋 Soy <strong>${NAME}</strong>, tu asistente de MCPE Addons Store. Estoy aquí para ayudarte a encontrar contenido, entender los planes o subir tu propio add-on. ¿En qué te ayudo hoy?`, chips:DEFAULT_CHIPS });
    }, 350);
  }

  function toggleAssistant(force){
    const w = $('ai-widget'); if (!w) return;
    opened = (force === undefined) ? !w.classList.contains('open') : !!force;
    w.classList.toggle('open', opened);
    if (opened){
      greet();
      const inp = $('ai-input'); if (inp) setTimeout(()=>inp.focus(), 160);
    }
  }

  /* ---------- Exponer ---------- */
  window.toggleAssistant = toggleAssistant;
  window.aiSend = aiSend;
  window.aiKey = aiKey;
  window.aiChip = aiChip;
})();
