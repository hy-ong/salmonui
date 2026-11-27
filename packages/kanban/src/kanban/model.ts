// Kanban board model: pure,
// framework-free functions that turn cards and column definitions into the
// rendered board (columns, swimlanes, cells), plus the move, WIP limit and
// keyboard navigation math. No React, no DOM.

import type { KanbanColumnDef, KanbanKey, KanbanLimitState, KanbanSort, KanbanSwimlaneContext, KanbanSwimlanes } from './types.js';

/** A column after ordering and hiding. */
export interface ColumnInfo {
  readonly id: KanbanKey;
  readonly def: KanbanColumnDef;
  /** The column values (`key` or `keys`); moves write the first. */
  readonly values: readonly KanbanKey[];
}

export interface CardEntry<T> {
  readonly id: KanbanKey;
  /** `data-card` attribute value. */
  readonly key: string;
  readonly card: T;
}

export interface LaneInfo {
  /** `null`: unassigned (or the single lane without swimlanes). */
  readonly key: KanbanKey | null;
  readonly label: string;
  readonly count: number;
}

export interface CardPlace {
  readonly lane: number;
  readonly col: number;
  readonly index: number;
}

export interface BoardModel<T> {
  readonly columns: readonly ColumnInfo[];
  readonly lanes: readonly LaneInfo[];
  /** `cells[lane][col]`: the cards of a cell in display order. */
  readonly cells: readonly (readonly (readonly CardEntry<T>[])[])[];
  /** Cards per column over every lane. */
  readonly columnCounts: readonly number[];
  readonly hasLanes: boolean;
  readonly byKey: ReadonlyMap<string, CardPlace>;
}

export interface BoardInput<T> {
  readonly rows: readonly T[];
  readonly getCardId: (card: T) => KanbanKey;
  readonly columnField: string;
  readonly columns: readonly KanbanColumnDef[];
  readonly columnOrder?: readonly KanbanKey[] | undefined;
  readonly showEmptyColumns?: boolean | undefined;
  readonly swimlanes?: KanbanSwimlanes | undefined;
  readonly sort?: KanbanSort<T> | undefined;
  readonly filter?: ((card: T) => boolean) | undefined;
  readonly unassignedLabel: string;
}

/** `data-card` value of a card id: numbers and strings never collide. */
export const keyOf = (id: KanbanKey): string => (typeof id === 'number' ? `n${id}` : `s${id}`);

/** Lookup form of a column or lane value (`1` and `'1'` match). */
const norm = (v: unknown): string => (v === null || v === undefined ? '' : String(v));

export const fieldOf = (card: unknown, field: string | undefined): unknown =>
  field && card !== null && typeof card === 'object' ? (card as Record<string, unknown>)[field] : undefined;

export const columnIdOf = (def: KanbanColumnDef): KanbanKey | undefined => def.key ?? def.keys?.[0];

/** Orders columns by `order` (ids first, the rest in definition order) and drops hidden ones. */
export function orderColumns(defs: readonly KanbanColumnDef[], order: readonly KanbanKey[] | undefined): ColumnInfo[] {
  const all: ColumnInfo[] = [];
  for (const def of defs) {
    const id = columnIdOf(def);
    if (id === undefined || def.hidden) continue;
    all.push({ id, def, values: def.keys && def.keys.length > 0 ? def.keys : [id] });
  }
  if (!order || order.length === 0) return all;
  const rank = new Map(order.map((k, i) => [norm(k), i]));
  return all
    .map((c, i) => ({ c, r: rank.get(norm(c.id)) ?? order.length + i }))
    .sort((a, b) => a.r - b.r)
    .map((x) => x.c);
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a === undefined || a === null) return b === undefined || b === null ? 0 : 1;
  if (b === undefined || b === null) return -1;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Sorts the cards of a cell (stable). */
export function sortCards<T>(entries: CardEntry<T>[], sort: KanbanSort<T> | undefined): CardEntry<T>[] {
  if (!sort || sort.by === 'data') return entries;
  const dir = sort.direction === 'desc' ? -1 : 1;
  if (sort.by === 'custom') {
    const cmp = sort.comparator;
    return cmp ? entries.sort((a, b) => dir * cmp(a.card, b.card)) : entries;
  }
  const field = sort.field;
  return field ? entries.sort((a, b) => dir * compareValues(fieldOf(a.card, field), fieldOf(b.card, field))) : entries;
}

/** Builds the board: columns, lanes and cells. */
export function buildBoard<T>(input: BoardInput<T>): BoardModel<T> {
  const { rows, getCardId, columnField, swimlanes, filter } = input;
  let columns = orderColumns(input.columns, input.columnOrder);
  const colIndex = new Map<string, number>();
  columns.forEach((c, i) => {
    for (const v of c.values) if (!colIndex.has(norm(v))) colIndex.set(norm(v), i);
  });
  // Lanes: declared first, then by first appearance; the unassigned lane last.
  const laneIndex = new Map<string, number>();
  const lanes: { key: KanbanKey | null; label: string; count: number; declared: boolean }[] = [];
  const laneField = swimlanes?.field;
  if (swimlanes) {
    for (const def of swimlanes.lanes ?? []) {
      if (laneIndex.has(norm(def.key))) continue;
      laneIndex.set(norm(def.key), lanes.length);
      lanes.push({ key: def.key, label: def.label ?? String(def.key), count: 0, declared: def.label !== undefined });
    }
  } else {
    lanes.push({ key: null, label: '', count: 0, declared: true });
  }
  const buckets: CardEntry<T>[][][] = [];
  const ensure = (lane: number): CardEntry<T>[][] => (buckets[lane] ??= columns.map(() => []));
  let unassigned = -1;
  for (const card of rows) {
    if (filter && !filter(card)) continue;
    const col = colIndex.get(norm(fieldOf(card, columnField)));
    if (col === undefined) continue;
    let lane = 0;
    if (swimlanes && laneField) {
      const raw = fieldOf(card, laneField);
      if (raw === undefined || raw === null || raw === '') {
        if (swimlanes.unassigned === false) continue;
        lane = -1;
      } else {
        const k = norm(raw);
        let li = laneIndex.get(k);
        if (li === undefined) {
          li = lanes.length;
          laneIndex.set(k, li);
          const labelValue = fieldOf(card, swimlanes.labelField);
          lanes.push({ key: raw as KanbanKey, label: labelValue === undefined || labelValue === null ? String(raw) : String(labelValue), count: 0, declared: false });
        } else if (!(lanes[li] as { declared: boolean }).declared && swimlanes.labelField) {
          const l = lanes[li] as { label: string; declared: boolean };
          const labelValue = fieldOf(card, swimlanes.labelField);
          if (labelValue !== undefined && labelValue !== null && l.label === norm(raw)) l.label = String(labelValue);
        }
        lane = li;
      }
    }
    const id = getCardId(card);
    if (lane === -1) {
      if (unassigned < 0) {
        unassigned = lanes.length;
        lanes.push({ key: null, label: input.unassignedLabel, count: 0, declared: true });
      }
      lane = unassigned;
    }
    ensure(lane)[col]!.push({ id, key: keyOf(id), card });
    (lanes[lane] as { count: number }).count++;
  }
  // Unassigned lane stays last after sorting.
  let order = lanes.map((_, i) => i).filter((i) => i !== unassigned);
  if (swimlanes) {
    order = order.filter((i) => lanes[i]!.count > 0 || swimlanes.showEmpty === true);
    const sort = swimlanes.sort;
    if (sort) {
      const ctx = (i: number): KanbanSwimlaneContext => ({ key: lanes[i]!.key, label: lanes[i]!.label, count: lanes[i]!.count });
      order.sort(typeof sort === 'function' ? (a, b) => sort(ctx(a), ctx(b)) : (a, b) => (sort === 'desc' ? -1 : 1) * lanes[a]!.label.localeCompare(lanes[b]!.label, undefined, { numeric: true }));
    }
    if (unassigned >= 0) order.push(unassigned);
  }
  let cells = order.map((i) => (buckets[i] ?? columns.map(() => [])).map((cell) => sortCards(cell, input.sort)));
  let columnCounts = columns.map((_, c) => cells.reduce((n, lane) => n + (lane[c] as CardEntry<T>[]).length, 0));
  if (input.showEmptyColumns === false) {
    const keep = columns.map((_, c) => (columnCounts[c] as number) > 0);
    columns = columns.filter((_, c) => keep[c]);
    cells = cells.map((lane) => lane.filter((_, c) => keep[c]));
    columnCounts = columnCounts.filter((_, c) => keep[c]);
  }
  const byKey = new Map<string, CardPlace>();
  cells.forEach((lane, li) =>
    lane.forEach((cell, ci) =>
      cell.forEach((e, index) => {
        byKey.set(e.key, { lane: li, col: ci, index });
      }),
    ),
  );
  return {
    columns,
    lanes: order.map((i) => ({ key: lanes[i]!.key, label: lanes[i]!.label, count: lanes[i]!.count })),
    cells,
    columnCounts,
    hasLanes: swimlanes !== undefined,
    byKey,
  };
}

/** WIP state of a count against a column's limits. */
export function limitOf(count: number, def: KanbanColumnDef): KanbanLimitState {
  if (def.max !== undefined && count > def.max) return 'over';
  if (def.min !== undefined && count < def.min) return 'under';
  return null;
}

/** Whether cards of `from` may be dropped into `to`. */
export function canDropInto(from: ColumnInfo | undefined, to: ColumnInfo, sameLane: boolean, lanesDraggable: boolean): boolean {
  if (to.def.droppable === false) return false;
  if (!sameLane && !lanesDraggable) return false;
  if (!from) return true;
  if (from.def.draggable === false) return false;
  const allowed = from.def.allowedTargets;
  if (allowed && norm(from.id) !== norm(to.id) && !allowed.some((k) => norm(k) === norm(to.id))) return false;
  return true;
}

/**
 * Moves `ids` to a new array position: before `beforeId`, else after
 * `afterId`, else at the end; `update` rewrites each moved card
 * (column and lane fields). Pure; the input is not changed.
 */
export function moveRows<T>(
  rows: readonly T[],
  getId: (card: T) => KanbanKey,
  ids: readonly KanbanKey[],
  update: (card: T) => T,
  beforeId: KanbanKey | null,
  afterId: KanbanKey | null,
): T[] {
  const set = new Set(ids.map(keyOf));
  const moved: T[] = [];
  const rest: T[] = [];
  for (const r of rows) (set.has(keyOf(getId(r))) ? moved : rest).push(r);
  const order = new Map(ids.map((id, i) => [keyOf(id), i]));
  moved.sort((a, b) => (order.get(keyOf(getId(a))) as number) - (order.get(keyOf(getId(b))) as number));
  let at = rest.length;
  if (beforeId !== null) {
    const i = rest.findIndex((r) => keyOf(getId(r)) === keyOf(beforeId));
    if (i >= 0) at = i;
  } else if (afterId !== null) {
    const i = rest.findIndex((r) => keyOf(getId(r)) === keyOf(afterId));
    if (i >= 0) at = i + 1;
  }
  rest.splice(at, 0, ...moved.map(update));
  return rest;
}

/** Copy of `card` with `field` set. */
export const withField = <T>(card: T, field: string, value: unknown): T => ({ ...(card as object), [field]: value }) as T;

/**
 * Keyboard target from `at`: Up / Down within a cell and on to the
 * same column of the next lane, Left / Right to the nearest card of the
 * adjacent non-empty column (`dx` already mirrored for RTL), Home / End in
 * the cell, Ctrl+Home / End of the board. Returns `null` when nothing moves.
 */
export function navigate(model: BoardModel<unknown>, at: CardPlace, key: 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'first' | 'last', collapsed: (col: number) => boolean): CardPlace | null {
  const cell = (l: number, c: number): readonly unknown[] => (collapsed(c) ? [] : (model.cells[l]?.[c] ?? []));
  const L = model.lanes.length;
  const C = model.columns.length;
  switch (key) {
    case 'up':
      if (at.index > 0) return { ...at, index: at.index - 1 };
      for (let l = at.lane - 1; l >= 0; l--) if (cell(l, at.col).length) return { lane: l, col: at.col, index: cell(l, at.col).length - 1 };
      return null;
    case 'down':
      if (at.index < cell(at.lane, at.col).length - 1) return { ...at, index: at.index + 1 };
      for (let l = at.lane + 1; l < L; l++) if (cell(l, at.col).length) return { lane: l, col: at.col, index: 0 };
      return null;
    case 'left':
    case 'right': {
      const d = key === 'left' ? -1 : 1;
      for (let c = at.col + d; c >= 0 && c < C; c += d) {
        const n = cell(at.lane, c).length;
        if (n) return { lane: at.lane, col: c, index: Math.min(at.index, n - 1) };
      }
      return null;
    }
    case 'home':
      return at.index === 0 ? null : { ...at, index: 0 };
    case 'end': {
      const n = cell(at.lane, at.col).length;
      return at.index === n - 1 ? null : { ...at, index: n - 1 };
    }
    case 'first':
      for (let l = 0; l < L; l++) for (let c = 0; c < C; c++) if (cell(l, c).length) return { lane: l, col: c, index: 0 };
      return null;
    case 'last':
      for (let l = L - 1; l >= 0; l--) for (let c = C - 1; c >= 0; c--) if (cell(l, c).length) return { lane: l, col: c, index: cell(l, c).length - 1 };
      return null;
  }
}
