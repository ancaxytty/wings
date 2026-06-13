/* ============================================================
   MCPE ADDONS STORE V2 - Configuration & Cloud Database
   Admin: vidfreenut@gmail.com / Vzomstudios2026
   ------------------------------------------------------------
   Guardado en TIEMPO REAL en la nube con Firebase Realtime
   Database. Cuando el admin sube un add-on, se guarda en la
   nube y CUALQUIER persona que abra la URL (en otro navegador
   u otro dispositivo) lo vera al instante.

   La API DB.get / DB.set sigue siendo sincrona: se mantiene una
   cache en memoria que Firebase actualiza en tiempo real.
   ============================================================ */

'use strict';

// --- Google OAuth Client ID ----------------------------------
const GOOGLE_CLIENT_ID = "834396146604-onhc6725abrh3kgj3lchsgnqr634s41f.apps.googleusercontent.com";

// --- PayPal Configuration ------------------------------------
const PAYPAL_CLIENT_ID = "AXNocpelnAuDkB3PfxMsD0q3ou7r0VJYQo1mk-1XmOEEDQE11HfiDdprWZpC3U3FTw1FGK1gS-eEeI-f";
const PAYPAL_SECRET    = "EPV3OgWLZapXvPHg64wW1gjw6A4VxuXdZqiTm14b7zn-ybroXUfEiKop9mCuLFQ-RnIEJen1bdu2w8jh";

// --- Admin Credentials ---------------------------------------
// Only the owner can access the admin panel
const ADMIN_EMAIL    = "vidfreenut@gmail.com";
const ADMIN_PASSWORD = "Vzomstudios2026";

/* ============================================================
   FIREBASE - Configuracion de tu proyecto (GRATIS)
   ------------------------------------------------------------
   PASOS (2 minutos, sin tarjeta de credito):
   1. Entra en https://console.firebase.google.com
   2. "Agregar proyecto" -> ponle un nombre -> Continuar.
   3. En el menu izquierdo abre "Realtime Database" -> "Crear
      base de datos" -> elige una ubicacion -> "Modo de prueba".
   4. Engranaje (Configuracion del proyecto) -> pestania "General"
      -> "Tus apps" -> icono Web (</>) -> registra la app.
   5. Copia el objeto firebaseConfig y pega los valores abajo,
      reemplazando los textos "PEGA_TU_...".

   NOTA: estos valores NO son secretos; estan pensados para ir
   en el codigo del cliente. La seguridad se controla con las
   reglas de la Realtime Database.

   Si dejas la config sin completar, la tienda seguira
   funcionando pero SOLO en este navegador (modo local).
   ============================================================ */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyCEz1tzEgwR_xa1Uw3v-UWQ4G-RydU1xg0",
  authDomain:        "vzomapp.firebaseapp.com",
  databaseURL:       "https://vzomapp-default-rtdb.firebaseio.com",
  projectId:         "vzomapp",
  storageBucket:     "vzomapp.firebasestorage.app",
  messagingSenderId: "829125054145",
  appId:             "1:829125054145:web:48db706972c727a9e38e40",
  measurementId:     "G-TE96HMF0HM"
};

// --- Database Keys (se usan como rutas en la nube) -----------
const DB_KEYS = {
  ADDONS:   'mcpe_addons',
  USERS:    'mcpe_users',
  ORDERS:   'mcpe_orders',
  SETTINGS: 'mcpe_settings'
};

// --- Default Store Settings ----------------------------------
const DEFAULT_SETTINGS = {
  storeName:     "MCPE Addons Store",
  storeSubtitle: "Los mejores Add-ons para Minecraft PE",
  currency:      "USD"
};

// --- Detectar si Firebase esta configurado y disponible ------
const FIREBASE_READY =
  typeof firebase !== 'undefined' &&
  FIREBASE_CONFIG.databaseURL &&
  !/PEGA_TU_|YOUR_/i.test(FIREBASE_CONFIG.databaseURL);

// --- Cache en memoria (mantiene la API sincrona DB.get/set) --
const _cache = {};
let _rtdb = null;

function _emit(key, data) {
  try {
    window.dispatchEvent(new CustomEvent('db-updated', { detail: { key, data } }));
  } catch (e) { /* noop */ }
}

// --- API publica de base de datos ----------------------------
// IMPORTANTE: se define ANTES de cualquier acceso a localStorage,
// para que DB siempre exista aunque el almacenamiento esté bloqueado.
const DB = {
  // Arrays (addons, users, orders)
  get(key) {
    const v = _cache[key];
    return Array.isArray(v) ? v : [];
  },
  // Devuelve una promesa: se resuelve cuando se guarda en la nube
  // (o de inmediato en modo local) y se rechaza si la nube falla.
  set(key, data) {
    _cache[key] = data;
    let localOk = true;
    let quotaExceeded = false;
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      localOk = false;
      quotaExceeded = !!(e && (e.name === 'QuotaExceededError' || /quota|exceeded/i.test((e.name || '') + (e.message || ''))));
      console.warn('[MCPE Store] No se pudo guardar en localStorage:', e);
    }
    _emit(key, data);

    if (FIREBASE_READY && _rtdb) {
      return _rtdb.ref(key).set(data)
        .then(() => {
          if (window.CLOUD_STATUS) window.CLOUD_STATUS.error = null;
          _safeDispatch('cloud-status', window.CLOUD_STATUS);
        })
        .catch(err => {
          console.error('[MCPE Store] Error guardando en la nube:', err);
          if (window.CLOUD_STATUS) window.CLOUD_STATUS.error = (err && err.message) || 'PERMISSION_DENIED';
          _safeDispatch('db-error', { key, error: err });
          _safeDispatch('cloud-status', window.CLOUD_STATUS);
          throw err;
        });
    }

    // Sin nube: si el almacenamiento se llenó, avisamos (archivo muy grande).
    if (!localOk && quotaExceeded) {
      const err = new Error('LOCAL_STORAGE_FULL');
      _safeDispatch('db-error', { key, error: err });
      return Promise.reject(err);
    }
    // Bloqueado pero no lleno: funciona en la sesión actual.
    return Promise.resolve();
  },
  // Objetos (settings)
  getObj(key, def = {}) {
    const v = _cache[key];
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : def;
  },
  setObj(key, data) {
    return this.set(key, data);
  }
};

// Exponer en window por seguridad (acceso garantizado desde otros scripts)
window.DB = DB;
window.DB_KEYS = DB_KEYS;
window.DEFAULT_SETTINGS = DEFAULT_SETTINGS;

// Estado de la nube (para mostrar un indicador visible al usuario)
window.CLOUD_STATUS = { ready: FIREBASE_READY, connected: false, error: null };

function _safeDispatch(name, detail) {
  try { window.dispatchEvent(new CustomEvent(name, { detail })); } catch (e) { /* noop */ }
}

// --- Cargar datos guardados (todo protegido; nunca rompe) ----
function _primeLocal(key, isObj) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    _cache[key] = (v !== null && v !== undefined) ? v : (isObj ? {} : []);
  } catch (e) {
    _cache[key] = isObj ? {} : [];
  }
}
try {
  _primeLocal(DB_KEYS.ADDONS, false);
  _primeLocal(DB_KEYS.USERS,  false);
  _primeLocal(DB_KEYS.ORDERS, false);
  _primeLocal(DB_KEYS.SETTINGS, true);
  if (!_cache[DB_KEYS.SETTINGS] || !Object.keys(_cache[DB_KEYS.SETTINGS]).length) {
    _cache[DB_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS };
  }
} catch (e) {
  console.warn('[MCPE Store] No se pudo leer el almacenamiento local; se usa cache vacía.', e);
  if (!_cache[DB_KEYS.ADDONS])   _cache[DB_KEYS.ADDONS]   = [];
  if (!_cache[DB_KEYS.USERS])    _cache[DB_KEYS.USERS]    = [];
  if (!_cache[DB_KEYS.ORDERS])   _cache[DB_KEYS.ORDERS]   = [];
  if (!_cache[DB_KEYS.SETTINGS]) _cache[DB_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS };
}

/* ============================================================
   CONEXION EN TIEMPO REAL
   ============================================================ */
if (FIREBASE_READY) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _rtdb = firebase.database();

    // Estado de conexión visible
    _rtdb.ref('.info/connected').on('value', s => {
      if (window.CLOUD_STATUS) window.CLOUD_STATUS.connected = (s.val() === true);
      _safeDispatch('cloud-status', window.CLOUD_STATUS);
    });

    const _refs = [
      [DB_KEYS.ADDONS,   false],
      [DB_KEYS.USERS,    false],
      [DB_KEYS.ORDERS,   false],
      [DB_KEYS.SETTINGS, true]
    ];

    _refs.forEach(([key, isObj]) => {
      let firstSnapshot = true;

      _rtdb.ref(key).on('value', snap => {
        let val = snap.val();

        const cloudEmpty =
          val === null || val === undefined ||
          (Array.isArray(val) && val.length === 0) ||
          (isObj && (!val || Object.keys(val).length === 0));

        // MIGRACIÓN: en la primera lectura, si la nube está vacía pero
        // este navegador tiene datos locales, los subimos a la nube
        // (así los add-ons ya creados se ven en todos los navegadores).
        if (firstSnapshot) {
          firstSnapshot = false;
          if (cloudEmpty) {
            const local = _cache[key];
            const localHasData = isObj
              ? (local && typeof local === 'object' && Object.keys(local).length > 0)
              : (Array.isArray(local) && local.length > 0);
            if (localHasData) {
              console.log('%c[MCPE Store] Subiendo datos locales a la nube (' + key + ')…', 'color:#00d4ff');
              _rtdb.ref(key).set(local).catch(e => console.error('[MCPE Store] Migración a la nube falló:', e));
              return; // mantener los datos locales; el set disparará otro 'value'
            }
          }
        }

        // Aplicar los datos de la nube
        if (isObj) {
          val = (val && Object.keys(val).length) ? val : { ...DEFAULT_SETTINGS };
        } else {
          if (val === null || val === undefined) val = [];
          else if (!Array.isArray(val)) val = Object.values(val);
        }
        _cache[key] = val;
        try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* noop */ }
        _emit(key, val);
      }, err => {
        // Error de LECTURA (típicamente reglas que deniegan el acceso)
        console.error('[MCPE Store] Error leyendo de la nube (' + key + '):', err);
        if (window.CLOUD_STATUS) window.CLOUD_STATUS.error = (err && err.message) || 'PERMISSION_DENIED';
        _safeDispatch('db-error', { key, error: err });
        _safeDispatch('cloud-status', window.CLOUD_STATUS);
      });
    });

    console.log('%c[MCPE Store] Firebase conectado: sincronizacion en tiempo real ACTIVA.', 'color:#10b981;font-weight:bold');
  } catch (err) {
    console.error('[MCPE Store] Error al iniciar Firebase:', err);
  }
} else {
  console.warn('%c[MCPE Store] Firebase NO configurado: usando almacenamiento LOCAL (no se comparte entre navegadores). Completa FIREBASE_CONFIG en firebase-config.js para activar la sincronizacion en la nube.', 'color:#f59e0b;font-weight:bold');

  // En modo local, sincronizar al menos entre pestanias del mismo navegador
  window.addEventListener('storage', e => {
    if (e.key && Object.prototype.hasOwnProperty.call(_cache, e.key)) {
      try { _cache[e.key] = JSON.parse(e.newValue); } catch {}
      _emit(e.key, _cache[e.key]);
    }
  });
}


/* ============================================================
   V3.0 - Catálogos compartidos (plataformas, tipos, planes,
   marcos de perfil y selecciones del Mundial 2026)
   ============================================================ */

// Plataformas
const PLATFORMS = [
  { id: 'bedrock', name: 'Minecraft PE / Bedrock', short: 'Bedrock', icon: 'fa-mobile-screen-button' },
  { id: 'java',    name: 'Minecraft Java',         short: 'Java',    icon: 'fa-desktop' }
];

// Tipos de contenido
const CONTENT_TYPES = [
  { id: 'addon',   name: 'Add-on',          platform: 'bedrock', icon: 'fa-puzzle-piece' },
  { id: 'world',   name: 'Mundo',           platform: 'both',    icon: 'fa-earth-americas' },
  { id: 'texture', name: 'Texturas',        platform: 'both',    icon: 'fa-palette' },
  { id: 'skin',    name: 'Skins',           platform: 'both',    icon: 'fa-user-astronaut' },
  { id: 'map',     name: 'Mapa',            platform: 'both',    icon: 'fa-map-location-dot' },
  { id: 'mod',     name: 'Mod',             platform: 'java',    icon: 'fa-screwdriver-wrench' },
  { id: 'plugin',  name: 'Plugin (Server)', platform: 'java',    icon: 'fa-server' },
  { id: 'shader',  name: 'Shaders',         platform: 'both',    icon: 'fa-wand-magic-sparkles' },
  { id: 'other',   name: 'Otro',            platform: 'both',    icon: 'fa-cube' }
];

// Planes (límite de subidas diarias por plan)
const PLANS = [
  {
    id: 'free', name: 'Gratis', price: 0, color: '#94a3b8', icon: 'fa-seedling',
    dailyUploads: 3,
    features: ['Descargas ilimitadas', 'Sube 3 add-ons por día', 'Perfil personalizable', 'Marcos básicos']
  },
  {
    id: 'creator', name: 'Creator', price: 4.99, color: '#00d4ff', icon: 'fa-bolt', popular: true,
    dailyUploads: 10,
    features: ['Todo lo de Gratis', 'Sube 10 add-ons por día', 'Insignia de Creator', 'Marcos premium', 'Soporte prioritario']
  },
  {
    id: 'pro', name: 'Pro', price: 9.99, color: '#f59e0b', icon: 'fa-crown',
    dailyUploads: 50,
    features: ['Todo lo de Creator', 'Sube 50 add-ons por día', 'Insignia Pro dorada', 'Todos los marcos', 'Destacado en la tienda', 'Soporte VIP']
  }
];

// Marcos custom para avatar de perfil
const FRAMES = [
  { id: 'none',     name: 'Ninguno',     premium: false },
  { id: 'neon',     name: 'Neón',        premium: false },
  { id: 'gold',     name: 'Oro',         premium: false },
  { id: 'worldcup', name: 'World Cup',   premium: false },
  { id: 'fire',     name: 'Fuego',       premium: true  },
  { id: 'champion', name: 'Campeón',     premium: true  },
  { id: 'galaxy',   name: 'Galaxia',     premium: true  },
  { id: 'rainbow',  name: 'Arcoíris',    premium: true  }
];

// Selecciones (códigos ISO para banderas vía flagcdn.com)
const COUNTRIES = [
  { code: 'ar', name: 'Argentina' }, { code: 'br', name: 'Brasil' },
  { code: 'mx', name: 'México' },    { code: 'us', name: 'Estados Unidos' },
  { code: 'ca', name: 'Canadá' },    { code: 'es', name: 'España' },
  { code: 'fr', name: 'Francia' },   { code: 'de', name: 'Alemania' },
  { code: 'gb', name: 'Inglaterra' },{ code: 'pt', name: 'Portugal' },
  { code: 'it', name: 'Italia' },    { code: 'nl', name: 'Países Bajos' },
  { code: 'uy', name: 'Uruguay' },   { code: 'co', name: 'Colombia' },
  { code: 'cl', name: 'Chile' },     { code: 'pe', name: 'Perú' },
  { code: 'ec', name: 'Ecuador' },   { code: 'jp', name: 'Japón' },
  { code: 'kr', name: 'Corea del Sur' }, { code: 'ma', name: 'Marruecos' },
  { code: 'sn', name: 'Senegal' },   { code: 'ng', name: 'Nigeria' },
  { code: 'be', name: 'Bélgica' },   { code: 'hr', name: 'Croacia' },
  { code: 'ch', name: 'Suiza' },     { code: 'pl', name: 'Polonia' },
  { code: 'dk', name: 'Dinamarca' }, { code: 'au', name: 'Australia' },
  { code: 'sa', name: 'Arabia Saudita' }, { code: 'qa', name: 'Catar' }
];

const FLAG_URL = (code) => `https://flagcdn.com/w40/${code}.png`;

// Helpers de planes
function getPlanById(id) {
  return PLANS.find(p => p.id === id) || PLANS[0];
}
function getDailyLimit(planId) {
  return getPlanById(planId).dailyUploads;
}

// Exponer en window
window.PLATFORMS = PLATFORMS;
window.CONTENT_TYPES = CONTENT_TYPES;
window.PLANS = PLANS;
window.FRAMES = FRAMES;
window.COUNTRIES = COUNTRIES;
window.FLAG_URL = FLAG_URL;
window.getPlanById = getPlanById;
window.getDailyLimit = getDailyLimit;
