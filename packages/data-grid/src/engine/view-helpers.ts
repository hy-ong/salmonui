// Structural row-model view helpers (detail expansion stage). Class-free: they branch on `RowModelView.kind` and
// the view's own methods, never on `instanceof`, so renderer code that
// imports them (through `./expansion`) does not pull the `DetailView` /
// `PlainView` classes of `detail-view.ts`.

import type { RowId, RowModelSnapshot, RowModelView } from './types.js';

export const DETAIL_ID_PREFIX = '__detail:';

/** Detail row id of a parent row. */
export function detailRowId(rowId: RowId): RowId {
  return DETAIL_ID_PREFIX + rowId;
}

/** Parent row id of a detail row id, or null when `id` is not a detail row id. */
export function detailParentId(id: RowId): RowId | null {
  return id.startsWith(DETAIL_ID_PREFIX) ? id.slice(DETAIL_ID_PREFIX.length) : null;
}

/** The innermost (structural) view of a possibly wrapped view. */
export function baseView(view: RowModelView | null | undefined): RowModelView | null {
  let v = view ?? null;
  while (v && v.inner) v = v.inner;
  return v;
}

/** Maps an index of `baseView(view)` to a visible index of `view`. */
export function outerIndex(view: RowModelView | null | undefined, innerIndex: number): number {
  if (!view || innerIndex < 0) return innerIndex;
  const chain: RowModelView[] = [];
  let v: RowModelView | null = view;
  while (v && v.inner) {
    chain.push(v);
    v = v.inner;
  }
  let i = innerIndex;
  for (let k = chain.length - 1; k >= 0; k--) {
    const w = chain[k] as RowModelView & { outerIndex?: (i: number) => number };
    i = w.outerIndex ? w.outerIndex(i) : i;
  }
  return i;
}

// ---------------------------------------------------------------------------
// Data row indexes
// ---------------------------------------------------------------------------

interface PositionView extends RowModelView {
  positionAt(index: number): number;
  readonly range: readonly [number, number] | null;
  readonly tree: { readonly order: Int32Array; readonly sourceIds: readonly RowId[]; readonly dataCount: number };
}

/** Grouped views and tree views (data positions over a data order). */
function isPositionView(v: RowModelView): v is PositionView {
  return typeof (v as Partial<PositionView>).positionAt === 'function';
}

/**
 * Data row index (captions, footers, detail rows, and pinned rows not
 * counted) of the row at visible `index`, or -1 for a synthetic or pinned row. O(log) for plain, grouped,
 * and detail views; lazy group views are scanned.
 */
export function dataIndexAt<Row>(model: RowModelSnapshot<Row>, index: number): number {
  if (index < 0 || index >= model.count) return -1;
  let view: RowModelView | null = model.view ?? null;
  // Pinned rows head the model and are not data positions.
  if (!view) return index < (model.pinned?.length ?? 0) ? -1 : index - (model.pinned?.length ?? 0);
  let i = index;
  while (view.inner) {
    const w = view as RowModelView & { innerIndex?: (i: number) => number };
    if (!w.innerIndex) break;
    i = w.innerIndex(i);
    if (i < 0) return -1;
    view = view.inner;
  }
  if (view.kind === 'plain') return i;
  if (isPositionView(view)) {
    const p = view.positionAt(i);
    return p < 0 ? -1 : p - (view.range ? view.range[0] : 0);
  }
  if (view.kindAt(i) !== 'data') return -1;
  let n = 0;
  for (let k = 0; k < i; k++) if (view.kindAt(k) === 'data') n++;
  return n;
}

/** Row id of the data row at data index `dataIndex` of the current view, or undefined. */
export function dataRowIdAt<Row>(model: RowModelSnapshot<Row>, dataIndex: number): RowId | undefined {
  if (dataIndex < 0 || !Number.isInteger(dataIndex)) return undefined;
  const view = model.view ?? null;
  if (!view) {
    const at = dataIndex + (model.pinned?.length ?? 0);
    if (at >= model.count) return undefined;
    return model.sourceIds[model.order === null ? at : (model.order[at] as number)];
  }
  const base = baseView(view) as RowModelView;
  if (base.kind === 'plain') return base.idAt(dataIndex);
  if (isPositionView(base)) {
    const lo = base.range ? base.range[0] : 0;
    const hi = base.range ? base.range[1] : base.tree.dataCount;
    const p = lo + dataIndex;
    return p < hi ? base.tree.sourceIds[base.tree.order[p] as number] : undefined;
  }
  let n = 0;
  for (let k = 0; k < view.count; k++) {
    if (view.kindAt(k) !== 'data') continue;
    if (n++ === dataIndex) return view.idAt(k);
  }
  return undefined;
}

/** Data rows of the current view (excludes synthetic rows). */
export function dataRowCountOf<Row>(model: RowModelSnapshot<Row>): number {
  return model.view ? model.view.dataCount : model.count - (model.pinned?.length ?? 0);
}
