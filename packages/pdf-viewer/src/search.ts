// Text search for PdfViewer. Pure: the page text is the
// concatenation of the engine's text items (one text-layer span each), with
// a space where a line ends; matches are offsets into that text and map back
// to (item, offset) pairs for highlighting.

export interface PageText {
  readonly text: string;
  /** Start offset of each item in `text`. */
  readonly starts: readonly number[];
  /** Item strings (the text layer spans). */
  readonly items: readonly string[];
}

export interface TextItemLike {
  readonly str: string;
  readonly hasEOL?: boolean | undefined;
}

export function buildPageText(items: readonly TextItemLike[]): PageText {
  let text = '';
  const starts: number[] = [];
  const strs: string[] = [];
  for (const item of items) {
    starts.push(text.length);
    strs.push(item.str);
    text += item.str;
    if (item.hasEOL && !/\s$/.test(item.str)) text += ' ';
  }
  return { text, starts, items: strs };
}

export interface SearchMatch {
  /** 0-based page. */
  readonly page: number;
  readonly start: number;
  readonly end: number;
}

export interface MatchOptions {
  readonly matchCase?: boolean | undefined;
  readonly wholeWord?: boolean | undefined;
}

const WORD = /[\p{L}\p{N}_]/u;
const isWord = (ch: string | undefined) => ch !== undefined && WORD.test(ch);
/** Lowercases per UTF-16 unit so offsets stay aligned with the source text. */
const fold = (s: string) => (s.length === s.toLowerCase().length ? s.toLowerCase() : Array.from(s, (c) => (c.toLowerCase().length === c.length ? c.toLowerCase() : c)).join(''));
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Matches of `query` in one page text. Whitespace runs in the query match one space. */
export function findInText(text: string, query: string, options: MatchOptions = {}): Array<[number, number]> {
  const q = collapse(query);
  if (!q) return [];
  const hay = (options.matchCase ? text : fold(text)).replace(/\s/g, ' ');
  const needle = options.matchCase ? q : fold(q);
  const out: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) break;
    const end = at + needle.length;
    if (!options.wholeWord || (!isWord(hay[at - 1]) && !isWord(hay[end]))) out.push([at, end]);
    from = at + Math.max(1, needle.length);
  }
  return out;
}

/** Matches over every page, in document order. */
export function findMatches(pages: readonly PageText[], query: string, options: MatchOptions = {}): SearchMatch[] {
  const out: SearchMatch[] = [];
  pages.forEach((p, page) => {
    for (const [start, end] of findInText(p.text, query, options)) out.push({ page, start, end });
  });
  return out;
}

/** Item index and offset within the item of a text offset (clamped to the item bounds). */
export function locate(pageText: PageText, offset: number): { readonly item: number; readonly offset: number } {
  const { starts, items } = pageText;
  let lo = 0;
  let hi = starts.length - 1;
  if (hi < 0) return { item: 0, offset: 0 };
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return { item: lo, offset: Math.min(Math.max(0, offset - (starts[lo] as number)), (items[lo] as string).length) };
}

/** Per-item `[item, from, to]` pieces of a match (a match may span several spans). */
export function matchPieces(pageText: PageText, start: number, end: number): Array<[number, number, number]> {
  const a = locate(pageText, start);
  const b = locate(pageText, end);
  const out: Array<[number, number, number]> = [];
  for (let i = a.item; i <= b.item; i++) {
    const len = (pageText.items[i] as string).length;
    const from = i === a.item ? a.offset : 0;
    const to = i === b.item ? b.offset : len;
    if (to > from) out.push([i, from, to]);
  }
  return out;
}

/** Match counts per 1-based page. */
export function countByPage(matches: readonly SearchMatch[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const m of matches) out[m.page + 1] = (out[m.page + 1] ?? 0) + 1;
  return out;
}
