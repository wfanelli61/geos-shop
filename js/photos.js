// Fotos de prendas: leer el archivo que elige la dueña, reducirlo y guardarlo
// junto al producto.
//
// Todo el sistema guarda sus datos en el navegador (localStorage), y ese
// espacio ronda los 5 MB en total. Una foto de celular pesa entre 2 y 6 MB, así
// que guardarla tal cual llenaría el cupo con dos o tres prendas y rompería el
// resto del sistema. Por eso cada imagen se reescala y se recomprime antes de
// guardarse: queda en unos 30-60 KB, suficiente para reconocer el modelo.

const Photos = (() => {

  // Lee un File y devuelve un data URL listo para guardar, ya reducido.
  async function fromFile(file) {
    if (!file) return null;
    if (!file.type.startsWith('image/')) {
      throw new Error('Ese archivo no es una imagen.');
    }
    const dataUrl = await readAsDataUrl(file);
    const img = await loadImage(dataUrl);
    const reduced = resizeToDataUrl(img);

    if (approxBytes(reduced) > PHOTO_MAX_BYTES) {
      throw new Error('La imagen es demasiado pesada incluso después de reducirla. Prueba con otra foto.');
    }
    return reduced;
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo abrir la imagen.'));
      img.src = src;
    });
  }

  // Reescala manteniendo la proporción: el lado más largo queda en PHOTO_MAX_DIM.
  function resizeToDataUrl(img) {
    const { width, height } = img;
    const escala = Math.min(1, PHOTO_MAX_DIM / Math.max(width, height));
    const w = Math.max(1, Math.round(width * escala));
    const h = Math.max(1, Math.round(height * escala));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    // Fondo blanco: los PNG transparentes quedarían negros al pasar a JPEG.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/jpeg', PHOTO_QUALITY);
  }

  // Tamaño aproximado en bytes de un data URL base64.
  function approxBytes(dataUrl) {
    if (!dataUrl) return 0;
    const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    return Math.round(base64.length * 3 / 4);
  }

  function fmtSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  // Miniatura para las tablas. Si no hay foto, un cuadrito con un ícono.
  function thumb(product, extraClass = '') {
    if (!product || !product.photo) {
      return `<div class="foto-vacia ${extraClass}" title="Sin foto">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>
      </div>`;
    }
    const alt = escapeAttr(product.size ? `${product.name} — talla ${product.size}` : (product.name || 'Prenda'));
    return `<img src="${product.photo}" alt="${alt}" title="${alt}" class="foto-thumb ${extraClass}" data-foto-ver="${escapeAttr(product.photo)}">`;
  }

  // Abre la foto en grande. Se cierra tocando fuera o con Escape.
  function openLightbox(src, caption = '') {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="fixed inset-0 bg-slate-900/80 flex flex-col items-center justify-center p-4 z-[60]" id="foto-backdrop">
        <img src="${src}" class="foto-lightbox" alt="${escapeAttr(caption)}">
        ${caption ? `<p class="text-white/90 text-sm mt-4 text-center">${caption}</p>` : ''}
        <button id="foto-cerrar" class="mt-4 text-white/70 hover:text-white text-sm font-medium">Cerrar</button>
      </div>`;
    const cerrar = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') cerrar(); };
    document.getElementById('foto-backdrop').addEventListener('click', (e) => {
      if (e.target.id === 'foto-backdrop') cerrar();
    });
    document.getElementById('foto-cerrar').addEventListener('click', cerrar);
    document.addEventListener('keydown', onKey);
  }

  // Conecta todas las miniaturas de un contenedor para que se amplíen al tocarlas.
  function wireThumbs(container) {
    (container || document).querySelectorAll('[data-foto-ver]').forEach(img => {
      img.addEventListener('click', (e) => {
        e.stopPropagation();
        openLightbox(img.dataset.fotoVer, img.getAttribute('alt') || '');
      });
    });
  }

  function escapeAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  return { fromFile, thumb, openLightbox, wireThumbs, approxBytes, fmtSize, escapeAttr };
})();
