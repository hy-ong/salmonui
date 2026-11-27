// Search highlight (`search.highlight`): wraps the matches of the
// applied search in `<mark>` inside the displayed text of rendered cells.
// The DataGrid builds one highlighter per search descriptor (only while
// `search.highlight` is on) and passes it through the render context; a cell
// asks it only for its own text, so the cost is O(rendered cells) and zero
// when the option is off. Matching follows the core search: operator, case,
// and accent options, the searched columns.

import { compilePattern, searchColumns, type ColumnId, type ColumnSnapshot, type SearchDescriptor } from '@salmonui/data-grid/engine';
import type { ReactNode } from 'react';

export interface SearchHighlighter {
  /** Whether the column is searched (its cells are highlighted). */
  has(columnId: ColumnId): boolean;
  /** The text with each match wrapped in `<mark>`, or the text itself when nothing matches. */
  render(text: string): ReactNode;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

function foldChar(ch: string, ignoreCase: boolean, ignoreAccent: boolean): string {
  let out = ch;
  if (ignoreAccent) out = out.normalize('NFD').replace(COMBINING_MARKS, '');
  return ignoreCase ? out.toLowerCase() : out;
}

/**
 * Matched ranges `[start, end)` of `text` (original indexes). The text is
 * folded per character so every folded unit maps back to the character it
 * came from (accent folding and lowercasing may change lengths).
 */
export function searchMatches(text: string, d: Pick<SearchDescriptor, 'text' | 'operator' | 'ignoreCase' | 'ignoreAccent'>): [number, number][] {
  if (d.operator === 'notEqual' || d.text === '' || text === '') return [];
  let needle = d.text;
  if (d.ignoreAccent) needle = needle.normalize('NFD').replace(COMBINING_MARKS, '');
  if (d.ignoreCase) needle = needle.toLowerCase();
  if (needle === '') return [];
  let folded = '';
  const startOf: number[] = [];
  const endOf: number[] = [];
  let last = 0;
  for (let i = 0; i < text.length; ) {
    const cp = text.codePointAt(i) as number;
    const len = cp > 0xffff ? 2 : 1;
    const f = foldChar(text.slice(i, i + len), d.ignoreCase, d.ignoreAccent);
    if (f === '') {
      // A folded-away combining mark belongs to the previous character's units.
      for (let k = last; k < endOf.length; k++) endOf[k] = i + len;
    } else {
      last = endOf.length;
      folded += f;
      for (let k = 0; k < f.length; k++) {
        startOf.push(i);
        endOf.push(i + len);
      }
    }
    i += len;
  }
  const range = (a: number, b: number): [number, number] => [startOf[a] as number, endOf[b - 1] as number];
  switch (d.operator) {
    case 'startsWith':
      return folded.startsWith(needle) ? [range(0, needle.length)] : [];
    case 'endsWith':
      return folded.endsWith(needle) ? [range(folded.length - needle.length, folded.length)] : [];
    case 'equal':
      return folded === needle ? [[0, text.length]] : [];
    case 'wildcard':
    case 'like':
      // Patterns match the whole value: the whole text is the match.
      return compilePattern(needle, d.operator).test(folded) ? [[0, text.length]] : [];
    default: {
      const out: [number, number][] = [];
      for (let at = folded.indexOf(needle); at >= 0; at = folded.indexOf(needle, at + needle.length)) out.push(range(at, at + needle.length));
      return out;
    }
  }
}

/** Highlighter of one search descriptor over the current columns. */
export function createSearchHighlighter<Row>(d: SearchDescriptor, columns: ColumnSnapshot<Row>): SearchHighlighter {
  const searched = new Set<ColumnId>(searchColumns(d.columnIds, columns).map((c) => c.columnId));
  return {
    has: (columnId) => searched.has(columnId),
    render(text) {
      const ranges = searchMatches(text, d);
      if (ranges.length === 0) return text;
      const parts: ReactNode[] = [];
      let at = 0;
      for (const [a, b] of ranges) {
        if (a > at) parts.push(text.slice(at, a));
        parts.push(
          <mark key={a} className="salmon-data-grid-search-mark">
            {text.slice(a, b)}
          </mark>,
        );
        at = b;
      }
      if (at < text.length) parts.push(text.slice(at));
      return parts;
    },
  };
}
