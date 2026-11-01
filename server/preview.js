// Renderiza el dashboard con datos de ejemplo (o con un state.json dado) para iterar el diseño en local.
// Uso: npm run preview [-- ruta/state.json]
import fs from 'node:fs';
import sharp from 'sharp';
import { renderPng, renderWidget, viewAfterTap, PAGE_COUNT } from './render/render.js';
import { DETAILS } from './render/details.js';

const h = (n) => new Date(Date.now() - n * 36e5).toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const sample = {
  claude: {
    updatedAt: h(0.3),
    data: {
      plan: 'pro',
      limits: {
        fetchedAt: h(0.3),
        fiveHour: { pct: 42, resetsAt: new Date(Date.now() + 2.5 * 36e5).toISOString() },
        sevenDay: { pct: 63, resetsAt: new Date(Date.now() + 3.2 * 864e5).toISOString() },
      },
      tokens: {
        today: { total: 18_400_000, output: 212_000 },
        sessionsToday: 7,
        weekTotal: 96_300_000,
        days: [12.1, 8.4, 0.9, 22.3, 15.7, 18.6, 18.4].map((m, i) => ({ date: daysAgo(6 - i), total: m * 1e6 })),
      },
    },
  },
  immich: {
    updatedAt: h(20),
    checkedAt: h(0.2),
    data: { online: false, version: '3.3.3', photos: 12430, videos: 846, usage: 214.6 * 1024 ** 3, uploads24h: 37, uploads7d: 212, queues: { thumbnailGeneration: 0, smartSearch: 120 } },
  },
  railway: {
    updatedAt: h(0.4),
    data: {
      currentUsd: 4.82,
      estimatedUsd: 9.1,
      breakdown: [{ label: 'CPU', usd: 1.9 }, { label: 'RAM', usd: 2.71 }, { label: 'Red', usd: 0.18 }, { label: 'Disco', usd: 0.03 }],
      services: [
        { name: 'kindle-dashboard', status: 'SUCCESS' },
        { name: 'api', status: 'SUCCESS' },
        { name: 'postgres', status: 'SUCCESS' },
        { name: 'worker', status: 'FAILED' },
      ],
    },
  },
  gsc: {
    updatedAt: h(3),
    data: {
      site: 'midominio.com',
      range: { startDate: daysAgo(29), endDate: daysAgo(2) },
      current: { clicks: 1204, impressions: 38120, ctr: 0.0316, position: 14.6 },
      previous: { clicks: 1115, impressions: 37010, ctr: 0.0301, position: 15.9 },
      dailyClicks: [31, 38, 42, 40, 29, 22, 35, 44, 47, 43, 46, 30, 26, 41, 49, 52, 50, 45, 33, 28, 44, 51, 55, 49, 47, 36, 30, 46],
      topQueries: [
        { query: 'recetas fáciles', clicks: 212 }, { query: 'receta de bizcocho', clicks: 98 }, { query: 'pan casero sin amasado', clicks: 61 },
        { query: 'cena rápida', clicks: 44 }, { query: 'tortilla de patatas', clicks: 31 }, { query: 'salsa de tomate casera', clicks: 22 },
        { query: 'recetas con arroz', clicks: 15 }, { query: 'postres sin horno', clicks: 9 },
      ],
      topPages: [
        { page: '/', clicks: 380 }, { page: '/recetas/bizcocho', clicks: 190 }, { page: '/recetas/pan', clicks: 120 },
        { page: '/agenda', clicks: 64 }, { page: '/blog/menu-semanal', clicks: 31 },
      ],
    },
  },
  github: {
    updatedAt: h(0.5),
    data: {
      login: 'usuario',
      weeks: 30,
      total: 192,
      // 30 semanas hasta hoy, con más actividad en las últimas.
      days: Array.from({ length: 210 }, (_, i) => {
        const count = (i * 37) % 11 < 3 + Math.floor(i / 40) ? ((i * 13) % 7) + Math.floor(i / 60) : 0;
        return { date: daysAgo(209 - i), count, level: Math.min(4, Math.ceil(count / 2)) };
      }),
      byMonth: [
        { month: daysAgo(0).slice(0, 7), repos: [{ name: 'mi-web', commits: 29 }] },
        { month: daysAgo(31).slice(0, 7), repos: [{ name: 'mi-web', commits: 72 }, { name: 'api-tareas', commits: 10 }] },
        { month: daysAgo(62).slice(0, 7), repos: [{ name: 'mi-web', commits: 41 }] },
      ],
    },
  },
  billing: {
    updatedAt: h(1.2),
    data: {
      projectIds: ['mi-proyecto', 'mi-proyecto-dev', 'tareas-async'],
      projects: [
        { id: 'mi-proyecto', monthCost: 0.1, monthGross: 0.6, prevMonthCost: 0.07 },
        { id: 'mi-proyecto-dev', monthCost: 0.01, monthGross: 0.01, prevMonthCost: 0.01 },
        { id: 'tareas-async', monthCost: 0, monthGross: 0, prevMonthCost: 0 },
      ],
      currency: 'EUR',
      month: daysAgo(0).slice(0, 7),
      monthCost: 0.11,
      monthGross: 0.61,
      monthCredits: -0.5,
      prevMonthCost: 0.08,
      daily: [0, 0, 0.01, 0, 0.02, 0, 0, 0.01, 0, 0, 0.01, 0, 0, 0.02, 0.01, 0, 0, 0.01, 0, 0, 0.01, 0, 0],
      services: [{ name: 'Cloud Run Functions', cost: 0.09 }, { name: 'Cloud Storage', cost: 0.01 }, { name: 'Invoice', cost: 0.01 }],
      // Cifras de ejemplo cerca de las cuotas gratuitas.
      firebase: {
        project: 'mi-proyecto',
        days: 23,
        rtdb: { gross: 0, credits: 0, storageBytes: 12.7 * 1024 ** 2, downloadBytes: 360 * 1024 ** 2 },
        functions: { gross: 0.6, credits: -0.5, invocations: 17_000, cpuSeconds: 5.6 * 3600 },
        hosting: { gross: 0, credits: 0, storageBytes: 81.3 * 1024 ** 2, downloadBytes: 250 * 1024 ** 2 },
      },
    },
  },
};

// Red local de ejemplo: router, un repetidor, un switch y una PLC, con equipos en línea, dormidos y sin identificar.
const mac = (n) => `00:1a:2b:00:00:${n.toString(16).padStart(2, '0')}`;
const NET = [
  // [nombre, tipo, conexión, padre, IP, horas en línea (null = desconectado), horas desde la última vez (si no lo está), opciones]
  ['Router', 'router', 'ethernet', null, 1, 400],
  ['Repetidor arriba', 'ap', 'ethernet', 'router', 2, 400],
  ['Switch salón', 'switch', 'ethernet', 'router', 3, 400],
  ['PLC terraza', 'powerline', 'ethernet', 3, 4, 120],
  ['Tele salón', 'tv', 'ethernet', 3, 20, 3.2],
  ['Reproductor salón', 'streamer', 'ethernet', 3, 21, 3.1],
  ['Consola', 'console', 'ethernet', 3, 22, null, 20],
  ['NAS', 'nas', 'ethernet', 3, 23, 300],
  ['Servidor doméstico', 'server', 'ethernet', 3, 24, 300],
  ['Altavoz salón', 'speaker', 'ethernet', 3, 25, 52],
  ['Portátil', 'laptop', 'wifi', 2, 30, 1.6],
  ['Tablet', 'tablet', 'wifi', 2, 31, null, 5],
  ['Impresora', 'printer', 'wifi', 2, 32, 26],
  ['Tele dormitorio', 'tv', 'wifi', 2, 33, null, 30],
  ['Cámara pasillo', 'camera', 'wifi', 2, 34, 140],
  ['Lector', 'ereader', 'wifi', 2, 35, null, 9, { sleeps: true }],
  ['Cámara jardín', 'camera', 'wifi', 4, 40, 90],
  ['Riego', 'iot', 'wifi', 4, 41, 90],
  ['Móvil 1', 'phone', 'wifi', null, 50, 7.5, null, { randomMac: true }],
  ['Móvil 2', 'phone', 'wifi', null, 51, 2.2, null, { randomMac: true }],
  ['Reloj', 'watch', 'wifi', null, 52, null, 3],
  ['PC escritorio', 'pc', 'wifi', null, 53, 4.4, null, { self: true }],
  ['Termostato', 'iot', 'wifi', null, 54, 210],
  ['Bombilla salón', 'light', 'wifi', null, 55, 210],
  ['Enchufe cocina', 'plug', 'wifi', null, 56, 210],
  [null, 'iot', null, null, 60, 12, null, { known: false, vendor: 'Espressif' }],
  [null, 'unknown', null, null, 61, 0.4, null, { known: false, randomMac: true }],
];
const network = {
  updatedAt: h(0.05),
  data: {
    scannedAt: h(0.05),
    subnet: '192.168.0.0/24',
    gateway: '192.168.0.1',
    devices: NET.map(([name, type, link, parent, n, onlineH, lastH, o = {}]) => ({
      mac: mac(n),
      ip: `192.168.0.${n}`,
      name,
      type,
      link,
      parent: parent === 'router' ? 'router' : parent ? mac(parent) : null,
      known: true,
      gateway: n === 1,
      online: onlineH !== null,
      onlineSince: onlineH !== null ? h(onlineH) : null,
      lastSeen: onlineH !== null ? h(0.05) : h(lastH),
      ...o,
    })),
  },
};
sample.network = network;

const file = process.argv[2];
const state = file ? JSON.parse(fs.readFileSync(file, 'utf8')) : sample;
fs.mkdirSync('out', { recursive: true });
for (let page = 0; page < PAGE_COUNT; page++) {
  const out = page ? `out/preview-${page + 1}.png` : 'out/preview.png';
  fs.writeFileSync(out, await renderPng(state, { battery: 87, charging: true, page }));
  console.log(out);
}
for (const view of Object.keys(DETAILS)) {
  fs.writeFileSync(`out/detail-${view}.png`, await renderPng(state, { battery: 87, charging: true, view }));
  console.log(`out/detail-${view}.png`);
}

// Widget de escritorio, sobre un degradado de colores para ver la transparencia: métricas en los dos temas y la red.
for (const [theme, page] of [['dark', 0], ['light', 0], ['dark', 1]]) {
  const widget = await renderWidget(state, { width: 560, theme, page });
  const { width: ww, height: wh } = await sharp(widget).metadata();
  const wallpaper = `<svg xmlns="http://www.w3.org/2000/svg" width="${ww + 80}" height="${wh + 80}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2a5d8f"/><stop offset="1" stop-color="#d98c4a"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`;
  const file = page ? `out/widget-${page + 1}.png` : theme === 'dark' ? 'out/widget.png' : `out/widget-${theme}.png`;
  await sharp(Buffer.from(wallpaper)).composite([{ input: widget, left: 40, top: 40 }]).png().toFile(file);
  console.log(`${file} (${ww}×${wh})`);
}

// Comprobación del mapa de toques: el centro de cada tarjeta abre su detalle y la X lo cierra.
const taps = { claude: [300, 300], immich: [270, 620], railway: [800, 620], gsc: [536, 950], github: [270, 1280], billing: [800, 1280], nada: [536, 60] };
console.log(`toque red (pantalla 2) -> ${(await viewAfterTap(state, { page: 1 }, 536, 800)) || 'grid'}`);
for (const [name, [x, y]] of Object.entries(taps)) console.log(`toque ${name} -> ${(await viewAfterTap(state, { page: 0 }, x, y)) || 'grid'}`);
console.log(`X en detalle -> ${(await viewAfterTap(state, { page: 0, view: 'gsc' }, 1000, 190)) || 'grid'}`);
