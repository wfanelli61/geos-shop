// Capa de acceso a datos (Fase 1: localStorage).
//
// Toda la UI habla exclusivamente con el objeto `DB`, nunca con localStorage
// directamente, y cada método es `async` aunque hoy sea síncrono por dentro.
// En la Fase 2 (PHP + MySQL) este archivo es el único que debe reescribirse:
// cada método pasa a hacer `fetch('/api/...')` devolviendo la misma forma de
// datos, y el resto de la aplicación no necesita cambiar ni una línea.
//
// MODELO DE EXISTENCIAS
//   existencia = stockInicial + movimientos(±) − vendidas(ventas activas)
//   disponible = existencia − apartadas(apartados activos)
// Las ventas anuladas no descuentan. Los apartados reservan sin descontar.

const DB = (() => {
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      console.error('Error leyendo', key, e);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // El navegador reserva ~5 MB por sitio. Con fotos de prendas ese tope se
      // puede alcanzar, y conviene decirlo con claridad en vez de fallar en seco.
      const lleno = e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22);
      if (lleno) {
        throw new Error('No queda espacio en el navegador para guardar más datos. Descarga un respaldo y elimina fotos de prendas que ya no vendas.');
      }
      throw e;
    }
  }

  function uid(prefix) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function isActiveSale(sale) {
    return sale.status !== 'anulada';
  }

  // Clave con la que se identifica a un cliente: el teléfono sin formato, y si
  // no lo hay, la cédula; como último recurso el nombre.
  function clientKey(client) {
    const phone = (client.phone || '').replace(/\D/g, '');
    if (phone) return phone;
    const cedula = (client.cedula || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (cedula) return 'ci:' + cedula;
    return 'n:' + (client.name || '').trim().toLowerCase();
  }

  // Rellena campos que no existían en versiones anteriores de los datos.
  function migrateSchema() {
    // El costo de compra se retiró del sistema: solo se maneja precio de venta.
    const products = read(STORAGE_KEYS.products, []);
    let changed = false;
    products.forEach(p => {
      if ('cost' in p) { delete p.cost; changed = true; }
      // Marca y foto se agregaron después: las prendas viejas las reciben vacías
      // para que el resto del sistema no tenga que preguntar si existen.
      if (p.brand === undefined) { p.brand = ''; changed = true; }
      if (p.photo === undefined) { p.photo = null; changed = true; }
    });
    if (changed) write(STORAGE_KEYS.products, products);

    const sales = read(STORAGE_KEYS.sales, []);
    let salesChanged = false;
    sales.forEach(s => {
      if (s.status === undefined) { s.status = 'activa'; salesChanged = true; }
      if (s.subtotal === undefined) { s.subtotal = s.total; salesChanged = true; }
      if (s.discount === undefined) { s.discount = 0; salesChanged = true; }
    });
    if (salesChanged) write(STORAGE_KEYS.sales, sales);

    if (localStorage.getItem(STORAGE_KEYS.movements) === null) write(STORAGE_KEYS.movements, []);
    if (localStorage.getItem(STORAGE_KEYS.layaways) === null) write(STORAGE_KEYS.layaways, []);
    if (localStorage.getItem(STORAGE_KEYS.settings) === null) write(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS });

    // Antes los clientes solo existían dentro de las ventas. Al introducir la
    // ficha de cliente (cédula, dirección) creamos una por cada cliente que ya
    // haya comprado, para no perder a nadie.
    if (localStorage.getItem(STORAGE_KEYS.clients) === null) {
      const clients = [];
      const seen = new Set();
      [...read(STORAGE_KEYS.sales, []), ...read(STORAGE_KEYS.layaways, [])].forEach(record => {
        const key = clientKey({ phone: record.clientPhone, name: record.clientName });
        if (seen.has(key)) return;
        seen.add(key);
        clients.push({
          id: uid('c'), name: record.clientName, phone: record.clientPhone,
          cedula: '', address: '', note: '', createdAt: record.date,
        });
      });
      write(STORAGE_KEYS.clients, clients);
    }
  }

  async function ensureSeeded() {
    if (!localStorage.getItem(STORAGE_KEYS.seeded)) {
      write(STORAGE_KEYS.products, seedProducts());
      write(STORAGE_KEYS.sales, seedSales());
      write(STORAGE_KEYS.movements, seedMovements());
      write(STORAGE_KEYS.layaways, seedLayaways());
      write(STORAGE_KEYS.clients, seedClients());
      write(STORAGE_KEYS.audits, []);
      write(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS, rateUpdatedAt: new Date().toISOString() });
      localStorage.setItem(STORAGE_KEYS.seeded, 'true');
    } else {
      migrateSchema();
    }
  }

  // ---------------------------------------------------------------- Ajustes

  async function getSettings() {
    return { ...DEFAULT_SETTINGS, ...read(STORAGE_KEYS.settings, {}) };
  }

  async function saveSettings(patch) {
    const current = await getSettings();
    const next = { ...current, ...patch };
    write(STORAGE_KEYS.settings, next);
    return next;
  }

  // --------------------------------------------------------------- Tiendas

  async function getStores() {
    return STORES;
  }

  // -------------------------------------------------------------- Productos

  async function getProducts(storeId) {
    const all = read(STORAGE_KEYS.products, []);
    return storeId ? all.filter(p => p.storeId === storeId) : all;
  }

  async function getProduct(id) {
    const all = read(STORAGE_KEYS.products, []);
    return all.find(p => p.id === id) || null;
  }

  async function saveProduct(product) {
    const all = read(STORAGE_KEYS.products, []);
    if (product.id) {
      const idx = all.findIndex(p => p.id === product.id);
      if (idx >= 0) all[idx] = { ...all[idx], ...product };
    } else {
      product.id = uid('p');
      all.push(product);
    }
    write(STORAGE_KEYS.products, all);
    return product;
  }

  // Marcas ya usadas en el catálogo, para sugerirlas al cargar una prenda nueva.
  // Se combinan con la lista fija para que la dueña no tenga que reescribirlas.
  async function getBrands() {
    const all = read(STORAGE_KEYS.products, []);
    const usadas = all.map(p => (p.brand || '').trim()).filter(Boolean);
    return [...new Set([...usadas, ...COMMON_BRANDS])]
      .sort((a, b) => a.localeCompare(b, 'es'));
  }

  async function deleteProduct(id) {
    const all = read(STORAGE_KEYS.products, []).filter(p => p.id !== id);
    write(STORAGE_KEYS.products, all);
  }

  // Registra una prenda en varias tallas de una sola vez: crea una entrada de
  // inventario por talla, con el código base + la talla (BLU-01-M, BLU-01-L...).
  // Así cada talla tiene su propia existencia, que es como se cuenta en tienda.
  async function saveProductSizes(base, sizes) {
    const created = [];
    const multiple = sizes.length > 1;
    for (const { size, stockInicial } of sizes) {
      const sku = multiple
        ? `${base.sku}-${size.toUpperCase().replace(/\s+/g, '')}`
        : base.sku;
      created.push(await saveProduct({ ...base, sku, size, stockInicial }));
    }
    return created;
  }

  // ----------------------------------------------------------- Movimientos

  async function getMovements(filters = {}) {
    let movements = read(STORAGE_KEYS.movements, []);
    if (filters.storeId) movements = movements.filter(m => m.storeId === filters.storeId);
    if (filters.productId) movements = movements.filter(m => m.productId === filters.productId);
    if (filters.type) movements = movements.filter(m => m.type === filters.type);
    if (filters.dateFrom) movements = movements.filter(m => new Date(m.date) >= filters.dateFrom);
    if (filters.dateTo) movements = movements.filter(m => new Date(m.date) <= filters.dateTo);
    return movements.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function addMovement(movement) {
    const movements = read(STORAGE_KEYS.movements, []);
    movement.id = uid('m');
    movement.date = movement.date || new Date().toISOString();
    movements.push(movement);
    write(STORAGE_KEYS.movements, movements);
    return movement;
  }

  // Traspaso entre tiendas: sale de la origen y entra en la destino.
  // Si la prenda no existe en la tienda destino, se crea con el mismo código.
  async function transferProduct(productId, toStoreId, qty, note) {
    const product = await getProduct(productId);
    if (!product) throw new Error('Prenda no encontrada');

    await addMovement({
      storeId: product.storeId, productId, sku: product.sku, name: product.name,
      type: 'traspaso_salida', qty, note, relatedStoreId: toStoreId,
    });

    const destProducts = await getProducts(toStoreId);
    let dest = destProducts.find(p => p.sku === product.sku);
    if (!dest) {
      dest = await saveProduct({
        storeId: toStoreId, name: product.name, sku: product.sku, category: product.category,
        size: product.size, color: product.color, price: product.price,
        stockInicial: 0,
      });
    }

    await addMovement({
      storeId: toStoreId, productId: dest.id, sku: dest.sku, name: dest.name,
      type: 'traspaso_entrada', qty, note, relatedStoreId: product.storeId,
    });
  }

  // --------------------------------------------------------------- Ventas

  async function getSales(filters = {}) {
    let sales = read(STORAGE_KEYS.sales, []);
    if (filters.storeId) sales = sales.filter(s => s.storeId === filters.storeId);
    if (filters.dateFrom) sales = sales.filter(s => new Date(s.date) >= filters.dateFrom);
    if (filters.dateTo) sales = sales.filter(s => new Date(s.date) <= filters.dateTo);
    if (filters.onlyActive) sales = sales.filter(isActiveSale);
    return sales.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function getSale(id) {
    return read(STORAGE_KEYS.sales, []).find(s => s.id === id) || null;
  }

  async function addSale(sale) {
    const sales = read(STORAGE_KEYS.sales, []);
    const settings = await getSettings();
    sale.id = uid('s');
    sale.date = new Date().toISOString();
    sale.status = 'activa';
    sale.rate = settings.rate;
    sales.push(sale);
    write(STORAGE_KEYS.sales, sales);
    return sale;
  }

  async function voidSale(saleId, reason) {
    const sales = read(STORAGE_KEYS.sales, []);
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new Error('Venta no encontrada');
    sale.status = 'anulada';
    sale.voidedAt = new Date().toISOString();
    sale.voidReason = reason || '';
    write(STORAGE_KEYS.sales, sales);
    return sale;
  }

  // CAMBIO DE PRENDA — la tienda no devuelve dinero, se cambia la mercancía.
  //
  // Se edita la factura: las prendas devueltas salen y las nuevas entran. Como
  // la existencia se calcula desde las ventas activas, la prenda devuelta
  // vuelve al stock sola y la nueva se descuenta sola: no hace falta registrar
  // movimientos aparte (si los registráramos, se contaría dos veces).
  //
  // El monto original de la venta NO se toca: es la plata que entró ese día y
  // el cuadre de esa fecha debe seguir cuadrando. Si la prenda nueva vale más,
  // la diferencia se cobra hoy y cuenta como ingreso de hoy. Si vale menos,
  // queda como saldo a favor de la clienta.
  async function exchangeSale(saleId, { returned, added, paymentMethod, note }) {
    const sales = read(STORAGE_KEYS.sales, []);
    const sale = sales.find(s => s.id === saleId);
    if (!sale) throw new Error('Venta no encontrada');

    returned.forEach(r => {
      const item = sale.items.find(i => i.productId === r.productId);
      if (!item) return;
      item.qty -= r.qty;
      item.subtotal = +(item.price * item.qty).toFixed(2);
    });
    sale.items = sale.items.filter(i => i.qty > 0);

    added.forEach(a => {
      const existing = sale.items.find(i => i.productId === a.productId);
      if (existing) {
        existing.qty += a.qty;
        existing.subtotal = +(existing.price * existing.qty).toFixed(2);
      } else {
        sale.items.push({ ...a, subtotal: +(a.price * a.qty).toFixed(2) });
      }
    });

    const valorDevuelto = +returned.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);
    const valorNuevo = +added.reduce((s, i) => s + i.price * i.qty, 0).toFixed(2);
    const diferencia = +(valorNuevo - valorDevuelto).toFixed(2);

    const exchange = {
      id: uid('x'), date: new Date().toISOString(),
      returned, added, valorDevuelto, valorNuevo, diferencia,
      paymentMethod: diferencia > 0 ? paymentMethod : null,
      note: note || '',
    };
    sale.exchanges = sale.exchanges || [];
    sale.exchanges.push(exchange);
    write(STORAGE_KEYS.sales, sales);

    // Lo que no se cobra en prendas queda a favor de la clienta.
    if (diferencia < 0) await addClientCredit(sale, Math.abs(diferencia));

    return { sale, exchange };
  }

  // ---------------------------------------------------------- Saldo a favor

  function findClientRecord(all, ref) {
    if (ref.clientId) {
      const byId = all.find(c => c.id === ref.clientId);
      if (byId) return byId;
    }
    const key = clientKey({ phone: ref.clientPhone, cedula: ref.clientCedula, name: ref.clientName });
    return all.find(c => clientKey(c) === key) || null;
  }

  async function addClientCredit(ref, amount) {
    const all = read(STORAGE_KEYS.clients, []);
    let client = findClientRecord(all, ref);
    if (!client) {
      client = {
        id: uid('c'), name: ref.clientName || '', phone: ref.clientPhone || '',
        cedula: ref.clientCedula || '', address: '', note: '',
        createdAt: new Date().toISOString(),
      };
      all.push(client);
    }
    client.saldoFavor = +((client.saldoFavor || 0) + amount).toFixed(2);
    write(STORAGE_KEYS.clients, all);
    return client;
  }

  async function useClientCredit(ref, amount) {
    const all = read(STORAGE_KEYS.clients, []);
    const client = findClientRecord(all, ref);
    if (!client) return null;
    client.saldoFavor = +Math.max(0, (client.saldoFavor || 0) - amount).toFixed(2);
    write(STORAGE_KEYS.clients, all);
    return client;
  }

  async function getClientCredit(ref) {
    const all = read(STORAGE_KEYS.clients, []);
    const client = findClientRecord(all, ref);
    return client ? (client.saldoFavor || 0) : 0;
  }

  // Diferencias cobradas por cambios dentro de un rango: son ingreso del día
  // en que se hizo el cambio, no del día de la venta original.
  async function getExchanges(filters = {}) {
    const sales = read(STORAGE_KEYS.sales, []).filter(isActiveSale);
    const result = [];
    sales.forEach(sale => {
      (sale.exchanges || []).forEach(x => {
        if (filters.storeId && sale.storeId !== filters.storeId) return;
        if (filters.dateFrom && new Date(x.date) < filters.dateFrom) return;
        if (filters.dateTo && new Date(x.date) > filters.dateTo) return;
        result.push({ ...x, saleId: sale.id, storeId: sale.storeId, clientName: sale.clientName });
      });
    });
    return result.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // ------------------------------------------------------------ Apartados

  async function getLayaways(filters = {}) {
    let layaways = read(STORAGE_KEYS.layaways, []);
    if (filters.storeId) layaways = layaways.filter(l => l.storeId === filters.storeId);
    if (filters.status) layaways = layaways.filter(l => l.status === filters.status);
    return layaways.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async function addLayaway(layaway) {
    const layaways = read(STORAGE_KEYS.layaways, []);
    layaway.id = uid('l');
    layaway.date = new Date().toISOString();
    layaway.status = 'activo';
    layaway.deposits = layaway.deposits || [];
    layaways.push(layaway);
    write(STORAGE_KEYS.layaways, layaways);
    return layaway;
  }

  async function addDeposit(layawayId, deposit) {
    const layaways = read(STORAGE_KEYS.layaways, []);
    const layaway = layaways.find(l => l.id === layawayId);
    if (!layaway) throw new Error('Apartado no encontrado');
    layaway.deposits.push({ ...deposit, date: new Date().toISOString() });
    write(STORAGE_KEYS.layaways, layaways);
    return layaway;
  }

  // Al entregar el apartado se convierte en venta (descuenta inventario).
  async function completeLayaway(layawayId, paymentMethod) {
    const layaways = read(STORAGE_KEYS.layaways, []);
    const layaway = layaways.find(l => l.id === layawayId);
    if (!layaway) throw new Error('Apartado no encontrado');

    const sale = await addSale({
      storeId: layaway.storeId,
      clientName: layaway.clientName,
      clientPhone: layaway.clientPhone,
      paymentMethod: paymentMethod || 'Efectivo',
      items: layaway.items,
      subtotal: layaway.total,
      discount: 0,
      total: layaway.total,
      layawayId: layaway.id,
    });

    layaway.status = 'completado';
    layaway.completedAt = new Date().toISOString();
    layaway.saleId = sale.id;
    write(STORAGE_KEYS.layaways, layaways);
    return { layaway, sale };
  }

  async function cancelLayaway(layawayId, reason) {
    const layaways = read(STORAGE_KEYS.layaways, []);
    const layaway = layaways.find(l => l.id === layawayId);
    if (!layaway) throw new Error('Apartado no encontrado');
    layaway.status = 'cancelado';
    layaway.cancelledAt = new Date().toISOString();
    layaway.cancelReason = reason || '';
    write(STORAGE_KEYS.layaways, layaways);
    return layaway;
  }

  // ------------------------------------------------------------ Inventario

  // Devuelve productos con existencia, disponible y desglose de movimientos.
  async function getInventory(storeId) {
    const products = await getProducts(storeId);
    const sales = read(STORAGE_KEYS.sales, []).filter(isActiveSale);
    const movements = read(STORAGE_KEYS.movements, []);
    const layaways = read(STORAGE_KEYS.layaways, []).filter(l => l.status === 'activo');

    const soldByProduct = {};
    sales.forEach(sale => sale.items.forEach(item => {
      soldByProduct[item.productId] = (soldByProduct[item.productId] || 0) + item.qty;
    }));

    const movedByProduct = {};
    const entriesByProduct = {};
    movements.forEach(m => {
      const sign = MOVEMENT_TYPES[m.type] ? MOVEMENT_TYPES[m.type].sign : 0;
      movedByProduct[m.productId] = (movedByProduct[m.productId] || 0) + sign * m.qty;
      if (m.type === 'entrada' || m.type === 'traspaso_entrada') {
        entriesByProduct[m.productId] = (entriesByProduct[m.productId] || 0) + m.qty;
      }
    });

    const reservedByProduct = {};
    layaways.forEach(l => l.items.forEach(item => {
      reservedByProduct[item.productId] = (reservedByProduct[item.productId] || 0) + item.qty;
    }));

    return products.map(p => {
      const vendida = soldByProduct[p.id] || 0;
      const movimientos = movedByProduct[p.id] || 0;
      const entradas = entriesByProduct[p.id] || 0;
      const apartadas = reservedByProduct[p.id] || 0;
      const existencia = p.stockInicial + movimientos - vendida;
      return {
        ...p,
        cantidadVendida: vendida,
        entradas,
        movimientos,
        apartadas,
        existenciaActual: existencia,
        disponible: existencia - apartadas,
      };
    });
  }

  // -------------------------------------------------------------- Clientes

  // Los clientes tienen ficha propia (cédula, dirección), y sus estadísticas
  // se calculan desde las ventas reales para que nunca queden desfasadas.
  async function getStoredClients() {
    return read(STORAGE_KEYS.clients, []);
  }

  async function getClient(id) {
    return read(STORAGE_KEYS.clients, []).find(c => c.id === id) || null;
  }

  async function saveClient(client) {
    const all = read(STORAGE_KEYS.clients, []);
    if (client.id) {
      const idx = all.findIndex(c => c.id === client.id);
      if (idx >= 0) all[idx] = { ...all[idx], ...client, updatedAt: new Date().toISOString() };
    } else {
      client.id = uid('c');
      client.createdAt = new Date().toISOString();
      all.push(client);
    }
    write(STORAGE_KEYS.clients, all);
    return client;
  }

  async function deleteClient(id) {
    write(STORAGE_KEYS.clients, read(STORAGE_KEYS.clients, []).filter(c => c.id !== id));
  }

  // Crea o actualiza la ficha al vender: si el cliente ya existe solo completa
  // los datos nuevos, sin borrar los que ya estaban registrados.
  async function upsertClient({ name, phone, cedula, address, note }) {
    const all = read(STORAGE_KEYS.clients, []);
    const key = clientKey({ phone, cedula, name });
    const existing = all.find(c => clientKey(c) === key);

    if (existing) {
      if (name) existing.name = name;
      if (phone) existing.phone = phone;
      if (cedula) existing.cedula = cedula;
      if (address) existing.address = address;
      if (note) existing.note = note;
      existing.updatedAt = new Date().toISOString();
      write(STORAGE_KEYS.clients, all);
      return existing;
    }

    const created = {
      id: uid('c'), name: name || '', phone: phone || '', cedula: cedula || '',
      address: address || '', note: note || '', createdAt: new Date().toISOString(),
    };
    all.push(created);
    write(STORAGE_KEYS.clients, all);
    return created;
  }

  async function getClients(storeId) {
    const stored = read(STORAGE_KEYS.clients, []);
    const sales = read(STORAGE_KEYS.sales, []).filter(isActiveSale)
      .filter(s => !storeId || s.storeId === storeId);
    const layaways = read(STORAGE_KEYS.layaways, [])
      .filter(l => !storeId || l.storeId === storeId);

    const byKey = {};
    const blank = (key, base) => ({
      key, id: null, name: '', phone: '', cedula: '', address: '', note: '',
      compras: 0, totalGastado: 0, prendas: 0, ultimaCompra: null,
      apartadosActivos: 0, stores: new Set(), ...base,
    });

    stored.forEach(c => {
      const key = clientKey(c);
      byKey[key] = blank(key, { ...c });
    });

    sales.forEach(s => {
      const key = clientKey({ phone: s.clientPhone, cedula: s.clientCedula, name: s.clientName });
      if (!byKey[key]) byKey[key] = blank(key, { name: s.clientName, phone: s.clientPhone });
      const c = byKey[key];
      c.compras += 1;
      c.totalGastado = +(c.totalGastado + s.total).toFixed(2);
      c.prendas += s.items.reduce((a, i) => a + i.qty, 0);
      c.stores.add(s.storeId);
      if (!c.ultimaCompra || new Date(s.date) > new Date(c.ultimaCompra)) c.ultimaCompra = s.date;
    });

    layaways.filter(l => l.status === 'activo').forEach(l => {
      const key = clientKey({ phone: l.clientPhone, name: l.clientName });
      if (!byKey[key]) byKey[key] = blank(key, { name: l.clientName, phone: l.clientPhone });
      byKey[key].apartadosActivos += 1;
      byKey[key].stores.add(l.storeId);
    });

    return Object.values(byKey)
      .map(c => ({ ...c, stores: [...c.stores] }))
      .sort((a, b) => b.totalGastado - a.totalGastado || a.name.localeCompare(b.name));
  }

  async function getClientHistory(key, storeId) {
    const sales = await getSales({ storeId });
    return sales.filter(s => clientKey({ phone: s.clientPhone, cedula: s.clientCedula, name: s.clientName }) === key);
  }

  // ------------------------------------------------------------ Auditorías

  async function getAudits(storeId) {
    const all = read(STORAGE_KEYS.audits, []);
    return storeId ? all.filter(a => a.storeId === storeId) : all;
  }

  async function getAudit(id) {
    return read(STORAGE_KEYS.audits, []).find(a => a.id === id) || null;
  }

  async function saveAudit(audit) {
    const all = read(STORAGE_KEYS.audits, []);
    audit.id = uid('a');
    audit.date = new Date().toISOString();
    all.push(audit);
    write(STORAGE_KEYS.audits, all);
    return audit;
  }

  // Al corregir una auditoría se conserva la fecha original y se anota cuándo
  // se editó, para que quede claro que el conteo se revisó después.
  async function updateAudit(id, patch) {
    const all = read(STORAGE_KEYS.audits, []);
    const idx = all.findIndex(a => a.id === id);
    if (idx < 0) throw new Error('Auditoría no encontrada');
    all[idx] = { ...all[idx], ...patch, editedAt: new Date().toISOString() };
    write(STORAGE_KEYS.audits, all);
    return all[idx];
  }

  // ------------------------------------------------------- Respaldo/Datos

  async function exportData() {
    return {
      exportedAt: new Date().toISOString(),
      version: STORAGE_KEYS.seeded,
      products: read(STORAGE_KEYS.products, []),
      sales: read(STORAGE_KEYS.sales, []),
      movements: read(STORAGE_KEYS.movements, []),
      layaways: read(STORAGE_KEYS.layaways, []),
      clients: read(STORAGE_KEYS.clients, []),
      audits: read(STORAGE_KEYS.audits, []),
      settings: read(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
    };
  }

  async function importData(data) {
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
      throw new Error('El archivo no tiene el formato esperado.');
    }
    write(STORAGE_KEYS.products, data.products);
    write(STORAGE_KEYS.sales, data.sales);
    write(STORAGE_KEYS.movements, data.movements || []);
    write(STORAGE_KEYS.layaways, data.layaways || []);
    write(STORAGE_KEYS.audits, data.audits || []);
    write(STORAGE_KEYS.settings, data.settings || { ...DEFAULT_SETTINGS });
    // Un respaldo anterior a las fichas de cliente no trae `clients`: dejamos
    // que migrateSchema las reconstruya desde las ventas importadas.
    if (data.clients) write(STORAGE_KEYS.clients, data.clients);
    else localStorage.removeItem(STORAGE_KEYS.clients);
    localStorage.setItem(STORAGE_KEYS.seeded, 'true');
    migrateSchema();
    return {
      productos: data.products.length,
      ventas: data.sales.length,
      movimientos: (data.movements || []).length,
      apartados: (data.layaways || []).length,
      clientes: read(STORAGE_KEYS.clients, []).length,
    };
  }

  async function resetToSeed() {
    write(STORAGE_KEYS.products, seedProducts());
    write(STORAGE_KEYS.sales, seedSales());
    write(STORAGE_KEYS.movements, seedMovements());
    write(STORAGE_KEYS.layaways, seedLayaways());
    write(STORAGE_KEYS.clients, seedClients());
    write(STORAGE_KEYS.audits, []);
    write(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS, rateUpdatedAt: new Date().toISOString() });
  }

  async function clearAll() {
    write(STORAGE_KEYS.products, []);
    write(STORAGE_KEYS.sales, []);
    write(STORAGE_KEYS.movements, []);
    write(STORAGE_KEYS.layaways, []);
    write(STORAGE_KEYS.clients, []);
    write(STORAGE_KEYS.audits, []);
    write(STORAGE_KEYS.settings, { ...DEFAULT_SETTINGS });
    localStorage.setItem(STORAGE_KEYS.seeded, 'true');
  }

  return {
    ensureSeeded,
    getSettings, saveSettings,
    getStores,
    getProducts, getProduct, saveProduct, saveProductSizes, deleteProduct,
    getMovements, addMovement, transferProduct,
    getSales, getSale, addSale, voidSale, exchangeSale, getExchanges,
    addClientCredit, useClientCredit, getClientCredit,
    getLayaways, addLayaway, addDeposit, completeLayaway, cancelLayaway,
    getInventory,
    getBrands,
    getClients, getStoredClients, getClient, saveClient, deleteClient, upsertClient, getClientHistory,
    getAudits, getAudit, saveAudit, updateAudit,
    exportData, importData, resetToSeed, clearAll,
  };
})();
