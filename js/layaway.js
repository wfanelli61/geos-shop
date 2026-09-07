// Módulo de Apartados: la clienta abona una parte y la prenda queda reservada.
// Las prendas apartadas siguen en existencia física pero no están disponibles
// para vender, hasta que se entregan (se convierten en venta) o se cancelan.

const Layaway = (() => {
  let statusFilter = 'activo';
  let cart = [];
  let searchTerm = '';
  let inventoryCache = [];

  async function render() {
    const root = document.getElementById('view-apartados');
    const storeId = AppState.currentStore;
    const layaways = await DB.getLayaways({ storeId });
    const filtered = statusFilter === 'todos' ? layaways : layaways.filter(l => l.status === statusFilter);

    const activos = layaways.filter(l => l.status === 'activo');
    const totalReservado = activos.reduce((s, l) => s + l.total, 0);
    const totalAbonado = activos.reduce((s, l) => s + abonado(l), 0);

    root.innerHTML = `
      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="card border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
            <p class="text-xs font-medium text-slate-500">Apartados Activos</p>
            <p class="text-2xl font-bold text-brand-700">${activos.length}</p>
          </div>
          <div class="card border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
            <p class="text-xs font-medium text-slate-500">Abonado</p>
            <p class="text-2xl font-bold text-emerald-700">${fmtMoney(totalAbonado)}</p>
          </div>
          <div class="card border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4">
            <p class="text-xs font-medium text-slate-500">Por Cobrar</p>
            <p class="text-2xl font-bold text-amber-700">${fmtMoney(totalReservado - totalAbonado)}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-1 bg-white border border-brand-100 rounded-xl p-1">
            ${[['activo', 'Activos'], ['completado', 'Entregados'], ['cancelado', 'Cancelados'], ['todos', 'Todos']].map(([val, label]) => `
              <button class="lay-tab px-3 py-2 rounded-lg text-sm font-medium transition ${statusFilter === val ? 'bg-brand-600 text-white' : 'text-slate-500'}" data-status="${val}">${label}</button>`).join('')}
          </div>
          <button id="btn-new-layaway" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nuevo Apartado
          </button>
        </div>

        <div class="flex flex-col gap-3">
          ${filtered.length === 0 ? '<div class="card text-center text-slate-400 text-sm py-12">No hay apartados en esta categoría.</div>' :
            filtered.map(l => card(l)).join('')}
        </div>
      </div>`;

    document.querySelectorAll('.lay-tab').forEach(btn => btn.addEventListener('click', () => {
      statusFilter = btn.dataset.status;
      render();
    }));
    document.getElementById('btn-new-layaway').addEventListener('click', openLayawayModal);

    document.querySelectorAll('[data-deposit]').forEach(btn => btn.addEventListener('click', () => openDepositModal(btn.dataset.deposit)));
    document.querySelectorAll('[data-complete]').forEach(btn => btn.addEventListener('click', () => openCompleteModal(btn.dataset.complete)));
    document.querySelectorAll('[data-cancel]').forEach(btn => btn.addEventListener('click', () => cancelLayaway(btn.dataset.cancel)));
    document.querySelectorAll('[data-wa]').forEach(btn => btn.addEventListener('click', () => window.open(btn.dataset.wa, '_blank')));
  }

  function abonado(layaway) {
    return +layaway.deposits.reduce((s, d) => s + d.amount, 0).toFixed(2);
  }

  function card(l) {
    const pagado = abonado(l);
    const resta = +(l.total - pagado).toFixed(2);
    const pct = l.total > 0 ? Math.min(100, Math.round((pagado / l.total) * 100)) : 0;
    const statusBadge = {
      activo: 'bg-amber-50 text-amber-700',
      completado: 'bg-emerald-50 text-emerald-700',
      cancelado: 'bg-slate-100 text-slate-500',
    }[l.status];
    const wa = whatsappLink(l.clientPhone, `¡Hola ${l.clientName}! Te recordamos que tienes un apartado en Geo's Shop. Abonado: ${fmtMoney(pagado)} de ${fmtMoney(l.total)}. Restan ${fmtMoney(resta)}.`);

    return `
      <div class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-slate-800">${l.clientName}</h3>
              <span class="text-xs font-medium px-2 py-1 rounded-full ${statusBadge}">${l.status === 'activo' ? 'Activo' : l.status === 'completado' ? 'Entregado' : 'Cancelado'}</span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">${l.clientPhone} · Apartado el ${fmtDate(l.date)}${l.note ? ' · ' + l.note : ''}</p>
          </div>
          <div class="text-right">
            <p class="text-xl font-bold text-slate-800">${fmtMoney(l.total)}</p>
            <p class="text-xs text-slate-400">${l.items.reduce((a, i) => a + i.qty, 0)} prenda(s)</p>
          </div>
        </div>

        <div class="mt-3 flex flex-col gap-1">
          ${l.items.map(i => `<p class="text-sm text-slate-600">${i.name} <span class="text-slate-400 text-xs">${i.sku} · ${i.size}/${i.color} · x${i.qty}</span></p>`).join('')}
        </div>

        <div class="mt-4">
          <div class="flex justify-between text-xs mb-1">
            <span class="text-emerald-600 font-medium">Abonado ${fmtMoney(pagado)}</span>
            <span class="text-amber-600 font-medium">Resta ${fmtMoney(resta)}</span>
          </div>
          <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div class="h-full bg-emerald-500 rounded-full transition-all" style="width: ${pct}%"></div>
          </div>
        </div>

        ${l.deposits.length > 0 ? `
          <div class="mt-3 flex flex-wrap gap-1.5">
            ${l.deposits.map(d => `<span class="text-xs bg-brand-50 text-brand-700 px-2 py-1 rounded-full">${fmtMoney(d.amount)} · ${d.method} · ${fmtDate(d.date)}</span>`).join('')}
          </div>` : ''}

        ${l.status === 'activo' ? `
          <div class="mt-4 flex flex-wrap gap-2 pt-3 border-t border-brand-50">
            <button data-deposit="${l.id}" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition">Registrar Abono</button>
            <button data-complete="${l.id}" class="border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-4 py-2 rounded-lg transition">Entregar</button>
            ${wa ? `<button data-wa="${wa}" class="border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-lg transition">Recordar por WhatsApp</button>` : ''}
            <button data-cancel="${l.id}" class="text-rose-500 hover:text-rose-700 text-sm font-medium px-3 py-2 ml-auto">Cancelar</button>
          </div>` : ''}
      </div>`;
  }

  // ------------------------------------------------------------ Nuevo apartado

  async function openLayawayModal() {
    cart = [];
    searchTerm = '';
    inventoryCache = await DB.getInventory(AppState.currentStore);

    openModal(`
      <form id="layaway-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">Nuevo Apartado — ${storeName(AppState.currentStore)}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Nombre del Cliente</label>
            <input required name="clientName" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Rosa Medina">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Teléfono</label>
            <input required name="clientPhone" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="0414-1234567">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Cédula <span class="text-slate-300">(opcional)</span></label>
            <input name="clientCedula" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="V-18.456.789">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Dirección <span class="text-slate-300">(opcional)</span></label>
            <input name="clientAddress" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Av. Bolívar, Res. El Parque">
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500">Buscar prenda</label>
          <input id="lay-search" type="text" autocomplete="off" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Código o nombre...">
          <div id="lay-results" class="mt-1 max-h-40 overflow-y-auto flex flex-col gap-1"></div>
        </div>

        <div class="border-t border-brand-50 pt-3">
          <div id="lay-cart" class="flex flex-col gap-2 max-h-40 overflow-y-auto"></div>
          <div id="lay-cart-empty" class="text-center text-slate-400 text-sm py-4">Agrega las prendas a apartar.</div>
          <div class="flex justify-between items-center mt-2 pt-2 border-t border-brand-50">
            <span class="text-sm text-slate-500">Total</span>
            <span id="lay-total" class="text-lg font-bold text-slate-800">$0.00</span>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Abono inicial (USD)</label>
            <input type="number" min="0" step="0.01" name="deposit" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="0.00">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Método del abono</label>
            <select name="depositMethod" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500">Nota (opcional)</label>
          <input name="note" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Para graduación">
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-lay" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Crear Apartado</button>
        </div>
      </form>`);

    const search = document.getElementById('lay-search');
    search.addEventListener('input', (e) => { searchTerm = e.target.value; renderLayResults(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#lay-results [data-add]:not([disabled])');
        if (first) addLayItem(first.dataset.add);
      }
    });
    document.getElementById('btn-cancel-lay').addEventListener('click', closeModal);
    renderLayCart();

    document.getElementById('layaway-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (cart.length === 0) { toast('Agrega al menos una prenda', 'error'); return; }
      const fd = new FormData(e.target);
      const depositAmount = parseFloat(fd.get('deposit'));
      const total = +cart.reduce((s, i) => s + i.qty * i.price, 0).toFixed(2);

      // El apartado también alimenta la ficha del cliente.
      const client = await DB.upsertClient({
        name: fd.get('clientName').trim(),
        phone: fd.get('clientPhone').trim(),
        cedula: (fd.get('clientCedula') || '').trim(),
        address: (fd.get('clientAddress') || '').trim(),
      });

      await DB.addLayaway({
        storeId: AppState.currentStore,
        clientId: client.id,
        clientName: fd.get('clientName').trim(),
        clientPhone: fd.get('clientPhone').trim(),
        clientCedula: (fd.get('clientCedula') || '').trim(),
        clientAddress: (fd.get('clientAddress') || '').trim(),
        items: cart.map(({ productId, sku, name, size, color, price, qty }) => ({ productId, sku, name, size, color, price, qty, subtotal: +(price * qty).toFixed(2) })),
        total,
        deposits: isNaN(depositAmount) || depositAmount <= 0 ? [] : [{ amount: depositAmount, method: fd.get('depositMethod'), date: new Date().toISOString() }],
        note: (fd.get('note') || '').trim(),
      });

      closeModal();
      toast('Apartado creado');
      render();
    });
  }

  function renderLayResults() {
    const container = document.getElementById('lay-results');
    const term = searchTerm.trim().toLowerCase();
    if (!term) { container.innerHTML = ''; return; }
    const matches = inventoryCache.filter(p =>
      p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
    ).slice(0, 6);

    if (matches.length === 0) {
      container.innerHTML = '<div class="text-sm text-slate-400 py-1">Sin resultados.</div>';
      return;
    }

    // Igual que en la venta: agrupamos por prenda y las tallas son botones.
    const groups = {};
    matches.forEach(p => {
      const key = `${p.name.toLowerCase()}|${p.color.toLowerCase()}`;
      if (!groups[key]) groups[key] = { name: p.name, color: p.color, price: p.price, variants: [] };
      groups[key].variants.push(p);
    });

    container.innerHTML = Object.values(groups).slice(0, 5).map(g => {
      g.variants.sort((a, b) => a.size.localeCompare(b.size, 'es', { numeric: true }));
      return `
      <div class="border border-slate-100 rounded-lg px-3 py-2">
        <div class="flex justify-between items-center gap-2 text-sm">
          <span><span class="font-medium text-slate-800">${g.name}</span> <span class="text-slate-500">· ${g.color}</span></span>
          <span class="text-brand-700 font-semibold shrink-0">${fmtMoney(g.price)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span class="text-xs text-slate-400 mr-0.5">Talla:</span>
          ${g.variants.map(p => {
            const inCart = cart.find(i => i.productId === p.id);
            const restante = p.disponible - (inCart ? inCart.qty : 0);
            const disabled = restante <= 0;
            return `
            <button type="button" data-add="${p.id}" ${disabled ? 'disabled' : ''} title="${p.sku} · quedan ${restante}"
              class="px-2.5 py-1 rounded-lg border text-sm font-medium transition ${disabled
                ? 'border-slate-100 text-slate-300 line-through cursor-not-allowed'
                : 'border-brand-200 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600'}">
              ${p.size}${disabled ? '' : `<span class="text-[10px] text-slate-400">(${restante})</span>`}${inCart ? `<span class="text-[10px] text-brand-600 font-semibold">·${inCart.qty}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addLayItem(btn.dataset.add)));
  }

  function addLayItem(productId) {
    const product = inventoryCache.find(p => p.id === productId);
    const inCart = cart.find(i => i.productId === productId);
    if ((inCart ? inCart.qty : 0) + 1 > product.disponible) {
      toast(`Solo quedan ${product.disponible} disponibles`, 'error');
      return;
    }
    if (inCart) inCart.qty += 1;
    else cart.push({ productId, sku: product.sku, name: product.name, size: product.size, color: product.color, price: product.price, qty: 1 });

    searchTerm = '';
    const search = document.getElementById('lay-search');
    if (search) { search.value = ''; search.focus(); }
    renderLayResults();
    renderLayCart();
  }

  function renderLayCart() {
    const container = document.getElementById('lay-cart');
    const empty = document.getElementById('lay-cart-empty');
    const totalEl = document.getElementById('lay-total');
    if (!container) return;

    if (cart.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      totalEl.textContent = fmtMoney(0);
      return;
    }
    empty.classList.add('hidden');
    container.innerHTML = cart.map(i => `
      <div class="flex items-center justify-between gap-2 bg-brand-50/50 rounded-lg px-3 py-2 text-sm">
        <span class="min-w-0 truncate"><span class="font-medium text-slate-800">${i.name}</span> <span class="text-xs text-slate-500">${i.sku} · ${i.size}/${i.color}</span></span>
        <span class="flex items-center gap-2 shrink-0">
          <span class="font-semibold text-slate-700">${fmtMoney(i.qty * i.price)}</span>
          <button type="button" data-dec="${i.productId}" class="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-600">−</button>
          <span class="w-4 text-center">${i.qty}</span>
          <button type="button" data-inc="${i.productId}" class="w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-600">+</button>
        </span>
      </div>`).join('');

    totalEl.textContent = fmtMoney(cart.reduce((s, i) => s + i.qty * i.price, 0));

    container.querySelectorAll('[data-inc]').forEach(btn => btn.addEventListener('click', () => addLayItem(btn.dataset.inc)));
    container.querySelectorAll('[data-dec]').forEach(btn => btn.addEventListener('click', () => {
      const item = cart.find(i => i.productId === btn.dataset.dec);
      item.qty -= 1;
      if (item.qty <= 0) cart = cart.filter(i => i.productId !== btn.dataset.dec);
      renderLayResults();
      renderLayCart();
    }));
  }

  // ------------------------------------------------------------------ Abonos

  async function openDepositModal(layawayId) {
    const layaways = await DB.getLayaways({});
    const layaway = layaways.find(l => l.id === layawayId);
    const resta = +(layaway.total - abonado(layaway)).toFixed(2);

    openModal(`
      <form id="deposit-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">Registrar Abono</h3>
        <p class="text-sm text-slate-500">${layaway.clientName} · Restan <span class="font-semibold text-amber-600">${fmtMoney(resta)}</span></p>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Monto (USD)</label>
            <input required type="number" min="0.01" max="${resta}" step="0.01" name="amount" value="${resta}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Método</label>
            <select name="method" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-dep" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Guardar Abono</button>
        </div>
      </form>`);

    document.getElementById('btn-cancel-dep').addEventListener('click', closeModal);
    document.getElementById('deposit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const amount = parseFloat(fd.get('amount'));
      if (amount > resta) { toast('El abono no puede superar lo que resta', 'error'); return; }
      await DB.addDeposit(layawayId, { amount, method: fd.get('method') });
      closeModal();
      toast(`Abono de ${fmtMoney(amount)} registrado`);
      render();
    });
  }

  async function openCompleteModal(layawayId) {
    const layaways = await DB.getLayaways({});
    const layaway = layaways.find(l => l.id === layawayId);
    const resta = +(layaway.total - abonado(layaway)).toFixed(2);

    openModal(`
      <form id="complete-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">Entregar Apartado</h3>
        <p class="text-sm text-slate-500">Al entregar se registra la venta y se descuenta el inventario.</p>
        ${resta > 0 ? `<div class="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-amber-700">Aún restan <span class="font-semibold">${fmtMoney(resta)}</span> por cobrar. Registra el pago final antes de entregar.</div>` : ''}
        <div>
          <label class="text-xs font-medium text-slate-500">Método del pago final</label>
          <select name="method" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            ${PAYMENT_METHODS.map(m => `<option value="${m}">${m}</option>`).join('')}
          </select>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-comp" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm">Entregar y Registrar Venta</button>
        </div>
      </form>`);

    document.getElementById('btn-cancel-comp').addEventListener('click', closeModal);
    document.getElementById('complete-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      if (resta > 0) {
        await DB.addDeposit(layawayId, { amount: resta, method: fd.get('method') });
      }
      await DB.completeLayaway(layawayId, fd.get('method'));
      closeModal();
      toast('Apartado entregado y venta registrada');
      render();
    });
  }

  async function cancelLayaway(layawayId) {
    if (!confirmDialog('¿Cancelar este apartado? Las prendas volverán a estar disponibles para la venta.')) return;
    await DB.cancelLayaway(layawayId, 'Cancelado desde el panel');
    toast('Apartado cancelado', 'info');
    render();
  }

  return { render };
})();
