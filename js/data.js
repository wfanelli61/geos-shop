// Constantes y datos semilla del sistema. Todo lo que dependa del "negocio"
// (tiendas, categorías, prendas y ventas iniciales) vive aquí para que db.js
// solo se preocupe por persistencia.

const STORES = [
  { id: 'damas', name: 'Tienda de Damas' },
  { id: 'ninos', name: 'Tienda de Niños' },
];

// Identidad visual por tienda. La tienda de niños se presenta como
// "Geo's Shop Kids" con los colores del logo: rosado para "Geo's Shop"
// y turquesa para "Kids", sobre un aro degradado rosa → naranja → amarillo.
const BRAND_BY_STORE = {
  damas: {
    name: "Geo's Shop",
    // El nombre se parte en dos para poder pintar cada mitad de un color.
    primaryText: "Geo's Shop",
    accentText: '',
    initial: 'G',
    tagline: 'Panel de Gestión',
    docTitle: "Geo's Shop — Inventario y Ventas",
    // Colores de impresión (no dependen de Tailwind).
    print: { c600: '#C23A80', c700: '#9E2C68', c50: '#FEF3F8' },
  },
  ninos: {
    name: "Geo's Shop Kids",
    primaryText: "Geo's Shop",
    accentText: 'Kids',
    initial: 'G',
    tagline: 'Panel de Gestión',
    docTitle: "Geo's Shop Kids — Inventario y Ventas",
    print: { c600: '#12A8A3', c700: '#0F7C7A', c50: '#EAFBFA' },
  },
};

function brandOf(storeId) {
  return BRAND_BY_STORE[storeId] || BRAND_BY_STORE.damas;
}

// ------------------------------------------------------------------- Roles

// Los cuatro modos de acceso. `stores` decide a qué tiendas entra cada rol:
// es la regla que separa a la vendedora de damas de la de niños.
//
// `permissions` queda como el lugar donde se irán agregando los permisos más
// finos; hoy solo distingue quién administra usuarios, porque de lo contrario
// cualquier vendedora podría crearse una cuenta de administradora.
const ROLES = {
  admin: {
    id: 'admin',
    label: 'Administrador',
    short: 'Admin',
    description: 'Entra a las dos tiendas y administra los usuarios.',
    stores: ['damas', 'ninos'],
    color: 'brand',
    permissions: { manageUsers: true },
  },
  vendedor_ambas: {
    id: 'vendedor_ambas',
    label: 'Vendedora — Ambas Tiendas',
    short: 'Ambas',
    description: 'Vende en las dos tiendas. No administra usuarios.',
    stores: ['damas', 'ninos'],
    color: 'violet',
    permissions: { manageUsers: false },
  },
  vendedor_damas: {
    id: 'vendedor_damas',
    label: 'Vendedora — Tienda de Damas',
    short: 'Damas',
    description: 'Entra únicamente a la Tienda de Damas.',
    stores: ['damas'],
    color: 'pink',
    permissions: { manageUsers: false },
  },
  vendedor_ninos: {
    id: 'vendedor_ninos',
    label: 'Vendedora — Tienda de Niños',
    short: 'Niños',
    description: 'Entra únicamente a la Tienda de Niños.',
    stores: ['ninos'],
    color: 'teal',
    permissions: { manageUsers: false },
  },
};

// Orden en que se muestran los roles al crear o editar un usuario.
const ROLE_ORDER = ['admin', 'vendedor_ambas', 'vendedor_damas', 'vendedor_ninos'];

function roleOf(roleId) {
  return ROLES[roleId] || ROLES.vendedor_damas;
}

// Usuarios que se crean la primera vez, uno por modo, para poder probar los
// cuatro accesos de entrada. Las contraseñas quedan marcadas como "de fábrica"
// y el sistema insiste en cambiarlas hasta que se cambien.
const SEED_USERS = [
  { name: 'Geo',            username: 'geo',   role: 'admin',          password: 'admin123' },
  { name: 'Vendedora Todo', username: 'ambas', role: 'vendedor_ambas', password: 'ambas123' },
  { name: 'Vendedora Damas', username: 'damas', role: 'vendedor_damas', password: 'damas123' },
  { name: 'Vendedora Niños', username: 'ninos', role: 'vendedor_ninos', password: 'ninos123' },
];

const CATEGORIES = [
  'Pantalones', 'Blusas', 'Camisas', 'Vestidos Largos', 'Vestidos Cortos',
  'Faldas', 'Shorts', 'Conjuntos', 'Accesorios', 'Otros',
];

const PAYMENT_METHODS = ['Pago Móvil', 'Efectivo', 'Punto de Venta', 'Divisas'];

// Métodos que se cobran en bolívares (se muestran convertidos con la tasa).
const METHODS_IN_BS = ['Pago Móvil', 'Punto de Venta'];

const SIZES_BY_STORE = {
  damas: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36'],
  ninos: ['2', '4', '6', '8', '10', '12', '14', '16'],
};

const COMMON_COLORS = [
  'Blanco', 'Negro', 'Azul', 'Azul Marino', 'Rojo', 'Beige', 'Rosado',
  'Verde', 'Gris', 'Amarillo', 'Morado', 'Vinotinto',
];

// Marcas sugeridas al cargar una prenda. La lista es solo una ayuda: el campo
// es de texto libre y el catálogo va aprendiendo las marcas que ya usaste.
const COMMON_BRANDS = [
  'Sin marca', 'Zara', 'H&M', 'Bershka', 'Pull&Bear', 'Stradivarius',
  'Forever 21', "Levi's", 'Tommy Hilfiger', 'Nike', 'Adidas', "Carter's",
  'OshKosh', 'Gymboree', 'Place', 'Genérica', 'Nacional',
];

// ------------------------------------------------------------------- Fotos

// Las fotos se guardan dentro del navegador junto al resto de los datos, y ese
// espacio es limitado (~5 MB). Por eso toda imagen se reduce antes de guardarse:
// se reescala al lado mayor indicado y se recomprime en JPEG.
const PHOTO_MAX_DIM = 640;      // píxeles del lado más largo
const PHOTO_QUALITY = 0.72;     // calidad JPEG
const PHOTO_MAX_BYTES = 350000; // si aun así pesa más, se rechaza

// -------------------------------------------------------------- Tasa BCV

// La tasa oficial del BCV que muestra alcambio.app. El BCV no publica una API
// propia, así que alcambio.app y estos servicios leen la misma fuente oficial.
// Se intentan en orden hasta que uno responda: si el primero está caído o
// bloqueado por CORS, el siguiente cubre el hueco.
const RATE_PROVIDERS = [
  { id: 'dolarapi', label: 'BCV vía DolarAPI', url: 'https://ve.dolarapi.com/v1/dolares/oficial' },
  { id: 'pydolarve', label: 'BCV vía PyDolarVe', url: 'https://pydolarve.org/api/v1/dollar?page=bcv&monitor=usd' },
  { id: 'bcvapi', label: 'BCV vía BCV-API', url: 'https://bcv-api.rafnixg.dev/rates/' },
];

// Página de referencia que consulta la dueña.
const RATE_REFERENCE_URL = 'https://alcambio.app/';

// Tipos de movimiento de inventario. `sign` indica si suma o resta existencia.
const MOVEMENT_TYPES = {
  entrada: { label: 'Entrada de mercancía', sign: 1, color: 'emerald' },
  devolucion: { label: 'Devolución de cliente', sign: 1, color: 'amber' },
  ajuste_positivo: { label: 'Ajuste (sobrante)', sign: 1, color: 'sky' },
  ajuste_negativo: { label: 'Ajuste (faltante)', sign: -1, color: 'rose' },
  traspaso_entrada: { label: 'Traspaso recibido', sign: 1, color: 'brand' },
  traspaso_salida: { label: 'Traspaso enviado', sign: -1, color: 'slate' },
};

const STORAGE_KEYS = {
  products: 'inv_products',
  sales: 'inv_sales',
  audits: 'inv_audits',
  movements: 'inv_movements',
  layaways: 'inv_layaways',
  clients: 'inv_clients',
  settings: 'inv_settings',
  users: 'inv_users',
  session: 'inv_session',
  seeded: 'inv_seeded_v3',
};

const DEFAULT_SETTINGS = {
  rate: 40.00,               // Bs por USD — se actualiza sola desde el BCV
  rateUpdatedAt: null,
  autoRate: true,            // buscar la tasa del BCV al abrir el sistema
  rateSource: null,          // etiqueta de dónde salió la última tasa
  rateIsManual: false,       // true si la última tasa se escribió a mano
  lowStockThreshold: 3,      // a partir de cuántas unidades se avisa "se está acabando"
  storeName: "Geo's Shop",
  whatsappCountryCode: '58',
};

function seedProducts() {
  return [
    // Tienda de Damas
    { id: 'p-dam-001', storeId: 'damas', name: 'Blusa Manga Larga', sku: 'DAM-001', category: 'Blusas', size: 'M', color: 'Blanco', brand: 'Zara', photo: null, price: 15.00, stockInicial: 20 },
    { id: 'p-dam-002', storeId: 'damas', name: 'Pantalón Skinny', sku: 'DAM-002', category: 'Pantalones', size: '30', color: 'Negro', brand: "Levi's", photo: null, price: 25.00, stockInicial: 15 },
    { id: 'p-dam-003', storeId: 'damas', name: 'Vestido Largo Floral', sku: 'DAM-003', category: 'Vestidos Largos', size: 'S', color: 'Beige', brand: 'Stradivarius', photo: null, price: 35.00, stockInicial: 10 },
    { id: 'p-dam-004', storeId: 'damas', name: 'Vestido Corto Casual', sku: 'DAM-004', category: 'Vestidos Cortos', size: 'L', color: 'Rojo', brand: 'Bershka', photo: null, price: 28.00, stockInicial: 12 },
    { id: 'p-dam-005', storeId: 'damas', name: 'Falda Plisada', sku: 'DAM-005', category: 'Faldas', size: 'M', color: 'Azul', brand: 'H&M', photo: null, price: 18.00, stockInicial: 18 },
    { id: 'p-dam-006', storeId: 'damas', name: 'Conjunto Deportivo', sku: 'DAM-006', category: 'Conjuntos', size: 'XL', color: 'Gris', brand: 'Nike', photo: null, price: 32.00, stockInicial: 8 },
    // Tienda de Niños
    { id: 'p-nin-001', storeId: 'ninos', name: 'Camisa Escolar', sku: 'NIN-001', category: 'Camisas', size: '8', color: 'Blanco', brand: 'Nacional', photo: null, price: 10.00, stockInicial: 25 },
    { id: 'p-nin-002', storeId: 'ninos', name: 'Pantalón Jean', sku: 'NIN-002', category: 'Pantalones', size: '6', color: 'Azul', brand: "Carter's", photo: null, price: 14.00, stockInicial: 20 },
    { id: 'p-nin-003', storeId: 'ninos', name: 'Vestido de Fiesta', sku: 'NIN-003', category: 'Vestidos Cortos', size: '4', color: 'Rosado', brand: 'Gymboree', photo: null, price: 20.00, stockInicial: 10 },
    { id: 'p-nin-004', storeId: 'ninos', name: 'Short Deportivo', sku: 'NIN-004', category: 'Shorts', size: '10', color: 'Verde', brand: 'Adidas', photo: null, price: 9.00, stockInicial: 30 },
    { id: 'p-nin-005', storeId: 'ninos', name: 'Conjunto de Invierno', sku: 'NIN-005', category: 'Conjuntos', size: '2', color: 'Gris', brand: 'OshKosh', photo: null, price: 22.00, stockInicial: 15 },
    { id: 'p-nin-006', storeId: 'ninos', name: 'Falda Escolar', sku: 'NIN-006', category: 'Faldas', size: '12', color: 'Azul Marino', brand: 'Nacional', photo: null, price: 12.00, stockInicial: 18 },
  ];
}

function seedSales() {
  const today = new Date();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const mk = (id, storeId, date, clientName, clientPhone, paymentMethod, items) => {
    const fullItems = items.map(it => ({ ...it, subtotal: +(it.price * it.qty).toFixed(2) }));
    const subtotal = +fullItems.reduce((s, it) => s + it.subtotal, 0).toFixed(2);
    return {
      id, storeId, date: date.toISOString(), clientName, clientPhone, paymentMethod,
      items: fullItems, subtotal, discount: 0, total: subtotal,
      rate: DEFAULT_SETTINGS.rate, status: 'activa',
    };
  };

  return [
    mk('s-001', 'damas', today, 'Maria Gonzalez', '0414-1234567', 'Pago Móvil', [
      { productId: 'p-dam-001', sku: 'DAM-001', name: 'Blusa Manga Larga', size: 'M', color: 'Blanco', price: 15.00, qty: 2 },
      { productId: 'p-dam-003', sku: 'DAM-003', name: 'Vestido Largo Floral', size: 'S', color: 'Beige', price: 35.00, qty: 1 },
    ]),
    mk('s-002', 'damas', today, 'Ana Perez', '0424-1112233', 'Efectivo', [
      { productId: 'p-dam-002', sku: 'DAM-002', name: 'Pantalón Skinny', size: '30', color: 'Negro', price: 25.00, qty: 1 },
    ]),
    mk('s-003', 'damas', yesterday, 'Carla Ruiz', '0412-9998877', 'Punto de Venta', [
      { productId: 'p-dam-004', sku: 'DAM-004', name: 'Vestido Corto Casual', size: 'L', color: 'Rojo', price: 28.00, qty: 2 },
      { productId: 'p-dam-005', sku: 'DAM-005', name: 'Falda Plisada', size: 'M', color: 'Azul', price: 18.00, qty: 3 },
    ]),
    mk('s-004', 'damas', yesterday, 'Sofia Diaz', '0416-1234567', 'Divisas', [
      { productId: 'p-dam-005', sku: 'DAM-005', name: 'Falda Plisada', size: 'M', color: 'Azul', price: 18.00, qty: 3 },
      { productId: 'p-dam-006', sku: 'DAM-006', name: 'Conjunto Deportivo', size: 'XL', color: 'Gris', price: 32.00, qty: 1 },
    ]),
    mk('s-005', 'ninos', today, 'Pedro Martinez', '0414-1112222', 'Efectivo', [
      { productId: 'p-nin-001', sku: 'NIN-001', name: 'Camisa Escolar', size: '8', color: 'Blanco', price: 10.00, qty: 3 },
      { productId: 'p-nin-004', sku: 'NIN-004', name: 'Short Deportivo', size: '10', color: 'Verde', price: 9.00, qty: 2 },
    ]),
    mk('s-006', 'ninos', today, 'Laura Fernandez', '0424-1119988', 'Pago Móvil', [
      { productId: 'p-nin-002', sku: 'NIN-002', name: 'Pantalón Jean', size: '6', color: 'Azul', price: 14.00, qty: 2 },
    ]),
    mk('s-007', 'ninos', yesterday, 'Jose Ramirez', '0412-7773344', 'Punto de Venta', [
      { productId: 'p-nin-003', sku: 'NIN-003', name: 'Vestido de Fiesta', size: '4', color: 'Rosado', price: 20.00, qty: 1 },
      { productId: 'p-nin-006', sku: 'NIN-006', name: 'Falda Escolar', size: '12', color: 'Azul Marino', price: 12.00, qty: 2 },
    ]),
    mk('s-008', 'ninos', yesterday, 'Isabel Torres', '0416-1119911', 'Divisas', [
      { productId: 'p-nin-005', sku: 'NIN-005', name: 'Conjunto de Invierno', size: '2', color: 'Gris', price: 22.00, qty: 1 },
    ]),
  ];
}

function seedMovements() {
  const d = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return [
    { id: 'm-001', storeId: 'damas', productId: 'p-dam-001', sku: 'DAM-001', name: 'Blusa Manga Larga', type: 'entrada', qty: 10, date: d(3), note: 'Compra a proveedor — lote septiembre' },
    { id: 'm-002', storeId: 'damas', productId: 'p-dam-005', sku: 'DAM-005', name: 'Falda Plisada', type: 'entrada', qty: 6, date: d(2), note: 'Reposición' },
    { id: 'm-003', storeId: 'ninos', productId: 'p-nin-001', sku: 'NIN-001', name: 'Camisa Escolar', type: 'entrada', qty: 15, date: d(2), note: 'Temporada escolar' },
    { id: 'm-004', storeId: 'ninos', productId: 'p-nin-004', sku: 'NIN-004', name: 'Short Deportivo', type: 'ajuste_negativo', qty: 1, date: d(1), note: 'Prenda con defecto, dada de baja' },
  ];
}

function seedClients() {
  const d = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return [
    { id: 'c-001', name: 'Maria Gonzalez', phone: '0414-1234567', cedula: 'V-18.456.789', address: 'Av. Bolívar, Res. El Parque, Apto 4B', note: '', createdAt: d(30) },
    { id: 'c-002', name: 'Ana Perez', phone: '0424-1112233', cedula: 'V-20.114.552', address: 'Calle 12 con Av. Sucre, Casa 34', note: '', createdAt: d(25) },
    { id: 'c-003', name: 'Carla Ruiz', phone: '0412-9998877', cedula: 'V-15.998.321', address: 'Urb. Los Samanes, Calle 3', note: 'Prefiere tallas M', createdAt: d(20) },
    { id: 'c-004', name: 'Sofia Diaz', phone: '0416-1234567', cedula: '', address: '', note: '', createdAt: d(15) },
    { id: 'c-005', name: 'Pedro Martinez', phone: '0414-1112222', cedula: 'V-12.334.556', address: 'Sector La Cruz, Casa 12', note: '', createdAt: d(12) },
    { id: 'c-006', name: 'Laura Fernandez', phone: '0424-1119988', cedula: '', address: '', note: '', createdAt: d(10) },
    { id: 'c-007', name: 'Jose Ramirez', phone: '0412-7773344', cedula: '', address: '', note: '', createdAt: d(8) },
    { id: 'c-008', name: 'Isabel Torres', phone: '0416-1119911', cedula: '', address: '', note: '', createdAt: d(6) },
    { id: 'c-009', name: 'Rosa Medina', phone: '0414-5556677', cedula: 'V-19.887.443', address: 'Av. Principal, Edif. Centro, Piso 2', note: 'Apartado para graduación', createdAt: d(4) },
  ];
}

function seedLayaways() {
  const d = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  return [
    {
      id: 'l-001', storeId: 'damas', clientName: 'Rosa Medina', clientPhone: '0414-5556677',
      date: d(4), status: 'activo',
      items: [{ productId: 'p-dam-003', sku: 'DAM-003', name: 'Vestido Largo Floral', size: 'S', color: 'Beige', price: 35.00, qty: 1, subtotal: 35.00 }],
      total: 35.00,
      deposits: [{ amount: 15.00, method: 'Pago Móvil', date: d(4) }],
      note: 'Para graduación',
    },
  ];
}
