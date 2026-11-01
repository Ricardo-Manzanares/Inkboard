import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { load, getState, put, putError, putImmich } from './store.js';
import { renderPng, renderWidget, widgetTheme, WIDGET_WIDTH, pageIndex, isView, viewAfterTap } from './render/render.js';
import { handleWeb } from './web.js';
import { collectGithub } from './collectors/github.js';
import { collectGsc } from './collectors/gsc.js';
import { collectRailway } from './collectors/railway.js';
import { collectBilling } from './collectors/billing.js';

load();

// Fuentes en la nube que el propio servidor consulta. Claude, Immich y la red local llegan del agente del PC por /api/ingest.
const collectors = [
  { name: 'github', run: collectGithub, everyMin: config.github.everyMin, enabled: config.github.token },
  { name: 'gsc', run: collectGsc, everyMin: config.gsc.everyMin, enabled: config.gsc.siteUrl && config.google.credentials },
  { name: 'billing', run: collectBilling, everyMin: config.billing.everyMin, enabled: config.billing.table && config.billing.projectIds.length && config.google.credentials },
  { name: 'railway', run: collectRailway, everyMin: config.railway.everyMin, enabled: config.railway.token },
];

async function runCollector(c) {
  try {
    put(c.name, await c.run());
    console.log(`[${c.name}] ok`);
  } catch (err) {
    putError(c.name, err);
    console.error(`[${c.name}] ${err.message}`);
  }
}

for (const c of collectors.filter((c) => c.enabled)) {
  runCollector(c);
  setInterval(() => runCollector(c), c.everyMin * 60_000);
}

const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

function send(res, status, body, type = 'application/json', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('payload demasiado grande');
  }
  return JSON.parse(raw);
}

const INGEST_SOURCES = ['claude', 'immich', 'network', 'mcp'];

async function ingest(req, res) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!config.ingestToken || !safeEqual(token, config.ingestToken)) return send(res, 401, { error: 'unauthorized' });
  const body = await readJson(req);
  const accepted = [];
  for (const source of INGEST_SOURCES) {
    if (!(source in body)) continue;
    if (source === 'immich') putImmich(body.immich);
    else put(source, body[source]);
    accepted.push(source);
  }
  send(res, 200, { ok: true, accepted });
}

// El Kindle pide cada pocos minutos; con una caché corta no se renderiza dos veces la misma imagen.
let cache = { key: '', at: 0, png: null };

// view = tarjeta abierta en detalle (vacío, la cuadrícula); tap = "x,y" de un toque, que puede cambiar la vista.
// La vista resultante vuelve en X-View para que el Kindle la recuerde en los siguientes refrescos.
async function dashPng(url, res) {
  const battery = url.searchParams.get('battery');
  const opts = {
    battery: battery === null || battery === '' ? undefined : Number(battery),
    charging: url.searchParams.get('charging') === '1',
    page: pageIndex(url.searchParams.get('page')),
    view: isView(url.searchParams.get('view')) ? url.searchParams.get('view') : '',
    refreshMinutes: config.refreshMinutes,
  };
  const tap = (url.searchParams.get('tap') || '').match(/^(\d+),(\d+)$/);
  if (tap) opts.view = await viewAfterTap(getState(), opts, Number(tap[1]), Number(tap[2]));
  const key = `${opts.battery}|${opts.charging}|${opts.page}|${opts.view}`;
  if (!cache.png || cache.key !== key || Date.now() - cache.at > 30_000) {
    cache = { key, at: Date.now(), png: await renderPng(getState(), opts) };
  }
  send(res, 200, cache.png, 'image/png', { 'X-View': opts.view || 'grid' });
}

// Widget de escritorio: ?w=ancho en píxeles (la altura sigue la proporción del Kindle), ?page=N y ?theme=dark|light.
let widgetCache = { key: '', at: 0, png: null };
async function widgetPng(url, res) {
  const w = Math.round(Number(url.searchParams.get('w')) || 560);
  const width = Math.min(WIDGET_WIDTH.max, Math.max(WIDGET_WIDTH.min, w));
  const page = pageIndex(url.searchParams.get('page'));
  const theme = widgetTheme(url.searchParams.get('theme'));
  const key = `${width}|${page}|${theme}`;
  if (!widgetCache.png || widgetCache.key !== key || Date.now() - widgetCache.at > 30_000) {
    widgetCache = { key, at: Date.now(), png: await renderWidget(getState(), { width, page, theme, refreshMinutes: config.refreshMinutes }) };
  }
  send(res, 200, widgetCache.png, 'image/png');
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true });
    if (req.method === 'POST' && url.pathname === '/api/ingest') return await ingest(req, res);
    // La web tiene su propia clave (WEB_KEY) y sesión por cookie.
    if (await handleWeb(req, res, url)) return;

    // Todo lo demás exige la clave del dashboard en la query (el wget del Kindle no siempre manda cabeceras).
    if (!config.dashKey || !safeEqual(url.searchParams.get('key') || '', config.dashKey)) return send(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url.pathname === '/dash.png') return await dashPng(url, res);
    if (req.method === 'GET' && url.pathname === '/widget.png') return await widgetPng(url, res);
    if (req.method === 'GET' && url.pathname === '/api/state') return send(res, 200, getState());
    if (req.method === 'POST' && url.pathname === '/api/refresh') {
      await Promise.all(collectors.filter((c) => c.enabled).map(runCollector));
      return send(res, 200, { ok: true });
    }
    send(res, 404, { error: 'not found' });
  } catch (err) {
    console.error(err);
    send(res, 500, { error: err.message });
  }
});

server.listen(config.port, () => {
  const on = collectors.filter((c) => c.enabled).map((c) => c.name);
  console.log(`kindle-dashboard en :${config.port} · colectores: ${on.join(', ') || 'ninguno'}`);
});
