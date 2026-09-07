// Pantalla de entrada. Se muestra sobre todo lo demás mientras no haya sesión.

const Login = (() => {

  // Cuando todavía existen usuarios con la contraseña de fábrica, la pantalla
  // los lista: es la única forma de que alguien entre la primera vez. En cuanto
  // se cambian todas las contraseñas, la lista desaparece sola.
  async function usuariosDeFabrica() {
    const users = await DB.getUsers();
    return users.filter(u => u.isDefaultPassword && u.active !== false);
  }

  async function render() {
    const root = document.getElementById('login-root');
    const porCambiar = await usuariosDeFabrica();
    const claves = Object.fromEntries(SEED_USERS.map(s => [s.username, s.password]));

    root.innerHTML = `
      <div class="min-h-screen flex items-center justify-center p-4">
        <div class="w-full max-w-sm">
          <div class="flex flex-col items-center mb-6">
            <div class="brand-avatar w-20 h-20 rounded-full flex items-center justify-center mb-3">
              <span class="brand-avatar-initial font-brand text-4xl leading-none -mt-1">G</span>
            </div>
            <div class="font-brand text-3xl leading-tight text-center">
              <span class="brand-primary">Geo's Shop</span>
            </div>
            <p class="text-[11px] text-slate-400 tracking-wider uppercase mt-0.5">Inventario y Ventas</p>
          </div>

          <form id="login-form" class="card p-6 flex flex-col gap-4">
            <div>
              <label class="text-xs font-medium text-slate-500">Usuario</label>
              <input required name="username" id="login-user" autocomplete="username" autocapitalize="none" spellcheck="false"
                class="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                placeholder="Tu nombre de usuario">
            </div>
            <div>
              <label class="text-xs font-medium text-slate-500">Contraseña</label>
              <div class="relative mt-1">
                <input required type="password" name="password" id="login-pass" autocomplete="current-password"
                  class="w-full border border-slate-200 rounded-lg px-3 py-2.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
                  placeholder="Tu contraseña">
                <button type="button" id="btn-ver-pass" title="Mostrar u ocultar la contraseña"
                  class="absolute inset-y-0 right-0 px-3 text-slate-400 hover:text-slate-600">
                  <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                </button>
              </div>
            </div>

            <p id="login-error" class="hidden text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2"></p>

            <button type="submit" id="btn-login"
              class="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-xl shadow-sm transition">
              Entrar
            </button>
          </form>

          ${porCambiar.length ? `
          <div class="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p class="text-xs font-semibold text-amber-800 mb-2">Contraseñas de fábrica — cámbialas antes de usar el sistema en la tienda</p>
            <div class="flex flex-col gap-1">
              ${porCambiar.map(u => `
                <button type="button" data-entrar="${u.username}" class="text-left text-xs text-amber-900 hover:bg-amber-100 rounded px-2 py-1.5 transition flex items-center justify-between gap-2">
                  <span><span class="font-mono font-semibold">${u.username}</span> · ${roleOf(u.role).label}</span>
                  <span class="font-mono text-amber-700">${claves[u.username] || ''}</span>
                </button>`).join('')}
            </div>
            <p class="text-[11px] text-amber-700 mt-2">Toca una para rellenar los datos. La administradora las cambia desde <span class="font-medium">Usuarios</span>.</p>
          </div>` : ''}

          ${!Auth.hayCripto() ? `
          <div class="mt-4 bg-rose-50 border border-rose-200 rounded-xl p-4 text-xs text-rose-800">
            Este navegador no permite verificar contraseñas de forma segura al abrir el archivo directamente.
            Abre el sistema desde <span class="font-mono">http://localhost</span> (ver el README).
          </div>` : ''}
        </div>
      </div>`;

    const form = document.getElementById('login-form');
    const error = document.getElementById('login-error');
    const btn = document.getElementById('btn-login');

    document.getElementById('btn-ver-pass').addEventListener('click', () => {
      const campo = document.getElementById('login-pass');
      campo.type = campo.type === 'password' ? 'text' : 'password';
      campo.focus();
    });

    root.querySelectorAll('[data-entrar]').forEach(b => b.addEventListener('click', () => {
      document.getElementById('login-user').value = b.dataset.entrar;
      document.getElementById('login-pass').value = claves[b.dataset.entrar] || '';
      document.getElementById('login-pass').focus();
    }));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      error.classList.add('hidden');
      btn.disabled = true;
      btn.textContent = 'Entrando…';

      const fd = new FormData(form);
      let res;
      try {
        res = await Auth.login(fd.get('username'), fd.get('password'));
      } catch (err) {
        res = { ok: false, error: err.message };
      }

      if (!res.ok) {
        error.textContent = res.error;
        error.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = 'Entrar';
        document.getElementById('login-pass').select();
        return;
      }

      hide();
      await bootApp();
    });

    document.getElementById('login-user').focus();
  }

  function show() {
    document.getElementById('login-root').classList.remove('hidden');
    document.getElementById('app-root').classList.add('hidden');
    // La pantalla de entrada siempre usa la identidad de Geo's Shop.
    applyStoreTheme('damas');
    document.title = "Geo's Shop — Entrar";
    render();
  }

  function hide() {
    document.getElementById('login-root').classList.add('hidden');
    document.getElementById('login-root').innerHTML = '';
    document.getElementById('app-root').classList.remove('hidden');
  }

  return { show, hide, render };
})();
