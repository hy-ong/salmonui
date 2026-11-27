// Roving tabindex and typeahead.
// Index math and key mapping are pure (Node-testable); `useTypeahead` keeps
// the buffer in a ref (a keyboard transient, never React state). Extracted
// from `DataGridMenu` (`move`, `TYPEAHEAD_MS`) in `data-grid/popover.tsx` and
// the toolbar roving in `data-grid/Toolbar.tsx`; RTL mirrors horizontal
// arrows as in `data-grid/src/engine/focus.ts`.

export type Orientation = 'vertical' | 'horizontal' | 'both';

/** What a key does to a roving collection. */
export type RovingMove = 'next' | 'prev' | 'first' | 'last';

export interface RovingKeyOptions {
  /** Which arrows move: vertical (menus, listboxes), horizontal (toolbars, button groups) or both (radio groups). Default `'vertical'`. */
  readonly orientation?: Orientation | undefined;
  /** Mirrors ArrowLeft / ArrowRight. */
  readonly rtl?: boolean | undefined;
  /** Home / End jump to the ends. Default true. */
  readonly homeEnd?: boolean | undefined;
}

/** Maps a key to a roving move, or null when the key is not a roving key. */
export function rovingMove(key: string, options: RovingKeyOptions = {}): RovingMove | null {
  const orientation = options.orientation ?? 'vertical';
  if (orientation !== 'horizontal') {
    if (key === 'ArrowDown') return 'next';
    if (key === 'ArrowUp') return 'prev';
  }
  if (orientation !== 'vertical') {
    if (key === 'ArrowRight') return options.rtl ? 'prev' : 'next';
    if (key === 'ArrowLeft') return options.rtl ? 'next' : 'prev';
  }
  if (options.homeEnd !== false) {
    if (key === 'Home') return 'first';
    if (key === 'End') return 'last';
  }
  return null;
}

/**
 * The next enabled index from `from` in `step` direction, wrapping when
 * `loop` (default true). Returns `from` when nothing else is enabled (or
 * the end is reached without `loop`). `from` may be -1 or `count` to start
 * outside the collection.
 */
export function stepIndex(count: number, from: number, step: 1 | -1, isEnabled: (index: number) => boolean, loop = true): number {
  for (let k = 1; k <= count; k++) {
    let i = from + step * k;
    if (loop) i = ((i % count) + count) % count;
    else if (i < 0 || i >= count) return from;
    if (isEnabled(i)) return i;
  }
  return from;
}

/** First enabled index, or -1. */
export function firstEnabled(count: number, isEnabled: (index: number) => boolean): number {
  return stepIndex(count, -1, 1, isEnabled, false);
}

/** Last enabled index, or -1. */
export function lastEnabled(count: number, isEnabled: (index: number) => boolean): number {
  const i = stepIndex(count, count, -1, isEnabled, false);
  return i === count ? -1 : i;
}

/** Applies a roving move to `active`; disabled items are skipped. */
export function applyRovingMove(move: RovingMove, count: number, active: number, isEnabled: (index: number) => boolean, loop = true): number {
  switch (move) {
    case 'next':
      return stepIndex(count, active, 1, isEnabled, loop);
    case 'prev':
      return stepIndex(count, active < 0 ? count : active, -1, isEnabled, loop);
    case 'first':
      return firstEnabled(count, isEnabled);
    case 'last':
      return lastEnabled(count, isEnabled);
  }
}

// Typeahead lives in its own module; re-exported for existing callers.
export { TYPEAHEAD_MS, createTypeahead, isTypeaheadKey, typeahead, useTypeahead } from './typeahead.js';
export type { TypeaheadState } from './typeahead.js';
