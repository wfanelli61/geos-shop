// Módulo de Reportes y Cuadre. Rango de fechas, desglose por método de pago,
// prendas más vendidas, y acciones sobre cada venta
// (anular, devolución, imprimir recibo).

const Reports = (() => {
  let scope = null;                  // 'damas' | 'ninos' | 'ambas'
  let dateFrom = todayInput();
  let dateTo = todayInput();
  let preset = 'hoy';

  async function render() {
    if (!scope) scope = AppState.currentStore;
    const root = document.getElementById('view-reportes');

    root.innerHTML = `
      <div class="flex flex-col gap-5">
        <div class="card p-4 shadow-sm flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            ${[['hoy', 'Hoy'], ['ayer', 'Ayer'], ['semana', 'Últimos 7 días'], ['mes', 'Este mes']].map(([val, label]) => `
              <button class="preset-btn px-3 py-1.5 rounded-lg text-sm font-medium transition ${preset === val ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'}" data-preset="${val}">${label}</button>`).join('')}
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <select id="report-scope" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              ${STORES.map(s => `<option value="${s.id}" ${scope === s.id ? 'selected' : ''}>${s.name}</option>`).join('')}
              <option value="ambas" ${scope === 'ambas' ? 'selected' : ''}>Ambas Tiendas</option>
            </select>
            <div class="flex items-center gap-2">
              <input id="date-from" type="date" value="${dateFrom}" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              <span class="text-slate-400 text-sm">a</span>
              <input id="date-to" type="date" value="${dateTo}" class="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
            </div>
            <button id="btn-print-report" class="ml-auto border border-brand-200 text-brand-700 hover:bg-brand-50 text-sm font-medium px-4 py-2 rounded-lg transition flex items-center gap-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
              Imprimir cuadre
            </button>
          </div>
        </div>
        <div id="report-body"></div>
      </div>`;

    document.querySelectorAll('.preset-btn').forEach(btn => btn.addEventListener('click', () => {
      applyPreset(btn.dataset.preset);
      render();
    }));
    document.getElementById('report-scope').addEventListener('change', (e) => { scope = e.target.value; renderBody(); });
    document.getElementById('date-from').addEventListener('change', (e) => { dateFrom = e.target.value; preset = ''; renderBody(); });
    document.getElementById('date-to').addEventListener('change', (e) => { dateTo = e.target.value; preset = ''; renderBody(); });
    document.getElementById('btn-print-report').addEventListener('click', printReport);

    renderBody();
  }

  function applyPreset(value) {
    preset = value;
    const now = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (value === 'hoy') {
      dateFrom = dateTo = fmt(now);
    } else if (value === 'ayer') {
      const y = new Date(now.getTime() - 86400000);
      dateFrom = dateTo = fmt(y);
    } else if (value === 'semana') {
      dateFrom = fmt(new Date(now.getTime() - 6 * 86400000));
      dateTo = fmt(now);
    } else if (value === 'mes') {
      dateFrom = fmt(new Date(now.getFullYear(), now.getMonth(), 1));
      dateTo = fmt(now);
    }
  }

  async function compute(storeId) {
    const from = parseDateInput(dateFrom);
    const to = parseDateInput(dateTo, true);

    const allSales = await DB.getSales({ storeId, dateFrom: from, dateTo: to });
    const sales = allSales.filter(s => s.status !== 'anulada');
    const anuladas = allSales.filter(s => s.status === 'anulada');
    const returns = (await DB.getMovements({ storeId, type: 'devolucion', dateFrom: from, dateTo: to }));
    // Los cambios se cuentan en el día en que se hicieron, no en el de la venta.
    const exchanges = await DB.getExchanges({ storeId, dateFrom: from, dateTo: to });
    const diferenciasCobradas = +exchanges.filter(x => x.diferencia > 0).reduce((s, x) => s + x.diferencia, 0).toFixed(2);
    const saldoOtorgado = +exchanges.filter(x => x.diferencia < 0).reduce((s, x) => s + Math.abs(x.diferencia), 0).toFixed(2);

    const totalPrendas = sales.reduce((sum, s) => sum + s.items.reduce((a, i) => a + i.qty, 0), 0);
    const ventasDelPeriodo = +sales.reduce((sum, s) => sum + s.total, 0).toFixed(2);
    const totalIngresos = +(ventasDelPeriodo + diferenciasCobradas).toFixed(2);
    const totalDescuentos = +sales.reduce((sum, s) => sum + (s.discount || 0), 0).toFixed(2);
    const totalDevoluciones = +returns.reduce((sum, m) => sum + (m.amount || 0), 0).toFixed(2);

    const porMetodo = {};
    PAYMENT_METHODS.forEach(m => porMetodo[m] = 0);
    sales.forEach(s => { porMetodo[s.paymentMethod] = +(porMetodo[s.paymentMethod] + s.total).toFixed(2); });
    exchanges.filter(x => x.diferencia > 0 && x.paymentMethod).forEach(x => {
      porMetodo[x.paymentMethod] = +(porMetodo[x.paymentMethod] + x.diferencia).toFixed(2);
    });

    const topProducts = {};
    sales.forEach(s => s.items.forEach(i => {
      if (!topProducts[i.productId]) topProducts[i.productId] = { name: i.name, sku: i.sku, qty: 0, monto: 0 };
      topProducts[i.productId].qty += i.qty;
      topProducts[i.productId].monto = +(topProducts[i.productId].monto + i.price * i.qty).toFixed(2);
    }));
    const top = Object.values(topProducts).sort((a, b) => b.qty - a.qty).slice(0, 5);

    return {
      storeId, sales, anuladas, returns, exchanges, totalPrendas, totalIngresos, totalDescuentos,
      totalDevoluciones, diferenciasCobradas, saldoOtorgado,
      ingresoNeto: +(totalIngresos - totalDevoluciones).toFixed(2),
      porMetodo, top,
    };
  }

  function summaryCard(data) {
    return `
      <div class="card p-5 flex flex-col gap-4">
        <h3 class="text-base font-semibold text-slate-800">${storeName(data.storeId)}</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-brand-50 rounded-lg p-3">
            <div class="text-xs text-brand-600 font-medium">Prendas Vendidas</div>
            <div class="text-2xl font-bold text-brand-700">${data.totalPrendas}</div>
          </div>
          <div class="bg-emerald-50 rounded-lg p-3">
            <div class="text-xs text-emerald-600 font-medium">Ingresos</div>
            <div class="text-2xl font-bold text-emerald-700">${fmtMoney(data.totalIngresos)}</div>
          </div>
        </div>
        <div>
          <div class="text-xs font-medium text-slate-500 mb-2">Desglose por Método de Pago</div>
          <div class="flex flex-col gap-1.5">
            ${PAYMENT_METHODS.map(m => `
              <div class="flex justify-between text-sm">
                <span class="text-slate-500">${m}</span>
                <span class="text-right">
                  <span class="font-medium text-slate-700">${fmtMoney(data.porMetodo[m])}</span>
                  ${METHODS_IN_BS.includes(m) && data.porMetodo[m] > 0 ? `<span class="block text-xs text-slate-400">${fmtBs(data.porMetodo[m])}</span>` : ''}
                </span>
              </div>`).join('')}
          </div>
        </div>
        <div class="border-t border-brand-50 pt-3 flex flex-col gap-1.5">
          ${data.diferenciasCobradas > 0 ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Diferencias por cambios</span><span class="text-emerald-700">+${fmtMoney(data.diferenciasCobradas)}</span></div>` : ''}
          ${data.saldoOtorgado > 0 ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Saldo a favor otorgado</span><span class="text-amber-600">${fmtMoney(data.saldoOtorgado)}</span></div>` : ''}
          ${data.totalDescuentos > 0 ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Descuentos dados</span><span class="text-rose-600">−${fmtMoney(data.totalDescuentos)}</span></div>` : ''}
          ${data.totalDevoluciones > 0 ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Devoluciones</span><span class="text-rose-600">−${fmtMoney(data.totalDevoluciones)}</span></div>` : ''}
          <div class="flex justify-between text-sm"><span class="text-slate-500">Ingreso neto</span><span class="font-semibold text-slate-800">${fmtMoney(data.ingresoNeto)}</span></div>
        </div>
      </div>`;
  }

  function topCard(top) {
    return `
      <div class="card p-5">
        <h3 class="text-sm font-semibold text-slate-700 mb-3">Prendas Más Vendidas</h3>
        ${top.length === 0 ? '<p class="text-sm text-slate-400">Sin ventas en este período.</p>' : `
          <div class="flex flex-col gap-2.5">
            ${top.map((p, i) => {
              const max = top[0].qty || 1;
              return `
              <div>
                <div class="flex justify-between text-sm mb-1">
                  <span class="text-slate-700"><span class="text-slate-400 mr-1">${i + 1}.</span>${p.name} <span class="text-xs text-slate-400 font-mono">${p.sku}</span></span>
                  <span class="font-medium text-slate-800 shrink-0 ml-2">${p.qty} und · ${fmtMoney(p.monto)}</span>
                </div>
                <div class="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div class="h-full bg-brand-500 rounded-full" style="width: ${(p.qty / max) * 100}%"></div>
                </div>
              </div>`;
            }).join('')}
          </div>`}
      </div>`;
  }

  // Las ventas se listan en el orden en que ocurrieron: la primera del día
  // arriba y la del cierre al final, numeradas por día para el cuadre.
  function inSaleOrder(sales) {
    const ordered = [...sales].sort((a, b) => new Date(a.date) - new Date(b.date));
    const perDay = {};
    return ordered.map(sale => {
      const day = new Date(sale.date).toDateString();
      perDay[day] = (perDay[day] || 0) + 1;
      return { sale, seq: perDay[day] };
    });
  }

  // Fila de un cambio: no es una venta nueva, es el cobro (o el saldo a favor)
  // de un cambio hecho ese día sobre una factura ya existente.
  function exchangeRow(x, showStore) {
    const cobro = x.diferencia > 0;
    return `
      <tr class="border-b border-brand-50/70 bg-amber-50/40">
        <td class="px-4 py-3 text-center"><span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-bold" title="Cambio sobre una factura existente">↔</span></td>
        <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${fmtDate(x.date)}<span class="block text-xs text-slate-400">${fmtTime(x.date)}</span></td>
        ${showStore ? `<td class="px-4 py-3 text-slate-600">${storeName(x.storeId)}</td>` : ''}
        <td class="px-4 py-3">
          <span class="font-medium text-slate-800">${x.clientName}</span>
          <span class="block text-xs text-amber-700">Cambio de prenda</span>
        </td>
        <td class="px-4 py-3 text-slate-500 text-xs">
          <span class="block">Devolvió: ${x.returned.map(r => `${r.name} T${r.size} (x${r.qty})`).join(', ')}</span>
          <span class="block">Se llevó: ${x.added.length ? x.added.map(a => `${a.name} T${a.size} (x${a.qty})`).join(', ') : '—'}</span>
        </td>
        <td class="px-4 py-3">${cobro ? `<span class="bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap">${x.paymentMethod}</span>` : '<span class="text-xs text-slate-400">Sin cobro</span>'}</td>
        <td class="px-4 py-3 text-right whitespace-nowrap">
          ${cobro
            ? `<span class="font-semibold text-emerald-700">+${fmtMoney(x.diferencia)}</span><span class="block text-xs text-slate-400">diferencia</span>`
            : x.diferencia < 0
              ? `<span class="font-semibold text-amber-600">${fmtMoney(Math.abs(x.diferencia))}</span><span class="block text-xs text-slate-400">a favor</span>`
              : '<span class="text-slate-400">parejo</span>'}
        </td>
        <td class="px-4 py-3">
          <div class="flex items-center justify-center">
            <button data-receipt="${x.saleId}" class="text-slate-500 hover:text-slate-700 text-xs font-medium">Factura</button>
          </div>
        </td>
      </tr>`;
  }

  function salesTable(sales, anuladas, exchanges = [], showStore = true) {
    const all = inSaleOrder([...sales, ...anuladas]);
    if (all.length === 0 && exchanges.length === 0) {
      return `<div class="text-center text-slate-400 text-sm py-8">No hay ventas registradas en este período.</div>`;
    }
    return `
      <table class="min-w-full text-sm">
        <thead>
          <tr class="text-left text-slate-500 thead-row">
            <th class="px-4 py-3 font-medium text-center">#</th>
            <th class="px-4 py-3 font-medium">Fecha</th>
            <th class="px-4 py-3 font-medium">Tienda</th>
            <th class="px-4 py-3 font-medium">Cliente</th>
            <th class="px-4 py-3 font-medium">Prendas</th>
            <th class="px-4 py-3 font-medium">Pago</th>
            <th class="px-4 py-3 font-medium text-right">Total</th>
            <th class="px-4 py-3 font-medium text-center">Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${// Ventas y cambios mezclados en el orden en que ocurrieron, para que
            // el cuadre del día se pueda leer y sumar línea por línea.
            [
              ...all.map(x => ({ tipo: 'venta', date: x.sale.date, html: saleRow(x.sale, x.seq) })),
              ...exchanges.map(x => ({ tipo: 'cambio', date: x.date, html: exchangeRow(x, showStore) })),
            ].sort((a, b) => new Date(a.date) - new Date(b.date)).map(r => r.html).join('')}
        </tbody>
      </table>`;
  }

  function saleRow(s, seq) {
    const anulada = s.status === 'anulada';
    const difPagadas = (s.exchanges || []).filter(x => x.diferencia > 0).reduce((sum, x) => sum + x.diferencia, 0);
    return `
            <tr class="border-b border-brand-50/70 hover:bg-brand-50/30 transition ${anulada ? 'opacity-50' : ''}">
              <td class="px-4 py-3 text-center"><span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-50 text-brand-700 text-xs font-semibold">${seq}</span></td>
              <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${fmtDate(s.date)}<span class="block text-xs text-slate-400">${fmtTime(s.date)}</span></td>
              <td class="px-4 py-3 text-slate-600">${storeName(s.storeId)}</td>
              <td class="px-4 py-3">
                <span class="font-medium text-slate-800">${s.clientName}</span>
                <span class="block text-xs text-slate-400">${s.clientPhone}</span>
                ${anulada ? '<span class="inline-block mt-1 text-xs bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full">Anulada</span>' : ''}
                ${(s.exchanges || []).length > 0 ? `<span class="inline-block mt-1 text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">${s.exchanges.length} cambio(s)</span>` : ''}
              </td>
              <td class="px-4 py-3 text-slate-500">${s.items.map(i => `${i.name} (x${i.qty})`).join(', ')}</td>
              <td class="px-4 py-3"><span class="bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap">${s.paymentMethod}</span></td>
              <td class="px-4 py-3 text-right font-semibold text-slate-700 whitespace-nowrap">
                ${fmtMoney(s.total)}
                ${s.discount > 0 ? `<span class="block text-xs text-rose-500">−${fmtMoney(s.discount)} desc.</span>` : ''}
                ${difPagadas > 0 ? `<span class="block text-xs text-emerald-600">+${fmtMoney(difPagadas)} por cambio</span>` : ''}
              </td>
              <td class="px-4 py-3">
                <div class="flex items-center justify-center gap-2 whitespace-nowrap">
                  <button data-receipt="${s.id}" class="text-slate-500 hover:text-slate-700 text-xs font-medium">Recibo</button>
                  ${anulada ? '' : `
                    <span class="text-slate-200">|</span>
                    <button data-exchange="${s.id}" class="text-amber-600 hover:text-amber-700 text-xs font-medium">Cambio</button>
                    <button data-void="${s.id}" class="text-rose-500 hover:text-rose-700 text-xs font-medium">Anular</button>`}
                </div>
              </td>
            </tr>`;
  }

  async function renderBody() {
    const body = document.getElementById('report-body');
    const rateWarning = isRateStale()
      ? `<div class="bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 text-sm text-amber-700 mb-4">
           La tasa (Bs ${CURRENT_SETTINGS.rate} por USD) no se ha actualizado hoy. Los montos en bolívares pueden estar desfasados —
           actualízala en <span class="font-medium">Ajustes de Datos → Tasa del día</span>.
         </div>` : '';

    if (scope === 'ambas') {
      const [damas, ninos] = await Promise.all([compute('damas'), compute('ninos')]);
      const combined = {
        totalPrendas: damas.totalPrendas + ninos.totalPrendas,
        totalIngresos: +(damas.totalIngresos + ninos.totalIngresos).toFixed(2),
        ingresoNeto: +(damas.ingresoNeto + ninos.ingresoNeto).toFixed(2),
      };
      const allTop = {};
      [...damas.top, ...ninos.top].forEach(p => {
        if (!allTop[p.sku]) allTop[p.sku] = { ...p };
        else { allTop[p.sku].qty += p.qty; allTop[p.sku].monto += p.monto; }
      });
      const top = Object.values(allTop).sort((a, b) => b.qty - a.qty).slice(0, 5);

      body.innerHTML = `
        ${rateWarning}
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="bg-gradient-to-br from-brand-600 to-brand-500 text-white rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
            <h3 class="text-base font-semibold">Consolidado — Ambas Tiendas</h3>
            <div class="grid grid-cols-2 gap-3">
              <div><div class="text-xs text-brand-100">Prendas Vendidas</div><div class="text-2xl font-bold">${combined.totalPrendas}</div></div>
              <div><div class="text-xs text-brand-100">Ingresos</div><div class="text-2xl font-bold">${fmtMoney(combined.totalIngresos)}</div></div>
              <div><div class="text-xs text-brand-100">Ingreso Neto</div><div class="text-lg font-semibold">${fmtMoney(combined.ingresoNeto)}</div></div>
            </div>
          </div>
          ${summaryCard(damas)}
          ${summaryCard(ninos)}
        </div>
        <div class="mt-5">${topCard(top)}</div>
        <div class="card overflow-x-auto mt-5">
          ${salesTable([...damas.sales, ...ninos.sales], [...damas.anuladas, ...ninos.anuladas], [...damas.exchanges, ...ninos.exchanges], true)}
        </div>`;
    } else {
      const data = await compute(scope);
      body.innerHTML = `
        ${rateWarning}
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          ${summaryCard(data)}
          ${topCard(data.top)}
        </div>
        <div class="card overflow-x-auto mt-5">
          ${salesTable(data.sales, data.anuladas, data.exchanges, true)}
        </div>`;
    }

    wireSaleActions();
  }

  function wireSaleActions() {
    document.querySelectorAll('[data-void]').forEach(btn => btn.addEventListener('click', () => voidSale(btn.dataset.void)));
    document.querySelectorAll('[data-exchange]').forEach(btn => btn.addEventListener('click', () => openExchangeModal(btn.dataset.exchange)));
    document.querySelectorAll('[data-receipt]').forEach(btn => btn.addEventListener('click', async () => {
      const sale = await DB.getSale(btn.dataset.receipt);
      printSaleReceipt(sale);
    }));
  }

  async function voidSale(saleId) {
    const sale = await DB.getSale(saleId);
    if (!confirmDialog(`¿Anular la venta de ${sale.clientName} por ${fmtMoney(sale.total)}?\n\nLas prendas volverán al inventario y la venta no contará en los reportes.`)) return;
    const reason = window.prompt('Motivo de la anulación (opcional):') || '';
    await DB.voidSale(saleId, reason);
    toast('Venta anulada, inventario restituido', 'info');
    renderBody();
  }

  // ------------------------------------------------- Cambio de prenda

  // Estado del cambio en curso: qué devuelve y qué se lleva a cambio.
  let exch = { sale: null, returned: {}, added: [], search: '', inventory: [], method: PAYMENT_METHODS[0], confirming: false, note: '' };

  async function openExchangeModal(saleId) {
    const sale = await DB.getSale(saleId);
    exch = {
      sale,
      returned: {},
      added: [],
      search: '',
      inventory: await DB.getInventory(sale.storeId),
      method: PAYMENT_METHODS[0],
      confirming: false,
      note: '',
    };
    renderExchange();
  }

  function exchTotals() {
    const devuelto = exch.sale.items.reduce((s, i) => s + i.price * (exch.returned[i.productId] || 0), 0);
    const nuevo = exch.added.reduce((s, i) => s + i.price * i.qty, 0);
    return { devuelto: +devuelto.toFixed(2), nuevo: +nuevo.toFixed(2), diferencia: +(nuevo - devuelto).toFixed(2) };
  }

  function renderExchange() {
    const sale = exch.sale;
    const t = exchTotals();
    const hayDevolucion = Object.values(exch.returned).some(q => q > 0);

    // Paso de confirmación dentro del propio modal. No usamos el diálogo del
    // navegador porque dentro de una ventana modal algunos navegadores lo
    // bloquean y el botón se quedaba sin hacer nada.
    if (exch.confirming) {
      const returned = sale.items.filter(i => (exch.returned[i.productId] || 0) > 0);
      openModal(`
        <div class="p-6 flex flex-col gap-4">
          <h3 class="text-lg font-semibold text-slate-800">¿Confirmas el cambio?</h3>

          <div class="flex flex-col gap-3">
            <div class="border border-amber-200 bg-amber-50/60 rounded-xl p-3">
              <p class="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Devuelve — vuelve al inventario</p>
              ${returned.map(i => `<p class="text-sm text-slate-700">${i.name} · Talla ${i.size} · ${i.color} <span class="text-slate-500">(x${exch.returned[i.productId]})</span></p>`).join('')}
            </div>
            <div class="border border-emerald-200 bg-emerald-50/60 rounded-xl p-3">
              <p class="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-1">Se lleva — sale del inventario</p>
              ${exch.added.length === 0
                ? '<p class="text-sm text-slate-500">Nada. El monto le queda a favor.</p>'
                : exch.added.map(a => `<p class="text-sm text-slate-700">${a.name} · Talla ${a.size} · ${a.color} <span class="text-slate-500">(x${a.qty})</span></p>`).join('')}
            </div>
          </div>

          <div class="rounded-xl p-4 text-center ${t.diferencia > 0 ? 'bg-brand-50' : t.diferencia < 0 ? 'bg-amber-50' : 'bg-emerald-50'}">
            ${t.diferencia > 0
              ? `<p class="text-sm text-slate-600">La clienta paga con <span class="font-medium">${exch.method}</span></p>
                 <p class="text-3xl font-bold text-brand-700 mt-1">${fmtMoney(t.diferencia)}</p>
                 ${METHODS_IN_BS.includes(exch.method) ? `<p class="text-xs text-slate-500 mt-1">${fmtBs(t.diferencia)}</p>` : ''}`
              : t.diferencia < 0
                ? `<p class="text-sm text-slate-600">Le queda a favor para su próxima compra</p>
                   <p class="text-3xl font-bold text-amber-600 mt-1">${fmtMoney(Math.abs(t.diferencia))}</p>`
                : '<p class="text-lg font-semibold text-emerald-700">Cambio parejo — no hay diferencia</p>'}
          </div>

          <p class="text-xs text-slate-400 text-center">La factura quedará con las prendas nuevas.</p>

          <div class="flex justify-between gap-2 pt-2">
            <button type="button" id="btn-back-exch" class="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700">← Volver</button>
            <button type="button" id="btn-do-exch" class="px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Sí, confirmar cambio</button>
          </div>
        </div>`);

      document.getElementById('btn-back-exch').addEventListener('click', () => {
        exch.confirming = false;
        renderExchange();
      });
      document.getElementById('btn-do-exch').addEventListener('click', doExchange);
      return;
    }

    openModal(`
      <div class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">Cambio de Prenda</h3>
          <p class="text-sm text-slate-400">
            Factura de ${sale.clientName} · ${fmtDateTime(sale.date)} · ${storeName(sale.storeId)}
          </p>
        </div>

        <div class="bg-brand-50/60 rounded-xl px-4 py-3 text-sm text-slate-600">
          La prenda que devuelve vuelve al inventario y la nueva se descuenta. No se devuelve dinero:
          si la nueva vale menos, la diferencia le queda <span class="font-medium text-brand-700">a favor</span>.
        </div>

        <div>
          <h4 class="text-sm font-semibold text-slate-700 mb-2">1. ¿Qué devuelve?</h4>
          <div class="flex flex-col gap-2">
            ${sale.items.map(i => {
              const devueltas = exch.returned[i.productId] || 0;
              return `
              <div class="flex items-center justify-between gap-3 border rounded-xl px-3 py-2.5 transition ${devueltas > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-brand-50'}">
                <div class="text-sm min-w-0">
                  <p class="font-medium text-slate-800 truncate">${i.name}</p>
                  <p class="text-xs text-slate-400">${i.sku} · Talla ${i.size} · ${i.color} · lleva ${i.qty} · ${fmtMoney(i.price)} c/u</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <button data-ret-dec="${i.productId}" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-100">−</button>
                  <span class="w-5 text-center text-sm font-semibold ${devueltas > 0 ? 'text-amber-700' : 'text-slate-400'}">${devueltas}</span>
                  <button data-ret-inc="${i.productId}" data-max="${i.qty}" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-100">+</button>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>

        <div>
          <h4 class="text-sm font-semibold text-slate-700 mb-2">2. ¿Qué se lleva a cambio?</h4>
          <input id="exch-search" type="text" autocomplete="off" value="${exch.search}" class="w-full border-2 border-brand-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-brand-400" placeholder="Buscar por código o nombre...">
          <div id="exch-results" class="mt-2 max-h-40 overflow-y-auto flex flex-col gap-1"></div>

          <div class="mt-2 flex flex-col gap-2">
            ${exch.added.length === 0 ? '<p class="text-sm text-slate-400 text-center py-3">Si solo devuelve sin llevar nada, deja esto vacío: el monto le queda a favor.</p>' :
              exch.added.map(a => `
              <div class="flex items-center justify-between gap-2 bg-emerald-50/60 border border-emerald-100 rounded-xl px-3 py-2">
                <div class="text-sm min-w-0">
                  <p class="font-medium text-slate-800 truncate">${a.name}</p>
                  <p class="text-xs text-slate-400">${a.sku} · Talla ${a.size} · ${a.color} · ${fmtMoney(a.price)} c/u</p>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <span class="text-sm font-semibold text-slate-700">${fmtMoney(a.price * a.qty)}</span>
                  <button data-add-dec="${a.productId}" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600">−</button>
                  <span class="w-5 text-center text-sm font-medium">${a.qty}</span>
                  <button data-add-inc="${a.productId}" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600">+</button>
                </div>
              </div>`).join('')}
          </div>
        </div>

        <div class="border-t border-brand-50 pt-3 flex flex-col gap-1.5">
          <div class="flex justify-between text-sm"><span class="text-slate-500">Valor devuelto</span><span class="text-amber-700 font-medium">${fmtMoney(t.devuelto)}</span></div>
          <div class="flex justify-between text-sm"><span class="text-slate-500">Valor de lo nuevo</span><span class="text-emerald-700 font-medium">${fmtMoney(t.nuevo)}</span></div>
          <div class="flex justify-between items-baseline pt-2 border-t border-brand-100 mt-1">
            <span class="text-sm font-medium text-slate-600">${t.diferencia > 0 ? 'La clienta paga' : t.diferencia < 0 ? 'Le queda a favor' : 'Cambio parejo'}</span>
            <span class="text-2xl font-bold ${t.diferencia > 0 ? 'text-brand-700' : t.diferencia < 0 ? 'text-amber-600' : 'text-emerald-600'}">
              ${t.diferencia === 0 ? '—' : fmtMoney(Math.abs(t.diferencia))}
            </span>
          </div>
          ${t.diferencia > 0 && METHODS_IN_BS.includes(exch.method) ? `<p class="text-xs text-slate-500 text-right">${fmtBs(t.diferencia)}</p>` : ''}
        </div>

        ${t.diferencia > 0 ? `
          <div>
            <label class="text-xs font-medium text-slate-500">¿Con qué paga la diferencia?</label>
            <select id="exch-method" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
              ${PAYMENT_METHODS.map(m => `<option value="${m}" ${exch.method === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>` : ''}

        <div>
          <label class="text-xs font-medium text-slate-500">Motivo del cambio</label>
          <input id="exch-note" value="${exch.note}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. No le quedó la talla">
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-exch" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="button" id="btn-confirm-exch" ${hayDevolucion ? '' : 'disabled'} class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
            Confirmar Cambio
          </button>
        </div>
      </div>`);

    wireExchange();
  }

  function wireExchange() {
    document.getElementById('btn-cancel-exch').addEventListener('click', closeModal);

    document.querySelectorAll('[data-ret-inc]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.retInc;
      const max = parseInt(btn.dataset.max, 10);
      exch.returned[id] = Math.min(max, (exch.returned[id] || 0) + 1);
      renderExchange();
    }));
    document.querySelectorAll('[data-ret-dec]').forEach(btn => btn.addEventListener('click', () => {
      const id = btn.dataset.retDec;
      exch.returned[id] = Math.max(0, (exch.returned[id] || 0) - 1);
      renderExchange();
    }));

    document.querySelectorAll('[data-add-inc]').forEach(btn => btn.addEventListener('click', () => addExchItem(btn.dataset.addInc)));
    document.querySelectorAll('[data-add-dec]').forEach(btn => btn.addEventListener('click', () => {
      const item = exch.added.find(a => a.productId === btn.dataset.addDec);
      item.qty -= 1;
      if (item.qty <= 0) exch.added = exch.added.filter(a => a.productId !== btn.dataset.addDec);
      renderExchange();
    }));

    // La nota se guarda mientras se escribe: el modal se redibuja con cada
    // cambio y si no, se borraría lo escrito.
    document.getElementById('exch-note').addEventListener('input', (e) => { exch.note = e.target.value; });

    const search = document.getElementById('exch-search');
    search.addEventListener('input', (e) => { exch.search = e.target.value; renderExchResults(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const first = document.querySelector('#exch-results [data-exch-add]:not([disabled])');
        if (first) addExchItem(first.dataset.exchAdd);
      }
    });

    const methodSel = document.getElementById('exch-method');
    if (methodSel) methodSel.addEventListener('change', (e) => { exch.method = e.target.value; renderExchange(); });

    document.getElementById('btn-confirm-exch').addEventListener('click', confirmExchange);
    renderExchResults();
  }

  function renderExchResults() {
    const container = document.getElementById('exch-results');
    const term = exch.search.trim().toLowerCase();
    if (!term) { container.innerHTML = ''; return; }

    const matches = exch.inventory.filter(p =>
      p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
    );
    if (matches.length === 0) {
      container.innerHTML = '<div class="text-sm text-slate-400 py-1">Sin resultados.</div>';
      return;
    }

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
            const yaAgregada = exch.added.find(a => a.productId === p.productId || a.productId === p.id);
            const restante = p.disponible - (yaAgregada ? yaAgregada.qty : 0);
            const disabled = restante <= 0;
            return `
            <button type="button" data-exch-add="${p.id}" ${disabled ? 'disabled' : ''} title="${p.sku} · quedan ${restante}"
              class="px-2.5 py-1 rounded-lg border text-sm font-medium transition ${disabled
                ? 'border-slate-100 text-slate-300 line-through cursor-not-allowed'
                : 'border-brand-200 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600'}">
              ${p.size}${disabled ? '' : `<span class="text-[10px] text-slate-400">(${restante})</span>`}
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-exch-add]').forEach(btn => btn.addEventListener('click', () => addExchItem(btn.dataset.exchAdd)));
  }

  function addExchItem(productId) {
    const p = exch.inventory.find(x => x.id === productId);
    if (!p) return;
    const existing = exch.added.find(a => a.productId === productId);
    if ((existing ? existing.qty : 0) + 1 > p.disponible) {
      toast(`Solo quedan ${p.disponible} disponibles de ${p.name} talla ${p.size}`, 'error');
      return;
    }
    if (existing) existing.qty += 1;
    else exch.added.push({ productId: p.id, sku: p.sku, name: p.name, size: p.size, color: p.color, price: p.price, qty: 1 });
    exch.search = '';
    renderExchange();
  }

  function confirmExchange() {
    if (!Object.values(exch.returned).some(q => q > 0)) {
      toast('Indica qué prenda devuelve', 'error');
      return;
    }
    const noteInput = document.getElementById('exch-note');
    if (noteInput) exch.note = noteInput.value.trim();
    exch.confirming = true;
    renderExchange();
  }

  async function doExchange() {
    const sale = exch.sale;
    const t = exchTotals();
    const returned = sale.items
      .filter(i => (exch.returned[i.productId] || 0) > 0)
      .map(i => ({ productId: i.productId, sku: i.sku, name: i.name, size: i.size, color: i.color, price: i.price, qty: exch.returned[i.productId] }));

    try {
      await DB.exchangeSale(sale.id, {
        returned, added: exch.added, paymentMethod: exch.method, note: exch.note,
      });
    } catch (err) {
      toast('No se pudo registrar el cambio: ' + err.message, 'error');
      return;
    }

    closeModal();
    toast(t.diferencia < 0
      ? `Cambio hecho · ${fmtMoney(Math.abs(t.diferencia))} a favor`
      : t.diferencia > 0
        ? `Cambio hecho · ${fmtMoney(t.diferencia)} cobrados`
        : 'Cambio registrado');
    renderBody();
  }

  function printSaleReceipt(sale) {
    const enBs = METHODS_IN_BS.includes(sale.paymentMethod);
    printHtml(`Recibo ${sale.id}`, `
      <h1>Geo's Shop</h1>
      <p class="muted">${storeName(sale.storeId)} · ${fmtDateTime(sale.date)}${sale.status === 'anulada' ? ' · VENTA ANULADA' : ''}</p>
      <h2>Cliente</h2>
      <div class="row"><span>${sale.clientName}</span><span>${sale.clientPhone}</span></div>
      ${sale.clientCedula ? `<div class="row"><span>Cédula</span><span>${sale.clientCedula}</span></div>` : ''}
      ${sale.clientAddress ? `<div class="row"><span>Dirección</span><span>${sale.clientAddress}</span></div>` : ''}
      <h2>Prendas</h2>
      <table>
        <thead><tr><th>Código</th><th>Prenda</th><th>Talla</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Subtotal</th></tr></thead>
        <tbody>${sale.items.map(i => `<tr><td>${i.sku}</td><td>${i.name} (${i.color})</td><td>${i.size}</td><td class="right">${i.qty}</td><td class="right">${fmtMoney(i.price)}</td><td class="right">${fmtMoney(i.price * i.qty)}</td></tr>`).join('')}</tbody>
      </table>
      ${(sale.exchanges || []).length > 0 ? `
        <h2>Cambios realizados</h2>
        ${sale.exchanges.map(x => `
          <div class="row"><span>${fmtDate(x.date)} — devolvió</span><span>${x.returned.map(r => `${r.name} T${r.size} x${r.qty}`).join(', ')}</span></div>
          <div class="row"><span>Se llevó</span><span>${x.added.length ? x.added.map(a => `${a.name} T${a.size} x${a.qty}`).join(', ') : '—'}</span></div>
          <div class="row"><span>${x.diferencia > 0 ? 'Diferencia pagada (' + x.paymentMethod + ')' : x.diferencia < 0 ? 'Saldo a favor' : 'Cambio parejo'}</span><span>${x.diferencia === 0 ? '—' : fmtMoney(Math.abs(x.diferencia))}</span></div>
        `).join('')}` : ''}
      <h2>Total</h2>
      <div class="row"><span>Pagado el ${fmtDate(sale.date)} (${sale.paymentMethod})</span><span>${fmtMoney(sale.total)}</span></div>
      ${sale.discount > 0 ? `<div class="row"><span>Descuento aplicado</span><span>−${fmtMoney(sale.discount)}</span></div>` : ''}
      ${(sale.exchanges || []).filter(x => x.diferencia > 0).map(x => `<div class="row"><span>Diferencia pagada el ${fmtDate(x.date)}</span><span>${fmtMoney(x.diferencia)}</span></div>`).join('')}
      <div class="row total"><span>Total pagado</span><span>${fmtMoney(sale.total + (sale.exchanges || []).filter(x => x.diferencia > 0).reduce((s, x) => s + x.diferencia, 0))}</span></div>
      ${enBs && sale.rate ? `<p class="muted">Equivalente: Bs ${(sale.total * sale.rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (tasa ${sale.rate})</p>` : ''}
      <p class="muted" style="margin-top:24px">¡Gracias por tu compra! Ser tú, siempre combina con todo.</p>`);
  }

  async function printReport() {
    const label = scope === 'ambas' ? 'Ambas Tiendas' : storeName(scope);
    const periodo = dateFrom === dateTo ? fmtDate(parseDateInput(dateFrom)) : `${fmtDate(parseDateInput(dateFrom))} al ${fmtDate(parseDateInput(dateTo))}`;
    const datasets = scope === 'ambas'
      ? await Promise.all([compute('damas'), compute('ninos')])
      : [await compute(scope)];

    const block = (d) => `
      <h2>${storeName(d.storeId)}</h2>
      <div class="row"><span>Prendas vendidas</span><span>${d.totalPrendas}</span></div>
      <div class="row"><span>Ingresos</span><span>${fmtMoney(d.totalIngresos)}</span></div>
      ${d.totalDescuentos > 0 ? `<div class="row"><span>Descuentos</span><span>−${fmtMoney(d.totalDescuentos)}</span></div>` : ''}
      ${d.totalDevoluciones > 0 ? `<div class="row"><span>Devoluciones</span><span>−${fmtMoney(d.totalDevoluciones)}</span></div>` : ''}
      <div class="row"><span><b>Ingreso neto</b></span><span><b>${fmtMoney(d.ingresoNeto)}</b></span></div>
      <table>
        <thead><tr><th>Método de pago</th><th class="right">Monto USD</th><th class="right">Equivalente Bs</th></tr></thead>
        <tbody>
          ${PAYMENT_METHODS.map(m => `<tr><td>${m}</td><td class="right">${fmtMoney(d.porMetodo[m])}</td><td class="right">${METHODS_IN_BS.includes(m) ? fmtBs(d.porMetodo[m]) : '—'}</td></tr>`).join('')}
        </tbody>
      </table>`;

    const totalGeneral = datasets.reduce((s, d) => s + d.ingresoNeto, 0);

    // Detalle en orden: ventas y cambios mezclados como ocurrieron en el día,
    // para poder sumar el papel línea por línea.
    const detalle = inSaleOrder(datasets.flatMap(d => [...d.sales, ...d.anuladas]));
    const lineas = [
      ...detalle.map(({ sale: s, seq }) => ({
        date: s.date,
        html: `<tr>
          <td>${seq}</td><td>${fmtTime(s.date)}</td>
          ${datasets.length > 1 ? `<td>${storeName(s.storeId)}</td>` : ''}
          <td>${s.clientName}${s.status === 'anulada' ? ' (ANULADA)' : ''}</td>
          <td>${s.paymentMethod}</td>
          <td class="right">${s.status === 'anulada' ? '—' : fmtMoney(s.total)}</td>
        </tr>`,
      })),
      ...datasets.flatMap(d => d.exchanges).map(x => ({
        date: x.date,
        html: `<tr>
          <td>↔</td><td>${fmtTime(x.date)}</td>
          ${datasets.length > 1 ? `<td>${storeName(x.storeId)}</td>` : ''}
          <td>${x.clientName} — cambio de prenda</td>
          <td>${x.diferencia > 0 ? x.paymentMethod : 'sin cobro'}</td>
          <td class="right">${x.diferencia > 0 ? fmtMoney(x.diferencia) : x.diferencia < 0 ? '(' + fmtMoney(Math.abs(x.diferencia)) + ' a favor)' : '—'}</td>
        </tr>`,
      })),
    ].sort((a, b) => new Date(a.date) - new Date(b.date));

    const listado = lineas.length === 0 ? '' : `
      <h2>Movimientos del período, en orden</h2>
      <table>
        <thead><tr><th>#</th><th>Hora</th>${datasets.length > 1 ? '<th>Tienda</th>' : ''}<th>Cliente</th><th>Pago</th><th class="right">Monto</th></tr></thead>
        <tbody>${lineas.map(l => l.html).join('')}</tbody>
      </table>`;

    printHtml(`Cuadre ${periodo}`, `
      <h1>Geo's Shop — Cuadre de Ventas</h1>
      <p class="muted">${label} · ${periodo} · Tasa usada: Bs ${CURRENT_SETTINGS.rate} por USD</p>
      ${datasets.map(block).join('')}
      ${datasets.length > 1 ? `<h2>Total General</h2><div class="row total"><span>Ingreso neto consolidado</span><span>${fmtMoney(totalGeneral)}</span></div>` : ''}
      ${listado}
      <p class="muted" style="margin-top:24px">Generado el ${fmtDateTime(new Date().toISOString())}</p>`);
  }

  function syncStore() {
    if (scope !== 'ambas') scope = AppState.currentStore;
  }

  return { render, syncStore };
})();
