// Módulo de Clientes. La lista se deriva de las ventas y apartados reales,
// por eso nunca queda desincronizada con el historial de compras.

const Clients = (() => {
  let search = '';
  let scope = 'store'; // 'store' | 'todas'

  async function render() {
    const root = document.getElementById('view-clientes');
    const storeId = scope === 'store' ? AppState.currentStore : null;
    const clients = await DB.getClients(storeId);

    const totalFacturado = clients.reduce((s, c) => s + c.totalGastado, 0);

    root.innerHTML = `
      <div class="flex flex-col gap-5">
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div class="card border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white p-4">
            <p class="text-xs font-medium text-slate-500">Clientes Registrados</p>
            <p class="text-2xl font-bold text-brand-700">${clients.length}</p>
          </div>
          <div class="card border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-4">
            <p class="text-xs font-medium text-slate-500">Total Facturado</p>
            <p class="text-2xl font-bold text-emerald-700">${fmtMoney(totalFacturado)}</p>
          </div>
          <div class="card border-2 border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4">
            <p class="text-xs font-medium text-slate-500">Compra Promedio</p>
            <p class="text-2xl font-bold text-sky-700">${fmtMoney(clients.length ? totalFacturado / clients.reduce((s, c) => s + c.compras, 0) : 0)}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3 card p-4 shadow-sm">
          <input id="client-search" type="text" value="${search}" placeholder="Buscar por nombre, teléfono o cédula..." class="flex-1 min-w-52 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
          <select id="client-scope" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            <option value="store" ${scope === 'store' ? 'selected' : ''}>${storeName(AppState.currentStore)}</option>
            <option value="todas" ${scope === 'todas' ? 'selected' : ''}>Ambas Tiendas</option>
          </select>
          <button id="btn-new-client" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl shadow-sm transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nuevo Cliente
          </button>
        </div>

        <div id="clients-list" class="flex flex-col gap-3"></div>
      </div>`;

    document.getElementById('client-search').addEventListener('input', (e) => {
      search = e.target.value;
      renderList(clients);
    });
    document.getElementById('client-scope').addEventListener('change', (e) => {
      scope = e.target.value;
      render();
    });
    document.getElementById('btn-new-client').addEventListener('click', () => openClientModal(null));

    renderList(clients);
  }

  function openClientModal(client) {
    const isEdit = !!client;
    openModal(`
      <form id="client-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">${isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-slate-500">Nombre Completo</label>
            <input required name="name" value="${client?.name || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Maria Gonzalez">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Teléfono</label>
            <input required name="phone" value="${client?.phone || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="0414-1234567">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Cédula</label>
            <input name="cedula" value="${client?.cedula || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="V-18.456.789">
          </div>
          <div>
            <label class="text-xs font-medium text-slate-500">Dirección</label>
            <input name="address" value="${client?.address || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Av. Bolívar, Res. El Parque">
          </div>
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Nota <span class="text-slate-300">(preferencias, tallas, etc.)</span></label>
          <input name="note" value="${client?.note || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Usa talla M, prefiere colores claros">
        </div>
        <div class="flex justify-between items-center pt-2">
          ${isEdit ? '<button type="button" id="btn-delete-client" class="text-rose-500 hover:text-rose-700 text-sm font-medium">Eliminar ficha</button>' : '<span></span>'}
          <div class="flex gap-2">
            <button type="button" id="btn-cancel-client" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
            <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">${isEdit ? 'Guardar Cambios' : 'Crear Cliente'}</button>
          </div>
        </div>
      </form>`);

    document.getElementById('btn-cancel-client').addEventListener('click', closeModal);

    // La confirmación va dentro del modal: el diálogo del navegador se bloquea
    // cuando ya hay una ventana modal abierta.
    const delBtn = document.getElementById('btn-delete-client');
    if (delBtn) delBtn.addEventListener('click', () => {
      openModal(`
        <div class="p-6 flex flex-col gap-4">
          <h3 class="text-lg font-semibold text-slate-800">¿Eliminar la ficha de ${client.name}?</h3>
          <p class="text-sm text-slate-500">Sus compras quedarán en el historial de ventas, pero se perderán su cédula, dirección y saldo a favor.</p>
          <div class="flex justify-end gap-2 pt-2">
            <button type="button" id="btn-keep-client" class="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
            <button type="button" id="btn-really-delete" class="px-5 py-2.5 text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm">Sí, eliminar</button>
          </div>
        </div>`);
      document.getElementById('btn-keep-client').addEventListener('click', () => openClientModal(client));
      document.getElementById('btn-really-delete').addEventListener('click', async () => {
        await DB.deleteClient(client.id);
        closeModal();
        toast('Ficha eliminada', 'info');
        render();
      });
    });

    document.getElementById('client-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      await DB.saveClient({
        id: client?.id,
        name: fd.get('name').trim(),
        phone: fd.get('phone').trim(),
        cedula: (fd.get('cedula') || '').trim(),
        address: (fd.get('address') || '').trim(),
        note: (fd.get('note') || '').trim(),
      });
      closeModal();
      toast(isEdit ? 'Cliente actualizado' : 'Cliente registrado');
      render();
    });
  }

  function renderList(clients) {
    const container = document.getElementById('clients-list');
    const term = search.trim().toLowerCase();
    const filtered = clients.filter(c =>
      !term || c.name.toLowerCase().includes(term) || (c.phone || '').includes(term) ||
      (c.cedula || '').toLowerCase().includes(term)
    );

    if (filtered.length === 0) {
      container.innerHTML = '<div class="card text-center text-slate-400 text-sm py-12">No se encontraron clientes. Se registran automáticamente al vender.</div>';
      return;
    }

    container.innerHTML = filtered.map(c => {
      const wa = whatsappLink(c.phone, `¡Hola ${c.name}! Te escribimos de Geo's Shop 🌸 Tenemos novedades que te van a encantar.`);
      return `
      <div class="card p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="w-11 h-11 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center font-semibold shrink-0">
              ${c.name.trim().charAt(0).toUpperCase()}
            </div>
            <div class="min-w-0">
              <h3 class="font-semibold text-slate-800">${c.name}</h3>
              <p class="text-xs text-slate-400">${c.phone || 'Sin teléfono'}${c.cedula ? ' · ' + c.cedula : ''} · Última compra: ${c.ultimaCompra ? fmtDate(c.ultimaCompra) : '—'}</p>
              ${c.address ? `<p class="text-xs text-slate-400 flex items-start gap-1 mt-0.5">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-3 h-3 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
                ${c.address}</p>` : ''}
              ${c.note ? `<p class="text-xs text-brand-600 mt-0.5">${c.note}</p>` : ''}
              <div class="flex flex-wrap gap-1.5 mt-1">
                ${c.saldoFavor > 0 ? `<span class="text-xs bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full">${fmtMoney(c.saldoFavor)} a favor</span>` : ''}
                ${c.apartadosActivos > 0 ? `<span class="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">${c.apartadosActivos} apartado(s) activo(s)</span>` : ''}
                ${!c.cedula || !c.address ? '<span class="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">Ficha incompleta</span>' : ''}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-4 text-right">
            <div>
              <p class="text-xs text-slate-400">Compras</p>
              <p class="font-semibold text-slate-800">${c.compras}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400">Prendas</p>
              <p class="font-semibold text-slate-800">${c.prendas}</p>
            </div>
            <div>
              <p class="text-xs text-slate-400">Total</p>
              <p class="font-semibold text-emerald-600">${fmtMoney(c.totalGastado)}</p>
            </div>
          </div>
        </div>
        <div class="flex flex-wrap gap-2 mt-4 pt-3 border-t border-brand-50">
          <button data-history="${c.key}" class="border border-brand-200 text-brand-700 hover:bg-brand-50 text-sm font-medium px-4 py-2 rounded-lg transition">Ver historial</button>
          <button data-edit="${c.key}" class="border border-slate-200 text-slate-600 hover:bg-slate-50 text-sm font-medium px-4 py-2 rounded-lg transition">${c.id ? 'Editar ficha' : 'Completar ficha'}</button>
          ${wa ? `<button data-wa="${wa}" class="border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-sm font-medium px-4 py-2 rounded-lg transition flex items-center gap-1.5">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg>
            WhatsApp
          </button>` : ''}
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-history]').forEach(btn => btn.addEventListener('click', () => openHistory(btn.dataset.history, clients)));
    container.querySelectorAll('[data-wa]').forEach(btn => btn.addEventListener('click', () => window.open(btn.dataset.wa, '_blank')));
    container.querySelectorAll('[data-edit]').forEach(btn => btn.addEventListener('click', () => {
      const c = clients.find(x => x.key === btn.dataset.edit);
      // Un cliente que solo existe dentro de ventas antiguas no tiene ficha:
      // se abre el formulario con sus datos para crearla y completarla.
      openClientModal(c.id ? c : { name: c.name, phone: c.phone, cedula: '', address: '', note: '' });
    }));
  }

  async function openHistory(clientKey, clients) {
    const client = clients.find(c => c.key === clientKey);
    const storeId = scope === 'store' ? AppState.currentStore : null;
    const history = (await DB.getClientHistory(clientKey, storeId)).filter(s => s.status !== 'anulada');

    openModal(`
      <div class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">${client.name}</h3>
          <p class="text-sm text-slate-400">${client.phone} · ${history.length} compra(s) · ${fmtMoney(client.totalGastado)} en total</p>
        </div>
        <div class="flex flex-col gap-2 max-h-80 overflow-y-auto">
          ${history.length === 0 ? '<p class="text-sm text-slate-400">Sin compras registradas.</p>' : history.map(s => `
            <div class="border border-brand-50 rounded-xl p-3">
              <div class="flex justify-between items-start">
                <div>
                  <p class="text-sm font-medium text-slate-800">${fmtDateTime(s.date)}</p>
                  <p class="text-xs text-slate-400">${storeName(s.storeId)} · ${s.paymentMethod}</p>
                </div>
                <span class="font-semibold text-brand-700">${fmtMoney(s.total)}</span>
              </div>
              <div class="mt-2 flex flex-col gap-0.5">
                ${s.items.map(i => `<p class="text-xs text-slate-500">${i.name} · ${i.size}/${i.color} · x${i.qty}</p>`).join('')}
              </div>
            </div>`).join('')}
        </div>
        <div class="flex justify-end">
          <button id="btn-close-history" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Cerrar</button>
        </div>
      </div>`);

    document.getElementById('btn-close-history').addEventListener('click', closeModal);
  }

  return { render };
})();
