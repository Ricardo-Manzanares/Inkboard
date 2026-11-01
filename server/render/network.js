// Red local: diagrama radial (router en el centro, repetidores y switches alrededor, dispositivos en el anillo
// exterior) y la lista de detalle. Los datos llegan del agente del PC (agent/network.mjs).
import {
  mdiRouterWireless, mdiAccessPoint, mdiLan, mdiPowerSocketEu, mdiTelevision, mdiCast, mdiDesktopTowerMonitor,
  mdiLaptop, mdiTablet, mdiCellphone, mdiBookOpenVariant, mdiController, mdiPrinter, mdiSpeaker, mdiCctv, mdiNas,
  mdiServer, mdiChip, mdiLightbulb, mdiPowerPlug, mdiWatch, mdiHelp, mdiWeb, mdiWifi, mdiEthernet, mdiHelpNetwork,
} from '@mdi/js';
import { C, el, div, row, col, text, card, chip, message } from './ui.js';
import { ago, num } from './format.js';
import { fresh, errorLine } from './cards.js';

export const ICONS = {
  router: mdiRouterWireless, ap: mdiAccessPoint, switch: mdiLan, powerline: mdiPowerSocketEu, tv: mdiTelevision,
  streamer: mdiCast, pc: mdiDesktopTowerMonitor, laptop: mdiLaptop, tablet: mdiTablet, phone: mdiCellphone,
  ereader: mdiBookOpenVariant, console: mdiController, printer: mdiPrinter, speaker: mdiSpeaker, camera: mdiCctv,
  nas: mdiNas, server: mdiServer, iot: mdiChip, light: mdiLightbulb, plug: mdiPowerPlug, watch: mdiWatch, unknown: mdiHelp,
};

export const TYPE_LABEL = {
  router: 'Router', ap: 'Punto de acceso', switch: 'Switch', powerline: 'PLC', tv: 'Televisor', streamer: 'Reproductor',
  pc: 'PC', laptop: 'Portátil', tablet: 'Tablet', phone: 'Móvil', ereader: 'Lector', console: 'Consola',
  printer: 'Impresora', speaker: 'Altavoz', camera: 'Cámara', nas: 'NAS', server: 'Servidor', iot: 'Domótica',
  light: 'Luz', plug: 'Enchufe', watch: 'Reloj', unknown: 'Desconocido',
};

const INFRA = new Set(['ap', 'switch', 'powerline']);
const DAY = 864e5;

// --- utilidades ---------------------------------------------------------------------------------
export function duration(ms) {
  const min = Math.max(0, Math.round(ms / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return h % 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${Math.floor(h / 24)} d`;
}

// online, recent (desconectado hace menos de 24 h o equipo que duerme), stale (24 h o más) o never.
export function statusOf(d, now = Date.now()) {
  if (d.online) return 'online';
  if (!d.lastSeen) return d.sleeps ? 'recent' : 'never';
  return d.sleeps || now - new Date(d.lastSeen) < DAY ? 'recent' : 'stale';
}

const shortMac = (mac) => (mac ? mac.slice(-5) : '');
export const displayName = (d) => d.name || `${d.vendor || (d.type === 'unknown' ? 'Equipo' : TYPE_LABEL[d.type]) || 'Equipo'} ${shortMac(d.mac)}`;

// Segunda línea de cada equipo: IP y tiempo conectado, o cuándo se vio por última vez.
export function whenLine(d, now = Date.now()) {
  if (d.online) return d.onlineSince ? duration(now - new Date(d.onlineSince)) : 'en línea';
  return d.lastSeen ? `visto ${ago(d.lastSeen)}` : 'nunca visto';
}

// Corta el texto para que quepa en el ancho dado (Inter: unos 0,56 em por carácter de media).
const fit = (s, px, size) => {
  const max = Math.max(4, Math.floor(px / (size * 0.53)));
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

// --- grafo ----------------------------------------------------------------------------------------
// Devuelve el router, los nodos intermedios (equipos de red y grupos virtuales) y las hojas, cada una con su padre.
export function buildGraph(devices) {
  const byMac = new Map(devices.map((d) => [d.mac, d]));
  const router = devices.find((d) => d.gateway) || { mac: 'router', name: 'Router', type: 'router', online: true, gateway: true, known: true };
  const parents = new Set(devices.map((d) => d.parent).filter((p) => p && byMac.has(p)));
  const isInfra = (d) => d !== router && (INFRA.has(d.type) || parents.has(d.mac));

  const hubs = new Map();
  for (const d of devices.filter(isInfra)) {
    const p = d.parent && byMac.has(d.parent) && d.parent !== d.mac ? d.parent : router.mac;
    hubs.set(d.mac, { key: d.mac, device: d, parent: p, label: displayName(d), sub: TYPE_LABEL[d.type], icon: ICONS[d.type] || mdiLan });
  }
  const virtual = {
    wifi: { label: 'Wi-Fi', icon: mdiWifi },
    ethernet: { label: 'Ethernet', icon: mdiEthernet },
    lan: { label: 'Red local', sub: 'conexión sin indicar', icon: mdiLan },
    unknown: { label: 'Sin identificar', sub: 'añádelos a devices.json', icon: mdiHelpNetwork, dashed: true },
  };

  const leaves = [];
  for (const d of devices) {
    if (d === router || hubs.has(d.mac)) continue;
    let group;
    if (d.parent === 'router' || d.parent === router.mac) group = 'direct';
    else if (d.parent && hubs.has(d.parent)) group = d.parent;
    else if (!d.known) group = 'unknown';
    else group = d.link === 'wifi' ? 'wifi' : d.link === 'ethernet' ? 'ethernet' : 'lan';
    if (!hubs.has(group) && virtual[group]) hubs.set(group, { key: group, parent: router.mac, virtual: true, ...virtual[group] });
    leaves.push({ device: d, group });
  }

  // Orden alrededor del círculo: equipos de red, Wi-Fi, Ethernet, red local, directos al router y sin identificar.
  const rank = (g) => (g === 'unknown' ? 9 : g === 'direct' ? 8 : g === 'lan' ? 7 : g === 'ethernet' ? 6 : g === 'wifi' ? 5 : 1);
  const order = [...new Set(leaves.map((l) => l.group))].sort((a, b) => rank(a) - rank(b));
  const statusRank = { online: 0, recent: 1, stale: 2, never: 3 };
  leaves.sort(
    (a, b) =>
      order.indexOf(a.group) - order.indexOf(b.group) ||
      statusRank[statusOf(a.device)] - statusRank[statusOf(b.device)] ||
      displayName(a.device).localeCompare(displayName(b.device), 'es'),
  );
  return { router, hubs, leaves, groups: order };
}

// --- diagrama ---------------------------------------------------------------------------------------
const DW = 980;
const DH = 1100;
const CX = DW / 2;
const CY = DH / 2;
const LEAF = { rx: 312, ry: 382, r: 22 };
const HUB = { rx: 168, ry: 215, r: 32 };
const LABEL_W = 154;

function layoutGraph(g) {
  const slots = g.leaves.length + (g.groups.length > 1 ? g.groups.length : 0);
  const step = (2 * Math.PI) / Math.max(slots, 10);
  // Se centra el conjunto en la parte de arriba para que los huecos queden abajo.
  let a = -Math.PI / 2 - ((slots - 1) * step) / 2;
  let prev = null;
  const pos = new Map();
  for (const leaf of g.leaves) {
    if (prev !== null && leaf.group !== prev) a += step;
    prev = leaf.group;
    leaf.angle = a;
    leaf.x = CX + LEAF.rx * Math.cos(a);
    leaf.y = CY + LEAF.ry * Math.sin(a);
    a += step;
  }
  // Cada nodo intermedio, en la dirección media de sus hojas (media circular, para no saltar al cruzar ±180°).
  const hubList = [...g.hubs.values()];
  for (const h of hubList) {
    const mine = g.leaves.filter((l) => l.group === h.key);
    if (mine.length) h.angle = Math.atan2(mine.reduce((s, l) => s + Math.sin(l.angle), 0), mine.reduce((s, l) => s + Math.cos(l.angle), 0));
  }
  const free = hubList.filter((h) => h.angle === undefined);
  free.forEach((h, i) => (h.angle = Math.PI / 2 + (i - (free.length - 1) / 2) * 0.6));
  for (const h of hubList) {
    h.x = CX + HUB.rx * Math.cos(h.angle);
    h.y = CY + HUB.ry * Math.sin(h.angle);
    pos.set(h.key, h);
  }
  pos.set(g.router.mac, { x: CX, y: CY });
  pos.set('direct', { x: CX, y: CY });
  return pos;
}

// Direcciones (desde el centro) de los dos mayores huecos entre ángulos dados, de mayor a menor.
function freeDirections(angles) {
  const a = angles.filter((x) => Number.isFinite(x)).map((x) => ((x % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)).sort((p, q) => p - q);
  if (!a.length) return [-Math.PI / 2, Math.PI / 2];
  if (a.length === 1) return [a[0] + Math.PI, a[0] + Math.PI / 2];
  const gaps = a.map((x, i) => {
    const next = i + 1 < a.length ? a[i + 1] : a[0] + 2 * Math.PI;
    return { size: next - x, mid: x + (next - x) / 2 };
  }).sort((p, q) => q.size - p.size);
  // Un hueco muy grande admite las dos cosas: Internet a un tercio y la etiqueta a dos tercios.
  if (gaps.length < 2 || gaps[0].size > 2 * gaps[1].size) {
    const start = gaps[0].mid - gaps[0].size / 2;
    return [start + gaps[0].size / 3, start + (2 * gaps[0].size) / 3];
  }
  return [gaps[0].mid, gaps[1].mid];
}

const iconAt = (path, x, y, size, color) =>
  el('path', { d: path, fill: color, transform: `translate(${(x - size / 2).toFixed(1)},${(y - size / 2).toFixed(1)}) scale(${(size / 24).toFixed(3)})` });

// Círculo de un equipo según su estado: relleno si está en línea, contorno si no, discontinuo si hace mucho.
function nodeShape(x, y, r, path, status, { dashed = false } = {}) {
  const online = status === 'online';
  const stale = status === 'stale' || status === 'never';
  return [
    el('circle', {
      cx: x, cy: y, r,
      fill: online ? C.ink : C.card,
      stroke: stale ? C.faint : C.ink,
      'stroke-width': online ? 0 : 3,
      'stroke-dasharray': dashed || stale ? '5 4' : undefined,
    }),
    online && dashed && el('circle', { cx: x, cy: y, r: r + 5, fill: 'none', stroke: C.ink, 'stroke-width': 2, 'stroke-dasharray': '4 4' }),
    iconAt(path, x, y, r * 1.15, online ? C.onInk : stale ? C.faint : C.ink),
  ];
}

const line = (a, b, { online, width = 3 }) =>
  el('line', {
    x1: a.x.toFixed(1), y1: a.y.toFixed(1), x2: b.x.toFixed(1), y2: b.y.toFixed(1),
    stroke: online ? C.ink : C.faint, 'stroke-width': online ? width : 2, 'stroke-dasharray': online ? undefined : '7 6',
  });

// Etiqueta en la dirección del radio, girada para leerse de izquierda a derecha a ambos lados del círculo.
function radialLabel(x, y, lines, status) {
  const phi = Math.atan2(y - CY, x - CX);
  const right = Math.cos(phi) >= -0.02;
  const deg = (phi * 180) / Math.PI + (right ? 0 : 180);
  const gapPx = LEAF.r + 9;
  const ax = x + gapPx * Math.cos(phi);
  const ay = y + gapPx * Math.sin(phi);
  const dim = status === 'stale' || status === 'never';
  return div(
    { position: 'absolute', left: ax, top: ay, width: 0, height: 0, transform: `rotate(${deg.toFixed(1)}deg)` },
    col(
      { position: 'absolute', top: -27, width: LABEL_W, ...(right ? { left: 0, alignItems: 'flex-start' } : { right: 0, alignItems: 'flex-end' }) },
      text(fit(lines[0], LABEL_W, 18), { fontSize: 18, fontWeight: 700, color: dim ? C.dim : C.ink, lineHeight: 1.05, whiteSpace: 'nowrap' }),
      lines.slice(1).map((l) => text(fit(l, LABEL_W, 15), { fontSize: 15, color: C.dim, lineHeight: 1.1, whiteSpace: 'nowrap' })),
    ),
  );
}

// Etiqueta horizontal con fondo, para los nodos del centro, que tienen líneas alrededor.
const plate = (x, y, title, sub, { align = 'center', width = 200 } = {}) =>
  col(
    {
      position: 'absolute', top: y, width,
      left: align === 'left' ? x : x - width / 2,
      alignItems: align === 'left' ? 'flex-start' : 'center',
    },
    col(
      { background: C.card, borderRadius: 10, padding: '1px 8px', alignItems: align === 'left' ? 'flex-start' : 'center' },
      text(title, { fontSize: 20, fontWeight: 800, whiteSpace: 'nowrap' }),
      sub && text(sub, { fontSize: 16, color: C.dim, whiteSpace: 'nowrap' }),
    ),
  );

function diagram(data) {
  const now = Date.now();
  const g = buildGraph(data.devices);
  const pos = layoutGraph(g);
  const routerPos = pos.get(g.router.mac);
  // Internet y la etiqueta del router van en los dos mayores huecos que dejan los nodos intermedios.
  const [gap1, gap2] = freeDirections([...g.hubs.values()].map((h) => h.angle));
  const internet = { x: CX + 112 * Math.cos(gap1), y: CY + 112 * Math.sin(gap1) };

  const hubOnline = (h) => (h.device ? h.device.online : g.leaves.some((l) => l.group === h.key && l.device.online));
  const shapes = [];
  const labels = [];

  // Líneas primero, para que los círculos queden encima.
  shapes.push(line(internet, routerPos, { online: g.router.online, width: 4 }));
  for (const h of g.hubs.values()) shapes.push(line(h, pos.get(h.parent) || routerPos, { online: hubOnline(h), width: 4 }));
  for (const l of g.leaves) shapes.push(line(l, pos.get(l.group) || routerPos, { online: l.device.online }));

  shapes.push(...nodeShape(internet.x, internet.y, 24, mdiWeb, g.router.online ? 'online' : 'recent'));
  labels.push(plate(internet.x, internet.y + 26, 'Internet', null, { width: 120 }));
  shapes.push(...nodeShape(routerPos.x, routerPos.y, 44, ICONS.router, statusOf(g.router)));
  // La etiqueta del router (unos 140×48) se aleja del centro lo justo para no tapar el círculo.
  const rl = { x: routerPos.x + 100 * Math.cos(gap2), y: routerPos.y + 78 * Math.sin(gap2) - 24 };
  labels.push(plate(rl.x, rl.y, displayName(g.router), g.router.ip || data.gateway || '–', { width: 150 }));

  for (const h of g.hubs.values()) {
    const kids = g.leaves.filter((l) => l.group === h.key);
    const on = kids.filter((l) => l.device.online).length;
    const status = h.device ? statusOf(h.device, now) : on ? 'online' : 'recent';
    shapes.push(...nodeShape(h.x, h.y, HUB.r, h.icon, status, { dashed: h.dashed }));
    const sub = h.device ? `${h.device.ip || ''}${kids.length ? ` · ${on}/${kids.length}` : ''}` : `${on} de ${kids.length} en línea`;
    labels.push(plate(h.x, h.y + HUB.r + 4, h.label, sub));
  }

  for (const l of g.leaves) {
    const d = l.device;
    const status = statusOf(d, now);
    shapes.push(...nodeShape(l.x, l.y, LEAF.r, ICONS[d.type] || mdiHelp, status, { dashed: !d.known }));
    labels.push(radialLabel(l.x, l.y, [displayName(d), d.ip || '–', whenLine(d, now)], status));
  }

  return div(
    { position: 'relative', width: DW, height: DH },
    el('svg', { width: DW, height: DH, viewBox: `0 0 ${DW} ${DH}`, style: { position: 'absolute', left: 0, top: 0 } }, shapes.filter(Boolean)),
    labels,
  );
}

export function summary(devices, now = Date.now()) {
  const count = { online: 0, recent: 0, stale: 0, never: 0, unknown: 0 };
  for (const d of devices) {
    count[statusOf(d, now)]++;
    if (!d.known) count.unknown++;
  }
  return count;
}

function summaryChips(devices) {
  const c = summary(devices);
  return row(
    { gap: 10, flexWrap: 'wrap' },
    chip(`${c.online} en línea`, { inverted: true }),
    c.recent > 0 && chip(`${c.recent} ${c.recent === 1 ? "desconectado" : "desconectados"} < 24 h`),
    c.stale + c.never > 0 && chip(`${c.stale + c.never} sin ver 24 h+`),
    c.unknown > 0 && chip(`${c.unknown} sin identificar`),
  );
}

// Leyenda dibujada con las mismas formas del diagrama (el subconjunto latino de Inter no trae ● ni ○).
function legend() {
  const sample = (status, dashed) =>
    el('svg', { width: 30, height: 30, viewBox: '0 0 30 30' }, nodeShape(15, 15, 11, mdiHelp, status, { dashed }).filter(Boolean).map((s) => (s.props.d ? null : s)));
  const item = (status, label, dashed) => row({ gap: 6 }, sample(status, dashed), text(label, { fontSize: 18, color: C.dim }));
  return row(
    { gap: 22, justifyContent: 'center', flexWrap: 'wrap' },
    item('online', 'en línea'),
    item('recent', 'desconectado'),
    item('stale', 'sin ver 24 h+'),
    item('online', 'sin identificar', true),
    text('Toca para ver la lista', { fontSize: 18, color: C.dim }),
  );
}

const subtitleOf = (src, data) => {
  const parts = [data.subnet, `barrido ${ago(src.updatedAt)}`];
  // El agente solo barre con el PC encendido: pasado un rato, "en línea" es la última foto conocida.
  if (Date.now() - new Date(src.updatedAt) > 30 * 60_000) parts.push('PC apagado');
  return parts.filter(Boolean).join(' · ');
};

export function networkCard(src) {
  const d = src?.data;
  return card(
    { id: 'network', iconPath: mdiLan, title: 'Red local', subtitle: d ? subtitleOf(src, d) : null, status: fresh(src), style: { flexGrow: 1 } },
    !d?.devices?.length
      ? message('Esperando el barrido de la red del agente del PC')
      : [summaryChips(d.devices), row({ justifyContent: 'center' }, diagram(d)), legend()],
    errorLine(src),
  );
}

// --- detalle: lista de equipos ----------------------------------------------------------------------
const LINK = { wifi: 'Wi-Fi', ethernet: 'Ethernet' };
const MAX_ROWS = 28;

export function networkList(src, { detail, label, W }) {
  const d = src?.data;
  const now = Date.now();
  const header = { iconPath: mdiLan, title: 'Red local', subtitle: d ? subtitleOf(src, d) : null, status: fresh(src) };
  if (!d?.devices?.length) return detail(header, message('Esperando el barrido de la red del agente del PC'));
  const g = buildGraph(d.devices);
  const rank = { online: 0, recent: 1, stale: 2, never: 3 };
  const all = [g.router, ...[...g.hubs.values()].map((h) => h.device).filter(Boolean), ...g.leaves.map((l) => l.device)].sort(
    (a, b) => rank[statusOf(a, now)] - rank[statusOf(b, now)] || (a.ip || '').localeCompare(b.ip || '', 'es', { numeric: true }),
  );
  const shown = all.slice(0, MAX_ROWS);
  const cols = { name: 270, mac: 222, ip: 158, link: 100, time: W - 270 - 222 - 158 - 100 - 52 };

  const head = row(
    { gap: 0, paddingLeft: 52 },
    div({ width: cols.name }, label('Equipo')),
    div({ width: cols.mac }, label('MAC')),
    div({ width: cols.ip }, label('IP')),
    div({ width: cols.link }, label('Red')),
    div({ width: cols.time }, label('Conectado')),
  );
  const rows = shown.map((x) => {
    const status = statusOf(x, now);
    const dim = status !== 'online';
    const name = displayName(x) + (x.randomMac && x.name ? ' ·  MAC privada' : '');
    return row(
      { gap: 0, height: 34 },
      el('svg', { width: 52, height: 34, viewBox: '0 0 52 34' }, nodeShape(17, 17, 15, ICONS[x.type] || mdiHelp, status, { dashed: !x.known }).filter(Boolean)),
      text(fit(name, cols.name - 10, 20), { width: cols.name, fontSize: 20, fontWeight: 700, color: dim ? C.dim : C.ink, whiteSpace: 'nowrap' }),
      text(x.mac && x.mac.includes(':') ? x.mac : '–', { width: cols.mac, fontSize: 18, letterSpacing: -0.2, fontWeight: x.known ? 400 : 700 }),
      text(x.ip || '–', { width: cols.ip, fontSize: 20 }),
      text(LINK[x.link] || '–', { width: cols.link, fontSize: 20 }),
      text(x.online ? (x.onlineSince ? duration(now - new Date(x.onlineSince)) : 'en línea') : whenLine(x, now), { width: cols.time, fontSize: 20, fontWeight: x.online ? 700 : 400, color: dim ? C.dim : C.ink }),
    );
  });
  return detail(
    header,
    summaryChips(d.devices),
    head,
    col({ gap: 1, marginTop: -10 }, rows),
    all.length > shown.length && text(`y ${num(all.length - shown.length)} más`, { fontSize: 20, color: C.dim }),
    text(
      `MAC en negrita: equipo sin identificar; añádela a agent/devices.json. «Conectado» cuenta desde que el agente del PC lo ve sin interrupción.`,
      { fontSize: 18, color: C.dim },
    ),
    errorLine(src),
  );
}
