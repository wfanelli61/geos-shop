// Lista de Reposición: qué prendas se están acabando, en cuál tienda y en cuál
// talla exactamente. Pensada para revisarla antes de comprarle al proveedor,
// por eso se puede imprimir y muestra cuánto se vendió en los últimos 30 días.

const Restock = (() => {
  const DAYS = 30;

  async function collect(storeId) {
    const desde = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
    const [inventory, sales] = await Promise.all([
      DB.getInventory(storeId),
      DB.getSales({ storeId, onlyActive: true, dateFrom: desde }),
    ]);

    const vendidasReciente = {};
    sales.forEach(s => s.items.forEach(i => {
      vendidasReciente[i.productId] = (vendidasReciente[i.productId] || 0) + i.qty;
    }));

    return inventory
      .filter(isLowStock)
      .map(p => ({ ...p, vendidasReciente: vendidasReciente[p.id] || 0 }))
      // Primero lo agotado, y dentro de eso lo que más rota: es lo más urgente.
      .sort((a, b) => a.disponible - b.disponible || b.vendidasReciente - a.vendidasReciente);
  }

  async function collectAll() {
    const result = {};
    for (const store of STORES) {
      result[store.id] = await collect(store.id);
    }
    return result;
  }

  function row(p) {
    const agotada = p.disponible <= 0;
    return `
      <tr class="border-b border-brand-50/70">
        <td class="px-3 py-2.5 font-mono text-xs text-slate-500">${p.sku}</td>
        <td class="px-3 py-2.5">
          <span class="font-medium text-slate-800">${p.name}</span>
          <span class="block text-xs text-slate-400">${p.category}</span>
        </td>
        <td class="px-3 py-2.5"><span class="bg-brand-50 text-brand-700 text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap">Talla ${p.size}</span></td>
        <td class="px-3 py-2.5 text-slate-600 text-sm">${p.color}</td>
        <td class="px-3 py-2.5 text-center">
          <span class="text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${agotada ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}">
            ${agotada ? 'Agotada' : p.disponible + ' und.'}
          </span>
        </td>
        <td class="px-3 py-2.5 text-center text-sm text-slate-600">${p.vendidasReciente}</td>
        <td class="px-3 py-2.5 text-center">
          <button data-restock="${p.id}" class="text-brand-600 hover:text-brand-800 text-xs font-medium whitespace-nowrap">Reponer</button>
        </td>
      </tr>`;
  }

  function storeSection(store, items) {
    if (items.length === 0) {
      return `
        <div class="mb-5">
          <h4 class="text-sm font-semibold text-slate-700 mb-2">${store.name}</h4>
          <div class="bg-emerald-50 text-emerald-700 text-sm rounded-xl px-4 py-3">Ninguna prenda se está acabando en esta tienda.</div>
        </div>`;
    }
    const agotadas = items.filter(p => p.disponible <= 0).length;
    return `
      <div class="mb-5">
        <div class="flex flex-wrap items-center gap-2 mb-2">
          <h4 class="text-sm font-semibold text-slate-700">${store.name}</h4>
          <span class="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">${items.length} por reponer</span>
          ${agotadas > 0 ? `<span class="text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">${agotadas} agotada(s)</span>` : ''}
        </div>
        <div class="border border-brand-100 rounded-xl overflow-x-auto">
          <table class="min-w-full">
            <thead>
              <tr class="text-left text-slate-500 bg-brand-50/50 text-xs">
                <th class="px-3 py-2 font-medium">Código</th>
                <th class="px-3 py-2 font-medium">Prenda</th>
                <th class="px-3 py-2 font-medium">Talla</th>
                <th class="px-3 py-2 font-medium">Color</th>
                <th class="px-3 py-2 font-medium text-center">Queda</th>
                <th class="px-3 py-2 font-medium text-center">Vendidas ${DAYS}d</th>
                <th class="px-3 py-2 font-medium text-center">Acción</th>
              </tr>
            </thead>
            <tbody>${items.map(row).join('')}</tbody>
          </table>
        </div>
      </div>`;
  }

  async function open() {
    const byStore = await collectAll();
    const total = Object.values(byStore).reduce((s, arr) => s + arr.length, 0);

    openModal(`
      <div class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">Prendas por Reponer</h3>
          <p class="text-sm text-slate-400">
            ${total === 0
              ? 'Todo el inventario está en buen nivel.'
              : `${total} prenda(s) con ${lowStockThreshold()} unidades o menos disponibles, en ambas tiendas.`}
          </p>
        </div>

        <div class="max-h-[55vh] overflow-y-auto -mx-1 px-1">
          ${STORES.map(store => storeSection(store, byStore[store.id])).join('')}
        </div>

        <div class="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-brand-50">
          <button id="btn-restock-threshold" class="text-xs text-slate-500 hover:text-brand-700">Avisar cuando queden ${lowStockThreshold()} o menos ✎</button>
          <div class="flex gap-2">
            ${total > 0 ? '<button id="btn-print-restock" class="border border-brand-200 text-brand-700 hover:bg-brand-50 text-sm font-medium px-4 py-2 rounded-xl transition">Imprimir lista</button>' : ''}
            <button id="btn-close-restock" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Cerrar</button>
          </div>
        </div>
      </div>`);

    document.getElementById('btn-close-restock').addEventListener('click', closeModal);
    document.getElementById('btn-restock-threshold').addEventListener('click', openThresholdModal);

    const printBtn = document.getElementById('btn-print-restock');
    if (printBtn) printBtn.addEventListener('click', () => printList(byStore));

    // "Reponer" lleva directo a registrar la entrada de esa prenda.
    document.querySelectorAll('[data-restock]').forEach(btn => btn.addEventListener('click', async () => {
      const product = await DB.getProduct(btn.dataset.restock);
      closeModal();
      if (product.storeId !== AppState.currentStore) switchStore(product.storeId);
      switchView('catalogo');
      // Esperamos a que el catálogo termine de dibujarse antes de abrir el modal.
      setTimeout(() => Catalog.openEntry(product.id), 350);
    }));
  }

  function printList(byStore) {
    const block = (store) => {
      const items = byStore[store.id];
      if (items.length === 0) return `<h2>${store.name}</h2><p class="muted">Sin prendas por reponer.</p>`;
      return `
        <h2>${store.name} — ${items.length} por reponer</h2>
        <table>
          <thead><tr><th>Código</th><th>Prenda</th><th>Talla</th><th>Color</th><th class="right">Queda</th><th class="right">Vendidas ${DAYS}d</th><th class="right">A pedir</th></tr></thead>
          <tbody>
            ${items.map(p => `<tr>
              <td>${p.sku}</td><td>${p.name}</td><td>${p.size}</td><td>${p.color}</td>
              <td class="right">${p.disponible <= 0 ? 'Agotada' : p.disponible}</td>
              <td class="right">${p.vendidasReciente}</td>
              <td class="right">_____</td>
            </tr>`).join('')}
          </tbody>
        </table>`;
    };

    printHtml('Lista de Reposición', `
      <h1>Geo's Shop — Lista de Reposición</h1>
      <p class="muted">Prendas con ${lowStockThreshold()} unidades o menos · Generada el ${fmtDateTime(new Date().toISOString())}</p>
      ${STORES.map(block).join('')}
      <p class="muted" style="margin-top:24px">La columna "A pedir" queda en blanco para anotar a mano cuántas encargar.</p>`);
  }

  function openThresholdModal() {
    openModal(`
      <form id="threshold-form" class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">Aviso de Stock Bajo</h3>
          <p class="text-sm text-slate-400">¿Con cuántas unidades quieres que el sistema te avise que una prenda se está acabando?</p>
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Avisar cuando queden</label>
          <div class="flex items-center gap-2 mt-1">
            <input required type="number" min="0" step="1" name="threshold" value="${lowStockThreshold()}" class="w-24 border border-slate-200 rounded-lg px-3 py-2.5 text-lg font-semibold text-center focus:outline-none focus:ring-2 focus:ring-brand-300">
            <span class="text-sm text-slate-500">unidades o menos</span>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-threshold" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Guardar</button>
        </div>
      </form>`);

    document.getElementById('btn-cancel-threshold').addEventListener('click', () => open());
    document.getElementById('threshold-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const value = parseInt(new FormData(e.target).get('threshold'), 10);
      await DB.saveSettings({ lowStockThreshold: value });
      await refreshSettings();
      toast(`Ahora avisa cuando queden ${value} o menos`);
      renderCurrentView();
      open();
    });
  }

  return { open, collect, collectAll };
})();
