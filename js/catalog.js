// Módulo de Catálogo + Control de Inventario en tiempo real.
// Incluye el libro de movimientos: entradas, ajustes, devoluciones y traspasos.

const Catalog = (() => {
  let filters = { search: '', category: '', size: '', color: '', brand: '', lowOnly: false };
  let tab = 'inventario';

  async function render() {
    const root = document.getElementById('view-catalogo');
    const storeId = AppState.currentStore;
    const inventory = await DB.getInventory(storeId);

    const totalPrendas = inventory.reduce((s, p) => s + p.existenciaActual, 0);
    const lowCount = inventory.filter(isLowStock).length;

    root.innerHTML = `
      <div class="flex flex-col gap-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1 bg-white border border-brand-100 rounded-xl p-1">
            <button class="cat-tab px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'inventario' ? 'bg-brand-600 text-white' : 'text-slate-500'}" data-tab="inventario">Inventario</button>
            <button class="cat-tab px-4 py-2 rounded-lg text-sm font-medium transition ${tab === 'movimientos' ? 'bg-brand-600 text-white' : 'text-slate-500'}" data-tab="movimientos">Movimientos</button>
          </div>
          <div class="flex items-center gap-2">
            <button id="btn-entrada" class="bg-white border border-brand-200 text-brand-700 hover:bg-brand-50 text-sm font-medium px-4 py-2.5 rounded-xl transition flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline></svg>
              Entrada de Mercancía
            </button>
            <button id="btn-new-product" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              Nueva Prenda
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-sm">
          <span class="bg-white border border-brand-100 rounded-full px-3 py-1.5 text-slate-600"><span class="font-semibold text-slate-800">${inventory.length}</span> modelos</span>
          <span class="bg-white border border-brand-100 rounded-full px-3 py-1.5 text-slate-600"><span class="font-semibold text-slate-800">${totalPrendas}</span> prendas en existencia</span>
          ${lowCount > 0 ? `<button id="btn-filter-low" class="rounded-full px-3 py-1.5 font-medium border transition ${filters.lowOnly ? 'bg-amber-500 border-amber-500 text-white' : 'bg-amber-50 border-amber-100 text-amber-700 hover:bg-amber-100'}">${lowCount} se están acabando${filters.lowOnly ? ' ✕' : ''}</button>` : ''}
        </div>

        <div id="catalog-content"></div>
      </div>`;

    document.querySelectorAll('.cat-tab').forEach(btn => btn.addEventListener('click', () => {
      tab = btn.dataset.tab;
      render();
    }));
    document.getElementById('btn-new-product').addEventListener('click', () => openProductModal(null));
    document.getElementById('btn-entrada').addEventListener('click', () => openMovementModal('entrada'));
    const lowBtn = document.getElementById('btn-filter-low');
    if (lowBtn) lowBtn.addEventListener('click', () => {
      filters.lowOnly = !filters.lowOnly;
      if (filters.lowOnly) tab = 'inventario';
      render();
    });

    if (tab === 'inventario') renderInventoryTab(inventory);
    else await renderMovementsTab();
  }

  function renderInventoryTab(inventory) {
    document.getElementById('catalog-content').innerHTML = `
      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-2 md:grid-cols-6 gap-3 card p-4">
          <input id="f-search" type="text" placeholder="Buscar por nombre, código o marca..." class="col-span-2 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" value="${filters.search}">
          <select id="f-category" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            <option value="">Todas las categorías</option>
            ${CATEGORIES.map(c => `<option value="${c}" ${filters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <select id="f-size" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            <option value="">Todas las tallas</option>
            ${[...new Set(inventory.map(p => p.size))].map(s => `<option value="${s}" ${filters.size === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>
          <select id="f-color" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            <option value="">Todos los colores</option>
            ${[...new Set(inventory.map(p => p.color))].map(c => `<option value="${c}" ${filters.color === c ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
          <select id="f-brand" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            <option value="">Todas las marcas</option>
            ${[...new Set(inventory.map(p => (p.brand || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')).map(b => `<option value="${Photos.escapeAttr(b)}" ${filters.brand === b ? 'selected' : ''}>${Photos.escapeAttr(b)}</option>`).join('')}
          </select>
        </div>

        <div class="card overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500 thead-row">
                <th class="px-4 py-3 font-medium">Foto</th>
                <th class="px-4 py-3 font-medium">Código</th>
                <th class="px-4 py-3 font-medium">Prenda</th>
                <th class="px-4 py-3 font-medium">Marca</th>
                <th class="px-4 py-3 font-medium">Categoría</th>
                <th class="px-4 py-3 font-medium">Talla / Color</th>
                <th class="px-4 py-3 font-medium text-right">Precio</th>
                <th class="px-4 py-3 font-medium text-right">Inicial</th>
                <th class="px-4 py-3 font-medium text-right">Entradas</th>
                <th class="px-4 py-3 font-medium text-right">Vendida</th>
                <th class="px-4 py-3 font-medium text-right">Existencia</th>
                <th class="px-4 py-3 font-medium text-right">Disponible</th>
                <th class="px-4 py-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody id="catalog-tbody"></tbody>
          </table>
          <div id="catalog-empty" class="hidden text-center text-slate-400 py-10 text-sm">No se encontraron prendas con esos filtros.</div>
        </div>
      </div>`;

    document.getElementById('f-search').addEventListener('input', (e) => { filters.search = e.target.value; renderRows(inventory); });
    document.getElementById('f-category').addEventListener('change', (e) => { filters.category = e.target.value; renderRows(inventory); });
    document.getElementById('f-size').addEventListener('change', (e) => { filters.size = e.target.value; renderRows(inventory); });
    document.getElementById('f-color').addEventListener('change', (e) => { filters.color = e.target.value; renderRows(inventory); });
    document.getElementById('f-brand').addEventListener('change', (e) => { filters.brand = e.target.value; renderRows(inventory); });

    renderRows(inventory);
  }

  async function renderMovementsTab() {
    const movements = await DB.getMovements({ storeId: AppState.currentStore });
    document.getElementById('catalog-content').innerHTML = `
      <div class="card overflow-x-auto">
        ${movements.length === 0 ? '<div class="text-center text-slate-400 py-10 text-sm">Aún no hay movimientos registrados en esta tienda.</div>' : `
        <table class="min-w-full text-sm">
          <thead>
            <tr class="text-left text-slate-500 thead-row">
              <th class="px-4 py-3 font-medium">Fecha</th>
              <th class="px-4 py-3 font-medium">Tipo</th>
              <th class="px-4 py-3 font-medium">Prenda</th>
              <th class="px-4 py-3 font-medium text-right">Cantidad</th>
              <th class="px-4 py-3 font-medium">Nota</th>
            </tr>
          </thead>
          <tbody>
            ${movements.map(m => {
              const meta = MOVEMENT_TYPES[m.type] || { label: m.type, sign: 0, color: 'slate' };
              const sign = meta.sign > 0 ? '+' : '−';
              return `
              <tr class="border-b border-brand-50/70 hover:bg-brand-50/30 transition">
                <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${fmtDateTime(m.date)}</td>
                <td class="px-4 py-3"><span class="text-xs font-medium px-2 py-1 rounded-full bg-${meta.color}-50 text-${meta.color}-700 whitespace-nowrap">${meta.label}</span></td>
                <td class="px-4 py-3"><span class="font-medium text-slate-800">${m.name}</span> <span class="font-mono text-xs text-slate-400">${m.sku}</span></td>
                <td class="px-4 py-3 text-right font-semibold ${meta.sign > 0 ? 'text-emerald-600' : 'text-rose-600'}">${sign}${m.qty}</td>
                <td class="px-4 py-3 text-slate-500">${m.note || '—'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`}
      </div>`;
  }

  function applyFilters(inventory) {
    return inventory.filter(p => {
      const s = filters.search.trim().toLowerCase();
      const matchesSearch = !s
        || p.name.toLowerCase().includes(s)
        || p.sku.toLowerCase().includes(s)
        || (p.brand || '').toLowerCase().includes(s);
      const matchesCategory = !filters.category || p.category === filters.category;
      const matchesSize = !filters.size || p.size === filters.size;
      const matchesColor = !filters.color || p.color === filters.color;
      const matchesBrand = !filters.brand || (p.brand || '') === filters.brand;
      const matchesLow = !filters.lowOnly || isLowStock(p);
      return matchesSearch && matchesCategory && matchesSize && matchesColor && matchesBrand && matchesLow;
    }).sort((a, b) => filters.lowOnly ? a.disponible - b.disponible : 0);
  }

  function renderRows(inventory) {
    const tbody = document.getElementById('catalog-tbody');
    const empty = document.getElementById('catalog-empty');
    const rows = applyFilters(inventory);
    if (rows.length === 0) {
      tbody.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    tbody.innerHTML = rows.map(p => {
      const status = stockStatus(p.disponible);
      return `
      <tr class="border-b border-brand-50/70 hover:bg-brand-50/40 transition">
        <td class="px-4 py-3">${Photos.thumb(p)}</td>
        <td class="px-4 py-3 font-mono text-xs text-slate-500">${p.sku}</td>
        <td class="px-4 py-3 font-medium text-slate-800">${p.name}</td>
        <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${p.brand ? Photos.escapeAttr(p.brand) : '<span class="text-slate-300">—</span>'}</td>
        <td class="px-4 py-3"><span class="bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded-full">${p.category}</span></td>
        <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${p.size} · ${p.color}</td>
        <td class="px-4 py-3 text-right text-slate-700">${fmtMoney(p.price)}</td>
        <td class="px-4 py-3 text-right text-slate-400">${p.stockInicial}</td>
        <td class="px-4 py-3 text-right ${p.entradas > 0 ? 'text-emerald-600 font-medium' : 'text-slate-300'}">${p.entradas > 0 ? '+' + p.entradas : '—'}</td>
        <td class="px-4 py-3 text-right text-slate-400">${p.cantidadVendida}</td>
        <td class="px-4 py-3 text-right font-semibold text-slate-700">${p.existenciaActual}</td>
        <td class="px-4 py-3 text-right">
          <span class="inline-flex items-center text-xs font-semibold px-2 py-1 rounded-full ${status.classes}">${p.disponible}</span>
          ${p.apartadas > 0 ? `<div class="text-[10px] text-amber-600 mt-0.5">${p.apartadas} apartada(s)</div>` : ''}
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center justify-center gap-2 whitespace-nowrap">
            <button data-mov="${p.id}" title="Registrar movimiento" class="text-brand-600 hover:text-brand-800 text-xs font-medium">Movimiento</button>
            <span class="text-slate-200">|</span>
            <button data-edit="${p.id}" class="text-slate-500 hover:text-slate-700 text-xs font-medium">Editar</button>
            <button data-del="${p.id}" class="text-rose-500 hover:text-rose-700 text-xs font-medium">Eliminar</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    Photos.wireThumbs(tbody);
    tbody.querySelectorAll('[data-mov]').forEach(btn => btn.addEventListener('click', () => openMovementModal('entrada', btn.dataset.mov)));
    tbody.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', async () => {
      const product = await DB.getProduct(btn.dataset.edit);
      await openProductModal(product);
    }));
    tbody.querySelectorAll('[data-del]').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirmDialog('¿Eliminar esta prenda del catálogo? Esta acción no se puede deshacer.')) return;
      await DB.deleteProduct(btn.dataset.del);
      toast('Prenda eliminada', 'info');
      render();
    }));
  }

  // ------------------------------------------------------------ Movimientos

  async function openMovementModal(defaultType, preselectedId) {
    const storeId = AppState.currentStore;
    const inventory = await DB.getInventory(storeId);
    const otherStore = STORES.find(s => s.id !== storeId);

    openModal(`
      <form id="movement-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">Registrar Movimiento — ${storeName(storeId)}</h3>
        <p class="text-sm text-slate-400 -mt-2">Suma o resta existencia sin alterar el stock inicial, dejando el registro de por qué.</p>

        <div>
          <label class="text-xs font-medium text-slate-500">Prenda</label>
          <select required name="productId" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            ${inventory.map(p => `<option value="${p.id}" ${preselectedId === p.id ? 'selected' : ''}>${p.sku} — ${p.name} (${p.size}/${p.color}) · existencia ${p.existenciaActual}</option>`).join('')}
          </select>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500">Tipo de movimiento</label>
          <select required name="type" id="mov-type" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            <option value="entrada" ${defaultType === 'entrada' ? 'selected' : ''}>Entrada de mercancía (+)</option>
            <option value="devolucion">Devolución de cliente (+)</option>
            <option value="ajuste_positivo">Ajuste — sobrante (+)</option>
            <option value="ajuste_negativo">Ajuste — faltante o daño (−)</option>
            <option value="traspaso">Traspaso a ${otherStore ? otherStore.name : 'otra tienda'} (−)</option>
          </select>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Cantidad</label>
            <input required type="number" min="1" step="1" name="qty" value="1" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Nota</label>
            <input name="note" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Compra a proveedor">
          </div>
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-mov" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Registrar</button>
        </div>
      </form>`);

    document.getElementById('btn-cancel-mov').addEventListener('click', closeModal);
    document.getElementById('movement-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const productId = fd.get('productId');
      const type = fd.get('type');
      const qty = parseInt(fd.get('qty'), 10);
      const note = (fd.get('note') || '').trim();
      const product = inventory.find(p => p.id === productId);

      if (type === 'traspaso') {
        if (qty > product.existenciaActual) {
          toast(`Solo hay ${product.existenciaActual} unidades para traspasar`, 'error');
          return;
        }
        await DB.transferProduct(productId, otherStore.id, qty, note || `Traspaso a ${otherStore.name}`);
        toast(`${qty} prenda(s) traspasadas a ${otherStore.name}`);
      } else {
        await DB.addMovement({
          storeId, productId, sku: product.sku, name: product.name,
          type, qty, note,
        });
        toast(`${MOVEMENT_TYPES[type].label} registrada`);
      }
      closeModal();
      render();
    });
  }

  // -------------------------------------------------------------- Productos

  // Foto que está cargada en el formulario abierto. Se guarda aparte del
  // formulario porque un <input type="file"> no puede llevar el data URL.
  let fotoEnFormulario = null;

  async function openProductModal(product) {
    const isEdit = !!product;
    const storeId = AppState.currentStore;
    const sizes = SIZES_BY_STORE[storeId] || [];
    const marcas = await DB.getBrands();
    fotoEnFormulario = product?.photo || null;

    openModal(`
      <form id="product-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">${isEdit ? 'Editar Prenda' : 'Nueva Prenda'} — ${storeName(storeId)}</h3>

        <div>
          <label class="text-xs font-medium text-slate-500">Foto de la prenda</label>
          <p class="text-xs text-slate-400 mb-1.5">Para reconocer el modelo exacto de un vistazo. Opcional.</p>
          <div id="foto-zona" class="foto-dropzone p-3 flex flex-col items-center gap-2">
            <img id="foto-preview" class="foto-preview ${fotoEnFormulario ? '' : 'hidden'}" src="${fotoEnFormulario || ''}" alt="Vista previa de la prenda">
            <div id="foto-vacio" class="${fotoEnFormulario ? 'hidden' : ''} flex flex-col items-center gap-1 py-5 text-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-brand-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>
              <p class="text-sm text-slate-500 font-medium">Toca para elegir una foto</p>
              <p class="text-xs text-slate-400">o arrástrala aquí · JPG o PNG</p>
            </div>
            <div class="flex items-center gap-3">
              <button type="button" id="btn-foto-elegir" class="text-xs font-medium text-brand-700 hover:text-brand-800 underline">${fotoEnFormulario ? 'Cambiar foto' : 'Elegir foto'}</button>
              <button type="button" id="btn-foto-quitar" class="text-xs font-medium text-rose-500 hover:text-rose-700 underline ${fotoEnFormulario ? '' : 'hidden'}">Quitar foto</button>
            </div>
            <p id="foto-info" class="text-[11px] text-slate-400"></p>
            <input type="file" id="foto-input" accept="image/*" class="hidden">
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500">Nombre / Descripción</label>
          <input required name="name" value="${product?.name || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Blusa Manga Larga">
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Código (SKU)</label>
            <input required name="sku" value="${product?.sku || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. DAM-007">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Categoría</label>
            <select required name="category" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              ${CATEGORIES.map(c => `<option value="${c}" ${product?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Marca</label>
            <input name="brand" list="brand-options" value="${Photos.escapeAttr(product?.brand || '')}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Zara">
            <datalist id="brand-options">${marcas.map(b => `<option value="${Photos.escapeAttr(b)}">`).join('')}</datalist>
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Color</label>
            <input required name="color" list="color-options" value="${product?.color || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Negro">
            <datalist id="color-options">${COMMON_COLORS.map(c => `<option value="${c}">`).join('')}</datalist>
          </div>
        </div>

        ${isEdit ? `
        <div>
          <label class="text-xs font-medium text-slate-500">Talla</label>
          <input required name="size" list="size-options" value="${product?.size || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. M">
          <datalist id="size-options">${sizes.map(s => `<option value="${s}">`).join('')}</datalist>
        </div>` : `
        <div class="border border-brand-100 rounded-xl p-4 bg-brand-50/40">
          <div class="flex items-center justify-between mb-1">
            <label class="text-sm font-semibold text-slate-700">Tallas y cantidades</label>
            <span class="text-xs text-slate-400">Cada talla lleva su propia existencia</span>
          </div>
          <p class="text-xs text-slate-500 mb-3">Toca las tallas que tienes de esta prenda y escribe cuántas hay de cada una. La foto y la marca se copian a todas.</p>
          <div class="flex flex-wrap gap-1.5 mb-3">
            ${sizes.map(s => `<button type="button" data-size-chip="${s}" class="size-chip px-3 py-1.5 rounded-lg text-sm font-medium border border-brand-200 bg-white text-slate-600 hover:bg-brand-50 transition">${s}</button>`).join('')}
          </div>
          <div class="flex gap-2 mb-3">
            <input id="custom-size" type="text" class="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="¿Otra talla? Escríbela aquí">
            <button type="button" id="btn-add-size" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 rounded-lg transition">Agregar</button>
          </div>
          <div id="size-rows" class="flex flex-col gap-2"></div>
          <p id="size-empty" class="text-sm text-slate-400 text-center py-2">Aún no has seleccionado tallas.</p>
        </div>`}

        <div class="grid grid-cols-${isEdit ? '2' : '1'} gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Precio de Venta (USD)</label>
            <input required type="number" min="0" step="0.01" name="price" value="${product?.price ?? ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="0.00">
          </div>
          ${isEdit ? `
          <div>
            <label class="text-xs font-medium text-slate-500">Stock Inicial</label>
            <input required type="number" min="0" step="1" name="stockInicial" value="${product?.stockInicial ?? ''}" readonly class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-slate-50 text-slate-400" placeholder="0">
          </div>` : ''}
        </div>
        ${isEdit ? '<p class="text-xs text-slate-400 -mt-2">Para sumar mercancía usa <span class="font-medium text-brand-600">Entrada de Mercancía</span>: así el stock inicial sigue sirviendo para auditar.</p>' : ''}
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-product" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">${isEdit ? 'Guardar Cambios' : 'Agregar Prenda'}</button>
        </div>
      </form>
    `);

    document.getElementById('btn-cancel-product').addEventListener('click', closeModal);
    wireFotoPicker();
    if (!isEdit) wireSizePicker();

    document.getElementById('product-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const base = {
        storeId,
        name: fd.get('name').trim(),
        sku: fd.get('sku').trim().toUpperCase(),
        category: fd.get('category'),
        brand: fd.get('brand').trim(),
        color: fd.get('color').trim(),
        photo: fotoEnFormulario,
        price: parseFloat(fd.get('price')),
      };

      try {
        if (isEdit) {
          await DB.saveProduct({
            ...base, id: product.id,
            size: fd.get('size').trim(),
            stockInicial: parseInt(fd.get('stockInicial'), 10),
          });
          toast('Prenda actualizada');
        } else {
          const rows = collectSizeRows();
          if (rows.length === 0) {
            toast('Selecciona al menos una talla', 'error');
            return;
          }
          const created = await DB.saveProductSizes(base, rows);
          toast(created.length === 1
            ? 'Prenda agregada al catálogo'
            : `${created.length} tallas agregadas al catálogo`);
        }
      } catch (err) {
        // El caso típico es quedarse sin espacio en el navegador por las fotos.
        toast(err.message, 'error');
        return;
      }

      closeModal();
      render();
    });
  }

  // ---------------------------------------------------- Foto de la prenda

  function wireFotoPicker() {
    const zona = document.getElementById('foto-zona');
    const input = document.getElementById('foto-input');
    const preview = document.getElementById('foto-preview');
    const vacio = document.getElementById('foto-vacio');
    const info = document.getElementById('foto-info');
    const btnElegir = document.getElementById('btn-foto-elegir');
    const btnQuitar = document.getElementById('btn-foto-quitar');
    if (!zona) return;

    const pintar = () => {
      const hay = !!fotoEnFormulario;
      preview.classList.toggle('hidden', !hay);
      vacio.classList.toggle('hidden', hay);
      btnQuitar.classList.toggle('hidden', !hay);
      btnElegir.textContent = hay ? 'Cambiar foto' : 'Elegir foto';
      if (hay) {
        preview.src = fotoEnFormulario;
        info.textContent = `Guardada reducida · ${Photos.fmtSize(Photos.approxBytes(fotoEnFormulario))}`;
      } else {
        info.textContent = '';
      }
    };

    const cargar = async (file) => {
      info.textContent = 'Procesando la foto…';
      try {
        fotoEnFormulario = await Photos.fromFile(file);
        pintar();
      } catch (err) {
        fotoEnFormulario = null;
        pintar();
        toast(err.message, 'error');
      }
    };

    const abrirSelector = () => input.click();
    btnElegir.addEventListener('click', (e) => { e.stopPropagation(); abrirSelector(); });
    zona.addEventListener('click', (e) => {
      // El botón de quitar no debe reabrir el selector.
      if (e.target.closest('#btn-foto-quitar')) return;
      abrirSelector();
    });

    input.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) cargar(file);
      e.target.value = '';
    });

    btnQuitar.addEventListener('click', (e) => {
      e.stopPropagation();
      fotoEnFormulario = null;
      pintar();
    });

    // Arrastrar y soltar, cómodo desde la carpeta de fotos del proveedor.
    ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.add('dragging');
    }));
    ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.remove('dragging');
    }));
    zona.addEventListener('drop', (e) => {
      const file = e.dataTransfer.files[0];
      if (file) cargar(file);
    });

    pintar();
  }

  // ------------------------------------------------- Selector de tallas

  let sizeRows = [];

  function wireSizePicker() {
    sizeRows = [];
    document.querySelectorAll('[data-size-chip]').forEach(chip => {
      chip.addEventListener('click', () => toggleSize(chip.dataset.sizeChip));
    });
    const custom = document.getElementById('custom-size');
    const addBtn = document.getElementById('btn-add-size');
    const addCustom = () => {
      const value = custom.value.trim();
      if (!value) return;
      toggleSize(value, true);
      custom.value = '';
      custom.focus();
    };
    addBtn.addEventListener('click', addCustom);
    custom.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addCustom(); }
    });
    renderSizeRows();
  }

  function toggleSize(size, onlyAdd = false) {
    const existing = sizeRows.find(r => r.size.toLowerCase() === size.toLowerCase());
    if (existing) {
      if (onlyAdd) { toast(`La talla ${size} ya está agregada`, 'info'); return; }
      sizeRows = sizeRows.filter(r => r !== existing);
    } else {
      sizeRows.push({ size, stockInicial: 1 });
    }
    renderSizeRows();
  }

  function renderSizeRows() {
    const container = document.getElementById('size-rows');
    const empty = document.getElementById('size-empty');
    if (!container) return;

    document.querySelectorAll('[data-size-chip]').forEach(chip => {
      const active = sizeRows.some(r => r.size.toLowerCase() === chip.dataset.sizeChip.toLowerCase());
      chip.classList.toggle('bg-brand-600', active);
      chip.classList.toggle('text-white', active);
      chip.classList.toggle('bg-white', !active);
      chip.classList.toggle('text-slate-600', !active);
    });

    empty.classList.toggle('hidden', sizeRows.length > 0);
    container.innerHTML = sizeRows.map((row, idx) => `
      <div class="flex items-center gap-2 bg-white border border-brand-100 rounded-lg px-3 py-2">
        <span class="font-medium text-slate-700 text-sm w-16">Talla ${row.size}</span>
        <span class="text-xs text-slate-400 flex-1">cantidad</span>
        <input type="number" min="0" step="1" value="${row.stockInicial}" data-size-qty="${idx}" class="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-300">
        <button type="button" data-size-rm="${idx}" class="text-rose-400 hover:text-rose-600" title="Quitar talla">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>`).join('');

    container.querySelectorAll('[data-size-qty]').forEach(input => {
      input.addEventListener('input', () => {
        const val = parseInt(input.value, 10);
        sizeRows[input.dataset.sizeQty].stockInicial = isNaN(val) || val < 0 ? 0 : val;
      });
    });
    container.querySelectorAll('[data-size-rm]').forEach(btn => {
      btn.addEventListener('click', () => {
        sizeRows.splice(parseInt(btn.dataset.sizeRm, 10), 1);
        renderSizeRows();
      });
    });
  }

  function collectSizeRows() {
    return sizeRows.filter(r => r.size.trim());
  }

  // Permite abrir la entrada de mercancía de una prenda concreta desde fuera
  // (por ejemplo desde la lista de reposición).
  function openEntry(productId) {
    return openMovementModal('entrada', productId);
  }

  return { render, openEntry };
})();
