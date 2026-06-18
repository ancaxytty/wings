/* ============================================================
   MCPE ADDONS STORE V2 – Admin Panel Logic
   Protected with Email/Password Login
   Full CRUD for Add-ons, Orders, Users, Settings
   ============================================================ */

'use strict';

// ─── Admin Credentials (Owner only) ─────────────────────────
const ADMIN_CREDENTIALS = {
  email:    'vidfreenut@gmail.com',
  password: 'Vzomstudios2026'
};

// ─── State ───────────────────────────────────────────────────
let adminAddons = [];
let adminOrders = [];
let adminUsers  = [];
let editingId   = null;
let isAdminAuthenticated = false;

// Uploaded files held in memory (data URLs) until the add-on is published
let _uploadedImage        = null;  // data URL of uploaded image
let _uploadedDownload     = null;  // data URL of uploaded .mcaddon
let _uploadedDownloadName = null;  // original filename of uploaded .mcaddon

const isDataUrl = (s) => typeof s === 'string' && /^data:/i.test(s);

// ─── Init ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkExistingSession();

  // Vincular el formulario de add-ons directamente (más fiable que onsubmit en línea)
  const addonForm = document.getElementById('addon-form');
  if (addonForm) {
    addonForm.addEventListener('submit', saveAddon);
  }
  // Respaldo: si el botón no estuviera dentro del form por cualquier motivo
  const publishBtn = document.getElementById('addon-form-submit-btn');
  if (publishBtn) {
    publishBtn.addEventListener('click', (ev) => {
      const form = document.getElementById('addon-form');
      if (form && publishBtn.type !== 'submit') {
        ev.preventDefault();
        saveAddon(ev);
      }
    });
  }

  // Indicador visible del estado de la nube
  window.addEventListener('cloud-status', () => updateCloudStatus());
  window.addEventListener('db-error', () => updateCloudStatus());
  updateCloudStatus();
  setInterval(updateCloudStatus, 4000);
});

// Actualiza el punto de estado de la nube (verde/rojo/amarillo)
function updateCloudStatus() {
  const el   = document.getElementById('cloud-status');
  const text = document.getElementById('cloud-status-text');
  if (!el || !text) return;
  const st = window.CLOUD_STATUS || { ready: false, connected: false, error: null };
  el.classList.remove('cloud-ok', 'cloud-err', 'cloud-wait', 'cloud-off');
  if (!st.ready) {
    el.classList.add('cloud-off');
    text.textContent = 'Sin nube (local)';
    el.title = 'Firebase no está configurado: los datos NO se comparten entre navegadores.';
  } else if (st.error) {
    el.classList.add('cloud-err');
    text.textContent = 'Permiso denegado';
    el.title = 'La nube rechaza el acceso. Revisa las Reglas de tu Realtime Database (.read y .write en true).';
  } else if (st.connected) {
    el.classList.add('cloud-ok');
    text.textContent = 'Nube conectada';
    el.title = 'Sincronización en la nube activa: los add-ons se ven en todos los navegadores.';
  } else {
    el.classList.add('cloud-wait');
    text.textContent = 'Conectando…';
    el.title = 'Conectando con la nube…';
  }
}

/* ============================================================
   ADMIN AUTHENTICATION
   ============================================================ */
function checkExistingSession() {
  const session = localStorage.getItem('mcpe_admin_session');
  if (session) {
    try {
      const data = JSON.parse(session);
      // Session valid for 24 hours
      if (data.email === ADMIN_CREDENTIALS.email && (Date.now() - data.loginAt) < 24 * 60 * 60 * 1000) {
        isAdminAuthenticated = true;
        showAdminPanel();
        return;
      }
    } catch {}
    localStorage.removeItem('mcpe_admin_session');
  }
  showLoginGate();
}

function adminLogin(event) {
  event.preventDefault();

  const email    = document.getElementById('admin-login-email').value.trim();
  const password = document.getElementById('admin-login-password').value;

  // Validate credentials
  if (email === ADMIN_CREDENTIALS.email && password === ADMIN_CREDENTIALS.password) {
    // Success - save session
    isAdminAuthenticated = true;
    localStorage.setItem('mcpe_admin_session', JSON.stringify({
      email: email,
      loginAt: Date.now()
    }));

    hideLoginError();
    showAdminPanel();
    adminToast('¡Bienvenido, Owner!', 'success');
  } else {
    // Failed
    showLoginError('Credenciales incorrectas. Solo el Owner puede acceder.');
    shakeLoginForm();
  }
}

function adminLogout() {
  isAdminAuthenticated = false;
  localStorage.removeItem('mcpe_admin_session');
  showLoginGate();
  adminToast('Sesión de admin cerrada', 'info');
}

function showLoginGate() {
  document.getElementById('admin-login-gate').style.display = 'flex';
  document.getElementById('admin-panel').style.display = 'none';
}

function showAdminPanel() {
  document.getElementById('admin-login-gate').style.display = 'none';
  document.getElementById('admin-panel').style.display = 'flex';

  // Set admin email in sidebar
  document.getElementById('sidebar-admin-email').textContent = ADMIN_CREDENTIALS.email;

  // Set settings fields
  document.getElementById('setting-admin-email').value = ADMIN_CREDENTIALS.email;
  document.getElementById('setting-admin-password').value = '••••••••••••';

  // Load data
  loadAllData();
  refreshDashboard();
  loadSettings();
  startRealtime();
}

function showLoginError(msg) {
  const errorEl = document.getElementById('login-error');
  const textEl  = document.getElementById('login-error-text');
  textEl.textContent = msg;
  errorEl.style.display = 'flex';
}

function hideLoginError() {
  document.getElementById('login-error').style.display = 'none';
}

function shakeLoginForm() {
  const form = document.getElementById('admin-login-form');
  form.classList.add('shake');
  setTimeout(() => form.classList.remove('shake'), 500);
}

function togglePasswordVisibility() {
  const input = document.getElementById('admin-login-password');
  const icon  = document.getElementById('password-eye-icon');
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fas fa-eye-slash';
  } else {
    input.type = 'password';
    icon.className = 'fas fa-eye';
  }
}

/* ============================================================
   SIDEBAR NAVIGATION
   ============================================================ */
function switchPage(page, link) {
  if (!isAdminAuthenticated) return;

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
    pending: 'Pendientes de aprobación',
    orders: 'Pedidos / Ventas',
    users: 'Usuarios',
    marketing: 'Marketing',
    comments: 'Moderación de comentarios',
    settings: 'Configuración'
  };
  document.getElementById('topbar-title').textContent = titles[page] || 'Admin';

  // Refresh data
  if (page === 'dashboard') refreshDashboard();
  if (page === 'addons')    renderAddonsTable();
  if (page === 'pending')   renderPendingTable();
  if (page === 'orders')    renderOrdersTable();
  if (page === 'users')     renderUsersTable();
  if (page === 'marketing') { renderCouponsTable(); renderAdsTable(); }
  if (page === 'comments')  renderCommentsModeration();

  // Close sidebar on mobile
  document.getElementById('sidebar').classList.remove('open');
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
    if (!isAdminAuthenticated) return;
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
  updatePendingBadge();

  // Recent orders
  const recentOrders = document.getElementById('dash-recent-orders');
  if (adminOrders.length === 0) {
    recentOrders.innerHTML = '<p class="empty-text">No hay pedidos aún.</p>';
  } else {
    recentOrders.innerHTML = adminOrders.slice(-5).reverse().map(o => `
      <div class="dash-order-item">
        <div class="dash-addon-item-icon"><i class="fas fa-dollar-sign"></i></div>
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
    popular.innerHTML = '<p class="empty-text">No hay add-ons aún. ¡Crea tu primer add-on!</p>';
  } else {
    const sorted = [...adminAddons].sort((a, b) => (b.downloads || 0) - (a.downloads || 0)).slice(0, 5);
    popular.innerHTML = sorted.map(a => `
      <div class="dash-addon-item">
        <div class="dash-addon-item-icon">${a.emoji ? escHtml(a.emoji) : '<i class="fas fa-cube"></i>'}</div>
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
    body.innerHTML = '<tr><td colspan="6" class="empty-text">No hay add-ons. ¡Crea tu primer add-on!</td></tr>';
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
                ? `<img src="${escHtml(addon.image)}" alt="" onerror="this.outerHTML='${addon.emoji ? escHtml(addon.emoji) : '&#9638;'}'" />`
                : (addon.emoji ? escHtml(addon.emoji) : '<i class="fas fa-cube"></i>')
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
   PENDING ADD-ONS (aprobación)
   ============================================================ */
function updatePendingBadge() {
  const pending = DB.get(DB_KEYS.ADDONS).filter(a => a.status === 'pending');
  const badge = document.getElementById('pending-badge');
  if (badge) {
    badge.textContent = pending.length;
    badge.style.display = pending.length > 0 ? 'inline-flex' : 'none';
  }
}

function renderPendingTable() {
  loadAllData();
  const cont  = document.getElementById('pending-list');
  const count = document.getElementById('pending-count');
  const pending = adminAddons.filter(a => a.status === 'pending');
  if (count) count.textContent = `${pending.length} pendiente${pending.length !== 1 ? 's' : ''}`;
  updatePendingBadge();

  if (!cont) return;
  if (pending.length === 0) {
    cont.innerHTML = '<p class="empty-text">No hay add-ons pendientes. ¡Todo al día!</p>';
    return;
  }

  cont.innerHTML = pending.map(a => {
    const isFree = !a.price || parseFloat(a.price) === 0;
    return `
      <div class="pending-card">
        <div class="pending-card-img">
          ${a.image ? `<img src="${escHtml(a.image)}" alt="" onerror="this.outerHTML='&#9638;'" />` : '<i class="fas fa-cube"></i>'}
        </div>
        <div class="pending-card-info">
          <h3>${escHtml(a.name)}</h3>
          <p>${escHtml((a.description || 'Sin descripción').substring(0, 120))}</p>
          <div class="pending-card-meta">
            <span><i class="fas fa-user"></i> ${escHtml(a.authorName || 'Anónimo')}</span>
            <span><i class="fas fa-${a.platform === 'java' ? 'desktop' : 'mobile-screen-button'}"></i> ${a.platform === 'java' ? 'Java' : 'Bedrock'}</span>
            <span><i class="fas fa-tag"></i> ${escHtml(a.category || a.contentType || '—')}</span>
            <span>${isFree ? 'Gratis' : '$' + parseFloat(a.price).toFixed(2)}</span>
          </div>
        </div>
        <div class="pending-card-actions">
          <button class="btn btn-success btn-sm" onclick="approveAddon('${a.id}')"><i class="fas fa-check"></i> Aprobar</button>
          <button class="btn btn-danger btn-sm" onclick="rejectAddon('${a.id}')"><i class="fas fa-times"></i> Rechazar</button>
        </div>
      </div>`;
  }).join('');
}

function approveAddon(id) {
  if (!isAdminAuthenticated) return;
  const addons = DB.get(DB_KEYS.ADDONS);
  const idx = addons.findIndex(a => a.id === id);
  if (idx === -1) return;
  addons[idx].status = 'approved';
  addons[idx].approved = true;
  addons[idx].approvedAt = new Date().toISOString();
  DB.set(DB_KEYS.ADDONS, addons);
  adminAddons = addons;
  renderPendingTable();
  refreshDashboard();
  adminToast('Add-on aprobado y publicado.', 'success');
}

function rejectAddon(id) {
  if (!isAdminAuthenticated) return;
  if (!confirm('¿Rechazar y eliminar este add-on?')) return;
  let addons = DB.get(DB_KEYS.ADDONS);
  addons = addons.filter(a => a.id !== id);
  DB.set(DB_KEYS.ADDONS, addons);
  adminAddons = addons;
  renderPendingTable();
  refreshDashboard();
  adminToast('Add-on rechazado.', 'warning');
}

/* ============================================================
   ADDON FORM (CREATE / EDIT)
   ============================================================ */
function openAddonForm(addonId = null) {
  if (!isAdminAuthenticated) return;
  editingId = addonId;
  const modal = document.getElementById('addon-form-modal');
  const title = document.getElementById('addon-form-title');
  const btn   = document.getElementById('addon-form-submit-btn');

  // Reset form + uploads
  document.getElementById('addon-form').reset();
  document.getElementById('addon-form-id').value = '';
  document.getElementById('addon-form-new').checked = true;
  resetUploadState();

  if (addonId) {
    const addon = adminAddons.find(a => a.id === addonId);
    if (!addon) return;
    title.textContent = 'Editar Add-on';
    btn.innerHTML     = '<i class="fas fa-cloud-arrow-up"></i> Publicar cambios';
    // Fill form
    document.getElementById('addon-form-id').value        = addon.id;
    document.getElementById('addon-form-name').value      = addon.name || '';
    document.getElementById('addon-form-category').value  = addon.category || addon.contentType || '';
    document.getElementById('addon-form-platform').value  = addon.platform || 'bedrock';
    document.getElementById('addon-form-desc').value      = addon.description || '';
    document.getElementById('addon-form-price').value     = addon.price || 0;
    document.getElementById('addon-form-version').value   = addon.version || '';
    document.getElementById('addon-form-mcversion').value = addon.mcVersion || '';
    document.getElementById('addon-form-emoji').value     = addon.emoji || '';
    document.getElementById('addon-form-featured').checked= addon.isFeatured || false;
    document.getElementById('addon-form-new').checked     = addon.isNew || false;

    // Image: uploaded (data URL) vs external URL
    if (isDataUrl(addon.image)) {
      _uploadedImage = addon.image;
      showImagePreview(addon.image, 'Imagen actual');
    } else if (addon.image) {
      document.getElementById('addon-form-image').value = addon.image;
      showImagePreview(addon.image, '');
    }

    // Download: uploaded file (data URL) vs external URL
    if (isDataUrl(addon.downloadUrl)) {
      _uploadedDownload     = addon.downloadUrl;
      _uploadedDownloadName = addon.downloadName || (addon.name + '.mcaddon');
      document.getElementById('addon-form-download-filename').textContent = _uploadedDownloadName;
    } else if (addon.downloadUrl) {
      document.getElementById('addon-form-download').value = addon.downloadUrl;
    }
  } else {
    title.textContent = 'Nuevo Add-on';
    btn.innerHTML     = '<i class="fas fa-cloud-arrow-up"></i> Publicar Add-on';
  }

  modal.classList.add('open');
}

function closeAddonForm() {
  document.getElementById('addon-form-modal').classList.remove('open');
  editingId = null;
  resetUploadState();
}

/* ============================================================
   FILE UPLOADS (image + .mcaddon)  →  base64 data URLs
   Se guardan en la nube para que todos los descarguen igual.
   ============================================================ */
const MAX_FILE_MB = 8; // limite razonable para guardar en la nube

// Resetea el estado de subidas y la UI del formulario
function resetUploadState() {
  _uploadedImage        = null;
  _uploadedDownload     = null;
  _uploadedDownloadName = null;
  const imgFile = document.getElementById('addon-form-image-file');
  const dlFile  = document.getElementById('addon-form-download-file');
  if (imgFile) imgFile.value = '';
  if (dlFile)  dlFile.value  = '';
  const imgName = document.getElementById('addon-form-image-filename');
  const dlName  = document.getElementById('addon-form-download-filename');
  if (imgName) imgName.textContent = 'Ningún archivo seleccionado';
  if (dlName)  dlName.textContent  = 'Ningún archivo seleccionado';
  hideImagePreview();
}

function showImagePreview(src, label) {
  const wrap = document.getElementById('addon-form-image-preview');
  const img  = document.getElementById('addon-form-image-preview-img');
  if (!wrap || !img) return;
  img.src = src;
  wrap.style.display = 'flex';
  if (label) {
    document.getElementById('addon-form-image-filename').textContent = label;
  }
}

function hideImagePreview() {
  const wrap = document.getElementById('addon-form-image-preview');
  if (wrap) wrap.style.display = 'none';
}

// Subida y compresión de imagen (reduce tamaño para la nube)
function handleImageUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    adminToast('Selecciona un archivo de imagen válido.', 'error');
    input.value = '';
    return;
  }
  document.getElementById('addon-form-image-filename').textContent = file.name;

  const reader = new FileReader();
  reader.onload = (e) => {
    const imgEl = new Image();
    imgEl.onload = () => {
      // Redimensionar a un máximo de 800px para reducir el peso
      const MAX = 800;
      let { width, height } = imgEl;
      if (width > MAX || height > MAX) {
        if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(imgEl, 0, 0, width, height);
      try {
        _uploadedImage = canvas.toDataURL('image/jpeg', 0.85);
      } catch {
        _uploadedImage = e.target.result; // fallback sin comprimir
      }
      // Al subir archivo, ignoramos la URL escrita
      document.getElementById('addon-form-image').value = '';
      showImagePreview(_uploadedImage, file.name);
    };
    imgEl.onerror = () => adminToast('No se pudo procesar la imagen.', 'error');
    imgEl.src = e.target.result;
  };
  reader.onerror = () => adminToast('Error al leer la imagen.', 'error');
  reader.readAsDataURL(file);
}

function clearImageUpload() {
  _uploadedImage = null;
  document.getElementById('addon-form-image-file').value = '';
  document.getElementById('addon-form-image').value = '';
  document.getElementById('addon-form-image-filename').textContent = 'Ningún archivo seleccionado';
  hideImagePreview();
}

// Subida del archivo del add-on (.mcaddon / .mcpack / .zip)
function handleDownloadUpload(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > MAX_FILE_MB) {
    adminToast(`El archivo pesa ${sizeMB.toFixed(1)} MB. Máximo ${MAX_FILE_MB} MB para subida directa; usa un enlace para archivos más grandes.`, 'error');
    input.value = '';
    return;
  }
  document.getElementById('addon-form-download-filename').textContent = `${file.name} (${sizeMB.toFixed(2)} MB)`;

  const reader = new FileReader();
  reader.onload = (e) => {
    _uploadedDownload     = e.target.result; // data URL base64
    _uploadedDownloadName = file.name;
    // Al subir archivo, ignoramos la URL escrita
    document.getElementById('addon-form-download').value = '';
  };
  reader.onerror = () => adminToast('Error al leer el archivo.', 'error');
  reader.readAsDataURL(file);
}

function saveAddon(e) {
  if (e && e.preventDefault) e.preventDefault();
  try {
    if (!isAdminAuthenticated) {
      adminToast('Tu sesión expiró. Inicia sesión de nuevo.', 'error');
      return;
    }

    const id          = document.getElementById('addon-form-id').value;
    const name        = document.getElementById('addon-form-name').value.trim();
    const category    = document.getElementById('addon-form-category').value;
    const platform    = (document.getElementById('addon-form-platform') || {}).value || 'bedrock';
    const description = document.getElementById('addon-form-desc').value.trim();
    const price       = parseFloat(document.getElementById('addon-form-price').value) || 0;
    const version     = document.getElementById('addon-form-version').value.trim();
    const mcVersion   = document.getElementById('addon-form-mcversion').value.trim();
    const emoji       = document.getElementById('addon-form-emoji').value.trim();
    const imageUrl    = document.getElementById('addon-form-image').value.trim();
    const downloadUrlInput = document.getElementById('addon-form-download').value.trim();
    const isFeatured  = document.getElementById('addon-form-featured').checked;
    const isNew       = document.getElementById('addon-form-new').checked;

    // La imagen/archivo subido tiene prioridad sobre la URL
    const image = _uploadedImage || imageUrl;
    const downloadUrl  = _uploadedDownload || downloadUrlInput;
    const downloadName = _uploadedDownload ? _uploadedDownloadName : '';

    if (!name || !category) {
      adminToast('Completa el nombre y la categoría.', 'error');
      return;
    }
    const dlFileInput = document.getElementById('addon-form-download-file');
    if (dlFileInput && dlFileInput.files.length > 0 && !_uploadedDownload) {
      adminToast('El archivo aún se está procesando, espera un momento e intenta de nuevo.', 'warning');
      return;
    }
    if (!downloadUrl) {
      adminToast('Sube un archivo .mcaddon o pega un enlace de descarga.', 'error');
      return;
    }

    const addons = DB.get(DB_KEYS.ADDONS);
    let successMsg;

    if (id) {
      const idx = addons.findIndex(a => a.id === id);
      if (idx !== -1) {
        addons[idx] = {
          ...addons[idx],
          name, category, contentType: category, platform, description, price, version, mcVersion,
          emoji, image, downloadUrl, downloadName, isFeatured, isNew,
          updatedAt: new Date().toISOString()
        };
      }
      successMsg = 'Add-on publicado (cambios guardados)';
    } else {
      const newAddon = {
        id: 'addon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
        name, category, contentType: category, platform, description, price, version, mcVersion,
        emoji: emoji || '', image, downloadUrl, downloadName, isFeatured, isNew,
        downloads: 0, purchases: 0,
        status: 'approved', approved: true,
        createdAt: new Date().toISOString()
      };
      addons.push(newAddon);
      successMsg = 'Add-on publicado correctamente';
    }

    // Guardar: la UI se actualiza YA (local). La nube se sincroniza en segundo plano.
    const result = DB.set(DB_KEYS.ADDONS, addons);
    adminAddons = DB.get(DB_KEYS.ADDONS);
    adminToast(successMsg, 'success');
    closeAddonForm();
    renderAddonsTable();
    refreshDashboard();

    // Si la nube falla, avisar sin bloquear (el add-on ya quedó publicado localmente)
    Promise.resolve(result).catch(err => {
      if (err && err.message === 'LOCAL_STORAGE_FULL') {
        adminToast('El archivo es muy grande para guardarse. Usa un enlace o un archivo más liviano.', 'error', 8000);
      } else {
        adminToast('Publicado localmente, pero no se pudo sincronizar con la nube. Revisa las reglas de tu Realtime Database (lectura/escritura = true).', 'warning', 9000);
      }
    });
  } catch (err) {
    console.error('[Admin] Error al publicar add-on:', err);
    adminToast('Error al publicar: ' + (err && err.message ? err.message : err), 'error', 8000);
  }
}

function editAddon(id) {
  openAddonForm(id);
}

function deleteAddon(id) {
  if (!isAdminAuthenticated) return;
  if (!confirm('¿Estás seguro de eliminar este add-on? Esta acción no se puede deshacer.')) return;

  let addons = DB.get(DB_KEYS.ADDONS);
  addons = addons.filter(a => a.id !== id);
  DB.set(DB_KEYS.ADDONS, addons);
  adminAddons = addons;
  renderAddonsTable();
  refreshDashboard();
  adminToast('Add-on eliminado', 'warning');
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
    body.innerHTML = '<tr><td colspan="6" class="empty-text">No hay pedidos aún.</td></tr>';
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
      <td><strong>${escHtml(u.name)}</strong>${typeof v14EmblemHTML === 'function' ? ' ' + v14EmblemHTML(u.id, 'sm', u) + ' ' + v14LevelChip(u.id, u) : ''}</td>
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
  document.getElementById('setting-store-name').value     = settings.storeName || 'MCPE Addons Store';
  document.getElementById('setting-store-subtitle').value = settings.storeSubtitle || 'Los mejores Add-ons para Minecraft PE';
}

function saveSettings() {
  if (!isAdminAuthenticated) return;
  const settings = DB.getObj(DB_KEYS.SETTINGS, DEFAULT_SETTINGS);
  settings.storeName     = document.getElementById('setting-store-name').value.trim();
  settings.storeSubtitle = document.getElementById('setting-store-subtitle').value.trim();
  DB.setObj(DB_KEYS.SETTINGS, settings);
  adminToast('Configuración guardada', 'success');
}

function clearAllData() {
  if (!isAdminAuthenticated) return;
  if (!confirm('ADVERTENCIA: ¿Borrar TODOS los datos? Add-ons, usuarios, pedidos, todo se perderá.')) return;
  if (!confirm('Última confirmación: ¿Realmente quieres borrar TODO?')) return;

  // Borrar tanto localmente como en la nube (Firebase)
  DB.set(DB_KEYS.ADDONS, []);
  DB.set(DB_KEYS.USERS, []);
  DB.set(DB_KEYS.ORDERS, []);
  adminToast('Todos los datos han sido eliminados.', 'error');
  loadAllData();
  refreshDashboard();
}

/* ============================================================
   TOAST
   ============================================================ */
function adminToast(msg, type = 'info', duration = 4000) {
  const container = document.getElementById('admin-toast-container');
  if (!container) return;
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
window.adminLogin        = adminLogin;
window.adminLogout       = adminLogout;
window.togglePasswordVisibility = togglePasswordVisibility;
window.switchPage        = switchPage;
window.toggleSidebar     = toggleSidebar;
window.openAddonForm     = openAddonForm;
window.closeAddonForm    = closeAddonForm;
window.renderPendingTable = renderPendingTable;
window.approveAddon      = approveAddon;
window.rejectAddon       = rejectAddon;
window.handleImageUpload = handleImageUpload;
window.clearImageUpload  = clearImageUpload;
window.handleDownloadUpload = handleDownloadUpload;
window.saveAddon         = saveAddon;
window.editAddon         = editAddon;
window.deleteAddon       = deleteAddon;
window.filterAdminAddons = filterAdminAddons;
window.saveSettings      = saveSettings;
window.clearAllData      = clearAllData;



/* ============================================================
   v13.0 — MARKETING: Cupones de descuento
   (usa DBX de v13.js, clave mcpe_coupons)
   ============================================================ */
function renderCouponsTable() {
  if (!window.DBX) return;
  const body = document.getElementById('coupons-table-body');
  if (!body) return;
  const coupons = DBX.get(V13_KEYS.COUPONS);
  if (!coupons.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-text">No hay cupones. Crea el primero.</td></tr>';
    return;
  }
  body.innerHTML = coupons.map((c, i) => {
    const disc = c.type === 'percent' ? `${c.value}%` : `$${c.value}`;
    const on = c.active !== false;
    return `<tr>
      <td><span class="mk-code">${escHtml(c.code)}</span></td>
      <td>${disc}</td>
      <td>${escHtml(c.desc || '—')}</td>
      <td><span class="mk-badge ${on ? 'on' : 'off'}">${on ? 'Activo' : 'Inactivo'}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-secondary" onclick="toggleCoupon(${i})" title="${on ? 'Desactivar' : 'Activar'}"><i class="fas fa-${on ? 'toggle-on' : 'toggle-off'}"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteCoupon(${i})" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function addCoupon() {
  if (!isAdminAuthenticated || !window.DBX) return;
  const code = (document.getElementById('mk-coupon-code').value || '').trim().toUpperCase();
  const type = document.getElementById('mk-coupon-type').value;
  const value = parseFloat(document.getElementById('mk-coupon-value').value) || 0;
  const desc = (document.getElementById('mk-coupon-desc').value || '').trim();
  if (!code) { adminToast('Escribe un código.', 'error'); return; }
  if (value <= 0) { adminToast('El valor debe ser mayor a 0.', 'error'); return; }
  const coupons = DBX.get(V13_KEYS.COUPONS);
  if (coupons.some(c => c.code.toUpperCase() === code)) { adminToast('Ese código ya existe.', 'error'); return; }
  coupons.push({ code, type, value, desc, active: true });
  DBX.set(V13_KEYS.COUPONS, coupons);
  document.getElementById('mk-coupon-code').value = '';
  document.getElementById('mk-coupon-value').value = '';
  document.getElementById('mk-coupon-desc').value = '';
  renderCouponsTable();
  adminToast('Cupón creado.', 'success');
}

function toggleCoupon(i) {
  const coupons = DBX.get(V13_KEYS.COUPONS);
  if (!coupons[i]) return;
  coupons[i].active = coupons[i].active === false;
  DBX.set(V13_KEYS.COUPONS, coupons);
  renderCouponsTable();
}

function deleteCoupon(i) {
  const coupons = DBX.get(V13_KEYS.COUPONS);
  if (!coupons[i]) return;
  if (!confirm('¿Eliminar el cupón ' + coupons[i].code + '?')) return;
  coupons.splice(i, 1);
  DBX.set(V13_KEYS.COUPONS, coupons);
  renderCouponsTable();
  adminToast('Cupón eliminado.', 'warning');
}

/* ============================================================
   v13.0 — MARKETING: Anuncios (clave mcpe_ads)
   ============================================================ */
function renderAdsTable() {
  if (!window.DBX) return;
  const body = document.getElementById('ads-table-body');
  if (!body) return;
  const ads = DBX.get(V13_KEYS.ADS);
  if (!ads.length) {
    body.innerHTML = '<tr><td colspan="5" class="empty-text">No hay anuncios. Crea el primero.</td></tr>';
    return;
  }
  body.innerHTML = ads.map((a, i) => {
    const on = a.active !== false;
    return `<tr>
      <td><span class="mk-badge on">${escHtml(a.pill || 'Anuncio')}</span></td>
      <td><strong>${escHtml(a.title || '')}</strong></td>
      <td class="comment-mod-text">${escHtml(a.text || '')}</td>
      <td><span class="mk-badge ${on ? 'on' : 'off'}">${on ? 'Visible' : 'Oculto'}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn btn-sm btn-secondary" onclick="toggleAd(${i})" title="${on ? 'Ocultar' : 'Mostrar'}"><i class="fas fa-${on ? 'eye' : 'eye-slash'}"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteAd(${i})" title="Eliminar"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function addAd() {
  if (!isAdminAuthenticated || !window.DBX) return;
  const pill = (document.getElementById('mk-ad-pill').value || '').trim() || 'Anuncio';
  const title = (document.getElementById('mk-ad-title').value || '').trim();
  const text = (document.getElementById('mk-ad-text').value || '').trim();
  const link = (document.getElementById('mk-ad-link').value || '').trim();
  if (!title) { adminToast('Escribe un título.', 'error'); return; }
  const palettes = [['#0f2a3d', '#0a1626'], ['#2a1f3d', '#140d26'], ['#3d2f0f', '#261d0a'], ['#0f3d2a', '#0a261a']];
  const ads = DBX.get(V13_KEYS.ADS);
  const pal = palettes[ads.length % palettes.length];
  ads.push({ id: 'ad_' + Date.now(), pill, title, text, link, c1: pal[0], c2: pal[1], icon: 'fa-bullhorn', active: true });
  DBX.set(V13_KEYS.ADS, ads);
  ['mk-ad-pill', 'mk-ad-title', 'mk-ad-text', 'mk-ad-link'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
  renderAdsTable();
  adminToast('Anuncio creado.', 'success');
}

function toggleAd(i) {
  const ads = DBX.get(V13_KEYS.ADS);
  if (!ads[i]) return;
  ads[i].active = ads[i].active === false;
  DBX.set(V13_KEYS.ADS, ads);
  renderAdsTable();
}

function deleteAd(i) {
  const ads = DBX.get(V13_KEYS.ADS);
  if (!ads[i]) return;
  if (!confirm('¿Eliminar este anuncio?')) return;
  ads.splice(i, 1);
  DBX.set(V13_KEYS.ADS, ads);
  renderAdsTable();
  adminToast('Anuncio eliminado.', 'warning');
}

/* ============================================================
   v13.0 — Moderación de comentarios (clave mcpe_comments)
   ============================================================ */
function renderCommentsModeration() {
  if (!window.DBX) return;
  const body = document.getElementById('comments-mod-body');
  const count = document.getElementById('comments-mod-count');
  if (!body) return;
  const comments = DBX.get(V13_KEYS.COMMENTS).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const addons = DB.get(DB_KEYS.ADDONS);
  if (count) count.textContent = `${comments.length} comentario${comments.length !== 1 ? 's' : ''}`;
  if (!comments.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty-text">No hay comentarios todavía.</td></tr>';
    return;
  }
  body.innerHTML = comments.map(c => {
    const addon = addons.find(a => a.id === c.addonId);
    const stars = c.rating ? '★'.repeat(c.rating) + '☆'.repeat(5 - c.rating) : '—';
    return `<tr>
      <td>${escHtml(c.author || 'Usuario')}${c.isAdmin ? ' <span class="mk-badge on">Staff</span>' : ''}</td>
      <td>${escHtml(addon ? addon.name : '(eliminado)')}</td>
      <td class="comment-mod-text">${escHtml(c.text || '')}</td>
      <td style="color:var(--gold)">${stars}</td>
      <td style="font-size:.75rem;color:var(--text-muted)">${new Date(c.date).toLocaleDateString('es-ES')}</td>
      <td><button class="btn btn-sm btn-danger" onclick="adminDeleteComment('${c.id}')" title="Eliminar"><i class="fas fa-trash"></i></button></td>
    </tr>`;
  }).join('');
}

function adminDeleteComment(id) {
  if (!isAdminAuthenticated || !window.DBX) return;
  if (!confirm('¿Eliminar este comentario?')) return;
  const list = DBX.get(V13_KEYS.COMMENTS).filter(c => c.id !== id);
  DBX.set(V13_KEYS.COMMENTS, list);
  renderCommentsModeration();
  adminToast('Comentario eliminado.', 'info');
}

// Exponer
window.renderCouponsTable = renderCouponsTable;
window.addCoupon = addCoupon;
window.toggleCoupon = toggleCoupon;
window.deleteCoupon = deleteCoupon;
window.renderAdsTable = renderAdsTable;
window.addAd = addAd;
window.toggleAd = toggleAd;
window.deleteAd = deleteAd;
window.renderCommentsModeration = renderCommentsModeration;
window.adminDeleteComment = adminDeleteComment;
