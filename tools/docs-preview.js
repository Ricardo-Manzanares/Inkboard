// Genera una versión HTML navegable de la documentación (.md) para revisarla en el navegador.
// README.md de la raíz -> index.html; el resto, junto a su .md con extensión .html.
// Los enlaces entre .md pasan a apuntar a los .html. Uso: npm install && npm run docs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set(["node_modules", ".git", "out", "data"]);

// --- documentos -------------------------------------------------------------------------------
function findDocs(dir, out) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findDocs(p, out);
    else if (e.name.toLowerCase().endsWith(".md")) out.push(path.relative(ROOT, p).split(path.sep).join("/"));
  }
  return out;
}

const htmlFor = (md) => (md === "README.md" ? "index.html" : md.replace(/\.md$/i, ".html"));
const rel = (from, to) => path.posix.relative(path.posix.dirname(from), to) || path.posix.basename(to);

// Orden del menú: la portada y las guías en el orden de puesta en marcha.
const ORDER = ["README.md", "docs/servidor.md", "docs/fuentes.md", "docs/agente.md", "docs/red-local.md", "docs/kindle.md", "docs/widget.md"];
const docs = findDocs(ROOT, []).sort((a, b) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
});

function titleOf(md) {
  const m = fs.readFileSync(path.join(ROOT, md), "utf8").match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/[`*_]/g, "").trim() : md;
}
const titles = Object.fromEntries(docs.map((d) => [d, titleOf(d)]));

// --- markdown -> html -------------------------------------------------------------------------
// Anclas como las de GitHub: minúsculas, sin signos, espacios a guiones (se conservan acentos).
function slug(text, used) {
  let s = text.toLowerCase().replace(/<[^>]+>/g, "").replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");
  const base = s;
  for (let i = 1; used.has(s); i++) s = base + "-" + i;
  used.add(s);
  return s;
}

function render(md) {
  const used = new Set();
  const marked = new Marked({gfm: true});
  marked.use({
    renderer: {
      heading(text, level, raw) {
        return `<h${level} id="${slug(raw, used)}">${text}</h${level}>\n`;
      },
      link(href, title, text) {
        return `<a href="${fixHref(md, href)}"${title ? ` title="${title}"` : ""}${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ""}>${text}</a>`;
      }
    }
  });
  return marked.parse(fs.readFileSync(path.join(ROOT, md), "utf8"));
}

// Enlace relativo a otro .md -> su .html (conservando el ancla).
function fixHref(from, href) {
  if (!href || /^(https?:|mailto:|#)/.test(href)) return href;
  const [p, hash] = href.split("#");
  if (!/\.md$/i.test(p)) return href;
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(from), p));
  return rel(htmlFor(from), htmlFor(target)) + (hash ? "#" + hash : "");
}

// Logotipo: un lector de tinta electrónica con dos tarjetas, en el color de acento.
const LOGO = `<svg viewBox="0 0 44 44" aria-hidden="true"><rect x="8" y="3" width="28" height="38" rx="5" fill="var(--accent)"/><rect x="12" y="8" width="20" height="26" rx="2" fill="var(--panel)"/><rect x="14" y="10" width="16" height="9" rx="2" fill="var(--accent)"/><rect x="14" y="21" width="7" height="11" rx="2" fill="var(--accent)"/><rect x="23" y="21" width="7" height="11" rx="2" fill="var(--accent)"/></svg>`;

// --- plantilla --------------------------------------------------------------------------------
const CSS = `
:root {
  --bg: #f4f7f6; --panel: #ffffff; --fg: #17201f; --muted: #5b6b69; --line: #d9e3e1;
  --accent: #0b8783; --accent-soft: #e3f3f1; --code: #eef3f2;
}
@media (prefers-color-scheme: dark) {
  :root { --bg: #0f1716; --panel: #162120; --fg: #e6eeec; --muted: #93a5a2; --line: #263533;
          --accent: #3cc7b0; --accent-soft: #173431; --code: #1b2a28; color-scheme: dark; }
}

* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg);
  font: 16px/1.6 Inter, "Segoe UI", system-ui, sans-serif; }
.layout { display: grid; grid-template-columns: 270px minmax(0, 1fr); min-height: 100vh; }
nav { background: var(--panel); border-right: 1px solid var(--line); padding: 28px 20px;
  position: sticky; top: 0; height: 100vh; overflow-y: auto; }
.brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; text-decoration: none; color: var(--fg); }
.brand svg { width: 44px; height: 44px; flex: none; }
.brand b { font-size: 19px; letter-spacing: .01em; }
nav ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
nav a.doc { display: block; padding: 8px 12px; border-radius: 8px; color: var(--fg); text-decoration: none; font-size: 15px; }
nav a.doc:hover { background: var(--accent-soft); }
nav a.doc.current { background: var(--accent); color: #fff; }
nav small { display: block; color: var(--muted); font-size: 12px; margin: 22px 12px 0; }
main { padding: 40px max(24px, 4vw) 80px; min-width: 0; }
article { max-width: 920px; margin: 0 auto; background: var(--panel); border: 1px solid var(--line);
  border-radius: 16px; padding: 36px 44px; }
h1, h2, h3 { line-height: 1.25; text-wrap: balance; }
h1 { font-size: 34px; margin-top: 0; }
h2 { font-size: 24px; margin-top: 2em; padding-bottom: .3em; border-bottom: 1px solid var(--line); }
h3 { font-size: 19px; margin-top: 1.6em; }
a { color: var(--accent); }
img { max-width: 100%; height: auto; border-radius: 8px; }
table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; margin: 1em 0; font-size: 15px; }
th, td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; vertical-align: top; }
th { background: var(--accent-soft); }
code { font-family: "Cascadia Mono", Consolas, ui-monospace, monospace; font-size: .9em;
  background: var(--code); padding: .1em .35em; border-radius: 5px; }
pre { background: var(--code); padding: 16px 18px; border-radius: 10px; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: 14px; }
blockquote { margin: 1em 0; padding: .2em 1em; border-left: 4px solid var(--accent); color: var(--muted); }
@media (max-width: 820px) {
  .layout { grid-template-columns: 1fr; }
  nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); }
  article { padding: 24px 20px; }
}`;

function page(md) {
  const out = htmlFor(md);
  const nav = docs.map((d) =>
    `<li><a class="doc${d === md ? " current" : ""}" href="${rel(out, htmlFor(d))}">${titles[d]}</a></li>`).join("\n      ");
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titles[md]}</title>
<style>${CSS}</style>
</head>
<body>
<div class="layout">
  <nav>
    <a class="brand" href="${rel(out, "index.html")}">${LOGO}<b>Kindle Dashboard</b></a>
    <ul>
      ${nav}
    </ul>
    <small>Vista previa generada a partir de ${md}</small>
  </nav>
  <main><article>
${render(md)}
  </article></main>
</div>
</body>
</html>
`;
}

export { ROOT, docs, titles, htmlFor, render, CSS };

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const md of docs) {
    const out = htmlFor(md);
    fs.writeFileSync(path.join(ROOT, out), page(md));
    console.log(md, "->", out);
  }
}
