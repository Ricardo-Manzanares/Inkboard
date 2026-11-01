import fs from 'node:fs';
import { createRequire } from 'node:module';
import satori from 'satori';
import sharp from 'sharp';
import { C, col, row, div, text, hitmap, hitValue, withTheme, THEMES } from './ui.js';
import { header, claudeCard, immichCard, railwayCard, gscCard, githubCard, billingCard } from './cards.js';
import { DETAILS } from './details.js';
import { networkCard } from './network.js';

// Las imágenes se piden de una en una y cada pocos minutos: sin la caché de libvips ni un hilo por núcleo
// la memoria baja mucho y el tiempo de render apenas cambia.
sharp.cache(false);
sharp.concurrency(1);

// Paperwhite 3 (7.ª gen): 1072×1448 a 300 ppi, vertical.
export const WIDTH = 1072;
export const HEIGHT = 1448;

const require = createRequire(import.meta.url);
const font = (weight) => ({
  name: 'Inter',
  weight,
  style: 'normal',
  data: fs.readFileSync(require.resolve(`@fontsource/inter/files/inter-latin-${weight}-normal.woff`)),
});
const fonts = [400, 500, 600, 700, 800].map(font);

// Pantallas entre las que se desliza en el Kindle, en orden. Cada una devuelve las tarjetas bajo la cabecera.
const PAGES = [
  (state) => [
    claudeCard(state.claude),
    row({ gap: 20, alignItems: 'stretch' }, immichCard(state.immich), railwayCard(state.railway)),
    gscCard(state.gsc),
    row({ gap: 20, alignItems: 'stretch' }, githubCard(state.github), billingCard(state.billing)),
  ],
  (state) => [networkCard(state.network)],
];

export const PAGE_COUNT = PAGES.length;

// Indicador de pantalla al estilo iOS, en la cabecera a la altura de la fecha.
const dots = (current) =>
  row({ gap: 16 }, PAGES.map((_, i) => div({ width: 14, height: 14, borderRadius: 7, background: i === current ? C.ink : C.faint })));

// En el detalle, en lugar de las bolitas, cómo volver a las tarjetas.
const backHint = () =>
  row(
    { position: 'absolute', left: 0, right: 0, bottom: 4, justifyContent: 'center' },
    text('Desliza hacia arriba desde abajo o pulsa la X para volver', { fontSize: 20, color: C.dim }),
  );

export const isView = (v) => Object.hasOwn(DETAILS, v);

// El widget sin cabecera (la hora ya está en Windows) no tiene alto fijo: ocupa lo que ocupen las tarjetas.
const autoHeight = (opts) => opts.widget && !opts.header;

function layout(state, opts) {
  const detail = isView(opts.view) && DETAILS[opts.view];
  return col(
    {
      width: WIDTH,
      ...(autoHeight(opts) ? {} : { height: HEIGHT }),
      background: C.page,
      padding: opts.widget ? '6px 22px 8px' : detail ? '16px 22px 34px' : '16px 22px 20px',
      gap: 12,
      boxSizing: 'border-box',
      fontFamily: 'Inter',
      color: C.ink,
    },
    // En el widget la cabecera, si se pide, va en su propia tarjeta para leerse sobre cualquier fondo de escritorio.
    opts.widget
      ? opts.header && col({ background: C.card, borderRadius: 26, padding: '8px 14px 10px' }, header(opts))
      : header(opts, !detail && PAGE_COUNT > 1 && dots(opts.page)),
    detail ? detail(state[opts.view]) : PAGES[opts.page](state),
    detail && backHint(),
  );
}

// Página pedida, dando la vuelta en los extremos: el Kindle solo suma o resta al deslizar.
export const pageIndex = (n) => ((Math.trunc(Number(n) || 0) % PAGE_COUNT) + PAGE_COUNT) % PAGE_COUNT;

const svgOf = (state, opts) =>
  satori(
    withTheme(opts.theme, () => layout(state, { now: new Date(), refreshMinutes: 5, ...opts, page: pageIndex(opts.page) })),
    autoHeight(opts) ? { width: WIDTH, fonts } : { width: WIDTH, height: HEIGHT, fonts },
  );

// Para la página web: vectorial, se ve nítido a cualquier tamaño.
export const renderSvg = (state, opts = {}) => svgOf(state, opts);

// Devuelve un PNG de 8 bits en escala de grises, el formato que `eips -g` pinta sin conversión.
export async function renderPng(state, opts = {}) {
  const svg = await svgOf(state, opts);
  return sharp(Buffer.from(svg)).flatten({ background: '#ffffff' }).toColourspace('b-w').png({ compressionLevel: 9 }).toBuffer();
}

// Widget de escritorio (Rainmeter): tema oscuro o claro, fondo transparente y el ancho pedido. Sin header, solo las
// tarjetas y con su alto natural; con header: true, la cabecera de hora y fecha y la proporción del Kindle.
export const WIDGET_WIDTH = { min: 240, max: 2144 };
export const widgetTheme = (t) => (Object.hasOwn(THEMES, t) ? t : 'dark');
export async function renderWidget(state, { width = WIDTH, theme, ...opts } = {}) {
  const svg = await svgOf(state, { ...opts, theme: widgetTheme(theme), widget: true });
  return sharp(Buffer.from(svg), { density: 72 * Math.max(1, width / WIDTH) })
    .resize({ width })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// Vista que queda tras un toque en (x, y): en las tarjetas abre el detalle de la pulsada; en un detalle, la X vuelve.
// satori monta el árbol de forma síncrona, así que el mapa de toques no se mezcla con otros renderizados.
export async function viewAfterTap(state, opts, x, y) {
  hitmap.on = true;
  hitmap.ids = [];
  let pending;
  try {
    pending = svgOf(state, opts);
  } finally {
    hitmap.on = false;
  }
  const ids = hitmap.ids;
  const { data, info } = await sharp(Buffer.from(await pending)).flatten({ background: '#ffffff' }).raw().toBuffer({ resolveWithObject: true });
  // Se exige el mismo gris en un cuadrado de 5×5 para no confundir el borde suavizado de un texto con una zona.
  const at = (px, py) => data[(Math.min(HEIGHT - 1, Math.max(0, py)) * info.width + Math.min(WIDTH - 1, Math.max(0, px))) * info.channels];
  const v = at(x, y);
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (at(x + dx, y + dy) !== v) return opts.view || '';
  const id = ids.find((_, i) => hitValue(i) === v);
  if (id === 'close') return '';
  if (opts.view) return opts.view;
  return isView(id) ? id : '';
}
