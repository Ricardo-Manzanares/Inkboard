// Vistas de detalle: al pulsar una tarjeta ocupa toda la pantalla bajo la cabecera, con más datos y más grandes.
import {
  mdiCreation, mdiImageMultiple, mdiTrainVariant, mdiGoogle, mdiGithub, mdiGoogleCloud, mdiClose,
  mdiCheckCircle, mdiCloseCircle, mdiProgressClock,
} from '@mdi/js';
import { C, div, row, col, text, icon, badge, chip, stat, bar, sparkline, columns, hbar, divider, trend, message, hitArea } from './ui.js';
import { num, compact, usd, money, pct, bytes, delta, when, ago, shortDate, truncate } from './format.js';
import { fresh, errorLine, heatmap, MONTH_NAMES } from './cards.js';
import { networkList } from './network.js';

const W = 964; // ancho útil de la tarjeta de detalle

// La X se dibuja a 72 px, pero su zona de toque es más grande para acertar con el dedo.
const closeButton = () =>
  div(
    { position: 'relative', width: 72, height: 72, borderRadius: 36, border: `3px solid ${C.ink}`, alignItems: 'center', justifyContent: 'center' },
    icon(mdiClose, 46),
    hitArea('close', { radius: 66, inset: -30 }),
  );

function detail({ iconPath, title, subtitle, status, statusInverted }, ...body) {
  return col(
    { flexGrow: 1, background: C.card, borderRadius: 26, padding: '24px 32px', gap: 22, boxSizing: 'border-box' },
    row(
      { gap: 20 },
      badge(iconPath, 64),
      col({ flexGrow: 1 }, text(title, { fontSize: 40, fontWeight: 800 }), subtitle && text(subtitle, { fontSize: 23, color: C.dim })),
      status && chip(status, { inverted: statusInverted }),
      closeButton(),
    ),
    ...body,
  );
}

const label = (str) => text(str, { fontSize: 24, color: C.dim, fontWeight: 600 });

// --- Claude Code ---

function limitBig(name, limit) {
  const reset = limit && new Date(limit.resetsAt) < new Date();
  const value = !limit ? null : reset ? 0 : limit.pct;
  return col(
    { flexGrow: 1, gap: 10 },
    row(
      { justifyContent: 'space-between', alignItems: 'flex-end' },
      text(name, { fontSize: 28, color: C.dim, fontWeight: 600 }),
      text(value === null ? '–' : pct(value, 0), { fontSize: 72, fontWeight: 800, lineHeight: 1 }),
    ),
    bar((value || 0) / 100, { height: 32 }),
    text(!limit ? 'sin lectura' : reset ? 'reiniciada' : `reinicia ${when(limit.resetsAt)}`, { fontSize: 24, color: C.dim }),
  );
}

function claude(src) {
  const d = src?.data;
  const t = d?.tokens;
  const days = t?.days || [];
  const labels = days.map((x) => {
    const date = new Date(`${x.date}T12:00:00`);
    return `${date.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '')} ${date.getDate()}`;
  });
  return detail(
    { iconPath: mdiCreation, title: 'Claude Code', subtitle: d ? `plan ${d.plan || '–'} · límites ${d.limits?.fetchedAt ? ago(d.limits.fetchedAt) : 'sin leer'}` : null, status: fresh(src) },
    !d
      ? message('Esperando datos del agente del PC')
      : [
          row({ gap: 48, alignItems: 'flex-start' }, limitBig('Sesión (5 h)', d.limits?.fiveHour), limitBig('Semana (7 d)', d.limits?.sevenDay)),
          divider(),
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('Tokens hoy', compact(t?.today?.total), `${compact(t?.today?.output)} de salida`, { size: 64 }),
            stat('Sesiones hoy', num(t?.sessionsToday), null, { size: 64 }),
            stat('Tokens en 7 d', compact(t?.weekTotal), `${compact(days.reduce((s, x) => s + (x.output || 0), 0))} de salida`, { size: 64 }),
          ),
          label('Tokens por día'),
          columns(days.map((x) => x.total), labels, { width: W, height: 640, format: compact, valueSize: 24, labelSize: 22, gap: 24 }),
        ],
    errorLine(src),
  );
}

// --- Immich ---

const QUEUES = {
  thumbnailGeneration: 'Miniaturas', metadataExtraction: 'Metadatos', videoConversion: 'Conversión de vídeo',
  faceDetection: 'Detección de caras', facialRecognition: 'Reconocimiento facial', smartSearch: 'Búsqueda inteligente',
  duplicateDetection: 'Duplicados', backgroundTask: 'Tareas de fondo', storageTemplateMigration: 'Plantilla de almacenamiento',
  migration: 'Migración', search: 'Búsqueda', sidecar: 'Sidecar', library: 'Biblioteca', notifications: 'Notificaciones',
  backupDatabase: 'Copia de la base de datos', ocr: 'OCR', workflow: 'Flujos', integrityCheck: 'Integridad', editor: 'Editor',
};

function immich(src) {
  const d = src?.data;
  const online = d?.online;
  const queues = Object.entries(d?.queues || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...queues.map(([, n]) => n));
  return detail(
    {
      iconPath: mdiImageMultiple,
      title: 'Immich',
      subtitle: !d ? null : online ? `v${d.version || '?'} · comprobado ${ago(src.checkedAt)}` : `en línea por última vez: ${src.updatedAt ? when(src.updatedAt) : '–'}`,
      status: !d ? 'sin datos' : online ? 'EN LÍNEA' : 'APAGADO',
      statusInverted: online,
    },
    d?.photos === undefined
      ? message(d ? 'Arranca Immich para la primera lectura' : 'Esperando datos del agente del PC')
      : [
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('Fotos', num(d.photos), null, { size: 72 }),
            stat('Vídeos', num(d.videos), null, { size: 72 }),
            stat('Espacio', bytes(d.usage), null, { size: 72 }),
          ),
          divider(),
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('Subidas 24 h', num(d.uploads24h), null, { size: 56 }),
            stat('Subidas 7 d', num(d.uploads7d), null, { size: 56 }),
            stat('Total en cola', num(queues.reduce((s, [, n]) => s + n, 0)), null, { size: 56 }),
          ),
          divider(),
          label('Colas de trabajo'),
          queues.length === 0
            ? text('Sin trabajos pendientes', { fontSize: 26, color: C.dim })
            : col(
                { gap: 14 },
                queues.slice(0, 10).map(([name, n]) =>
                  row({ gap: 20 }, text(QUEUES[name] || name, { width: 380, fontSize: 26, fontWeight: 600 }), hbar(n / max, { width: 420, height: 18 }), text(num(n), { fontSize: 26 })),
                ),
              ),
        ],
    errorLine(src),
  );
}

// --- Railway ---

const statusIcon = (s) => (s === 'SUCCESS' ? mdiCheckCircle : ['FAILED', 'CRASHED'].includes(s) ? mdiCloseCircle : mdiProgressClock);

function railway(src) {
  const d = src?.data;
  const services = d?.services || [];
  const failed = services.filter((s) => !['SUCCESS', 'SLEEPING'].includes(s.status));
  const max = Math.max(1e-9, ...(d?.breakdown || []).map((b) => b.usd));
  return detail(
    { iconPath: mdiTrainVariant, title: 'Railway', subtitle: services.length ? `${services.length - failed.length}/${services.length} servicios OK` : null, status: fresh(src) },
    !d
      ? message('Configura RAILWAY_API_TOKEN')
      : [
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('Periodo actual', usd(d.currentUsd), null, { size: 80 }),
            stat('Estimado del periodo', usd(d.estimatedUsd), null, { size: 56, style: { alignItems: 'flex-end' } }),
          ),
          label('Desglose del periodo'),
          col(
            { gap: 16 },
            d.breakdown.map((b) => row({ gap: 20 }, text(b.label, { width: 160, fontSize: 28, fontWeight: 600 }), hbar(b.usd / max, { width: 560, height: 22 }), text(usd(b.usd), { fontSize: 28 }))),
          ),
          divider(),
          label('Servicios'),
          col(
            { gap: 18 },
            services.map((s) =>
              row(
                { gap: 16 },
                icon(statusIcon(s.status), 36),
                col({ flexGrow: 1 }, text(s.name, { fontSize: 30, fontWeight: 700 }), s.project && text(s.project, { fontSize: 22, color: C.dim })),
                text(s.status.toLowerCase(), { fontSize: 26, color: C.dim }),
              ),
            ),
          ),
        ],
    errorLine(src),
  );
}

// --- Search Console ---

function kpiBig(name, value, change, before) {
  return col(
    { gap: 4, width: 230 },
    text(name, { fontSize: 24, color: C.dim, fontWeight: 600 }),
    text(value, { fontSize: 56, fontWeight: 800, lineHeight: 1.1 }),
    trend(change, { size: 24 }) || text(' ', { fontSize: 24 }),
    text(`antes ${before}`, { fontSize: 21, color: C.dim }),
  );
}

function gsc(src) {
  const d = src?.data;
  const cur = d?.current;
  const prev = d?.previous;
  const table = (title, rows) =>
    col(
      { width: (W - 40) / 2, gap: 10 },
      label(title),
      rows.length === 0 ? text('Sin datos', { fontSize: 24, color: C.dim }) : rows.map(([a, b]) => row({ justifyContent: 'space-between', gap: 12 }, text(a, { fontSize: 24, fontWeight: 600 }), text(b, { fontSize: 22, color: C.dim }))),
    );
  const clicks = (n) => `${num(n)} ${n === 1 ? 'clic' : 'clics'}`;
  return detail(
    {
      iconPath: mdiGoogle,
      title: 'Search Console',
      subtitle: d ? `${d.site} · ${shortDate(d.range.startDate)} – ${shortDate(d.range.endDate)} vs 28 d anteriores` : null,
      status: fresh(src),
    },
    !d
      ? message('Configura GSC_SITE_URL y la service account')
      : [
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            kpiBig('Clics', num(cur.clicks), delta(cur.clicks, prev.clicks), num(prev.clicks)),
            kpiBig('Impresiones', compact(cur.impressions), delta(cur.impressions, prev.impressions), compact(prev.impressions)),
            kpiBig('CTR medio', pct(cur.ctr * 100), delta(cur.ctr, prev.ctr), pct(prev.ctr * 100)),
            kpiBig('Posición media', num(cur.position, { decimals: 1 }), delta(cur.position, prev.position), num(prev.position, { decimals: 1 })),
          ),
          row(
            { justifyContent: 'space-between' },
            label('Clics por día'),
            text(`máximo ${num(Math.max(0, ...d.dailyClicks))} · media ${num(d.dailyClicks.reduce((s, n) => s + n, 0) / (d.dailyClicks.length || 1), { decimals: 1 })}`, { fontSize: 22, color: C.dim }),
          ),
          sparkline(d.dailyClicks, { width: W, height: 200, stroke: 5 }),
          row(
            { gap: 40, alignItems: 'flex-start' },
            table('Consultas principales', d.topQueries.slice(0, 8).map((q) => [truncate(q.query, 24), clicks(q.clicks)])),
            table('Páginas principales', (d.topPages || []).map((p) => [truncate(p.page, 26), clicks(p.clicks)])),
          ),
        ],
    errorLine(src),
  );
}

// --- GitHub ---

function streaks(days) {
  let current = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i].count > 0) current++;
    else if (i < days.length - 1 || current > 0) break; // hoy sin commits no rompe la racha
  }
  let best = 0;
  let run = 0;
  for (const d of days) {
    run = d.count > 0 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return { current, best };
}

function github(src) {
  const d = src?.data;
  const days = d?.days || [];
  const top = days.reduce((a, b) => (b.count > (a?.count ?? 0) ? b : a), null);
  const { current, best } = streaks(days);
  const months = d?.byMonth?.slice(0, 3) || [];
  const max = Math.max(1, ...months.flatMap((m) => m.repos.map((r) => r.commits)));
  return detail(
    { iconPath: mdiGithub, title: 'GitHub', subtitle: d ? `${d.login} · últimas ${d.weeks} semanas` : null, status: fresh(src) },
    !d?.days
      ? message('Configura GITHUB_TOKEN')
      : [
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('Contribuciones', num(d.total), null, { size: 56 }),
            stat('Días activos', num(days.filter((x) => x.count > 0).length), null, { size: 56 }),
            stat('Racha actual', `${num(current)} d`, `mejor ${num(best)} d`, { size: 56 }),
            stat('Mejor día', top?.count ? num(top.count) : '–', top?.count ? shortDate(top.date) : null, { size: 56 }),
          ),
          col(
            { gap: 10 },
            heatmap(days, d.weeks, { cell: 24, step: 29, labelW: 40, labelSize: 22, daySize: 20 }),
            row(
              { justifyContent: 'flex-end', gap: 6 },
              text('Menos', { fontSize: 20, color: C.dim }),
              C.levels.map((fill) => div({ width: 22, height: 22, borderRadius: 4, background: fill })),
              text('Más', { fontSize: 20, color: C.dim }),
            ),
          ),
          divider(),
          label('Commits por mes'),
          col(
            { gap: 18 },
            months.map(({ month, repos }) => {
              const [y, m] = month.split('-').map(Number);
              const total = repos.reduce((s, r) => s + r.commits, 0);
              return col(
                { gap: 8 },
                text(`${MONTH_NAMES[m - 1]} ${y} · ${num(total)} commits en ${repos.length} ${repos.length === 1 ? 'repositorio' : 'repositorios'}`, { fontSize: 26, fontWeight: 700 }),
                repos.slice(0, 3).map((r) =>
                  row({ gap: 20 }, text(truncate(r.name, 26), { width: 380, fontSize: 24, color: C.dim }), hbar(r.commits / max, { width: 440, height: 16 }), text(num(r.commits), { fontSize: 24, fontWeight: 600 })),
                ),
              );
            }),
          ),
        ],
    errorLine(src),
  );
}

// --- Google Cloud ---

// Nivel gratuito de Firebase (plan Blaze), el mismo que enseña su panel de uso.
const MB = 1024 ** 2;
const GB = 1024 ** 3;
const FREE = { rtdbStorage: 1 * GB, rtdbDownloadDay: 360 * MB, invocations: 2_000_000, hostingStorage: 10 * GB, hostingDownloadDay: 360 * MB };

// Una medida frente a su cuota: etiqueta, "valor de cuota" y una barra fina.
const quota = (name, value, limit, show) =>
  col(
    { width: 330, gap: 4 },
    text(name, { fontSize: 19, color: C.dim }),
    text(`${show(value || 0)} de ${show(limit)}`, { fontSize: 23, fontWeight: 600 }),
    hbar((value || 0) / limit, { width: 300, height: 10 }),
  );

function firebaseProduct(name, cost, ...quotas) {
  return row(
    { gap: 16, alignItems: 'flex-start' },
    col({ width: 250, gap: 2 }, text(name, { fontSize: 25, fontWeight: 700 }), text(cost, { fontSize: 19, color: C.dim })),
    ...quotas,
  );
}

function firebase(fb, currency) {
  const perDay = (n) => (n || 0) / fb.days;
  const cost = (p) => (p.gross > 0 ? `${money(p.gross + p.credits, currency)} · bruto ${money(p.gross, currency)}` : 'sin coste');
  const bytesDay = (n) => `${bytes(n)}/día`;
  return [
    row({ justifyContent: 'space-between' }, label(`Firebase · ${fb.project}`), text('uso del mes frente al nivel gratuito', { fontSize: 22, color: C.dim })),
    col(
      { gap: 18 },
      firebaseProduct(
        'Realtime Database',
        cost(fb.rtdb),
        quota('Almacenamiento', fb.rtdb.storageBytes, FREE.rtdbStorage, bytes),
        quota('Descargas (media)', perDay(fb.rtdb.downloadBytes), FREE.rtdbDownloadDay, bytesDay),
      ),
      firebaseProduct(
        'Functions',
        cost(fb.functions),
        quota('Invocaciones', fb.functions.invocations, FREE.invocations, compact),
        col(
          { width: 330, gap: 4 },
          text('CPU', { fontSize: 19, color: C.dim }),
          text(`${num((fb.functions.cpuSeconds || 0) / 3600, { decimals: 1 })} h`, { fontSize: 23, fontWeight: 600 }),
        ),
      ),
      firebaseProduct(
        'Hosting',
        cost(fb.hosting),
        quota('Almacenamiento', fb.hosting.storageBytes, FREE.hostingStorage, bytes),
        quota('Descargas (media)', perDay(fb.hosting.downloadBytes), FREE.hostingDownloadDay, bytesDay),
      ),
    ),
  ];
}

function billing(src) {
  const d = src?.data;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const forecast = d && d.daily.length ? (d.monthCost / d.daily.length) * daysInMonth : null;
  const max = Math.max(1e-9, ...(d?.services || []).map((s) => s.cost));
  return detail(
    { iconPath: mdiGoogleCloud, title: 'Google Cloud', subtitle: d ? `${d.projectIds.length} proyectos · facturación` : null, status: fresh(src) },
    !d
      ? message('Configura la exportación de facturación a BigQuery (README)')
      : [
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('A pagar este mes', money(d.monthCost, d.currency), null, { size: 72 }),
            stat('Coste bruto', money(d.monthGross ?? d.monthCost, d.currency), null, { size: 44 }),
            stat('Descuentos', money(d.monthCredits ?? 0, d.currency), 'nivel gratuito y créditos', { size: 44, style: { alignItems: 'flex-end' } }),
          ),
          text(`Mes anterior ${money(d.prevMonthCost, d.currency)} · previsión del mes ${forecast === null ? '–' : money(forecast, d.currency)}`, { fontSize: 23, color: C.dim }),
          row(
            { justifyContent: 'space-between' },
            label('A pagar por día'),
            text(`máximo ${money(Math.max(0, ...d.daily), d.currency)}`, { fontSize: 22, color: C.dim }),
          ),
          columns(d.daily, d.daily.map((_, i) => (i === 0 || (i + 1) % 5 === 0 ? String(i + 1) : '')), { width: W, height: 150, labelSize: 20, gap: 6 }),
          divider(),
          row({ justifyContent: 'space-between' }, label('Por proyecto'), text('este mes · mes anterior', { fontSize: 22, color: C.dim })),
          col(
            { gap: 12 },
            d.projects.map((p) =>
              row(
                { gap: 20 },
                text(truncate(p.id, 24), { width: 360, fontSize: 25, fontWeight: 700 }),
                hbar(p.monthCost / Math.max(1e-9, ...d.projects.map((x) => x.monthCost)), { width: 280, height: 16 }),
                text(money(p.monthCost, d.currency), { width: 150, fontSize: 25, fontWeight: 600 }),
                text(money(p.prevMonthCost, d.currency), { fontSize: 22, color: C.dim }),
              ),
            ),
          ),
          divider(),
          d.firebase && firebase(d.firebase, d.currency),
          divider(),
          label('Servicios este mes'),
          d.services.length === 0
            ? text('Sin gasto este mes', { fontSize: 24, color: C.dim })
            : col(
                { gap: 10 },
                d.services.slice(0, 3).map((s) =>
                  row({ gap: 20 }, text(truncate(s.name, 24), { width: 360, fontSize: 24, fontWeight: 600 }), hbar(s.cost / max, { width: 400, height: 16 }), text(money(s.cost, d.currency), { fontSize: 24 })),
                ),
              ),
        ],
    errorLine(src),
  );
}

// La clave es el id de la tarjeta y coincide con la fuente de datos en el estado.
// --- Red local ---
const network = (src) => networkList(src, { detail, label, W });

export const DETAILS = { claude, immich, railway, gsc, github, billing, network };
