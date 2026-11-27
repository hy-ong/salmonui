#!/usr/bin/env node
// Local preview of the static export (`npm run site:serve`) and the web
// server of the export Playwright mode. A
// zero-dependency `node:http` server over docs/site/out/ that mimics
// Cloudflare Pages:
// - clean URLs: `/docs/x` serves `docs/x.html`, `/docs/x.html` redirects to
//   `/docs/x`, a directory serves its `index.html` at `/dir/` (`/dir`
//   redirects there when there is no `dir.html`), `/index.html` and
//   `/index` redirect to `/` (and `/dir/index(.html)` to `/dir/`);
// - a missing file serves `404.html` with status 404;
// - `_headers` rules are applied (path patterns with `*` splats and
//   `:placeholders`; absolute-URL patterns match the request host), and
//   `_headers` / `_redirects` themselves are never served.
//
// Usage: node tooling/site/serve-static.mjs [--port <n>] [--dir <path>]
// (defaults: SITE_PORT or 41760, docs/site/out).
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.pdf': 'application/pdf',
  '.webmanifest': 'application/manifest+json',
};

const HIDDEN = new Set(['/_headers', '/_redirects']);

/** Parses a Cloudflare Pages `_headers` file into `{ pattern, set, detach }` rules. */
export function parseHeaders(text) {
  const rules = [];
  let rule;
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    if (!/^\s/.test(raw)) {
      rule = { pattern: compilePattern(raw.trim()), set: [], detach: [] };
      rules.push(rule);
      continue;
    }
    if (!rule) continue;
    const line = raw.trim();
    if (line.startsWith('!')) {
      rule.detach.push(line.slice(1).trim().toLowerCase());
      continue;
    }
    const colon = line.indexOf(':');
    if (colon > 0) rule.set.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rules;
}

function compilePattern(pattern) {
  const absolute = /^https?:\/\//.test(pattern);
  const source = pattern
    .replace(/^https?:\/\//, '')
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part) => (part === '*' ? '.*' : part.startsWith(':') && part.length > 1 ? '[^/.]+' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')))
    .join('');
  return { absolute, regex: new RegExp(`^${source}$`) };
}

function headersFor(rules, host, pathname) {
  const headers = new Map();
  for (const { pattern, set, detach } of rules) {
    if (!pattern.regex.test(pattern.absolute ? `${host}${pathname}` : pathname)) continue;
    for (const [name, value] of set) {
      const key = name.toLowerCase();
      const previous = headers.get(key);
      headers.set(key, previous ? { name, value: `${previous.value}, ${value}` } : { name, value });
    }
    for (const name of detach) headers.delete(name);
  }
  return headers;
}

/**
 * Sets the response `content-type` from the file extension unless a
 * `_headers` rule already set one (any case), which wins for a served file
 * (`/*.md` is `text/markdown; charset=utf-8`);
 * the 404 page of a missing `.md` URL stays HTML.
 */
export function setContentType(headers, path, honorRules = true) {
  const ruled = Object.keys(headers).find((name) => name.toLowerCase() === 'content-type');
  if (ruled !== undefined && honorRules) {
    const value = headers[ruled];
    delete headers[ruled];
    headers['content-type'] = value;
    return headers;
  }
  if (ruled !== undefined) delete headers[ruled];
  headers['content-type'] = TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
  return headers;
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves a request path the way Pages does: `{ file }` to serve,
 * `{ redirect }` to a canonical path, or `{ missing: true }`.
 */
export function resolveRequest(root, pathname) {
  const file = (path) => {
    const full = resolve(root, `.${path}`);
    return full === root || full.startsWith(root + sep) ? full : null;
  };
  if (pathname.endsWith('/index.html')) return { redirect: pathname.slice(0, -'index.html'.length) };
  if (pathname.endsWith('.html')) {
    const clean = pathname.slice(0, -'.html'.length);
    return isFile(file(pathname) ?? '') ? { redirect: clean } : { missing: true };
  }
  if (pathname.endsWith('/')) {
    const index = file(`${pathname}index.html`);
    if (index && isFile(index)) return { file: index };
    const trimmed = pathname.slice(0, -1);
    if (trimmed && isFile(file(`${trimmed}.html`) ?? '')) return { redirect: trimmed };
    return { missing: true };
  }
  const exact = file(pathname);
  if (exact && isFile(exact)) return { file: exact };
  // Pages serves `dir/index.html` only at `dir/`: `/dir/index` redirects there.
  if (pathname === '/index' || pathname.endsWith('/index')) {
    const page = file(`${pathname}.html`);
    if (page && isFile(page)) return { redirect: pathname.slice(0, -'index'.length) };
  }
  const html = file(`${pathname}.html`);
  if (html && isFile(html)) return { file: html };
  const index = file(`${pathname}/index.html`);
  if (index && isFile(index)) return { redirect: `${pathname}/` };
  return { missing: true };
}

/** A `node:http` server over `root` with Cloudflare Pages static semantics. */
export function createStaticServer({ root }) {
  const base = resolve(root);
  const headersPath = join(base, '_headers');
  const rules = existsSync(headersPath) ? parseHeaders(readFileSync(headersPath, 'utf8')) : [];
  return createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      pathname = null;
    }
    const host = request.headers.host ?? 'localhost';
    const send = (status, path, extra = {}) => {
      const headers = { ...extra };
      for (const { name, value } of headersFor(rules, host, url.pathname).values()) headers[name] = value;
      if (!path) {
        response.writeHead(status, headers);
        response.end();
        return;
      }
      setContentType(headers, path, status === 200);
      headers['content-length'] = statSync(path).size;
      response.writeHead(status, headers);
      if (request.method === 'HEAD') response.end();
      else createReadStream(path).pipe(response);
    };
    const notFound = () => {
      const page = join(base, '404.html');
      if (isFile(page)) send(404, page);
      else send(404, null, { 'content-type': 'text/plain; charset=utf-8' });
    };
    if (pathname === null || pathname.includes('\0') || HIDDEN.has(pathname)) return notFound();
    const target = resolveRequest(base, pathname);
    if (target.missing) return notFound();
    if (request.method !== 'GET' && request.method !== 'HEAD') return send(405, null, { allow: 'GET, HEAD' });
    if (target.redirect) return send(308, null, { location: `${target.redirect}${url.search}` });
    return send(200, target.file);
  });
}

function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const index = args.indexOf(`--${name}`);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const port = Number(option('port') ?? process.env.SITE_PORT ?? 41760);
  const root = resolve(option('dir') ?? fileURLToPath(new URL('../../docs/site/out/', import.meta.url)));
  if (!isFile(join(root, 'index.html'))) {
    console.error(`serve-static: ${root} has no index.html; run \`npm run site:build\` first.`);
    process.exit(1);
  }
  createStaticServer({ root }).listen(port, () => {
    console.log(`serve-static: ${root} at http://localhost:${port}/`);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
