// Window-backed result of an asynchronous engine (the Worker host,
// `createPivotWorkerEngine`): only the windows
// the table renders cross the worker boundary. The adapter keeps loaded
// blocks (rows × columns) and exposes a `PivotResult` over them: positions
// outside a loaded block read as placeholders (empty cells, blank headers)
// until `ensure()` loads them. `ensure()` is driven by the rendered range
// (an effect on scroll), never by render.

import type { PivotCell, PivotComputeStatus, PivotFieldInfo, PivotHeaderNode, PivotMember, PivotMemberPath, PivotModel, PivotModelInput, PivotResult } from '@salmonui/pivot-table/engine';

interface Summary {
  readonly version: number;
  readonly model: PivotModel;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowDepth: number;
  readonly columnDepth: number;
}

interface WindowRequest {
  readonly rowStart: number;
  readonly rowEnd: number;
  readonly columnStart: number;
  readonly columnEnd: number;
}

interface Window extends Summary {
  readonly request: WindowRequest;
  readonly rows: readonly PivotHeaderNode[];
  readonly columns: readonly PivotHeaderNode[];
  readonly rowHeaders: readonly PivotHeaderNode[];
  readonly columnHeaders: readonly PivotHeaderNode[];
  readonly cells: readonly PivotCell[];
}

/** The asynchronous engine surface the adapter needs (`AsyncPivotEngine`). */
export interface AsyncEngineLike {
  readonly ready: Promise<Summary>;
  subscribe(listener: () => void): () => void;
  getSnapshot(): Summary | null;
  getStatus(): PivotComputeStatus;
  getModel(): PivotModel;
  setModel(input: PivotModelInput): Promise<Summary>;
  setData(rows: readonly unknown[]): Promise<Summary>;
  expand(path: PivotMemberPath): Promise<Summary>;
  collapse(path: PivotMemberPath): Promise<Summary>;
  expandAll(axis?: 'rows' | 'columns'): Promise<Summary>;
  collapseAll(axis?: 'rows' | 'columns'): Promise<Summary>;
  refresh(): Promise<Summary>;
  getWindow(request: WindowRequest): Promise<Window>;
  getFields(): Promise<readonly PivotFieldInfo[]>;
  getMembers(field: string, options?: { readonly search?: string; readonly limit?: number }): Promise<readonly PivotMember[]>;
  drillThrough(rowIndex: number, columnIndex: number): Promise<readonly unknown[]>;
  destroy(): void;
}

export const isAsyncEngine = (engine: unknown): engine is AsyncEngineLike => typeof (engine as { getWindow?: unknown } | null)?.getWindow === 'function';

/** A result window of the remote engine (`RemotePivotResult` of `@salmonui/data/json`, structurally). */
interface RemoteResultLike {
  readonly resultVersion: string;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowDepth: number;
  readonly columnDepth: number;
  readonly rowTree: readonly PivotHeaderNode[];
  readonly columnTree: readonly PivotHeaderNode[];
  memberAt(axis: 'rows' | 'columns', index: number): PivotHeaderNode;
  cellAt(rowIndex: number, columnIndex: number): PivotCell;
}

/** The remote engine of `createJsonPivotSource().createEngine()` (`RemotePivotEngine`), structurally. */
export interface RemoteEngineLike {
  readonly remote: true;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RemoteResultLike;
  getStatus(): PivotComputeStatus;
  getModel(): unknown;
  setModel(input: unknown): Promise<unknown>;
  setWindow(window: { readonly rows: readonly [number, number]; readonly columns: readonly [number, number] }): Promise<unknown>;
  expand(path: PivotMemberPath): Promise<unknown>;
  collapse(path: PivotMemberPath): Promise<unknown>;
  expandAll(): Promise<unknown>;
  collapseAll(axis?: 'rows' | 'columns'): Promise<unknown>;
  getMembers(field: string, options?: { readonly search?: string; readonly limit?: number }): Promise<readonly PivotMember[]>;
  drillThrough(rowIndex: number, columnIndex: number): Promise<{ readonly rows: readonly unknown[] }>;
  loadWindow(window: { readonly rows: readonly [number, number]; readonly columns: readonly [number, number] }): Promise<RemoteResultLike>;
  refresh(): Promise<unknown>;
  destroy(): void;
}

export const isRemoteEngine = (engine: unknown): engine is RemoteEngineLike => (engine as { remote?: unknown } | null)?.remote === true && typeof (engine as RemoteEngineLike).loadWindow === 'function';

const flat = (nodes: readonly PivotHeaderNode[], out: PivotHeaderNode[] = []): PivotHeaderNode[] => {
  for (const { children, ...node } of nodes) {
    out.push(node);
    if (children) flat(children, out);
  }
  return out;
};

/** A field definition as `usePivot({ fields })` takes it (the subset the field infos read). */
export type FieldDefinitionLike = { readonly field: string; readonly caption?: string | undefined; readonly type?: PivotFieldInfo['type'] | undefined; readonly folder?: string | undefined; readonly hidden?: boolean | undefined; readonly sortable?: boolean | undefined; readonly filterable?: boolean | undefined; readonly removable?: boolean | undefined; readonly draggable?: boolean | undefined };

/**
 * Field infos from field definitions alone: the fields of a remote engine,
 * and the store's fields before the first result, so the axis bar and the
 * field list show captions, not raw field names, while the first compute or
 * request is pending.
 */
export function fieldInfosOf(definitions: readonly FieldDefinitionLike[]): PivotFieldInfo[] {
  return definitions.map((d) => ({ field: d.field, caption: d.caption ?? d.field, type: d.type ?? 'string', ...(d.folder ? { folder: d.folder } : {}), hidden: d.hidden ?? false, sortable: d.sortable ?? true, filterable: d.filterable ?? true, removable: d.removable ?? true, draggable: d.draggable ?? true, memberCount: 0 }));
}

/**
 * Drives a remote engine (`createEngine: (o) => source.createEngine(o)`) through the window adapter: the first load is a `refresh()`,
 * blocks load through `loadWindow()` (independent requests, batched by the
 * source), members through `facet` and drill through as a paged request.
 * Field infos come from the field definitions (the server has the rows).
 */
export function remoteAsyncEngine(remote: RemoteEngineLike, definitions: readonly FieldDefinitionLike[] = []): AsyncEngineLike {
  let summary: Summary | null = null;
  let key = '';
  let version = 0;
  const model = (): PivotModel => remote.getModel() as PivotModel;
  const read = (): Summary | null => {
    const s = remote.getSnapshot();
    if (s.resultVersion === '') return summary;
    const m = model();
    const next = `${s.resultVersion}|${s.rowCount}|${s.columnCount}`;
    if (!summary || next !== key || summary.model !== m) {
      key = next;
      summary = { version: ++version, model: m, rowCount: s.rowCount, columnCount: s.columnCount, rowDepth: s.rowDepth, columnDepth: s.columnDepth };
    }
    return summary;
  };
  const done = (p: Promise<unknown>): Promise<Summary> => p.then(() => read() as Summary);
  const range = (n: number, s: number, e: number, at: (i: number) => PivotHeaderNode): PivotHeaderNode[] => Array.from({ length: Math.max(0, Math.min(n, e) - s) }, (_, i) => at(s + i));
  return {
    ready: done(remote.refresh()),
    subscribe: (listener) => remote.subscribe(listener),
    getSnapshot: read,
    getStatus: () => remote.getStatus(),
    getModel: model,
    setModel: (input) => done(remote.setModel(input)),
    // Raw rows live on the server: data replacement is the server's (`refresh()` reloads).
    setData: () => done(Promise.resolve()),
    expand: (path) => done(remote.expand(path)),
    collapse: (path) => done(remote.collapse(path)),
    expandAll: () => done(remote.expandAll()),
    collapseAll: (axis) => done(remote.collapseAll(axis)),
    refresh: () => done(remote.refresh()),
    async getWindow(request) {
      const w = await remote.loadWindow({ rows: [request.rowStart, request.rowEnd], columns: [request.columnStart, request.columnEnd] });
      const cells: PivotCell[] = [];
      for (let r = request.rowStart; r < request.rowEnd; r++) for (let c = request.columnStart; c < request.columnEnd; c++) cells.push(w.cellAt(r, c));
      return {
        ...(read() as Summary),
        request,
        rows: range(w.rowCount, request.rowStart, request.rowEnd, (i) => w.memberAt('rows', i)),
        columns: range(w.columnCount, request.columnStart, request.columnEnd, (i) => w.memberAt('columns', i)),
        rowHeaders: flat(w.rowTree),
        columnHeaders: flat(w.columnTree),
        cells,
      };
    },
    getFields: async () => fieldInfosOf(definitions),
    getMembers: (field, options) => remote.getMembers(field, options),
    async drillThrough(rowIndex, columnIndex) {
      // The remote engine resolves the cell's member paths from its own view: bring the cell into it first.
      await remote.setWindow({ rows: [rowIndex, rowIndex + 1], columns: [columnIndex, columnIndex + 1] });
      return (await remote.drillThrough(rowIndex, columnIndex)).rows;
    },
    destroy: () => remote.destroy(),
  };
}

/** Block size of the window cache. */
export const BLOCK_ROWS = 64;
export const BLOCK_COLUMNS = 32;
const MAX_BLOCKS = 256;

function placeholder(axis: 'rows' | 'columns', index: number): PivotHeaderNode {
  return { key: `\u0000${index}`, axis, kind: 'member', path: [], field: null, measure: null, label: '', depth: 0, position: index, span: 1, expandable: false, expanded: false };
}

/** Rebuilds a header tree from flat nodes (any depth, without children). */
function treeOf(nodes: readonly PivotHeaderNode[]): PivotHeaderNode[] {
  const sorted = [...nodes].sort((a, b) => a.depth - b.depth || a.position - b.position);
  const roots: PivotHeaderNode[] = [];
  const kids = new Map<PivotHeaderNode, PivotHeaderNode[]>();
  for (const node of sorted) {
    let parent: PivotHeaderNode | undefined;
    for (const candidate of sorted) {
      if (candidate.depth >= node.depth) break;
      if (candidate.position <= node.position && candidate.position + candidate.span >= node.position + node.span && (!parent || candidate.depth > parent.depth)) parent = candidate;
    }
    if (parent) {
      const list = kids.get(parent) ?? [];
      list.push(node);
      kids.set(parent, list);
    } else roots.push(node);
  }
  const attach = (node: PivotHeaderNode): PivotHeaderNode => {
    const children = kids.get(node);
    return children ? { ...node, children: children.map(attach) } : node;
  };
  return roots.map(attach);
}

/** Adapter state; `result` changes identity when the summary or a loaded block changes. */
export class WindowedPivot {
  result: PivotResult | null = null;
  fields: readonly PivotFieldInfo[] = [];
  private summary: Summary | null = null;
  private blocks = new Map<string, Window>();
  private loading = new Set<string>();
  private columnTree: PivotHeaderNode[] = [];
  private columnLeaves: readonly PivotHeaderNode[] = [];
  private labels = new Map<string, string>();
  private wanted: WindowRequest = { rowStart: 0, rowEnd: BLOCK_ROWS, columnStart: 0, columnEnd: BLOCK_COLUMNS };
  private tick = 0;
  private readonly off: () => void;

  constructor(
    private readonly engine: AsyncEngineLike,
    private readonly onChange: () => void,
  ) {
    this.off = engine.subscribe(() => this.onSummary());
    void engine.ready.then(
      async () => {
        this.fields = await engine.getFields();
        this.onSummary();
      },
      () => this.onChange(),
    );
  }

  destroy(): void {
    this.off();
  }

  /** A new summary (model or data change): drop every block and reload the wanted range. */
  private onSummary(): void {
    const summary = this.engine.getSnapshot();
    if (!summary || summary === this.summary) {
      this.onChange();
      return;
    }
    this.summary = summary;
    this.blocks.clear();
    this.loading.clear();
    this.labels.clear();
    void this.loadColumns(summary).then(() => this.ensure(this.wanted));
  }

  private async loadColumns(summary: Summary): Promise<void> {
    if (summary.columnCount === 0) {
      this.columnTree = [];
      this.columnLeaves = [];
    } else {
      const w = await this.engine.getWindow({ rowStart: 0, rowEnd: Math.min(1, summary.rowCount), columnStart: 0, columnEnd: summary.columnCount });
      if (this.summary !== summary) return;
      this.columnTree = treeOf(w.columnHeaders);
      this.columnLeaves = w.columns;
    }
    this.publish();
  }

  /** Loads the blocks covering `range` (the rendered rows and value columns). */
  ensure(range: WindowRequest): void {
    this.wanted = range;
    const summary = this.summary;
    if (!summary) return;
    const r0 = Math.floor(Math.max(0, range.rowStart) / BLOCK_ROWS);
    const r1 = Math.floor(Math.max(0, Math.min(summary.rowCount, range.rowEnd) - 1) / BLOCK_ROWS);
    const c0 = Math.floor(Math.max(0, range.columnStart) / BLOCK_COLUMNS);
    const c1 = Math.floor(Math.max(0, Math.min(summary.columnCount, Math.max(range.columnEnd, 1)) - 1) / BLOCK_COLUMNS);
    for (let rb = r0; rb <= r1; rb++) {
      for (let cb = c0; cb <= Math.max(c0, c1); cb++) {
        const key = `${rb}:${cb}`;
        if (this.blocks.has(key) || this.loading.has(key)) continue;
        this.loading.add(key);
        const request = {
          rowStart: rb * BLOCK_ROWS,
          rowEnd: Math.min(summary.rowCount, (rb + 1) * BLOCK_ROWS),
          columnStart: cb * BLOCK_COLUMNS,
          columnEnd: Math.min(summary.columnCount, (cb + 1) * BLOCK_COLUMNS),
        };
        void this.engine.getWindow(request).then(
          (w) => {
            this.loading.delete(key);
            if (this.summary !== summary) return;
            this.blocks.set(key, w);
            for (const h of w.rowHeaders) this.labels.set(h.key, h.label);
            if (this.blocks.size > MAX_BLOCKS) this.blocks.delete(this.blocks.keys().next().value as string);
            this.publish();
          },
          () => this.loading.delete(key),
        );
      }
    }
  }

  private block(r: number, c: number): Window | undefined {
    return this.blocks.get(`${Math.floor(r / BLOCK_ROWS)}:${Math.floor(c / BLOCK_COLUMNS)}`);
  }

  private rowBlock(r: number): Window | undefined {
    const rb = Math.floor(r / BLOCK_ROWS);
    for (const [key, w] of this.blocks) if (key.startsWith(`${rb}:`)) return w;
    return undefined;
  }

  private publish(): void {
    const summary = this.summary;
    if (!summary) return;
    this.tick++;
    const self = this;
    const columnTree = this.columnTree;
    const leaves = this.columnLeaves;
    const result: PivotResult & { labelOf(key: string): string | undefined; isLoaded(r: number, c: number): boolean } = {
      version: summary.version * 100_000 + this.tick,
      model: summary.model,
      rowCount: summary.rowCount,
      columnCount: summary.columnCount,
      rowDepth: summary.rowDepth,
      columnDepth: summary.columnDepth,
      rowTree: [],
      columnTree,
      memberAt(axis, index) {
        if (axis === 'columns') return leaves[index] ?? placeholder('columns', index);
        const w = self.rowBlock(index);
        return w?.rows[index - w.request.rowStart] ?? placeholder('rows', index);
      },
      valueAt(r, c) {
        return this.cellAt(r, c).value;
      },
      cellAt(r, c) {
        const w = self.block(r, c);
        const cell = w?.cells[(r - w.request.rowStart) * (w.request.columnEnd - w.request.columnStart) + (c - w.request.columnStart)];
        return cell ?? { rowIndex: r, columnIndex: c, rowKey: '', columnKey: '', measure: null, value: null, rawValue: null, formattedValue: '', kind: 'value', rowCount: 0 };
      },
      rowsAt: () => [],
      labelOf: (key) => self.labels.get(key),
      isLoaded: (r, c) => self.block(r, c) !== undefined,
    };
    this.result = result;
    this.onChange();
  }
}
