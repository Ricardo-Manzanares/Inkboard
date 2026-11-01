// Genera los recursos de la piel de telemetría: Inter en TTF (Rainmeter no lee WOFF) e iconos de las insignias.
// Uso: node tools/telemetria-assets.cjs [node_modules] [carpeta @Resources]
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const root = path.join(__dirname, '..');
const modules = process.argv[2] || path.join(root, 'node_modules');
const resources = process.argv[3] || path.join(root, 'Rainmeter', 'Telemetria', '@Resources');
const sharp = require(path.join(modules, 'sharp'));
const mdi = require(path.join(modules, '@mdi/js'));

// WOFF 1.0 -> TTF: mismas tablas, descomprimidas y con el directorio de sfnt.
function woffToTtf(woff) {
  if (woff.toString('ascii', 0, 4) !== 'wOFF') throw new Error('no es WOFF');
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const e = 44 + i * 20;
    const tag = woff.toString('ascii', e, e + 4);
    const offset = woff.readUInt32BE(e + 4);
    const compLength = woff.readUInt32BE(e + 8);
    const origLength = woff.readUInt32BE(e + 12);
    const checksum = woff.readUInt32BE(e + 16);
    const raw = woff.subarray(offset, offset + compLength);
    tables.push({ tag, checksum, data: compLength < origLength ? zlib.inflateSync(raw) : Buffer.from(raw) });
  }
  tables.sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const pow = 2 ** Math.floor(Math.log2(numTables));
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(pow * 16, 6);
  header.writeUInt16BE(Math.log2(pow), 8);
  header.writeUInt16BE(numTables * 16 - pow * 16, 10);
  let offset = header.length;
  const bodies = [];
  tables.forEach((t, i) => {
    const r = 12 + i * 16;
    header.write(t.tag, r, 'ascii');
    header.writeUInt32BE(t.checksum, r + 4);
    header.writeUInt32BE(offset, r + 8);
    header.writeUInt32BE(t.data.length, r + 12);
    const padded = Buffer.alloc(Math.ceil(t.data.length / 4) * 4);
    t.data.copy(padded);
    bodies.push(padded);
    offset += padded.length;
  });
  return Buffer.concat([header, ...bodies]);
}

const fonts = path.join(resources, 'Fonts');
fs.mkdirSync(fonts, { recursive: true });
// Si ya existen se dejan: con el skin cargado, Rainmeter tiene las fuentes abiertas y no se pueden sobrescribir.
for (const weight of [400, 500, 600, 700, 800]) {
  const ttf = path.join(fonts, `Inter-${weight}.ttf`);
  if (fs.existsSync(ttf)) continue;
  const woff = fs.readFileSync(path.join(modules, `@fontsource/inter/files/inter-latin-${weight}-normal.woff`));
  fs.writeFileSync(ttf, woffToTtf(woff));
}
fs.copyFileSync(path.join(modules, '@fontsource/inter/LICENSE'), path.join(fonts, 'Inter-LICENSE.txt'));

// Insignias por tema, a 4x para que se vean nítidas al escalarlas: círculo de tinta con el icono del color de la tarjeta.
const images = path.join(resources, 'Images');
fs.mkdirSync(images, { recursive: true });
const THEMES = { dark: ['#f2f2f2', '#141414'], light: ['#000000', '#ffffff'] };
const badge = (d, [circle, glyph]) => `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 48 48">
  <circle cx="24" cy="24" r="24" fill="${circle}"/>
  <g transform="translate(10.08 10.08) scale(1.16)"><path d="${d}" fill="${glyph}"/></g>
</svg>`;
for (const [name, icon] of [['system', mdi.mdiCpu64Bit], ['disks', mdi.mdiHarddisk]]) {
  for (const [theme, colors] of Object.entries(THEMES)) {
    const file = `${name}-${theme}.png`;
    sharp(Buffer.from(badge(icon, colors))).png().toFile(path.join(images, file)).then(() => console.log(file));
  }
}
console.log('fuentes:', fs.readdirSync(fonts).join(', '));
