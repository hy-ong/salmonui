// Result → Data Grid renderer mapping. The pivot result is rendered by the Data Grid with lightweight row
// stubs (`{ id, i, v }`: the row key, the visible row index and the shared
// view) and compiled columns built from the column header tree, whose
// `valueGetter` reads `result.valueAt(row, column)`. No rows × columns cell
// objects are allocated: the grid virtualizes rows and columns and asks only
// for the rendered cells.

import type { PivotCell, PivotConditionalFormat, PivotHeaderNode, PivotModel, PivotResult } from '@salmonui/pivot-table/engine';

/** Shared per result: the result, column positions by column id, and lazy lookups. */
export interface PivotView {
  readonly result: PivotResult;
  /** Leaf column position by Data Grid column id. */
  readonly columnIndex: ReadonlyMap<string, number>;
  /** Data Grid column id by leaf position. */
  readonly columnIds: readonly string[];
  /** Row index by row id. */
  readonly rowIndex: ReadonlyMap<string, number>;
  /** Label of a row member by path prefix key (lazy cache). */
  readonly labels: Map<string, string>;
}

/** A Data Grid row: the row key (`id`), the visible row index (`i`) and the view (`v`). */
export interface PivotRowStub {
  readonly id: string;
  readonly i: number;
  readonly v: PivotView;
}

/** Column id of the compact row header column. */
export const ROW_HEADER_ID = 'pivot-row-header';
/** Column id prefix of the tabular row field columns (`pivot-row-0`, ...). */
export const ROW_FIELD_PREFIX = 'pivot-row-';
const GRAND_ROW_ID = 'pivot-grand-total';

/**
 * A Data Grid column id for a header key: every character outside
 * `[A-Za-z0-9-]` becomes `_<hex>_`, so the mapping is injective and the id is
 * safe in attributes and selectors.
 */
export function safeId(key: string, prefix = 'c'): string {
  let out = prefix;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    out += (ch >= 48 && ch <= 57) || (ch >= 65 && ch <= 90) || (ch >= 97 && ch <= 122) || ch === 45 ? key[i] : `_${ch.toString(16)}_`;
  }
  return out;
}

/** Row id of a row header key (the grand total key is `''`). */
export const rowIdOf = (key: string): string => (key === '' ? GRAND_ROW_ID : `r${key}`);

/** Builds the view and the row stubs of a result (O(visible rows + leaf columns)). */
export function buildView(result: PivotResult): { view: PivotView; rows: PivotRowStub[] } {
  const columnIndex = new Map<string, number>();
  const columnIds: string[] = [];
  for (let c = 0; c < result.columnCount; c++) {
    const id = safeId(result.memberAt('columns', c).key);
    const unique = columnIndex.has(id) ? `${id}-${c}` : id;
    columnIndex.set(unique, c);
    columnIds.push(unique);
  }
  const rowIndex = new Map<string, number>();
  const view: PivotView = { result, columnIndex, columnIds, rowIndex, labels: new Map() };
  const rows: PivotRowStub[] = new Array(result.rowCount);
  // Window-backed results (Worker engine) have placeholder headers until a block loads: index ids stay stable.
  const windowed = typeof (result as { isLoaded?: unknown }).isLoaded === 'function';
  for (let r = 0; r < result.rowCount; r++) {
    let id = windowed ? `i${r}` : rowIdOf(result.memberAt('rows', r).key);
    if (rowIndex.has(id)) id = `${id}#${r}`;
    rowIndex.set(id, r);
    rows[r] = { id, i: r, v: view };
  }
  return { view, rows };
}

/** Structural signature of the column tree: the columns are rebuilt only when it changes. */
export function columnSignature(result: PivotResult): string {
  let out = '';
  const visit = (nodes: readonly PivotHeaderNode[]): void => {
    for (const node of nodes) {
      out += `${node.key}\u0001${node.label}\u0001${node.kind}\u0001${node.expandable ? (node.expanded ? 2 : 1) : 0}`;
      if (node.children?.length) {
        out += '[';
        visit(node.children);
        out += ']';
      }
      out += '\u0002';
    }
  };
  visit(result.columnTree);
  return out;
}

/** Label of the row member at `level` of `path` (an ancestor of a visible row), walking the row tree once per prefix. */
export function memberLabel(view: PivotView, path: readonly unknown[], level: number): string {
  const key = JSON.stringify(path.slice(0, level + 1));
  const cached = view.labels.get(key) ?? (view.result as { labelOf?: (key: string) => string | undefined }).labelOf?.(key);
  if (cached !== undefined) return cached;
  let nodes: readonly PivotHeaderNode[] = view.result.rowTree;
  let label = String(path[level] ?? '');
  for (let l = 0; l <= level; l++) {
    const want = JSON.stringify(path[l]);
    const node = nodes.find((n) => n.kind !== 'grandTotal' && n.path.length === l + 1 && JSON.stringify(n.path[l]) === want);
    if (!node) break;
    if (l === level) label = node.label;
    nodes = node.children ?? [];
  }
  view.labels.set(key, label);
  return label;
}

/** Whether the visible row `r` starts a new block of the member at `level` (tabular label repeat). */
export function startsBlock(view: PivotView, r: number, level: number): boolean {
  if (r === 0) return true;
  const a = view.result.memberAt('rows', r).path;
  const b = view.result.memberAt('rows', r - 1).path;
  for (let l = 0; l <= level; l++) if (JSON.stringify(a[l]) !== JSON.stringify(b[l])) return true;
  return a.length <= level || b.length <= level;
}

/** Tests a conditional format rule against a value. */
export function matchesRule(rule: PivotConditionalFormat, value: number | null): boolean {
  if (value === null || Number.isNaN(value)) return false;
  const a = rule.value;
  const b = rule.value2 ?? rule.value;
  switch (rule.operator) {
    case 'equal':
      return value === a;
    case 'notEqual':
      return value !== a;
    case 'greaterThan':
      return value > a;
    case 'greaterThanOrEqual':
      return value >= a;
    case 'lessThan':
      return value < a;
    case 'lessThanOrEqual':
      return value <= a;
    case 'between':
      return value >= Math.min(a, b) && value <= Math.max(a, b);
    case 'notBetween':
      return value < Math.min(a, b) || value > Math.max(a, b);
    default:
      return false;
  }
}

/** Class names and inline style from the conditional formats that match a cell (first match per property wins). */
export function conditionalStyle(model: PivotModel, cell: PivotCell): { className: string | undefined; style: Record<string, string> | undefined } {
  let className: string | undefined;
  let style: Record<string, string> | undefined;
  for (const rule of model.conditionalFormats) {
    // A rule names a measure id (`field`, or `field#aggregate` when a field is summarized twice) or the plain field.
    if (rule.measure && rule.measure !== cell.measure && !cell.measure?.startsWith(`${rule.measure}#`)) continue;
    if (rule.applyGrandTotals === false && cell.kind === 'grandTotal') continue;
    if (!matchesRule(rule, cell.value)) continue;
    const classes = [rule.tone ? `salmon-pivot-table-tone-${rule.tone}` : '', rule.className ?? ''].filter(Boolean).join(' ');
    if (classes) className = className ? `${className} ${classes}` : classes;
    if (rule.style) style = { ...rule.style, ...style };
  }
  return { className, style };
}

/** Drops `undefined` fields (props forwarded under `exactOptionalPropertyTypes`). */
export function defined<T extends object>(value: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as { [K in keyof T]: Exclude<T[K], undefined> };
}
