// Página web con los mismos dashboards que el Kindle: clic en una tarjeta para el detalle, flechas o deslizar
// para cambiar de pantalla, Esc o la X para volver. Se entra con WEB_KEY en un formulario y queda una cookie
// de sesión; la clave nunca va en la URL.
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { config } from './config.js';
import { getState } from './store.js';
import { renderSvg, pageIndex, isView, viewAfterTap, WIDTH, HEIGHT } from './render/render.js';

const COOKIE = 'kd_web';
const MAX_AGE = 30 * 24 * 3600;

// La cookie lleva una firma derivada de la clave, no la clave: cambiar WEB_KEY cierra todas las sesiones.
const sessionToken = () => crypto.createHmac('sha256', config.webKey).update('kindle-dashboard web').digest('base64url');

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function cookies(req) {
  return Object.fromEntries(
    (req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter(([k]) => k).map(([k, ...v]) => [k, v.join('=')]),
  );
}

const loggedIn = (req) => Boolean(config.webKey) && safeEqual(cookies(req)[COOKIE] || '', sessionToken());

// Railway termina TLS en su proxy: la cookie se marca Secure cuando la petición original fue HTTPS.
const secure = (req) => req.headers['x-forwarded-proto'] === 'https';
const cookie = (req, value, maxAge) =>
  `${COOKIE}=${value}; Path=/web; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure(req) ? '; Secure' : ''}`;

const BASE_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

function reply(res, status, body, headers = {}) {
  res.writeHead(status, { ...BASE_HEADERS, ...headers });
  res.end(body);
}

async function readForm(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 10_000) throw new Error('formulario demasiado grande');
  }
  return new URLSearchParams(raw);
}

const STYLE = `
  :root { color-scheme: light dark; --bg: #c9c9c9; --ink: #111; --dim: #555; --card: #fff; }
  @media (prefers-color-scheme: dark) { :root { --bg: #1e1e1e; --ink: #eee; --dim: #aaa; --card: #2a2a2a; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font: 16px/1.4 system-ui, sans-serif; }
`;

function page(title, body, nonce) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<style nonce="${nonce}">${STYLE}</style>
</head>
${body}
</html>`;
}

function loginPage(nonce, error) {
  return page(
    'Kindle Dashboard',
    `<body>
<style nonce="${nonce}">
  main { max-width: 360px; margin: 18vh auto 0; padding: 0 16px; }
  form { display: flex; flex-direction: column; gap: 12px; background: var(--card); padding: 24px; border-radius: 16px; }
  h1 { margin: 0 0 4px; font-size: 22px; }
  input, button { font: inherit; padding: 10px 12px; border-radius: 10px; border: 1px solid var(--dim); background: transparent; color: inherit; }
  button { background: var(--ink); color: var(--card); border: 0; font-weight: 600; cursor: pointer; }
  .error { color: #c62828; margin: 0; }
</style>
<main>
  <form method="post" action="/web/login">
    <h1>Kindle Dashboard</h1>
    ${error ? '<p class="error">Clave incorrecta</p>' : ''}
    <label for="key">Clave de acceso</label>
    <input id="key" name="key" type="password" autocomplete="current-password" required autofocus>
    <button type="submit">Entrar</button>
  </form>
</main>
</body>`,
    nonce,
  );
}

function dashboardPage(nonce) {
  return page(
    'Kindle Dashboard',
    `<body>
<style nonce="${nonce}">
  main { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 12px 16px; }
  #screen { width: min(100%, calc((100vh - 70px) * ${WIDTH} / ${HEIGHT})); aspect-ratio: ${WIDTH} / ${HEIGHT};
            border-radius: 12px; overflow: hidden; background: #d6d6d6; touch-action: pan-y; cursor: pointer; position: relative; }
  #screen img { width: 100%; height: 100%; display: block; user-select: none; -webkit-user-drag: none; transition: opacity .15s; }
  /* Sin imagen todavía, el navegador pintaría el icono de imagen rota con el texto alternativo. */
  #screen img:not([src]) { visibility: hidden; }
  #loader { position: absolute; inset: 0; display: none; flex-direction: column; align-items: center; justify-content: center;
            gap: 14px; color: #4a4a4a; font-size: 15px; pointer-events: none; }
  #loader i { width: 34px; height: 34px; border-radius: 50%; border: 4px solid #b0b0b0; border-top-color: #1a1a1a;
              animation: spin .8s linear infinite; }
  #screen.loading #loader { display: flex; }
  #screen.loading img[src] { opacity: .45; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { #loader i { animation-duration: 2.4s; } }
  nav { display: flex; gap: 8px; align-items: center; color: var(--dim); font-size: 14px; flex-wrap: wrap; justify-content: center; }
  button { font: inherit; padding: 6px 12px; border-radius: 8px; border: 1px solid var(--dim); background: transparent; color: inherit; cursor: pointer; }
  button:disabled { opacity: .4; cursor: default; }
  #status { min-width: 9em; text-align: center; }
</style>
<main>
  <div id="screen" class="loading" role="img" aria-label="Dashboard" aria-busy="true"><img id="img" alt="Dashboard"><div id="loader"><i></i><span>Cargando dashboard…</span></div></div>
  <nav>
    <button id="prev" type="button" aria-label="Pantalla anterior">←</button>
    <button id="back" type="button">Volver</button>
    <button id="next" type="button" aria-label="Pantalla siguiente">→</button>
    <span id="status">cargando…</span>
    <form method="post" action="/web/logout"><button type="submit">Salir</button></form>
  </nav>
</main>
<script nonce="${nonce}">
  const W = ${WIDTH}, H = ${HEIGHT}, EVERY = ${config.refreshMinutes} * 60_000;
  const state = { page: 0, view: '' };
  const $ = (id) => document.getElementById(id);
  let busy = false, url = null;

  async function draw(tap) {
    if (busy) return;
    busy = true;
    $('status').textContent = 'cargando…';
    $('screen').classList.add('loading');
    $('screen').setAttribute('aria-busy', 'true');
    try {
      const q = new URLSearchParams({ page: state.page, view: state.view });
      if (tap) q.set('tap', tap.map(Math.round).join(','));
      const res = await fetch('/web/dash.svg?' + q, { credentials: 'same-origin' });
      if (res.status === 401) return location.reload();
      if (!res.ok) throw new Error(res.status);
      const v = res.headers.get('X-View');
      state.view = v === 'grid' ? '' : v;
      const next = URL.createObjectURL(await res.blob());
      $('img').src = next;
      if (url) URL.revokeObjectURL(url);
      url = next;
      $('back').disabled = !state.view;
      $('prev').disabled = $('next').disabled = Boolean(state.view);
      $('status').textContent = 'actualizado ' + new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      $('status').textContent = 'error al cargar';
    } finally {
      busy = false;
      $('screen').classList.remove('loading');
      $('screen').setAttribute('aria-busy', 'false');
    }
  }

  const turn = (step) => { if (!state.view) { state.page += step; draw(); } };
  const home = () => { if (state.view) { state.view = ''; draw(); } };

  // Clic o toque: coordenadas en píxeles de la imagen del servidor, igual que el Kindle.
  let start = null;
  $('screen').addEventListener('pointerdown', (e) => { start = { x: e.clientX, y: e.clientY }; });
  $('screen').addEventListener('pointerup', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    const r = $('screen').getBoundingClientRect();
    start = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) return turn(dx < 0 ? 1 : -1);
    if (dy < -80 && Math.abs(dy) > Math.abs(dx) * 1.5) return home();
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) draw([(e.clientX - r.left) * W / r.width, (e.clientY - r.top) * H / r.height]);
  });
  $('prev').addEventListener('click', () => turn(-1));
  $('next').addEventListener('click', () => turn(1));
  $('back').addEventListener('click', home);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') turn(-1);
    else if (e.key === 'ArrowRight') turn(1);
    else if (e.key === 'Escape') home();
  });
  setInterval(() => { if (!document.hidden) draw(); }, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) draw(); });
  draw();
</script>
</body>`,
    nonce,
  );
}

function html(res, status, body, nonce, headers = {}) {
  reply(res, status, body, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Security-Policy': `default-src 'none'; img-src blob:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`,
    ...headers,
  });
}

// Devuelve true si atendió la petición (todo lo que empieza por /web).
export async function handleWeb(req, res, url) {
  if (url.pathname !== '/web' && !url.pathname.startsWith('/web/')) return false;
  const nonce = crypto.randomBytes(16).toString('base64');
  if (!config.webKey) {
    reply(res, 503, 'La página web está desactivada: configura WEB_KEY.', { 'Content-Type': 'text/plain; charset=utf-8' });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/web/login') {
    const key = (await readForm(req)).get('key') || '';
    if (!safeEqual(key, config.webKey)) {
      await new Promise((r) => setTimeout(r, 1000)); // frena los intentos de adivinar la clave
      html(res, 401, loginPage(nonce, true), nonce);
      return true;
    }
    reply(res, 303, '', { Location: '/web', 'Set-Cookie': cookie(req, sessionToken(), MAX_AGE) });
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/web/logout') {
    reply(res, 303, '', { Location: '/web', 'Set-Cookie': cookie(req, '', 0) });
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/web') {
    html(res, 200, loggedIn(req) ? dashboardPage(nonce) : loginPage(nonce, false), nonce);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/web/dash.svg') {
    if (!loggedIn(req)) {
      reply(res, 401, 'unauthorized', { 'Content-Type': 'text/plain' });
      return true;
    }
    const opts = {
      page: pageIndex(url.searchParams.get('page')),
      view: isView(url.searchParams.get('view')) ? url.searchParams.get('view') : '',
      refreshMinutes: config.refreshMinutes,
    };
    const tap = (url.searchParams.get('tap') || '').match(/^(\d+),(\d+)$/);
    if (tap) opts.view = await viewAfterTap(getState(), opts, Number(tap[1]), Number(tap[2]));
    // satori convierte el texto en trazos: el SVG pesa unos 700 KB y comprimido baja a una fracción.
    const svg = await renderSvg(getState(), opts);
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    reply(res, 200, gzip ? zlib.gzipSync(svg) : svg, {
      'Content-Type': 'image/svg+xml',
      'X-View': opts.view || 'grid',
      ...(gzip && { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }),
    });
    return true;
  }

  reply(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  return true;
}
