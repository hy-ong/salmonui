// Server-only access to the generated API reference.
// `tooling/site/api-reference.mjs` writes `generated/api.json`
// before `next dev` / `next build` (predev / prebuild); the reference pages
// read it at build/render time and ship no client JavaScript.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cache } from 'react';

export type ApiTag = { name: string; text: string };

export type ApiMember = {
  name: string;
  signature: string;
  optional: boolean;
  inherited: boolean;
  summary: string;
  docs: string;
  tags: ApiTag[];
};

export type ApiKind = 'function' | 'component' | 'class' | 'interface' | 'type' | 'const' | 'enum' | 'namespace';

export type ApiSymbol = {
  name: string;
  kind: ApiKind;
  signature: string;
  summary: string;
  docs: string;
  tags: ApiTag[];
  members?: ApiMember[];
};

export type ApiEntry = { subpath: string; slug: string; symbols: ApiSymbol[] };
export type ApiPackage = { name: string; slug: string; entries: ApiEntry[] };
export type ApiReference = { version: 1; generatedFrom: string; packages: ApiPackage[] };

/** Display order of the kind groups on an entry page. */
export const KIND_ORDER: readonly ApiKind[] = ['component', 'function', 'class', 'interface', 'type', 'const', 'enum', 'namespace'];

const KIND_PLURAL: Record<ApiKind, [singular: string, plural: string]> = {
  component: ['component', 'components'],
  function: ['function', 'functions'],
  class: ['class', 'classes'],
  interface: ['interface', 'interfaces'],
  type: ['type', 'types'],
  const: ['constant', 'constants'],
  enum: ['enum', 'enums'],
  namespace: ['namespace', 'namespaces'],
};

export const kindLabel = (kind: ApiKind, count = 1): string => KIND_PLURAL[kind][count === 1 ? 0 : 1];

/** Anchor of a kind group on an entry page; never collides with a symbol name (identifiers have no `-`). */
export const kindAnchor = (kind: ApiKind): string => `kind-${kind}`;

// `next dev`, `next build` and `next start` run with the site directory as cwd.
const API_JSON = join(process.cwd(), 'generated', 'api.json');

/**
 * The parsed reference and its symbol pages, kept until api.json changes on
 * disk (`site:api` rewrites it while `next dev` runs). React `cache` only
 * memoizes inside a render: a route handler (the Markdown pages, llms.txt)
 * would otherwise parse the 7 MB file once per symbol it renders.
 */
let parsed: { mtime: number; reference: ApiReference; pages?: SymbolPages } | undefined;

/** The parsed reference, read once per change of api.json. */
export const getApiReference = cache((): ApiReference => {
  if (!existsSync(API_JSON)) {
    throw new Error('docs/site/generated/api.json is missing: run `npm run build`, then `npm run site:api` (docs:dev and docs:build run it).');
  }
  const mtime = statSync(API_JSON).mtimeMs;
  if (parsed?.mtime === mtime) return parsed.reference;
  const reference = JSON.parse(readFileSync(API_JSON, 'utf8')) as ApiReference;
  if (reference.version !== 1) throw new Error(`docs/site/generated/api.json has version ${String(reference.version)}; expected 1.`);
  parsed = { mtime, reference };
  return reference;
});

/** Import specifier of an entry: `@salmonui/kanban` for `.`, otherwise `@salmonui/core/theme`. */
export const entrySpecifier = (pkg: ApiPackage, entry: ApiEntry): string =>
  entry.subpath === '.' ? pkg.name : `${pkg.name}/${entry.subpath.replace(/^\.\//, '')}`;

/** Route of a package root entry (`.`): `/docs/reference/<pkg>`. */
export const packageHref = (pkg: Pick<ApiPackage, 'slug'>): string => `/docs/reference/${pkg.slug}`;

/** Where a package is listed: its root entry page, or its section of the reference index when it has no `.` entry. */
export const packageIndexHref = (pkg: Pick<ApiPackage, 'slug' | 'entries'>): string =>
  pkg.entries.some((entry) => entry.subpath === '.') ? packageHref(pkg) : `/docs/reference#${pkg.slug}`;

/** Route of an entry: the package route for `.`, otherwise `/docs/reference/<pkg>/<entry>`. */
export const entryHref = (pkg: Pick<ApiPackage, 'slug'>, entry: Pick<ApiEntry, 'subpath' | 'slug'>): string =>
  entry.subpath === '.' ? packageHref(pkg) : `${packageHref(pkg)}/${entry.slug}`;

// --- Symbol pages ------------------------------------

/** One symbol page: a symbol at its home entry, with the other entries that re-export it. */
export type SymbolPage = {
  pkg: ApiPackage;
  /** The home entry: the first subpath entry exporting it, else the root entry. */
  entry: ApiEntry;
  symbol: ApiSymbol;
  /** URL segment: the name, or `<name>-<kind>[-<n>]` when it would collide (see `symbolSlugs`). */
  slug: string;
  href: string;
  /** Other entries of the package that export the same symbol (same data), in `exports` order. */
  alsoFrom: ApiEntry[];
};

export type SymbolPages = {
  pages: SymbolPage[];
  /** The page of an entry's symbol: `pageOf(pkg, entry, name)`. */
  pageOf: (pkg: Pick<ApiPackage, 'slug'>, entry: Pick<ApiEntry, 'slug'>, name: string) => SymbolPage | undefined;
  /** The page served at a site path. */
  byHref: Map<string, SymbolPage>;
};

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Slugs of the symbol pages sharing one export directory. A name is its own
 * slug unless its lower-cased form is shared by another page in the
 * directory or is `reserved` (entry slugs sharing the directory, `index`);
 * then it is `<name>-<kind>`, with `-2`, `-3` appended in code-unit order
 * while that still collides. Export files of one directory must differ by
 * more than case: a case-insensitive file system keeps only one of them.
 */
export function symbolSlugs(symbols: readonly Pick<ApiSymbol, 'name' | 'kind'>[], reserved: Iterable<string> = []): string[] {
  const lower = (value: string) => value.toLowerCase();
  const counts = new Map<string, number>();
  for (const { name } of symbols) counts.set(lower(name), (counts.get(lower(name)) ?? 0) + 1);
  const used = new Set([...reserved, 'index'].map(lower));
  const slugs = new Array<string>(symbols.length);
  const order = symbols.map((_, index) => index).sort((a, b) => byCodeUnit(symbols[a]!.name, symbols[b]!.name));
  for (const index of order) {
    const { name, kind } = symbols[index]!;
    const base = counts.get(lower(name))! > 1 || used.has(lower(name)) ? `${name}-${kind}` : name;
    let slug = base;
    for (let n = 2; used.has(lower(slug)); n++) slug = `${base}-${n}`;
    used.add(lower(slug));
    slugs[index] = slug;
  }
  return slugs;
}

/**
 * Every symbol page of the reference: a name
 * exported with identical data by several entries of one package has one
 * page at its home entry (subpath entries in `exports` order first, then
 * the root entry, which re-exports them); a name whose data differs gets a
 * page per variant.
 */
export function buildSymbolPages(reference: Pick<ApiReference, 'packages'>): SymbolPages {
  const pages: SymbolPage[] = [];
  const byEntry = new Map<string, SymbolPage>();
  const key = (pkg: string, entry: string, name: string) => `${pkg}\u0000${entry}\u0000${name}`;
  for (const pkg of reference.packages) {
    const entries = [...pkg.entries.filter((entry) => entry.subpath !== '.'), ...pkg.entries.filter((entry) => entry.subpath === '.')];
    const byName = new Map<string, { page: Omit<SymbolPage, 'slug' | 'href'>; data: string }[]>();
    const own: Omit<SymbolPage, 'slug' | 'href'>[] = [];
    for (const entry of entries) {
      for (const symbol of entry.symbols) {
        const data = JSON.stringify(symbol);
        const variants = byName.get(symbol.name) ?? [];
        byName.set(symbol.name, variants);
        let found = variants.find((variant) => variant.data === data)?.page;
        if (found) found.alsoFrom.push(entry);
        else {
          found = { pkg, entry, symbol, alsoFrom: [] };
          variants.push({ page: found, data });
          own.push(found);
        }
        byEntry.set(key(pkg.slug, entry.slug, symbol.name), found as SymbolPage);
      }
    }
    const subpathSlugs = pkg.entries.filter((entry) => entry.subpath !== '.').map((entry) => entry.slug);
    for (const entry of entries) {
      const home = own.filter((page) => page.entry === entry);
      const slugs = symbolSlugs(
        home.map((page) => page.symbol),
        entry.subpath === '.' ? subpathSlugs : [],
      );
      home.forEach((page, index) => {
        const full = page as SymbolPage;
        full.slug = slugs[index]!;
        full.href = `${entryHref(pkg, entry)}/${full.slug}`;
      });
    }
    for (const entry of pkg.entries) for (const page of own) if (page.entry === entry) pages.push(page as SymbolPage);
  }
  for (const page of pages) page.alsoFrom.sort((a, b) => page.pkg.entries.indexOf(a) - page.pkg.entries.indexOf(b));
  const byHref = new Map(pages.map((page) => [page.href, page]));
  return { pages, byHref, pageOf: (pkg, entry, name) => byEntry.get(key(pkg.slug, entry.slug, name)) };
}

/** An entry's names split by where their symbol page lives (`entryListing`). */
export type EntryListing = {
  /** Names whose symbol page is under this entry, in entry order: one index row each. */
  own: ApiSymbol[];
  /** Names re-exported from another entry, grouped by that home entry in `exports` order. */
  reexports: { entry: ApiEntry; symbols: ApiSymbol[] }[];
};

/**
 * What an entry index lists: a row per name
 * whose page is under the entry, and one row per other entry it re-exports
 * from (`@salmonui/data-grid/engine` re-exports its subpaths), so an
 * index grows with the entry's own API, never with the package.
 */
export function entryListing(pkg: ApiPackage, entry: ApiEntry, pages: SymbolPages = getSymbolPages()): EntryListing {
  // Compared by slug: outside a React render every `getApiReference()` call
  // parses a fresh copy, so `pages` may hold other objects than `pkg`.
  const own: ApiSymbol[] = [];
  const byHome = new Map<string, ApiSymbol[]>();
  for (const symbol of entry.symbols) {
    const home = pages.pageOf(pkg, entry, symbol.name)!.entry.slug;
    if (home === entry.slug) own.push(symbol);
    else byHome.set(home, [...(byHome.get(home) ?? []), symbol]);
  }
  const reexports = pkg.entries.filter((candidate) => byHome.has(candidate.slug)).map((home) => ({ entry: home, symbols: byHome.get(home.slug)! }));
  return { own, reexports };
}

/** Anchor of the re-exports group on an entry page (no identifier contains `-`). */
export const REEXPORTS_ANCHOR = 'kind-reexports';

/** The symbol pages of the generated reference, built once per change of api.json. */
export const getSymbolPages = cache((): SymbolPages => {
  const reference = getApiReference();
  return (parsed!.pages ??= buildSymbolPages(reference));
});

/** Route of an entry's symbol (its home page, which may be under another entry); throws when the entry does not export it. */
export function symbolHref(pkg: Pick<ApiPackage, 'slug'>, entry: Pick<ApiEntry, 'slug'>, name: string, pages: SymbolPages = getSymbolPages()): string {
  const page = pages.pageOf(pkg, entry, name);
  if (!page) throw new Error(`symbolHref: ${pkg.slug}/${entry.slug} does not export ${name}`);
  return page.href;
}

/** `import { Name } from '<specifier>';`, `import type` for interfaces and types. */
export const importLine = (page: Pick<SymbolPage, 'pkg' | 'entry' | 'symbol'>): string =>
  `import ${page.symbol.kind === 'interface' || page.symbol.kind === 'type' ? 'type ' : ''}{ ${page.symbol.name} } from '${entrySpecifier(page.pkg, page.entry)}';`;

/** Plain text of a JSDoc markdown paragraph: links to their text, emphasis and backticks dropped. */
export const markdownToText = (markdown: string): string =>
  markdown
    .replace(/\{@link(?:code|plain)?\s+([^\s}|]+)(?:[\s|]+([^}]*))?\}/g, (_, target: string, label?: string) => (label && label.trim() !== '' ? label.trim() : target))
    .replace(/\\\|/g, '|')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`/g, '')
    .replace(/(^|\s)[*_]([^*_]+)[*_](?=\s|$|[.,;:])/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();

/** Collapses whitespace and clips to `limit` characters with an ellipsis. */
export function clipText(value: string, limit: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

/** The first JSDoc paragraph of a symbol as plain text, clipped (entry index rows, descriptions). */
export const summaryText = (symbol: Pick<ApiSymbol, 'summary'>, limit = 160): string =>
  clipText(markdownToText(symbol.summary.split(/\n\s*\n/)[0] ?? ''), limit);

export function getApiEntry(pkgSlug: string, entrySlug: string): { pkg: ApiPackage; entry: ApiEntry } | undefined {
  const pkg = getApiReference().packages.find((candidate) => candidate.slug === pkgSlug);
  const entry = pkg?.entries.find((candidate) => candidate.slug === entrySlug);
  return pkg && entry ? { pkg, entry } : undefined;
}

/** The `.` entry of a package. */
export function getRootEntry(pkgSlug: string): { pkg: ApiPackage; entry: ApiEntry } | undefined {
  const pkg = getApiReference().packages.find((candidate) => candidate.slug === pkgSlug);
  const entry = pkg?.entries.find((candidate) => candidate.subpath === '.');
  return pkg && entry ? { pkg, entry } : undefined;
}

/** Symbol counts per kind in display order, for example `[['component', 3], ['type', 2]]`. */
export function kindCounts(symbols: readonly ApiSymbol[]): [ApiKind, number][] {
  const counts = new Map<ApiKind, number>();
  for (const symbol of symbols) counts.set(symbol.kind, (counts.get(symbol.kind) ?? 0) + 1);
  return KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => [kind, counts.get(kind)!]);
}

/** `3 components, 2 functions and 1 type` */
export function describeKinds(symbols: readonly ApiSymbol[]): string {
  const parts = kindCounts(symbols).map(([kind, count]) => `${count} ${kindLabel(kind, count)}`);
  return parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Symbols of an entry grouped by kind in display order; names stay sorted within a group. */
export function groupByKind(symbols: readonly ApiSymbol[]): { kind: ApiKind; symbols: ApiSymbol[] }[] {
  return kindCounts(symbols).map(([kind]) => ({ kind, symbols: symbols.filter((symbol) => symbol.kind === kind) }));
}

const PROPS_PARAMETER = /^(?:function \w+(?:<[^(]*?>)?\(|const \w+: (?:<[^(]*?>)?\()\s*(?:\{[^}]*\}|\w+)\s*:\s*([A-Z]\w*)/;

/**
 * The props type of a component when it is declared in the same entry with
 * members, read from the first parameter of its printed signature
 * (`function DataGrid<Row>(props: DataGridProps<Row>)` -> `DataGridProps`).
 */
export function componentProps(symbol: ApiSymbol, entry: ApiEntry): ApiSymbol | undefined {
  if (symbol.kind !== 'component') return undefined;
  const name = PROPS_PARAMETER.exec(symbol.signature)?.[1];
  if (name === undefined || name === symbol.name) return undefined;
  const props = entry.symbols.find((candidate) => candidate.name === name);
  return props?.members && props.members.length > 0 ? props : undefined;
}
