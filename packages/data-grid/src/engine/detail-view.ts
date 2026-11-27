// Visible row model with detail rows (detail expansion stage). The
// view wraps the model entering the stage (a grouped view, or a `PlainView`
// adapter over an ungrouped order) and inserts one synthetic detail row after
// every expanded, visible data row. Only the k detail positions are stored
// (ascending inner indexes); every lookup is the inner lookup plus a binary
// search over them, so nothing scales with the total row count.

import type { RowId, RowKind, RowModelSnapshot, RowModelView, ViewRowInfo } from './types.js';
import { DETAIL_ID_PREFIX, detailParentId } from './view-helpers.js';

// The structural helpers live in the class-free `view-helpers.ts` so a
// renderer can import them without pulling these classes; re-exported here for existing importers.
export { baseView, dataIndexAt, dataRowCountOf, dataRowIdAt, DETAIL_ID_PREFIX, detailParentId, detailRowId, outerIndex } from './view-helpers.js';

const inverses = new WeakMap<Int32Array, Int32Array>();

/** Inverse of a full order array (source index -> position, -1 when absent), cached per array identity. */
function inverseOf(order: Int32Array, sourceCount: number): Int32Array {
  let inv = inverses.get(order);
  if (!inv || inv.length !== sourceCount) {
    inv = new Int32Array(sourceCount).fill(-1);
    for (let i = 0; i < order.length; i++) inv[order[i] as number] = i;
    inverses.set(order, inv);
  }
  return inv;
}

/**
 * View adapter over an ungrouped model: identity or `order`, optionally a
 * page window `[start, end)` of it. Lets the detail view treat every model as
 * a view.
 */
export class PlainView implements RowModelView {
  readonly kind = 'plain' as const;
  readonly count: number;
  readonly dataCount: number;
  readonly sourceIds: readonly RowId[];
  /** Full order (null: identity over `total` rows). */
  readonly order: Int32Array | null;
  readonly total: number;
  readonly start: number;

  constructor(sourceIds: readonly RowId[], order: Int32Array | null, total: number, start = 0, end = total) {
    this.sourceIds = sourceIds;
    this.order = order;
    this.total = total;
    this.start = Math.max(0, Math.min(start, total));
    this.count = Math.max(0, Math.min(end, total) - this.start);
    this.dataCount = this.count;
  }

  static of<Row>(model: RowModelSnapshot<Row>): PlainView {
    return new PlainView(model.sourceIds, model.order, model.count);
  }

  /** True when the window covers the whole order. */
  get full(): boolean {
    return this.start === 0 && this.count === this.total;
  }

  kindAt(): RowKind {
    return 'data';
  }

  sourceIndexAt(index: number): number {
    if (index < 0 || index >= this.count) return -1;
    const p = this.start + index;
    return this.order === null ? p : (this.order[p] as number);
  }

  idAt(index: number): RowId | undefined {
    const s = this.sourceIndexAt(index);
    return s < 0 ? undefined : this.sourceIds[s];
  }

  depthAt(): number {
    return 0;
  }

  indexOfSource(sourceIndex: number): number {
    if (sourceIndex < 0 || sourceIndex >= this.sourceIds.length) return -1;
    const p = this.order === null ? (sourceIndex < this.total ? sourceIndex : -1) : (inverseOf(this.order, this.sourceIds.length)[sourceIndex] as number);
    const i = p - this.start;
    return p < 0 || i < 0 || i >= this.count ? -1 : i;
  }

  parentOfSource(): RowId | null {
    return null;
  }

  resolve(): ViewRowInfo | undefined {
    return undefined;
  }

  page(start: number, end: number): PlainView {
    const a = this.start + Math.max(0, start);
    return new PlainView(this.sourceIds, this.order, this.total, a, Math.min(this.start + this.count, this.start + Math.max(0, end)));
  }
}

/** Resolves which rows of an inner view get a detail row (the module's expansion state). */
export interface DetailResolver {
  /** Expand-all mode: every visible data row except `collapsed` (and rows failing `hasDetail`). */
  readonly all: boolean;
  /** Explicit mode: expanded ids. Expand-all mode: ids collapsed explicitly. */
  readonly ids: ReadonlySet<RowId>;
  /** Source index of a row id, or -1. */
  readonly sourceIndexOf: (rowId: RowId) => number;
  /** Data row object at an inner index (for `hasDetail`), when available. */
  readonly hasDetail: ((row: unknown) => boolean) | null;
  readonly source: readonly unknown[];
}

function resolvePositions(inner: RowModelView, r: DetailResolver): { at: Int32Array; ids: RowId[] } {
  const rowAt = (index: number, id: RowId): unknown => {
    const s = inner.sourceIndexAt(index);
    if (s >= 0) return r.source[s];
    return inner.resolve(id)?.row;
  };
  if (r.all) {
    const at: number[] = [];
    const ids: RowId[] = [];
    const n = inner.count;
    const plain = inner instanceof PlainView;
    for (let i = 0; i < n; i++) {
      if (!plain && inner.kindAt(i) !== 'data') continue;
      const id = inner.idAt(i);
      if (id === undefined || r.ids.has(id)) continue;
      if (r.hasDetail && !r.hasDetail(rowAt(i, id))) continue;
      at.push(i);
      ids.push(id);
    }
    return { at: Int32Array.from(at), ids };
  }
  const found: [number, RowId][] = [];
  for (const id of r.ids) {
    const s = r.sourceIndexOf(id);
    let i: number;
    if (s >= 0) i = inner.indexOfSource(s);
    else {
      const info = inner.resolve(id);
      i = info && info.kind === 'data' ? info.index : -1;
    }
    if (i < 0) continue;
    if (r.hasDetail && !r.hasDetail(rowAt(i, id))) continue;
    found.push([i, id]);
  }
  found.sort((a, b) => a[0] - b[0]);
  const at = new Int32Array(found.length);
  const ids: RowId[] = new Array(found.length);
  for (let j = 0; j < found.length; j++) {
    at[j] = (found[j] as [number, RowId])[0];
    ids[j] = (found[j] as [number, RowId])[1];
  }
  return { at, ids };
}

export class DetailView implements RowModelView {
  readonly kind = 'detail' as const;
  readonly inner: RowModelView;
  readonly count: number;
  readonly dataCount: number;
  /** Detail rows in this view. */
  readonly detailCount: number;
  private readonly at: Int32Array;
  private readonly ids: readonly RowId[];
  private byId: Map<RowId, number> | null = null;
  private readonly resolver: DetailResolver;
  readonly page?: (start: number, end: number) => RowModelView;

  constructor(inner: RowModelView, resolver: DetailResolver) {
    this.inner = inner;
    this.resolver = resolver;
    const { at, ids } = resolvePositions(inner, resolver);
    this.at = at;
    this.ids = ids;
    this.detailCount = at.length;
    this.count = inner.count + at.length;
    this.dataCount = inner.dataCount;
    const innerPage = inner.page;
    if (innerPage) this.page = (start, end) => new DetailView(innerPage.call(inner, start, end), resolver);
  }

  /** Visible index of detail row `j`. */
  detailIndex(j: number): number {
    return (this.at[j] as number) + j + 1;
  }

  /** Parent row id of detail row `j`. */
  detailParentAt(j: number): RowId {
    return this.ids[j] as RowId;
  }

  /** Detail ordinal at a visible index, or -1 when the row is not a detail row. */
  private detailAt(index: number): number {
    // Largest j with detailIndex(j) <= index.
    const at = this.at;
    let lo = 0;
    let hi = at.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if ((at[mid] as number) + mid + 1 <= index) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }

  /** Inner index of a visible index, or -1 for a detail row. */
  innerIndex(index: number): number {
    const j = this.detailAt(index);
    if (j >= 0 && this.detailIndex(j) === index) return -1;
    return index - (j + 1);
  }

  /** Visible index of an inner index. */
  outerIndex(innerIndex: number): number {
    if (innerIndex < 0) return -1;
    // Details strictly before innerIndex: count of at[j] < innerIndex.
    const at = this.at;
    let lo = 0;
    let hi = at.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((at[mid] as number) < innerIndex) lo = mid + 1;
      else hi = mid;
    }
    return innerIndex + lo;
  }

  /** Visible index of a parent row's detail row, or -1. */
  detailIndexOf(rowId: RowId): number {
    if (!this.byId) {
      const map = new Map<RowId, number>();
      for (let j = 0; j < this.ids.length; j++) map.set(this.ids[j] as RowId, j);
      this.byId = map;
    }
    const j = this.byId.get(rowId);
    return j === undefined ? -1 : this.detailIndex(j);
  }

  kindAt(index: number): RowKind {
    if (index < 0 || index >= this.count) return 'data';
    const i = this.innerIndex(index);
    return i < 0 ? 'detail' : this.inner.kindAt(i);
  }

  sourceIndexAt(index: number): number {
    if (index < 0 || index >= this.count) return -1;
    const i = this.innerIndex(index);
    return i < 0 ? -1 : this.inner.sourceIndexAt(i);
  }

  idAt(index: number): RowId | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const j = this.detailAt(index);
    if (j >= 0 && this.detailIndex(j) === index) return DETAIL_ID_PREFIX + (this.ids[j] as RowId);
    return this.inner.idAt(index - (j + 1));
  }

  depthAt(index: number): number {
    if (index < 0 || index >= this.count) return 0;
    const j = this.detailAt(index);
    if (j >= 0 && this.detailIndex(j) === index) return this.inner.depthAt(this.at[j] as number);
    return this.inner.depthAt(index - (j + 1));
  }

  indexOfSource(sourceIndex: number): number {
    return this.outerIndex(this.inner.indexOfSource(sourceIndex));
  }

  parentOfSource(sourceIndex: number): RowId | null {
    return this.inner.parentOfSource(sourceIndex);
  }

  resolve(id: RowId): ViewRowInfo | undefined {
    const parent = detailParentId(id);
    if (parent !== null) {
      const index = this.detailIndexOf(parent);
      if (index < 0) return undefined;
      return Object.freeze({ index, kind: 'detail' as const, depth: this.inner.depthAt(index - this.detailAt(index) - 1), parentId: parent, row: null });
    }
    const info = this.inner.resolve(id);
    if (!info) return undefined;
    return Object.freeze({ ...info, index: this.outerIndex(info.index) });
  }

  /** The resolver this view was built with (paged views share it). */
  get expansion(): DetailResolver {
    return this.resolver;
  }
}
