// Tree search of TreeSelect: the nodes whose label matches plus
// their ancestors, in tree (pre-order) order, with `aria-setsize` /
// `aria-posinset` among the shown siblings. Framework-agnostic and O(n) per
// search over the loaded nodes; children that are not loaded are not searched.

import { foldText } from '../internal/collection/fold.js';
import type { TreeModel } from '@salmonui/core/internal/tree-store';

export type TreeSearchOperator<T> = 'startsWith' | 'contains' | 'endsWith' | ((item: T, text: string) => boolean);

export interface TreeFilterResult {
  /** Shown node indexes, ascending (pre-order). */
  readonly order: Int32Array;
  /** Per node: shown siblings and 1-based position among them (0 when hidden). */
  readonly setsize: Int32Array;
  readonly posinset: Int32Array;
  /** Per node: 1 when the node itself matches. */
  readonly matched: Uint8Array;
  /** Number of matching nodes. */
  readonly matches: number;
}

export interface TreeFilterOptions<T> {
  readonly operator?: TreeSearchOperator<T> | undefined;
  readonly matchCase?: boolean | undefined;
  readonly ignoreAccents?: boolean | undefined;
}

export function filterTree<T>(model: TreeModel<T>, label: (node: number) => string, text: string, options: TreeFilterOptions<T> = {}): TreeFilterResult {
  const n = model.count;
  const op = options.operator ?? 'startsWith';
  const accents = options.ignoreAccents === true;
  const exact = options.matchCase === true;
  const needle = typeof op === 'function' ? text : foldText(text, accents, exact);
  const matched = new Uint8Array(n);
  const keep = new Uint8Array(n);
  let matches = 0;
  for (let i = n - 1; i >= 0; i--) {
    let hit: boolean;
    if (typeof op === 'function') hit = op(model.items[i] as T, text);
    else {
      const hay = foldText(label(i), accents, exact);
      hit = op === 'contains' ? hay.includes(needle) : op === 'endsWith' ? hay.endsWith(needle) : hay.startsWith(needle);
    }
    if (hit) {
      matched[i] = 1;
      matches++;
      keep[i] = 1;
    }
    const p = model.parent[i] as number;
    if (keep[i] && p >= 0) keep[p] = 1;
  }
  let k = 0;
  for (let i = 0; i < n; i++) if (keep[i]) k++;
  const order = new Int32Array(k);
  const setsize = new Int32Array(n);
  const posinset = new Int32Array(n);
  // Shown children per parent (index parent + 1; 0 holds the roots).
  const shown = new Int32Array(n + 1);
  k = 0;
  for (let i = 0; i < n; i++) {
    if (!keep[i]) continue;
    order[k++] = i;
    const slot = (model.parent[i] as number) + 1;
    shown[slot] = (shown[slot] as number) + 1;
    posinset[i] = shown[slot] as number;
  }
  for (let j = 0; j < order.length; j++) {
    const i = order[j] as number;
    setsize[i] = shown[(model.parent[i] as number) + 1] as number;
  }
  return { order, setsize, posinset, matched, matches };
}

/** First index of the ascending `order` whose value is >= `node`. */
export function lowerBound(order: Int32Array, node: number): number {
  let lo = 0;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((order[mid] as number) < node) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Position of `node` in the ascending `order`, or -1. */
export function positionIn(order: Int32Array, node: number): number {
  const p = lowerBound(order, node);
  return order[p] === node ? p : -1;
}
