import { config } from '../config.js';

const WEEKS = 30;

const MONTHS = 3;

// Calendario de la página de perfil del dueño del token; incluye los repositorios privados.
const QUERY = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
  }
}`;

const headers = () => ({
  Authorization: `Bearer ${config.github.token}`,
  Accept: 'application/vnd.github+json',
  'User-Agent': 'inkboard',
});

async function rest(pathname) {
  const res = await fetch(`https://api.github.com${pathname}`, { headers: headers() });
  if (!res.ok) throw new Error(`GitHub ${res.status} en ${pathname.split('?')[0]}`);
  return res.json();
}

// Commits por mes ("2026-10") y repositorio. GraphQL los da por repositorio, pero con un token
// fine-grained omite los privados; la API REST sí los lee con el permiso Contents.
async function commitsByMonth(login) {
  const now = new Date();
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (MONTHS - 1), 1)).toISOString();
  const repos = (await rest('/user/repos?affiliation=owner&sort=pushed&per_page=100')).filter((r) => r.pushed_at >= since);
  const months = {};
  await Promise.all(
    repos.map(async (r) => {
      for (let page = 1; page <= 5; page++) {
        const list = await rest(`/repos/${r.full_name}/commits?author=${login}&since=${since}&per_page=100&page=${page}`).catch(() => []);
        for (const c of list) {
          const month = c.commit.author.date.slice(0, 7);
          months[month] ??= {};
          months[month][r.name] = (months[month][r.name] || 0) + 1;
        }
        if (list.length < 100) break;
      }
    }),
  );
  return Object.keys(months)
    .sort()
    .reverse()
    .map((month) => ({
      month,
      repos: Object.entries(months[month])
        .map(([name, commits]) => ({ name, commits }))
        .sort((a, b) => b.commits - a.commits),
    }));
}

const LEVELS = { NONE: 0, FIRST_QUARTILE: 1, SECOND_QUARTILE: 2, THIRD_QUARTILE: 3, FOURTH_QUARTILE: 4 };

export async function collectGithub() {
  const to = new Date();
  const from = new Date(to.getTime() - WEEKS * 7 * 864e5);
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { from: from.toISOString(), to: to.toISOString() } }),
  });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`GitHub: ${body.errors[0].message}`);

  const { login, contributionsCollection: cc } = body.data.viewer;
  const days = cc.contributionCalendar.weeks
    .flatMap((w) => w.contributionDays)
    .map((d) => ({ date: d.date, count: d.contributionCount, level: LEVELS[d.contributionLevel] ?? 0 }));

  return { login, weeks: WEEKS, total: cc.contributionCalendar.totalContributions, days, byMonth: await commitsByMonth(login) };
}
