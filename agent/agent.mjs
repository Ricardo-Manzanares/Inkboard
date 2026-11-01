// Agente del PC: recoge lo que solo existe en local (uso de Claude Code, Immich, dispositivos de la red local) y lo envía al servidor.
// Lo lanza una tarea programada cada 5 min mientras el PC está encendido. Sin dependencias: Node 22+.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanNetwork } from './network.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const claudeDir = path.join(os.homedir(), '.claude');
const stateFile = path.join(here, 'state.json');
const logFile = path.join(here, 'agent.log');

function loadEnv() {
  const file = path.join(here, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

function log(msg) {
  const line = `${new Date().toISOString()} ${msg}\n`;
  process.stdout.write(line);
  try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 512_000) fs.renameSync(logFile, `${logFile}.1`);
    fs.appendFileSync(logFile, line);
  } catch {}
}

const readJson = (file, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

// --- Claude Code: límites ------------------------------------------------------------------
// Endpoint interno que usa /usage. No está documentado y puede cambiar: si falla se reenvía la última lectura.
// El token solo se lee aquí; al servidor llegan únicamente los porcentajes.
async function claudeLimits(prev) {
  const oauth = readJson(path.join(claudeDir, '.credentials.json'), {}).claudeAiOauth;
  if (!oauth?.accessToken) throw new Error('sin credenciales OAuth de Claude Code');
  // No se refresca el token aquí: rotarlo podría cerrar la sesión de Claude Code. Claude Code lo renueva al usarse.
  if (oauth.expiresAt && oauth.expiresAt < Date.now()) throw new Error('token OAuth caducado (abre Claude Code para renovarlo)');
  const res = await fetch('https://api.anthropic.com/api/oauth/usage', {
    headers: { Authorization: `Bearer ${oauth.accessToken}`, 'anthropic-beta': 'oauth-2025-04-20', 'User-Agent': 'kindle-dashboard-agent' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`usage ${res.status}`);
  const u = await res.json();
  const win = (w, old) => (w ? { pct: w.utilization, resetsAt: w.resets_at } : old ?? null);
  return {
    plan: oauth.subscriptionType,
    limits: { fetchedAt: new Date().toISOString(), fiveHour: win(u.five_hour, prev?.limits?.fiveHour), sevenDay: win(u.seven_day, prev?.limits?.sevenDay) },
  };
}

// --- Claude Code: tokens desde los logs locales -----------------------------------------------
const localDay = (d) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

function* jsonlFiles(dir, minMtime) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* jsonlFiles(full, minMtime);
    else if (entry.name.endsWith('.jsonl') && fs.statSync(full).mtimeMs >= minMtime) yield full;
  }
}

function claudeTokens() {
  const days = [];
  for (let i = 6; i >= 0; i--) days.push(localDay(Date.now() - i * 864e5));
  const byDay = Object.fromEntries(days.map((d) => [d, { total: 0, output: 0 }]));
  const today = days[6];
  const seen = new Set();
  const sessionsToday = new Set();

  for (const file of jsonlFiles(path.join(claudeDir, 'projects'), Date.now() - 8 * 864e5)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.includes('"usage"')) continue;
      let e;
      try {
        e = JSON.parse(line);
      } catch {
        continue;
      }
      const u = e.message?.usage;
      if (e.type !== 'assistant' || !u || !e.timestamp) continue;
      // Un mismo mensaje se escribe varias veces (una por bloque de contenido): se cuenta una sola.
      const id = `${e.message.id}:${e.requestId}`;
      if (seen.has(id)) continue;
      seen.add(id);
      const day = byDay[localDay(e.timestamp)];
      if (!day) continue;
      day.output += u.output_tokens || 0;
      day.total += (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
      if (localDay(e.timestamp) === today && e.sessionId) sessionsToday.add(e.sessionId);
    }
  }
  return {
    today: byDay[today],
    sessionsToday: sessionsToday.size,
    weekTotal: days.reduce((a, d) => a + byDay[d].total, 0),
    days: days.map((date) => ({ date, ...byDay[date] })),
  };
}

// --- Immich ------------------------------------------------------------------------------
async function immich() {
  const base = (process.env.IMMICH_URL || 'http://localhost:2283').replace(/\/$/, '');
  const key = process.env.IMMICH_API_KEY;
  if (!key) throw new Error('falta IMMICH_API_KEY');
  const api = async (p, body) => {
    const res = await fetch(`${base}/api${p}`, {
      method: body ? 'POST' : 'GET',
      headers: { 'x-api-key': key, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Immich ${res.status} en ${p}`);
    return res.json();
  };

  try {
    await api('/server/ping');
  } catch {
    return { online: false };
  }

  const since = (h) => new Date(Date.now() - h * 36e5).toISOString();
  const [version, stats, up24, up7d, queues] = await Promise.all([
    api('/server/version'),
    api('/server/statistics'),
    api('/search/statistics', { createdAfter: since(24) }).catch(() => null),
    api('/search/statistics', { createdAfter: since(24 * 7) }).catch(() => null),
    pendingJobs(api),
  ]);
  return {
    online: true,
    version: `${version.major}.${version.minor}.${version.patch}`,
    photos: stats.photos,
    videos: stats.videos,
    usage: stats.usage,
    uploads24h: up24?.total ?? null,
    uploads7d: up7d?.total ?? null,
    queues,
  };
}

// Trabajos pendientes por cola. Las versiones nuevas exponen /queues y las antiguas /jobs, con formas distintas.
async function pendingJobs(api) {
  const pending = (c = {}) => (c.active || 0) + (c.waiting || 0) + (c.delayed || 0);
  try {
    const list = await api('/queues');
    return Object.fromEntries(list.map((q) => [q.name, pending(q.statistics)]));
  } catch {}
  try {
    const jobs = await api('/jobs');
    return Object.fromEntries(Object.entries(jobs).map(([name, j]) => [name, pending(j.jobCounts)]));
  } catch {
    return null;
  }
}

// --- Envío ---------------------------------------------------------------------------------
async function main() {
  loadEnv();
  const { SERVER_URL, INGEST_TOKEN } = process.env;


  const saved = readJson(stateFile, {});
  const payload = {};

  let limits;
  try {
    limits = await claudeLimits(saved.limits);
    saved.limits = limits;
  } catch (err) {
    log(`claude límites: ${err.message}`);
    limits = saved.limits || { limits: null };
  }
  payload.claude = { ...limits, tokens: claudeTokens() };

  try {
    payload.immich = await immich();
  } catch (err) {
    log(`immich: ${err.message}`);
    payload.immich = { online: false };
  }

  if (process.env.NET_SCAN !== '0') {
    try {
      const { result, store, warnings } = await scanNetwork(saved.network, {
        inventoryFile: path.join(here, 'devices.json'),
        forgetDays: Number(process.env.NET_FORGET_DAYS) || 7,
      });
      payload.network = result;
      saved.network = store;
      warnings.forEach(log);
    } catch (err) {
      log(`red: ${err.message}`);
    }
  }

  fs.writeFileSync(stateFile, JSON.stringify(saved, null, 2));

  if (process.argv.includes('--dry-run')) return console.log(JSON.stringify(payload, null, 2));
  if (!SERVER_URL || !INGEST_TOKEN) throw new Error('faltan SERVER_URL o INGEST_TOKEN en agent/.env');
  const res = await fetch(`${SERVER_URL.replace(/\/$/, '')}/api/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${INGEST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`servidor ${res.status}`);
  log(`enviado: claude ${payload.claude.limits?.fiveHour?.pct ?? '–'}% 5h · immich ${payload.immich.online ? 'online' : 'offline'} · red ${payload.network ? payload.network.devices.filter((d) => d.online).length : '–'} en línea`);
}

main().catch((err) => {
  log(`error: ${err.message}`);
  process.exitCode = 1;
});
