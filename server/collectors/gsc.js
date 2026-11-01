import { config } from '../config.js';
import { googleClient } from './google.js';

const day = (d) => d.toISOString().slice(0, 10);
const shift = (d, n) => new Date(d.getTime() + n * 864e5);

async function query(body) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(config.gsc.siteUrl)}/searchAnalytics/query`;
  const res = await googleClient('https://www.googleapis.com/auth/webmasters.readonly').request({ url, method: 'POST', data: { dataState: 'all', ...body } });
  return res.data.rows || [];
}

const totals = ([r = { clicks: 0, impressions: 0, ctr: 0, position: 0 }]) => ({
  clicks: r.clicks,
  impressions: r.impressions,
  ctr: r.ctr,
  position: r.position,
});

// Search Console va unos 2 días por detrás: se comparan los últimos 28 días disponibles con los 28 anteriores.
export async function collectGsc() {
  const end = shift(new Date(), -2);
  const start = shift(end, -27);
  const prevEnd = shift(start, -1);
  const range = { startDate: day(start), endDate: day(end) };
  const [cur, prev, daily, queries, pages] = await Promise.all([
    query(range),
    query({ startDate: day(shift(prevEnd, -27)), endDate: day(prevEnd) }),
    query({ ...range, dimensions: ['date'] }),
    query({ ...range, dimensions: ['query'], rowLimit: 8 }),
    query({ ...range, dimensions: ['page'], rowLimit: 5 }),
  ]);
  return {
    site: config.gsc.siteUrl.replace(/^sc-domain:/, '').replace(/^https?:\/\//, '').replace(/\/$/, ''),
    range,
    current: totals(cur),
    previous: totals(prev),
    dailyClicks: daily.map((r) => r.clicks),
    topQueries: queries.map((r) => ({ query: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
    topPages: pages.map((r) => ({ page: new URL(r.keys[0]).pathname, clicks: r.clicks, impressions: r.impressions })),
  };
}
