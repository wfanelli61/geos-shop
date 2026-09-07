// Módulo de Registro de Ventas Diarias, como asistente guiado en 4 pasos:
// 1. Cliente → 2. Prendas → 3. Pago → 4. Confirmación.
//
// El paso 2 está pensado para el mostrador: se escribe el código, Enter agrega,
// el buscador se limpia solo y queda listo para la siguiente prenda.

const Sales = (() => {
  const STEPS = ['Cliente', 'Prendas', 'Pago', 'Confirmar'];
  let step = 1;
  let clientName = '';
  let clientPhone = '';
  let clientCedula = '';
  let clientAddress = '';
  let paymentMethod = PAYMENT_METHODS[0];
  let discount = 0;
  let clientCredit = 0;      // saldo a favor de la clienta por cambios anteriores
  let creditApplied = 0;     // cuánto de ese saldo se usa en esta venta
  let cart = [];
  let searchTerm = '';
  let justCompleted = null;
  let inventoryCache = [];

  function resetWizard() {
    step = 1;
    clientName = '';
    clientPhone = '';
    clientCedula = '';
    clientAddress = '';
    paymentMethod = PAYMENT_METHODS[0];
    discount = 0;
    clientCredit = 0;
    creditApplied = 0;
    cart = [];
    searchTerm = '';
    justCompleted = null;
  }

  function subtotal() {
    return +cart.reduce((s, i) => s + i.qty * i.price, 0).toFixed(2);
  }

  function total() {
    return +Math.max(0, subtotal() - discount - creditApplied).toFixed(2);
  }

  function itemCount() {
    return cart.reduce((s, i) => s + i.qty, 0);
  }

  async function render() {
    const root = document.getElementById('view-venta');

    if (justCompleted) {
      root.innerHTML = renderSuccess(justCompleted);
      document.getElementById('btn-new-sale-again').addEventListener('click', () => {
        resetWizard();
        render();
      });
      document.getElementById('btn-print-receipt').addEventListener('click', () => printReceipt(justCompleted));
      const wa = document.getElementById('btn-whatsapp-receipt');
      if (wa) wa.addEventListener('click', () => window.open(wa.dataset.href, '_blank'));
      return;
    }

    inventoryCache = await DB.getInventory(AppState.currentStore);

    root.innerHTML = `
      <div class="max-w-3xl mx-auto flex flex-col gap-6">
        ${renderStepper()}
        <div class="card p-6">
          ${step === 1 ? renderStep1() : step === 2 ? renderStep2() : step === 3 ? renderStep3() : renderStep4()}
        </div>
      </div>`;

    wireStep();
  }

  function renderStepper() {
    return `
      <div class="flex items-center">
        ${STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return `
          <div class="flex items-center ${i < STEPS.length - 1 ? 'flex-1' : ''}">
            <div class="flex items-center gap-2">
              <div class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 ${done ? 'bg-brand-600 text-white' : active ? 'bg-brand-100 text-brand-700 ring-2 ring-brand-500' : 'bg-slate-100 text-slate-400'}">
                ${done ? '✓' : n}
              </div>
              <span class="text-sm font-medium hidden sm:inline ${active ? 'text-slate-800' : 'text-slate-400'}">${label}</span>
            </div>
            ${i < STEPS.length - 1 ? `<div class="flex-1 h-px mx-3 ${done ? 'bg-brand-400' : 'bg-slate-200'}"></div>` : ''}
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderStep1() {
    return `
      <h3 class="text-base font-semibold text-slate-800 mb-1">Datos del Cliente</h3>
      <p class="text-sm text-slate-400 mb-5">¿A quién le estamos vendiendo hoy? Los datos quedan guardados en su ficha.</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label class="text-xs font-medium text-slate-500">Nombre Completo</label>
          <input id="client-name" type="text" value="${clientName}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Maria Gonzalez">
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Teléfono</label>
          <input id="client-phone" type="text" value="${clientPhone}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. 0414-1234567">
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Cédula <span class="text-slate-300">(opcional)</span></label>
          <input id="client-cedula" type="text" value="${clientCedula}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. V-18.456.789">
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Dirección <span class="text-slate-300">(opcional)</span></label>
          <input id="client-address" type="text" value="${clientAddress}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. Av. Bolívar, Res. El Parque, Apto 4B">
        </div>
      </div>
      <div id="client-suggestions" class="mt-3 flex flex-col gap-1"></div>
      <div class="flex justify-end mt-6">
        <button id="btn-next" class="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2.5 rounded-xl shadow-sm transition">Siguiente →</button>
      </div>`;
  }

  function renderStep2() {
    return `
      <div class="flex items-start justify-between gap-3 mb-1">
        <div>
          <h3 class="text-base font-semibold text-slate-800">Selecciona las Prendas</h3>
          <p class="text-sm text-slate-400">Agrega <span class="font-medium text-slate-600">todas</span> las prendas que lleve la clienta. Escribe el código y presiona Enter.</p>
        </div>
        <span id="cart-count" class="shrink-0 bg-brand-50 text-brand-700 text-sm font-semibold px-3 py-1.5 rounded-full">${itemCount()} prenda(s)</span>
      </div>

      <div class="relative mt-4">
        <input id="product-search" type="text" autocomplete="off" class="w-full border-2 border-brand-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" placeholder="Buscar por código o nombre (ej. DAM-001 o Blusa)...">
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-300 hidden sm:block">Enter para agregar</span>
      </div>
      <div id="search-results" class="mt-2 max-h-56 overflow-y-auto flex flex-col gap-1"></div>

      <div class="mt-5 border-t border-brand-50 pt-4">
        <h4 class="text-sm font-semibold text-slate-700 mb-2">Carrito</h4>
        <div id="cart-items" class="flex flex-col gap-2 max-h-64 overflow-y-auto"></div>
        <div id="cart-empty" class="hidden text-center text-slate-400 text-sm py-6">Aún no has agregado prendas.</div>
        <div class="border-t border-brand-50 mt-3 pt-3 flex justify-between items-center">
          <span class="text-sm text-slate-500">Total</span>
          <div class="text-right">
            <div id="cart-total" class="text-xl font-bold text-slate-800">$0.00</div>
            <div id="cart-total-bs" class="text-xs text-slate-400"></div>
          </div>
        </div>
      </div>

      <div class="flex justify-between mt-6">
        <button id="btn-back" class="text-slate-500 hover:text-slate-700 font-medium px-4 py-2.5">← Atrás</button>
        <button id="btn-next" class="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2.5 rounded-xl shadow-sm transition disabled:opacity-40 disabled:cursor-not-allowed" ${cart.length === 0 ? 'disabled' : ''}>Siguiente →</button>
      </div>`;
  }

  function renderStep3() {
    const icons = {
      'Pago Móvil': '<rect x="5" y="2" width="14" height="20" rx="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line>',
      'Efectivo': '<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="3"></circle>',
      'Punto de Venta': '<rect x="1" y="4" width="22" height="16" rx="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line>',
      'Divisas': '<circle cx="12" cy="12" r="10"></circle><path d="M12 6v12M9 9h4.5a2.5 2.5 0 0 1 0 5H8.5"></path>',
    };
    const enBs = METHODS_IN_BS.includes(paymentMethod);
    return `
      <h3 class="text-base font-semibold text-slate-800 mb-1">Método de Pago</h3>
      <p class="text-sm text-slate-400 mb-5">Subtotal: <span class="font-semibold text-slate-700">${fmtMoney(subtotal())}</span></p>
      <div class="grid grid-cols-2 gap-3">
        ${PAYMENT_METHODS.map(m => `
          <button data-method="${m}" class="method-card flex flex-col items-center gap-2 border-2 rounded-xl py-4 px-3 transition ${paymentMethod === m ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-100 text-slate-500 hover:border-brand-200'}">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icons[m]}</svg>
            <span class="text-sm font-medium">${m}</span>
          </button>`).join('')}
      </div>

      ${clientCredit > 0 ? `
        <div class="mt-4 border-2 rounded-xl p-4 transition ${creditApplied > 0 ? 'border-emerald-300 bg-emerald-50/60' : 'border-amber-200 bg-amber-50/50'}">
          <label class="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" id="use-credit" ${creditApplied > 0 ? 'checked' : ''} class="mt-0.5 w-4 h-4 accent-emerald-600">
            <span class="text-sm">
              <span class="font-medium text-slate-800">Usar saldo a favor de ${fmtMoney(clientCredit)}</span>
              <span class="block text-xs text-slate-500 mt-0.5">
                Le quedó a favor de un cambio anterior. Se descuenta de esta compra${clientCredit > subtotal() ? ` (se usan ${fmtMoney(Math.min(clientCredit, subtotal()))} y le quedan ${fmtMoney(clientCredit - Math.min(clientCredit, subtotal()))})` : ''}.
              </span>
            </span>
          </label>
        </div>` : ''}

      <div class="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
        <div>
          <label class="text-xs font-medium text-slate-500">Descuento (USD)</label>
          <input id="discount-input" type="number" min="0" step="0.01" value="${discount || ''}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="0.00">
          <p class="text-xs text-slate-400 mt-1">Déjalo vacío si no hay rebaja.</p>
        </div>
        <div class="bg-brand-50/60 rounded-xl p-4">
          <div class="flex justify-between text-sm"><span class="text-slate-500">Subtotal</span><span class="text-slate-700">${fmtMoney(subtotal())}</span></div>
          <div class="flex justify-between text-sm"><span class="text-slate-500">Descuento</span><span id="sum-discount" class="text-rose-600">−${fmtMoney(discount)}</span></div>
          ${creditApplied > 0 ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Saldo a favor</span><span class="text-emerald-700">−${fmtMoney(creditApplied)}</span></div>` : ''}
          <div class="flex justify-between items-baseline mt-1 pt-2 border-t border-brand-100">
            <span class="text-sm font-medium text-slate-600">Total</span>
            <div class="text-right">
              <div id="sum-total" class="text-xl font-bold text-brand-700">${fmtMoney(total())}</div>
              <div id="sum-total-bs" class="text-xs text-slate-500">${enBs ? fmtBs(total()) + ' a cobrar' : ''}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="flex justify-between mt-6">
        <button id="btn-back" class="text-slate-500 hover:text-slate-700 font-medium px-4 py-2.5">← Atrás</button>
        <button id="btn-next" class="bg-brand-600 hover:bg-brand-700 text-white font-medium px-6 py-2.5 rounded-xl shadow-sm transition">Siguiente →</button>
      </div>`;
  }

  function renderStep4() {
    const enBs = METHODS_IN_BS.includes(paymentMethod);
    return `
      <h3 class="text-base font-semibold text-slate-800 mb-1">Confirmar Venta</h3>
      <p class="text-sm text-slate-400 mb-5">Revisa los datos antes de registrar la venta.</p>

      <div class="bg-brand-50/60 rounded-xl p-4 flex flex-col gap-1 mb-4">
        <div class="flex justify-between text-sm"><span class="text-slate-500">Cliente</span><span class="font-medium text-slate-800">${clientName}</span></div>
        <div class="flex justify-between text-sm"><span class="text-slate-500">Teléfono</span><span class="font-medium text-slate-800">${clientPhone}</span></div>
        ${clientCedula ? `<div class="flex justify-between text-sm"><span class="text-slate-500">Cédula</span><span class="font-medium text-slate-800">${clientCedula}</span></div>` : ''}
        ${clientAddress ? `<div class="flex justify-between text-sm gap-4"><span class="text-slate-500 shrink-0">Dirección</span><span class="font-medium text-slate-800 text-right">${clientAddress}</span></div>` : ''}
        <div class="flex justify-between text-sm"><span class="text-slate-500">Método de Pago</span><span class="font-medium text-slate-800">${paymentMethod}</span></div>
        <div class="flex justify-between text-sm"><span class="text-slate-500">Tienda</span><span class="font-medium text-slate-800">${storeName(AppState.currentStore)}</span></div>
      </div>

      <div class="flex flex-col divide-y divide-brand-50 border border-brand-50 rounded-xl px-4 mb-4">
        ${cart.map(item => `
          <div class="flex justify-between items-center py-2.5 text-sm">
            <div>
              <p class="font-medium text-slate-800">${item.name} <span class="text-slate-400 font-normal">x${item.qty}</span></p>
              <p class="text-xs text-slate-400">${item.sku} · Talla ${item.size} · ${item.color}</p>
            </div>
            <span class="font-semibold text-slate-700">${fmtMoney(item.qty * item.price)}</span>
          </div>`).join('')}
      </div>

      <div class="px-1 mb-6">
        <div class="flex justify-between text-sm py-1"><span class="text-slate-500">Subtotal</span><span class="text-slate-700">${fmtMoney(subtotal())}</span></div>
        ${discount > 0 ? `<div class="flex justify-between text-sm py-1"><span class="text-slate-500">Descuento</span><span class="text-rose-600">−${fmtMoney(discount)}</span></div>` : ''}
        <div class="flex justify-between items-baseline pt-2 border-t border-brand-100 mt-1">
          <span class="text-sm font-medium text-slate-600">Total</span>
          <div class="text-right">
            <div class="text-2xl font-bold text-brand-700">${fmtMoney(total())}</div>
            ${enBs ? `<div class="text-xs text-slate-500">${fmtBs(total())} · tasa ${CURRENT_SETTINGS.rate}</div>` : ''}
          </div>
        </div>
      </div>

      <div class="flex justify-between">
        <button id="btn-back" class="text-slate-500 hover:text-slate-700 font-medium px-4 py-2.5">← Atrás</button>
        <button id="btn-confirm-sale" class="bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-sm transition">Confirmar Venta</button>
      </div>`;
  }

  function renderSuccess(sale) {
    const wa = whatsappLink(sale.clientPhone, `¡Hola ${sale.clientName}! Gracias por tu compra en Geo's Shop. Total: ${fmtMoney(sale.total)}.`);
    return `
      <div class="max-w-md mx-auto card p-8 flex flex-col items-center text-center gap-3 mt-6">
        <div class="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>
        </div>
        <h3 class="text-lg font-semibold text-slate-800">¡Venta registrada!</h3>
        <p class="text-sm text-slate-500">Se vendieron ${sale.items.reduce((a, i) => a + i.qty, 0)} prenda(s) a ${sale.clientName} por un total de <span class="font-semibold text-brand-700">${fmtMoney(sale.total)}</span>.</p>
        <div class="flex flex-wrap items-center justify-center gap-2 mt-3">
          <button id="btn-print-receipt" class="border border-brand-200 text-brand-700 hover:bg-brand-50 font-medium px-4 py-2.5 rounded-xl transition text-sm">Imprimir recibo</button>
          ${wa ? `<button id="btn-whatsapp-receipt" data-href="${wa}" class="border border-emerald-200 text-emerald-700 hover:bg-emerald-50 font-medium px-4 py-2.5 rounded-xl transition text-sm">Enviar por WhatsApp</button>` : ''}
          <button id="btn-new-sale-again" class="bg-brand-600 hover:bg-brand-700 text-white font-medium px-4 py-2.5 rounded-xl shadow-sm transition text-sm">Otra Venta</button>
        </div>
      </div>`;
  }

  function printReceipt(sale) {
    const enBs = METHODS_IN_BS.includes(sale.paymentMethod);
    printHtml(`Recibo ${sale.id}`, `
      <h1>Geo's Shop</h1>
      <p class="muted">${storeName(sale.storeId)} · ${fmtDateTime(sale.date)}</p>
      <h2>Cliente</h2>
      <div class="row"><span>${sale.clientName}</span><span>${sale.clientPhone}</span></div>
      ${sale.clientCedula ? `<div class="row"><span>Cédula</span><span>${sale.clientCedula}</span></div>` : ''}
      ${sale.clientAddress ? `<div class="row"><span>Dirección</span><span>${sale.clientAddress}</span></div>` : ''}
      <h2>Prendas</h2>
      <table>
        <thead><tr><th>Código</th><th>Prenda</th><th>Talla</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Subtotal</th></tr></thead>
        <tbody>
          ${sale.items.map(i => `<tr><td>${i.sku}</td><td>${i.name} (${i.color})</td><td>${i.size}</td><td class="right">${i.qty}</td><td class="right">${fmtMoney(i.price)}</td><td class="right">${fmtMoney(i.price * i.qty)}</td></tr>`).join('')}
        </tbody>
      </table>
      <h2>Total</h2>
      <div class="row"><span>Subtotal</span><span>${fmtMoney(sale.subtotal)}</span></div>
      ${sale.discount > 0 ? `<div class="row"><span>Descuento</span><span>−${fmtMoney(sale.discount)}</span></div>` : ''}
      <div class="row"><span>Método de pago</span><span>${sale.paymentMethod}</span></div>
      <div class="row total"><span>Total</span><span>${fmtMoney(sale.total)}</span></div>
      ${enBs && sale.rate ? `<p class="muted">Equivalente: Bs ${(sale.total * sale.rate).toLocaleString('es-VE', { minimumFractionDigits: 2 })} (tasa ${sale.rate})</p>` : ''}
      <p class="muted" style="margin-top:24px">¡Gracias por tu compra! Ser tú, siempre combina con todo.</p>`);
  }

  function wireStep() {
    if (step === 1) {
      const nameInput = document.getElementById('client-name');
      const phoneInput = document.getElementById('client-phone');
      const cedulaInput = document.getElementById('client-cedula');
      const addressInput = document.getElementById('client-address');
      nameInput.addEventListener('input', (e) => { clientName = e.target.value; suggestClients(); });
      phoneInput.addEventListener('input', (e) => { clientPhone = e.target.value; suggestClients(); });
      cedulaInput.addEventListener('input', (e) => { clientCedula = e.target.value; suggestClients(); });
      addressInput.addEventListener('input', (e) => { clientAddress = e.target.value; });
      const goNext = async () => {
        if (!clientName.trim() || !clientPhone.trim()) {
          toast('Ingresa el nombre y teléfono del cliente', 'error');
          return;
        }
        // Si tiene saldo de un cambio anterior, lo traemos para poder usarlo.
        clientCredit = await DB.getClientCredit({
          clientName: clientName.trim(), clientPhone: clientPhone.trim(), clientCedula: clientCedula.trim(),
        });
        if (clientCredit > 0) toast(`${clientName.trim()} tiene ${fmtMoney(clientCredit)} a favor`, 'info');
        step = 2;
        render();
      };
      document.getElementById('btn-next').addEventListener('click', goNext);
      [nameInput, phoneInput, cedulaInput, addressInput].forEach(inp => inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); goNext(); }
      }));
      suggestClients();
    } else if (step === 2) {
      const search = document.getElementById('product-search');
      search.addEventListener('input', (e) => {
        searchTerm = e.target.value;
        renderSearchResults();
      });
      search.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const first = document.querySelector('#search-results [data-add]:not([disabled])');
          if (first) addToCart(first.dataset.add);
        }
      });
      document.getElementById('btn-back').addEventListener('click', () => { step = 1; render(); });
      document.getElementById('btn-next').addEventListener('click', () => {
        if (cart.length === 0) { toast('Agrega al menos una prenda al carrito', 'error'); return; }
        step = 3;
        render();
      });
      renderCart();
      renderSearchResults();
      search.focus();
    } else if (step === 3) {
      document.querySelectorAll('.method-card').forEach(btn => btn.addEventListener('click', () => {
        paymentMethod = btn.dataset.method;
        render();
      }));
      const creditBox = document.getElementById('use-credit');
      if (creditBox) creditBox.addEventListener('change', (e) => {
        creditApplied = e.target.checked ? Math.min(clientCredit, subtotal() - discount) : 0;
        render();
      });
      document.getElementById('discount-input').addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        discount = isNaN(val) || val < 0 ? 0 : Math.min(val, subtotal());
        document.getElementById('sum-discount').textContent = '−' + fmtMoney(discount);
        document.getElementById('sum-total').textContent = fmtMoney(total());
        const bsEl = document.getElementById('sum-total-bs');
        if (METHODS_IN_BS.includes(paymentMethod)) bsEl.textContent = fmtBs(total()) + ' a cobrar';
      });
      document.getElementById('btn-back').addEventListener('click', () => { step = 2; render(); });
      document.getElementById('btn-next').addEventListener('click', () => { step = 4; render(); });
    } else if (step === 4) {
      document.getElementById('btn-back').addEventListener('click', () => { step = 3; render(); });
      document.getElementById('btn-confirm-sale').addEventListener('click', confirmSale);
    }
  }

  // Sugiere clientes ya registrados para no volver a teclear sus datos.
  async function suggestClients() {
    const container = document.getElementById('client-suggestions');
    if (!container) return;
    const term = (clientName + ' ' + clientPhone).trim().toLowerCase();
    if (term.length < 3) { container.innerHTML = ''; return; }

    const clients = await DB.getClients();
    const name = clientName.trim().toLowerCase();
    const phone = clientPhone.trim();
    const cedula = clientCedula.trim();
    const matches = clients.filter(c =>
      (name && c.name.toLowerCase().includes(name)) ||
      (phone && (c.phone || '').includes(phone)) ||
      (cedula && (c.cedula || '').includes(cedula))
    ).slice(0, 3);

    if (matches.length === 0) { container.innerHTML = ''; return; }
    container.innerHTML = `
      <p class="text-xs text-slate-400">Clientes registrados — toca para autocompletar:</p>
      ${matches.map((c, idx) => `
        <button data-client-idx="${idx}" class="text-left text-sm px-3 py-2 rounded-lg border border-brand-100 hover:bg-brand-50 transition flex justify-between gap-3">
          <span class="min-w-0">
            <span class="font-medium text-slate-700">${c.name}</span>
            ${c.cedula ? `<span class="text-xs text-slate-400 ml-1">${c.cedula}</span>` : ''}
            ${c.address ? `<span class="block text-xs text-slate-400 truncate">${c.address}</span>` : ''}
          </span>
          <span class="text-slate-400 shrink-0">${c.phone} · ${c.compras} compra(s)</span>
        </button>`).join('')}`;

    container.querySelectorAll('[data-client-idx]').forEach(btn => btn.addEventListener('click', () => {
      const c = matches[parseInt(btn.dataset.clientIdx, 10)];
      clientName = c.name || '';
      clientPhone = c.phone || '';
      clientCedula = c.cedula || '';
      clientAddress = c.address || '';
      document.getElementById('client-name').value = clientName;
      document.getElementById('client-phone').value = clientPhone;
      document.getElementById('client-cedula').value = clientCedula;
      document.getElementById('client-address').value = clientAddress;
      container.innerHTML = '';
    }));
  }

  // Los resultados se agrupan por prenda y color, y las tallas se muestran
  // como botones: así se elige la talla que se lleva la clienta de un toque.
  function renderSearchResults() {
    const container = document.getElementById('search-results');
    const term = searchTerm.trim().toLowerCase();
    if (!term) { container.innerHTML = ''; return; }

    const matches = inventoryCache.filter(p =>
      p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
    );

    if (matches.length === 0) {
      container.innerHTML = `<div class="text-sm text-slate-400 py-2">No se encontraron prendas.</div>`;
      return;
    }

    const groups = {};
    matches.forEach(p => {
      const key = `${p.name.toLowerCase()}|${p.color.toLowerCase()}`;
      if (!groups[key]) groups[key] = { name: p.name, color: p.color, brand: p.brand, price: p.price, variants: [] };
      // La foto sale de la primera talla que la tenga: es la misma prenda.
      if (!groups[key].photo && p.photo) groups[key].photo = p.photo;
      if (!groups[key].brand && p.brand) groups[key].brand = p.brand;
      groups[key].variants.push(p);
    });

    container.innerHTML = Object.values(groups).slice(0, 6).map(g => {
      g.variants.sort((a, b) => a.size.localeCompare(b.size, 'es', { numeric: true }));
      return `
      <div class="border border-slate-100 rounded-lg px-3 py-2.5">
        <div class="flex items-center justify-between gap-2">
          <span class="flex items-center gap-2.5 text-sm min-w-0">
            ${Photos.thumb(g)}
            <span class="min-w-0">
              <span class="font-medium text-slate-800">${g.name}</span>
              <span class="text-slate-500 ml-1">· ${g.color}</span>
              ${g.brand ? `<span class="block text-xs text-slate-400">${Photos.escapeAttr(g.brand)}</span>` : ''}
            </span>
          </span>
          <span class="font-semibold text-brand-700 text-sm shrink-0">${fmtMoney(g.price)}</span>
        </div>
        <div class="flex flex-wrap items-center gap-1.5 mt-2">
          <span class="text-xs text-slate-400 mr-1">Talla:</span>
          ${g.variants.map(p => {
            const enCarrito = cart.find(i => i.productId === p.id);
            const restante = p.disponible - (enCarrito ? enCarrito.qty : 0);
            const disabled = restante <= 0;
            return `
            <button data-add="${p.id}" ${disabled ? 'disabled' : ''} title="${p.sku} · quedan ${restante}"
              class="px-2.5 py-1.5 rounded-lg border text-sm font-medium transition ${disabled
                ? 'border-slate-100 text-slate-300 line-through cursor-not-allowed'
                : 'border-brand-200 text-slate-700 hover:bg-brand-600 hover:text-white hover:border-brand-600'}">
              ${p.size}
              <span class="text-[10px] ${disabled ? '' : 'text-slate-400'}">${disabled ? '' : '(' + restante + ')'}</span>
              ${enCarrito ? `<span class="text-[10px] text-brand-600 font-semibold">·${enCarrito.qty}</span>` : ''}
            </button>`;
          }).join('')}
        </div>
      </div>`;
    }).join('');

    Photos.wireThumbs(container);
    container.querySelectorAll('[data-add]').forEach(btn => btn.addEventListener('click', () => addToCart(btn.dataset.add)));
  }

  function addToCart(productId) {
    const product = inventoryCache.find(p => p.id === productId);
    if (!product) return;
    const inCart = cart.find(i => i.productId === productId);
    const alreadyQty = inCart ? inCart.qty : 0;
    if (alreadyQty + 1 > product.disponible) {
      toast(`Solo quedan ${product.disponible} unidades disponibles de ${product.name}`, 'error');
      return;
    }
    if (inCart) {
      inCart.qty += 1;
    } else {
      // `photo` y `brand` acompañan al carrito solo para mostrarlos en pantalla:
    // al guardar la venta se copian únicamente los campos del mapeo de abajo,
    // así las ventas no cargan con las imágenes.
    cart.push({ productId, sku: product.sku, name: product.name, size: product.size, color: product.color, brand: product.brand, photo: product.photo, price: product.price, qty: 1, maxQty: product.disponible });
    }

    // Limpiar el buscador y devolver el foco: así se puede seguir agregando
    // prendas seguidas sin tocar el mouse.
    searchTerm = '';
    const search = document.getElementById('product-search');
    if (search) { search.value = ''; search.focus(); }
    renderSearchResults();
    renderCart();
    toast(`${product.name} talla ${product.size} agregada`);
  }

  function changeQty(productId, delta) {
    const item = cart.find(i => i.productId === productId);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      cart = cart.filter(i => i.productId !== productId);
    } else if (newQty > item.maxQty) {
      toast(`Solo quedan ${item.maxQty} unidades disponibles`, 'error');
      return;
    } else {
      item.qty = newQty;
    }
    renderCart();
    renderSearchResults();
  }

  function removeFromCart(productId) {
    cart = cart.filter(i => i.productId !== productId);
    renderCart();
    renderSearchResults();
  }

  function renderCart() {
    const container = document.getElementById('cart-items');
    const empty = document.getElementById('cart-empty');
    const totalEl = document.getElementById('cart-total');
    const totalBsEl = document.getElementById('cart-total-bs');
    const countEl = document.getElementById('cart-count');
    const nextBtn = document.getElementById('btn-next');
    if (!container) return;

    if (countEl) countEl.textContent = `${itemCount()} prenda(s)`;
    if (nextBtn) nextBtn.disabled = cart.length === 0;

    if (cart.length === 0) {
      container.innerHTML = '';
      empty.classList.remove('hidden');
      totalEl.textContent = fmtMoney(0);
      totalBsEl.textContent = '';
      return;
    }
    empty.classList.add('hidden');

    container.innerHTML = cart.map(item => `
      <div class="flex items-center justify-between gap-2 bg-brand-50/50 rounded-lg px-3 py-2">
        <div class="text-sm min-w-0">
          <div class="font-medium text-slate-800 truncate">${item.name}${item.brand ? ` <span class="font-normal text-slate-400">· ${Photos.escapeAttr(item.brand)}</span>` : ''}</div>
          <div class="text-xs text-slate-500">${item.sku} · Talla ${item.size} · ${item.color} · ${fmtMoney(item.price)} c/u</div>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-sm font-semibold text-slate-700 w-16 text-right">${fmtMoney(item.qty * item.price)}</span>
          <button data-dec="${item.productId}" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm leading-none">−</button>
          <span class="w-5 text-center text-sm font-medium">${item.qty}</span>
          <button data-inc="${item.productId}" class="w-7 h-7 rounded-full bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 text-sm leading-none">+</button>
          <button data-rm="${item.productId}" title="Quitar" class="text-rose-400 hover:text-rose-600 ml-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path></svg>
          </button>
        </div>
      </div>`).join('');

    totalEl.textContent = fmtMoney(subtotal());
    totalBsEl.textContent = CURRENT_SETTINGS.rate ? fmtBs(subtotal()) : '';

    container.querySelectorAll('[data-inc]').forEach(btn => btn.addEventListener('click', () => changeQty(btn.dataset.inc, 1)));
    container.querySelectorAll('[data-dec]').forEach(btn => btn.addEventListener('click', () => changeQty(btn.dataset.dec, -1)));
    container.querySelectorAll('[data-rm]').forEach(btn => btn.addEventListener('click', () => removeFromCart(btn.dataset.rm)));
  }

  async function confirmSale() {
    // La ficha del cliente se crea o se completa con cada venta.
    const client = await DB.upsertClient({
      name: clientName.trim(), phone: clientPhone.trim(),
      cedula: clientCedula.trim(), address: clientAddress.trim(),
    });

    const sale = {
      storeId: AppState.currentStore,
      clientId: client.id,
      clientName: clientName.trim(),
      clientPhone: clientPhone.trim(),
      clientCedula: clientCedula.trim(),
      clientAddress: clientAddress.trim(),
      paymentMethod,
      items: cart.map(({ productId, sku, name, size, color, price, qty }) => ({ productId, sku, name, size, color, price, qty, subtotal: +(price * qty).toFixed(2) })),
      subtotal: subtotal(),
      discount,
      creditApplied,
      total: total(),
    };
    const saved = await DB.addSale(sale);
    if (creditApplied > 0) {
      await DB.useClientCredit({ clientId: client.id }, creditApplied);
    }
    toast(`Venta registrada por ${fmtMoney(saved.total)}`);
    justCompleted = saved;
    render();
  }

  function syncStore() {
    resetWizard();
  }

  // Prendas cargadas en la venta que se está armando. Lo consulta el cierre de
  // sesión para no perder un carrito a medias sin avisar.
  function pendingCount() {
    return cart.reduce((s, i) => s + i.qty, 0);
  }

  return { render, syncStore, pendingCount };
})();
