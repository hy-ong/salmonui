// Search index over collection labels. Framework-agnostic.
//
// Labels are folded once per collection and options (lowercase unless
// `matchCase`, accents removed with `ignoreAccents`); the build can run after
// the first paint (`build()`) and runs synchronously when a search arrives
// first. A search whose text narrows the previous text scans only the
// previous matches.

import type { Collection } from './collection.js';
import { foldText, foldWithMap } from './fold.js';

/** Internal. */
export type SearchOperatorName = 'startsWith' | 'contains' | 'endsWith';

/** A named operator or a predicate over the item and the raw search text. */
export type SearchOperator<T> = SearchOperatorName | ((item: T, text: string) => boolean);

/** Internal. */
export interface SearchOptions {
  readonly matchCase?: boolean | undefined;
  readonly ignoreAccents?: boolean | undefined;
}

/** Internal. */
export interface SearchIndex<T> {
  /** Folds every label now (idempotent). */
  build(): void;
  readonly built: boolean;
  /** Ascending item indexes matching `text`, or null when `text` is empty (every item). */
  search(text: string, operator?: SearchOperator<T>): Int32Array | null;
}

function test(label: string, needle: string, operator: SearchOperatorName): boolean {
  switch (operator) {
    case 'startsWith':
      return label.startsWith(needle);
    case 'endsWith':
      return label.endsWith(needle);
    default:
      return label.includes(needle);
  }
}

/** Whether every match of `next` is also a match of `prev` for the operator. */
function narrows(prev: string, next: string, operator: SearchOperatorName): boolean {
  switch (operator) {
    case 'startsWith':
      return next.startsWith(prev);
    case 'endsWith':
      return next.endsWith(prev);
    default:
      return next.includes(prev);
  }
}

/** Internal. */
export function createSearchIndex<T>(collection: Collection<T>, options: SearchOptions = {}): SearchIndex<T> {
  const matchCase = options.matchCase === true;
  const ignoreAccents = options.ignoreAccents === true;
  const size = collection.size;
  let folded: string[] | null = null;
  let last: { needle: string; operator: SearchOperatorName; result: Int32Array } | null = null;

  const build = (): string[] => {
    if (folded) return folded;
    const out = new Array<string>(size);
    for (let i = 0; i < size; i++) out[i] = foldText(collection.label(i), ignoreAccents, matchCase);
    folded = out;
    return out;
  };

  return {
    build: () => void build(),
    get built() {
      return folded !== null;
    },
    search: (text, operator = 'startsWith') => {
      if (text === '') return null;
      if (typeof operator === 'function') {
        const hits: number[] = [];
        for (let i = 0; i < size; i++) if (operator(collection.items[i] as T, text)) hits.push(i);
        return Int32Array.from(hits);
      }
      const labels = build();
      const needle = foldText(text, ignoreAccents, matchCase);
      if (last && last.operator === operator && last.needle === needle) return last.result;
      const out = new Int32Array(last && last.operator === operator && narrows(last.needle, needle, operator) ? last.result.length : size);
      let n = 0;
      if (last && last.operator === operator && narrows(last.needle, needle, operator)) {
        const prev = last.result;
        for (let k = 0; k < prev.length; k++) {
          const i = prev[k] as number;
          if (test(labels[i] as string, needle, operator)) out[n++] = i;
        }
      } else {
        for (let i = 0; i < size; i++) if (test(labels[i] as string, needle, operator)) out[n++] = i;
      }
      const result = out.subarray(0, n);
      last = { needle, operator, result };
      return result;
    },
  };
}

/** A `[start, end)` range of the original label. */
export type MatchRange = readonly [start: number, end: number];

/**
 * Highlight ranges of `text` in `label` (original code unit
 * offsets), for rendered options only. `contains` marks the first match.
 */
export function matchRanges(label: string, text: string, operator: SearchOperatorName, options: SearchOptions = {}): readonly MatchRange[] {
  if (!text) return [];
  const matchCase = options.matchCase === true;
  const ignoreAccents = options.ignoreAccents === true;
  const needle = foldText(text, ignoreAccents, matchCase);
  if (!needle) return [];
  const { folded, origin } = foldWithMap(label, ignoreAccents, matchCase);
  let at = -1;
  if (operator === 'startsWith') at = folded.startsWith(needle) ? 0 : -1;
  else if (operator === 'endsWith') at = folded.endsWith(needle) ? folded.length - needle.length : -1;
  else at = folded.indexOf(needle);
  if (at < 0) return [];
  const end = at + needle.length;
  // The end maps to the start of the next source code unit after the last matched one.
  const startOrig = origin[at] as number;
  let endOrig = origin[end] as number;
  if (end < folded.length && endOrig === (origin[end - 1] as number)) endOrig = origin[end] as number;
  // Combining marks that follow the last matched base character belong to it.
  while (endOrig < label.length && /\p{M}/u.test(label[endOrig] as string)) endOrig++;
  return [[startOrig, Math.max(endOrig, startOrig + 1)]];
}
