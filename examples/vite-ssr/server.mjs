// Minimal Vite SSR server on node:http (no framework dependency).
// Development: Vite middleware + ssrLoadModule. Production: dist/client static
// files + dist/server/entry-server.js (`npm run build` first). Each page has its
// own HTML template (src/pages.ts); the page HTML is only served rendered.
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import http from 'node:http';
import { extname, join } from 'node:path';

const root = new URL('.', import.meta.url).pathname;
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 41750);
const types = { '.js': 'text/javascript', '.css': 'text/css', '.map': 'application/json', '.svg': 'image/svg+xml', '.html': 'text/html' };

let vite = null;
if (!production) {
  const { createServer } = await import('vite');
  // In middleware mode Vite still opens its WebSocket server on a separate
  // port (24678 by default) even with `hmr: false`, so parallel checkouts
  // collide there. SALMON_UI_PORT_BASE (playwright.config.ts) moves it
  // to base + 40; unset keeps Vite's default.
  const portBase = process.env.SALMON_UI_PORT_BASE;
  const ws = portBase ? { port: Number(portBase) + 40 } : undefined;
  vite = await createServer({ root, logLevel: 'error', server: { middlewareMode: true, hmr: false, ws }, appType: 'custom' });
}

/** The server entry (src/entry-server.tsx): render, renderStream and the page routing of src/pages.ts. */
async function serverEntry() {
  return vite ? vite.ssrLoadModule('/src/entry-server.tsx') : import(join(root, 'dist/server/entry-server.js'));
}

/** The HTML template of the page `url` routes to: one HTML entry (and client entry) per page. */
async function pageTemplate(url, entry) {
  const file = entry.templateOf(entry.pageOf(url));
  if (vite) return vite.transformIndexHtml(url, await readFile(join(root, file), 'utf8'));
  return readFile(join(root, 'dist/client', file), 'utf8');
}

/** `?stream`: renderToPipeableStream between the two halves of the template. */
async function streamPage(url, res) {
  const entry = await serverEntry();
  const template = await pageTemplate(url, entry);
  const { renderStream } = entry;
  const [head, tail] = template.split('<!--app-html-->');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.write(head);
  const { PassThrough } = await import('node:stream');
  const body = new PassThrough();
  body.on('data', (chunk) => res.write(chunk));
  body.on('end', () => res.end(tail));
  await renderStream(url, body);
}

async function renderPage(url) {
  const entry = await serverEntry();
  const template = await pageTemplate(url, entry);
  return template.replace('<!--app-html-->', entry.render(url));
}

async function handle(req, res) {
  const url = req.url ?? '/';
  const path = url.split('?')[0] ?? '/';
  if (production && path !== '/') {
    const file = join(root, 'dist/client', path);
    if (file.startsWith(join(root, 'dist/client')) && extname(file) !== '.html' && existsSync(file) && statSync(file).isFile()) {
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      createReadStream(file).pipe(res);
      return;
    }
  }
  try {
    if (new URL(url, 'http://localhost').searchParams.has('stream')) {
      await streamPage(url, res);
      return;
    }
    const html = await renderPage(url);
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch (error) {
    vite?.ssrFixStacktrace(error);
    console.error(error);
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(error?.stack ?? error));
  }
}

http
  .createServer((req, res) => {
    if (vite) vite.middlewares(req, res, () => void handle(req, res));
    else void handle(req, res);
  })
  .listen(port, () => console.log(`vite-ssr example on http://localhost:${port} (${production ? 'production' : 'development'})`));
