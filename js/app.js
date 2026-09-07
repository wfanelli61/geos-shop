// Controlador principal: navegación entre vistas, switch de tienda,
// tasa del día y respaldo de datos.

const VIEWS = {
  dashboard: Dashboard,
  catalogo: Catalog,
  venta: Sales,
  apartados: Layaway,
  clientes: Clients,
  auditoria: Audit,
  reportes: Reports,
  usuarios: Users,
};

async function renderCurrentView() {
  setActiveNav(AppState.currentView);
  const module = VIEWS[AppState.currentView];
  if (module.syncStore) module.syncStore();
  await module.render();
}

// Vistas que exigen un permiso para poder abrirse.
const VIEW_PERMISSIONS = {
  usuarios: 'manageUsers',
};

function switchView(viewId) {
  // Si alguien llega a una vista para la que no tiene permiso (por ejemplo
  // porque cambió de rol con la vista abierta), se le devuelve al inicio.
  const permiso = VIEW_PERMISSIONS[viewId];
  if (permiso && !Auth.can(permiso)) {
    toast('No tienes acceso a esa sección.', 'error');
    viewId = 'dashboard';
  }

  AppState.currentView = viewId;
  Object.keys(VIEWS).forEach(id => {
    document.getElementById(`view-${id}`).classList.toggle('hidden', id !== viewId);
  });
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderCurrentView();
}

// Cambiar de tienda es la acción que separa a una vendedora de damas de una de
// niños, así que se comprueba acá y no solo escondiendo botones.
function switchStore(storeId) {
  if (!Auth.canAccessStore(storeId)) {
    toast(`No tienes acceso a la ${storeName(storeId)}.`, 'error');
    return;
  }
  AppState.currentStore = storeId;
  setActiveStoreButtons(storeId);
  renderCurrentView();
}

// Dibuja el selector de tienda con las tiendas del usuario. Quien solo entra a
// una no ve un selector, sino el nombre de su tienda: no hay nada que elegir.
function renderStoreSwitcher() {
  const cont = document.getElementById('store-switcher');
  if (!cont) return;
  const permitidas = Auth.allowedStores();

  if (permitidas.length <= 1) {
    const unica = permitidas[0];
    cont.innerHTML = unica ? `
      <div class="flex items-center gap-2 bg-brand-50 rounded-xl px-3 py-2.5">
        <span class="w-2 h-2 rounded-full bg-brand-500 shrink-0"></span>
        <span class="text-sm font-medium text-brand-700 truncate">${storeName(unica).replace('Tienda de ', '')}</span>
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-brand-400 ml-auto shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
      </div>` : '';
    return;
  }

  cont.innerHTML = `
    <div class="flex bg-brand-50 rounded-xl p-1 gap-1">
      ${permitidas.map(id => `
        <button class="store-tab flex-1 px-2 py-2 rounded-lg text-xs sm:text-sm font-medium transition text-center" data-store="${id}">
          ${storeName(id).replace('Tienda de ', '')}
        </button>`).join('')}
    </div>`;

  cont.querySelectorAll('.store-tab').forEach(btn => {
    btn.addEventListener('click', () => switchStore(btn.dataset.store));
  });
}

// Muestra u oculta las secciones del menú según el modo de acceso.
function applyRoleToNav() {
  document.querySelectorAll('.nav-tab[data-requiere]').forEach(btn => {
    btn.classList.toggle('hidden', !Auth.can(btn.dataset.requiere));
  });
}

function renderRateBadge(buscando = false) {
  const badge = document.getElementById('rate-badge');
  if (!badge) return;
  const stale = isRateStale();
  const fuente = CURRENT_SETTINGS.rateSource || (CURRENT_SETTINGS.rateIsManual ? 'escrita a mano' : 'sin fuente');
  const detalle = CURRENT_SETTINGS.rateUpdatedAt
    ? `${fuente} · ${fmtDateTime(CURRENT_SETTINGS.rateUpdatedAt)}`
    : 'nunca se ha actualizado';

  const colores = buscando
    ? 'bg-slate-50 text-slate-500'
    : stale
      ? 'bg-amber-50 text-amber-700'
      : 'bg-brand-50 text-brand-700';

  badge.innerHTML = `
    <div class="flex items-center rounded-full overflow-hidden ${colores}">
      <button id="btn-rate" title="Tasa del día — ${detalle}" class="flex items-center gap-1.5 text-xs font-medium pl-3 pr-2 py-1.5 hover:brightness-95 transition">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1v22"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
        Bs ${CURRENT_SETTINGS.rate}${stale && !buscando ? ' · desactualizada' : ''}
      </button>
      <button id="btn-rate-refresh" title="Buscar la tasa del BCV ahora" ${buscando ? 'disabled' : ''} class="pr-3 pl-1.5 py-1.5 hover:brightness-95 transition border-l border-current/15">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 ${buscando ? 'animate-spin' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline></svg>
      </button>
    </div>`;

  document.getElementById('btn-rate').addEventListener('click', openRateModal);
  document.getElementById('btn-rate-refresh').addEventListener('click', () => refreshRateFromBCV());
}

// Busca la tasa del BCV y repinta lo que dependa de ella.
async function refreshRateFromBCV({ silencioso = false } = {}) {
  renderRateBadge(true);
  const res = await RateService.updateNow();
  renderRateBadge();
  if (res.ok) {
    toast(`Tasa del BCV actualizada: Bs ${res.rate}`);
    renderCurrentView();
  } else if (!silencioso) {
    toast('No se pudo consultar el BCV. Puedes escribir la tasa a mano.', 'error');
    console.warn('Tasa BCV:', res.error);
  }
  return res;
}

// Fuente de la última tasa que trajo el botón "Buscar ahora" del formulario.
let ultimaFuenteBCV = null;

function openRateModal() {
  const fuente = CURRENT_SETTINGS.rateSource;
  ultimaFuenteBCV = null;
  openModal(`
    <form id="rate-form" class="p-6 flex flex-col gap-4">
      <div>
        <h3 class="text-lg font-semibold text-slate-800">Tasa del Día</h3>
        <p class="text-sm text-slate-400">Bolívares por dólar. Se usa para mostrar cuánto cobrar por Pago Móvil y Punto de Venta.</p>
      </div>

      <div class="border border-brand-200 rounded-xl p-4 bg-brand-50/50 flex flex-col gap-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-sm font-semibold text-slate-700">Tasa oficial del BCV</p>
            <p class="text-xs text-slate-500 mt-0.5">La misma que publica
              <a href="${RATE_REFERENCE_URL}" target="_blank" rel="noopener" class="text-brand-700 font-medium underline">alcambio.app</a>.
            </p>
          </div>
          <button type="button" id="btn-fetch-rate" class="shrink-0 bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"></path><polyline points="21 3 21 9 15 9"></polyline></svg>
            Buscar ahora
          </button>
        </div>
        <p id="fetch-status" class="text-xs text-slate-500">
          ${CURRENT_SETTINGS.rateUpdatedAt
            ? (fuente ? `Última tasa tomada de ${fuente}.` : 'La última tasa se escribió a mano.')
            : 'Todavía no se ha consultado el BCV.'}
        </p>
        <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" name="autoRate" ${CURRENT_SETTINGS.autoRate ? 'checked' : ''} class="rounded border-slate-300 text-brand-600 focus:ring-brand-300">
          Buscar la tasa sola al abrir el sistema cada día
        </label>
      </div>

      <div>
        <label class="text-xs font-medium text-slate-500">Bs por USD</label>
        <input required type="number" min="0" step="0.01" name="rate" id="rate-input" value="${CURRENT_SETTINGS.rate}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-brand-300">
        <p class="text-xs text-slate-400 mt-1">
          ${CURRENT_SETTINGS.rateUpdatedAt ? 'Última actualización: ' + fmtDateTime(CURRENT_SETTINGS.rateUpdatedAt) : 'Nunca se ha actualizado.'}
        </p>
      </div>

      <div class="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
        Las ventas guardan la tasa con la que se registraron, así que cambiarla ahora no altera las ventas anteriores.
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" id="btn-cancel-rate" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
        <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Guardar Tasa</button>
      </div>
    </form>`);

  document.getElementById('btn-cancel-rate').addEventListener('click', closeModal);

  // Consulta el BCV y deja el número en la casilla, sin cerrar el formulario:
  // así la dueña ve de dónde salió antes de guardarlo.
  document.getElementById('btn-fetch-rate').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const estado = document.getElementById('fetch-status');
    btn.disabled = true;
    btn.classList.add('opacity-60');
    estado.textContent = 'Consultando el BCV…';
    estado.className = 'text-xs text-slate-500';

    try {
      const { rate, label } = await RateService.fetchBCV();
      const redondeada = +Number(rate).toFixed(2);
      ultimaFuenteBCV = label;
      document.getElementById('rate-input').value = redondeada;
      estado.textContent = `Tasa encontrada: Bs ${redondeada} (${label}). Pulsa Guardar para aplicarla.`;
      estado.className = 'text-xs text-emerald-600 font-medium';
    } catch (err) {
      estado.innerHTML = `No se pudo consultar el BCV. Revisa tu internet o escribe la tasa a mano mirando <a href="${RATE_REFERENCE_URL}" target="_blank" rel="noopener" class="underline">alcambio.app</a>.`;
      estado.className = 'text-xs text-rose-600';
      console.warn('Tasa BCV:', err.message);
    } finally {
      btn.disabled = false;
      btn.classList.remove('opacity-60');
    }
  });

  document.getElementById('rate-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const rate = parseFloat(fd.get('rate'));
    const estado = document.getElementById('fetch-status');
    // Si el número salió del BCV, se conserva esa fuente; si lo escribió la
    // dueña, queda marcado como manual.
    const vinoDelBCV = estado && estado.className.includes('emerald');

    await DB.saveSettings({
      rate,
      rateUpdatedAt: new Date().toISOString(),
      autoRate: fd.get('autoRate') === 'on',
      rateIsManual: !vinoDelBCV,
      rateSource: vinoDelBCV ? ultimaFuenteBCV : null,
    });
    await refreshSettings();
    closeModal();
    renderRateBadge();
    toast(`Tasa actualizada a Bs ${rate}`);
    renderCurrentView();
  });
}

function setupSidebar() {
  document.getElementById('btn-open-sidebar').addEventListener('click', openSidebar);
  document.getElementById('btn-close-sidebar').addEventListener('click', closeSidebar);
  document.getElementById('sidebar-backdrop').addEventListener('click', closeSidebar);
}

function setupSettingsMenu() {
  const btn = document.getElementById('btn-settings');
  const menu = document.getElementById('settings-menu');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });
  document.addEventListener('click', () => menu.classList.add('hidden'));

  document.getElementById('btn-set-rate').addEventListener('click', openRateModal);
  document.getElementById('btn-restock-list').addEventListener('click', () => Restock.open());

  document.getElementById('btn-export').addEventListener('click', async () => {
    const data = await DB.exportData();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadJson(`geos-shop-respaldo-${stamp}.json`, data);
    toast('Respaldo descargado');
  });

  document.getElementById('btn-import').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });

  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirmDialog('Importar reemplazará TODOS los datos actuales por los del archivo. ¿Continuar?')) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const result = await DB.importData(JSON.parse(text));
      await refreshSettings();

      // El respaldo puede traer otros usuarios: si la cuenta con la que se
      // entró ya no existe en los datos importados, hay que volver a entrar.
      const sigueValida = await Auth.refreshCurrentUser();
      if (!sigueValida) {
        toast('Datos importados. Vuelve a entrar con un usuario del respaldo.', 'info');
        Login.show();
        e.target.value = '';
        return;
      }

      renderRateBadge();
      toast(`Importado: ${result.productos} prendas, ${result.ventas} ventas, ${result.clientes} clientes${result.usuarios ? `, ${result.usuarios} usuarios` : ''}`);
      aplicarCambioDeRolPropio();
      renderCurrentView();
    } catch (err) {
      toast('No se pudo leer el archivo: ' + err.message, 'error');
    }
    e.target.value = '';
  });

  document.getElementById('btn-reset-data').addEventListener('click', async () => {
    if (!confirmDialog('Esto restaurará el catálogo y las ventas de ejemplo. ¿Continuar?')) return;
    await DB.resetToSeed();
    await refreshSettings();
    renderRateBadge();
    toast('Datos de prueba restaurados');
    renderCurrentView();
  });

  document.getElementById('btn-clear-data').addEventListener('click', async () => {
    if (!confirmDialog('Esto borrará TODOS los datos (catálogo, ventas, apartados y auditorías) sin posibilidad de recuperarlos.\n\nDescarga un respaldo primero si no estás segura. ¿Continuar?')) return;
    await DB.clearAll();
    await refreshSettings();
    renderRateBadge();
    toast('Todos los datos fueron eliminados', 'info');
    renderCurrentView();
  });
}

// --------------------------------------------------------------- Sesión

// Arranca la interfaz con una sesión ya abierta. Se llama al entrar y también
// al retomar una sesión guardada al recargar la página.
async function bootApp() {
  const user = Auth.currentUser();
  if (!user) { Login.show(); return; }

  // La tienda activa tiene que ser una a la que este usuario entre: si venía
  // seleccionada otra (de una sesión anterior), se corrige antes de dibujar.
  if (!Auth.canAccessStore(AppState.currentStore)) {
    AppState.currentStore = Auth.defaultStore();
  }

  applyRoleToNav();
  renderStoreSwitcher();
  renderUserChip();
  renderHeaderDate();
  renderRateBadge();

  setActiveStoreButtons(AppState.currentStore);
  switchView(AppState.currentView);

  // La tasa del BCV se busca en segundo plano: la tienda abre de inmediato y
  // el número se corrige solo cuando llega la respuesta. Si no hay internet,
  // se conserva la última tasa conocida y no se molesta a la dueña con un error.
  RateService.autoUpdateOnStart().then(res => {
    if (res && res.ok) {
      renderRateBadge();
      renderCurrentView();
      toast(`Tasa del día actualizada desde el BCV: Bs ${res.rate}`);
    }
  });
}

function cerrarSesion() {
  // Una venta a medias vive solo en memoria: al salir se pierde. Más vale
  // decirlo antes que dejar que se caiga en silencio.
  const enElCarrito = Sales.pendingCount();
  const aviso = enElCarrito > 0
    ? `Tienes una venta sin terminar con ${enElCarrito} prenda(s) en el carrito.\n\nSi cierras la sesión se pierde. ¿Cerrar de todos modos?`
    : '¿Cerrar la sesión?';
  if (!confirmDialog(aviso)) return;

  Auth.logout();
  closeModal();
  // Se vuelve al punto de partida para que la siguiente persona no herede la
  // vista, la tienda ni el carrito de la anterior.
  Sales.syncStore();
  AppState.currentView = 'dashboard';
  AppState.currentStore = 'damas';
  Login.show();
}

// La administradora puede editarse a sí misma y cambiarse el modo de acceso.
// En ese momento hay que rehacer el menú y el selector de tienda, porque las
// tiendas y las secciones a las que entra pueden haber cambiado.
function aplicarCambioDeRolPropio() {
  if (!Auth.currentUser()) { Login.show(); return; }
  if (!Auth.canAccessStore(AppState.currentStore)) {
    AppState.currentStore = Auth.defaultStore();
  }
  applyRoleToNav();
  renderStoreSwitcher();
  renderUserChip();
  setActiveStoreButtons(AppState.currentStore);

  const permiso = VIEW_PERMISSIONS[AppState.currentView];
  if (permiso && !Auth.can(permiso)) switchView('dashboard');
}

async function init() {
  await DB.ensureSeeded();
  await refreshSettings();

  document.querySelectorAll('.nav-tab').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  setupSidebar();
  setupSettingsMenu();

  // Si quedó una sesión abierta de la última vez, se retoma; si no, se pide
  // usuario y contraseña.
  const user = await Auth.restoreSession();
  if (user) {
    Login.hide();
    await bootApp();
  } else {
    Login.show();
  }
}

document.addEventListener('DOMContentLoaded', init);
