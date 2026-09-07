// Helpers de interfaz compartidos: estado global de navegación, formateo,
// toasts y modales. No conoce nada de negocio, solo de DOM.

const AppState = {
  currentStore: 'damas',
  currentView: 'dashboard',
};

const PAGE_META = {
  dashboard: { title: 'Inicio', subtitle: 'Resumen del día' },
  catalogo: { title: 'Catálogo e Inventario', subtitle: 'Prendas, existencias y movimientos' },
  venta: { title: 'Nueva Venta', subtitle: 'Registra una venta paso a paso' },
  apartados: { title: 'Apartados', subtitle: 'Prendas reservadas y abonos' },
  clientes: { title: 'Clientes', subtitle: 'Historial de compras y contacto' },
  auditoria: { title: 'Auditoría', subtitle: 'Conteo físico vs. sistema' },
  reportes: { title: 'Reportes', subtitle: 'Cuadre por día, semana o mes' },
  usuarios: { title: 'Usuarios', subtitle: 'Quién entra al sistema y a qué tiendas' },
};

// Tasa del día en memoria, para no consultar el almacenamiento en cada render.
let CURRENT_SETTINGS = { ...DEFAULT_SETTINGS };

async function refreshSettings() {
  CURRENT_SETTINGS = await DB.getSettings();
  return CURRENT_SETTINGS;
}

function fmtMoney(n) {
  return '$' + Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
}

function storeName(storeId) {
  const s = STORES.find(s => s.id === storeId);
  return s ? s.name : storeId;
}

function isSameDay(iso, day) {
  const a = new Date(iso), b = new Date(day);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function toast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const colors = {
    success: 'bg-brand-600',
    error: 'bg-rose-600',
    info: 'bg-slate-700',
  };
  const el = document.createElement('div');
  el.className = `${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 opacity-0 translate-y-2`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => {
    el.classList.remove('opacity-0', 'translate-y-2');
  });
  setTimeout(() => {
    el.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => el.remove(), 300);
  }, 2800);
}

function openModal(innerHtml) {
  const root = document.getElementById('modal-root');
  root.innerHTML = `
    <div class="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-50" id="modal-backdrop">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" id="modal-panel">
        ${innerHtml}
      </div>
    </div>`;
  document.getElementById('modal-backdrop').addEventListener('click', (e) => {
    if (e.target.id === 'modal-backdrop') closeModal();
  });
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function confirmDialog(message) {
  return window.confirm(message);
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function setActiveNav(viewId) {
  document.querySelectorAll('.nav-tab').forEach(btn => {
    const active = btn.dataset.view === viewId;
    btn.classList.toggle('bg-brand-50', active);
    btn.classList.toggle('text-brand-700', active);
    btn.classList.toggle('font-semibold', active);
    btn.classList.toggle('text-slate-500', !active);
  });

  const meta = PAGE_META[viewId] || {};
  const titleEl = document.getElementById('page-title');
  const subtitleEl = document.getElementById('page-subtitle');
  if (titleEl) titleEl.textContent = meta.title || '';
  if (subtitleEl) subtitleEl.textContent = meta.subtitle || '';
}

// Repinta toda la interfaz con los colores de la tienda activa:
// rosado para Damas, azul para Niños. Las variables de color viven en el CSS.
function applyStoreTheme(storeId) {
  document.documentElement.dataset.store = storeId;
}

// Pinta el nombre de la tienda en la barra lateral. En Damas es "Geo's Shop"
// en rosado; en Niños se convierte en "Geo's Shop Kids", con "Kids" en el
// turquesa del logo. Los colores exactos viven en css/styles.css.
function renderBrand(storeId) {
  const marca = brandOf(storeId);

  const nameEl = document.getElementById('brand-name');
  if (nameEl) {
    nameEl.innerHTML = marca.accentText
      ? `<span class="brand-primary">${marca.primaryText}</span> <span class="brand-accent">${marca.accentText}</span>`
      : `<span class="brand-primary">${marca.primaryText}</span>`;
    nameEl.setAttribute('title', marca.name);
  }

  const initialEl = document.getElementById('brand-initial');
  if (initialEl) initialEl.textContent = marca.initial;

  const taglineEl = document.getElementById('brand-tagline');
  if (taglineEl) taglineEl.textContent = marca.tagline;

  document.title = marca.docTitle;
}

// Ficha del usuario conectado, al pie de la barra lateral: quién es, con qué
// modo entró, y por dónde cambia su contraseña o cierra la sesión.
function renderUserChip() {
  const cont = document.getElementById('user-chip');
  if (!cont) return;
  const user = Auth.currentUser();
  if (!user) { cont.innerHTML = ''; return; }

  const rol = roleOf(user.role);
  const iniciales = user.name.trim().split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase();

  cont.innerHTML = `
    <div class="relative">
      <button id="btn-user-menu" class="w-full flex items-center gap-2.5 px-2 py-2 rounded-xl hover:bg-brand-50 transition text-left">
        <span class="w-9 h-9 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">${iniciales}</span>
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-slate-700 truncate">${user.name}</span>
          <span class="block text-[11px] text-slate-400 truncate">${rol.label}</span>
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-slate-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
      </button>
      <div id="user-menu" class="hidden absolute left-0 right-0 bottom-12 bg-white rounded-xl shadow-xl border border-brand-100 p-2 z-50">
        <p class="text-xs text-slate-400 px-3 pt-2 pb-1 truncate">Conectada como ${user.username}</p>
        <button id="btn-my-pass" class="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-brand-50 text-slate-700">Cambiar mi contraseña</button>
        <button id="btn-logout" class="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-rose-50 text-rose-600">Cerrar sesión</button>
      </div>
    </div>`;

  const menu = document.getElementById('user-menu');
  document.getElementById('btn-user-menu').addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));

  document.getElementById('btn-my-pass').addEventListener('click', () => {
    Users.openPasswordModal(Auth.currentUser(), { propia: true });
  });
  document.getElementById('btn-logout').addEventListener('click', () => cerrarSesion());
}

function setActiveStoreButtons(storeId) {
  applyStoreTheme(storeId);
  renderBrand(storeId);
  document.querySelectorAll('.store-tab').forEach(btn => {
    const active = btn.dataset.store === storeId;
    btn.classList.toggle('bg-brand-600', active);
    btn.classList.toggle('text-white', active);
    btn.classList.toggle('shadow-sm', active);
    btn.classList.toggle('text-slate-500', !active);
  });
}

function renderHeaderDate() {
  const el = document.getElementById('header-date');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

function openSidebar() {
  document.getElementById('sidebar').classList.remove('-translate-x-full');
  document.getElementById('sidebar-backdrop').classList.remove('hidden');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.add('-translate-x-full');
  document.getElementById('sidebar-backdrop').classList.add('hidden');
}

function lowStockThreshold() {
  const n = Number(CURRENT_SETTINGS.lowStockThreshold);
  return isNaN(n) ? 3 : n;
}

// "Se está acabando": queda poco o ya no queda nada disponible para vender.
function isLowStock(product) {
  return product.disponible <= lowStockThreshold();
}

function stockStatus(existencia) {
  if (existencia <= 0) return { label: 'Agotado', classes: 'bg-rose-50 text-rose-600' };
  if (existencia <= lowStockThreshold()) return { label: 'Stock Bajo', classes: 'bg-amber-50 text-amber-600' };
  return { label: 'Disponible', classes: 'bg-emerald-50 text-emerald-600' };
}

// ------------------------------------------------------------------ Tasa Bs

function fmtBs(usd) {
  const rate = CURRENT_SETTINGS.rate || 0;
  if (!rate) return 'Bs —';
  return 'Bs ' + (Number(usd || 0) * rate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// La tasa se desactualiza a diario: avisamos si no se ha tocado hoy.
function isRateStale() {
  if (!CURRENT_SETTINGS.rateUpdatedAt) return true;
  return !isSameDay(CURRENT_SETTINGS.rateUpdatedAt, new Date());
}

// --------------------------------------------------------------- WhatsApp

function whatsappLink(phone, message) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  // 04141234567 -> 584141234567
  const national = digits.startsWith('0') ? digits.slice(1) : digits;
  const full = national.startsWith(CURRENT_SETTINGS.whatsappCountryCode) ? national : CURRENT_SETTINGS.whatsappCountryCode + national;
  return `https://wa.me/${full}${message ? '?text=' + encodeURIComponent(message) : ''}`;
}

// --------------------------------------------------------------- Impresión

// Abre una ventana solo con el contenido a imprimir, para no arrastrar
// la interfaz completa al papel.
function printHtml(title, bodyHtml) {
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    toast('Permite las ventanas emergentes para poder imprimir', 'error');
    return;
  }
  // El papel sale con el color y el nombre de la tienda activa.
  const marca = brandOf(AppState.currentStore);
  const { c600, c700, c50 } = marca.print;
  win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${title}</title>
    <style>
      body { font-family: system-ui, sans-serif; color: #1e293b; padding: 24px; max-width: 700px; margin: 0 auto; }
      h1 { font-size: 20px; margin: 0 0 4px; color: ${c600}; }
      h2 { font-size: 15px; margin: 20px 0 8px; }
      .muted { color: #64748b; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
      th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
      th { background: ${c50}; color: ${c700}; }
      .right { text-align: right; }
      .total { font-size: 18px; font-weight: bold; }
      .row { display: flex; justify-content: space-between; font-size: 13px; padding: 3px 0; }
      @media print { body { padding: 0; } }
    </style></head><body>${bodyHtml}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 300);
}

// ----------------------------------------------------------- Descarga JSON

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function todayInput() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateInput(value, endOfDay = false) {
  return new Date(value + (endOfDay ? 'T23:59:59' : 'T00:00:00'));
}
