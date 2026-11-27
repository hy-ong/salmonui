#!/usr/bin/env node
// Export checks over the static site, run last by `site:verify`:
//
//   node tooling/site/check-out.mjs [outDir] [--site-url <url>] [--json]
//
// outDir defaults to docs/site/out/; the base URL defaults to `SITE_URL`,
// then https://salmonui.dev (the same rule as docs/site/lib/site-url.ts).
//
// Groups:
// - files:   fewer than 18,000 files (headroom under the 20,000-file
//            Cloudflare Pages limit), none above 25 MiB, no `/api/` file in
//            the export, no two files whose paths differ only by case (a
//            case-insensitive file system keeps one of them), and no RSC
//            payload for a document-only page (docs/site/lib/document-only.mjs).
//            The report counts files by kind and projects the headroom.
// - links:   every internal `href` / `src` resolves under Pages clean-URL
//            rules (the resolver of serve-static.mjs), every `#anchor` exists
//            on its target page, and page links use the canonical form
//            (no `.html`, no trailing slash, no redirect).
// - sitemap: every `<loc>` starts with SITE_URL and resolves to a page; the
//            404 page is not listed; every indexable page is listed.
// - seo:     `lang` on <html>, exactly one <h1>, a <title> and meta
//            description unique across pages, a canonical link equal to
//            `<SITE_URL><path>`, JSON-LD that parses with `@context` and
//            `@type`, and `noindex` on the 404 page.
// - budgets: landing first-load JavaScript, the search manifest and each
//            search shard (gzip; the manifest lists exactly the
//            `search/*.json` shards present), and every API reference page
//            (raw and gzip).
// - ai:      llms.txt / llms-full.txt exist and every llms.txt link resolves,
//            every /docs HTML page has its `.md` sibling, and the `.md` files
//            carry no HTML comments (demo markers) or relative links; the
//            Agent Skills:
//            `.well-known/agent-skills/index.json` lists every
//            `skills/<name>/SKILL.md`, each with a matching `name`, a
//            description, a SITE_URL `url` that resolves and its sha256
//            `digest` (their links are checked as `.md` files).
// - vendor:  no text file of the export (HTML, Markdown, txt, JSON, RSC
//            payloads, JavaScript, CSS, XML, SVG, search shards) names
//            another component vendor: VENDOR_PATTERN
//            (tooling/checks/planning-tokens.mjs). Each hit prints the file,
//            the line and context.
//            Shown pages (HTML, Markdown, txt) also carry no migration text:
//            MIGRATION_PATTERNS (another library's `*Component` class names,
//            "migrating from", "intentional difference", its CSS classes).
// - planning: no shown text file of the export (HTML, Markdown, txt, JSON,
//            XML, SVG; not JS or CSS bundles) carries internal planning text:
//            tracking IDs, work-package labels or design-document paths
//            (tooling/checks/planning-tokens.mjs; standards and sample values
//            such as `UTF-8` or `GS1-128` are allowed).
// Warnings (never fatal): indexable pages without an inbound internal link,
// and a file count of 15,000 (75% of the Pages limit) or above.
//
// Zero dependencies: node built-ins only; HTML is scanned with regular
// expressions, which is enough for the markup Next.js emits.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { isDocumentOnlyPath } from '../../docs/site/lib/document-only.mjs';
import { planningTokenHits, VENDOR_PATTERN } from '../checks/planning-tokens.mjs';
import { resolveRequest } from './serve-static.mjs';

export const KB = 1024;
export const MiB = 1024 * 1024;

export const LIMITS = {
  /** Cloudflare Pages: a deployment holds fewer than 20,000 files. */
  pagesMaxFiles: 20_000,
  /** Fail from this many files: 2,000 files of headroom under the Pages limit. */
  maxFiles: 18_000,
  /** Cloudflare Pages: one file is at most 25 MiB. */
  maxFileBytes: 25 * MiB,
  /** Warn (never fail) from this many files: 75% of the Pages limit. */
  warnFiles: 15_000,
  /** Sharded search: the manifest fetched on first open. */
  searchManifestGzip: 40 * KB,
  /** Each shard fetched on the first query; the total is unbounded. */
  searchShardGzip: 60 * KB,
  /** Any API reference page. */
  referencePageBytes: 400 * KB,
  referencePageGzip: 60 * KB,
  landingCeilingGzip: 250 * KB,
};

/**
 * Recorded landing first-load JavaScript (gzip bytes): second
 * measurement, 2026-11-23 on 828c50b (242.9 KB),
 * after the render feature split (the first, on 28f7982, was 289.6 KB).
 * The landing limit is this value + 10%, never above the 250 KB ceiling
 * (restored 2026-11-23 after the split; 350 KB from 2026-11-16 until then).
 */
export const LANDING_RECORDED_GZIP = 248738;

/** Landing first-load limit: recorded + 10%, never above the ceiling. */
export function landingLimit(recorded = LANDING_RECORDED_GZIP, ceiling = LIMITS.landingCeilingGzip) {
  return recorded == null ? ceiling : Math.min(ceiling, Math.floor(recorded * 1.1));
}

export const normalizeSiteUrl = (url) => String(url).trim().replace(/\/+$/, '');

const NOT_FOUND = /^(404|_not-found)\.html$/;
export const isNotFoundPage = (file) => NOT_FOUND.test(file);

/** Served URL path of an exported HTML file (`docs/x.html` -> `/docs/x`). */
export function pagePath(file) {
  if (file === 'index.html') return '/';
  if (file.endsWith('/index.html')) return `/${file.slice(0, -'/index.html'.length)}/`;
  return `/${file.replace(/\.html$/, '')}`;
}

/** API reference pages, which have a size budget: `docs/reference.html` and `docs/reference/**\/*.html`. */
export const isReferencePage = (file) => file === 'docs/reference.html' || (file.startsWith('docs/reference/') && file.endsWith('.html'));

/**
 * Kind of an exported file, for the file count report: `next-assets`
 * (`_next/`), `rsc-segments` (the `__next.*` segment prefetch files),
 * `rsc-payload` (`<page>.txt` beside `<page>.html`), `html`, `markdown`,
 * `search`, `images` or `other` (llms.txt, robots.txt, `_headers`, ...).
 */
export function fileKind(file, fileSet) {
  const name = file.slice(file.lastIndexOf('/') + 1);
  if (file.startsWith('_next/')) return 'next-assets';
  if (name.startsWith('__next.')) return 'rsc-segments';
  if (file.endsWith('.html')) return 'html';
  if (file.endsWith('.md')) return 'markdown';
  if (file.startsWith('search/') && file.endsWith('.json')) return 'search';
  if (file.endsWith('.txt') && fileSet.has(`${file.slice(0, -'.txt'.length)}.html`)) return 'rsc-payload';
  if (/\.(png|jpe?g|gif|svg|ico|webp|avif)$/.test(file)) return 'images';
  return 'other';
}

/**
 * RSC payload files per exported page, as a Map from `<page>.html` to its
 * `<page>.txt` payload and the `__next.*` files directly in `<page>/`
 * (pages without any are absent).
 */
export function payloadsByPage(files) {
  const fileSet = new Set(files);
  const byPage = new Map();
  const add = (page, file) => {
    if (!fileSet.has(page)) return;
    if (!byPage.has(page)) byPage.set(page, []);
    byPage.get(page).push(file);
  };
  for (const file of files) {
    const slash = file.lastIndexOf('/');
    const name = file.slice(slash + 1);
    if (name.startsWith('__next.')) {
      if (slash < 0) add('index.html', file);
      else add(`${file.slice(0, slash)}.html`, file);
    } else if (file.endsWith('.txt')) add(`${file.slice(0, -'.txt'.length)}.html`, file);
  }
  return byPage;
}

/**
 * File count by kind and the projection: what one more document-only reference page and one more page
 * with client navigation cost in files, and how many of each still fit
 * under the `maxFiles` error.
 */
export function fileCountStats(files, limit = LIMITS.maxFiles) {
  const fileSet = new Set(files);
  const payloads = payloadsByPage(files);
  const byKind = {};
  for (const file of files) {
    const kind = fileKind(file, fileSet);
    byKind[kind] = (byKind[kind] ?? 0) + 1;
  }
  const pages = files.filter((f) => f.endsWith('.html') && !isNotFoundPage(f));
  const documentOnly = pages.filter((f) => isDocumentOnlyPath(pagePath(f)));
  const navigable = pages.filter((f) => !isDocumentOnlyPath(pagePath(f)));
  const ownFiles = (page) => 1 + (fileSet.has(page.replace(/\.html$/, '.md')) ? 1 : 0) + (payloads.get(page)?.length ?? 0);
  const average = (list) => (list.length === 0 ? 0 : list.reduce((sum, page) => sum + ownFiles(page), 0) / list.length);
  const perDocumentOnlyPage = average(documentOnly);
  const perNavigablePage = average(navigable);
  const room = Math.max(0, limit - 1 - files.length);
  return {
    total: files.length,
    limit,
    pagesLimit: LIMITS.pagesMaxFiles,
    byKind,
    documentOnlyPages: documentOnly.length,
    navigablePages: navigable.length,
    perDocumentOnlyPage,
    perNavigablePage,
    room,
    roomDocumentOnlyPages: perDocumentOnlyPage > 0 ? Math.floor(room / perDocumentOnlyPage) : null,
    roomNavigablePages: perNavigablePage > 0 ? Math.floor(room / perNavigablePage) : null,
  };
}

/** Groups of paths that differ only by case (each group sorted), for example `[['a/Foo.html', 'a/foo.html']]`. */
export function caseCollisions(files) {
  const byLower = new Map();
  for (const file of files) {
    const key = file.toLowerCase();
    if (!byLower.has(key)) byLower.set(key, new Set());
    byLower.get(key).add(file);
  }
  return [...byLower.values()].filter((group) => group.size > 1).map((group) => [...group].sort());
}

/** Every file under `dir`, as posix paths relative to it. */
export function listFiles(dir) {
  const out = [];
  const walk = (abs) => {
    for (const entry of readdirSync(abs, { withFileTypes: true })) {
      const full = join(abs, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) out.push(relative(dir, full).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[name.toLowerCase()] ?? m;
  });
}

const ATTR = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
export function parseAttrs(text) {
  const attrs = {};
  for (const m of (text ?? '').matchAll(ATTR)) {
    const name = m[1].toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

const TAG = /<([a-zA-Z][\w:-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
const SCRIPT = /<script\b((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*>([\s\S]*?)<\/script\s*>/gi;

/** The facts the checks need from one HTML page. */
export function parseHtml(html) {
  const page = {
    lang: null,
    title: null,
    description: null,
    canonical: [],
    robots: [],
    h1: 0,
    ids: new Set(),
    refs: [],
    scripts: [],
    jsonLd: [],
  };
  let body = html.replace(/<!--[\s\S]*?-->/g, '');
  body = body.replace(SCRIPT, (_, attrText, content) => {
    const attrs = parseAttrs(attrText);
    const type = (attrs.type ?? '').toLowerCase();
    if (type === 'application/ld+json') page.jsonLd.push(content);
    if (attrs.src) {
      page.refs.push({ tag: 'script', attr: 'src', value: attrs.src });
      // `<script nomodule>` (the legacy polyfills) never runs in a module
      // browser, so it is not first-load JavaScript.
      if (attrs.nomodule != null) return '';
      if (type === '' || type === 'module' || type.includes('javascript')) page.scripts.push(attrs.src);
    }
    return '';
  });
  body = body.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '');
  const headEnd = body.search(/<\/head\s*>/i);
  const head = headEnd === -1 ? body : body.slice(0, headEnd);
  const title = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
  if (title) page.title = decodeEntities(title[1]).replace(/\s+/g, ' ').trim();

  for (const m of body.matchAll(TAG)) {
    const tag = m[1].toLowerCase();
    const attrs = parseAttrs(m[2]);
    if (attrs.id) page.ids.add(attrs.id);
    if (tag === 'a' && attrs.name) page.ids.add(attrs.name);
    if (tag === 'html' && attrs.lang?.trim()) page.lang = attrs.lang.trim();
    if (tag === 'h1') page.h1 += 1;
    if (tag === 'meta') {
      const name = (attrs.name ?? '').toLowerCase();
      if (name === 'description' && page.description == null) page.description = (attrs.content ?? '').trim();
      if (name === 'robots') page.robots.push((attrs.content ?? '').toLowerCase());
    }
    const rel = (attrs.rel ?? '').toLowerCase().split(/\s+/);
    if (tag === 'link' && rel.includes('canonical')) page.canonical.push(attrs.href ?? '');
    if (tag === 'link' && (rel.includes('modulepreload') || (rel.includes('preload') && attrs.as === 'script')) && attrs.href) {
      page.scripts.push(attrs.href);
    }
    for (const attr of ['href', 'src']) {
      if (attrs[attr] != null) page.refs.push({ tag, attr, value: attrs[attr] });
    }
  }
  return page;
}

/**
 * Classifies a reference from the page served at `fromPath`: `null` for
 * external or non-navigational values, otherwise `{ pathname, hash }` on
 * this site (absolute `SITE_URL` URLs count as internal).
 */
export function internalTarget(value, fromPath, siteUrl) {
  const v = value.trim();
  if (!v || v.startsWith('//')) return null;
  const site = new URL(`${siteUrl}/`);
  let url;
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
    if (!/^https?:/i.test(v)) return null;
    try {
      url = new URL(v);
    } catch {
      return { invalid: true };
    }
    if (url.origin !== site.origin) return null;
    const basePath = site.pathname.replace(/\/$/, '');
    if (basePath && !url.pathname.startsWith(`${basePath}/`) && url.pathname !== basePath) return null;
    return { pathname: url.pathname.slice(basePath.length) || '/', hash: url.hash.slice(1), absolute: true };
  }
  try {
    url = new URL(v, `https://site.invalid${fromPath}`);
  } catch {
    return { invalid: true };
  }
  return { pathname: url.pathname, hash: url.hash.slice(1) };
}

const gzipSize = (buffer) => gzipSync(buffer, { level: 9 }).length;
const kb = (bytes) => `${(bytes / KB).toFixed(1)} KB`;

/** The website never names another component vendor (VENDOR_PATTERN, shared with pack:check). */
export { VENDOR_PATTERN };
/** Export files scanned by the vendor check: every text format the build emits. */
export const TEXT_EXTENSIONS = new Set(['html', 'htm', 'md', 'txt', 'json', 'rsc', 'js', 'mjs', 'cjs', 'css', 'xml', 'svg', 'map', 'webmanifest', 'csv', 'tsx', 'ts', 'jsx']);
/**
 * Migration leftovers: the website does not describe moving from another
 * library or use its API names. Checked over the shown text files
 * (`MIGRATION_EXTENSIONS`). React's own `*Component` types, which the API
 * reference prints in signatures, are allowed (`REACT_COMPONENT_TYPES`).
 */
export const MIGRATION_PATTERNS = [
  /\b[A-Z][A-Za-z]*[a-z]Component\b/g,
  /\bmigrat(?:e|es|ing)\s+(?:from|to)\b|\bmigration\s+(?:guide|path|notes?)\b|\bmigrating,/gi,
  /\bintentional\s+differences?\b/gi,
  /\b(?:ej|e)-(?:grid|control|btn|icons?|input|popup|lib)\b/g,
];
export const REACT_COMPONENT_TYPES = new Set(['MemoExoticComponent', 'ForwardRefExoticComponent', 'NamedExoticComponent', 'LazyExoticComponent', 'ExoticComponent', 'FunctionComponent', 'PureComponent', 'JSXElementConstructorComponent']);
/** Shown text files scanned for migration leftovers. */
export const MIGRATION_EXTENSIONS = new Set(['html', 'htm', 'md', 'txt']);

/** Migration-text hits of one text, in the shape of `vendorHits`. */
export function migrationHits(text) {
  const hits = [];
  let total = 0;
  for (const pattern of MIGRATION_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      if (REACT_COMPONENT_TYPES.has(match[0])) continue;
      total++;
      if (hits.length >= VENDOR_HITS_PER_FILE) continue;
      const start = Math.max(0, match.index - 40);
      const end = Math.min(text.length, match.index + match[0].length + 40);
      const line = text.slice(0, match.index).split('\n').length;
      hits.push({ line, match: match[0], context: text.slice(start, end).replace(/\s+/g, ' ') });
    }
  }
  if (total > hits.length) hits.push({ line: hits.at(-1).line, match: `${total - hits.length} more`, context: 'further hits in this file' });
  return hits;
}

/** At most this many vendor hits are reported per file (the rest are counted). */
const VENDOR_HITS_PER_FILE = 5;

export function isTextFile(file) {
  const name = file.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && TEXT_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Vendor-name hits of one text: line, matched text and 40 characters of context per side (the first few, then a count). */
export function vendorHits(text) {
  const hits = [];
  let total = 0;
  for (const match of text.matchAll(VENDOR_PATTERN)) {
    total++;
    if (hits.length >= VENDOR_HITS_PER_FILE) continue;
    const start = Math.max(0, match.index - 40);
    const end = Math.min(text.length, match.index + match[0].length + 40);
    const line = text.slice(0, match.index).split('\n').length;
    hits.push({ line, match: match[0], context: text.slice(start, end).replace(/\s+/g, ' ') });
  }
  if (total > hits.length) hits.push({ line: hits.at(-1).line, match: `${total - hits.length} more`, context: 'further hits in this file' });
  return hits;
}

/**
 * Files the planning check scans: what the website shows as text (HTML,
 * Markdown, txt and RSC payloads, JSON, XML, SVG). JavaScript bundles and
 * CSS are not: third-party code in them has its own look-alike tokens.
 */
export const PLANNING_EXTENSIONS = new Set(['html', 'htm', 'md', 'txt', 'json', 'rsc', 'xml', 'svg', 'webmanifest', 'csv']);
export function isPlanningScanned(file) {
  const name = file.split('/').pop() ?? '';
  const dot = name.lastIndexOf('.');
  return dot > 0 && PLANNING_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

/** Planning-text hits of one shown text (IDs, work packages, design documents), in the shape of `vendorHits`. */
export function planningHits(text) {
  return planningTokenHits(text, { limit: VENDOR_HITS_PER_FILE, kinds: ['id', 'work package', 'document'] }).map(({ line, match, context }) => ({ line, match, context }));
}

/** Runs every check; returns `{ ok, errors, warnings, stats }` and never exits. */
export function checkOut(dirArg, options = {}) {
  const dir = resolve(dirArg);
  const siteUrl = normalizeSiteUrl(options.siteUrl ?? 'https://salmonui.dev');
  const recorded = options.landingRecordedGzip === undefined ? LANDING_RECORDED_GZIP : options.landingRecordedGzip;
  const errors = [];
  const warnings = [];
  const fail = (group, file, message) => errors.push({ group, file, message });
  const warn = (group, file, message) => warnings.push({ group, file, message });
  const stats = { dir, siteUrl, files: 0, pages: 0, firstLoadJs: {}, landing: null, search: null, referencePages: null };

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    fail('files', null, `${dir} does not exist; run \`npm run site:build\` first`);
    return { ok: false, errors, warnings, stats };
  }

  // files
  const files = listFiles(dir);
  const fileSet = new Set(files);
  stats.files = files.length;
  stats.fileCount = fileCountStats(files);
  if (files.length >= LIMITS.maxFiles) fail('files', null, `${files.length} files; the site allows fewer than ${LIMITS.maxFiles} (Cloudflare Pages: fewer than ${LIMITS.pagesMaxFiles})`);
  else if (files.length >= LIMITS.warnFiles) warn('files', null, `${files.length} files, at or above the ${LIMITS.warnFiles} warning line (error at ${LIMITS.maxFiles}, Cloudflare Pages limit ${LIMITS.pagesMaxFiles})`);
  for (const [file, payloads] of payloadsByPage(files)) {
    if (!isDocumentOnlyPath(pagePath(file))) continue;
    for (const payload of payloads) fail('files', payload, 'RSC payload of a document-only page; build-export.mjs removes it');
  }
  for (const group of caseCollisions(files)) fail('files', group.join(', '), 'differ only by case; a case-insensitive file system keeps one of them');
  for (const file of files) {
    const size = statSync(join(dir, file)).size;
    if (size > LIMITS.maxFileBytes) fail('files', file, `${(size / MiB).toFixed(1)} MiB exceeds the 25 MiB Cloudflare Pages file limit`);
    if (file === 'api' || file.startsWith('api/')) fail('files', file, 'the static export must not contain /api/ (demo endpoints run in the browser)');
  }

  // vendor
  for (const file of files) {
    if (!isTextFile(file)) continue;
    const text = readFileSync(join(dir, file), 'utf8');
    for (const hit of vendorHits(text)) fail('vendor', file, `line ${hit.line}: "${hit.match}" in …${hit.context}…`);
    if (!MIGRATION_EXTENSIONS.has(file.slice(file.lastIndexOf('.') + 1).toLowerCase())) continue;
    for (const hit of migrationHits(text)) fail('vendor', file, `line ${hit.line}: migration text "${hit.match}" in …${hit.context}…`);
  }

  // planning: internal tracking text never reaches the website
  for (const file of files) {
    if (!isPlanningScanned(file)) continue;
    for (const hit of planningHits(readFileSync(join(dir, file), 'utf8'))) fail('planning', file, `line ${hit.line}: planning text "${hit.match}" in …${hit.context}…`);
  }

  // parse pages
  const pages = new Map();
  for (const file of files.filter((f) => f.endsWith('.html'))) {
    pages.set(file, { file, path: pagePath(file), ...parseHtml(readFileSync(join(dir, file), 'utf8')) });
  }
  stats.pages = pages.size;
  if (!pages.has('index.html')) fail('files', null, 'index.html (the landing page) is missing');
  if (!pages.has('404.html')) fail('files', null, '404.html is missing');

  /** Resolves a site path to an exported file under Pages rules, following one redirect. */
  const resolvePath = (pathname) => {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      return { missing: true };
    }
    const first = resolveRequest(dir, decoded);
    if (first.file) return { file: relative(dir, first.file).split(sep).join('/') };
    if (first.redirect) {
      const second = resolveRequest(dir, first.redirect);
      if (second.file) return { file: relative(dir, second.file).split(sep).join('/'), redirect: first.redirect };
    }
    return { missing: true };
  };

  // links
  const inbound = new Map();
  for (const page of pages.values()) {
    for (const ref of page.refs) {
      if (ref.tag === 'link' && ref.attr === 'href' && page.canonical.includes(ref.value) && isNotFoundPage(page.file)) continue;
      const target = internalTarget(ref.value, page.path, siteUrl);
      if (!target) continue;
      const label = `<${ref.tag} ${ref.attr}="${ref.value}">`;
      if (target.invalid) {
        fail('links', page.file, `${label} is not a valid URL`);
        continue;
      }
      if (ref.value.trim().startsWith('#')) {
        if (target.hash && !page.ids.has(safeDecode(target.hash))) fail('links', page.file, `${label}: no element with id "${target.hash}" on this page`);
        continue;
      }
      const resolved = resolvePath(target.pathname);
      if (resolved.missing) {
        fail('links', page.file, `${label} does not resolve to a file in the export`);
        continue;
      }
      const targetPage = pages.get(resolved.file);
      if (ref.tag === 'a' && targetPage && resolved.redirect) {
        fail('links', page.file, `${label} is not in canonical form (Pages redirects it to ${resolved.redirect})`);
      }
      if (target.hash && targetPage && !targetPage.ids.has(safeDecode(target.hash))) {
        fail('links', page.file, `${label}: no element with id "${target.hash}" on ${resolved.file}`);
      }
      if (ref.tag === 'a' && targetPage && resolved.file !== page.file) {
        if (!inbound.has(resolved.file)) inbound.set(resolved.file, new Set());
        inbound.get(resolved.file).add(page.file);
      }
    }
  }

  const noindex = (page) => page.robots.some((content) => content.split(/[\s,]+/).includes('noindex'));
  const indexable = [...pages.values()].filter((p) => !isNotFoundPage(p.file) && !noindex(p));
  for (const page of indexable) {
    if (page.file !== 'index.html' && !inbound.has(page.file)) warn('inbound', page.file, 'indexable page has no inbound internal link');
  }

  // sitemap
  if (!fileSet.has('sitemap.xml')) {
    fail('sitemap', null, 'sitemap.xml is missing');
  } else {
    const xml = readFileSync(join(dir, 'sitemap.xml'), 'utf8');
    const locs = [...xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/g)].map((m) => decodeEntities(m[1]));
    if (locs.length === 0) fail('sitemap', 'sitemap.xml', 'lists no URLs');
    const listed = new Set();
    const seen = new Set();
    for (const loc of locs) {
      if (seen.has(loc)) fail('sitemap', 'sitemap.xml', `${loc} is listed twice`);
      seen.add(loc);
      if (loc !== siteUrl && loc !== `${siteUrl}/` && !loc.startsWith(`${siteUrl}/`)) {
        fail('sitemap', 'sitemap.xml', `${loc} does not start with SITE_URL ${siteUrl}`);
        continue;
      }
      const target = internalTarget(loc, '/', siteUrl);
      const resolved = target && !target.invalid ? resolvePath(target.pathname) : { missing: true };
      if (resolved.missing || !pages.has(resolved.file)) {
        fail('sitemap', 'sitemap.xml', `${loc} does not resolve to a page in the export`);
        continue;
      }
      if (resolved.redirect) fail('sitemap', 'sitemap.xml', `${loc} is not in canonical form (Pages redirects it to ${resolved.redirect})`);
      if (isNotFoundPage(resolved.file)) fail('sitemap', 'sitemap.xml', `${loc} is the 404 page, which must not be listed`);
      listed.add(resolved.file);
    }
    for (const page of indexable) {
      if (!listed.has(page.file)) fail('sitemap', page.file, 'indexable page is missing from sitemap.xml');
    }
  }

  // seo
  const titles = new Map();
  const descriptions = new Map();
  for (const page of pages.values()) {
    const notFound = isNotFoundPage(page.file);
    if (!page.lang) fail('seo', page.file, '<html> has no lang attribute');
    if (page.h1 !== 1) fail('seo', page.file, `has ${page.h1} <h1> elements; exactly one is required`);
    if (!page.title) fail('seo', page.file, 'has no <title>');
    if (!page.description) fail('seo', page.file, 'has no <meta name="description">');
    if (notFound) {
      if (!noindex(page)) fail('seo', page.file, 'the 404 page needs <meta name="robots" content="noindex">');
    } else {
      if (page.title) (titles.get(page.title) ?? titles.set(page.title, []).get(page.title)).push(page.file);
      if (page.description) (descriptions.get(page.description) ?? descriptions.set(page.description, []).get(page.description)).push(page.file);
      const expected = page.path === '/' ? `${siteUrl}/` : `${siteUrl}${page.path}`;
      if (page.canonical.length === 0) fail('seo', page.file, 'has no <link rel="canonical">');
      else if (page.canonical.length > 1) fail('seo', page.file, `has ${page.canonical.length} canonical links`);
      else if (!/^https?:\/\//.test(page.canonical[0])) fail('seo', page.file, `canonical "${page.canonical[0]}" is not absolute`);
      // `https://salmonui.dev` and `https://salmonui.dev/` are the same URL
      // (an empty path is `/`), and Next.js prints the root without the slash.
      else if (page.canonical[0] !== expected && !(page.path === '/' && page.canonical[0] === siteUrl)) fail('seo', page.file, `canonical "${page.canonical[0]}" should be "${expected}"`);
    }
    page.jsonLd.forEach((text, index) => {
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        fail('seo', page.file, `JSON-LD block ${index + 1} does not parse: ${error.message}`);
        return;
      }
      for (const problem of jsonLdProblems(data)) fail('seo', page.file, `JSON-LD block ${index + 1}: ${problem}`);
    });
  }
  for (const [title, where] of titles) if (where.length > 1) fail('seo', where.join(', '), `share the <title> "${title}"`);
  for (const [text, where] of descriptions) if (where.length > 1) fail('seo', where.join(', '), `share the meta description "${text}"`);

  // budgets
  const gzipCache = new Map();
  const fileGzip = (file) => {
    if (!gzipCache.has(file)) gzipCache.set(file, gzipSize(readFileSync(join(dir, file))));
    return gzipCache.get(file);
  };
  for (const page of pages.values()) {
    const scripts = new Set();
    for (const src of page.scripts) {
      const target = internalTarget(src, page.path, siteUrl);
      if (!target || target.invalid) continue;
      const resolved = resolvePath(target.pathname);
      if (resolved.file) scripts.add(resolved.file);
    }
    let total = 0;
    for (const file of scripts) total += fileGzip(file);
    stats.firstLoadJs[page.path] = { gzip: total, scripts: scripts.size };
  }
  if (pages.has('index.html')) {
    const limit = landingLimit(recorded);
    const { gzip } = stats.firstLoadJs['/'];
    stats.landing = { gzip, limit, recorded };
    if (gzip > limit) {
      const basis = recorded == null ? 'ceiling' : `recorded ${kb(recorded)} + 10%, ceiling ${kb(LIMITS.landingCeilingGzip)}`;
      fail('budgets', 'index.html', `landing first-load JS is ${kb(gzip)} gzip, over ${kb(limit)} (${basis})`);
    }
  }
  stats.search = checkSearch({ dir, files, fileSet, fail });

  const reference = { pages: 0, largest: null, largestGzip: null, limit: LIMITS.referencePageBytes, limitGzip: LIMITS.referencePageGzip };
  for (const file of files.filter(isReferencePage)) {
    const raw = statSync(join(dir, file)).size;
    const gzip = fileGzip(file);
    reference.pages += 1;
    if (!reference.largest || raw > reference.largest.bytes) reference.largest = { file, bytes: raw };
    if (!reference.largestGzip || gzip > reference.largestGzip.bytes) reference.largestGzip = { file, bytes: gzip };
    if (raw > LIMITS.referencePageBytes) fail('budgets', file, `reference page is ${kb(raw)}, over ${kb(LIMITS.referencePageBytes)}`);
    if (gzip > LIMITS.referencePageGzip) fail('budgets', file, `reference page is ${kb(gzip)} gzip, over ${kb(LIMITS.referencePageGzip)}`);
  }
  stats.referencePages = reference;

  // ai
  stats.ai = checkAiDocs({ dir, files, fileSet, siteUrl, resolvePath, fail });

  return { ok: errors.length === 0, errors, warnings, stats };
}

/** Markdown links `[text](href)` / `![alt](src)` outside fenced and inline code. */
export function markdownLinks(markdown) {
  const prose = stripMarkdownCode(markdown);
  return [...prose.matchAll(/\]\(\s*<?([^)\s>]*)>?(?:\s+"[^"]*")?\s*\)/g)].map((m) => m[1]);
}

/** Markdown with fenced code blocks and inline code spans removed. */
export function stripMarkdownCode(markdown) {
  const out = [];
  let open = null;
  for (const line of markdown.split(/\r?\n/)) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (open === null && marker) open = marker;
    else if (open !== null) {
      if (marker && marker[0] === open[0] && marker.length >= open.length && line.trim() === marker) open = null;
    } else out.push(line);
  }
  return out.join('\n').replace(/(`+)[\s\S]*?\1/g, '');
}

/** Exported pages of the `/docs` tree, which need a `.md` sibling (`x.html` -> `x.md`). */
export const isDocsPage = (file) => file === 'docs.html' || (file.startsWith('docs/') && file.endsWith('.html'));

/**
 * The AI-readable docs checks: reports through `fail` and
 * returns size stats `{ llms, llmsFull, markdownFiles, largestMarkdown, skills }`.
 */
const SEARCH_MANIFEST = 'search/manifest.json';
const SHARD_ID = /^(?!manifest$)[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The sharded search index: the manifest
 * is a version 2 manifest within its budget; every shard it lists exists,
 * is a version 2 shard with the same id and record count, and is within
 * the shard budget; no `search/*.json` file is unlisted. Returns stats.
 */
export function checkSearch({ dir, files, fileSet, fail }) {
  if (!fileSet.has(SEARCH_MANIFEST)) {
    fail('budgets', null, `${SEARCH_MANIFEST} is missing`);
    return null;
  }
  const parse = (file, raw) => {
    try {
      return JSON.parse(raw.toString('utf8'));
    } catch (error) {
      fail('budgets', file, `does not parse: ${error.message}`);
      return undefined;
    }
  };
  const raw = readFileSync(join(dir, SEARCH_MANIFEST));
  const stats = { manifest: { gzip: gzipSize(raw), records: 0 }, shards: 0, largest: null, total: gzipSize(raw) };
  if (stats.manifest.gzip > LIMITS.searchManifestGzip) fail('budgets', SEARCH_MANIFEST, `${kb(stats.manifest.gzip)} gzip, over ${kb(LIMITS.searchManifestGzip)}`);
  const manifest = parse(SEARCH_MANIFEST, raw);
  if (manifest === undefined) return stats;
  if (manifest?.version !== 2 || !Array.isArray(manifest.records) || !Array.isArray(manifest.shards)) {
    fail('budgets', SEARCH_MANIFEST, 'is not a version 2 manifest with records and shards arrays');
    return stats;
  }
  stats.manifest.records = manifest.records.length;
  const listed = new Set();
  for (const info of manifest.shards) {
    const id = info?.id;
    if (typeof id !== 'string' || !SHARD_ID.test(id) || listed.has(id)) {
      fail('budgets', SEARCH_MANIFEST, `lists an invalid or duplicate shard id ${JSON.stringify(id)}`);
      continue;
    }
    listed.add(id);
    const file = `search/${id}.json`;
    if (!fileSet.has(file)) {
      fail('budgets', file, 'is listed by the search manifest but missing');
      continue;
    }
    const body = readFileSync(join(dir, file));
    const gzip = gzipSize(body);
    stats.shards += 1;
    stats.total += gzip;
    if (!stats.largest || gzip > stats.largest.gzip) stats.largest = { file, gzip };
    if (gzip > LIMITS.searchShardGzip) fail('budgets', file, `${kb(gzip)} gzip, over ${kb(LIMITS.searchShardGzip)}`);
    const shard = parse(file, body);
    if (shard === undefined) continue;
    if (shard?.version !== 2 || shard.id !== id || !Array.isArray(shard.records)) fail('budgets', file, `is not a version 2 shard with id ${id} and a records array`);
    else if (info.records !== shard.records.length) fail('budgets', file, `has ${shard.records.length} records; the manifest says ${info.records}`);
  }
  for (const file of files) {
    if (!file.startsWith('search/') || file === SEARCH_MANIFEST) continue;
    const id = file.slice('search/'.length).replace(/\.json$/, '');
    if (!listed.has(id)) fail('budgets', file, 'is not listed by the search manifest');
  }
  return stats;
}

export function checkAiDocs({ dir, files, fileSet, siteUrl, resolvePath, fail }) {
  const stats = { llms: null, llmsFull: null, markdownFiles: 0, largestMarkdown: null, skills: 0 };
  const size = (file) => statSync(join(dir, file)).size;
  const resolves = (url) => {
    const target = internalTarget(url, '/', siteUrl);
    if (!target || target.invalid) return false;
    return !resolvePath(target.pathname).missing;
  };
  if (!fileSet.has('llms.txt')) fail('ai', null, 'llms.txt is missing');
  else {
    const text = readFileSync(join(dir, 'llms.txt'), 'utf8');
    stats.llms = { bytes: size('llms.txt'), links: 0 };
    if (!/^# \S/.test(text)) fail('ai', 'llms.txt', 'does not start with an H1 (`# <site name>`)');
    if (!/^> \S/m.test(text)) fail('ai', 'llms.txt', 'has no `>` summary line');
    const links = markdownLinks(text);
    stats.llms.links = links.length;
    if (links.length === 0) fail('ai', 'llms.txt', 'has no links');
    for (const href of links) {
      if (!href.startsWith(`${siteUrl}/`)) fail('ai', 'llms.txt', `link ${href} is not absolute on SITE_URL ${siteUrl}`);
      else if (!resolves(href)) fail('ai', 'llms.txt', `link ${href} does not resolve to a file in the export`);
    }
  }
  if (!fileSet.has('llms-full.txt')) fail('ai', null, 'llms-full.txt is missing');
  else {
    stats.llmsFull = { bytes: size('llms-full.txt') };
    if (stats.llmsFull.bytes === 0) fail('ai', 'llms-full.txt', 'is empty');
  }
  for (const file of files) {
    const sibling = file.replace(/\.html$/, '.md');
    if (isDocsPage(file) && !fileSet.has(sibling)) fail('ai', file, `has no Markdown version ${sibling}`);
    if (file.startsWith('markdown/')) fail('ai', file, 'out/markdown/ must be moved beside the pages (build-export.mjs)');
  }
  for (const file of files.filter((f) => f.endsWith('.md'))) {
    stats.markdownFiles += 1;
    const bytes = size(file);
    if (!stats.largestMarkdown || bytes > stats.largestMarkdown.bytes) stats.largestMarkdown = { file, bytes };
    const prose = stripMarkdownCode(readFileSync(join(dir, file), 'utf8'));
    if (/<!--\s*demo:/.test(prose)) fail('ai', file, 'contains a raw demo marker');
    else if (prose.includes('<!--')) fail('ai', file, 'contains an HTML comment');
    for (const href of markdownLinks(prose)) {
      if (!/^(https?:|mailto:)/i.test(href)) fail('ai', file, `link "${href}" is not absolute`);
      else if (href.startsWith(`${siteUrl}/`) && !resolves(href)) fail('ai', file, `link ${href} does not resolve to a file in the export`);
    }
  }
  stats.skills = checkAgentSkills({ dir, files, fileSet, siteUrl, fail });
  return stats;
}

export const SKILLS_INDEX = '.well-known/agent-skills/index.json';
export const SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Agent Skills (tooling/site/agent-skills.mjs): the discovery index
 * and every `skills/<name>/SKILL.md`. Reports through `fail`; returns the
 * number of skills listed.
 */
export function checkAgentSkills({ dir, files, fileSet, siteUrl, fail }) {
  const skillFiles = files.filter((file) => /^skills\/[^/]+\/SKILL\.md$/.test(file));
  if (!fileSet.has(SKILLS_INDEX)) {
    fail('ai', null, `${SKILLS_INDEX} is missing (Agent Skills)`);
    return 0;
  }
  let index;
  try {
    index = JSON.parse(readFileSync(join(dir, SKILLS_INDEX), 'utf8'));
  } catch (error) {
    fail('ai', SKILLS_INDEX, `does not parse: ${error.message}`);
    return 0;
  }
  if (index?.$schema !== SKILLS_SCHEMA) fail('ai', SKILLS_INDEX, `$schema is not ${SKILLS_SCHEMA}`);
  const entries = Array.isArray(index?.skills) ? index.skills : [];
  if (entries.length === 0) fail('ai', SKILLS_INDEX, 'lists no skills');
  const listed = new Set();
  for (const entry of entries) {
    const name = String(entry?.name ?? '');
    const where = `${SKILLS_INDEX} ${name || '(unnamed)'}`;
    if (!SKILL_NAME.test(name) || name.length > 64) fail('ai', where, 'name must be kebab-case, at most 64 characters');
    if (typeof entry?.description !== 'string' || entry.description.trim() === '' || entry.description.length > 1024) fail('ai', where, 'description must be 1 to 1024 characters');
    if (entry?.type !== 'skill-md') fail('ai', where, 'type must be "skill-md"');
    const file = `skills/${name}/SKILL.md`;
    listed.add(file);
    if (entry?.url !== `${siteUrl}/${file}`) fail('ai', where, `url must be ${siteUrl}/${file}`);
    if (!fileSet.has(file)) {
      fail('ai', where, `${file} is missing`);
      continue;
    }
    const bytes = readFileSync(join(dir, file));
    if (entry?.digest !== `sha256:${createHash('sha256').update(bytes).digest('hex')}`) fail('ai', where, `digest does not match ${file}`);
    const front = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(bytes.toString('utf8'))?.[1] ?? '';
    if (/^name:[ \t]*(.*)$/m.exec(front)?.[1]?.trim() !== name) fail('ai', file, `front matter has no \`name: ${name}\``);
    if (!/^description:\s*\S/m.test(front)) fail('ai', file, 'front matter has no `description`');
  }
  for (const file of skillFiles) if (!listed.has(file)) fail('ai', file, `is not listed in ${SKILLS_INDEX}`);
  return entries.length;
}

function safeDecode(text) {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
}

/** Problems of one parsed JSON-LD value (`@context` and `@type` on every node). */
export function jsonLdProblems(data) {
  const problems = [];
  const nodes = Array.isArray(data) ? data : [data];
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      problems.push('is not an object');
      continue;
    }
    if (!node['@context']) problems.push('has no @context');
    if (Array.isArray(node['@graph'])) {
      for (const item of node['@graph']) if (!item?.['@type']) problems.push('a @graph node has no @type');
    } else if (!node['@type']) {
      problems.push('has no @type');
    }
  }
  return problems;
}

const GROUPS = ['files', 'vendor', 'planning', 'links', 'sitemap', 'seo', 'budgets', 'ai', 'inbound'];

/** Human-readable report, grouped by check. */
export function formatReport(result) {
  const { stats } = result;
  const lines = [`check-out: ${stats.dir} (${stats.files} files, ${stats.pages} pages, SITE_URL ${stats.siteUrl})`];
  if (stats.fileCount) {
    const count = stats.fileCount;
    const kinds = Object.entries(count.byKind)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([kind, n]) => `${kind} ${n}`)
      .join(', ');
    lines.push(`  files: ${count.total} (error at ${count.limit}, Cloudflare Pages limit ${count.pagesLimit}): ${kinds}`);
    const each = (n) => n.toFixed(1);
    lines.push(
      `  file projection: ${count.room} files of headroom; ${count.documentOnlyPages} document-only pages at ${each(count.perDocumentOnlyPage)} files each (room for about ${count.roomDocumentOnlyPages ?? 'n/a'} more), ${count.navigablePages} navigable pages at ${each(count.perNavigablePage)} files each (room for about ${count.roomNavigablePages ?? 'n/a'} more)`,
    );
  }
  if (stats.landing) {
    const capped = stats.landing.limit === LIMITS.landingCeilingGzip;
    const basis =
      stats.landing.recorded == null
        ? 'ceiling; first measurement not recorded yet'
        : `recorded ${kb(stats.landing.recorded)} + 10%${capped ? ', capped at the ceiling' : ''}`;
    lines.push(`  landing first-load JS: ${kb(stats.landing.gzip)} gzip (limit ${kb(stats.landing.limit)}, ${basis})`);
  }
  if (stats.search) {
    const { manifest, shards, largest, total } = stats.search;
    const biggest = largest ? `, largest ${largest.file} ${kb(largest.gzip)}` : '';
    lines.push(
      `  search: manifest ${kb(manifest.gzip)} gzip (limit ${kb(LIMITS.searchManifestGzip)}), ${shards} shards${biggest} (limit ${kb(LIMITS.searchShardGzip)} each), ${kb(total)} gzip in total`,
    );
  }
  if (stats.referencePages?.largest) {
    const { pages, largest, largestGzip, limit, limitGzip } = stats.referencePages;
    lines.push(
      `  reference pages: ${pages}, largest ${largest.file} ${kb(largest.bytes)} (limit ${kb(limit)}), largest gzip ${largestGzip.file} ${kb(largestGzip.bytes)} (limit ${kb(limitGzip)})`,
    );
  }
  if (stats.ai?.llms && stats.ai.llmsFull) {
    const largest = stats.ai.largestMarkdown ? `, largest ${stats.ai.largestMarkdown.file} ${kb(stats.ai.largestMarkdown.bytes)}` : '';
    lines.push(`  AI docs: llms.txt ${kb(stats.ai.llms.bytes)}, llms-full.txt ${kb(stats.ai.llmsFull.bytes)}, ${stats.ai.markdownFiles} .md files${largest}, ${stats.ai.skills ?? 0} Agent Skills`);
  }
  const section = (label, list) => {
    for (const group of GROUPS) {
      const items = list.filter((item) => item.group === group);
      if (items.length === 0) continue;
      lines.push(`${label} ${group} (${items.length})`);
      for (const item of items) lines.push(`  ${item.file ? `${item.file}: ` : ''}${item.message}`);
    }
  };
  section('FAIL', result.errors);
  section('WARN', result.warnings);
  lines.push(result.ok ? `check-out: ok (${result.warnings.length} warnings)` : `check-out: ${result.errors.length} errors`);
  return lines.join('\n');
}

const USAGE = 'usage: node tooling/site/check-out.mjs [outDir] [--site-url <url>] [--json]';

/** Parses CLI arguments; throws on unknown flags. */
export function parseArgs(argv, env = process.env) {
  const options = { dir: fileURLToPath(new URL('../../docs/site/out/', import.meta.url)), siteUrl: env.SITE_URL?.trim() || 'https://salmonui.dev', json: false, help: false };
  let dirSet = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg === '--site-url') {
      if (!argv[i + 1]) throw new Error('--site-url needs a value');
      options.siteUrl = argv[++i];
    } else if (arg.startsWith('--site-url=')) options.siteUrl = arg.slice('--site-url='.length);
    else if (arg.startsWith('-')) throw new Error(`unknown option ${arg}`);
    else if (dirSet) throw new Error(`unexpected argument ${arg}`);
    else {
      options.dir = resolve(arg);
      dirSet = true;
    }
  }
  options.siteUrl = normalizeSiteUrl(options.siteUrl);
  return options;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`check-out: ${error.message}\n${USAGE}`);
    process.exit(2);
  }
  if (options.help) {
    console.log(USAGE);
    return;
  }
  const result = checkOut(options.dir, { siteUrl: options.siteUrl });
  console.log(options.json ? JSON.stringify(result, null, 2) : formatReport(result));
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
