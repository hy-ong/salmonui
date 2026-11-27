// Typeahead of roving collections:
// split from `roving.ts` so a component that needs only the arrow-key math
// (Toolbar) does not ship the typeahead matcher. `roving.ts` re-exports it.

import { useRef } from 'react';

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------

/** Typeahead buffer timeout (the Data Grid menu's `TYPEAHEAD_MS`). */
export const TYPEAHEAD_MS = 500;

export interface TypeaheadState {
  text: string;
  at: number;
  collator: Intl.Collator | undefined;
}

export function createTypeahead(): TypeaheadState {
  return { text: '', at: -Infinity, collator: undefined };
}

/** True for a key that types a character (no Ctrl / Meta / Alt chord). */
export function isTypeaheadKey(event: { readonly key: string; readonly ctrlKey?: boolean; readonly metaKey?: boolean; readonly altKey?: boolean }): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Feeds `key` (typed at `timeStamp` ms) into the buffer and returns the index
 * of the matching enabled item, or -1. Matching is a prefix match with
 * `Intl.Collator` base sensitivity (case and accents ignored). A first
 * character searches after `active`; a longer buffer from `active`
 * inclusive, so typing more letters refines the current match. Repeating one
 * character cycles through the items starting with it (APG).
 */
export function typeahead(state: TypeaheadState, key: string, timeStamp: number, count: number, active: number, labelOf: (index: number) => string, isEnabled: (index: number) => boolean): number {
  if (key === ' ' && (state.text === '' || timeStamp - state.at > TYPEAHEAD_MS)) return -1;
  state.text = timeStamp - state.at > TYPEAHEAD_MS ? key : state.text + key;
  state.at = timeStamp;
  const collator = (state.collator ??= new Intl.Collator(undefined, { sensitivity: 'base', usage: 'search' }));
  const repeated = state.text.length > 1 && [...state.text].every((c) => c === state.text[0]);
  const text = repeated ? key : state.text;
  const start = text.length === 1 ? active : active - 1;
  for (let k = 1; k <= count; k++) {
    const i = (((start + k) % count) + count) % count;
    if (!isEnabled(i)) continue;
    const label = labelOf(i);
    if (label.length >= text.length && collator.compare(label.slice(0, text.length), text) === 0) return i;
  }
  return -1;
}

/**
 * A typeahead matcher with its buffer in a ref. Call it from a keydown
 * handler with `isTypeaheadKey(event)` true.
 */
export function useTypeahead(): (key: string, timeStamp: number, count: number, active: number, labelOf: (index: number) => string, isEnabled: (index: number) => boolean) => number {
  const state = useRef<TypeaheadState | null>(null);
  return (key, timeStamp, count, active, labelOf, isEnabled) => typeahead((state.current ??= createTypeahead()), key, timeStamp, count, active, labelOf, isEnabled);
}
