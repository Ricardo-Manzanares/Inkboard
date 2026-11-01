import {
  mdiCreation, mdiImageMultiple, mdiTrainVariant, mdiGoogle, mdiGithub, mdiCheckCircle, mdiCloseCircle,
  mdiProgressClock, mdiBattery, mdiBatteryCharging, mdiGoogleCloud,
} from '@mdi/js';
import { C, div, row, col, text, icon, card, stat, bar, sparkline, bars, divider, trend, message } from './ui.js';
import { num, compact, usd, money, pct, bytes, delta, time, longDate, shortDate, when, ago, truncate } from './format.js';

const HALF = { width: 504 };

// Pie común: error de la última recogida, si lo hubo después de los datos buenos.
export function errorLine(src) {
  if (!src?.error || (src.updatedAt && src.errorAt < src.updatedAt)) return null;
  return text(`Error: ${truncate(src.error, 80)} (${ago(src.errorAt)})`, { fontSize: 18, color: C.dim });
}

export const fresh = (src) => (src?.updatedAt ? ago(src.updatedAt) : 'sin datos');

// center: lo que va centrado en la línea de la fecha (las bolitas de pantalla).
export function header({ now, battery, charging, refreshMinutes }, center) {
  return row(
    { position: 'relative', justifyContent: 'space-between', alignItems: 'flex-end', padding: '0 8px' },
    center && row({ position: 'absolute', left: 0, right: 0, bottom: 11, justifyContent: 'center' }, center),
    col(
      {},
      text(time(now), { fontSize: 62, fontWeight: 800, lineHeight: 1 }),
      text(longDate(now), { fontSize: 30, color: C.dim, fontWeight: 500 }),
    ),
    col(
      { alignItems: 'flex-end', gap: 6 },
      battery !== undefined &&
        row({ gap: 6 }, icon(charging ? mdiBatteryCharging : mdiBattery, 44), text(`${battery} %`, { fontSize: 36, fontWeight: 700 })),
      text(`actualiza cada ${refreshMinutes} min`, { fontSize: 26, color: C.dim }),
    ),
  );
}

function limitBlock(label, limit) {
  // Si la ventana ya se reinició desde la última lectura, el uso real es 0.
  const reset = limit && new Date(limit.resetsAt) < new Date();
  const value = !limit ? null : reset ? 0 : limit.pct;
  return col(
    { gap: 8 },
    row(
      { justifyContent: 'space-between', alignItems: 'flex-end' },
      text(label, { fontSize: 22, color: C.dim, fontWeight: 500 }),
      text(value === null ? '–' : pct(value, 0), { fontSize: 34, fontWeight: 800, lineHeight: 1 }),
    ),
    bar((value || 0) / 100, { height: 18 }),
    text(!limit ? 'sin lectura' : reset ? 'reiniciada' : `reinicia ${when(limit.resetsAt)}`, { fontSize: 19, color: C.dim }),
  );
}

export function claudeCard(src) {
  const d = src?.data;
  const t = d?.tokens;
  const days = t?.days || [];
  const dayLabels = days.map((x) => new Date(`${x.date}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'narrow' }).toUpperCase());
  const today = t?.today;
  return card(
    {
      id: 'claude',
      iconPath: mdiCreation,
      title: 'Claude Code',
      subtitle: d ? `plan ${d.plan || '–'} · límites ${d.limits?.fetchedAt ? ago(d.limits.fetchedAt) : 'sin leer'}` : null,
      status: fresh(src),
    },
    !d
      ? message('Esperando datos del agente del PC')
      : row(
          { gap: 36, alignItems: 'flex-start' },
          col({ width: 420, gap: 12 }, limitBlock('Sesión (5 h)', d.limits?.fiveHour), limitBlock('Semana (7 d)', d.limits?.sevenDay)),
          col(
            { flexGrow: 1, gap: 14 },
            row(
              { gap: 28 },
              stat('Tokens hoy', compact(today?.total), `${compact(today?.output)} de salida`),
              stat('Sesiones hoy', num(t?.sessionsToday), `${compact(t?.weekTotal)} tokens en 7 d`, { size: 36 }),
            ),
            bars(days.map((x) => x.total), dayLabels, { width: 500, height: 96 }),
          ),
        ),
    errorLine(src),
  );
}

export function immichCard(src) {
  const d = src?.data;
  const online = d?.online;
  const queued = d?.queues ? Object.values(d.queues).reduce((a, b) => a + b, 0) : null;
  return card(
    {
      id: 'immich',
      iconPath: mdiImageMultiple,
      title: 'Immich',
      subtitle: !d ? null : online ? `v${d.version || '?'} · ${fresh(src)}` : src.updatedAt ? `datos ${fresh(src)}` : 'aún sin lecturas',
      status: !d ? 'sin datos' : online ? 'EN LÍNEA' : 'APAGADO',
      statusInverted: online,
      style: HALF,
    },
    d?.photos === undefined
      ? message(d ? 'Arranca Immich para la primera lectura' : 'Esperando datos del agente del PC')
      : [
          row({ justifyContent: 'space-between', alignItems: 'flex-start' }, stat('Fotos', num(d.photos), null, { size: 34 }), stat('Vídeos', num(d.videos), null, { size: 34 }), stat('Espacio', bytes(d.usage), null, { size: 34 })),
          divider(),
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('Subidas 24 h', num(d.uploads24h), null, { size: 30 }),
            stat('Subidas 7 d', num(d.uploads7d), null, { size: 30 }),
            stat('En cola', queued === null ? '–' : num(queued), null, { size: 30 }),
          ),
          divider(),
          text(
            online ? `Comprobado ${ago(src.checkedAt)}` : `En línea por última vez: ${src.updatedAt ? when(src.updatedAt) : '–'}`,
            { fontSize: 19, color: C.dim },
          ),
        ],
    errorLine(src),
  );
}

export function railwayCard(src) {
  const d = src?.data;
  const services = d?.services || [];
  const failed = services.filter((s) => !['SUCCESS', 'SLEEPING'].includes(s.status));
  return card(
    {
      id: 'railway',
      iconPath: mdiTrainVariant,
      title: 'Railway',
      subtitle: services.length ? `${services.length - failed.length}/${services.length} servicios OK` : null,
      status: fresh(src),
      style: HALF,
    },
    !d
      ? message('Configura RAILWAY_API_TOKEN')
      : [
          row({ justifyContent: 'space-between', alignItems: 'flex-end' }, stat('Periodo actual', usd(d.currentUsd), `estimado ${usd(d.estimatedUsd)}`, { size: 36 })),
          row({ gap: 10, flexWrap: 'wrap' }, d.breakdown.map((b) => text(`${b.label} ${usd(b.usd)}`, { fontSize: 17, color: C.dim }))),
          divider(),
          col(
            { gap: 6 },
            services.slice(0, 2).map((s) =>
              row(
                { gap: 8 },
                icon(s.status === 'SUCCESS' ? mdiCheckCircle : ['FAILED', 'CRASHED'].includes(s.status) ? mdiCloseCircle : mdiProgressClock, 24),
                text(truncate(s.name, 22), { fontSize: 21, fontWeight: 600 }),
                text(s.status.toLowerCase(), { fontSize: 19, color: C.dim }),
              ),
            ),
            services.length > 2 && text(`+${services.length - 2} más`, { fontSize: 18, color: C.dim }),
          ),
        ],
    errorLine(src),
  );
}

function kpi(label, value, change) {
  return col({ gap: 2, width: 230 }, text(label, { fontSize: 20, color: C.dim, fontWeight: 500 }), text(value, { fontSize: 38, fontWeight: 800, lineHeight: 1.1 }), trend(change) || text(' ', { fontSize: 20 }));
}

export function gscCard(src) {
  const d = src?.data;
  const cur = d?.current;
  const prev = d?.previous;
  return card(
    {
      id: 'gsc',
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
            kpi('Clics', num(cur.clicks), delta(cur.clicks, prev.clicks)),
            kpi('Impresiones', compact(cur.impressions), delta(cur.impressions, prev.impressions)),
            kpi('CTR medio', pct(cur.ctr * 100), delta(cur.ctr, prev.ctr)),
            kpi('Posición media', num(cur.position, { decimals: 1 }), delta(cur.position, prev.position)),
          ),
          row(
            { gap: 28, alignItems: 'flex-start' },
            col({ gap: 4 }, text('Clics por día', { fontSize: 19, color: C.dim }), sparkline(d.dailyClicks, { width: 460, height: 48 })),
            col(
              { flexGrow: 1, gap: 6 },
              text('Consultas principales', { fontSize: 19, color: C.dim }),
              d.topQueries.slice(0, 3).map((q) =>
                row({ justifyContent: 'space-between', alignItems: 'flex-start' }, text(truncate(q.query, 26), { fontSize: 21, fontWeight: 600 }), text(`${num(q.clicks)} ${q.clicks === 1 ? 'clic' : 'clics'}`, { fontSize: 20, color: C.dim })),
              ),
            ),
          ),
        ],
    errorLine(src),
  );
}

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
export const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];


// Calendario de contribuciones como el del perfil de GitHub, con semanas de lunes a domingo.
export function heatmap(days, weeks, { cell = 11, step = 14, labelW = 28, labelSize = 17, daySize = 14 } = {}) {
  const utc = (s) => new Date(`${s}T00:00:00Z`);
  const iso = (d) => d.toISOString().slice(0, 10);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const last = utc(days[days.length - 1].date);
  const monday = new Date(last.getTime() - ((last.getUTCDay() + 6) % 7) * 864e5);
  const columns = Array.from({ length: weeks }, (_, c) => {
    const start = new Date(monday.getTime() - (weeks - 1 - c) * 7 * 864e5);
    return { start, days: Array.from({ length: 7 }, (_, r) => new Date(start.getTime() + r * 864e5)) };
  });
  const labels = columns
    .map((c, i) => ({ i, m: c.start.getUTCMonth() }))
    .filter((c, i, all) => i > 0 && c.m !== all[i - 1].m && i < weeks - 1);
  return col(
    { gap: 4 },
    div(
      { position: 'relative', height: labelSize + 2, width: labelW + weeks * step },
      labels.map(({ i, m }) => text(MONTHS[m], { position: 'absolute', left: labelW + i * step, top: 0, fontSize: labelSize, color: C.dim })),
    ),
    row(
      { alignItems: 'flex-start' },
      col(
        { width: labelW, gap: step - cell },
        ['L', '', 'X', '', 'V', '', ''].map((l) => text(l, { height: cell, fontSize: daySize, lineHeight: 1, color: C.dim })),
      ),
      row(
        { gap: step - cell, alignItems: 'flex-start' },
        columns.map((c) =>
          col(
            { gap: step - cell },
            c.days.map((d) => {
              const day = byDate.get(iso(d));
              return div({ width: cell, height: cell, borderRadius: 3, background: day ? C.levels[day.level] : 'transparent' });
            }),
          ),
        ),
      ),
    ),
  );
}

// Una línea por mes: total de commits y los repositorios de más a menos activos.
function monthActivity({ month, repos }) {
  const [y, m] = month.split('-').map(Number);
  const total = repos.reduce((s, r) => s + r.commits, 0);
  return row(
    { gap: 10 },
    text(`${MONTHS[m - 1]} ${String(y).slice(2)}`, { width: 72, fontSize: 19, fontWeight: 700 }),
    text(num(total), { width: 40, fontSize: 19, fontWeight: 700, justifyContent: 'flex-end' }),
    text(truncate(repos.map((r) => `${r.name} ${r.commits}`).join(' · '), 32), { fontSize: 18, color: C.dim }),
  );
}

export function githubCard(src) {
  const d = src?.data;
  const shown = d?.byMonth?.slice(0, 3) || [];
  return card(
    {
      id: 'github',
      iconPath: mdiGithub,
      title: 'GitHub',
      subtitle: d ? `${num(d.total)} contribuciones` : null,
      status: fresh(src),
      style: HALF,
    },
    !d?.days
      ? message('Configura GITHUB_TOKEN')
      : [
          heatmap(d.days, d.weeks),
          shown.length ? col({ gap: 2 }, shown.map(monthActivity)) : message('Sin commits recientes'),
        ],
    errorLine(src),
  );
}

export function billingCard(src) {
  const d = src?.data;
  return card(
    {
      id: 'billing',
      iconPath: mdiGoogleCloud,
      title: 'Google Cloud',
      subtitle: d ? `${d.projectIds.length} proyectos` : null,
      status: fresh(src),
      style: HALF,
    },
    !d
      ? message('Configura la exportación de facturación a BigQuery (README)')
      : [
          row(
            { justifyContent: 'space-between', alignItems: 'flex-start' },
            stat('A pagar este mes', money(d.monthCost, d.currency), `bruto ${money(d.monthGross ?? d.monthCost, d.currency)} · dto. ${money(d.monthCredits ?? 0, d.currency)}`, { size: 40 }),
            stat('Mes anterior', money(d.prevMonthCost, d.currency), null, { size: 30, style: { alignItems: 'flex-end' } }),
          ),
          sparkline(d.daily, { width: 456, height: 22 }),
          col(
            { gap: 4 },
            d.projects.slice(0, 3).map((p) =>
              row({ justifyContent: 'space-between' }, text(truncate(p.id, 28), { fontSize: 20, fontWeight: 600 }), text(money(p.monthCost, d.currency), { fontSize: 19, color: C.dim })),
            ),
          ),
        ],
    errorLine(src),
  );
}
