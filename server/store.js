import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const file = path.join(config.dataDir, 'state.json');
let state = {};

export function load() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  try {
    state = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    state = {};
  }
  return state;
}

function save() {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, file);
}

export const getState = () => state;

// Si una fuente falla se conservan sus últimos datos buenos y solo se anota el error.
export function put(source, data) {
  state[source] = { updatedAt: new Date().toISOString(), data };
  save();
}

export function putError(source, error) {
  state[source] = { ...state[source], error: String(error?.message || error), errorAt: new Date().toISOString() };
  save();
}

// Immich se enciende bajo demanda: offline marca el estado sin perder las últimas estadísticas.
export function putImmich(data) {
  const now = new Date().toISOString();
  if (data.online === false) {
    state.immich = { ...state.immich, checkedAt: now, data: { ...state.immich?.data, online: false } };
  } else {
    state.immich = { updatedAt: now, checkedAt: now, data: { ...data, online: true } };
  }
  save();
}
