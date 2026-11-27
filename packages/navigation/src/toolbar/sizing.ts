// Multi-size stepping of `Toolbar`. A lazy chunk that the measuring runtime
// loads only once a `ToolbarItem` declares more than one `sizes` entry, so
// toolbars without multi-size items never download it. It replaces the
// plain overflow watcher for that toolbar: the same DOM contract as
// `internal/overflow` (`data-overflow-item`, `-mode`, `-priority`,
// `-separator`, `-trigger`) plus `data-overflow-sizes` (the allowed sizes,
// largest first) and `data-size` (the rendered size) on each item.
//
// Widths are cached per item and size and read only from rendered items
// (read phase; a size never rendered counts as 0, so it is tried, rendered,
// measured and the fit recomputed in the next layout effect). The result is
// reported only when the hidden set or a size changes. The overflow
// primitives are passed in by the runtime, so this chunk holds only its own
// code (bundle row "toolbar sizing chunk").

import type { computeOverflow as ComputeOverflow, observeResize as ObserveResize, OverflowEntry, OverflowMode } from '../internal/overflow.js';

export type ToolbarItemSize = 'lg' | 'md' | 'sm';

export interface SizedEntry {
  /** Width (or height) per allowed size, largest first; unknown sizes count as 0. */
  readonly widths: readonly number[];
  readonly mode?: OverflowMode | undefined;
  /** Higher steps down (and overflows) later. Default 0. */
  readonly priority?: number | undefined;
}

/**
 * Size index per entry so the entries fit in `available`: the lowest
 * `priority` (ties: the last entry) steps down one size at a time until it is
 * at its last size, then the next; stops when everything fits or nothing can
 * step. `'always'` entries live in the menu and never step.
 */
export function computeSteps(entries: readonly SizedEntry[], available: number): Uint8Array {
  const n = entries.length;
  const level = new Uint8Array(n);
  const width = (i: number, l: number): number => (entries[i] as SizedEntry).widths[l] || 0;
  let total = 0;
  for (let i = 0; i < n; i++) if (entries[i]?.mode !== 'always') total += width(i, 0);
  while (total > available) {
    let best = -1;
    for (let i = n - 1; i >= 0; i--) {
      const e = entries[i] as SizedEntry;
      if (e.mode === 'always' || (level[i] as number) >= e.widths.length - 1) continue;
      if (best < 0 || (e.priority ?? 0) < ((entries[best] as SizedEntry).priority ?? 0)) best = i;
    }
    if (best < 0) break;
    const l = level[best] as number;
    total += width(best, l + 1) - width(best, l);
    level[best] = l + 1;
  }
  return level;
}

export interface SizedOptions {
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  readonly resolveMode?: ((item: HTMLElement) => OverflowMode) | undefined;
}

const px = (value: string): number => parseFloat(value) || 0;

/** Watches `el` (the toolbar content, `data-overflow-root`); `onChange(hidden, sizes)` when the fit changes. */
export function watchSized(
  el: HTMLElement,
  getOptions: () => SizedOptions,
  onChange: (hidden: ReadonlySet<string>, sizes: ReadonlyMap<string, ToolbarItemSize>) => void,
  computeOverflow: typeof ComputeOverflow,
  observeResize: typeof ObserveResize,
): { readonly measure: () => void; readonly stop: () => void } {
  const cache = new Map<string, number>();
  const groups = new WeakMap<Element, number>();
  let trigger = 0;
  // The snapshot of the server render: nothing hidden, every item at its first size.
  let value = '';
  const direct = (node: Element): boolean => node.parentElement?.closest('[data-overflow-root]') === el;
  const measure = (): void => {
    if (!el.isConnected) return;
    const options = getOptions();
    const vertical = options.orientation === 'vertical';
    const extent = (node: HTMLElement): number => (vertical ? node.offsetHeight : node.offsetWidth);
    const style = el.ownerDocument.defaultView?.getComputedStyle(el);
    const gap = style ? px(vertical ? style.rowGap : style.columnGap) : 0;
    const padding = style ? (vertical ? px(style.paddingTop) + px(style.paddingBottom) : px(style.paddingInlineStart) + px(style.paddingInlineEnd)) : 0;
    const keys: string[] = [];
    const lists: string[][] = [];
    const entries: (SizedEntry & { separator: boolean })[] = [];
    for (const item of el.querySelectorAll<HTMLElement>('[data-overflow-item]')) {
      if (!direct(item)) continue;
      const key = item.dataset['overflowItem'] as string;
      const current = item.dataset['size'] ?? '';
      const list = (item.dataset['overflowSizes'] ?? current).split(' ');
      if (!item.hidden) cache.set(`${key} ${current}`, extent(item) + gap);
      const priority = item.dataset['overflowPriority'];
      keys.push(key);
      lists.push(list);
      entries.push({
        widths: list.map((s) => cache.get(`${key} ${s}`) ?? 0),
        mode: (item.dataset['overflowMode'] as OverflowMode | undefined) ?? options.resolveMode?.(item) ?? 'auto',
        priority: priority ? Number(priority) : 0,
        separator: item.dataset['overflowSeparator'] !== undefined,
      });
    }
    // A labelled group adds its padding and border around its items: measured while it shows an item.
    let overhead = 0;
    for (const group of el.querySelectorAll<HTMLElement>('[data-labelled]')) {
      if (!direct(group)) continue;
      let inner = 0;
      let shown = false;
      for (const item of group.querySelectorAll<HTMLElement>('[data-overflow-item]'))
        if (!item.hidden && item.parentElement?.closest('[data-labelled]') === group) {
          inner += extent(item) + gap;
          shown = true;
        }
      if (shown && group.offsetParent !== null) groups.set(group, Math.max(0, extent(group) + gap - inner));
      overhead += groups.get(group) ?? 0;
    }
    const t = el.querySelector<HTMLElement>('[data-overflow-trigger]');
    if (t && !t.hidden && direct(t) && extent(t) > 0) trigger = extent(t) + gap;
    const available = (vertical ? el.clientHeight : el.clientWidth) - padding + gap - overhead;
    const levels = computeSteps(entries, available);
    const flags = computeOverflow(
      entries.map((e, i): OverflowEntry => ({
        ...e,
        size: e.widths[levels[i] as number] || 0,
      })),
      available,
      trigger || 40,
    );
    const hidden = new Set<string>();
    const sizes = new Map<string, ToolbarItemSize>();
    let next = '';
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i] as string;
      const level = levels[i] as number;
      if (flags[i]) hidden.add(key);
      if (level) sizes.set(key, lists[i]?.[level] as ToolbarItemSize);
      if (flags[i] || level) next += `${key}${flags[i] ? '!' : ''}${level}\u0000`;
    }
    if (next === value) return;
    value = next;
    onChange(hidden, sizes);
  };
  const stop = observeResize(el, measure);
  measure();
  return { measure, stop };
}
