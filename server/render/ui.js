// Primitivas de UI para satori: nodos tipo React sin JSX, en tonos de gris pensados para e-ink.

export const C = {
  page: '#d6d6d6',
  card: '#ffffff',
  ink: '#000000',
  dim: '#4a4a4a',
  faint: '#8a8a8a',
  track: '#d0d0d0',
  onInk: '#ffffff', // texto e iconos sobre fondo de tinta
  area: '#c8c8c8', // relleno bajo las líneas
  levels: ['#e4e4e4', '#b0b0b0', '#808080', '#4a4a4a', '#000000'], // calendario de GitHub, de menos a más
};

// Temas del widget de escritorio: fondo transparente para ver el de Windows y tarjetas casi opacas.
// light son los colores del Kindle; dark, su inverso.
export const THEMES = {
  light: {
    page: 'rgba(0,0,0,0)',
    card: 'rgba(255,255,255,0.92)',
  },
  dark: {
    page: 'rgba(0,0,0,0)',
    card: 'rgba(24,24,24,0.9)',
    ink: '#f2f2f2',
    dim: '#b0b0b0',
    faint: '#707070',
    track: '#3c3c3c',
    onInk: '#141414',
    area: '#4a4a4a',
    levels: ['#2c2c2c', '#555555', '#8a8a8a', '#bdbdbd', '#f2f2f2'],
  },
};

// satori recibe el árbol ya montado, con los colores dentro: basta cambiar la paleta mientras se construye.
export function withTheme(theme, build) {
  if (!THEMES[theme]) return build();
  const saved = { ...C };
  Object.assign(C, THEMES[theme]);
  try {
    return build();
  } finally {
    Object.assign(C, saved);
  }
}

export function el(type, props = {}, ...children) {
  const { style = {}, ...rest } = props;
  const kids = children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false && c !== '');
  return {
    type,
    props: {
      ...rest,
      style: type === 'div' ? { display: 'flex', ...style } : style,
      children: kids.length === 1 ? kids[0] : kids,
    },
  };
}

export const div = (style, ...children) => el('div', { style }, ...children);
export const row = (style, ...children) => div({ flexDirection: 'row', alignItems: 'center', ...style }, ...children);
export const col = (style, ...children) => div({ flexDirection: 'column', ...style }, ...children);
export const text = (str, style) => div(style, String(str));

export const icon = (path, size = 32, color = C.ink) =>
  el('svg', { width: size, height: size, viewBox: '0 0 24 24' }, el('path', { d: path, fill: color }));

// Insignia redonda con icono, como las de las tarjetas
export const badge = (path, size = 56) =>
  div(
    { width: size, height: size, borderRadius: size / 2, background: C.ink, alignItems: 'center', justifyContent: 'center' },
    icon(path, size * 0.58, C.onInk),
  );

export const chip = (label, { inverted = false } = {}) =>
  div(
    {
      padding: '6px 16px',
      borderRadius: 999,
      fontSize: 20,
      fontWeight: 600,
      background: inverted ? C.ink : C.card,
      color: inverted ? C.onInk : C.ink,
      border: `2px solid ${C.ink}`,
      // Siempre en una línea: si falta sitio, que se ajuste el título, no la etiqueta.
      flexShrink: 0,
      whiteSpace: 'nowrap',
    },
    label,
  );

// Mapa de toques: al renderizarlo, cada zona pulsable se tapa con un gris propio y el píxel bajo el dedo dice qué se tocó.
export const hitmap = { on: false, ids: [] };
export const hitValue = (i) => 16 + 24 * i;
export function hitArea(id, { radius = 26, inset = 0 } = {}) {
  if (!hitmap.on || !id) return null;
  const v = hitValue(hitmap.ids.push(id) - 1);
  return div({ position: 'absolute', left: inset, top: inset, right: inset, bottom: inset, borderRadius: radius, background: `rgb(${v},${v},${v})` });
}

export function card({ id, iconPath, title, subtitle, status, statusInverted, style }, ...body) {
  return col(
    { position: 'relative', background: C.card, borderRadius: 26, padding: '16px 24px', gap: 12, boxSizing: 'border-box', ...style },
    row(
      { gap: 16 },
      badge(iconPath, 48),
      col({ flexGrow: 1 }, text(title, { fontSize: 28, fontWeight: 700 }), subtitle && text(subtitle, { fontSize: 19, color: C.dim })),
      status && chip(status, { inverted: statusInverted }),
    ),
    ...body,
    hitArea(id),
  );
}

// Número grande con etiqueta encima y una línea opcional debajo.
export const stat = (label, value, sub, { size = 44, style } = {}) =>
  col(
    { gap: 2, ...style },
    text(label, { fontSize: 19, color: C.dim, fontWeight: 500 }),
    text(value, { fontSize: size, fontWeight: 700, lineHeight: 1.05 }),
    sub && text(sub, { fontSize: 19, color: C.dim }),
  );

// Pista y relleno comparten la misma píldora y el borde va en una capa encima: si el borde fuera de la pista,
// su curva interior sería más cerrada que la del relleno y asomaría la pista en las esquinas.
// El relleno tiene un ancho mínimo para que un valor bajo sea un extremo redondeado y no una raya.
export function bar(fraction, { height = 18, width = '100%' } = {}) {
  const f = Math.max(0, Math.min(1, fraction));
  const round = height / 2;
  return div(
    { position: 'relative', width, height, borderRadius: round, background: C.track, overflow: 'hidden' },
    f > 0 && div({ width: `${f * 100}%`, minWidth: height, height: '100%', borderRadius: round, background: C.ink }),
    div({ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: round, border: `2px solid ${C.ink}` }),
  );
}

export function sparkline(values, { width = 400, height = 80, stroke = 4 } = {}) {
  if (!values?.length) return div({ width, height });
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => [i * step, height - stroke - ((v - min) / (max - min || 1)) * (height - stroke * 2)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M0,${height} L${line.replaceAll(' ', ' L')} L${width},${height} Z`;
  return el(
    'svg',
    { width, height, viewBox: `0 0 ${width} ${height}` },
    el('path', { d: area, fill: C.area }),
    el('polyline', { points: line, fill: 'none', stroke: C.ink, 'stroke-width': stroke, 'stroke-linejoin': 'round' }),
  );
}

export function bars(values, labels, { width = 420, height = 110 } = {}) {
  const max = Math.max(...values, 1);
  const gap = 10;
  const w = (width - gap * (values.length - 1)) / values.length;
  return row(
    { width, alignItems: 'flex-end', gap },
    values.map((v, i) =>
      col(
        { width: w, alignItems: 'center', gap: 4 },
        div({ width: w, height: Math.max(3, (v / max) * (height - 28)), background: i === values.length - 1 ? C.ink : C.faint, borderRadius: 6 }),
        text(labels[i], { fontSize: 18, color: C.dim, fontWeight: i === values.length - 1 ? 700 : 400 }),
      ),
    ),
  );
}

// Columnas con el valor encima y la etiqueta debajo; la última, en negro. Etiquetas vacías dejan el hueco.
export function columns(values, labels, { width, height, format, valueSize = 20, labelSize = 20, gap = 12 }) {
  const max = Math.max(...values, 1e-9);
  const w = (width - gap * (values.length - 1)) / values.length;
  const room = height - (format ? valueSize + 10 : 0) - labelSize - 12;
  return row(
    { width, height, alignItems: 'flex-end', gap },
    values.map((v, i) =>
      col(
        { width: w, alignItems: 'center', gap: 5 },
        format && text(format(v), { fontSize: valueSize, fontWeight: 600 }),
        div({ width: w, height: Math.max(3, (v / max) * room), background: i === values.length - 1 ? C.ink : C.faint, borderRadius: Math.min(6, w / 3) }),
        text(labels[i] || ' ', { fontSize: labelSize, color: C.dim, fontWeight: i === values.length - 1 ? 700 : 400 }),
      ),
    ),
  );
}

// Barra horizontal sólida, para comparar filas de una lista. Ocupa siempre el ancho entero para alinear lo que sigue.
export const hbar = (fraction, { width = 300, height = 16 } = {}) =>
  div({ width }, div({ width: Math.max(height / 2, Math.max(0, Math.min(1, fraction)) * width), height, borderRadius: height / 2, background: C.ink }));

export const divider = () => div({ height: 2, background: C.track, width: '100%' });

// Variación porcentual con flecha. Las flechas son iconos porque el subconjunto latino de Inter no trae ▲▼.
const ARROW_UP = 'M7,15L12,10L17,15H7Z';
const ARROW_DOWN = 'M7,10L12,15L17,10H7Z';
export function trend(value, { size = 20 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return row(
    { gap: 2 },
    value !== 0 && icon(value > 0 ? ARROW_UP : ARROW_DOWN, size + 8),
    text(`${Math.abs(value).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`, { fontSize: size, fontWeight: 600 }),
  );
}

export const message = (str) => text(str, { fontSize: 22, color: C.dim, fontStyle: 'italic' });
