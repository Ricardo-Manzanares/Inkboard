import fs from 'node:fs';
import path from 'node:path';

// En local las variables vienen de .env; en Railway no existe y se usan las del servicio.
if (fs.existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  port: num(env.PORT, 3000),
  dataDir: env.DATA_DIR || path.resolve('data'),
  timeZone: env.TZ_DISPLAY || 'Europe/Madrid',
  ingestToken: env.INGEST_TOKEN || '',
  dashKey: env.DASH_KEY || '',
  // Clave de la página web /web; distinta de DASH_KEY para que la del Kindle no abra la web.
  webKey: env.WEB_KEY || '',
  refreshMinutes: num(env.KINDLE_REFRESH_MIN, 5),

  github: {
    token: env.GITHUB_TOKEN || '',
    everyMin: num(env.GITHUB_EVERY_MIN, 30),
  },
  google: {
    credentials: env.GOOGLE_SERVICE_ACCOUNT_JSON || '',
  },
  gsc: {
    siteUrl: env.GSC_SITE_URL || '',
    everyMin: num(env.GSC_EVERY_MIN, 360),
  },
  // Gasto de Google Cloud: exportación de facturación a BigQuery (dataset o tabla), filtrada por proyectos.
  billing: {
    table: env.GCP_BILLING_TABLE || '',
    projectIds: list(env.GCP_BILLING_PROJECT_IDS),
    // Proyecto del que se muestra el uso de Firebase frente al nivel gratuito; vacío = el primero de la lista.
    firebaseProject: env.GCP_BILLING_FIREBASE_PROJECT || '',
    location: env.GCP_BILLING_LOCATION || '',
    everyMin: num(env.GCP_BILLING_EVERY_MIN, 180),
  },
  railway: {
    token: env.RAILWAY_API_TOKEN || '',
    workspaceId: env.RAILWAY_WORKSPACE_ID || '',
    projectIds: list(env.RAILWAY_PROJECT_IDS),
    everyMin: num(env.RAILWAY_EVERY_MIN, 30),
    // Precio por unidad de cada medida de Railway, en USD. Revisa railway.com/pricing.
    prices: {
      CPU_USAGE: num(env.RAILWAY_PRICE_VCPU_MIN, 20 / 43200), // vCPU-minuto
      MEMORY_USAGE_GB: num(env.RAILWAY_PRICE_GB_MIN, 10 / 43200), // GB-minuto
      NETWORK_TX_GB: num(env.RAILWAY_PRICE_EGRESS_GB, 0.05), // GB
      DISK_USAGE_GB: num(env.RAILWAY_PRICE_DISK_GB_MIN, 0.15 / 43200), // GB-minuto
    },
  },
};
