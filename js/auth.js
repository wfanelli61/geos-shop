// Usuarios, contraseñas, sesión y permisos.
//
// ALCANCE — importante entenderlo bien:
// Este sistema corre entero dentro del navegador, sin servidor. El login separa
// quién está usando la caja y a qué tienda entra cada quien, pero NO es una
// barrera de seguridad: alguien con conocimientos técnicos y acceso a la
// computadora puede saltárselo desde las herramientas del navegador. Sirve para
// que cada vendedora vea lo suyo y quede registrado quién atiende, no para
// proteger los datos de alguien que quiera forzarlos. Para eso haría falta un
// servidor de verdad.
//
// Aun así las contraseñas se guardan derivadas con PBKDF2 y sal única, nunca en
// texto plano: si alguien abre el respaldo, no lee las claves.

const Auth = (() => {

  const ITERACIONES = 150000;
  const LARGO_BITS = 256;

  // ------------------------------------------------------------ Contraseñas

  function hayCripto() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues);
  }

  function bytesAHex(buffer) {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function nuevaSal() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return bytesAHex(bytes);
  }

  function hexABytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  async function derivar(password, salHex, iteraciones) {
    if (!hayCripto()) {
      throw new Error('Este navegador no permite guardar contraseñas de forma segura. Abre el sistema desde http://localhost en vez de hacer doble clic al archivo.');
    }
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: hexABytes(salHex), iterations: iteraciones, hash: 'SHA-256' },
      key, LARGO_BITS,
    );
    return bytesAHex(bits);
  }

  // Devuelve las tres piezas que se guardan del usuario. La contraseña original
  // no se guarda en ninguna parte.
  async function hashPassword(password) {
    const salt = nuevaSal();
    const hash = await derivar(password, salt, ITERACIONES);
    return { salt, hash, iterations: ITERACIONES };
  }

  async function verifyPassword(password, user) {
    if (!user || !user.hash || !user.salt) return false;
    const intento = await derivar(password, user.salt, user.iterations || ITERACIONES);
    return igualdadConstante(intento, user.hash);
  }

  // Comparar sin cortar en la primera diferencia: evita filtrar información
  // por el tiempo que tarda la comparación.
  function igualdadConstante(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return dif === 0;
  }

  // ---------------------------------------------------------------- Sesión

  // Usuario conectado en esta pestaña. La verdad persistente vive en el
  // almacenamiento; esto es la copia en memoria para no releerla en cada render.
  let usuarioActual = null;

  function currentUser() {
    return usuarioActual;
  }

  function setCurrentUser(user) {
    usuarioActual = user;
    return user;
  }

  async function login(username, password) {
    const limpio = (username || '').trim().toLowerCase();
    if (!limpio || !password) {
      return { ok: false, error: 'Escribe tu usuario y tu contraseña.' };
    }

    const user = await DB.getUserByUsername(limpio);

    // El mismo mensaje para usuario inexistente y contraseña errada: así no se
    // puede averiguar qué usuarios existen probando nombres.
    const generico = 'Usuario o contraseña incorrectos.';
    if (!user) {
      // Se gasta el mismo tiempo que en una verificación real.
      await derivar(password, nuevaSal(), ITERACIONES).catch(() => {});
      return { ok: false, error: generico };
    }
    if (user.active === false) {
      return { ok: false, error: 'Esta cuenta está desactivada. Pídele a la administradora que la habilite.' };
    }

    const correcta = await verifyPassword(password, user);
    if (!correcta) return { ok: false, error: generico };

    await DB.touchUserLogin(user.id);
    const fresco = await DB.getUser(user.id);
    setCurrentUser(fresco);
    DB.saveSession({ userId: fresco.id, startedAt: new Date().toISOString() });
    return { ok: true, user: fresco };
  }

  function logout() {
    setCurrentUser(null);
    DB.clearSession();
  }

  // Al abrir el sistema: si había una sesión guardada y el usuario sigue
  // existiendo y activo, se retoma. Si no, se pide login de nuevo.
  async function restoreSession() {
    const sesion = DB.readSession();
    if (!sesion || !sesion.userId) return null;
    const user = await DB.getUser(sesion.userId);
    if (!user || user.active === false) {
      DB.clearSession();
      return null;
    }
    return setCurrentUser(user);
  }

  // Vuelve a leer del almacenamiento al usuario conectado. Se usa después de
  // que la administradora se edita a sí misma.
  async function refreshCurrentUser() {
    if (!usuarioActual) return null;
    const user = await DB.getUser(usuarioActual.id);
    if (!user || user.active === false) {
      logout();
      return null;
    }
    return setCurrentUser(user);
  }

  // ------------------------------------------------------------- Permisos

  // Tiendas a las que entra un usuario. Es la regla central: todo lo que
  // muestre o cambie de tienda pasa por acá.
  function allowedStores(user = usuarioActual) {
    if (!user) return [];
    return roleOf(user.role).stores.slice();
  }

  function canAccessStore(storeId, user = usuarioActual) {
    return allowedStores(user).includes(storeId);
  }

  // Primera tienda a la que puede entrar: con la que abre el sistema.
  function defaultStore(user = usuarioActual) {
    return allowedStores(user)[0] || null;
  }

  function isAdmin(user = usuarioActual) {
    return !!user && user.role === 'admin';
  }

  // Punto de extensión para los permisos que se agreguen más adelante.
  function can(permiso, user = usuarioActual) {
    if (!user) return false;
    return !!roleOf(user.role).permissions[permiso];
  }

  function roleLabel(user = usuarioActual) {
    return user ? roleOf(user.role).label : '';
  }

  // ------------------------------------------------------- Reglas de forma

  // Se validan acá y no solo en el formulario, para que valgan también cuando
  // los usuarios se crean desde otro lado (por ejemplo al importar).
  function validarUsuario({ name, username, role }, { existente } = {}) {
    const errores = [];
    if (!name || !name.trim()) errores.push('El nombre no puede quedar vacío.');
    const u = (username || '').trim().toLowerCase();
    if (!u) errores.push('El usuario no puede quedar vacío.');
    else if (!/^[a-z0-9._-]{3,20}$/.test(u)) errores.push('El usuario debe tener entre 3 y 20 caracteres, sin espacios ni acentos.');
    if (!ROLES[role]) errores.push('Elige un modo de acceso válido.');
    if (existente && existente.username === u) { /* no cambió: válido */ }
    return errores;
  }

  function validarPassword(password) {
    if (!password || password.length < 6) {
      return 'La contraseña debe tener al menos 6 caracteres.';
    }
    return null;
  }

  return {
    hayCripto, hashPassword, verifyPassword,
    login, logout, restoreSession, refreshCurrentUser, currentUser, setCurrentUser,
    allowedStores, canAccessStore, defaultStore, isAdmin, can, roleLabel,
    validarUsuario, validarPassword,
  };
})();
