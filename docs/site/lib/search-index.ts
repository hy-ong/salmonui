// Build-time search index. Server-only: read by
// `app/search/[file]/route.ts`, which writes the manifest and one file per
// shard as static files in export mode and is a cached route in the server
// modes.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { buildSymbolPages, entrySpecifier, markdownToText as apiMarkdownToText, type ApiReference } from './api-reference';
import { sitePaths, type DocPage } from './catalog.mjs';
import { SEARCH_INDEX_VERSION, SEARCH_TEXT_LIMIT, SHARD_ID, type SearchManifest, type SearchRecord, type SearchShard } from './search';
import { demoHref, docHref, getDemoGroups, getSections, sectionTitle, getNavigation, renderDoc } from './site';

const paths = sitePaths(process.cwd());
const API_REFERENCE = join(paths.site, 'generated', 'api.json');

/** Collapses whitespace and clips to the schema's 200 characters. */
export function clip(value: string, limit: number = SEARCH_TEXT_LIMIT): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length <= limit ? text : `${text.slice(0, limit - 1).trimEnd()}…`;
}

const decodeEntities = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');

/** Visible text of rendered markdown, without code blocks. */
const htmlToText = (html: string): string =>
  decodeEntities(
    html
      .replace(/<pre[\s\S]*?<\/pre>/g, ' ')
      // Inline tags join their text to the neighbors; block tags separate words.
      .replace(/<\/?(?:a|code|em|strong|span|kbd|del|sup|sub)\b[^>]*>/g, '')
      .replace(/<[^>]*>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();

const HEADING = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;

/**
 * One record per h2/h3 of a rendered page. Ids come from the rendered HTML,
 * so they are the ids the page itself uses (the markdown slugger).
 */
function sectionRecords(html: string, pageTitle: string, pageUrl: string): SearchRecord[] {
  const records: SearchRecord[] = [];
  const headings = [...html.matchAll(HEADING)];
  let parent = '';
  headings.forEach((match, i) => {
    const depth = match[1];
    const id = match[2]!;
    const title = htmlToText(match[3]!);
    const end = headings[i + 1]?.index ?? html.length;
    const body = html.slice(match.index + match[0].length, end);
    if (depth === '2') parent = title;
    const section = depth === '3' && parent !== '' ? `${pageTitle} > ${parent}` : pageTitle;
    records.push({ kind: 'section', title, text: clip(htmlToText(body)), url: `${pageUrl}#${id}`, section });
  });
  return records;
}

/** The page record of a docs page (title, frontmatter description): it goes in the manifest. */
function pageRecord(doc: DocPage): SearchRecord {
  return { kind: 'section', title: doc.title, text: clip(doc.description), url: docHref(doc), section: doc.section === 'data-grid' ? doc.category : `${sectionTitle(doc.section)} > ${doc.category}` };
}

/** The h2/h3 records of a docs page: they go in the page's category shard. */
function docSectionRecords(doc: DocPage): SearchRecord[] {
  const html = renderDoc(doc)
    .segments.map((segment) => (segment.kind === 'html' ? segment.html : ''))
    .join('\n');
  return sectionRecords(html, doc.title, docHref(doc));
}

// --- API reference ---------------------------------------------------------------

/**
 * One record per symbol page: a name that
 * several entries of a package export (`index` repeats its subpaths) has
 * one record, at its home entry. Without a generated `api.json`
 * (`npm run site:api`) there are no symbol records.
 */
type SymbolRecord = { record: SearchRecord; pkg: string; top: boolean };

/** Top symbols (the manifest): the React components; every other kind goes in its package's shard. */
function symbolRecords(): SymbolRecord[] {
  if (!existsSync(API_REFERENCE)) return [];
  const api = JSON.parse(readFileSync(API_REFERENCE, 'utf8')) as ApiReference;
  return buildSymbolPages(api).pages.map(({ pkg, entry, symbol, href }) => {
    const summary = apiMarkdownToText(symbol.summary.split(/\n\s*\n/)[0] ?? '');
    return {
      record: {
        kind: 'symbol',
        title: symbol.name,
        text: clip(`${symbol.kind}${summary === '' ? '' : `: ${summary}`}`),
        url: href,
        section: entrySpecifier(pkg, entry),
      },
      pkg: pkg.name,
      top: symbol.kind === 'component',
    };
  });
}

// --- Index ----------------------------------------------------------------------------

/** Packing target per shard, below the 60 KB gzip shard budget. */
export const SHARD_TARGET_GZIP = 40 * 1024;

const gzipBytes = (value: unknown): number => gzipSync(JSON.stringify(value), { level: 9 }).length;

/** A logical group of records before packing: one category's sections and demos, one package's symbols, ... */
export type SearchGroup = { id: string; title: string; records: SearchRecord[] };

/**
 * Splits a group into contiguous shards of at most `target` gzip bytes
 * (by record count, re-checked after each split), keeping catalog order.
 * A group that fits is one shard named after the group; a split one is
 * `<id>-1`, `<id>-2`, ... A single record over the target is still one shard.
 */
export function packGroup(group: SearchGroup, target: number = SHARD_TARGET_GZIP): SearchShard[] {
  const pieces: SearchRecord[][] = [];
  const split = (records: SearchRecord[]): void => {
    const size = gzipBytes({ version: SEARCH_INDEX_VERSION, id: group.id, records });
    if (size <= target || records.length <= 1) {
      pieces.push(records);
      return;
    }
    const per = Math.ceil(records.length / Math.max(2, Math.ceil(size / target)));
    for (let i = 0; i < records.length; i += per) split(records.slice(i, i + per));
  };
  split(group.records);
  if (pieces.length === 1) return [{ version: SEARCH_INDEX_VERSION, id: group.id, records: pieces[0]! }];
  return pieces.map((records, i) => ({ version: SEARCH_INDEX_VERSION, id: `${group.id}-${i + 1}`, records }));
}

const slugOf = (value: string): string =>
  value
    .toLowerCase()
    .replace(/^@salmonui\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export type SearchFiles = { manifest: SearchManifest; shards: SearchShard[] };

/**
 * The manifest and the shards. The manifest
 * holds one record per docs page and the top API symbols (the React
 * components); the shards hold everything else, grouped in catalog order:
 * each category's sections and demos (Data Grid first), then each
 * package's other symbols. Every
 * record is in exactly one file.
 */
export function buildSearchFiles(): SearchFiles {
  const gridDocs = getNavigation().flatMap((group) => group.docs);

  const categories: { id: string; title: string; docs: DocPage[] }[] = [
    { id: 'data-grid', title: sectionTitle('data-grid'), docs: gridDocs },
    ...getSections().map((s) => ({ id: s.section, title: s.title, docs: s.docs })),
  ];
  const symbols = symbolRecords();

  const manifestRecords: SearchRecord[] = [
    ...categories.flatMap((category) => category.docs.map(pageRecord)),
    ...symbols.filter((symbol) => symbol.top).map((symbol) => symbol.record),
  ];

  const groups: SearchGroup[] = categories.map(({ id, title, docs }) => ({
    id,
    title,
    records: [
      ...docs.flatMap(docSectionRecords),
      ...getDemoGroups(id).flatMap(({ category, demos }) =>
        demos.map((demo) => ({ kind: 'demo' as const, title: demo.title, text: clip(demo.description), url: demoHref(demo), section: category })),
      ),
    ],
  }));
  const byPackage = new Map<string, SearchRecord[]>();
  for (const symbol of symbols) {
    if (symbol.top) continue;
    const list = byPackage.get(symbol.pkg) ?? [];
    list.push(symbol.record);
    byPackage.set(symbol.pkg, list);
  }
  for (const [pkg, records] of byPackage) groups.push({ id: `api-${slugOf(pkg)}`, title: `API: ${pkg}`, records });

  const shards: SearchShard[] = [];
  const titles = new Map<string, string>();
  for (const group of groups) {
    if (group.records.length === 0) continue;
    const packed = packGroup(group);
    packed.forEach((shard, i) => {
      if (!SHARD_ID.test(shard.id)) throw new Error(`search: invalid shard id ${shard.id}`);
      if (titles.has(shard.id)) throw new Error(`search: duplicate shard id ${shard.id}`);
      titles.set(shard.id, packed.length === 1 ? group.title : `${group.title} (${i + 1}/${packed.length})`);
      shards.push(shard);
    });
  }
  return {
    manifest: {
      version: SEARCH_INDEX_VERSION,
      records: manifestRecords,
      shards: shards.map((shard) => ({ id: shard.id, title: titles.get(shard.id)!, records: shard.records.length })),
    },
    shards,
  };
}
