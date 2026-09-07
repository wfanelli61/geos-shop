// Dashboard: resumen del día para la tienda activa — el primer vistazo al abrir la app.

const Dashboard = (() => {
  async function render() {
    const root = document.getElementById('view-dashboard');
    const storeId = AppState.currentStore;
    const today = new Date();

    const [inventory, sales, layaways] = await Promise.all([
      DB.getInventory(storeId),
      DB.getSales({ storeId, onlyActive: true }),
      DB.getLayaways({ storeId, status: 'activo' }),
    ]);

    const salesToday = sales.filter(s => isSameDay(s.date, today));
    const ingresosHoy = +salesToday.reduce((sum, s) => sum + s.total, 0).toFixed(2);
    const prendasHoy = salesToday.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.qty, 0), 0);
    const lowStock = inventory.filter(isLowStock).sort((a, b) => a.disponible - b.disponible);
    const agotadas = lowStock.filter(p => p.disponible <= 0).length;
    const recentSales = sales.slice(0, 5);

    // También miramos la otra tienda: la dueña administra las dos.
    const otherStore = STORES.find(s => s.id !== storeId);
    const otherLow = otherStore ? (await DB.getInventory(otherStore.id)).filter(isLowStock).length : 0;
    const porCobrar = layaways.reduce((s, l) => s + (l.total - l.deposits.reduce((a, d) => a + d.amount, 0)), 0);

    root.innerHTML = `
      <div class="flex flex-col gap-6">
        ${isRateStale() ? `
          <div class="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div class="flex items-start gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              <p class="text-sm text-amber-800">La tasa del día no se ha actualizado (Bs ${CURRENT_SETTINGS.rate} por USD). Los montos en bolívares pueden estar desfasados.</p>
            </div>
            <button id="btn-dash-rate" class="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition shrink-0">Actualizar tasa</button>
          </div>` : ''}

        <div class="bg-gradient-to-r from-brand-600 to-brand-500 rounded-2xl p-6 text-white flex flex-wrap items-center justify-between gap-4 shadow-sm">
          <div>
            <p class="text-brand-100 text-sm">${storeName(storeId)}</p>
            <h2 class="text-2xl font-semibold mt-1">¡Hola! Aquí está tu resumen de hoy</h2>
            <p class="text-brand-100 text-xs mt-1">Tasa del día: Bs ${CURRENT_SETTINGS.rate} por USD</p>
          </div>
          <button id="btn-dash-new-sale" class="bg-white text-brand-700 font-medium px-5 py-2.5 rounded-xl shadow-sm hover:bg-brand-50 transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nueva Venta
          </button>
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          ${kpiCard('Ingresos de Hoy', fmtMoney(ingresosHoy), fmtBs(ingresosHoy), 'money', 'emerald')}
          ${kpiCard('Prendas Vendidas Hoy', prendasHoy, '', 'shirt', 'brand')}
          ${kpiCard('Por Cobrar (Apartados)', fmtMoney(porCobrar), `${layaways.length} activo(s)`, 'bookmark', 'amber')}
          ${kpiCard('Se Están Acabando', lowStock.length, lowStock.length > 0 ? 'Ver cuáles →' : 'Todo en orden', 'alert', lowStock.length > 0 ? 'rose' : 'emerald', 'kpi-alertas')}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-5">
          <div class="lg:col-span-3 card p-5">
            <div class="flex items-center justify-between mb-4">
              <h3 class="text-sm font-semibold text-slate-700">Ventas Recientes</h3>
              <button id="btn-dash-reportes" class="text-xs font-medium text-brand-600 hover:text-brand-700">Ver reportes →</button>
            </div>
            ${recentSales.length === 0 ? emptyState('Aún no hay ventas registradas en esta tienda.') : `
              <div class="flex flex-col divide-y divide-brand-50">
                ${recentSales.map(s => `
                  <div class="flex items-center justify-between py-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-slate-800 truncate">${s.clientName}</p>
                      <p class="text-xs text-slate-400">${fmtDateTime(s.date)} · ${s.paymentMethod}</p>
                    </div>
                    <span class="text-sm font-semibold text-brand-700 shrink-0 ml-3">${fmtMoney(s.total)}</span>
                  </div>`).join('')}
              </div>`}
          </div>

          <div class="lg:col-span-2 card p-5 flex flex-col">
            <div class="flex items-center justify-between mb-1">
              <h3 class="text-sm font-semibold text-slate-700">Se están acabando</h3>
              ${lowStock.length > 0 ? `<span class="text-xs font-semibold bg-amber-50 text-amber-700 px-2 py-1 rounded-full">${lowStock.length}${agotadas > 0 ? ` · ${agotadas} agotada(s)` : ''}</span>` : ''}
            </div>
            <p class="text-xs text-slate-400 mb-3">Quedan ${lowStockThreshold()} unidades o menos</p>

            ${lowStock.length === 0 ? emptyState('Ninguna prenda se está acabando en esta tienda.') : `
              <div class="flex flex-col divide-y divide-brand-50 max-h-72 overflow-y-auto -mr-1 pr-1">
                ${lowStock.map(p => {
                  const status = stockStatus(p.disponible);
                  return `
                  <div class="flex items-center justify-between py-2.5 gap-3">
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-slate-800 truncate">${p.name}</p>
                      <p class="text-xs text-slate-400">
                        <span class="font-mono">${p.sku}</span> ·
                        <span class="text-brand-600 font-medium">Talla ${p.size}</span> · ${p.color}
                      </p>
                    </div>
                    <span class="text-xs font-semibold px-2 py-1 rounded-full shrink-0 ${status.classes}">
                      ${p.disponible <= 0 ? 'Agotada' : p.disponible + ' und.'}
                    </span>
                  </div>`;
                }).join('')}
              </div>`}

            ${otherLow > 0 ? `
              <p class="text-xs text-slate-500 mt-3 pt-3 border-t border-brand-50">
                En ${otherStore.name} hay <span class="font-semibold text-amber-700">${otherLow}</span> prenda(s) por reponer.
              </p>` : ''}

            <button id="btn-dash-restock" class="mt-3 w-full border border-brand-200 text-brand-700 hover:bg-brand-50 text-sm font-medium py-2.5 rounded-xl transition">
              Ver lista de reposición
            </button>
          </div>
        </div>
      </div>`;

    document.getElementById('btn-dash-new-sale').addEventListener('click', () => switchView('venta'));
    document.getElementById('btn-dash-reportes').addEventListener('click', () => switchView('reportes'));
    document.getElementById('btn-dash-restock').addEventListener('click', () => Restock.open());
    document.getElementById('kpi-alertas').addEventListener('click', () => Restock.open());
    const rateBtn = document.getElementById('btn-dash-rate');
    if (rateBtn) rateBtn.addEventListener('click', openRateModal);
  }

  function emptyState(message) {
    return `<div class="text-center text-slate-400 text-sm py-8">${message}</div>`;
  }

  function kpiCard(label, value, hint, icon, color, id) {
    // Cada indicador lleva su propio color para distinguirlos de un vistazo.
    const theme = {
      emerald: { icon: 'bg-emerald-500 text-white', card: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200', value: 'text-emerald-700' },
      brand:   { icon: 'bg-brand-500 text-white',   card: 'bg-gradient-to-br from-brand-50 to-white border-brand-200',     value: 'text-brand-700' },
      amber:   { icon: 'bg-amber-500 text-white',   card: 'bg-gradient-to-br from-amber-50 to-white border-amber-200',     value: 'text-amber-700' },
      rose:    { icon: 'bg-rose-500 text-white',    card: 'bg-gradient-to-br from-rose-50 to-white border-rose-200',       value: 'text-rose-700' },
      slate:   { icon: 'bg-slate-400 text-white',   card: 'bg-gradient-to-br from-slate-50 to-white border-slate-200',     value: 'text-slate-700' },
    }[color];
    const icons = {
      money: '<path d="M12 1v22"></path><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>',
      shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 .55.45 1 1 1h10c.55 0 1-.45 1-1V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"></path>',
      bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>',
      alert: '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>',
    };
    const clickable = !!id;
    return `
      <${clickable ? 'button' : 'div'} ${id ? `id="${id}"` : ''} class="card text-left border-2 ${theme.card} p-4 flex flex-col gap-3 ${clickable ? 'cursor-pointer' : ''}">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm ${theme.icon}">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[icon]}</svg>
        </div>
        <div>
          <p class="text-xs font-medium text-slate-500">${label}</p>
          <p class="text-2xl font-bold ${theme.value}">${value}</p>
          ${hint ? `<p class="text-xs ${clickable && value > 0 ? 'text-brand-600 font-semibold' : 'text-slate-400'} mt-0.5">${hint}</p>` : ''}
        </div>
      </${clickable ? 'button' : 'div'}>`;
  }

  return { render };
})();
