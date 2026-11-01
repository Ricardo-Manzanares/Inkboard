import { config } from '../config.js';

const MEASUREMENTS = ['CPU_USAGE', 'MEMORY_USAGE_GB', 'NETWORK_TX_GB', 'DISK_USAGE_GB'];
const LABELS = { CPU_USAGE: 'CPU', MEMORY_USAGE_GB: 'RAM', NETWORK_TX_GB: 'Red', DISK_USAGE_GB: 'Disco' };

async function gql(query, variables) {
  const res = await fetch('https://backboard.railway.com/graphql/v2', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.railway.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.errors) throw new Error(`Railway: ${json.errors?.[0]?.message || res.status}`);
  return json.data;
}

// Sin startDate, Railway devuelve el periodo de facturación en curso.
const USAGE = `query($workspaceId: String, $m: [MetricMeasurement!]!) {
  usage(workspaceId: $workspaceId, measurements: $m) { measurement value }
  estimatedUsage(workspaceId: $workspaceId, measurements: $m) { measurement estimatedValue }
}`;

const PROJECT = `query($id: String!) {
  project(id: $id) {
    name
    services { edges { node { name serviceInstances { edges { node { latestDeployment { status } } } } } } }
  }
}`;

function cost(rows, key) {
  const sum = {};
  for (const row of rows) sum[row.measurement] = (sum[row.measurement] || 0) + (row[key] || 0);
  return MEASUREMENTS.map((m) => ({ label: LABELS[m], usd: (sum[m] || 0) * config.railway.prices[m] }));
}

const total = (items) => items.reduce((a, b) => a + b.usd, 0);

export async function collectRailway() {
  const { usage, estimatedUsage } = await gql(USAGE, {
    workspaceId: config.railway.workspaceId || null,
    m: MEASUREMENTS,
  });
  const breakdown = cost(usage, 'value');

  // Sin RAILWAY_PROJECT_IDS se muestran todos los proyectos que ve el token.
  let projectIds = config.railway.projectIds;
  if (!projectIds.length) {
    const { projects } = await gql('{ projects { edges { node { id } } } }');
    projectIds = projects.edges.map((e) => e.node.id);
  }

  const services = [];
  for (const id of projectIds) {
    const { project } = await gql(PROJECT, { id });
    for (const { node } of project.services.edges) {
      const status = node.serviceInstances.edges[0]?.node.latestDeployment?.status || 'UNKNOWN';
      services.push({ project: project.name, name: node.name, status });
    }
  }

  return {
    currentUsd: total(breakdown),
    estimatedUsd: total(cost(estimatedUsage, 'estimatedValue')),
    breakdown,
    services,
  };
}
