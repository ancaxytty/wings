/* ============================================================
   MCPE ADDONS STORE – Admin Panel Logic
   Full CRUD for Add-ons, Orders, Users, Settings
   ============================================================ */

'use strict';

// ─── State ───────────────────────────────────────────────────
let adminAddons = [];
let adminOrders = [];
let adminUsers  = [];
let editingId   = null;

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAccess();
  loadAllData();
  refreshDashboard();
  loadSettings();
  startRealtime();
});

/* ============================================================
   ACCESS CHECK
   ============================================================ */
function checkAdminAccess() {
  try {
    const user = JSON.parse(localStorage.getItem('mcpe_current_user'));
    if (user) {
      document.getElementById('sidebar-avatar').src       = user.avatar || '';
      document.getElementById('sidebar-user-name').textContent  = user.name;
      document.getElementById('sidebar-user-email').textContent = user.email;
    }
  } catch {}
}

/* ============================================================
   SIDEBAR NAVIGATION
   ============================================================ */
function switchPage(page, link) {
  // Hide all pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  // Show selected
  const el = document.getElementById('page-' + page);
  if (el) el.classList.remove('hidden');
  // Active link
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  if (link) link.classList.add('active');
  // Update title
  const titles = {
    dashboard: 'Dashboard',
    addons: 'Gestionar Add-ons',
    orders: 'Pedidos / Ventas',
    users: 'Usuarios',
    settings: 'Configuración'
  };
  document.getElementById('topbar-title').textContent = titles[page] || 'Admin';

  // Refresh data
  if (page === 'dashboard') refreshDashboard();
  if (page === 'addons')    renderAddonsTable();
  if (page === 'orders')    renderOrdersTable();
  if (page === 'users')     renderUsersTable();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ============================================================
   LOAD DATA
   ============================================================ */
function loadAllData() {
  adminAddons = DB.get(DB_KEYS.ADDONS);
  adminOrders = DB.get(DB_KEYS.ORDERS);
  adminUsers  = DB.get(DB_KEYS.USERS);
}

function startRealtime() {
  setInterval(() => {
    const freshAddons = DB.get(DB_KEYS.ADDONS);
    const freshOrders = DB.get(DB_KEYS.ORDERS);
    const freshUsers  = DB.get(DB_KEYS.USERS);

    if (JSON.stringify(freshAddons) !== JSON.stringify(adminAddons) ||
        JSON.stringify(freshOrders) !== JSON.stringify(adminOrders) ||
        JSON.stringify(freshUsers)  !== JSON.stringify(adminUsers)) {
      adminAddons = freshAddons;
      adminOrders = freshOrders;
      adminUsers  = freshUsers;
      refreshDashboard();
    }
  }, 2000);
}

/* ============================================================
   DASHBOARD
   ============================================================ */
function refreshDashboard() {
  loadAllData();

  // Stats
  document.getElementById('dash-total-addons').textContent = adminAddons.length;
  const revenue = adminOrders.reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
  document.getElementById('dash-revenue').textContent      = '$' + revenue.toFixed(2);
  document.getElementById('dash-total-users').textContent   = adminUsers.length;
  const totalDl = adminAddons.reduce((s, a) => s + (a.downloads || 0), 0);
  document.getElementById('dash-total-downloads').textContent = totalDl.toLocaleString();

  // Recent orders
  const recentOrders = document.getElementById('dash-recent-orders');
  if (adminOrders.length === 0) {
    recentOrders.innerHTML = '<p class="empty-text">No hay pedidos aún.</p>';
  } else {
    recentOrders.innerHTML = adminOrders.slice(-5).reverse().map(o => `
      <div class="dash-order-item">
        <div class="dash-addon-item-icon">💰</div>
        <div class="dash-item-info">
          <div class="dash-item-name">${escHtml(o.addonName)}</div>
          <div class="dash-item-sub">${new Date(o.date).toLocaleDateString('es-ES')}</div>
        </div>
        <div class="dash-item-value">$${parseFloat(o.price).toFixed(2)}</div>
      </div>
    `).join('');
  }

  // Popular add-ons
  const popular = document.getElementById('dash-popular-addons');
  if (adminAddons.length === 0) {
    popular.innerHTML = '<p class="empty-text">No hay add-ons aún.</p>';
  } else {
    const sorted = [...adminAddons].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 5);
    popular.innerHTML = sorted.map(a => `
      <div class="dash-addon-item">
        <div class="dash-addon-item-icon">${a.emoji || '📦'}</div>
        <div class="dash-item-info">
          <div class="dash-item-name">${escHtml(a.name)}</div>
          <div class="dash-item-sub">${a.category || 'General'} • ${(a.downloads||0).toLocaleString()} descargas</div>
        </div>
        <div class="dash-item-value">${parseFloat(a.price||0) === 0 ? 'Gratis' : '$'+parseFloat(a.price).toFixed(2)}</div>
      </div>
    `).join('');
  }
}

/* ============================================================
   ADDONS TABLE
   ============================================================ */
function renderAddonsTable() {
  loadAllData();
  const body    = document.getElementById('addons-table-body');
  const countEl = document.getElementById('addon-count');
  const search  = (document.getElementById('admin-addon-search')?.value || '').toLowerCase();

  let list = adminAddons;
  if (search) {
    list = list.filter(a => a.name.toLowerCase().includes(search) || (a.category||'').toLowerCase().includes(search));
  }

  countEl.textContent = `${list.length} add-on${list.length !== 1 ? 's' : ''}`;

  if (list.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty-text">No hay add-ons.</td></tr>';
    return;
  }

  body.innerHTML = list.map(addon => {
    const isFree = !addon.price || parseFloat(addon.price) === 0;
    return `
      <tr>
        <td>
          <div class="table-addon-cell">
            <div class="table-addon-icon">
              ${addon.image
                ? `<img src="${escHtml(addon.image)}" alt="" onerror="this.outerHTML='${addon.emoji||'📦'}'" />`
                : (addon.emoji || '📦')
              }
            </div>
            <span class="table-addon-name">${escHtml(addon.name)}</span>
          </div>
        </td>
        <td>${escHtml(addon.category || '—')}</td>
        <td>
          <span class="table-badge ${isFree ? 'table-badge-free' : 'table-badge-premium'}">
            ${isFree ? 'Gratis' : '$' + parseFloat(addon.price).toFixed(2)}
          </span>
        </td>
        <td>${(addon.downloads || 0).toLocaleString()}</td>
        <td><span class="table-badge table-badge-active">Activo</span></td>
        <td>
          <div class="table-actions">
            <button class="btn btn-sm btn-secondary" onclick="editAddon('${addon.id}')" title="Editar">
              <i class="fas fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteAddon('${addon.id}')" title="Eliminar">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>`;
  }).join('');
}

function filterAdminAddons() { renderAddonsTable(); }

/* ============================================================
   ADDON FORM (CREATE / EDIT)
   ============================================================ */
function openAddonForm(addonId = null) {
  editingId = addonId;
  const modal = document.getElementById('addon-form-modal');
  const title = document.getElementById('addon-form-title');
  const btn   = document.getElementById('addon-form-submit-btn');

  // Reset form
  document.getElementById('addon-form').reset();
  document.getElementById('addon-form-id').value = '';
  document.getElementById('addon-form-new').checked = true;

  if (addonId) {
    const addon = adminAddons.find(a => a.id === addonId);
    if (!addon) return;
    title.textContent = 'Editar Add-on';
    btn.innerHTML     = '<i class="fas fa-save"></i> Actualizar';
    // Fill form
    document.getElementById('addon-form-id').value        = addon.id;
    document.getElementById('addon-form-name').value      = addon.name || '';
    document.getElementById('addon-form-category').value  = addon.category || '';
    document.getElementById('addon-form-desc').value      = addon.description || '';
    document.getElementById('addon-form-price').value     = addon.price || 0;
    document.getElementById('addon-form-version').value   = addon.version || '';
    document.getElementById('addon-form-mcversion').value = addon.mcVersion || '';
    document.getElementById('addon-form-emoji').value     = addon.emoji || '';
    document.getElementById('addon-form-image').value     = addon.image || '';
    document.getElementById('addon-form-download').value  = addon.downloadUrl || '';
    document.getElementById('addon-form-featured').checked= addon.isFeatured || false;
    document.getElementById('addon-form-new').checked     = addon.isNew || false;
  } else {
    title.textContent = 'Nuevo Add-on';
    btn.innerHTML     = '<i class="fas fa-save"></i> Guardar Add-on';
  }

  modal.classList.add('open');
}

function closeAddonForm() {
  document.getElementById('addon-form-modal').classList.remove('open');
  editingId = null;
}

function saveAddon(e) {
  e.preventDefault();

  const id          = document.getElementById('addon-form-id').value;
  const name        = document.getElementById('addon-form-name').value.trim();
  const category    = document.getElementById('addon-form-category').value;
  const description = document.getElementById('addon-form-desc').value.trim();
  const price       = parseFloat(document.getElementById('addon-form-price').value) || 0;
  const version     = document.getElementById('addon-form-version').value.trim();
  const mcVersion   = document.getElementById('addon-form-mcversion').value.trim();
  const emoji       = document.getElementById('addon-form-emoji').value.trim();
  const image       = document.getElementById('addon-form-image').value.trim();
  const downloadUrl = document.getElementById('addon-form-download').value.trim();
  const isFeatured  = document.getElementById('addon-form-featured').checked;
  const isNew       = document.getElementById('addon-form-new').checked;

  if (!name || !category || !downloadUrl) {
    adminToast('Completa todos los campos requeridos.', 'error');
    return;
  }

  const addons = DB.get(DB_KEYS.ADDONS);

  if (id) {
    // Edit existing
    const idx = addons.findIndex(a => a.id === id);
    if (idx !== -1) {
      addons[idx] = {
        ...addons[idx],
        name, category, description, price, version, mcVersion,
        emoji, image, downloadUrl, isFeatured, isNew,
        updatedAt: new Date().toISOString()
      };
    }
    adminToast('Add-on actualizado correctamente ✅', 'success');
  } else {
    // Create new
    const newAddon = {
      id: 'addon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name, category, description, price, version, mcVersion,
      emoji: emoji || '📦', image, downloadUrl, isFeatured, isNew,
      downloads: 0, purchases: 0,
      createdAt: new Date().toISOString()
    };
    addons.push(newAddon);
    adminToast('Add-on creado correctamente 🎉', 'success');
  }

  DB.set(DB_KEYS.ADDONS, addons);
  adminAddons = addons;
  closeAddonForm();
  renderAddonsTable();
  refreshDashboard();
}

function editAddon(id) {
  openAddonForm(id);
}

function deleteAddon(id) {
  if (!confirm('¿Estás seguro de eliminar este add-on? Esta acción no se puede deshacer.')) return;

  let addons = DB.get(DB_KEYS.ADDONS);
  addons = addons.filter(a => a.id !== id);
  DB.set(DB_KEYS.ADDONS, addons);
  adminAddons = addons;
  renderAddonsTable();
  refreshDashboard();
  adminToast('Add-on eliminado 🗑️', 'warning');
}

/* ============================================================
   ORDERS TABLE
   ============================================================ */
function renderOrdersTable() {
  loadAllData();
  const body = document.getElementById('orders-table-body');
  const total = adminOrders.reduce((s, o) => s + (parseFloat(o.price) || 0), 0);
  document.getElementById('orders-total').textContent = `Total: $${total.toFixed(2)}`;

  if (adminOrders.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="empty-text">No hay pedidos.</td></tr>';
    return;
  }

  body.innerHTML = adminOrders.slice().reverse().map(o => {
    const user = adminUsers.find(u => u.id === o.userId);
    return `
      <tr>
        <td style="font-size:.75rem;color:var(--text-muted)">${o.id || '—'}</td>
        <td>${escHtml(o.addonName)}</td>
        <td>${user ? escHtml(user.name) : 'Desconocido'}</td>
        <td><strong style="color:var(--gold)">$${parseFloat(o.price).toFixed(2)}</strong></td>
        <td>${new Date(o.date).toLocaleDateString('es-ES')}</td>
        <td><span class="table-badge table-badge-completed">Completado</span></td>
      </tr>`;
  }).join('');
}

/* ============================================================
   USERS TABLE
   ============================================================ */
function renderUsersTable() {
  loadAllData();
  const body = document.getElementById('users-table-body');
  document.getElementById('users-count').textContent = `${adminUsers.length} usuario${adminUsers.length !== 1 ? 's' : ''}`;

  if (adminUsers.length === 0) {
    body.innerHTML = '<tr><td colspan="4" class="empty-text">No hay usuarios registrados.</td></tr>';
    return;
  }

  body.innerHTML = adminUsers.map(u => `
    <tr>
      <td>
        <img src="${escHtml(u.avatar || '')}" alt="" style="width:32px;height:32px;border-radius:50%;object-fit:cover;background:var(--bg-card2)" onerror="this.style.display='none'" />
      </td>
      <td><strong>${escHtml(u.name)}</strong></td>
      <td style="color:var(--text-muted)">${escHtml(u.email)}</td>
      <td style="font-size:.78rem;color:var(--text-muted)">${u.loginAt ? new Date(u.loginAt).toLocaleDateString('es-ES') : '—'}</td>
    </tr>
  `).join('');
}

/* ============================================================
   SETTINGS
   ============================================================ */
function loadSettings() {
  const settings = DB.getObj(DB_KEYS.SETTINGS, DEFAULT_SETTINGS);
  document.getElementById('setting-store-name').value     = settings.storeName || '';
  document.getElementById('setting-store-subtitle').value = settings.storeSubtitle || '';
  document.getElementById('setting-admin-email').value    = settings.adminEmail || ADMIN_EMAIL;
}

function saveSettings() {
  const settings = DB.getObj(DB_KEYS.SETTINGS, DEFAULT_SETTINGS);
  settings.storeName     = document.getElementById('setting-store-name').value.trim();
  settings.storeSubtitle = document.getElementById('setting-store-subtitle').value.trim();
  settings.adminEmail    = document.getElementById('setting-admin-email').value.trim();
  DB.setObj(DB_KEYS.SETTINGS, settings);
  adminToast('Configuración guardada ✅', 'success');
}

function clearAllData() {
  if (!confirm('⚠️ ¿Borrar TODOS los datos? Add-ons, usuarios, pedidos, todo se perderá.')) return;
  if (!confirm('🔴 Última confirmación: ¿Realmente quieres borrar TODO?')) return;

  localStorage.removeItem(DB_KEYS.ADDONS);
  localStorage.removeItem(DB_KEYS.USERS);
  localStorage.removeItem(DB_KEYS.ORDERS);
  adminToast('Todos los datos han sido eliminados.', 'error');
  loadAllData();
  refreshDashboard();
}

/* ============================================================
   TOAST
   ============================================================ */
function adminToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('admin-toast-container');
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]} toast-icon"></i><span>${msg}</span>`;
  toast.addEventListener('click', () => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); });
  container.appendChild(toast);
  setTimeout(() => { toast.classList.add('hide'); setTimeout(() => toast.remove(), 300); }, duration);
}

/* ============================================================
   UTILITY
   ============================================================ */
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Globals
window.switchPage       = switchPage;
window.toggleSidebar    = toggleSidebar;
window.openAddonForm    = openAddonForm;
window.closeAddonForm   = closeAddonForm;
window.saveAddon        = saveAddon;
window.editAddon        = editAddon;
window.deleteAddon      = deleteAddon;
window.filterAdminAddons= filterAdminAddons;
window.saveSettings     = saveSettings;
window.clearAllData     = clearAllData;
