// Focus module.
// Logical focus lives here; the renderer projects it onto DOM focus with a
// roving tabindex. The slice is `inSnapshot: false`: a move notifies the old
// and the new target (cell or header channels) and nothing else.

import { spanResolverOf, type CellSpanResolver } from './cell-spans.js';
import { defineDataGridModule } from './engine.js';
import type { ColumnId, ColumnSnapshot, DataGridModule, DataGridOptions, ModuleContext, NotificationScope, RowId } from './types.js';

export type FocusTarget =
  | { readonly kind: 'cell'; readonly rowId: RowId; readonly columnId: ColumnId }
  | { readonly kind: 'header'; readonly columnId: ColumnId; readonly level: number };

/** `left`/`right` are visual and flip in RTL; the others are logical. */
export type FocusDirection = 'up' | 'down' | 'left' | 'right' | 'home' | 'end' | 'pageUp' | 'pageDown' | 'firstCell' | 'lastCell' | 'nextRegion' | 'previousRegion';

export interface FocusState {
  readonly target: FocusTarget | null;
  readonly mode: 'navigate' | 'edit';
  /** Resolved text direction (the `direction` option, or what the renderer detected from `dir`). */
  readonly direction: 'ltr' | 'rtl';
  /** Last body cell, so moving back from the header returns to it. */
  readonly lastCell: { readonly rowId: RowId; readonly columnId: ColumnId } | null;
  /**
   * Span-aware moves: the column a vertical move aimed at, or the
   * row a horizontal move aimed at, when it landed on a span anchor elsewhere.
   * The next move in the same axis continues from it, so moving down through
   * a column span returns to the original column. Null otherwise.
   */
  readonly intent: FocusIntent | null;
}

export type FocusIntent = { readonly axis: 'column'; readonly columnId: ColumnId } | { readonly axis: 'row'; readonly rowId: RowId };

export interface FocusOptions {
  /** Rows per PageUp/PageDown when the command carries no `pageSize`. Default 10. */
  readonly pageSize?: number;
  /** Whether ArrowUp from the first row enters the header. Default true. */
  readonly headerNavigation?: boolean;
}

export type FocusSetCommand = { type: 'focus.set'; target: FocusTarget | null };
export type FocusMoveCommand = { type: 'focus.move'; direction: FocusDirection; pageSize?: number };
export type FocusSetModeCommand = { type: 'focus.setMode'; mode: 'navigate' | 'edit' };
export type FocusSetDirectionCommand = { type: 'focus.setDirection'; direction: 'ltr' | 'rtl' };
export type FocusCommand = FocusSetCommand | FocusMoveCommand | FocusSetModeCommand | FocusSetDirectionCommand;

export type FocusMethods<Row> = {
  /** Current logical target (null before anything was focused). */
  getTarget(ctx: ModuleContext<Row>): FocusTarget | null;
  /** Where `focus.move` would go, without moving (keyboard handlers, previews). */
  resolveMove(ctx: ModuleContext<Row>, direction: FocusDirection, pageSize?: number): FocusTarget | null;
  /** First body cell, or the first header cell when there are no rows. */
  getDefaultTarget(ctx: ModuleContext<Row>): FocusTarget | null;
};

export type FocusModule<Row> = DataGridModule<Row, FocusState, FocusCommand, 'focus', FocusMethods<Row>>;

const DIRECTIONS = new Set<FocusDirection>(['up', 'down', 'left', 'right', 'home', 'end', 'pageUp', 'pageDown', 'firstCell', 'lastCell', 'nextRegion', 'previousRegion']);

const columnIndexCache = new WeakMap<object, Map<ColumnId, number>>();

/** Display position of a column among the visible leaves (left zone, center, right zone), or -1. */
export function visibleColumnIndex<Row>(columns: ColumnSnapshot<Row>, columnId: ColumnId): number {
  let map = columnIndexCache.get(columns.visible);
  if (!map) {
    map = new Map();
    for (let i = 0; i < columns.visible.length; i++) map.set((columns.visible[i] as { columnId: ColumnId }).columnId, i);
    columnIndexCache.set(columns.visible, map);
  }
  return map.get(columnId) ?? -1;
}

function sameTarget(a: FocusTarget | null, b: FocusTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.columnId !== b.columnId) return false;
  if (a.kind === 'cell') return a.rowId === (b as typeof a).rowId;
  return a.level === (b as typeof a).level;
}

function cell(rowId: RowId, columnId: ColumnId): FocusTarget {
  return Object.freeze({ kind: 'cell', rowId, columnId });
}

function header(columnId: ColumnId, level = 0): FocusTarget {
  return Object.freeze({ kind: 'header', columnId, level });
}

function validTarget(value: unknown): value is FocusTarget | null {
  if (value === null) return true;
  if (typeof value !== 'object') return false;
  const t = value as Record<string, unknown>;
  if (typeof t['columnId'] !== 'string') return false;
  if (t['kind'] === 'cell') return typeof t['rowId'] === 'string';
  if (t['kind'] === 'header') return t['level'] === undefined || (typeof t['level'] === 'number' && Number.isInteger(t['level']) && (t['level'] as number) >= 0);
  return false;
}

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function defaultTarget<Row>(ctx: ModuleContext<Row>): FocusTarget | null {
  const columns = ctx.getColumns().visible;
  const first = columns[0];
  if (!first) return null;
  const rowId = ctx.getRows().count > 0 ? ctx.getRowIdAt(0) : undefined;
  return rowId === undefined ? header(first.columnId) : cell(rowId, first.columnId);
}

/** A move result: the new target and the span intent it leaves. */
interface Landing {
  readonly target: FocusTarget | null;
  readonly intent: FocusIntent | null;
}

/**
 * The anchor cell of the span covering a cell: the cell a
 * span-aware focus, selection, or edit targets. Null when there is no
 * resolver, the cell is outside the view, or it is not covered by a span
 * starting elsewhere.
 */
export function spanAnchorOf<Row>(ctx: ModuleContext<Row>, spans: CellSpanResolver | null, rowId: RowId, columnId: ColumnId): { rowId: RowId; columnId: ColumnId } | null {
  if (!spans) return null;
  const r = ctx.getRowIndex(rowId);
  const columns = ctx.getColumns();
  const c = r < 0 ? -1 : visibleColumnIndex(columns, columnId);
  if (c < 0) return null;
  const b = spans(r, c);
  if (!b || (b.rowIndex === r && b.columnIndex === c)) return null;
  const anchorRow = ctx.getRowIdAt(b.rowIndex);
  const anchorCol = columns.visible[b.columnIndex] as { columnId: ColumnId } | undefined;
  return anchorRow === undefined || !anchorCol ? null : { rowId: anchorRow, columnId: anchorCol.columnId };
}

function move<Row>(state: FocusState, ctx: ModuleContext<Row>, direction: FocusDirection, pageSize: number, headerNavigation: boolean, spans: CellSpanResolver | null): Landing | null {
  const columns = ctx.getColumns();
  const visible = columns.visible;
  const lastCol = visible.length - 1;
  if (lastCol < 0) return null;
  const count = ctx.getRows().count;
  const lastRow = count - 1;
  const target = state.target ?? defaultTarget(ctx);
  if (!target) return null;
  const step = (visual: 1 | -1): number => (state.direction === 'rtl' ? -visual : visual);
  const plain = (t: FocusTarget | null): Landing => ({ target: t, intent: null });
  // Lands on (r, c), or on the anchor of the span covering it; a
  // vertical (`column`) or horizontal (`row`) move that lands elsewhere keeps
  // the aimed-at column or row as the intent.
  const at = (r: number, c: number, axis: 'column' | 'row' | null = null): Landing | null => {
    const cc = clamp(c, 0, lastCol);
    const b = spans ? spans(r, cc) : null;
    const ar = b ? b.rowIndex : r;
    const ac = b ? b.columnIndex : cc;
    const rowId = ctx.getRowIdAt(ar);
    const col = visible[ac];
    if (rowId === undefined || !col) return null;
    let intent: FocusIntent | null = null;
    if (axis === 'column' && ac !== cc) intent = Object.freeze({ axis: 'column', columnId: (visible[cc] as { columnId: ColumnId }).columnId });
    else if (axis === 'row' && ar !== r) {
      const aimed = ctx.getRowIdAt(r);
      if (aimed !== undefined) intent = Object.freeze({ axis: 'row', rowId: aimed });
    }
    return { target: cell(rowId, col.columnId), intent };
  };
  let c = visibleColumnIndex(columns, target.columnId);
  if (c < 0) c = 0;

  if (target.kind === 'header') {
    switch (direction) {
      case 'left':
      case 'right':
        return plain(header((visible[clamp(c + step(direction === 'right' ? 1 : -1), 0, lastCol)] as { columnId: ColumnId }).columnId, target.level));
      case 'home':
        return plain(header((visible[0] as { columnId: ColumnId }).columnId, target.level));
      case 'end':
        return plain(header((visible[lastCol] as { columnId: ColumnId }).columnId, target.level));
      case 'down':
      case 'pageDown':
      case 'nextRegion':
      case 'previousRegion': {
        if (count === 0) return plain(target);
        if (direction !== 'down' && direction !== 'pageDown' && state.lastCell && ctx.getRowIndex(state.lastCell.rowId) >= 0) {
          return plain(cell(state.lastCell.rowId, state.lastCell.columnId));
        }
        return at(0, c, 'column') ?? plain(target);
      }
      case 'firstCell':
        return count === 0 ? plain(target) : at(0, 0);
      case 'lastCell':
        return count === 0 ? plain(target) : at(lastRow, lastCol);
      default:
        return plain(target); // up, pageUp: already at the top
    }
  }

  let r = ctx.getRowIndex(target.rowId);
  if (count === 0) {
    return headerNavigation ? plain(header((visible[c] as { columnId: ColumnId }).columnId)) : null;
  }
  // The focused row left the view (filtered out, removed): continue from the top.
  if (r < 0) r = 0;
  // Span-aware moves leave the focused span from its edge.
  const block = spans ? spans(r, c) : null;
  const top = block ? block.rowIndex : r;
  const bottom = block ? block.rowIndex + block.rowSpan - 1 : r;
  const first = block ? block.columnIndex : c;
  const last = block ? block.columnIndex + block.colSpan - 1 : c;
  // The aimed-at column (vertical moves) or row (horizontal moves), while it is inside the focused span.
  let ic = c;
  let ir = r;
  const intent = state.intent;
  if (block && intent) {
    if (intent.axis === 'column') {
      const i = visibleColumnIndex(columns, intent.columnId);
      if (i >= first && i <= last) ic = i;
    } else {
      const i = ctx.getRowIndex(intent.rowId);
      if (i >= top && i <= bottom) ir = i;
    }
  }
  const stay = (): Landing => ({ target, intent });
  switch (direction) {
    case 'up':
      if (top === 0) return headerNavigation ? plain(header((visible[ic] as { columnId: ColumnId }).columnId)) : at(0, ic, 'column');
      return at(top - 1, ic, 'column');
    case 'down':
      return bottom >= lastRow ? stay() : at(bottom + 1, ic, 'column');
    case 'left':
    case 'right': {
      const forward = step(direction === 'right' ? 1 : -1) === 1;
      if (forward ? last >= lastCol : first <= 0) return stay();
      return at(ir, forward ? last + 1 : first - 1, 'row');
    }
    case 'home':
      return at(ir, 0, 'row');
    case 'end':
      return at(ir, lastCol, 'row');
    case 'pageUp':
      return at(Math.max(0, top - pageSize), ic, 'column');
    case 'pageDown':
      return bottom >= lastRow ? stay() : at(Math.min(lastRow, Math.max(bottom + 1, top + pageSize)), ic, 'column');
    case 'firstCell':
      return at(0, 0);
    case 'lastCell':
      return at(lastRow, lastCol);
    case 'nextRegion':
    case 'previousRegion':
      return headerNavigation ? plain(header((visible[c] as { columnId: ColumnId }).columnId)) : plain(target);
    default:
      return plain(target);
  }
}

function withTarget(state: FocusState, target: FocusTarget | null, intent: FocusIntent | null = null): FocusState {
  if (sameTarget(state.target, target)) return state.intent === intent ? state : Object.freeze({ ...state, intent });
  const lastCell = target?.kind === 'cell' ? { rowId: target.rowId, columnId: target.columnId } : state.lastCell;
  return Object.freeze({ ...state, target, lastCell, intent });
}

/**
 * Creates the `focus` module. Options are read from `options.focus`
 * (`FocusOptions`); the initial direction is the grid `direction` option.
 */
export function createFocusModule<Row>(): FocusModule<Row> {
  let pageSizeDefault = 10;
  let headerNavigation = true;
  let spans: CellSpanResolver | null = null;
  const methods: FocusMethods<Row> = {
    getTarget: (ctx) => (ctx.getModuleState<FocusState>('focus') as FocusState).target,
    resolveMove: (ctx, direction, pageSize) => move(ctx.getModuleState<FocusState>('focus') as FocusState, ctx, direction, pageSize ?? pageSizeDefault, headerNavigation, spans)?.target ?? null,
    getDefaultTarget: (ctx) => defaultTarget(ctx),
  };
  return defineDataGridModule<Row, FocusState, FocusCommand, 'focus', FocusMethods<Row>>({
    name: 'focus',
    inSnapshot: false,
    commands: ['focus.set', 'focus.move', 'focus.setMode', 'focus.setDirection'],
    methods,
    initialState(options: DataGridOptions<Row>): FocusState {
      const o = (options['focus'] ?? {}) as FocusOptions;
      if (typeof o.pageSize === 'number' && o.pageSize >= 1) pageSizeDefault = Math.floor(o.pageSize);
      headerNavigation = o.headerNavigation ?? true;
      spans = spanResolverOf(options);
      return Object.freeze({ target: null, mode: 'navigate', direction: options.direction ?? 'ltr', lastCell: null, intent: null });
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'focus.set': {
          if (!validTarget(command.target)) return ctx.reject('invalidTarget');
          const t = command.target;
          if (t === null || t.kind === 'header') return withTarget(state, t === null ? null : header(t.columnId, t.level ?? 0));
          // A cell covered by a span focuses the span's anchor.
          const anchor = spanAnchorOf(ctx, spans, t.rowId, t.columnId);
          return withTarget(state, anchor ? cell(anchor.rowId, anchor.columnId) : cell(t.rowId, t.columnId));
        }
        case 'focus.move': {
          if (!DIRECTIONS.has(command.direction)) return ctx.reject('invalidDirection');
          const size = typeof command.pageSize === 'number' && command.pageSize >= 1 ? Math.floor(command.pageSize) : pageSizeDefault;
          const next = move(state, ctx, command.direction, size, headerNavigation, spans);
          return next ? withTarget(state, next.target, next.intent) : state;
        }
        case 'focus.setMode':
          if (command.mode !== 'navigate' && command.mode !== 'edit') return ctx.reject('invalidMode');
          return command.mode === state.mode ? state : Object.freeze({ ...state, mode: command.mode });
        case 'focus.setDirection':
          if (command.direction !== 'ltr' && command.direction !== 'rtl') return ctx.reject('invalidDirection');
          return command.direction === state.direction ? state : Object.freeze({ ...state, direction: command.direction });
        default:
          return state;
      }
    },
    notify(previous, next): NotificationScope {
      if (previous.target === next.target) return {};
      const cells: { rowId: RowId; columnId: ColumnId }[] = [];
      const headers: ColumnId[] = [];
      for (const t of [previous.target, next.target]) {
        if (!t) continue;
        if (t.kind === 'cell') cells.push({ rowId: t.rowId, columnId: t.columnId });
        else headers.push(t.columnId);
      }
      return { cells, headers };
    },
  });
}
