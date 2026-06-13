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
  apiKey:            "PEGA_TU_API_KEY",
  authDomain:        "PEGA_TU_PROYECTO.firebaseapp.com",
  databaseURL:       "https://PEGA_TU_PROYECTO-default-rtdb.firebaseio.com",
  projectId:         "PEGA_TU_PROYECTO",
  storageBucket:     "PEGA_TU_PROYECTO.appspot.com",
  messagingSenderId: "PEGA_TU_SENDER_ID",
  appId:             "PEGA_TU_APP_ID"
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

function _primeLocal(key, isObj) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    _cache[key] = (v !== null && v !== undefined) ? v : (isObj ? {} : []);
  } catch {
    _cache[key] = isObj ? {} : [];
  }
}
_primeLocal(DB_KEYS.ADDONS, false);
_primeLocal(DB_KEYS.USERS,  false);
_primeLocal(DB_KEYS.ORDERS, false);
_primeLocal(DB_KEYS.SETTINGS, true);
if (!_cache[DB_KEYS.SETTINGS] || !Object.keys(_cache[DB_KEYS.SETTINGS]).length) {
  _cache[DB_KEYS.SETTINGS] = { ...DEFAULT_SETTINGS };
}

function _emit(key, data) {
  window.dispatchEvent(new CustomEvent('db-updated', { detail: { key, data } }));
}

let _rtdb = null;

// --- API publica de base de datos ----------------------------
const DB = {
  // Arrays (addons, users, orders)
  get(key) {
    const v = _cache[key];
    return Array.isArray(v) ? v : [];
  },
  set(key, data) {
    _cache[key] = data;
    try { localStorage.setItem(key, JSON.stringify(data)); } catch {}
    if (FIREBASE_READY && _rtdb) {
      _rtdb.ref(key).set(data).catch(err => console.error('[MCPE Store] Error guardando en la nube:', err));
    }
    _emit(key, data);
  },
  // Objetos (settings)
  getObj(key, def = {}) {
    const v = _cache[key];
    return (v && typeof v === 'object' && !Array.isArray(v)) ? v : def;
  },
  setObj(key, data) {
    this.set(key, data);
  }
};

/* ============================================================
   CONEXION EN TIEMPO REAL
   ============================================================ */
if (FIREBASE_READY) {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _rtdb = firebase.database();

    const _refs = [
      [DB_KEYS.ADDONS,   false],
      [DB_KEYS.USERS,    false],
      [DB_KEYS.ORDERS,   false],
      [DB_KEYS.SETTINGS, true]
    ];

    _refs.forEach(([key, isObj]) => {
      _rtdb.ref(key).on('value', snap => {
        let val = snap.val();
        if (isObj) {
          val = (val && Object.keys(val).length) ? val : { ...DEFAULT_SETTINGS };
        } else {
          if (val === null || val === undefined) val = [];
          else if (!Array.isArray(val)) val = Object.values(val);
        }
        _cache[key] = val;
        try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
        _emit(key, val);
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
