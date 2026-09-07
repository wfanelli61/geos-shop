// Tasa del dólar BCV en tiempo real — la misma que muestra alcambio.app.
//
// alcambio.app no publica una API abierta que un navegador pueda consultar
// directamente (su servidor no habilita CORS, así que el navegador bloquearía
// la respuesta). Lo que sí es público es la fuente que alcambio.app usa: la
// tasa oficial del BCV. Este módulo la busca en varios servicios que sí
// permiten consultas desde el navegador y que leen ese mismo dato oficial,
// así que el número que aparece aquí es el que verás en alcambio.app.
//
// Los servicios se intentan en orden. Si el primero está caído, se pasa al
// siguiente; si ninguno responde, el sistema conserva la última tasa conocida
// y la dueña siempre puede escribirla a mano.

const RateService = (() => {

  const TIMEOUT_MS = 8000;

  // Rango de cordura: descarta respuestas absurdas (0, negativas o un número
  // que claramente no es una tasa) para no dañar los precios de la tienda.
  const MIN_RATE = 1;
  const MAX_RATE = 1000000;

  // ------------------------------------------------------------- Consulta

  // Recorre los proveedores hasta que uno entregue una tasa válida.
  // Devuelve { rate, label, providerId } o lanza un error con el detalle.
  async function fetchBCV() {
    const fallos = [];

    for (const provider of RATE_PROVIDERS) {
      try {
        const json = await getJson(provider.url);
        const rate = extractRate(json);
        if (rate == null) {
          fallos.push(`${provider.label}: respondió, pero sin una tasa reconocible`);
          continue;
        }
        return { rate, label: provider.label, providerId: provider.id };
      } catch (err) {
        fallos.push(`${provider.label}: ${err.message}`);
      }
    }

    const detalle = fallos.join(' · ');
    throw new Error(detalle || 'Ningún servicio de tasa respondió.');
  }

  async function getJson(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`respondió ${res.status}`);
      return await res.json();
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('tardó demasiado');
      // Un fallo de red desde el navegador casi siempre es CORS o falta de internet.
      if (err instanceof TypeError) throw new Error('no se pudo conectar');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  // ------------------------------------------------------------- Lectura

  // Cada servicio nombra el campo a su manera (promedio, price, dollar...).
  // En vez de atarnos a un formato, buscamos el primer campo con nombre de
  // tasa y valor creíble, en cualquier nivel de la respuesta. Así el sistema
  // sigue funcionando aunque un servicio cambie su estructura.
  const CAMPOS_TASA = [
    'promedio', 'price', 'dollar', 'usd', 'rate', 'valor', 'value',
    'venta', 'monto', 'amount', 'bcv', 'oficial',
  ];

  function extractRate(json) {
    const encontrado = buscar(json, 0);
    return encontrado;
  }

  function buscar(nodo, profundidad) {
    if (nodo == null || profundidad > 6) return null;

    // Un número suelto ya es la respuesta (algunos servicios responden solo eso).
    if (typeof nodo === 'number') return esTasaValida(nodo) ? nodo : null;

    if (Array.isArray(nodo)) {
      for (const item of nodo) {
        const r = buscar(item, profundidad + 1);
        if (r != null) return r;
      }
      return null;
    }

    if (typeof nodo !== 'object') return null;

    // Primero los campos con nombre de tasa, en el orden en que confiamos.
    for (const campo of CAMPOS_TASA) {
      for (const clave of Object.keys(nodo)) {
        if (clave.toLowerCase() !== campo) continue;
        const n = aNumero(nodo[clave]);
        if (n != null && esTasaValida(n)) return n;
      }
    }

    // Si no, se baja un nivel: el dato suele venir anidado (monitors.usd.price).
    for (const clave of Object.keys(nodo)) {
      const valor = nodo[clave];
      if (valor && typeof valor === 'object') {
        const r = buscar(valor, profundidad + 1);
        if (r != null) return r;
      }
    }
    return null;
  }

  // Acepta 36.5, "36.5" y "36,50" (coma decimal, común en es-VE).
  function aNumero(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (typeof v !== 'string') return null;
    const limpio = v.trim().replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    const n = parseFloat(limpio);
    return isFinite(n) ? n : null;
  }

  function esTasaValida(n) {
    return typeof n === 'number' && isFinite(n) && n >= MIN_RATE && n <= MAX_RATE;
  }

  // ------------------------------------------------------------- Guardado

  // Busca la tasa y la guarda. Devuelve { ok, rate, label } o { ok:false, error }.
  async function updateNow() {
    try {
      const { rate, label } = await fetchBCV();
      const redondeada = +Number(rate).toFixed(2);
      await DB.saveSettings({
        rate: redondeada,
        rateUpdatedAt: new Date().toISOString(),
        rateSource: label,
        rateIsManual: false,
      });
      await refreshSettings();
      return { ok: true, rate: redondeada, label };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  // Al abrir el sistema se busca la tasa del día en segundo plano.
  //
  // No basta con mirar la fecha: al instalarse, el sistema guarda una tasa de
  // arranque con la fecha de hoy, y esa no es una tasa real del BCV. La
  // pregunta correcta es si la tasa de hoy ya quedó resuelta, y eso ocurre de
  // dos maneras: porque ya se consultó el BCV (hay fuente) o porque la dueña
  // la escribió a mano. En cualquier otro caso, se consulta.
  async function autoUpdateOnStart() {
    if (!CURRENT_SETTINGS.autoRate) return { ok: false, skipped: 'apagada' };

    const esDeHoy = CURRENT_SETTINGS.rateUpdatedAt
      && isSameDay(CURRENT_SETTINGS.rateUpdatedAt, new Date());
    const yaResuelta = esDeHoy
      && (CURRENT_SETTINGS.rateSource || CURRENT_SETTINGS.rateIsManual);

    if (yaResuelta) return { ok: false, skipped: 'la tasa de hoy ya está resuelta' };
    return await updateNow();
  }

  return { fetchBCV, updateNow, autoUpdateOnStart, extractRate };
})();
