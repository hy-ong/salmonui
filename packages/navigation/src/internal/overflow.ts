// Measured overflow (`internal/overflow`): which items of a bar fit, with priorities. Modeled on
// the measure loop of `data-grid/Toolbar.tsx` (cached item sizes, one
// container read, `hiddenFrom`) and the grid's single `ResizeObserver`
// (`instance.observeElement`), generalized to one observer per document.
//
// API
// ---
// Pure (Node-testable, no DOM):
//   computeHiddenFrom(sizes, available, reserve) -> number
//     The grid's prefix rule: the index of the first item that does not fit
//     (`sizes.length` when everything fits). `reserve` is the size of the
//     overflow trigger, reserved only when something overflows.
//   computeOverflow(entries, available, reserve) -> Uint8Array (1 = hidden)
//     Entries `{ size, mode?, priority?, separator? }`. `mode: 'never'` stays,
//     `'always'` is always hidden (and forces the trigger), `'auto'` (default)
//     is hidden lowest `priority` first (default 0), ties from the end, so
//     equal priorities give the same suffix as `computeHiddenFrom`.
//     Separators (`separator: true`) are never decisive: a separator that
//     would be leading, trailing or doubled among the visible items is hidden.
//
// React binding:
//   useOverflow(containerRef, options?) -> { hidden: ReadonlySet<string>, measure }
//     DOM contract inside the container (which carries `data-overflow-root`):
//       [data-overflow-item="<stable key>"]  a measured item (nested items of
//                                            an inner overflow root are skipped)
//       [data-overflow-mode="never|always"]  per-item mode (default 'auto'; or
//                                            `options.resolveMode(el)`)
//       [data-overflow-priority="<number>"]  higher stays longer
//       [data-overflow-separator]            a separator item
//       [data-overflow-trigger]              the "more" control, measured once
//                                            visible (else `options.reserve`)
//     The consumer renders `hidden` on the items whose key is in `hidden` and
//     shows its trigger while `hidden.size > 0`. Server and hydration render
//     with an empty set (every item rendered); measuring runs only in layout
//     effects and in the shared ResizeObserver callback, read phase only (item
//     sizes are cached per key, so hidden items keep their last size). The
//     snapshot is a string, so React does not re-render when the fit is
//     unchanged. `options.enabled === false` hides nothing and observes nothing.
//     `options.pinned` (a key) is treated as `'never'` (the selected tab).
//   observeResize(el, callback) -> teardown
//     One ResizeObserver per document shared by every caller.
//   watchOverflow(el, getOptions, onChange) -> { measure, stop }
//     Non-hook form of `useOverflow` for a lazily loaded measurer (Tabs loads
//     it in a chunk so its initial JS stays in budget): same DOM contract,
//     measures now and on resize, `onChange(hidden)` only when the fit changes;
//     call `measure()` after the consumer's commits.

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

export type OverflowMode = 'auto' | 'never' | 'always';

export interface OverflowEntry {
  /** Size along the bar's axis, including the gap after the item. */
  readonly size: number;
  readonly mode?: OverflowMode | undefined;
  /** Higher stays longer. Default 0. */
  readonly priority?: number | undefined;
  /** A separator: hidden when it would be leading, trailing or doubled. */
  readonly separator?: boolean | undefined;
}

/** First index that does not fit (prefix rule of the Data Grid toolbar). */
export function computeHiddenFrom(sizes: readonly number[], available: number, reserve: number): number {
  let total = 0;
  for (const s of sizes) total += s;
  if (total <= available) return sizes.length;
  let used = 0;
  for (let i = 0; i < sizes.length; i++) {
    used += sizes[i] as number;
    if (used > available - reserve) return i;
  }
  return sizes.length;
}

/** Hidden flags (1 = overflowed) for `entries` in `available` space. */
export function computeOverflow(entries: readonly OverflowEntry[], available: number, reserve: number): Uint8Array {
  const n = entries.length;
  const hidden = new Uint8Array(n);
  let total = 0;
  let always = false;
  for (let i = 0; i < n; i++) {
    const e = entries[i] as OverflowEntry;
    if (e.mode === 'always') {
      hidden[i] = 1;
      always = true;
    } else total += e.size;
  }
  if (always || total > available) {
    const budget = available - reserve;
    if (total > budget) {
      const order: number[] = [];
      for (let i = 0; i < n; i++) {
        const e = entries[i] as OverflowEntry;
        if (!hidden[i] && e.mode !== 'never' && !e.separator) order.push(i);
      }
      // Lowest priority first; ties hide from the end.
      order.sort((a, b) => (entries[a]?.priority ?? 0) - (entries[b]?.priority ?? 0) || b - a);
      for (const i of order) {
        if (total <= budget) break;
        hidden[i] = 1;
        total -= (entries[i] as OverflowEntry).size;
      }
    }
  }
  // Separators only between two visible items, never doubled.
  let prevItem = false;
  let pending = -1;
  for (let i = 0; i < n; i++) {
    if (hidden[i]) continue;
    if (entries[i]?.separator) {
      if (!prevItem || pending >= 0) hidden[i] = 1;
      else pending = i;
    } else {
      prevItem = true;
      pending = -1;
    }
  }
  if (pending >= 0) hidden[pending] = 1;
  return hidden;
}

// ---------------------------------------------------------------------------
// One ResizeObserver per document
// ---------------------------------------------------------------------------

interface SharedObserver {
  readonly observer: ResizeObserver;
  readonly callbacks: Map<Element, () => void>;
}

// A registry of live DOM observers keyed by document (not render state).
const shared = new WeakMap<Document, SharedObserver>();

/** Observes `el` with its document's shared ResizeObserver; returns the teardown. */
export function observeResize(el: Element, callback: () => void): () => void {
  const doc = el.ownerDocument;
  const RO = doc.defaultView?.ResizeObserver;
  if (!RO) return () => {};
  let entry = shared.get(doc);
  if (!entry) {
    const callbacks = new Map<Element, () => void>();
    const observer = new RO((records) => {
      for (const record of records) callbacks.get(record.target)?.();
    });
    entry = { observer, callbacks };
    shared.set(doc, entry);
  }
  const { observer, callbacks } = entry;
  callbacks.set(el, callback);
  observer.observe(el);
  return () => {
    if (callbacks.get(el) !== callback) return;
    callbacks.delete(el);
    observer.unobserve(el);
  };
}

// ---------------------------------------------------------------------------
// React binding
// ---------------------------------------------------------------------------

export interface UseOverflowOptions {
  /** Default true; false hides nothing and observes nothing. */
  readonly enabled?: boolean | undefined;
  /** The measured axis. Default `'horizontal'`. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** Trigger size before the trigger was ever measured. Default 40. */
  readonly reserve?: number | undefined;
  /** Item key that never overflows (the selected tab). */
  readonly pinned?: string | null | undefined;
  /** Mode of an item without `data-overflow-mode` (default `'auto'`). */
  readonly resolveMode?: ((item: HTMLElement) => OverflowMode) | undefined;
}

export interface OverflowState {
  /** Keys of the overflowed items (empty on the server and during hydration). */
  readonly hidden: ReadonlySet<string>;
  /** Re-measures now (read phase, then at most one store update). */
  readonly measure: () => void;
}

const SEP = '\u0000';
const EMPTY: ReadonlySet<string> = new Set();

interface Store {
  value: string;
  readonly listeners: Set<() => void>;
  readonly sizes: Map<string, number>;
  trigger: number;
}

const ITEM = '[data-overflow-item]';
const ROOT = '[data-overflow-root]';

function px(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

/** Reads the container and its items, returns the hidden-key snapshot. */
function measureContainer(el: HTMLElement, store: Store, options: UseOverflowOptions): string {
  const vertical = options.orientation === 'vertical';
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  const gap = style ? px(vertical ? style.rowGap : style.columnGap) : 0;
  const padding = style ? (vertical ? px(style.paddingTop) + px(style.paddingBottom) : px(style.paddingInlineStart) + px(style.paddingInlineEnd)) : 0;
  const available = (vertical ? el.clientHeight : el.clientWidth) - padding;
  const keys: string[] = [];
  const entries: OverflowEntry[] = [];
  for (const item of el.querySelectorAll<HTMLElement>(ITEM)) {
    if (item.parentElement?.closest(ROOT) !== el) continue;
    const key = item.dataset['overflowItem'] as string;
    if (!item.hidden) store.sizes.set(key, (vertical ? item.offsetHeight : item.offsetWidth) + gap);
    const explicit = item.dataset['overflowMode'] as OverflowMode | undefined;
    const mode: OverflowMode = key === options.pinned ? 'never' : (explicit ?? options.resolveMode?.(item) ?? 'auto');
    const priority = item.dataset['overflowPriority'];
    keys.push(key);
    entries.push({ size: store.sizes.get(key) ?? 0, mode, priority: priority ? Number(priority) : 0, separator: item.dataset['overflowSeparator'] !== undefined });
  }
  const trigger = el.querySelector<HTMLElement>('[data-overflow-trigger]');
  if (trigger && !trigger.hidden && trigger.parentElement?.closest(ROOT) === el) {
    const size = vertical ? trigger.offsetHeight : trigger.offsetWidth;
    if (size > 0) store.trigger = size + gap;
  }
  const flags = computeOverflow(entries, available + gap, store.trigger || (options.reserve ?? 40));
  let out = '';
  for (let i = 0; i < keys.length; i++) if (flags[i]) out = out ? out + SEP + keys[i] : (keys[i] as string);
  return out;
}

/**
 * Measured overflow of the container in `ref` (see the header comment). Re-
 * measures after every commit of the caller and on container resize.
 */
export function useOverflow(ref: RefObject<HTMLElement | null>, options: UseOverflowOptions = {}): OverflowState {
  const [store] = useState<Store>(() => ({ value: '', listeners: new Set(), sizes: new Map(), trigger: 0 }));
  const enabled = options.enabled !== false;
  const latest = useRef(options);
  const [api] = useState(() => {
    const subscribe = (listener: () => void): (() => void) => {
      store.listeners.add(listener);
      return () => store.listeners.delete(listener);
    };
    const set = (value: string): void => {
      if (value === store.value) return;
      store.value = value;
      for (const l of store.listeners) l();
    };
    const measure = (): void => {
      const el = ref.current;
      const o = latest.current;
      set(el && o.enabled !== false ? measureContainer(el, store, o) : '');
    };
    return { subscribe, measure, get: () => store.value };
  });
  const value = useSyncExternalStore(api.subscribe, api.get, () => '');
  useLayoutEffect(() => {
    latest.current = options;
    api.measure();
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    return observeResize(el, api.measure);
  }, [api, enabled, ref]);
  const hidden = useMemo<ReadonlySet<string>>(() => (value ? new Set(value.split(SEP)) : EMPTY), [value]);
  return { hidden, measure: api.measure };
}

/** Non-hook form of `useOverflow` (see the header comment). */
export function watchOverflow(el: HTMLElement, getOptions: () => UseOverflowOptions, onChange: (hidden: ReadonlySet<string>) => void): { readonly measure: () => void; readonly stop: () => void } {
  const store: Store = { value: '', listeners: new Set(), sizes: new Map(), trigger: 0 };
  const measure = (): void => {
    const value = el.isConnected ? measureContainer(el, store, getOptions()) : store.value;
    if (value === store.value) return;
    store.value = value;
    onChange(value ? new Set(value.split(SEP)) : EMPTY);
  };
  const stop = observeResize(el, measure);
  measure();
  return { measure, stop };
}
