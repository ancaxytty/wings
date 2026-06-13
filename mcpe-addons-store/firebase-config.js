// Firebase Configuration - Real-time Database
// Replace with your own Firebase project credentials
const firebaseConfig = {
  apiKey: "AIzaSyDemo-ReplaceWithYourFirebaseKey",
  authDomain: "mcpe-addons-store.firebaseapp.com",
  databaseURL: "https://mcpe-addons-store-default-rtdb.firebaseio.com",
  projectId: "mcpe-addons-store",
  storageBucket: "mcpe-addons-store.appspot.com",
  messagingSenderId: "834396146604",
  appId: "1:834396146604:web:demo"
};

// Google OAuth Client ID
const GOOGLE_CLIENT_ID = "834396146604-onhc6725abrh3kgj3lchsgnqr634s41f.apps.googleusercontent.com";

// PayPal Configuration
const PAYPAL_CLIENT_ID = "AXNocpelnAuDkB3PfxMsD0q3ou7r0VJYQo1mk-1XmOEEDQE11HfiDdprWZpC3U3FTw1FGK1gS-eEeI-f";

// Admin email - change this to your email
const ADMIN_EMAIL = "admin@mcpe-addons.com";

// LocalStorage keys (used as database fallback)
const DB_KEYS = {
  ADDONS: 'mcpe_addons',
  USERS: 'mcpe_users',
  ORDERS: 'mcpe_orders',
  SETTINGS: 'mcpe_settings'
};

// Default store settings
const DEFAULT_SETTINGS = {
  storeName: "MCPE Addons Store",
  storeSubtitle: "Los mejores Add-ons para Minecraft PE",
  currency: "USD",
  featuredEnabled: true,
  maintenanceMode: false
};

// Simple DB using localStorage (replace with Firebase for production)
const DB = {
  get(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || [];
    } catch { return []; }
  },
  set(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('db-updated', { detail: { key, data } }));
  },
  getObj(key, def = {}) {
    try {
      return JSON.parse(localStorage.getItem(key)) || def;
    } catch { return def; }
  },
  setObj(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
    window.dispatchEvent(new CustomEvent('db-updated', { detail: { key, data } }));
  }
};

// Initialize default settings if not present
if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
  DB.setObj(DB_KEYS.SETTINGS, DEFAULT_SETTINGS);
}
