import { config } from '../config.js';
import { googleClient } from './google.js';

const BQ = 'https://bigquery.googleapis.com/bigquery/v2';
const client = () => googleClient('https://www.googleapis.com/auth/bigquery.readonly');

// La API de Cloud Billing no da el gasto: solo la exportación de facturación a BigQuery lo tiene.
// Coste bruto y créditos (que vienen en negativo, como el nivel gratuito) por separado; a pagar = bruto + créditos.
const CREDITS = 'IFNULL((SELECT SUM(c.amount) FROM UNNEST(credits) c), 0)';

// Mes actual y anterior, por día, proyecto y servicio.
const costSql = (table) => `
SELECT
  FORMAT_DATE('%F', DATE(usage_start_time, @tz)) AS day,
  project.id AS project,
  service.description AS service,
  SUM(cost) AS gross,
  SUM(${CREDITS}) AS credits,
  ANY_VALUE(currency) AS currency
FROM \`${table}\`
WHERE project.id IN UNNEST(@projects)
  AND usage_start_time >= TIMESTAMP(DATE_SUB(DATE_TRUNC(CURRENT_DATE(@tz), MONTH), INTERVAL 1 MONTH), @tz)
GROUP BY day, project, service`;

// Uso de Firebase del mes en un proyecto, por SKU: el almacenamiento viene en byte-segundos,
// así que dividido entre los segundos que cubre da el tamaño medio, como el panel de Firebase.
const firebaseSql = (table) => `
SELECT
  service.description AS service,
  sku.description AS sku,
  usage.unit AS unit,
  SUM(usage.amount) AS amount,
  TIMESTAMP_DIFF(MAX(usage_end_time), MIN(usage_start_time), SECOND) AS seconds,
  SUM(cost) AS gross,
  SUM(${CREDITS}) AS credits
FROM \`${table}\`
WHERE project.id = @firebase
  AND usage_start_time >= TIMESTAMP(DATE_TRUNC(CURRENT_DATE(@tz), MONTH), @tz)
  AND (service.description LIKE 'Firebase%' OR service.description LIKE '%Functions%')
GROUP BY service, sku, unit`;

// GCP_BILLING_TABLE puede ser la tabla o solo el dataset: el nombre de la tabla lleva el ID de la cuenta
// de facturación y no existe hasta que llega el primer lote, así que se busca la de la exportación estándar.
async function resolveTable(name) {
  if (/^[\w-]+\.\w+\.\w+$/.test(name)) return name;
  if (!/^[\w-]+\.\w+$/.test(name)) throw new Error('GCP_BILLING_TABLE debe ser proyecto.dataset o proyecto.dataset.tabla');
  const [project, dataset] = name.split('.');
  const { data } = await client().request({ url: `${BQ}/projects/${project}/datasets/${dataset}/tables` });
  const table = (data.tables || []).map((t) => t.tableReference.tableId).find((t) => t.startsWith('gcp_billing_export_v1_'));
  if (!table) throw new Error('La exportación aún no ha creado la tabla (tarda unas horas)');
  return `${name}.${table}`;
}

const string = (name, value) => ({ name, parameterType: { type: 'STRING' }, parameterValue: { value } });
const strings = (name, values) => ({
  name,
  parameterType: { type: 'ARRAY', arrayType: { type: 'STRING' } },
  parameterValue: { arrayValues: values.map((value) => ({ value })) },
});

// Filas como objetos con los nombres de columna; los números llegan como texto.
async function query(table, sql, queryParameters) {
  const res = await client().request({
    url: `${BQ}/projects/${table.split('.')[0]}/queries`,
    method: 'POST',
    data: {
      query: sql,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters,
      timeoutMs: 30_000,
      ...(config.billing.location && { location: config.billing.location }),
    },
  });
  if (!res.data.jobComplete) throw new Error('BigQuery no terminó la consulta a tiempo');
  const names = res.data.schema.fields.map((f) => f.name);
  return (res.data.rows || []).map(({ f }) => Object.fromEntries(f.map((x, i) => [names[i], x.v])));
}

const PRODUCTS = [
  ['rtdb', (s) => s === 'Firebase Realtime Database'],
  ['functions', (s) => s.includes('Functions')],
  ['hosting', (s) => s === 'Firebase Hosting'],
];

function firebaseUsage(rows, project) {
  const out = Object.fromEntries(PRODUCTS.map(([key]) => [key, { gross: 0, credits: 0 }]));
  let days = 0;
  for (const r of rows) {
    const key = PRODUCTS.find(([, match]) => match(r.service))?.[0];
    if (!key) continue;
    const p = out[key];
    const amount = Number(r.amount);
    p.gross += Number(r.gross);
    p.credits += Number(r.credits);
    days = Math.max(days, Number(r.seconds) / 86400);
    if (r.sku === 'Storage' && r.unit === 'byte-seconds') p.storageBytes = amount / Math.max(1, Number(r.seconds));
    else if (r.sku.includes('Outgoing Bandwidth') || r.sku.includes('Data Transfer Out')) p.downloadBytes = (p.downloadBytes || 0) + amount;
    else if (r.sku.includes('Invocations')) p.invocations = (p.invocations || 0) + amount;
    else if (r.sku.includes('CPU') && r.unit === 'seconds') p.cpuSeconds = (p.cpuSeconds || 0) + amount;
  }
  return { project, days: Math.max(1, days), ...out };
}

export async function collectBilling() {
  const { projectIds } = config.billing;
  const firebaseProject = config.billing.firebaseProject || projectIds[0];
  const table = await resolveTable(config.billing.table);
  const tz = config.timeZone;
  const [costRows, fbRows] = await Promise.all([
    query(table, costSql(table), [string('tz', tz), strings('projects', projectIds)]),
    query(table, firebaseSql(table), [string('tz', tz), string('firebase', firebaseProject)]),
  ]);

  const rows = costRows.map((r) => ({ ...r, gross: Number(r.gross), credits: Number(r.credits), cost: Number(r.gross) + Number(r.credits) }));
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: tz }); // AAAA-MM-DD
  const month = today.slice(0, 7);
  const isCur = (r) => r.day.startsWith(month);
  const sum = (list, key = 'cost') => list.reduce((s, r) => s + r[key], 0);
  const cur = rows.filter(isCur);

  const daily = Array.from({ length: Number(today.slice(8)) }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    return sum(cur.filter((r) => r.day === day));
  });
  const services = {};
  for (const r of cur) services[r.service] = (services[r.service] || 0) + r.cost;

  return {
    projectIds,
    currency: rows[0]?.currency || 'EUR',
    month,
    monthCost: sum(cur),
    monthGross: sum(cur, 'gross'),
    monthCredits: sum(cur, 'credits'),
    prevMonthCost: sum(rows.filter((r) => !isCur(r))),
    // Mismo orden que GCP_BILLING_PROJECT_IDS, también los proyectos sin gasto.
    projects: projectIds.map((id) => {
      const mine = rows.filter((r) => r.project === id);
      const now = mine.filter(isCur);
      return { id, monthCost: sum(now), monthGross: sum(now, 'gross'), prevMonthCost: sum(mine.filter((r) => !isCur(r))) };
    }),
    daily,
    services: Object.entries(services)
      .map(([name, cost]) => ({ name, cost }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 8),
    firebase: firebaseUsage(fbRows, firebaseProject),
  };
}
