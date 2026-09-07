// Administración de usuarios. Solo la ve quien tiene el permiso `manageUsers`,
// que hoy es únicamente el rol de administradora.

const Users = (() => {

  async function render() {
    const root = document.getElementById('view-usuarios');

    // Segunda barrera: aunque alguien llegue a esta vista por otro camino, sin
    // el permiso no se dibuja nada.
    if (!Auth.can('manageUsers')) {
      root.innerHTML = `
        <div class="card p-8 text-center">
          <p class="text-slate-500">Esta sección es solo para la administradora.</p>
        </div>`;
      return;
    }

    const users = await DB.getUsers();
    const yo = Auth.currentUser();
    const porCambiar = users.filter(u => u.isDefaultPassword && u.active !== false).length;

    root.innerHTML = `
      <div class="flex flex-col gap-5">
        ${porCambiar ? `
        <div class="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
          <p class="text-sm text-amber-800">
            Hay ${porCambiar} ${porCambiar === 1 ? 'cuenta que sigue' : 'cuentas que siguen'} con la contraseña de fábrica.
            Cualquiera que conozca esas claves puede entrar: cámbialas con <span class="font-medium">Contraseña</span>.
          </p>
        </div>` : ''}

        <div class="flex flex-wrap items-center justify-between gap-3">
          <p class="text-sm text-slate-500">${users.length} usuario(s) · el modo de acceso decide a qué tiendas entra cada quien.</p>
          <button id="btn-new-user" class="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Nuevo Usuario
          </button>
        </div>

        <div class="card overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-slate-500 thead-row">
                <th class="px-4 py-3 font-medium">Nombre</th>
                <th class="px-4 py-3 font-medium">Usuario</th>
                <th class="px-4 py-3 font-medium">Modo de acceso</th>
                <th class="px-4 py-3 font-medium">Tiendas</th>
                <th class="px-4 py-3 font-medium">Última entrada</th>
                <th class="px-4 py-3 font-medium text-center">Estado</th>
                <th class="px-4 py-3 font-medium text-center">Acciones</th>
              </tr>
            </thead>
            <tbody>
              ${users.map(u => {
                const rol = roleOf(u.role);
                const tiendas = rol.stores.map(s => storeName(s).replace('Tienda de ', '')).join(' + ');
                const esYo = yo && u.id === yo.id;
                return `
                <tr class="border-b border-brand-50/70 hover:bg-brand-50/40 transition ${u.active === false ? 'opacity-55' : ''}">
                  <td class="px-4 py-3 font-medium text-slate-800">
                    ${escapar(u.name)}
                    ${esYo ? '<span class="ml-1 text-[10px] font-semibold text-brand-600 uppercase">tú</span>' : ''}
                  </td>
                  <td class="px-4 py-3 font-mono text-xs text-slate-500">${escapar(u.username)}</td>
                  <td class="px-4 py-3">
                    <span class="bg-brand-50 text-brand-700 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap">${rol.label}</span>
                    ${u.isDefaultPassword ? '<div class="text-[10px] text-amber-600 mt-0.5">contraseña de fábrica</div>' : ''}
                  </td>
                  <td class="px-4 py-3 text-slate-600 whitespace-nowrap">${tiendas}</td>
                  <td class="px-4 py-3 text-slate-500 whitespace-nowrap">${u.lastLogin ? fmtDateTime(u.lastLogin) : '<span class="text-slate-300">nunca</span>'}</td>
                  <td class="px-4 py-3 text-center">
                    <span class="inline-flex text-xs font-semibold px-2 py-1 rounded-full ${u.active === false ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-600'}">
                      ${u.active === false ? 'Desactivada' : 'Activa'}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-center gap-2 whitespace-nowrap">
                      <button data-edit="${u.id}" class="text-slate-500 hover:text-slate-700 text-xs font-medium">Editar</button>
                      <span class="text-slate-200">|</span>
                      <button data-pass="${u.id}" class="text-brand-600 hover:text-brand-800 text-xs font-medium">Contraseña</button>
                      ${esYo ? '' : `
                      <span class="text-slate-200">|</span>
                      <button data-del="${u.id}" class="text-rose-500 hover:text-rose-700 text-xs font-medium">Eliminar</button>`}
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div class="card p-5">
          <h3 class="text-sm font-semibold text-slate-700 mb-3">Qué puede hacer cada modo</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            ${ROLE_ORDER.map(id => {
              const r = ROLES[id];
              return `
              <div class="border border-brand-100 rounded-xl p-3.5">
                <p class="text-sm font-semibold text-slate-700">${r.label}</p>
                <p class="text-xs text-slate-500 mt-1">${r.description}</p>
                <p class="text-xs text-slate-400 mt-1.5">Tiendas: ${r.stores.map(s => storeName(s)).join(' · ')}</p>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    document.getElementById('btn-new-user').addEventListener('click', () => openUserModal(null));
    root.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', async () => {
      openUserModal(await DB.getUser(b.dataset.edit));
    }));
    root.querySelectorAll('[data-pass]').forEach(b => b.addEventListener('click', async () => {
      openPasswordModal(await DB.getUser(b.dataset.pass));
    }));
    root.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      const u = await DB.getUser(b.dataset.del);
      if (!u) return;
      if (!confirmDialog(`¿Eliminar a ${u.name} (${u.username})? No podrá volver a entrar.`)) return;
      try {
        await DB.deleteUser(u.id);
        toast('Usuario eliminado', 'info');
        render();
      } catch (err) {
        toast(err.message, 'error');
      }
    }));
  }

  // ------------------------------------------------------ Alta y edición

  function openUserModal(user) {
    const esEdicion = !!user;
    const yo = Auth.currentUser();
    const esYoMismo = esEdicion && yo && user.id === yo.id;

    openModal(`
      <form id="user-form" class="p-6 flex flex-col gap-4">
        <h3 class="text-lg font-semibold text-slate-800">${esEdicion ? 'Editar Usuario' : 'Nuevo Usuario'}</h3>

        <div>
          <label class="text-xs font-medium text-slate-500">Nombre</label>
          <input required name="name" value="${escapar(user?.name || '')}" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. María González">
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500">Usuario (con el que entra)</label>
          <input required name="username" value="${escapar(user?.username || '')}" autocapitalize="none" spellcheck="false"
            class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Ej. maria">
          <p class="text-xs text-slate-400 mt-1">Entre 3 y 20 caracteres: letras, números, punto, guion o guion bajo.</p>
        </div>

        <div>
          <label class="text-xs font-medium text-slate-500">Modo de acceso</label>
          <div class="mt-1.5 flex flex-col gap-2">
            ${ROLE_ORDER.map(id => {
              const r = ROLES[id];
              const marcado = (user?.role || 'vendedor_damas') === id;
              return `
              <label class="flex items-start gap-3 border border-slate-200 rounded-xl p-3 cursor-pointer hover:bg-brand-50/50 transition has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50/70">
                <input type="radio" name="role" value="${id}" ${marcado ? 'checked' : ''} class="mt-0.5 text-brand-600 focus:ring-brand-300">
                <span class="min-w-0">
                  <span class="block text-sm font-medium text-slate-700">${r.label}</span>
                  <span class="block text-xs text-slate-500">${r.description}</span>
                </span>
              </label>`;
            }).join('')}
          </div>
        </div>

        ${esEdicion ? `
        <label class="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <input type="checkbox" name="active" ${user.active !== false ? 'checked' : ''} ${esYoMismo ? 'disabled' : ''} class="rounded border-slate-300 text-brand-600 focus:ring-brand-300">
          Cuenta activa (puede entrar al sistema)
          ${esYoMismo ? '<span class="text-xs text-slate-400">— no puedes desactivarte a ti misma</span>' : ''}
        </label>` : `
        <div>
          <label class="text-xs font-medium text-slate-500">Contraseña</label>
          <input required type="password" name="password" minlength="6" autocomplete="new-password"
            class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Mínimo 6 caracteres">
        </div>`}

        <p id="user-error" class="hidden text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-user" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">${esEdicion ? 'Guardar Cambios' : 'Crear Usuario'}</button>
        </div>
      </form>`);

    document.getElementById('btn-cancel-user').addEventListener('click', closeModal);

    document.getElementById('user-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = document.getElementById('user-error');
      error.classList.add('hidden');
      const fd = new FormData(e.target);

      const datos = {
        id: user?.id,
        name: fd.get('name').trim(),
        username: fd.get('username').trim().toLowerCase(),
        role: fd.get('role'),
        active: esEdicion ? (esYoMismo ? true : fd.get('active') === 'on') : true,
      };

      const problemas = Auth.validarUsuario(datos, { existente: user });
      if (!esEdicion) {
        const p = Auth.validarPassword(fd.get('password'));
        if (p) problemas.push(p);
      }
      if (problemas.length) {
        error.textContent = problemas[0];
        error.classList.remove('hidden');
        return;
      }

      try {
        const guardado = await DB.saveUser(datos);
        if (!esEdicion) {
          await DB.setUserPassword(guardado.id, fd.get('password'));
        }
        // Si la administradora se editó a sí misma, hay que releer su sesión:
        // pudo haberse cambiado el rol y con él las tiendas a las que entra.
        if (esYoMismo) {
          await Auth.refreshCurrentUser();
          aplicarCambioDeRolPropio();
        }
        closeModal();
        toast(esEdicion ? 'Usuario actualizado' : 'Usuario creado');
        render();
      } catch (err) {
        error.textContent = err.message;
        error.classList.remove('hidden');
      }
    });
  }

  // ------------------------------------------------------------ Contraseña

  // Sirve para dos casos: la administradora cambiando la clave de alguien, y
  // cualquiera cambiando la suya. Cuando es la propia, se pide la actual.
  function openPasswordModal(user, { propia = false } = {}) {
    if (!user) return;

    openModal(`
      <form id="pass-form" class="p-6 flex flex-col gap-4">
        <div>
          <h3 class="text-lg font-semibold text-slate-800">${propia ? 'Cambiar mi contraseña' : 'Cambiar contraseña'}</h3>
          <p class="text-sm text-slate-400">${propia ? 'Tu cuenta' : escapar(user.name)} · <span class="font-mono">${escapar(user.username)}</span></p>
        </div>

        ${propia ? `
        <div>
          <label class="text-xs font-medium text-slate-500">Contraseña actual</label>
          <input required type="password" name="actual" autocomplete="current-password" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
        </div>` : ''}

        <div>
          <label class="text-xs font-medium text-slate-500">Contraseña nueva</label>
          <input required type="password" name="nueva" minlength="6" autocomplete="new-password" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300" placeholder="Mínimo 6 caracteres">
        </div>
        <div>
          <label class="text-xs font-medium text-slate-500">Repite la contraseña nueva</label>
          <input required type="password" name="repetir" minlength="6" autocomplete="new-password" class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300">
        </div>

        <p id="pass-error" class="hidden text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>

        <div class="flex justify-end gap-2 pt-2">
          <button type="button" id="btn-cancel-pass" class="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700">Cancelar</button>
          <button type="submit" class="px-5 py-2.5 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-xl shadow-sm">Guardar</button>
        </div>
      </form>`);

    document.getElementById('btn-cancel-pass').addEventListener('click', closeModal);

    document.getElementById('pass-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const error = document.getElementById('pass-error');
      error.classList.add('hidden');
      const fd = new FormData(e.target);
      const nueva = fd.get('nueva');

      const mostrar = (msg) => { error.textContent = msg; error.classList.remove('hidden'); };

      if (nueva !== fd.get('repetir')) return mostrar('Las dos contraseñas nuevas no coinciden.');
      const problema = Auth.validarPassword(nueva);
      if (problema) return mostrar(problema);

      if (propia) {
        const fresco = await DB.getUser(user.id);
        const correcta = await Auth.verifyPassword(fd.get('actual'), fresco);
        if (!correcta) return mostrar('La contraseña actual no es correcta.');
      }

      try {
        await DB.setUserPassword(user.id, nueva);
        const yo = Auth.currentUser();
        if (yo && yo.id === user.id) await Auth.refreshCurrentUser();
        closeModal();
        toast('Contraseña actualizada');
        if (AppState.currentView === 'usuarios') render();
        renderUserChip();
      } catch (err) {
        mostrar(err.message);
      }
    });
  }

  function escapar(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { render, openUserModal, openPasswordModal };
})();
