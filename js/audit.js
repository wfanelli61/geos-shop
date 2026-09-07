// Módulo de Auditoría / Inventario Físico.
// Compara la existencia teórica (Stock Inicial + movimientos − vendidas) contra
// el conteo físico real que se hace en tienda.
//
// Al guardar no se archiva en silencio: primero se muestra una revisión con lo
// que falta contar y las diferencias encontradas. Las auditorías guardadas se
// pueden abrir para revisarlas y corregir el conteo.

const Audit = (() => {
  let counts = {};
  let inventoryCache = [];
  let editingId = null;   // si se está corrigiendo una auditoría ya guardada

  async function render() {
    const root = document.getElementById('view-auditoria');
    const storeId = AppState.currentStore;
    const inventory = await DB.getInventory(storeId);
    inventoryCache = inventory;
    const history = (await DB.getAudits(storeId)).sort((a, b) => new Date(b.date) - new Date(a.date));

    root.innerHTML = `
      <div class="flex flex-col gap-5">
        ${editingId ? `
          <div class="bg-amber-50 border-2 border-amber-200 rounded-2xl px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <p class="text-sm text-amber-800">
              Estás <span class="font-semibold">corrigiendo una auditoría guardada</span>. Al guardar se actualizará esa misma, no se creará una nueva.
            </p>
            <button id="btn-cancel-edit" class="text-sm font-medium text-amber-700 hover:text-amber-900 underline">Cancelar corrección</button>
          </div>` : `
          <div class="bg-brand-50/70 border border-brand-200 rounded-2xl px-5 py-4 flex items-start gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-brand-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
            <p class="text-sm text-slate-600">
              Cuenta las prendas físicas de <span class="font-medium text-slate-800">${storeName(storeId)}</span> y escribe el resultado en
              <span class="font-medium text-slate-800">Conteo Físico</span>. El sistema calcula la diferencia automáticamente.
            </p>
          </div>`}

        <div id="audit-progress"></div>

        <div class="card overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500 thead-row">
                <th class="px-4 py-3 font-medium">Código</th>
                <th class="px-4 py-3 font-medium">Prenda</th>
                <th class="px-4 py-3 font-medium">Talla / Color</th>
                <th class="px-4 py-3 font-medium text-right">Stock Inicial</th>
                <th class="px-4 py-3 font-medium text-right">Vendida</th>
                <th class="px-4 py-3 font-medium text-right">Debe Haber</th>
                <th class="px-4 py-3 font-medium text-right">Conteo Físico</th>
                <th class="px-4 py-3 font-medium text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody id="audit-tbody">
              ${inventory.map(p => `
                <tr data-row="${p.id}">
                  <td class="px-4 py-3 font-mono text-xs text-slate-500">${p.sku}</td>
                  <td class="px-4 py-3 font-medium text-slate-800">${p.name}</td>
                  <td class="px-4 py-3 text-slate-600">${p.size} / ${p.color}</td>
                  <td class="px-4 py-3 text-right text-slate-400">${p.stockInicial}</td>
                  <td class="px-4 py-3 text-right text-slate-400">${p.cantidadVendida}</td>
                  <td class="px-4 py-3 text-right"><span class="bg-brand-50 text-brand-700 font-semibold text-xs px-2.5 py-1 rounded-full">${p.existenciaActual}</span></td>
                  <td class="px-4 py-3 text-right">
                    <input type="number" min="0" data-count="${p.id}" value="${counts[p.id] ?? ''}" placeholder="—" class="w-20 border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-brand-300">
                  </td>
                  <td class="px-4 py-3 text-right font-semibold" data-diff="${p.id}">—</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="flex flex-wrap justify-end gap-2">
          <button id="btn-clear-counts" class="text-sm font-medium text-slate-500 hover:text-slate-700 px-4 py-2.5">Limpiar conteo</button>
          <button id="btn-save-audit" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-5 py-2.5 rounded-xl shadow-sm transition">
            ${editingId ? 'Revisar y Guardar Corrección' : 'Revisar y Guardar'}
          </button>
        </div>

        <div class="card p-5">
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Historial de Auditorías</h3>
          <div id="audit-history" class="flex flex-col gap-2">
            ${history.length === 0 ? '<p class="text-sm text-slate-400">Aún no se han guardado auditorías para esta tienda.</p>' :
              history.map(a => historyRow(a)).join('')}
          </div>
        </div>
      </div>`;

    document.querySelectorAll('[data-count]').forEach(input => {
      input.addEventListener('input', () => {
        const id = input.dataset.count;
        const val = input.value === '' ? null : parseInt(input.value, 10);
        if (val === null || isNaN(val)) delete counts[id];
        else counts[id] = val;
        updateDiff(id);
        renderProgress();
      });
    });

    document.getElementById('btn-save-audit').addEventListener('click', openReview);
    document.getElementById('btn-clear-counts').addEventListener('click', () => {
      counts = {};
      render();
    });
    const cancelEdit = document.getElementById('btn-cancel-edit');
    if (cancelEdit) cancelEdit.addEventListener('click', () => {
      editingId = null;
      counts = {};
      render();
    });

    document.querySelectorAll('[data-audit-view]').forEach(btn =>
      btn.addEventListener('click', () => openAuditDetail(btn.dataset.auditView)));

    // Pintar las diferencias que ya estaban cargadas (al corregir una auditoría).
    Object.keys(counts).forEach(id => updateDiff(id));
    renderProgress();
  }

  function historyRow(a) {
    const faltantes = a.items.filter(i => i.diferencia < 0).length;
    const sobrantes = a.items.filter(i => i.diferencia > 0).length;
    const sinContar = (a.noContadas || []).length;
    return `
      <button data-audit-view="${a.id}" class="w-full text-left border border-brand-100 rounded-xl px-4 py-3 hover:bg-brand-50/60 hover:border-brand-200 transition">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p class="text-sm font-medium text-slate-700">
              ${fmtDateTime(a.date)}
              ${a.editedAt ? '<span class="text-xs text-slate-400 font-normal">· corregida</span>' : ''}
            </p>
            <p class="text-xs text-slate-400">${a.items.length} prenda(s) contada(s)${sinContar > 0 ? ` · ${sinContar} sin contar` : ''}</p>
          </div>
          <div class="flex flex-wrap items-center gap-1.5">
            ${faltantes > 0 ? `<span class="text-xs font-medium bg-rose-50 text-rose-600 px-2 py-1 rounded-full">${faltantes} faltante(s)</span>` : ''}
            ${sobrantes > 0 ? `<span class="text-xs font-medium bg-sky-50 text-sky-700 px-2 py-1 rounded-full">${sobrantes} sobrante(s)</span>` : ''}
            ${a.discrepancies === 0 ? '<span class="text-xs font-medium bg-emerald-50 text-emerald-700 px-2 py-1 rounded-full">Todo cuadró</span>' : ''}
            ${a.ajustado ? '<span class="text-xs font-medium bg-brand-50 text-brand-700 px-2 py-1 rounded-full">Inventario ajustado</span>' : ''}
            <span class="text-xs text-brand-600 font-medium ml-1">Ver →</span>
          </div>
        </div>
      </button>`;
  }

  // ------------------------------------------------------------- Progreso

  function renderProgress() {
    const box = document.getElementById('audit-progress');
    if (!box) return;
    const total = inventoryCache.length;
    const contadas = Object.keys(counts).length;
    const sinContar = inventoryCache.filter(p => counts[p.id] === undefined);
    const pct = total === 0 ? 0 : Math.round((contadas / total) * 100);
    const conDiferencia = inventoryCache.filter(p => counts[p.id] !== undefined && counts[p.id] !== p.existenciaActual).length;

    box.innerHTML = `
      <div class="card p-4 flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span class="text-sm font-semibold text-slate-700">Progreso del conteo</span>
            <span class="text-xs font-semibold px-2 py-1 rounded-full ${contadas === total && total > 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}">
              ${contadas} de ${total}
            </span>
          </div>
          ${conDiferencia > 0 ? `<span class="text-xs font-medium bg-rose-50 text-rose-600 px-2 py-1 rounded-full">${conDiferencia} con diferencia</span>` : ''}
        </div>
        <div class="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div class="h-full rounded-full transition-all ${contadas === total && total > 0 ? 'bg-emerald-500' : 'bg-brand-500'}" style="width: ${pct}%"></div>
        </div>
        ${sinContar.length > 0 ? `
          <div>
            <p class="text-xs font-medium text-slate-500 mb-1.5">Te faltan por contar:</p>
            <div class="flex flex-wrap gap-1.5">
              ${sinContar.slice(0, 12).map(p => `
                <button data-goto="${p.id}" class="text-xs bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-lg transition">
                  ${p.name} <span class="text-amber-600">T${p.size}</span>
                </button>`).join('')}
              ${sinContar.length > 12 ? `<span class="text-xs text-slate-400 px-2 py-1">y ${sinContar.length - 12} más</span>` : ''}
            </div>
          </div>` : '<p class="text-xs text-emerald-700 font-medium">Contaste todas las prendas.</p>'}
      </div>`;

    box.querySelectorAll('[data-goto]').forEach(btn => btn.addEventListener('click', () => {
      const input = document.querySelector(`[data-count="${btn.dataset.goto}"]`);
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input.focus();
    }));
  }

  function updateDiff(productId) {
    const product = inventoryCache.find(p => p.id === productId);
    const cell = document.querySelector(`[data-diff="${productId}"]`);
    if (!product || !cell) return;
    const val = counts[productId];
    if (val === undefined) {
      cell.textContent = '—';
      cell.className = 'px-4 py-3 text-right font-semibold text-slate-300';
      return;
    }
    const diff = val - product.existenciaActual;
    cell.textContent = diff === 0 ? '0' : (diff > 0 ? '+' + diff : diff);
    cell.className = `px-4 py-3 text-right font-semibold ${diff === 0 ? 'text-emerald-600' : diff > 0 ? 'text-sky-600' : 'text-rose-600'}`;
  }

  // -------------------------------------------------- Revisión antes de guardar

  function buildResult() {
    const items = Object.entries(counts).map(([productId, val]) => {
      const p = inventoryCache.find(x => x.id === productId);
      return {
        productId, sku: p.sku, name: p.name, size: p.size, color: p.color,
        teorico: p.existenciaActual, fisico: val, diferencia: val - p.existenciaActual,
      };
    });
    const noContadas = inventoryCache
      .filter(p => counts[p.id] === undefined)
      .map(p => ({ productId: p.id, sku: p.sku, name: p.name, size: p.size, color: p.color, teorico: p.existenciaActual }));

    return {
      items, noContadas,
      faltantes: items.filter(i => i.diferencia < 0),
      sobrantes: items.filter(i => i.diferencia > 0),
      exactas: items.filter(i => i.diferencia === 0),
    };
  }

  function openReview() {
    const r = buildResult();
    if (r.items.length === 0) {
      toast('Ingresa al menos un conteo físico antes de guardar', 'error');
      return;
    }

    const unidadesFaltantes = r.faltantes.reduce((s, i) => s + Math.abs(i.diferencia), 0);
    const unidadesSobrantes = r.sobrantes.reduce((s, i) => s + i.diferencia, 0);

    openModal(`
      <div class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">Revisión de la Auditoría</h3>
          <p class="text-sm text-slate-400">${storeName(AppState.currentStore)} · ${fmtDateTime(new Date().toISOString())}</p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${chip('Contadas', r.items.length, 'slate')}
          ${chip('Cuadran', r.exactas.length, 'emerald')}
          ${chip('Faltan', unidadesFaltantes, 'rose')}
          ${chip('Sobran', unidadesSobrantes, 'sky')}
        </div>

        ${r.noContadas.length > 0 ? `
          <div class="border-2 border-amber-200 bg-amber-50/60 rounded-xl p-4">
            <p class="text-sm font-semibold text-amber-800 mb-1">Te faltan ${r.noContadas.length} prenda(s) por contar</p>
            <p class="text-xs text-amber-700 mb-2">Si guardas así, esas prendas quedarán sin revisar en esta auditoría.</p>
            <div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              ${r.noContadas.map(p => `<span class="text-xs bg-white border border-amber-200 text-amber-800 px-2 py-1 rounded-lg">${p.name} T${p.size}</span>`).join('')}
            </div>
          </div>` : `
          <div class="border-2 border-emerald-200 bg-emerald-50/60 rounded-xl p-3">
            <p class="text-sm font-medium text-emerald-800">Contaste todas las prendas de la tienda.</p>
          </div>`}

        ${r.faltantes.length > 0 ? `
          <div>
            <p class="text-sm font-semibold text-rose-700 mb-2">Faltan en físico (hay menos de lo que dice el sistema)</p>
            <div class="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              ${r.faltantes.map(i => diffRow(i, 'rose')).join('')}
            </div>
          </div>` : ''}

        ${r.sobrantes.length > 0 ? `
          <div>
            <p class="text-sm font-semibold text-sky-700 mb-2">Sobran en físico (hay más de lo que dice el sistema)</p>
            <div class="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
              ${r.sobrantes.map(i => diffRow(i, 'sky')).join('')}
            </div>
          </div>` : ''}

        ${r.faltantes.length + r.sobrantes.length > 0 ? `
          <label class="flex items-start gap-3 border-2 border-brand-200 bg-brand-50/60 rounded-xl p-4 cursor-pointer">
            <input type="checkbox" id="chk-adjust" checked class="mt-0.5 w-4 h-4 accent-brand-600">
            <span class="text-sm">
              <span class="font-medium text-slate-800">Ajustar el inventario al conteo físico</span>
              <span class="block text-xs text-slate-500 mt-0.5">Deja registrado un movimiento de ajuste por cada prenda. Si lo desmarcas, solo se guarda la auditoría y el inventario queda como está.</span>
            </span>
          </label>` : `
          <div class="border-2 border-emerald-200 bg-emerald-50/60 rounded-xl p-3 text-center">
            <p class="text-sm font-semibold text-emerald-800">Todo lo contado cuadra con el sistema.</p>
          </div>`}

        <div class="flex justify-between gap-2 pt-2">
          <button type="button" id="btn-back-audit" class="px-4 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-700">← Seguir contando</button>
          <button type="button" id="btn-confirm-audit" class="px-6 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">
            ${editingId ? 'Guardar corrección' : 'Guardar auditoría'}
          </button>
        </div>
      </div>`);

    document.getElementById('btn-back-audit').addEventListener('click', closeModal);
    document.getElementById('btn-confirm-audit').addEventListener('click', () => {
      const chk = document.getElementById('chk-adjust');
      saveAudit(r, chk ? chk.checked : false);
    });
  }

  function chip(label, value, color) {
    const map = {
      slate: 'bg-slate-50 border-slate-200 text-slate-700',
      emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      rose: 'bg-rose-50 border-rose-200 text-rose-700',
      sky: 'bg-sky-50 border-sky-200 text-sky-700',
    };
    return `
      <div class="border-2 rounded-xl p-2.5 text-center ${map[color]}">
        <p class="text-xl font-bold">${value}</p>
        <p class="text-xs font-medium">${label}</p>
      </div>`;
  }

  function diffRow(i, color) {
    // Las auditorías guardadas antes de registrar talla y color solo tienen
    // el código, así que armamos la descripción con lo que haya.
    const detalle = [i.sku, i.size ? 'Talla ' + i.size : null, i.color].filter(Boolean).join(' · ');
    return `
      <div class="flex items-center justify-between gap-2 border border-${color}-100 bg-${color}-50/50 rounded-lg px-3 py-2">
        <div class="text-sm min-w-0">
          <p class="font-medium text-slate-800 truncate">${i.name}</p>
          <p class="text-xs text-slate-500">${detalle}</p>
        </div>
        <div class="text-right shrink-0 text-xs">
          <p class="text-slate-500">sistema ${i.teorico} · físico ${i.fisico}</p>
          <p class="font-bold text-${color}-600 text-sm">${i.diferencia > 0 ? '+' : ''}${i.diferencia}</p>
        </div>
      </div>`;
  }

  async function saveAudit(r, ajustar) {
    const storeId = AppState.currentStore;
    const discrepantes = [...r.faltantes, ...r.sobrantes];

    if (ajustar) {
      for (const i of discrepantes) {
        await DB.addMovement({
          storeId, productId: i.productId, sku: i.sku, name: i.name,
          type: i.diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo',
          qty: Math.abs(i.diferencia),
          note: `Ajuste por auditoría (sistema ${i.teorico} → físico ${i.fisico})`,
        });
      }
    }

    const payload = {
      storeId, items: r.items, noContadas: r.noContadas,
      discrepancies: discrepantes.length, ajustado: ajustar,
    };

    if (editingId) {
      await DB.updateAudit(editingId, payload);
      editingId = null;
      toast('Auditoría corregida');
    } else {
      await DB.saveAudit(payload);
      toast(discrepantes.length === 0
        ? 'Auditoría guardada — todo cuadró'
        : ajustar
          ? `Inventario ajustado: ${discrepantes.length} prenda(s) corregida(s)`
          : `Auditoría guardada con ${discrepantes.length} diferencia(s) sin ajustar`);
    }

    counts = {};
    closeModal();
    render();
  }

  // ------------------------------------------------ Revisar una guardada

  async function openAuditDetail(auditId) {
    const a = await DB.getAudit(auditId);
    const faltantes = a.items.filter(i => i.diferencia < 0);
    const sobrantes = a.items.filter(i => i.diferencia > 0);
    const exactas = a.items.filter(i => i.diferencia === 0);
    const sinContar = a.noContadas || [];

    openModal(`
      <div class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">Auditoría del ${fmtDateTime(a.date)}</h3>
          <p class="text-sm text-slate-400">
            ${storeName(a.storeId)}
            ${a.editedAt ? ` · corregida el ${fmtDateTime(a.editedAt)}` : ''}
            ${a.ajustado ? ' · inventario ajustado' : ''}
          </p>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          ${chip('Contadas', a.items.length, 'slate')}
          ${chip('Cuadran', exactas.length, 'emerald')}
          ${chip('Faltan', faltantes.reduce((s, i) => s + Math.abs(i.diferencia), 0), 'rose')}
          ${chip('Sobran', sobrantes.reduce((s, i) => s + i.diferencia, 0), 'sky')}
        </div>

        <div class="max-h-[45vh] overflow-y-auto flex flex-col gap-4 -mx-1 px-1">
          ${faltantes.length > 0 ? `
            <div>
              <p class="text-sm font-semibold text-rose-700 mb-2">Faltaban en físico</p>
              <div class="flex flex-col gap-1.5">${faltantes.map(i => diffRow(i, 'rose')).join('')}</div>
            </div>` : ''}

          ${sobrantes.length > 0 ? `
            <div>
              <p class="text-sm font-semibold text-sky-700 mb-2">Sobraban en físico</p>
              <div class="flex flex-col gap-1.5">${sobrantes.map(i => diffRow(i, 'sky')).join('')}</div>
            </div>` : ''}

          ${sinContar.length > 0 ? `
            <div>
              <p class="text-sm font-semibold text-amber-700 mb-2">Quedaron sin contar (${sinContar.length})</p>
              <div class="flex flex-wrap gap-1.5">
                ${sinContar.map(p => `<span class="text-xs bg-amber-50 border border-amber-200 text-amber-800 px-2 py-1 rounded-lg">${p.name} T${p.size}</span>`).join('')}
              </div>
            </div>` : ''}

          ${exactas.length > 0 ? `
            <div>
              <p class="text-sm font-semibold text-emerald-700 mb-2">Cuadraron exacto (${exactas.length})</p>
              <div class="flex flex-wrap gap-1.5">
                ${exactas.map(i => `<span class="text-xs bg-emerald-50 border border-emerald-200 text-emerald-800 px-2 py-1 rounded-lg">${i.name}${i.size ? ' T' + i.size : ''} · ${i.fisico}</span>`).join('')}
              </div>
            </div>` : ''}
        </div>

        <div class="flex flex-wrap justify-between gap-2 pt-2 border-t border-brand-50">
          <button type="button" id="btn-print-audit" class="text-sm font-medium text-slate-500 hover:text-slate-700 px-3 py-2.5">Imprimir</button>
          <div class="flex gap-2">
            <button type="button" id="btn-edit-audit" class="border-2 border-brand-200 text-brand-700 hover:bg-brand-50 text-sm font-medium px-4 py-2.5 rounded-xl transition">Corregir conteo</button>
            <button type="button" id="btn-close-audit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Cerrar</button>
          </div>
        </div>
      </div>`);

    document.getElementById('btn-close-audit').addEventListener('click', closeModal);
    document.getElementById('btn-print-audit').addEventListener('click', () => printAudit(a));
    document.getElementById('btn-edit-audit').addEventListener('click', () => {
      // Cargamos el conteo guardado en la tabla para poder corregirlo.
      counts = {};
      a.items.forEach(i => counts[i.productId] = i.fisico);
      editingId = a.id;
      closeModal();
      render();
      toast('Corrige el conteo y vuelve a guardar', 'info');
    });
  }

  function printAudit(a) {
    const faltantes = a.items.filter(i => i.diferencia < 0);
    const sobrantes = a.items.filter(i => i.diferencia > 0);
    printHtml(`Auditoría ${fmtDate(a.date)}`, `
      <h1>Geo's Shop — Auditoría de Inventario</h1>
      <p class="muted">${storeName(a.storeId)} · ${fmtDateTime(a.date)}${a.ajustado ? ' · inventario ajustado' : ''}</p>
      <div class="row"><span>Prendas contadas</span><span>${a.items.length}</span></div>
      <div class="row"><span>Unidades faltantes</span><span>${faltantes.reduce((s, i) => s + Math.abs(i.diferencia), 0)}</span></div>
      <div class="row"><span>Unidades sobrantes</span><span>${sobrantes.reduce((s, i) => s + i.diferencia, 0)}</span></div>
      <div class="row"><span>Sin contar</span><span>${(a.noContadas || []).length}</span></div>
      <h2>Detalle del conteo</h2>
      <table>
        <thead><tr><th>Código</th><th>Prenda</th><th>Talla</th><th class="right">Sistema</th><th class="right">Físico</th><th class="right">Diferencia</th></tr></thead>
        <tbody>
          ${a.items.map(i => `<tr><td>${i.sku}</td><td>${i.name}</td><td>${i.size || ''}</td><td class="right">${i.teorico}</td><td class="right">${i.fisico}</td><td class="right">${i.diferencia > 0 ? '+' : ''}${i.diferencia}</td></tr>`).join('')}
        </tbody>
      </table>
      ${(a.noContadas || []).length > 0 ? `
        <h2>Prendas sin contar</h2>
        <table>
          <thead><tr><th>Código</th><th>Prenda</th><th>Talla</th><th class="right">Debería haber</th></tr></thead>
          <tbody>${a.noContadas.map(p => `<tr><td>${p.sku}</td><td>${p.name}</td><td>${p.size}</td><td class="right">${p.teorico}</td></tr>`).join('')}</tbody>
        </table>` : ''}`);
  }

  function syncStore() {
    // Al cambiar de tienda el conteo empieza de cero.
    counts = {};
    editingId = null;
  }

  return { render, syncStore };
})();
