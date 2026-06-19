/* ============================================================
   MCPE ADDONS STORE — v15.0
   · Arregla el carrito (fusiona el carrito de invitado al
     iniciar sesión, mejor estado vacío, productos visibles)
   · Catálogo de demostración con imágenes PNG profesionales
     (se siembra solo si la tienda está vacía)
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   Archivo de descarga de demostración (data URL ligera)
   ------------------------------------------------------------ */
const V15_DEMO_DL = 'data:text/plain;charset=utf-8,' + encodeURIComponent(
  'MCPE Addons Store — contenido de demostración.\n' +
  'Sube tu propio archivo (.mcaddon/.mcpack/.zip) desde el panel de administración para reemplazarlo.'
);

const V15_NOW = Date.now();
function v15Date(hoursAgo) { return new Date(V15_NOW - hoursAgo * 3600 * 1000).toISOString(); }

/* ------------------------------------------------------------
   Catálogo de demostración (imágenes PNG en assets/products)
   ------------------------------------------------------------ */
const DEMO_PRODUCTS = [
  { img: 'dragon',    name: 'Dragones Renacidos',        platform: 'bedrock', type: 'addon',   price: 2.99, feat: true,  isNew: true,  dl: 18420, desc: 'Añade dragones épicos con animaciones, habilidades de fuego y monturas voladoras a tu mundo.' },
  { img: 'shaders',   name: 'Shaders RTX Realistas',     platform: 'java',    type: 'shader',  price: 4.99, feat: true,  isNew: false, dl: 30310, desc: 'Iluminación realista, reflejos en el agua y sombras suaves para una experiencia cinematográfica.' },
  { img: 'medieval',  name: 'Reino Medieval',            platform: 'bedrock', type: 'world',   price: 0,    feat: false, isNew: false, dl: 9120,  desc: 'Explora un enorme castillo medieval con aldeas, mazmorras y tesoros ocultos.' },
  { img: 'cyber',     name: 'Ciudad Cyberpunk 2099',     platform: 'bedrock', type: 'map',     price: 3.49, feat: false, isNew: true,  dl: 7640,  desc: 'Una metrópolis futurista con rascacielos de neón, autos voladores y misiones.' },
  { img: 'textures',  name: 'Texturas Ultra HD 256x',    platform: 'java',    type: 'texture', price: 0,    feat: true,  isNew: false, dl: 24210, desc: 'Pack de texturas en alta definición que renueva por completo el aspecto del juego.' },
  { img: 'ninja',     name: 'Skins Ninja Warrior',       platform: 'bedrock', type: 'skin',    price: 1.99, feat: false, isNew: false, dl: 5380,  desc: 'Colección de 20 skins de guerreros ninja con detalles 4D.' },
  { img: 'tools',     name: 'Herramientas OP Mod',       platform: 'java',    type: 'mod',     price: 0,    feat: false, isNew: false, dl: 13270, desc: 'Picos, hachas y espadas con poderes especiales y minería en área.' },
  { img: 'economy',   name: 'EconomyPro Plugin',         platform: 'java',    type: 'plugin',  price: 5.99, feat: false, isNew: true,  dl: 4150,  desc: 'Sistema de economía completo para servidores: tiendas, trabajos y monedas.' },
  { img: 'furniture', name: 'Muebles y Decoración',      platform: 'bedrock', type: 'addon',   price: 0,    feat: false, isNew: false, dl: 16890, desc: 'Más de 80 muebles funcionales para decorar tus construcciones.' },
  { img: 'galaxy',    name: 'Galaxy Space Survival',     platform: 'bedrock', type: 'world',   price: 2.49, feat: true,  isNew: false, dl: 11030, desc: 'Sobrevive en el espacio saltando entre planetas, estaciones y asteroides.' }
];

function v15BuildDemoAddons() {
  return DEMO_PRODUCTS.map((p, i) => ({
    id: 'demo_' + p.img,
    name: p.name,
    platform: p.platform,
    contentType: p.type,
    category: p.type,
    description: p.desc,
    price: p.price,
    version: '1.0.0',
    mcVersion: '1.20+',
    image: 'assets/products/' + p.img + '.png',
    downloadUrl: V15_DEMO_DL,
    downloadName: p.name + ' (demo).txt',
    emoji: '',
    isFeatured: !!p.feat,
    isNew: !!p.isNew,
    downloads: p.dl,
    purchases: 0,
    status: 'approved',
    approved: true,
    authorId: 'mcpe_studio',
    authorName: 'MCPE Studios',
    authorAvatar: 'https://ui-avatars.com/api/?name=MCPE+Studios&background=00d4ff&color=041018&bold=true&size=128',
    isDemo: true,
    createdAt: v15Date(i * 6)
  }));
}

/* ------------------------------------------------------------
   Siembra del catálogo SOLO si la tienda está vacía.
   Espera a que la nube sincronice antes de decidir, para no
   sobreescribir los productos reales del administrador.
   ------------------------------------------------------------ */
function v15MaybeSeedProducts() {
  if (!(window.DB && window.DB_KEYS)) return;
  if (localStorage.getItem('mcpe_v15_demo') === 'done') return;

  const trySeed = () => {
    if (localStorage.getItem('mcpe_v15_demo') === 'done') return;
    const current = DB.get(DB_KEYS.ADDONS);
    if (current && current.length) {            // ya hay productos reales: no tocar nada
      localStorage.setItem('mcpe_v15_demo', 'done');
      return;
    }
    Promise.resolve(DB.set(DB_KEYS.ADDONS, v15BuildDemoAddons()))
      .catch(() => {})
      .finally(() => {
        localStorage.setItem('mcpe_v15_demo', 'done');
        if (typeof loadAddons === 'function') loadAddons();
        if (typeof updateStats === 'function') updateStats();
        if (typeof showToast === 'function') showToast('Catálogo de demostración cargado. El administrador puede eliminarlo cuando quiera.', 'info', 6000);
      });
  };

  const cloudReady = window.CLOUD_STATUS && window.CLOUD_STATUS.ready;
  if (cloudReady) setTimeout(trySeed, 3500);   // dar tiempo a la sincronización en la nube
  else trySeed();
}

/* ------------------------------------------------------------
   ARREGLO DEL CARRITO
   1) Fusiona el carrito de invitado con el del usuario al
      iniciar sesión (antes se perdían los productos).
   2) Mejora el estado vacío con un botón para explorar.
   ------------------------------------------------------------ */
function v15MergeGuestCart() {
  if (!(window.State && State.user) || !window.Cart) return; // solo tras iniciar sesión
  let guest = [];
  try { guest = JSON.parse(localStorage.getItem('mcpe_cart_guest') || '[]'); } catch (e) { guest = []; }
  if (!Array.isArray(guest) || !guest.length) return;

  guest.forEach(gi => {
    const ex = Cart.items.find(i => i.id === gi.id);
    if (ex) ex.qty = (ex.qty || 1) + (gi.qty || 1);
    else Cart.items.push(gi);
  });
  try { localStorage.removeItem('mcpe_cart_guest'); } catch (e) {}
  Cart.save();
  if (typeof renderCart === 'function') renderCart();
  if (typeof showToast === 'function') showToast('Recuperamos los productos de tu carrito.', 'success');
}

// Mejora el estado vacío del carrito (botón para explorar el catálogo)
function v15EnhanceEmptyCart() {
  const body = document.getElementById('cart-body');
  if (!body || !window.Cart) return;
  const obs = new MutationObserver(() => {
    const empty = body.querySelector('.cart-empty');
    if (empty && !empty.querySelector('.cart-explore-btn')) {
      const btn = document.createElement('button');
      btn.className = 'btn btn-primary cart-explore-btn';
      btn.style.marginTop = '14px';
      btn.innerHTML = '<i class="fas fa-store"></i> Explorar productos';
      btn.onclick = () => {
        if (typeof closeCart === 'function') closeCart();
        const t = document.getElementById('addons');
        if (t) t.scrollIntoView({ behavior: 'smooth' });
      };
      empty.appendChild(btn);
    }
  });
  obs.observe(body, { childList: true });
}

/* ------------------------------------------------------------
   INIT
   ------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  const isStore = !!document.getElementById('hero');
  if (isStore) {
    v15MaybeSeedProducts();
    v15EnhanceEmptyCart();
  }
  // Fusionar carrito de invitado cuando el usuario inicia sesión
  window.addEventListener('mcpe-auth-changed', () => {
    // se ejecuta después del handler de v13 (que ya cargó el carrito del usuario)
    setTimeout(v15MergeGuestCart, 0);
  });
});

window.v15MaybeSeedProducts = v15MaybeSeedProducts;
window.v15MergeGuestCart = v15MergeGuestCart;
