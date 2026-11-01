import { config } from '../config.js';

const tz = config.timeZone;

export function num(n, { decimals = 0 } = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return n.toLocaleString('es-ES', { maximumFractionDigits: decimals, minimumFractionDigits: decimals, useGrouping: 'always' });
}

// 1.234.567 -> "1,2 M"; 12.345 -> "12,3 k"
export function compact(n) {
  if (n === null || n === undefined) return '–';
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${num(n / 1e9, { decimals: 1 })} B`;
  if (abs >= 1e6) return `${num(n / 1e6, { decimals: 1 })} M`;
  if (abs >= 1e4) return `${num(n / 1e3, { decimals: 1 })} k`;
  return num(n);
}

export const usd = (n) => `${num(n, { decimals: 2 })} $`;
const SYMBOLS = { EUR: '€', USD: '$' };
export const money = (n, currency = 'EUR') => `${num(n, { decimals: 2 })} ${SYMBOLS[currency] || currency}`;
export const pct = (n, decimals = 1) => `${num(n, { decimals })} %`;

export function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${num(n / 1024 ** i, { decimals: i >= 3 ? 1 : 0 })} ${units[i]}`;
}

export function delta(cur, prev) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export const time = (d) =>
  new Date(d).toLocaleTimeString('es-ES', { timeZone: tz, hour: '2-digit', minute: '2-digit' });

export const longDate = (d) =>
  new Date(d).toLocaleDateString('es-ES', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' });

export const shortDate = (d) =>
  new Date(d).toLocaleDateString('es-ES', { timeZone: tz, day: 'numeric', month: 'short' }).replace('.', '');

// Hora si es hoy, "lun 09:00" si es otro día.
export function when(d) {
  const date = new Date(d);
  const sameDay = (a, b) => a.toLocaleDateString('es-ES', { timeZone: tz }) === b.toLocaleDateString('es-ES', { timeZone: tz });
  if (sameDay(date, new Date())) return time(date);
  const wd = date.toLocaleDateString('es-ES', { timeZone: tz, weekday: 'short' }).replace('.', '');
  return `${wd} ${time(date)}`;
}

export function ago(d) {
  if (!d) return 'sin datos';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.round(h / 24)} d`;
}

export const truncate = (s, n) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');
