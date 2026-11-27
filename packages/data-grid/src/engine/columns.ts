import type { Warn } from './dev.js';
import { createValueFormatter, describeFormat, getCollator, toDate, type FormatEnvironment } from '@salmonui/core/format';
import type {
  ColumnDef,
  ColumnFlags,
  ColumnId,
  ColumnSnapshot,
  ColumnType,
  ColumnTypeSource,
  ColumnWidth,
  ColumnWidthSpec,
  CommandRejection,
  CompiledColumn,
  DataGridModule,
  NotificationScope,
  ValueContext,
} from './types.js';

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

type AnyRecord = Record<string, unknown>;

function readPath(row: unknown, parts: readonly string[]): unknown {
  let current: unknown = row;
  for (let i = 0; i < parts.length; i++) {
    if (current == null) return undefined;
    current = (current as AnyRecord)[parts[i] as string];
  }
  return current;
}

/** Builds a field accessor. Single-segment and two-segment paths get specialized closures. */
export function createFieldAccessor<Row>(field: string): (row: Row) => unknown {
  const parts = field.split('.');
  if (parts.length === 1) {
    return (row) => (row == null ? undefined : (row as AnyRecord)[field]);
  }
  if (parts.length === 2) {
    const [a, b] = parts as [string, string];
    return (row) => {
      const mid = row == null ? undefined : (row as AnyRecord)[a];
      return mid == null ? undefined : (mid as AnyRecord)[b];
    };
  }
  return (row) => readPath(row, parts);
}

/** Immutable field setter: copies each object along the path. */
export function createFieldSetter<Row>(field: string): (row: Row, value: unknown) => Row {
  const parts = field.split('.');
  const setAt = (target: unknown, depth: number, value: unknown): unknown => {
    const key = parts[depth] as string;
    const base = (target != null && typeof target === 'object' ? target : {}) as AnyRecord;
    const next = depth === parts.length - 1 ? value : setAt(base[key], depth + 1, value);
    return { ...base, [key]: next };
  };
  return (row, value) => setAt(row, 0, value) as Row;
}

// ---------------------------------------------------------------------------
// Type inference
// ---------------------------------------------------------------------------

/** Rows scanned for the first non-null value when `type` is omitted. */
export const TYPE_INFERENCE_SAMPLE = 100;

export interface InferredType {
  readonly type: ColumnType;
  readonly source: ColumnTypeSource;
}

export function inferColumnType<Row>(
  accessor: (row: Row) => unknown,
  sample: readonly Row[],
  columnId: ColumnId,
  warn: Warn,
): InferredType {
  if (sample.length === 0) return { type: 'string', source: 'pending' };
  const limit = Math.min(sample.length, TYPE_INFERENCE_SAMPLE);
  for (let i = 0; i < limit; i++) {
    const value = accessor(sample[i] as Row);
    if (value == null) continue;
    switch (typeof value) {
      case 'number':
      case 'bigint':
        return { type: 'number', source: 'inferred' };
      case 'boolean':
        return { type: 'boolean', source: 'inferred' };
      case 'string':
        return { type: 'string', source: 'inferred' };
      default:
        if (value instanceof Date) return { type: 'date', source: 'inferred' };
        warn(
          'column-type-ambiguous',
          `Column "${columnId}": cannot infer a type from a value of kind "${Object.prototype.toString.call(value)}"; using "string". Set column.type.`,
        );
        return { type: 'string', source: 'fallback' };
    }
  }
  warn(
    'column-type-ambiguous',
    `Column "${columnId}": no non-null value in the first ${limit} rows; using "string". Set column.type.`,
  );
  return { type: 'string', source: 'fallback' };
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function compareNullable(a: unknown, b: unknown): number | null {
  const an = a == null;
  const bn = b == null;
  if (an && bn) return 0;
  if (an) return -1;
  if (bn) return 1;
  return null;
}

function createComparer<Row>(type: ColumnType, env: FormatEnvironment): (a: unknown, b: unknown, rowA: Row, rowB: Row) => number {
  switch (type) {
    case 'number':
      return (a, b) => compareNullable(a, b) ?? (Number(a) - Number(b) || 0);
    case 'boolean':
    case 'selection':
      return (a, b) => compareNullable(a, b) ?? (Number(Boolean(a)) - Number(Boolean(b)));
    case 'date':
    case 'datetime':
      return (a, b) => {
        const n = compareNullable(a, b);
        if (n !== null) return n;
        const da = toDate(a)?.getTime() ?? Number.NaN;
        const db = toDate(b)?.getTime() ?? Number.NaN;
        return Number.isNaN(da) || Number.isNaN(db) ? 0 : da - db;
      };
    default:
      return (a, b) => compareNullable(a, b) ?? getCollator(env).compare(String(a), String(b));
  }
}

/** A plain decimal number after separators, currency, and percent are removed. */
const PLAIN_NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const CURRENCY = /\p{Sc}/gu;
const WHITESPACE = /\s/g;

/** Group and decimal separators of a locale (`1,234.5` in `en`, `1.234,5` in `de`). */
function numberSeparators(locale: string): { group: string; decimal: string } {
  let group = ',';
  let decimal = '.';
  try {
    for (const part of new Intl.NumberFormat(locale).formatToParts(1234567.5)) {
      if (part.type === 'group') group = part.value;
      else if (part.type === 'decimal') decimal = part.value;
    }
  } catch {
    // Unknown locale: English separators.
  }
  return { group, decimal };
}

function createNumberParser(env: FormatEnvironment): (input: unknown) => number | null {
  let lastLocale = '';
  let group = ',';
  let decimal = '.';
  return (input) => {
    if (input == null) return null;
    if (typeof input === 'number') return Number.isNaN(input) ? null : input;
    let text = String(input).trim();
    if (text === '') return null;
    const locale = env.getLocale();
    if (locale !== lastLocale) {
      lastLocale = locale;
      ({ group, decimal } = numberSeparators(locale));
    }
    // Formatted text (pasted from a copy): accounting negatives, percent,
    // grouping separators, and currency signs. Anything else is not a number.
    let sign = 1;
    if (text.length > 1 && text.startsWith('(') && text.endsWith(')')) {
      sign = -1;
      text = text.slice(1, -1).trim();
    }
    const percent = text.endsWith('%');
    if (percent) text = text.slice(0, -1);
    text = text.replace(WHITESPACE, '');
    if (group.trim() !== '') text = text.split(group).join('');
    if (decimal !== '.') text = text.split(decimal).join('.');
    text = text.replace(CURRENCY, '');
    if (!PLAIN_NUMBER.test(text)) return null;
    const n = sign * Number(text);
    return percent ? n / 100 : n;
  };
}

function createParser<Row>(type: ColumnType, env: FormatEnvironment): (input: unknown, row: Row) => unknown {
  switch (type) {
    case 'number':
      return createNumberParser(env);
    case 'boolean':
    case 'selection':
      return (input) => {
        if (typeof input === 'boolean') return input;
        if (input == null || input === '') return null;
        const s = String(input).trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes';
      };
    case 'date':
    case 'datetime':
      return (input) => (input == null || input === '' ? null : toDate(input));
    default:
      return (input) => (input == null ? null : String(input));
  }
}

const PERCENT = /^\d+(\.\d+)?%$/;

function resolveWidth<Row>(def: ColumnDef<Row>, columnId: ColumnId, warn: Warn): ColumnWidthSpec {
  let initial: ColumnWidth = def.width ?? 'auto';
  if (typeof initial === 'number' && !(initial >= 0)) {
    warn('column-width-invalid', `Column "${columnId}": width ${initial} is invalid; using "auto".`);
    initial = 'auto';
  } else if (typeof initial === 'string' && initial !== 'auto' && !PERCENT.test(initial)) {
    warn('column-width-invalid', `Column "${columnId}": width "${initial}" is invalid; using "auto".`);
    initial = 'auto';
  }
  let min = def.minWidth ?? 0;
  let max = def.maxWidth ?? Number.POSITIVE_INFINITY;
  if (!(min >= 0)) min = 0;
  if (!(max >= 0)) max = Number.POSITIVE_INFINITY;
  if (min > max) {
    warn('column-width-invalid', `Column "${columnId}": minWidth ${min} exceeds maxWidth ${max}; maxWidth is raised to minWidth.`);
    max = min;
  }
  return Object.freeze({ initial, min, max });
}

/**
 * Resolves a column width to pixels. Percent widths need the container width.
 * Returns null for `auto` (measured by the renderer) or when a percent width
 * has no container width yet.
 */
export function resolveColumnWidth(width: ColumnWidthSpec, containerWidth?: number): number | null {
  let px: number;
  if (typeof width.initial === 'number') px = width.initial;
  else if (width.initial === 'auto') return null;
  else {
    if (containerWidth === undefined || !(containerWidth >= 0)) return null;
    px = (containerWidth * Number.parseFloat(width.initial)) / 100;
  }
  return Math.min(Math.max(px, width.min), width.max);
}

function resolveFlags<Row>(def: ColumnDef<Row>, hasSetter: boolean): ColumnFlags {
  // Engine flag names are internal; they are filled from the public definition names.
  const isIdentity = def.identity ?? false;
  return Object.freeze({
    allowSorting: def.sortable ?? true,
    allowFiltering: def.filterable ?? true,
    allowSearching: def.searchable ?? true,
    allowGrouping: def.groupable ?? true,
    allowEditing: def.editable ?? (hasSetter && !isIdentity),
    allowResizing: def.resizable ?? true,
    allowReordering: def.reorderable ?? !(def.lockPosition ?? false),
    isPrimaryKey: def.primaryKey ?? false,
    isIdentity,
    lockColumn: def.lockPosition ?? false,
    displayAsCheckBox: def.displayAsCheckbox ?? false,
    showInColumnChooser: def.hideable ?? true,
  });
}

// ---------------------------------------------------------------------------
// Compilation
// ---------------------------------------------------------------------------

export interface CompileEnvironment<Row> {
  readonly format: FormatEnvironment;
  readonly warn: Warn;
  readonly sample: readonly Row[];
  /** Previous compile results keyed by definition identity, for reuse. */
  readonly previous: WeakMap<ColumnDef<Row>, CompiledColumn<Row>> | null;
  onDefCompiled(): void;
}

export interface CompiledColumns<Row> {
  readonly tree: readonly CompiledColumn<Row>[];
  readonly leaves: readonly CompiledColumn<Row>[];
  readonly byId: ReadonlyMap<ColumnId, CompiledColumn<Row>>;
  readonly headerRowCount: number;
  readonly pendingTypes: boolean;
  readonly cache: WeakMap<ColumnDef<Row>, CompiledColumn<Row>>;
}

function buildColumnBehavior<Row>(
  def: ColumnDef<Row>,
  columnId: ColumnId,
  type: ColumnType,
  env: FormatEnvironment,
  warn: Warn,
  getSelf: () => CompiledColumn<Row>,
): Pick<CompiledColumn<Row>, 'format' | 'formatter' | 'clipboardFormatter' | 'parser' | 'comparer'> {
  const format = describeFormat(def.format, type, warn, columnId);
  const valueFormatter = createValueFormatter(format, type, env);
  const ctxFor = (row: Row): ValueContext<Row> => ({ row, column: getSelf(), locale: env.getLocale() });
  const userFormat = def.valueFormatter;
  const formatter: (value: unknown, row: Row) => string = userFormat
    ? (value, row) => userFormat(value, ctxFor(row))
    : (value) => valueFormatter(value);
  const userClipboard = def.clipboardFormatter;
  const clipboardFormatter: (value: unknown, row: Row) => string = userClipboard
    ? (value, row) => userClipboard(value, ctxFor(row))
    : formatter;
  const userParse = def.valueParser;
  const parser: (input: unknown, row: Row) => unknown = userParse
    ? (input, row) => userParse(input, ctxFor(row))
    : createParser<Row>(type, env);
  const comparer = def.sortComparator ?? createComparer<Row>(type, env);
  return { format, formatter, clipboardFormatter, parser, comparer };
}

function compileOne<Row>(
  def: ColumnDef<Row>,
  columnId: ColumnId,
  path: readonly ColumnId[],
  depth: number,
  leafIndex: number,
  children: readonly ColumnId[],
  env: CompileEnvironment<Row>,
): CompiledColumn<Row> {
  env.onDefCompiled();
  const leaf = children.length === 0 && !def.columns?.length;
  const field = def.field ?? null;
  const accessor: (row: Row) => unknown = def.valueGetter ?? (field !== null ? createFieldAccessor<Row>(field) : () => undefined);
  const setter = def.valueSetter ?? (field !== null && !def.valueGetter ? createFieldSetter<Row>(field) : null);
  const inferred: InferredType = def.type
    ? { type: def.type, source: 'definition' }
    : leaf
      ? inferColumnType(accessor, env.sample, columnId, env.warn)
      : { type: 'string', source: 'definition' };
  let compiled: CompiledColumn<Row> | null = null;
  const behavior = buildColumnBehavior(def, columnId, inferred.type, env.format, env.warn, () => compiled as CompiledColumn<Row>);
  const draft: CompiledColumn<Row> = {
    columnId,
    path,
    leaf,
    depth,
    leafIndex,
    children,
    def,
    field,
    headerText: def.header ?? field ?? (def.id ?? ''),
    accessor,
    setter,
    type: inferred.type,
    typeSource: inferred.source,
    ...behavior,
    width: resolveWidth(def, columnId, env.warn),
    flags: resolveFlags(def, setter !== null),
    freeze: def.pinned === 'start' ? 'left' : def.pinned === 'end' ? 'right' : def.pinned === 'center' ? 'fixed' : null,
    moduleMeta: Object.freeze({}),
  };
  if (def.headerValueGetter) (draft as { headerText: string }).headerText = resolveHeaderText(def.headerValueGetter, draft, columnId, env.warn);
  compiled = Object.freeze(draft);
  return compiled;
}

/**
 * Runs `column.headerValueGetter` on the not yet frozen compiled
 * column. Every consumer reads the result from `CompiledColumn.headerText`.
 * A throwing getter or a non-string result keeps the default text and warns.
 */
function resolveHeaderText<Row>(
  getter: (column: CompiledColumn<Row>) => string,
  column: CompiledColumn<Row>,
  columnId: ColumnId,
  warn: Warn,
): string {
  try {
    const text: unknown = getter(column);
    if (typeof text === 'string') return text;
    if (typeof text === 'number') return String(text);
    warn('header-value-getter', `headerValueGetter of column "${columnId}" returned a non-string; using the default header text.`);
  } catch (error) {
    warn('header-value-getter', `headerValueGetter of column "${columnId}" threw (${String(error)}); using the default header text.`);
  }
  return column.headerText;
}

/** Re-resolves the type of a column whose type was pending (no rows at compile time). */
export function resolvePendingType<Row>(
  column: CompiledColumn<Row>,
  sample: readonly Row[],
  env: FormatEnvironment,
  warn: Warn,
): CompiledColumn<Row> {
  const inferred = inferColumnType(column.accessor, sample, column.columnId, warn);
  if (inferred.source === 'pending') return column;
  let compiled: CompiledColumn<Row> | null = null;
  const behavior = buildColumnBehavior(column.def, column.columnId, inferred.type, env, warn, () => compiled as CompiledColumn<Row>);
  compiled = Object.freeze({ ...column, type: inferred.type, typeSource: inferred.source, ...behavior });
  return compiled;
}

/**
 * Compiles column definitions into the header tree and leaf columns. columnId
 * resolution order: `id`, then `field`, then a deterministic generated id
 * (`__col_<path>`, development warning). Duplicate ids get a `~n` suffix and a
 * development warning. Definitions compiled before (same object identity and
 * same resolved position) are reused.
 */
export function compileColumns<Row>(defs: readonly ColumnDef<Row>[], env: CompileEnvironment<Row>): CompiledColumns<Row> {
  const tree: CompiledColumn<Row>[] = [];
  const leaves: CompiledColumn<Row>[] = [];
  const byId = new Map<ColumnId, CompiledColumn<Row>>();
  const cache = new WeakMap<ColumnDef<Row>, CompiledColumn<Row>>();
  const used = new Set<ColumnId>();
  let headerRowCount = 0;
  let pendingTypes = false;

  const resolveId = (def: ColumnDef<Row>, position: string): ColumnId => {
    let id: string;
    if (def.id !== undefined && def.id !== '') id = def.id;
    else if (def.field !== undefined && def.field !== '') id = def.field;
    else {
      id = `__col_${position}`;
      env.warn(
        'column-id-generated',
        `Column at position ${position.replace(/_/g, '.')} has neither "id" nor "field"; generated columnId "${id}". Set column.id for a stable id.`,
      );
    }
    if (used.has(id)) {
      let n = 2;
      while (used.has(`${id}~${n}`)) n++;
      env.warn('column-id-duplicate', `Duplicate columnId "${id}"; using "${id}~${n}". Set a unique column.id.`);
      id = `${id}~${n}`;
    }
    used.add(id);
    return id;
  };

  const visit = (list: readonly ColumnDef<Row>[], parentPath: readonly ColumnId[], depth: number, position: string): ColumnId[] => {
    headerRowCount = Math.max(headerRowCount, depth + 1);
    const ids: ColumnId[] = [];
    for (let i = 0; i < list.length; i++) {
      const def = list[i] as ColumnDef<Row>;
      const pos = position === '' ? String(i) : `${position}_${i}`;
      const columnId = resolveId(def, pos);
      const path = Object.freeze([...parentPath, columnId]);
      const treeIndex = tree.length;
      tree.push(null as unknown as CompiledColumn<Row>);
      const childIds = def.columns?.length ? Object.freeze(visit(def.columns, path, depth + 1, pos)) : Object.freeze([] as ColumnId[]);
      const leafIndex = childIds.length === 0 ? leaves.length : -1;
      const prior = env.previous?.get(def);
      let compiled: CompiledColumn<Row>;
      if (
        prior &&
        prior.columnId === columnId &&
        prior.depth === depth &&
        prior.leafIndex === leafIndex &&
        prior.typeSource !== 'pending' &&
        prior.path.length === path.length &&
        prior.path.every((p, k) => p === path[k]) &&
        prior.children.length === childIds.length &&
        prior.children.every((c, k) => c === childIds[k])
      ) {
        compiled = prior;
      } else {
        compiled = compileOne(def, columnId, path, depth, leafIndex, childIds, env);
      }
      if (compiled.typeSource === 'pending') pendingTypes = true;
      tree[treeIndex] = compiled;
      if (compiled.leaf) leaves.push(compiled);
      byId.set(columnId, compiled);
      cache.set(def, compiled);
      ids.push(columnId);
    }
    return ids;
  };
  visit(defs, [], 0, '');
  return {
    tree: Object.freeze(tree),
    leaves: Object.freeze(leaves),
    byId,
    headerRowCount: defs.length === 0 ? 0 : headerRowCount,
    pendingTypes,
    cache,
  };
}

// ---------------------------------------------------------------------------
// Runtime column state: the built-in `columns` module
// ---------------------------------------------------------------------------

export type ColumnKeyKind = 'columnId' | 'field' | 'headerText';

export type ColumnsShowCommand = { readonly type: 'columns.show'; readonly keys: readonly string[]; readonly by?: ColumnKeyKind };
export type ColumnsHideCommand = { readonly type: 'columns.hide'; readonly keys: readonly string[]; readonly by?: ColumnKeyKind };
export type ColumnsSetVisibilityCommand = {
  readonly type: 'columns.setVisibility';
  readonly visibility: Readonly<Record<ColumnId, boolean>>;
};
/** Sets one leaf width in px, clamped to `minWidth`/`maxWidth`. */
export type ColumnsSetWidthCommand = { readonly type: 'columns.setWidth'; readonly columnId: ColumnId; readonly width: number };
/** Merges widths (px) into the runtime widths; `replace: true` drops widths that are not listed. */
export type ColumnsSetWidthsCommand = {
  readonly type: 'columns.setWidths';
  readonly widths: Readonly<Record<ColumnId, number>>;
  readonly replace?: boolean;
};
/**
 * Moves a leaf so that its index among the visible leaves becomes `toIndex`.
 * Rejected when the move crosses a freeze zone (`crossesFreezeZone`), moves a
 * `lockColumn` column, or places a column before a locked one (`columnLocked`).
 */
export type ColumnsMoveCommand = { readonly type: 'columns.move'; readonly columnId: ColumnId; readonly toIndex: number };
/** Replaces the runtime leaf order. Unknown ids are ignored; missing leaves follow in definition order. */
export type ColumnsSetOrderCommand = { readonly type: 'columns.setOrder'; readonly order: readonly ColumnId[] };
/**
 * Pins (`'left'`, `'right'`) or unpins (`null`) a leaf at runtime.
 * The column moves to the inner edge of its new zone: the end of the left
 * zone, the start of the right zone, or the matching edge of the center.
 */
export type ColumnsSetFreezeCommand = { readonly type: 'columns.setFreeze'; readonly columnId: ColumnId; readonly freeze: ColumnFreeze | null };
/** Frozen column count shorthand: the first `left` / last `right` visible leaves are frozen. */
export type ColumnsSetFrozenCountCommand = { readonly type: 'columns.setFrozenCount'; readonly left?: number; readonly right?: number };
/**
 * Replaces the runtime pin state as a whole (freeze overrides and counts)
 * without moving columns; state restore uses it. Unknown ids are
 * dropped.
 */
export type ColumnsSetPinningCommand = {
  readonly type: 'columns.setPinning';
  readonly freeze: Readonly<Record<ColumnId, ColumnFreeze | null>>;
  readonly frozenCount: { readonly left?: number; readonly right?: number };
};
export type ColumnsCommand =
  | ColumnsSetPinningCommand
  | ColumnsShowCommand
  | ColumnsHideCommand
  | ColumnsSetVisibilityCommand
  | ColumnsSetWidthCommand
  | ColumnsSetWidthsCommand
  | ColumnsMoveCommand
  | ColumnsSetOrderCommand
  | ColumnsSetFreezeCommand
  | ColumnsSetFrozenCountCommand;

/** `fixed` keeps the leaf in the `center` zone, sticky at its scroll-start position. */
export type ColumnFreeze = 'left' | 'right' | 'fixed';
export type ColumnZone = 'left' | 'center' | 'right';

export interface ColumnsState {
  /** Runtime visibility overrides keyed by columnId; absent ids use `!column.def.hidden`. */
  readonly visibility: Readonly<Record<ColumnId, boolean>>;
  /** Runtime widths in px keyed by columnId (resize, autofit, restore); absent ids use `column.width`. */
  readonly widths: Readonly<Record<ColumnId, number>>;
  /** Runtime leaf order; null keeps definition order. */
  readonly order: readonly ColumnId[] | null;
  /** Runtime freeze overrides keyed by columnId (`null`: unfrozen); absent ids use `column.freeze`. */
  readonly freeze: Readonly<Record<ColumnId, ColumnFreeze | null>>;
  /** Frozen column counts: the first `left` and last `right` visible leaves are frozen. */
  readonly frozenCount: { readonly left: number; readonly right: number };
}

const NO_COUNT: { readonly left: number; readonly right: number } = Object.freeze({ left: 0, right: 0 });
const NO_FIXED: readonly never[] = Object.freeze([]);

function toFreeze(f: unknown): ColumnFreeze | null {
  return f === 'left' || f === 'right' || f === 'fixed' ? f : null;
}

/** Whether a leaf is in the fixed zone by its definition and the runtime overrides. */
function isFixed<Row>(column: CompiledColumn<Row>, state: Pick<ColumnsState, 'freeze'>): boolean {
  const override = state.freeze?.[column.columnId];
  return (override !== undefined ? override : column.freeze) === 'fixed';
}

export function isColumnVisible<Row>(column: CompiledColumn<Row>, state: ColumnsState): boolean {
  const override = state.visibility[column.columnId];
  return override ?? !(column.def.hidden ?? false);
}

/** Resolves column keys (by id, field, or header text) to leaf column ids. */
export function resolveColumnKeys<Row>(
  columns: ColumnSnapshot<Row>,
  keys: readonly string[],
  by: ColumnKeyKind,
): { ids: ColumnId[]; missing: string[] } {
  const ids: ColumnId[] = [];
  const missing: string[] = [];
  for (const key of keys) {
    let found = false;
    if (by === 'columnId') {
      const col = columns.byId.get(key);
      if (col?.leaf) {
        ids.push(col.columnId);
        found = true;
      }
    } else {
      for (const col of columns.leaves) {
        if ((by === 'field' ? col.field : col.headerText) === key) {
          ids.push(col.columnId);
          found = true;
        }
      }
    }
    if (!found) missing.push(key);
  }
  return { ids, missing };
}

const EMPTY_VISIBILITY: Readonly<Record<ColumnId, boolean>> = Object.freeze({});
const EMPTY_WIDTHS: Readonly<Record<ColumnId, number>> = Object.freeze({});

function withState(state: ColumnsState, patch: Partial<ColumnsState>): ColumnsState {
  return Object.freeze({ ...state, ...patch });
}

function applyVisibility<Row>(
  state: ColumnsState,
  changes: Iterable<readonly [ColumnId, boolean]>,
  columns: ColumnSnapshot<Row>,
): ColumnsState {
  let next: Record<ColumnId, boolean> | null = null;
  for (const [id, visible] of changes) {
    const col = columns.byId.get(id);
    if (!col) continue;
    if (isColumnVisible(col, next ? { ...state, visibility: next } : state) === visible) continue;
    next ??= { ...state.visibility };
    next[id] = visible;
  }
  return next ? withState(state, { visibility: Object.freeze(next) }) : state;
}

/** Clamps a px width to the column's `minWidth`/`maxWidth` (and at least 1px). */
export function clampColumnWidth<Row>(column: CompiledColumn<Row>, width: number): number {
  return Math.min(Math.max(Math.round(width), column.width.min, 1), column.width.max);
}

function applyWidths<Row>(
  state: ColumnsState,
  widths: Readonly<Record<ColumnId, number>>,
  replace: boolean,
  columns: ColumnSnapshot<Row>,
  warn: (code: string, message: string) => void,
): ColumnsState {
  const next: Record<ColumnId, number> = replace ? {} : { ...state.widths };
  for (const [id, width] of Object.entries(widths)) {
    const col = columns.byId.get(id);
    if (!col?.leaf) {
      warn('column-unknown', `columns.setWidths: unknown column id "${id}".`);
      continue;
    }
    if (typeof width !== 'number' || !Number.isFinite(width)) {
      warn('column-width-invalid', `columns.setWidths: the width of "${id}" must be a finite number of px.`);
      continue;
    }
    next[id] = clampColumnWidth(col, width);
  }
  const prevKeys = Object.keys(state.widths);
  const nextKeys = Object.keys(next);
  if (prevKeys.length === nextKeys.length && nextKeys.every((k) => state.widths[k] === next[k])) return state;
  return withState(state, { widths: Object.freeze(next) });
}

/** Leaves in runtime order: the explicit order first, then the remaining leaves in definition order. */
export function orderLeaves<Row>(leaves: readonly CompiledColumn<Row>[], order: readonly ColumnId[] | null): CompiledColumn<Row>[] {
  if (order === null) return [...leaves];
  const byId = new Map(leaves.map((c) => [c.columnId, c] as const));
  const out: CompiledColumn<Row>[] = [];
  const placed = new Set<ColumnId>();
  for (const id of order) {
    const col = byId.get(id);
    if (col && !placed.has(id)) {
      out.push(col);
      placed.add(id);
    }
  }
  for (const col of leaves) if (!placed.has(col.columnId)) out.push(col);
  return out;
}

/** Freeze zone of a column from its definition and the runtime overrides (count shorthand excluded). */
export function declaredZone<Row>(column: CompiledColumn<Row>, state: Pick<ColumnsState, 'freeze'>): ColumnZone {
  const override = state.freeze?.[column.columnId];
  const freeze = override !== undefined ? override : column.freeze;
  return freeze === 'left' || freeze === 'right' ? freeze : 'center';
}

/** Current freeze zone of a visible leaf in a column snapshot (`center` for unknown or hidden ids). */
export function columnZone<Row>(columns: ColumnSnapshot<Row>, columnId: ColumnId): ColumnZone {
  return columns.zones?.get(columnId) ?? 'center';
}

/**
 * Whether every stacked-header group keeps its visible leaves contiguous
 * within each freeze zone (leaves reorder within their parent; a
 * group split by a freeze edge is checked per zone).
 */
function groupsContiguous<Row>(visible: readonly CompiledColumn<Row>[], zoneOfLeaf: (c: CompiledColumn<Row>) => ColumnZone): boolean {
  const last = new Map<string, number>();
  for (let i = 0; i < visible.length; i++) {
    const col = visible[i] as CompiledColumn<Row>;
    const zone = zoneOfLeaf(col);
    for (let d = 0; d < col.path.length - 1; d++) {
      const key = `${zone}\u0000${col.path[d] as string}`;
      const prev = last.get(key);
      if (prev !== undefined && prev !== i - 1) return false;
      last.set(key, i);
    }
  }
  return true;
}

function moveColumn<Row>(
  state: ColumnsState,
  command: ColumnsMoveCommand,
  columns: ColumnSnapshot<Row>,
  reject: (reason: string) => CommandRejection,
): ColumnsState | CommandRejection {
  const column = columns.byId.get(command.columnId);
  if (!column?.leaf) return reject('unknownColumn');
  const visible = columns.visible;
  const from = visible.indexOf(column);
  if (from < 0) return reject('columnHidden');
  if (!Number.isInteger(command.toIndex) || command.toIndex < 0 || command.toIndex >= visible.length) return reject('indexOutOfRange');
  if (command.toIndex === from) return state;
  if (column.flags.lockColumn) return reject('columnLocked');
  const target = visible[command.toIndex] as CompiledColumn<Row>;
  const zoneOf = (c: CompiledColumn<Row>): ColumnZone => columnZone(columns, c.columnId);
  if (zoneOf(target) !== zoneOf(column)) return reject('crossesFreezeZone');
  const moved = visible.filter((c) => c !== column);
  moved.splice(command.toIndex, 0, column);
  if (columns.headerRowCount > 1 && !groupsContiguous(moved, zoneOf)) return reject('crossesColumnGroup');
  // A locked column stays ahead of every unlocked column of its zone.
  const zone = zoneOf(column);
  let seenUnlocked = false;
  for (const c of moved) {
    if (zoneOf(c) !== zone) continue;
    if (!c.flags.lockColumn) seenUnlocked = true;
    else if (seenUnlocked) return reject('columnLocked');
  }
  // Hidden leaves keep their slots in the full runtime order.
  const visibleSet = new Set<CompiledColumn<Row>>(visible);
  let v = 0;
  const order = orderLeaves(columns.leaves, state.order).map((c) => (visibleSet.has(c) ? (moved[v++] as CompiledColumn<Row>) : c).columnId);
  return withState(state, { order: Object.freeze(order) });
}

function setFreeze<Row>(
  state: ColumnsState,
  command: ColumnsSetFreezeCommand,
  columns: ColumnSnapshot<Row>,
  reject: (reason: string) => CommandRejection,
): ColumnsState | CommandRejection {
  const column = columns.byId.get(command.columnId);
  if (!column?.leaf) return reject('unknownColumn');
  const want = toFreeze(command.freeze);
  const wantZone: ColumnZone = want === 'left' || want === 'right' ? want : 'center';
  const zoneAt = (c: CompiledColumn<Row>): ColumnZone => columns.zones?.get(c.columnId) ?? declaredZone(c, state);
  const current = zoneAt(column);
  const fixedNow = current === 'center' && isFixed(column, state);
  if (current === wantZone && declaredZone(column, state) === wantZone && fixedNow === (want === 'fixed')) return state;
  // Between the scrolling center and the fixed zone the column keeps its slot.
  if (current === 'center' && wantZone === 'center') return withState(state, { freeze: Object.freeze({ ...state.freeze, [column.columnId]: want }) });
  // The count shorthand shrinks by one so it no longer counts the column; the
  // other counted columns keep their zone (the column leaves the counted run
  // below). Positions are in the runtime order of visible leaves, the index
  // space buildColumnSnapshot applies the count to.
  let frozenCount = state.frozenCount;
  const ordered = orderLeaves(columns.leaves, state.order).filter((c) => isColumnVisible(c, state));
  const pos = state.freeze[column.columnId] === undefined ? ordered.indexOf(column) : -1;
  if (pos >= 0 && pos < Math.min(frozenCount.left, ordered.length)) frozenCount = Object.freeze({ ...frozenCount, left: frozenCount.left - 1 });
  else if (pos >= 0 && frozenCount.right > 0 && pos >= Math.max(frozenCount.left, ordered.length - frozenCount.right)) frozenCount = Object.freeze({ ...frozenCount, right: frozenCount.right - 1 });
  const freeze = Object.freeze({ ...state.freeze, [column.columnId]: want });
  // Move to the inner edge of the new zone, in the full runtime order.
  const order = orderLeaves(columns.leaves, state.order).filter((c) => c !== column);
  let at: number;
  if (wantZone === 'left' || (wantZone === 'center' && current === 'left')) {
    at = 0; // after the last left-zone leaf
    for (let i = 0; i < order.length; i++) if (zoneAt(order[i] as CompiledColumn<Row>) === 'left') at = i + 1;
  } else {
    at = order.length; // before the first right-zone leaf
    for (let i = order.length - 1; i >= 0; i--) if (zoneAt(order[i] as CompiledColumn<Row>) === 'right') at = i;
  }
  order.splice(at, 0, column);
  return withState(state, { freeze, frozenCount, order: Object.freeze(order.map((c) => c.columnId)) });
}

function sameOrder(a: readonly ColumnId[], b: readonly ColumnId[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}


/** Initial runtime column state (`DataGridOptions.initialColumnState`); applied before the server snapshot. */
export interface ColumnsStateInit {
  readonly visibility?: Readonly<Record<ColumnId, boolean>>;
  readonly widths?: Readonly<Record<ColumnId, number>>;
  readonly order?: readonly ColumnId[] | null;
  /** Runtime freeze overrides (`null` unfreezes a column that declares `pinned`). */
  readonly freeze?: Readonly<Record<ColumnId, ColumnFreeze | null>>;
  /** Frozen column counts. */
  readonly frozenCount?: { readonly left?: number; readonly right?: number };
}

const EMPTY_FREEZE: Readonly<Record<ColumnId, ColumnFreeze | null>> = Object.freeze({});

function toCount(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function initialColumnsState(init: ColumnsStateInit | undefined): ColumnsState {
  if (!init) return Object.freeze({ visibility: EMPTY_VISIBILITY, widths: EMPTY_WIDTHS, order: null, freeze: EMPTY_FREEZE, frozenCount: NO_COUNT });
  const visibility: Record<ColumnId, boolean> = {};
  for (const [id, v] of Object.entries(init.visibility ?? {})) if (typeof v === 'boolean') visibility[id] = v;
  const widths: Record<ColumnId, number> = {};
  for (const [id, w] of Object.entries(init.widths ?? {})) if (typeof w === 'number' && Number.isFinite(w) && w > 0) widths[id] = Math.round(w);
  const freeze: Record<ColumnId, ColumnFreeze | null> = {};
  for (const [id, f] of Object.entries(init.freeze ?? {})) freeze[id] = toFreeze(f);
  const left = toCount(init.frozenCount?.left);
  const right = toCount(init.frozenCount?.right);
  return Object.freeze({
    visibility: Object.freeze(visibility),
    widths: Object.freeze(widths),
    order: init.order ? Object.freeze([...init.order]) : null,
    freeze: Object.keys(freeze).length ? Object.freeze(freeze) : EMPTY_FREEZE,
    frozenCount: left || right ? Object.freeze({ left, right }) : NO_COUNT,
  });
}

interface ReduceContext {
  warn(code: string, message: string): void;
  reject(reason: string): CommandRejection;
}

function reduceColumns<Row>(state: ColumnsState, command: ColumnsCommand, columns: ColumnSnapshot<Row>, ctx: ReduceContext): ColumnsState | CommandRejection {
  switch (command.type) {
    case 'columns.setVisibility': {
      const entries = Object.entries(command.visibility);
      const unknown = entries.filter(([id]) => !columns.byId.get(id)?.leaf).map(([id]) => id);
      if (unknown.length) ctx.warn('column-unknown', `columns.setVisibility: unknown column ids ${unknown.join(', ')}.`);
      return applyVisibility(state, entries, columns);
    }
    case 'columns.setWidth':
      if (!columns.byId.get(command.columnId)?.leaf) return ctx.reject('unknownColumn');
      return applyWidths(state, { [command.columnId]: command.width }, false, columns, ctx.warn);
    case 'columns.setWidths':
      return applyWidths(state, command.widths, command.replace === true, columns, ctx.warn);
    case 'columns.move':
      return moveColumn(state, command, columns, ctx.reject);
    case 'columns.setFreeze':
      return setFreeze(state, command, columns, ctx.reject);
    case 'columns.setPinning': {
      const freeze: Record<ColumnId, ColumnFreeze | null> = {};
      for (const [id, f] of Object.entries(command.freeze ?? {})) if (columns.byId.get(id)?.leaf) freeze[id] = toFreeze(f);
      const left = toCount(command.frozenCount?.left);
      const right = toCount(command.frozenCount?.right);
      const sameFreeze = Object.keys(freeze).length === Object.keys(state.freeze).length && Object.entries(freeze).every(([id, f]) => state.freeze[id] === f);
      if (sameFreeze && left === state.frozenCount.left && right === state.frozenCount.right) return state;
      return withState(state, {
        freeze: sameFreeze ? state.freeze : Object.keys(freeze).length ? Object.freeze(freeze) : EMPTY_FREEZE,
        frozenCount: left === state.frozenCount.left && right === state.frozenCount.right ? state.frozenCount : left || right ? Object.freeze({ left, right }) : NO_COUNT,
      });
    }
    case 'columns.setFrozenCount': {
      const left = command.left === undefined ? state.frozenCount.left : toCount(command.left);
      const right = command.right === undefined ? state.frozenCount.right : toCount(command.right);
      if (left === state.frozenCount.left && right === state.frozenCount.right) return state;
      return withState(state, { frozenCount: Object.freeze({ left, right }) });
    }
    case 'columns.setOrder': {
      const order = orderLeaves(columns.leaves, command.order).map((c) => c.columnId);
      const current = orderLeaves(columns.leaves, state.order).map((c) => c.columnId);
      return sameOrder(current, order) ? state : withState(state, { order: Object.freeze(order) });
    }
    default: {
      const { ids, missing } = resolveColumnKeys(columns, command.keys, command.by ?? 'columnId');
      if (missing.length) ctx.warn('column-unknown', `${command.type}: no column matches ${missing.map((k) => `"${k}"`).join(', ')}.`);
      if (ids.length === 0) return ctx.reject('noMatchingColumns');
      const visible = command.type === 'columns.show';
      return applyVisibility(state, ids.map((id) => [id, visible] as const), columns);
    }
  }
}

const PREVIEW_CONTEXT: ReduceContext = {
  warn: () => {},
  reject: (reason) => ({ rejected: true, reason }),
};

/**
 * Pure dry run of a `columns.*` command: the state it would produce, or null
 * when it would be rejected. Renderers use it to report proposed values
 * before the engine commits (controlled `columnVisibility` and friends).
 */
export function previewColumnsCommand<Row>(columns: ColumnSnapshot<Row>, state: ColumnsState, command: ColumnsCommand): ColumnsState | null {
  const next = reduceColumns(state, command, columns, PREVIEW_CONTEXT);
  return 'rejected' in next ? null : next;
}

/** @internal The always-registered `columns` module (runtime visibility, widths, order). */
export function createColumnsModule<Row>(): DataGridModule<Row, ColumnsState, ColumnsCommand, 'columns'> {
  return {
    name: 'columns',
    commands: [
      'columns.show',
      'columns.hide',
      'columns.setVisibility',
      'columns.setWidth',
      'columns.setWidths',
      'columns.move',
      'columns.setOrder',
      'columns.setFreeze',
      'columns.setFrozenCount',
      'columns.setPinning',
    ],
    initialState: (options) => initialColumnsState(options.initialColumnState),
    reduce: (state, command, ctx) => reduceColumns(state, command, ctx.getColumns(), ctx),
    notify(previous, next, ctx): NotificationScope {
      const headers: ColumnId[] = [];
      for (const col of ctx.getColumns().leaves) {
        const id = col.columnId;
        if (
          isColumnVisible(col, previous) !== isColumnVisible(col, next) ||
          previous.widths[id] !== next.widths[id] ||
          previous.freeze[id] !== next.freeze[id]
        )
          headers.push(id);
      }
      return { grid: true, headers };
    },
  };
}

/**
 * Builds the column snapshot: visible leaves in runtime order, partitioned by
 * freeze zone, with `lockColumn` columns first in their zone.
 */
export function buildColumnSnapshot<Row>(compiled: Pick<CompiledColumns<Row>, 'tree' | 'leaves' | 'byId' | 'headerRowCount'>, state: ColumnsState): ColumnSnapshot<Row> {
  const left: CompiledColumn<Row>[] = [];
  const center: CompiledColumn<Row>[] = [];
  const right: CompiledColumn<Row>[] = [];
  const ordered = orderLeaves(compiled.leaves, state.order).filter((col) => isColumnVisible(col, state));
  const counts = state.frozenCount ?? NO_COUNT;
  const leftCount = Math.min(counts.left, ordered.length);
  const rightStart = Math.max(leftCount, ordered.length - counts.right);
  for (let i = 0; i < ordered.length; i++) {
    const col = ordered[i] as CompiledColumn<Row>;
    // An explicit runtime override wins over the count shorthand.
    const explicit = state.freeze?.[col.columnId] !== undefined;
    const zone = !explicit && i < leftCount ? 'left' : !explicit && i >= rightStart ? 'right' : declaredZone(col, state);
    if (zone === 'left') left.push(col);
    else if (zone === 'right') right.push(col);
    else center.push(col);
  }
  for (const zone of [left, center, right]) {
    if (zone.some((c) => c.flags.lockColumn)) {
      const locked = zone.filter((c) => c.flags.lockColumn);
      const rest = zone.filter((c) => !c.flags.lockColumn);
      zone.splice(0, zone.length, ...locked, ...rest);
    }
  }
  const fixed = center.some((c) => isFixed(c, state)) ? Object.freeze(center.filter((c) => isFixed(c, state))) : NO_FIXED;
  const zones = new Map<ColumnId, ColumnZone>();
  for (const c of left) zones.set(c.columnId, 'left');
  for (const c of center) zones.set(c.columnId, 'center');
  for (const c of right) zones.set(c.columnId, 'right');
  return Object.freeze({
    tree: compiled.tree,
    leaves: compiled.leaves,
    zones,
    visible: Object.freeze([...left, ...center, ...right]),
    left: Object.freeze(left),
    center: Object.freeze(center),
    right: Object.freeze(right),
    fixed,
    byId: compiled.byId,
    headerRowCount: compiled.headerRowCount,
  });
}
