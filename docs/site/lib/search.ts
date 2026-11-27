// Search index schema and the client-side matcher.
// No node or DOM imports: the index builder (server) and the search dialog
// (client) both use this module. No search library: the manifest and the
// loaded shards are small enough for a linear scan on every keystroke.

export type SearchKind = 'section' | 'demo' | 'symbol';

export type SearchRecord = {
  kind: SearchKind;
  /** Shown first and matched with the highest weight. */
  title: string;
  /** Secondary match text, at most 200 characters. */
  text: string;
  /** Site path with an optional `#anchor`. */
  url: string;
  /** Breadcrumb, for example "Sorting > Multi-sort". */
  section?: string;
};

/** One shard listed by the manifest; its file is `/search/<id>.json`. */
export type SearchShardInfo = {
  id: string;
  /** Human label, for example "Navigation" or "API: @salmonui/data-grid (2/3)". */
  title: string;
  /** Record count, so a client can show progress. */
  records: number;
};

/** `/search/manifest.json`: fetched on the first open of the dialog. */
export type SearchManifest = { version: 2; records: SearchRecord[]; shards: SearchShardInfo[] };

/** `/search/<id>.json`: fetched once a query needs more than the manifest. */
export type SearchShard = { version: 2; id: string; records: SearchRecord[] };

export const SEARCH_INDEX_VERSION = 2;
/** Shard files live beside the manifest: `/search/<id>.json`. */
export const SEARCH_BASE = '/search';
export const SEARCH_MANIFEST_URL = `${SEARCH_BASE}/manifest.json`;
export const searchShardUrl = (id: string): string => `${SEARCH_BASE}/${id}.json`;
/** Shard ids: lower-case words joined by `-`; `manifest` is reserved. */
export const SHARD_ID = /^(?!manifest$)[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SEARCH_TEXT_LIMIT = 200;
export const SEARCH_RESULT_LIMIT = 20;

/** Tie-break order between kinds. */
const KIND_RANK: Record<SearchKind, number> = { section: 0, symbol: 1, demo: 2 };

/** Lower-case, accents removed. */
const fold = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Folded text without punctuation or spaces, so `allow-paging`, `allow paging` and `allowPaging` compare equal. */
export const compact = (value: string): string => fold(value).replace(/[^a-z0-9]+/g, '');

/** Folded words, splitting at punctuation and camelCase boundaries (`allowPaging` -> `allow`, `paging`). */
export function words(value: string): string[] {
  return fold(value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'))
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

export type PreparedRecord = {
  record: SearchRecord;
  order: number;
  kindRank: number;
  title: string;
  titleWords: string[];
  text: string;
  textWords: string[];
};

/**
 * Catalog-order base of a source: the manifest is source 0, the shard at
 * position `i` of `manifest.shards` is source `i + 1`. Records keep a
 * stable global order however the shards arrive.
 */
export const sourceOrder = (source: number, position: number): number => source * 1_000_000 + position;

/** Precomputes the folded forms once per fetched file (manifest or shard), not per keystroke. */
export function prepareRecords(records: readonly SearchRecord[], source: number): PreparedRecord[] {
  return records.map((record, position) => {
    const order = sourceOrder(source, position);
    const secondary = `${record.text} ${record.section ?? ''}`;
    return {
      record,
      order,
      kindRank: KIND_RANK[record.kind] ?? 9,
      title: compact(record.title),
      titleWords: words(record.title),
      text: compact(secondary),
      textWords: words(secondary),
    };
  });
}

const everyTokenPrefixes = (tokens: string[], candidates: string[]): boolean =>
  tokens.every((token) => candidates.some((word) => word.startsWith(token)));

/**
 * Match score, highest first: exact title, title prefix, every query token a
 * title word prefix, title substring, then secondary text (substring, or
 * every token a word prefix of the text, breadcrumb or title). 0 = no match.
 */
export function scoreRecord(prepared: PreparedRecord, query: string, tokens: string[]): number {
  if (query === '') return 0;
  if (prepared.title === query) return 5;
  if (prepared.title.startsWith(query)) return 4;
  if (tokens.length > 0 && everyTokenPrefixes(tokens, prepared.titleWords)) return 3;
  if (prepared.title.includes(query)) return 2;
  if (prepared.text.includes(query)) return 1;
  if (tokens.length > 0 && everyTokenPrefixes(tokens, [...prepared.titleWords, ...prepared.textWords])) return 1;
  return 0;
}

/**
 * At most `limit` records ranked by score, then kind, then catalog order,
 * over every file loaded so far (the manifest plus any shards).
 */
export function searchIndex(prepared: readonly PreparedRecord[], input: string, limit: number = SEARCH_RESULT_LIMIT): SearchRecord[] {
  const query = compact(input);
  if (query === '') return [];
  const tokens = words(input);
  const hits: { prepared: PreparedRecord; score: number }[] = [];
  for (const entry of prepared) {
    const score = scoreRecord(entry, query, tokens);
    if (score > 0) hits.push({ prepared: entry, score });
  }
  hits.sort((a, b) => b.score - a.score || a.prepared.kindRank - b.prepared.kindRank || a.prepared.order - b.prepared.order);
  return hits.slice(0, limit).map((hit) => hit.prepared.record);
}
