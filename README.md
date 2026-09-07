# Geo's Shop — Inventario y Ventas

Sistema de inventario, ventas y apartados para las dos tiendas: **Geo's Shop**
(damas) y **Geo's Shop Kids** (niños).

No necesita instalación, servidor ni base de datos: son archivos HTML, CSS y
JavaScript. Los datos se guardan en el navegador de la computadora donde lo
abras.

## Cómo correrlo

### Lo más simple

Abre `index.html` con doble clic. Funciona todo menos la búsqueda automática de
la tasa del BCV: los navegadores bloquean las consultas a internet cuando la
página se abre como archivo suelto (`file://`). La tasa se puede escribir a mano
sin problema.

### Recomendado (para que la tasa del BCV funcione sola)

Abre la carpeta del proyecto en una terminal y levanta un servidor local:

```bash
# Con Python (ya viene instalado en la mayoría de las computadoras)
python -m http.server 8000

# O con Node
npx http-server -p 8000
```

Luego entra a **http://localhost:8000** en el navegador.

## Cómo se guardan los datos

Todo vive en el navegador (`localStorage`), en la computadora donde se usa. Esto
tiene dos consecuencias importantes:

- **No se comparte entre computadoras.** Lo que cargues en una máquina no
  aparece en otra.
- **El espacio es limitado** (unos 5 MB en total, fotos incluidas).

Por eso conviene usar **Ajustes de Datos → Descargar respaldo** con frecuencia.
El archivo que baja incluye el catálogo, las ventas, los clientes, los apartados
y las fotos, y se puede volver a cargar con **Importar respaldo**.

## Entrar al sistema

El sistema pide usuario y contraseña. La primera vez crea cuatro cuentas, una
por cada modo de acceso, y **la pantalla de entrada las muestra** para que puedas
probarlas:

| Usuario | Contraseña | Modo de acceso | Entra a |
|---|---|---|---|
| `geo` | `admin123` | Administrador | Damas + Niños, y administra usuarios |
| `ambas` | `ambas123` | Vendedora — Ambas Tiendas | Damas + Niños |
| `damas` | `damas123` | Vendedora — Tienda de Damas | Solo Damas |
| `ninos` | `ninos123` | Vendedora — Tienda de Niños | Solo Niños |

> **Cambia estas contraseñas antes de usar el sistema en la tienda.** Están
> escritas en el código y en este archivo: cualquiera que los vea puede entrar.
> Se cambian desde **Usuarios → Contraseña** (la administradora) o desde la
> ficha de abajo a la izquierda → **Cambiar mi contraseña** (cada quien la suya).
> El aviso amarillo desaparece solo cuando ya no queda ninguna de fábrica.

### Los cuatro modos

- **Administrador** — entra a las dos tiendas y es el único que crea, edita,
  desactiva y elimina usuarios.
- **Vendedora — Ambas Tiendas** — vende en las dos tiendas, pero no administra
  usuarios.
- **Vendedora — Tienda de Damas** — solo ve la tienda de damas. No hay selector
  de tienda: no tiene entre qué elegir.
- **Vendedora — Tienda de Niños** — igual, solo la tienda de niños.

La sesión queda abierta al recargar la página y se cierra desde la ficha del
usuario, abajo a la izquierda.

El sistema no se queda nunca sin quien lo administre: no deja eliminar,
desactivar ni cambiarle el rol a la última administradora activa.

### Hasta dónde llega el login

Conviene tenerlo claro. Este sistema corre entero dentro del navegador, sin
servidor. El login **separa quién usa la caja y a qué tienda entra cada quien**,
que es lo que hace falta en el día a día de la tienda.

Lo que **no** es: una barrera contra alguien que quiera forzarla. Quien tenga
acceso a la computadora y sepa usar las herramientas del navegador puede
saltárselo. Para una barrera de verdad haría falta que los datos vivieran en un
servidor, no en el navegador.

Lo que sí se cuida: las contraseñas nunca se guardan tal cual. Se guardan
derivadas con PBKDF2 (150.000 iteraciones, SHA-256) y una sal distinta por
usuario, así que ni abriendo el respaldo se leen. El sistema tampoco revela si
un usuario existe: la respuesta es la misma para un usuario inventado que para
una contraseña equivocada.

## Funciones

### Dos tiendas con identidad propia

El selector **Tienda Activa** cambia entre Damas y Niños. Al pasar a Niños, el
sistema completo se repinta: el nombre cambia a **Geo's Shop Kids** —con "Kids"
en el turquesa del logo— y los colores pasan del rosado al turquesa, incluido lo
que se imprime.

### Tasa del BCV automática

La tasa de bolívares por dólar se busca sola al abrir el sistema cada día. Es la
tasa oficial del BCV, la misma que publica [alcambio.app](https://alcambio.app/).

El botón de la tasa (arriba a la derecha) tiene una flecha circular para buscarla
en el momento, y al abrirlo se puede apagar la búsqueda automática o escribir la
tasa a mano.

Si no hay internet, el sistema conserva la última tasa conocida y avisa; nunca se
queda sin poder vender.

> **Detalle técnico:** alcambio.app no publica una API que un navegador pueda
> consultar directamente. Lo que sí es público es la fuente que ambos usan: la
> tasa oficial del BCV. El sistema la consulta en varios servicios que leen ese
> mismo dato y que sí permiten consultas desde el navegador, intentándolos en
> orden hasta que uno responda. Los servicios están listados en
> `js/data.js` (`RATE_PROVIDERS`) y se pueden cambiar ahí.

### Foto de cada prenda

Al cargar una prenda se le puede poner una foto, para reconocer el modelo exacto
de un vistazo. Se elige con un toque o arrastrándola al recuadro.

La foto aparece como miniatura en el catálogo y en el buscador de ventas, y se
amplía al tocarla.

Como el espacio del navegador es limitado, **cada foto se reduce antes de
guardarse**: se reescala a 640 px de lado mayor y se recomprime, quedando en unos
30–60 KB en vez de los 2–6 MB que pesa una foto de celular. Los valores están en
`js/data.js` (`PHOTO_MAX_DIM`, `PHOTO_QUALITY`).

Las fotos no se copian dentro de cada venta, solo viven en el catálogo: así el
historial de ventas no engorda.

### Marca de la prenda

Cada prenda lleva su marca. El campo sugiere las marcas que ya usaste más una
lista común, pero acepta cualquier texto.

La marca se ve en el catálogo y en el buscador de ventas, se puede filtrar por
ella y el buscador del catálogo también la encuentra.

## Archivos

```
index.html          Estructura de la página
css/styles.css      Paletas por tienda, tarjetas, fotos y marca
js/data.js          Tiendas, marca visual, roles, categorías, fotos, tasa
js/db.js            Guardado en el navegador, inventario, usuarios, migraciones
js/auth.js          Contraseñas, sesión y permisos por rol
js/login.js         Pantalla de entrada
js/users.js         Administración de usuarios (solo administradora)
js/ui.js            Formatos, modales, avisos, marca de la tienda, impresión
js/photos.js        Lectura y reducción de las fotos de prendas
js/rate.js          Consulta de la tasa del BCV
js/app.js           Navegación, cambio de tienda, tasa del día, respaldos
js/dashboard.js     Resumen del día
js/catalog.js       Catálogo, movimientos de inventario
js/sales.js         Registro de ventas
js/layaway.js       Apartados y abonos
js/clients.js       Fichas de clientes
js/audit.js         Conteo físico contra sistema
js/reports.js       Cuadres por día, semana y mes
js/restock.js       Lista de reposición
```
