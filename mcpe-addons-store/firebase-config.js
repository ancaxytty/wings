/* ============================================================
   MCPE ADDONS STORE V2 – Configuration & Local Database
   Admin: vidfreenut@gmail.com / Vzomstudios2026
   ============================================================ */

'use strict';

// ─── Google OAuth Client ID ──────────────────────────────────
const GOOGLE_CLIENT_ID = "834396146604-onhc6725abrh3kgj3lchsgnqr634s41f.apps.googleusercontent.com";

// ─── PayPal Configuration ────────────────────────────────────
const PAYPAL_CLIENT_ID = "AXNocpelnAuDkB3PfxMsD0q3ou7r0VJYQo1mk-1XmOEEDQE11HfiDdprWZpC3U3FTw1FGK1gS-eEeI-f";
const PAYPAL_SECRET    = "EPV3OgWLZapXvPHg64wW1gjw6A4VxuXdZqiTm14b7zn-ybroXUfEiKop9mCuLFQ-RnIEJen1bdu2w8jh";

// ─── Admin Credentials ───────────────────────────────────────
// Only the owner can access the admin panel
const ADMIN_EMAIL    = "vidfreenut@gmail.com";
const ADMIN_PASSWORD = "Vzomstudios2026";

// ─── LocalStorage Database Keys ──────────────────────────────
const DB_KEYS = {
  ADDONS:   'mcpe_addons',
  USERS:    'mcpe_users',
  ORDERS:   'mcpe_orders',
  SETTINGS: 'mcpe_settings'
};

// ─── Default Store Settings ──────────────────────────────────
const DEFAULT_SETTINGS = {
  storeName:    "MCPE Addons Store",
  storeSubtitle: "Los mejores Add-ons para Minecraft PE",
  currency:     "USD"
};

// ─── Simple Database (localStorage) ─────────────────────────
// All data starts at 0 - empty arrays and default settings
// Data persists in the browser and syncs across tabs in real-time
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

// ─── Initialize default settings if not present ──────────────
if (!localStorage.getItem(DB_KEYS.SETTINGS)) {
  DB.setObj(DB_KEYS.SETTINGS, DEFAULT_SETTINGS);
}

// ─── Ensure all data arrays exist (start empty / 0) ──────────
if (!localStorage.getItem(DB_KEYS.ADDONS)) {
  localStorage.setItem(DB_KEYS.ADDONS, '[]');
}
if (!localStorage.getItem(DB_KEYS.USERS)) {
  localStorage.setItem(DB_KEYS.USERS, '[]');
}
if (!localStorage.getItem(DB_KEYS.ORDERS)) {
  localStorage.setItem(DB_KEYS.ORDERS, '[]');
}
