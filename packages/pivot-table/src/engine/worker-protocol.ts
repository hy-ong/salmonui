// Worker hosting of the pivot engine: the
// message protocol and the structural Worker types. Only results for a
// window (rows, columns) and header nodes cross the boundary; raw rows are
// sent once, in chunks, so no single structured clone blocks the main thread.
import type { PivotCell, PivotHeaderNode, PivotModel, PivotResult } from './types.js';
import type { PivotModelError } from './engine.js';

/** What `createPivotWorkerEngine` needs of a `Worker` (a DOM `Worker` or an adapter over `node:worker_threads`). */
export interface WorkerLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  removeEventListener?(type: 'message', listener: (event: { readonly data: unknown }) => void): void;
  terminate?(): void;
}

/** The worker side: a `DedicatedWorkerGlobalScope` or an adapter over `parentPort`. */
export type WorkerScopeLike = WorkerLike;

/** Result metadata without cells (what every state-changing call resolves to). */
export interface PivotSummary {
  readonly version: number;
  readonly model: PivotModel;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowDepth: number;
  readonly columnDepth: number;
  readonly errors: readonly PivotModelError[];
}

export interface PivotWindowRequest {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly columnStart: number;
  readonly columnEnd: number;
}

/** One window of a result: leaf headers per position, every header overlapping it, and the cells row-major. */
export interface PivotWindow extends PivotSummary {
  readonly request: PivotWindowRequest;
  /** Leaf header of each row / column position in the window. */
  readonly rows: readonly PivotHeaderNode[];
  readonly columns: readonly PivotHeaderNode[];
  /** Every header node (any depth, without `children`) whose span overlaps the window. */
  readonly rowHeaders: readonly PivotHeaderNode[];
  readonly columnHeaders: readonly PivotHeaderNode[];
  /** `(rowEnd - rowStart) * (columnEnd - columnStart)` cells, row-major. */
  readonly cells: readonly PivotCell[];
}

export type PivotWorkerRequest =
  | { readonly id: number; readonly op: 'chunk'; readonly rows: readonly unknown[] }
  | { readonly id: number; readonly op: 'init'; readonly options: Record<string, unknown> }
  | { readonly id: number; readonly op: 'data' }
  | { readonly id: number; readonly op: 'call'; readonly method: string; readonly args: readonly unknown[] }
  | { readonly id: number; readonly op: 'window'; readonly request: PivotWindowRequest }
  | { readonly id: number; readonly op: 'fields' }
  | { readonly id: number; readonly op: 'members'; readonly field: string; readonly options?: { readonly search?: string; readonly limit?: number } }
  | { readonly id: number; readonly op: 'drill'; readonly rowIndex: number; readonly columnIndex: number }
  | { readonly id: number; readonly op: 'rows'; readonly indexes: readonly number[] };

export type PivotWorkerResponse =
  | { readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly id: number; readonly ok: false; readonly error: { readonly name: string; readonly message: string; readonly position?: number } };

export const summaryOf = (r: PivotResult): PivotSummary => ({
  version: r.version,
  model: r.model,
  rowCount: r.rowCount,
  columnCount: r.columnCount,
  rowDepth: r.rowDepth,
  columnDepth: r.columnDepth,
  errors: (r as PivotResult & { errors?: readonly PivotModelError[] }).errors ?? [],
});

/** A header node without `children` (plain JSON, never materializes the subtree). */
export const plainHeader = (h: PivotHeaderNode): PivotHeaderNode => ({
  key: h.key,
  axis: h.axis,
  kind: h.kind,
  path: h.path,
  field: h.field,
  measure: h.measure,
  label: h.label,
  depth: h.depth,
  position: h.position,
  span: h.span,
  expandable: h.expandable,
  expanded: h.expanded,
});

/** Header nodes (any depth) whose span overlaps `[start, end)`, outer levels first per branch. */
export function headersIn(roots: readonly PivotHeaderNode[], start: number, end: number): PivotHeaderNode[] {
  const out: PivotHeaderNode[] = [];
  const visit = (list: readonly PivotHeaderNode[]) => {
    for (const h of list) {
      if (h.position >= end || h.position + h.span <= start) continue;
      out.push(plainHeader(h));
      if (h.children) visit(h.children);
    }
  };
  visit(roots);
  return out;
}

/** Computes one window of a result (used by the worker and by in-process hosts). */
export function windowOf(r: PivotResult, request: PivotWindowRequest): PivotWindow {
  const rs = Math.max(0, Math.min(request.rowStart, r.rowCount));
  const re = Math.max(rs, Math.min(request.rowEnd, r.rowCount));
  const cs = Math.max(0, Math.min(request.columnStart, r.columnCount));
  const ce = Math.max(cs, Math.min(request.columnEnd, r.columnCount));
  const rows: PivotHeaderNode[] = [];
  const columns: PivotHeaderNode[] = [];
  const cells: PivotCell[] = [];
  for (let i = rs; i < re; i++) rows.push(plainHeader(r.memberAt('rows', i)));
  for (let c = cs; c < ce; c++) columns.push(plainHeader(r.memberAt('columns', c)));
  for (let i = rs; i < re; i++) for (let c = cs; c < ce; c++) cells.push(r.cellAt(i, c));
  return {
    ...summaryOf(r),
    request: { rowStart: rs, rowEnd: re, columnStart: cs, columnEnd: ce },
    rows,
    columns,
    rowHeaders: headersIn(r.rowTree, rs, re),
    columnHeaders: headersIn(r.columnTree, cs, ce),
    cells,
  };
}
