// Tree expansion in the grid state. The
// state API (`state-api.ts`) is on the default path, so the `tree` part
// lives here and wraps it: `withTreeState` wraps the instance state methods
// (`createDataGridStateApi`) and `withTreePersistence` wraps the functions a
// storage binding is given (`DATA_GRID_PERSISTENCE_FNS`). Both are injected,
// so this file imports no state code.

import type { DataGridPersistenceFns, DataGridState, DataGridStateApi, DataGridStateOptions, RestoreResult } from './state-api.js';
import type { DataGridEngine, Json, RowId } from './types.js';

export type TreeStatePart = NonNullable<DataGridState['tree']>;

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** The raw object of a state given as JSON or as `serializeDataGridState` text, or null. */
function rawOf(input: DataGridState | string): unknown {
  if (typeof input !== 'string') return input;
  const text = input.trim();
  try {
    if (text.startsWith('{')) return JSON.parse(text);
    let buffer = 0;
    let bits = 0;
    let escaped = '';
    for (const ch of text) {
      const v = B64.indexOf(ch);
      if (v < 0) continue;
      buffer = ((buffer << 6) | v) & 0xffffff;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        escaped += '%' + ((buffer >> bits) & 255).toString(16).padStart(2, '0');
      }
    }
    return JSON.parse(decodeURIComponent(escaped));
  } catch {
    return null;
  }
}

/** The `tree` part of a raw state, validated, or null. */
export function treePartOf(raw: unknown): TreeStatePart | null {
  const tree = typeof raw === 'object' && raw !== null ? (raw as { tree?: unknown }).tree : undefined;
  if (typeof tree !== 'object' || tree === null) return null;
  const rows = (tree as { expandedRows?: unknown }).expandedRows;
  if (typeof rows !== 'object' || rows === null || Array.isArray(rows)) return null;
  const expandedRows: Record<RowId, boolean> = {};
  for (const [id, v] of Object.entries(rows)) if (typeof v === 'boolean') expandedRows[id] = v;
  const d = (tree as { defaultExpanded?: unknown }).defaultExpanded;
  return { expandedRows, defaultExpanded: typeof d === 'boolean' || (typeof d === 'number' && Number.isInteger(d) && d >= 0) ? d : true };
}

/** The tree part of an engine's state, or null without the tree module. */
export function getTreeState<Row>(engine: DataGridEngine<Row>): TreeStatePart | null {
  const s = engine.getModuleState<{ expanded: Readonly<Record<RowId, boolean>>; defaultExpanded: boolean | number }>('tree');
  return s ? { expandedRows: s.expanded, defaultExpanded: s.defaultExpanded } : null;
}

/** Restores a tree part (`tree.setExpanded`); null without the tree module. */
export function restoreTreeState<Row>(engine: DataGridEngine<Row>, part: TreeStatePart): { readonly type: string; readonly reason: string } | null {
  if (!engine.getModuleState('tree')) return null;
  const result = engine.dispatch({ type: 'tree.setExpanded', expanded: { ...part.expandedRows } as Json, defaultExpanded: part.defaultExpanded } as never);
  return result.status === 'rejected' ? { type: 'tree.setExpanded', reason: result.reason } : null;
}

const excluded = (options: DataGridStateOptions | undefined): boolean => options?.exclude?.includes('tree') === true;

function withTree(state: DataGridState, tree: TreeStatePart | null): DataGridState {
  return tree ? Object.freeze({ ...state, tree: Object.freeze({ expandedRows: Object.freeze({ ...tree.expandedRows }), defaultExpanded: tree.defaultExpanded }) }) : state;
}

function merge(result: RestoreResult, engine: DataGridEngine<unknown>, raw: unknown, options: DataGridStateOptions | undefined): RestoreResult {
  const part = excluded(options) ? null : treePartOf(raw);
  if (!part) return result;
  if (!engine.getModuleState('tree')) return Object.freeze({ ...result, status: 'partial' as const, skipped: Object.freeze([...result.skipped, 'tree' as const]) });
  const rejected = restoreTreeState(engine, part);
  return rejected ? Object.freeze({ ...result, status: 'partial' as const, rejected: Object.freeze([...result.rejected, rejected]) }) : result;
}

/** Instance state methods that include `tree.expandedRows` (wraps `createDataGridStateApi(engine)`). */
export function withTreeState<Row>(api: DataGridStateApi, engine: DataGridEngine<Row>): DataGridStateApi {
  const e = engine as DataGridEngine<unknown>;
  const getState = (options?: DataGridStateOptions): DataGridState => (excluded(options) ? api.getState(options) : withTree(api.getState(options), getTreeState(e)));
  const initialState = getState();
  const restoreState: DataGridStateApi['restoreState'] = (state, options) => merge(api.restoreState(state, options), e, rawOf(state), options);
  return Object.freeze({ initialState, getState, restoreState, resetState: () => restoreState(initialState) });
}

/** Storage binding functions that include `tree.expandedRows` (wraps `DATA_GRID_PERSISTENCE_FNS`). */
export function withTreePersistence(fns: DataGridPersistenceFns): DataGridPersistenceFns {
  return Object.freeze({
    ...fns,
    getDataGridState: ((engine, options) =>
      excluded(options) ? fns.getDataGridState(engine, options) : withTree(fns.getDataGridState(engine, options), getTreeState(engine))) as DataGridPersistenceFns['getDataGridState'],
    normalizeDataGridState: ((raw, options) => withTree(fns.normalizeDataGridState(raw, options), treePartOf(raw))) as DataGridPersistenceFns['normalizeDataGridState'],
    deserializeDataGridState: ((text, options) => withTree(fns.deserializeDataGridState(text, options), treePartOf(rawOf(text)))) as DataGridPersistenceFns['deserializeDataGridState'],
    restoreDataGridState: ((engine, input, options) => merge(fns.restoreDataGridState(engine, input, options), engine as DataGridEngine<unknown>, rawOf(input), options)) as DataGridPersistenceFns['restoreDataGridState'],
  });
}
