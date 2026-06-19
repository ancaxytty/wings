/* ============================================================
   MCPE ADDONS STORE — v13.0
   Carrito de compras · Vouchers · Cupones de descuento ·
   Slider rotativo de juegos · Comentarios en tiempo real ·
   Anuncios profesionales
   ------------------------------------------------------------
   Módulo autónomo: se apoya en las APIs ya existentes
   (DB, State, showToast, openModal/closeModal, escHtml, PayPal).
   ============================================================ */

'use strict';

/* ============================================================
   DBX — almacenamiento en tiempo real para las claves nuevas
   (comentarios, cupones, anuncios). Usa Firebase si está
   disponible; si no, localStorage con sincronización entre
   pestañas + sondeo. Mantiene una API síncrona get()/set().
   ============================================================ */
const V13_KEYS = {
  COMMENTS:  'mcpe_comments',
  COUPONS:   'mcpe_coupons',
  ADS:       'mcpe_ads'
};

const DBX = (() => {
  const cache = {};
  const firstSnap = {};   // key -> bool (ya llegó el primer dato de la nube)
  const pendingSeed = {}; // key -> defaults a sembrar si la nube está vacía
  let rtdb = null;
  const ready = (typeof firebase !== 'undefined') &&
                window.CLOUD_STATUS && window.CLOUD_STATUS.ready;

  function prime(key) {
    try { cache[key] = JSON.parse(localStorage.getItem(key)) || []; }
    catch { cache[key] = []; }
    if (!Array.isArray(cache[key])) cache[key] = [];
  }
  Object.values(V13_KEYS).forEach(prime);

  function emit(key) {
    try { window.dispatchEvent(new CustomEvent('dbx-updated', { detail: { key, data: cache[key] } })); }
    catch (e) { /* noop */ }
  }

  function doSet(key, data) {
    cache[key] = data;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
    emit(key);
    if (rtdb) return rtdb.ref(key).set(data).catch(err => { console.warn('[v13] guardado nube falló:', err); });
    return Promise.resolve();
  }

  if (ready) {
    try {
      rtdb = firebase.database();
      Object.values(V13_KEYS).forEach(key => {
        rtdb.ref(key).on('value', snap => {
          let val = snap.val();
          if (val === null || val === undefined) val = [];
          else if (!Array.isArray(val)) val = Object.values(val);
          cache[key] = val;
          try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
          // Sembrar valores por defecto SOLO tras conocer el estado real de la nube
          if (!firstSnap[key]) {
            firstSnap[key] = true;
            if (!val.length && pendingSeed[key]) { doSet(key, pendingSeed[key]); pendingSeed[key] = null; return; }
          }
          emit(key);
        }, err => console.warn('[v13] lectura nube falló (' + key + '):', err));
      });
    } catch (e) { console.warn('[v13] Firebase no disponible para DBX:', e); rtdb = null; }
  } else {
    // Sincronización entre pestañas del mismo navegador
    window.addEventListener('storage', e => {
      if (e.key && Object.values(V13_KEYS).includes(e.key)) {
        try { cache[e.key] = JSON.parse(e.newValue) || []; } catch {}
        emit(e.key);
      }
    });
  }

  return {
    get(key) { return Array.isArray(cache[key]) ? cache[key] : []; },
    set(key, data) { return doSet(key, data); },
    // Siembra valores por defecto sin pisar datos ya existentes en la nube
    seedIfEmpty(key, defaults) {
      if (rtdb) {
        if (firstSnap[key]) { if (!this.get(key).length) doSet(key, defaults); }
        else { pendingSeed[key] = defaults; }   // esperar al primer snapshot
      } else if (!this.get(key).length) {
        doSet(key, defaults);
      }
    },
    on(cb) { window.addEventListener('dbx-updated', e => cb(e.detail.key, e.detail.data)); }
  };
})();
window.DBX = DBX;
window.V13_KEYS = V13_KEYS;

/* ============================================================
   CUPONES DE DESCUENTO
   ============================================================ */
const DEFAULT_COUPONS = [
  { code: 'BIENVENIDO15', type: 'percent', value: 15, active: true, desc: 'Bienvenida -15%' },
  { code: 'MCPE10',       type: 'percent', value: 10, active: true, desc: '-10% en todo' },
  { code: 'VZOM25',       type: 'percent', value: 25, active: true, desc: 'Especial -25%' },
  { code: 'PE5',          type: 'fixed',   value: 5,  active: true, desc: '-$5 USD' }
];

function v13SeedCoupons() {
  DBX.seedIfEmpty(V13_KEYS.COUPONS, DEFAULT_COUPONS);
}

function getCoupon(code) {
  if (!code) return null;
  const norm = String(code).trim().toUpperCase();
  return DBX.get(V13_KEYS.COUPONS).find(c => c.code.toUpperCase() === norm && c.active !== false) || null;
}

function discountAmount(coupon, subtotal) {
  if (!coupon) return 0;
  let d = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
  return Math.min(Math.max(0, d), subtotal);
}

/* ============================================================
   CARRITO DE COMPRAS
   ============================================================ */
const Cart = {
  items: [],          // [{ id, name, price, image, qty }]
  coupon: null,

  _key() { return 'mcpe_cart_' + ((window.State && State.user && State.user.id) || 'guest'); },

  load() {
    try { this.items = JSON.parse(localStorage.getItem(this._key())) || []; }
    catch { this.items = []; }
    if (!Array.isArray(this.items)) this.items = [];
  },
  save() {
    try { localStorage.setItem(this._key(), JSON.stringify(this.items)); } catch (e) {}
    this.refresh();
  },
  count() { return this.items.reduce((s, i) => s + (i.qty || 1), 0); },
  subtotal() { return this.items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.qty || 1), 0); },
  discount() { return discountAmount(this.coupon, this.subtotal()); },
  total() { return Math.max(0, this.subtotal() - this.discount()); },

  add(addon, qty = 1) {
    const price = parseFloat(addon.price) || 0;
    if (price <= 0) { showToast('Este contenido es gratis, ¡descárgalo directamente!', 'info'); return; }
    if (window.State && typeof hasPurchased === 'function' && hasPurchased(addon.id)) {
      showToast('Ya tienes este add-on en tus compras.', 'info'); return;
    }
    const ex = this.items.find(i => i.id === addon.id);
    if (ex) { ex.qty = (ex.qty || 1) + qty; }
    else {
      this.items.push({ id: addon.id, name: addon.name, price, image: addon.image || '', qty });
    }
    this.save();
    showToast(`"${addon.name}" agregado al carrito.`, 'success');
    bumpCartIcon();
  },
  remove(id) { this.items = this.items.filter(i => i.id !== id); this.save(); renderCart(); },
  setQty(id, qty) {
    const it = this.items.find(i => i.id === id);
    if (!it) return;
    it.qty = Math.max(1, qty);
    this.save(); renderCart();
  },
  clear() { this.items = []; this.coupon = null; this.save(); },

  refresh() {
    const n = this.count();
    document.querySelectorAll('.cart-count').forEach(b => {
      b.textContent = n;
      b.classList.toggle('show', n > 0);
    });
  }
};
window.Cart = Cart;

function bumpCartIcon() {
  document.querySelectorAll('.cart-btn').forEach(btn => {
    btn.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }],
      { duration: 320, easing: 'ease-out' }
    );
  });
}

function cartAdd(id) {
  const addon = (window.State && State.addons || []).find(a => a.id === id);
  if (!addon) { showToast('No se encontró el add-on.', 'error'); return; }
  Cart.add(addon);
}
window.cartAdd = cartAdd;

function openCart() { Cart.load(); renderCart(); document.getElementById('cart-drawer')?.classList.add('open'); document.getElementById('cart-drawer-backdrop')?.classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cart-drawer')?.classList.remove('open'); document.getElementById('cart-drawer-backdrop')?.classList.remove('open'); document.body.style.overflow = ''; }
window.openCart = openCart;
window.closeCart = closeCart;

function renderCart() {
  const body = document.getElementById('cart-body');
  const foot = document.getElementById('cart-foot');
  if (!body || !foot) return;

  const headCount = document.getElementById('cart-head-count');
  const n = Cart.count();
  if (headCount) headCount.textContent = n ? n : '';

  if (!Cart.items.length) {
    body.innerHTML = `<div class="cart-empty">
        <div class="cart-empty-ic"><i class="fas fa-bag-shopping"></i></div>
        <p>Tu carrito está vacío</p>
        <small>Explora el catálogo y agrega add-ons premium para comprarlos juntos.</small>
        <button class="btn btn-primary cart-explore-btn" onclick="closeCart();document.getElementById('addons')&&document.getElementById('addons').scrollIntoView({behavior:'smooth'})"><i class="fas fa-store"></i> Explorar productos</button>
      </div>`;
    foot.style.display = 'none';
    return;
  }
  foot.style.display = 'block';

  const lines = Cart.items.map(i => {
    const a = (window.State && State.addons || []).find(x => x.id === i.id) || {};
    const cat = (typeof typeName === 'function' && typeName(a.contentType || a.category)) || 'Add-on';
    const plat = a.platform === 'java' ? 'Java' : (a.platform ? 'Bedrock' : '');
    const unit = parseFloat(i.price) || 0;
    const qty = i.qty || 1;
    return `
    <div class="cart-line">
      <div class="cart-line-thumb">${i.image ? `<img src="${escHtml(i.image)}" alt="${escHtml(i.name)}" loading="lazy" onerror="this.parentNode.classList.add('noimg')">` : ''}</div>
      <div class="cart-line-main">
        <div class="cart-line-top">
          <div class="cart-line-name">${escHtml(i.name)}</div>
          <button class="cart-line-remove" onclick="Cart.remove('${i.id}')" title="Quitar"><i class="fas fa-trash-can"></i></button>
        </div>
        <div class="cart-line-meta">${escHtml(cat)}${plat ? ' · ' + plat : ''} <span class="cart-line-digital"><i class="fas fa-bolt"></i> Entrega digital</span></div>
        <div class="cart-line-bottom">
          <div class="qty-stepper">
            <button onclick="Cart.setQty('${i.id}',${qty - 1})" aria-label="Menos" ${qty <= 1 ? 'disabled' : ''}><i class="fas fa-minus"></i></button>
            <span>${qty}</span>
            <button onclick="Cart.setQty('${i.id}',${qty + 1})" aria-label="Más"><i class="fas fa-plus"></i></button>
          </div>
          <div class="cart-line-price">
            ${qty > 1 ? `<span class="unit">$${unit.toFixed(2)} c/u</span>` : ''}
            <strong>$${(unit * qty).toFixed(2)}</strong>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');

  body.innerHTML = `<div class="cart-lines">${lines}</div>` + renderCartRecommendations();

  renderCartTotals();
  renderCartCheckout();
}

function renderCartRecommendations() {
  if (!(window.State && State.addons)) return '';
  const inCart = new Set(Cart.items.map(i => i.id));
  const recs = State.addons
    .filter(a => a.status !== 'pending' && a.status !== 'rejected' && parseFloat(a.price) > 0 && !inCart.has(a.id))
    .sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
    .slice(0, 3);
  if (!recs.length) return '';
  return `
    <div class="cart-recs">
      <div class="cart-recs-title"><i class="fas fa-wand-magic-sparkles"></i> También te puede gustar</div>
      <div class="cart-recs-list">
        ${recs.map(a => `
          <div class="cart-rec">
            <div class="cart-rec-thumb">${a.image ? `<img src="${escHtml(a.image)}" alt="" loading="lazy" onerror="this.parentNode.classList.add('noimg')">` : ''}</div>
            <div class="cart-rec-info">
              <div class="cart-rec-name">${escHtml(a.name)}</div>
              <div class="cart-rec-price">$${parseFloat(a.price).toFixed(2)}</div>
            </div>
            <button class="cart-rec-add" onclick="cartAdd('${a.id}')" title="Agregar al carrito"><i class="fas fa-plus"></i></button>
          </div>`).join('')}
      </div>
    </div>`;
}
window.renderCartRecommendations = renderCartRecommendations;

function renderCartTotals() {
  const sub = Cart.subtotal(), disc = Cart.discount(), tot = Cart.total();
  const el = document.getElementById('cart-totals');
  if (el) {
    el.innerHTML = `
      <div class="row"><span>Subtotal (${Cart.count()} art.)</span><span>$${sub.toFixed(2)}</span></div>
      ${disc > 0 ? `<div class="row disc"><span><i class="fas fa-tag"></i> Descuento (${escHtml(Cart.coupon.code)})</span><span>-$${disc.toFixed(2)}</span></div>` : ''}
      <div class="row"><span>Entrega digital</span><span class="free-txt">Gratis</span></div>
      <div class="row total"><span>Total</span><span>$${tot.toFixed(2)} <em>USD</em></span></div>`;
  }
  const applied = document.getElementById('coupon-applied');
  if (applied) {
    if (Cart.coupon) {
      applied.classList.add('show');
      applied.querySelector('.ca-text').innerHTML = `<i class="fas fa-circle-check"></i> Cupón <strong>${escHtml(Cart.coupon.code)}</strong> aplicado`;
    } else { applied.classList.remove('show'); }
  }
}

function applyCoupon() {
  const inp = document.getElementById('coupon-input');
  const msg = document.getElementById('coupon-msg');
  const code = (inp && inp.value || '').trim();
  if (!code) return;
  const c = getCoupon(code);
  if (!c) {
    if (msg) { msg.className = 'coupon-msg err'; msg.innerHTML = '<i class="fas fa-circle-xmark"></i> Cupón inválido o expirado'; }
    return;
  }
  Cart.coupon = c;
  if (inp) inp.value = '';
  if (msg) { msg.className = 'coupon-msg ok'; msg.innerHTML = `<i class="fas fa-circle-check"></i> ${escHtml(c.desc || ('Descuento ' + (c.type === 'percent' ? c.value + '%' : '$' + c.value)))}`; }
  renderCartTotals();
  renderCartCheckout();
  showToast('Cupón aplicado correctamente.', 'success');
}
function removeCoupon() {
  Cart.coupon = null;
  const msg = document.getElementById('coupon-msg'); if (msg) msg.className = 'coupon-msg';
  renderCartTotals(); renderCartCheckout();
}
window.applyCoupon = applyCoupon;
window.removeCoupon = removeCoupon;

function renderCartCheckout() {
  const cont = document.getElementById('cart-paypal-container');
  const note = document.getElementById('cart-login-note');
  if (!cont) return;
  cont.innerHTML = '';

  if (!(window.State && State.user)) {
    if (note) { note.style.display = 'block'; note.innerHTML = '<i class="fas fa-circle-info"></i> Inicia sesión para completar tu compra.'; }
    cont.innerHTML = `<button class="btn btn-primary btn-full" onclick="closeCart();openAuthModal('login')"><i class="fas fa-right-to-bracket"></i> Iniciar sesión</button>`;
    return;
  }
  if (note) note.style.display = 'none';

  const total = Cart.total();
  if (total <= 0) {
    // Compra 100% cubierta por el cupón
    cont.innerHTML = `<button class="btn btn-success btn-full" onclick="completeCartPurchase(null)"><i class="fas fa-gift"></i> Finalizar (gratis con cupón)</button>`;
    return;
  }

  if (typeof paypal === 'undefined') {
    cont.innerHTML = `<div style="text-align:center;padding:14px;color:var(--text-muted)"><i class="fab fa-paypal" style="font-size:1.6rem;color:#003087;display:block;margin-bottom:6px"></i><p style="font-size:.82rem">Cargando PayPal…</p></div>`;
    setTimeout(renderCartCheckout, 2000);
    return;
  }

  paypal.Buttons({
    style: { layout: 'vertical', color: 'gold', shape: 'pill', label: 'pay', height: 45 },
    createOrder: (data, actions) => actions.order.create({
      purchase_units: [{
        description: `MCPE Addons Store — ${Cart.items.length} artículo(s)`,
        amount: {
          value: total.toFixed(2), currency_code: 'USD',
          breakdown: { item_total: { currency_code: 'USD', value: total.toFixed(2) } }
        },
        items: [{ name: `Carrito (${Cart.count()} items)`, unit_amount: { currency_code: 'USD', value: total.toFixed(2) }, quantity: '1', category: 'DIGITAL_GOODS' }]
      }],
      application_context: { shipping_preference: 'NO_SHIPPING', brand_name: 'MCPE Addons Store' }
    }),
    onApprove: (data, actions) => actions.order.capture().then(details => completeCartPurchase(details)),
    onCancel: () => showToast('Pago cancelado. No se cobró nada.', 'warning'),
    onError: (err) => { console.error('PayPal Cart Error:', err); showToast('Error en el pago. Intenta de nuevo.', 'error'); }
  }).render('#cart-paypal-container');
}
window.renderCartCheckout = renderCartCheckout;

function completeCartPurchase(paypalDetails) {
  if (!(window.State && State.user)) { openAuthModal('login'); return; }
  const orderId = 'V13-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 3).toUpperCase();
  const sub = Cart.subtotal(), disc = Cart.discount(), tot = Cart.total();
  const items = Cart.items.map(i => ({ ...i }));

  // Registrar cada artículo como una orden (compatibilidad con "Mis compras")
  try {
    const orders = DB.get(DB_KEYS.ORDERS);
    items.forEach(i => {
      orders.push({
        id: 'ord_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        userId: State.user.id,
        addonId: i.id, addonName: i.name,
        price: (parseFloat(i.price) * (i.qty || 1)).toFixed(2),
        currency: 'USD',
        coupon: Cart.coupon ? Cart.coupon.code : null,
        voucher: orderId,
        paypalOrderId: paypalDetails && paypalDetails.id || null,
        status: 'completed',
        date: new Date().toISOString()
      });
    });
    DB.set(DB_KEYS.ORDERS, orders);
    if (typeof loadPurchases === 'function') loadPurchases();

    // Incrementar contador de compras de cada add-on
    const addons = DB.get(DB_KEYS.ADDONS);
    items.forEach(i => { const idx = addons.findIndex(a => a.id === i.id); if (idx !== -1) addons[idx].purchases = (addons[idx].purchases || 0) + (i.qty || 1); });
    DB.set(DB_KEYS.ADDONS, addons);
  } catch (e) { console.error('[v13] error guardando orden:', e); }

  const voucher = {
    id: orderId,
    buyer: (typeof userDisplayName === 'function' ? userDisplayName(State.user) : State.user.name) || 'Cliente',
    email: State.user.email || '',
    date: new Date().toISOString(),
    items, subtotal: sub, discount: disc, total: tot,
    coupon: Cart.coupon ? Cart.coupon.code : null,
    paypalId: paypalDetails && paypalDetails.id || null
  };

  Cart.clear();
  renderCart();
  closeCart();
  showVoucher(voucher);
}
window.completeCartPurchase = completeCartPurchase;

/* ============================================================
   VOUCHER / COMPROBANTE
   ============================================================ */
let _lastVoucher = null;

function showVoucher(v) {
  _lastVoucher = v;
  const body = document.getElementById('voucher-body');
  if (!body) return;
  body.innerHTML = `
    <div class="voucher">
      <div class="voucher-top">
        <div class="v-check"><i class="fas fa-check"></i></div>
        <h3>¡Compra confirmada!</h3>
        <p>Gracias por tu compra en MCPE Addons Store</p>
      </div>
      <div class="voucher-body">
        <div class="voucher-row"><span>Comprador</span><strong>${escHtml(v.buyer)}</strong></div>
        ${v.email ? `<div class="voucher-row"><span>Correo</span><strong>${escHtml(v.email)}</strong></div>` : ''}
        <div class="voucher-row"><span>Fecha</span><strong>${new Date(v.date).toLocaleString('es-ES')}</strong></div>
        ${v.paypalId ? `<div class="voucher-row"><span>PayPal ID</span><strong>${escHtml(v.paypalId)}</strong></div>` : ''}
        <div class="voucher-items">
          ${v.items.map(i => `<div class="voucher-line"><span>${escHtml(i.name)} ×${i.qty || 1}</span><span>$${(parseFloat(i.price) * (i.qty || 1)).toFixed(2)}</span></div>`).join('')}
        </div>
        <div class="voucher-line"><span>Subtotal</span><span>$${v.subtotal.toFixed(2)}</span></div>
        ${v.discount > 0 ? `<div class="voucher-line" style="color:var(--green)"><span>Descuento ${v.coupon ? '(' + escHtml(v.coupon) + ')' : ''}</span><span>-$${v.discount.toFixed(2)}</span></div>` : ''}
        <div class="voucher-total"><span>Total pagado</span><span>$${v.total.toFixed(2)} USD</span></div>
        <div class="voucher-code-box">
          <small>Código de voucher</small>
          <strong>${escHtml(v.id)}</strong>
        </div>
      </div>
    </div>`;
  openModal('voucher-modal');
}
window.showVoucher = showVoucher;

function downloadVoucher() {
  if (!_lastVoucher) return;
  const v = _lastVoucher;
  const rows = v.items.map(i => `<tr><td>${escHtml(i.name)} ×${i.qty || 1}</td><td style="text-align:right">$${(parseFloat(i.price) * (i.qty || 1)).toFixed(2)}</td></tr>`).join('');
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Voucher ${escHtml(v.id)}</title>
  <style>body{font-family:Arial,Helvetica,sans-serif;background:#0b1020;color:#e8edf7;padding:30px;max-width:520px;margin:auto}
  .card{background:#121a2c;border:1px solid #243049;border-radius:16px;overflow:hidden}
  .top{background:linear-gradient(135deg,#00d4ff,#8b5cff);color:#04101e;padding:24px;text-align:center}
  .top h1{margin:0;font-size:22px}.b{padding:22px}
  table{width:100%;border-collapse:collapse;margin:12px 0}td{padding:6px 0;border-bottom:1px dashed #243049;font-size:14px}
  .tot{display:flex;justify-content:space-between;font-size:18px;font-weight:bold;margin-top:12px;padding-top:12px;border-top:2px solid #00d4ff}
  .code{text-align:center;margin-top:16px;background:#1a2236;border:1px dashed #00d4ff;border-radius:12px;padding:14px}
  .code strong{font-size:20px;letter-spacing:2px;color:#00d4ff}.muted{color:#7b88a3;font-size:13px}</style></head>
  <body><div class="card"><div class="top"><h1>✔ Compra confirmada</h1><p>MCPE Addons Store</p></div>
  <div class="b"><p><strong>Comprador:</strong> ${escHtml(v.buyer)}<br>${v.email ? '<span class="muted">' + escHtml(v.email) + '</span><br>' : ''}<span class="muted">${new Date(v.date).toLocaleString('es-ES')}</span></p>
  <table>${rows}</table>
  <p class="muted">Subtotal: $${v.subtotal.toFixed(2)}${v.discount > 0 ? ' · Descuento: -$' + v.discount.toFixed(2) + (v.coupon ? ' (' + escHtml(v.coupon) + ')' : '') : ''}</p>
  <div class="tot"><span>Total pagado</span><span>$${v.total.toFixed(2)} USD</span></div>
  <div class="code"><div class="muted">Código de voucher</div><strong>${escHtml(v.id)}</strong></div>
  <p class="muted" style="text-align:center;margin-top:18px">Conserva este comprobante. No afiliado con Mojang/Microsoft.</p></div></div></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `voucher-${v.id}.html`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  showToast('Voucher descargado.', 'success');
}
window.downloadVoucher = downloadVoucher;

function viewPurchasesFromVoucher() { closeModal('voucher-modal'); if (typeof openPurchasesModal === 'function') openPurchasesModal(); }
window.viewPurchasesFromVoucher = viewPurchasesFromVoucher;

/* ============================================================
   COMENTARIOS EN TIEMPO REAL
   ============================================================ */
let _commentRating = 0;
let _currentCommentAddon = null;

function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'hace un momento';
  const m = Math.floor(s / 60); if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60); if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24); if (d < 30) return `hace ${d} d`;
  return new Date(iso).toLocaleDateString('es-ES');
}

function renderComments(addonId) {
  _currentCommentAddon = addonId;
  _commentRating = 0;
  const all = DBX.get(V13_KEYS.COMMENTS).filter(c => c.addonId === addonId)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const isAdmin = !!(window.State && State.user && window.ADMIN_EMAIL && State.user.email === ADMIN_EMAIL);

  const u = window.State && State.user;
  const formHtml = u
    ? `<div class="comment-form">
         <img class="c-avatar" src="${escHtml(typeof userAvatar === 'function' ? userAvatar(u) : (u.avatar || ''))}" alt="" onerror="this.style.opacity=0">
         <div class="c-input-wrap">
           <div class="comment-rating" id="comment-rating">
             ${[1,2,3,4,5].map(n => `<i class="far fa-star" data-star="${n}" onclick="setCommentRating(${n})"></i>`).join('')}
           </div>
           <textarea id="comment-text" maxlength="400" placeholder="Comparte tu opinión sobre este contenido..." oninput="updateCommentCount()"></textarea>
           <div class="c-actions">
             <span class="c-count" id="comment-count">0/400</span>
             <button class="btn btn-primary btn-sm" onclick="postComment()"><i class="fas fa-paper-plane"></i> Publicar</button>
           </div>
         </div>
       </div>`
    : `<div class="comment-login-note"><i class="fas fa-comments"></i> <a href="#" onclick="closeModal('addon-modal');openAuthModal('login');return false" style="color:var(--primary)">Inicia sesión</a> para dejar tu comentario.</div>`;

  const listHtml = all.length
    ? all.map(c => {
        const canDel = isAdmin || (u && c.userId === u.id);
        const stars = c.rating ? `<div class="comment-stars">${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)}</div>` : '';
        return `<div class="comment">
          <img class="c-avatar" src="${escHtml(c.avatar || '')}" alt="" onerror="this.style.opacity=0">
          <div class="comment-main">
            <div class="comment-top">
              <span class="comment-author">${escHtml(c.author || 'Usuario')}</span>${c.userId && typeof v14EmblemHTML === 'function' ? ' ' + v14EmblemHTML(c.userId) : ''}
              ${c.isAdmin ? '<span class="comment-badge admin"><i class="fas fa-shield-halved"></i> Staff</span>' : ''}
              <span class="comment-time">${timeAgo(c.date)}</span>
            </div>
            ${stars}
            <div class="comment-text">${escHtml(c.text)}</div>
          </div>
          ${canDel ? `<button class="comment-del" onclick="deleteComment('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </div>`;
      }).join('')
    : `<div class="comment-empty"><i class="fas fa-comment-dots"></i> Sé el primero en comentar.</div>`;

  return `
    <div class="comments-block" id="comments-block">
      <div class="comments-head">
        <h3><i class="fas fa-comments"></i> Comentarios <span style="color:var(--text-muted);font-weight:600">(${all.length})</span></h3>
        <span class="comments-live"><span class="dot"></span> En vivo</span>
      </div>
      ${formHtml}
      <div class="comments-list" id="comments-list">${listHtml}</div>
    </div>`;
}
window.renderComments = renderComments;

function refreshCommentsUI() {
  const block = document.getElementById('comments-block');
  if (!block || !_currentCommentAddon) return;
  // Solo re-renderiza la lista para no perder el texto que el usuario escribe
  const list = document.getElementById('comments-list');
  if (!list) return;
  const all = DBX.get(V13_KEYS.COMMENTS).filter(c => c.addonId === _currentCommentAddon)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const u = window.State && State.user;
  const isAdmin = !!(u && window.ADMIN_EMAIL && u.email === ADMIN_EMAIL);
  // actualizar contador del encabezado
  const head = block.querySelector('.comments-head h3 span');
  if (head) head.textContent = `(${all.length})`;
  list.innerHTML = all.length
    ? all.map(c => {
        const canDel = isAdmin || (u && c.userId === u.id);
        const stars = c.rating ? `<div class="comment-stars">${'★'.repeat(c.rating)}${'☆'.repeat(5 - c.rating)}</div>` : '';
        return `<div class="comment">
          <img class="c-avatar" src="${escHtml(c.avatar || '')}" alt="" onerror="this.style.opacity=0">
          <div class="comment-main">
            <div class="comment-top">
              <span class="comment-author">${escHtml(c.author || 'Usuario')}</span>${c.userId && typeof v14EmblemHTML === 'function' ? ' ' + v14EmblemHTML(c.userId) : ''}
              ${c.isAdmin ? '<span class="comment-badge admin"><i class="fas fa-shield-halved"></i> Staff</span>' : ''}
              <span class="comment-time">${timeAgo(c.date)}</span>
            </div>
            ${stars}
            <div class="comment-text">${escHtml(c.text)}</div>
          </div>
          ${canDel ? `<button class="comment-del" onclick="deleteComment('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button>` : ''}
        </div>`;
      }).join('')
    : `<div class="comment-empty"><i class="fas fa-comment-dots"></i> Sé el primero en comentar.</div>`;
}

function setCommentRating(n) {
  _commentRating = n;
  document.querySelectorAll('#comment-rating i').forEach(i => {
    const s = parseInt(i.dataset.star, 10);
    i.className = s <= n ? 'fas fa-star on' : 'far fa-star';
  });
}
window.setCommentRating = setCommentRating;

function updateCommentCount() {
  const ta = document.getElementById('comment-text');
  const c = document.getElementById('comment-count');
  if (ta && c) c.textContent = `${ta.value.length}/400`;
}
window.updateCommentCount = updateCommentCount;

function postComment() {
  const u = window.State && State.user;
  if (!u) { closeModal('addon-modal'); openAuthModal('login'); return; }
  const ta = document.getElementById('comment-text');
  const text = (ta && ta.value || '').trim();
  if (!text) { showToast('Escribe un comentario.', 'warning'); return; }
  const isAdmin = !!(window.ADMIN_EMAIL && u.email === ADMIN_EMAIL);
  const list = DBX.get(V13_KEYS.COMMENTS);
  list.push({
    id: 'cmt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    addonId: _currentCommentAddon,
    userId: u.id,
    author: (typeof userDisplayName === 'function' ? userDisplayName(u) : u.name) || 'Usuario',
    avatar: (typeof userAvatar === 'function' ? userAvatar(u) : (u.avatar || '')),
    text, rating: _commentRating || 0,
    isAdmin,
    date: new Date().toISOString()
  });
  DBX.set(V13_KEYS.COMMENTS, list);
  if (ta) ta.value = '';
  _commentRating = 0;
  updateCommentCount();
  refreshCommentsUI();
  showToast('¡Comentario publicado!', 'success');
}
window.postComment = postComment;

function deleteComment(id) {
  const u = window.State && State.user;
  const list = DBX.get(V13_KEYS.COMMENTS);
  const c = list.find(x => x.id === id);
  if (!c) return;
  const isAdmin = !!(u && window.ADMIN_EMAIL && u.email === ADMIN_EMAIL);
  if (!isAdmin && !(u && c.userId === u.id)) { showToast('No puedes eliminar este comentario.', 'error'); return; }
  DBX.set(V13_KEYS.COMMENTS, list.filter(x => x.id !== id));
  refreshCommentsUI();
  showToast('Comentario eliminado.', 'info');
}
window.deleteComment = deleteComment;

/* ============================================================
   SLIDER ROTATIVO DE JUEGOS (con logos originales)
   ============================================================ */
const GAMES = [
  {
    id: 'bedrock', tag: 'Minecraft PE / Bedrock', color: '#5fb24a',
    title: 'Minecraft Bedrock (PE)',
    desc: 'Add-ons, mundos, texturas y skins para Minecraft PE en móvil, consola y Windows.',
    cta: 'Ver contenido Bedrock', action: "v13GoPlatform('bedrock')",
    art: `<svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
      <rect width="80" height="80" rx="8" fill="#6cbf4f"/>
      <rect width="80" height="80" rx="8" fill="url(#cg)" opacity=".35"/>
      <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8fd97a"/><stop offset="1" stop-color="#3f8f30"/></linearGradient></defs>
      <g fill="#0e2a12">
        <rect x="15" y="20" width="16" height="16"/><rect x="49" y="20" width="16" height="16"/>
        <rect x="32" y="40" width="16" height="14"/>
        <rect x="20" y="54" width="14" height="14"/><rect x="46" y="54" width="14" height="14"/>
      </g>
    </svg>`
  },
  {
    id: 'java', tag: 'Minecraft Java Edition', color: '#8b5cff',
    title: 'Minecraft Java Edition',
    desc: 'Mods, plugins, shaders y mapas para la edición Java en PC. Personalización sin límites.',
    cta: 'Ver contenido Java', action: "v13GoPlatform('java')",
    art: `<svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
      <polygon points="40,6 70,22 40,38 10,22" fill="#7cc349"/>
      <polygon points="10,22 40,38 40,74 10,58" fill="#6b4a2b"/>
      <polygon points="70,22 40,38 40,74 70,58" fill="#553a22"/>
      <polygon points="40,6 70,22 40,38 10,22" fill="#000" opacity=".05"/>
    </svg>`
  },
  {
    id: 'universe', tag: 'Minecraft Universe', color: '#19b9d4',
    title: 'Minecraft Dungeons & Legends',
    desc: 'Explora el universo de Minecraft. Contenido y recursos inspirados en toda la saga.',
    cta: 'Explorar todo', action: "v13GoPlatform('all')",
    art: `<svg viewBox="0 0 80 80" width="100%" height="100%" aria-hidden="true">
      <polygon points="40,8 58,26 40,72 22,26" fill="#4fd0e6"/>
      <polygon points="40,8 58,26 40,38 22,26" fill="#8fe6f2"/>
      <polygon points="22,26 40,38 40,72" fill="#2fa6bd"/>
      <polygon points="58,26 40,38 40,72" fill="#1d8ba1"/>
    </svg>`
  }
];

let _gameIdx = 0, _gameTimer = null;

function renderGameSlider() {
  const track = document.getElementById('games-track');
  const dots = document.getElementById('games-dots');
  if (!track) return;
  track.innerHTML = GAMES.map(g => `
    <div class="game-slide" style="--g-color:${g.color}">
      <div class="game-slide-logo">${g.art || (g.logo ? `<img src="${g.logo}" alt="${escHtml(g.title)}">` : '')}</div>
      <div class="game-slide-info">
        <span class="game-slide-tag"><i class="fas fa-gamepad"></i> ${escHtml(g.tag)}</span>
        <h3 class="game-slide-title">${escHtml(g.title)}</h3>
        <p class="game-slide-desc">${escHtml(g.desc)}</p>
        <button class="game-slide-cta" style="--g-color:${g.color}" onclick="${g.action}"><i class="fas fa-arrow-right"></i> ${escHtml(g.cta)}</button>
      </div>
    </div>`).join('');
  if (dots) dots.innerHTML = GAMES.map((_, i) => `<button class="${i === 0 ? 'active' : ''}" onclick="goGameSlide(${i})" aria-label="Slide ${i + 1}"></button>`).join('');
  goGameSlide(0);
  startGameAuto();
}

function goGameSlide(i) {
  _gameIdx = (i + GAMES.length) % GAMES.length;
  const track = document.getElementById('games-track');
  if (track) track.style.transform = `translateX(-${_gameIdx * 100}%)`;
  document.querySelectorAll('#games-dots button').forEach((b, idx) => b.classList.toggle('active', idx === _gameIdx));
}
function nextGameSlide() { goGameSlide(_gameIdx + 1); startGameAuto(); }
function prevGameSlide() { goGameSlide(_gameIdx - 1); startGameAuto(); }
function startGameAuto() {
  clearInterval(_gameTimer);
  _gameTimer = setInterval(() => goGameSlide(_gameIdx + 1), 5500);
}
window.goGameSlide = goGameSlide;
window.nextGameSlide = nextGameSlide;
window.prevGameSlide = prevGameSlide;

function v13GoPlatform(p) {
  if (typeof setPlatform === 'function') {
    State.currentPlatform = p;
    State.currentCategory = 'all';
    if (typeof syncFilterUI === 'function') syncFilterUI();
    if (typeof applyFilters === 'function') applyFilters();
  }
  const t = document.getElementById('addons');
  if (t) t.scrollIntoView({ behavior: 'smooth' });
}
window.v13GoPlatform = v13GoPlatform;

/* ============================================================
   ANUNCIOS / BANNERS PROFESIONALES
   ============================================================ */
const DEFAULT_ADS = [
  { id: 'ad1', pill: 'Oferta', title: 'Cupón BIENVENIDO15', text: 'Llévate -15% en tu primera compra premium.', c1: '#0f2a3d', c2: '#0a1626', icon: 'fa-tags', action: "openCart()" },
  { id: 'ad2', pill: 'Nuevo', title: 'Comentarios en vivo', text: 'Opina y califica cada add-on en tiempo real.', c1: '#2a1f3d', c2: '#140d26', icon: 'fa-comments', action: "document.getElementById('addons').scrollIntoView({behavior:'smooth'})" },
  { id: 'ad3', pill: 'Premium', title: 'Hazte Creator o Pro', text: 'Sube más add-ons al día y destaca en la tienda.', c1: '#3d2f0f', c2: '#261d0a', icon: 'fa-crown', action: "document.getElementById('pricing').scrollIntoView({behavior:'smooth'})" }
];

function v13SeedAds() {
  DBX.seedIfEmpty(V13_KEYS.ADS, DEFAULT_ADS);
}

function renderAds() {
  const grid = document.getElementById('ads-grid');
  if (!grid) return;
  const ads = DBX.get(V13_KEYS.ADS).filter(a => a.active !== false);
  const list = ads.length ? ads : DEFAULT_ADS;
  grid.innerHTML = list.map(a => `
    <div class="ad-card" style="--ad-c1:${a.c1 || '#142036'};--ad-c2:${a.c2 || '#0d1626'}" ${a.action ? `onclick="${a.action}"` : (a.link ? `onclick="window.open('${escHtml(a.link)}','_blank')"` : '')}>
      <span class="ad-pill">${escHtml(a.pill || 'Anuncio')}</span>
      <h4>${escHtml(a.title || '')}</h4>
      <p>${escHtml(a.text || '')}</p>
      <i class="fas ${a.icon || 'fa-bullhorn'} ad-ic"></i>
    </div>`).join('');
}
window.renderAds = renderAds;

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  v13SeedCoupons();
  v13SeedAds();
  Cart.load();
  Cart.refresh();
  renderGameSlider();
  renderAds();

  // Re-render en tiempo real cuando cambian comentarios / anuncios
  DBX.on((key) => {
    if (key === V13_KEYS.COMMENTS) refreshCommentsUI();
    if (key === V13_KEYS.ADS) renderAds();
  });

  // Cerrar carrito con Escape
  window.addEventListener('keydown', e => { if (e.key === 'Escape') closeCart(); });

  // Recargar carrito al iniciar/cerrar sesión (cambia la clave del carrito)
  window.addEventListener('mcpe-auth-changed', () => { Cart.coupon = null; Cart.load(); Cart.refresh(); });
});
