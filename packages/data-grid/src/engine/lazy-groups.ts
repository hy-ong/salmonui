// Lazy load grouping: the data source returns group envelopes level
// by level (`read({ groupPath })`), and children are fetched when a group is
// expanded. The store holds only what was loaded; the view flattens it in
// O(loaded rows + groups). Expansion state is the grouping module's (by
// group path), so it survives reloads; a query change invalidates the store.

import { createAbortController, type AbortControllerLike } from './abort.js';
import { GROUP_FOOTER_ID_PREFIX, GROUP_ID_PREFIX } from './group-tree.js';
import type {
  AggregateValues,
  ColumnId,
  DataSourceRequest,
  DataSourceResult,
  DataSource,
  DataQuery,
  GroupedRowEnvelope,
  GroupPathSegment,
  Json,
  RowId,
  RowKind,
  RowModelView,
  ViewRowInfo,
} from './types.js';

export type LazyStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface LazyNode {
  readonly pathKey: string;
  readonly path: readonly GroupPathSegment[];
  readonly columnId: ColumnId;
  readonly key: Json;
  readonly depth: number;
  readonly parent: LazyNode | null;
  count: number;
  aggregates: AggregateValues | null;
  status: LazyStatus;
  error: unknown;
  /** Sub-groups (non-leaf levels) or null. */
  groups: LazyNode[] | null;
  /** Loaded data rows (leaf level) and their ids. */
  rows: unknown[];
  ids: RowId[];
  hasMore: boolean;
  cursor: string | null;
  controller: AbortControllerLike | null;
}

export function pathKeyOf(path: readonly GroupPathSegment[]): string {
  return `[${path.map((s) => JSON.stringify([s.columnId, s.key])).join(',')}]`;
}

function isEnvelope(item: unknown): item is GroupedRowEnvelope<unknown> {
  return typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'group' && Array.isArray((item as { groupPath?: unknown }).groupPath);
}

export interface LazyHost {
  readonly source: DataSource<unknown>;
  readonly getRowId: (row: unknown, index: number) => RowId;
  /** Called after any load settles; the module bumps its version through a command. */
  readonly onChange: () => void;
  readonly chunk: number;
}

export class LazyGroupStore {
  version = 0;
  status: LazyStatus = 'idle';
  error: unknown = null;
  roots: LazyNode[] = [];
  aggregates: AggregateValues | null = null;
  totalRowCount = 0;
  private query: DataQuery | null = null;
  private queryKey = '';
  private requestVersion = 0;
  private rootController: AbortControllerLike | null = null;
  readonly byKey = new Map<string, LazyNode>();
  private readonly host: LazyHost;

  constructor(host: LazyHost) {
    this.host = host;
  }

  /** Starts the root level load for a new query (a query change drops every loaded group). */
  reset(query: DataQuery, key: string): void {
    // The engine dedupes identical reads, so an unchanged key here is an explicit re-read (`refresh()`,
    // `reload()`, a reconnect): reload the root as for a new query; expansion survives by group path.
    this.abortAll();
    this.query = query;
    this.queryKey = key;
    this.roots = [];
    this.byKey.clear();
    this.aggregates = null;
    this.loadRoot();
  }

  dispose(): void {
    this.abortAll();
  }

  private abortAll(): void {
    this.rootController?.abort();
    this.rootController = null;
    for (const node of this.byKey.values()) {
      node.controller?.abort();
      node.controller = null;
    }
  }

  private changed(): void {
    this.version++;
    this.host.onChange();
  }

  private read(request: Omit<DataSourceRequest, 'version' | 'signal'>, controller: AbortControllerLike): Promise<DataSourceResult<unknown>> {
    const version = ++this.requestVersion;
    try {
      return Promise.resolve(this.host.source.read({ ...request, version, signal: controller.signal }));
    } catch (error) {
      return Promise.reject(error);
    }
  }

  loadRoot(): void {
    const query = this.query;
    if (!query) return;
    const controller = createAbortController();
    this.rootController?.abort();
    this.rootController = controller;
    this.status = 'loading';
    this.error = null;
    this.read({ query, groupPath: [] }, controller).then(
      (result) => {
        if (controller.signal.aborted || this.query !== query) return;
        this.rootController = null;
        this.status = 'ready';
        this.aggregates = result.aggregates ?? null;
        this.roots = this.nodesFrom(result.rows, null);
        this.totalRowCount = result.totalRowCount ?? this.roots.length;
        this.changed();
      },
      (error: unknown) => {
        if (controller.signal.aborted || this.query !== query) return;
        this.rootController = null;
        this.status = 'error';
        this.error = error;
        this.changed();
      },
    );
    this.changed();
  }

  private nodesFrom(items: readonly unknown[], parent: LazyNode | null): LazyNode[] {
    const out: LazyNode[] = [];
    for (const item of items) {
      if (!isEnvelope(item)) continue;
      const path = item.groupPath;
      const pathKey = pathKeyOf(path);
      const previous = this.byKey.get(pathKey);
      const node: LazyNode = {
        pathKey,
        path,
        columnId: item.columnId,
        key: item.key,
        depth: path.length - 1,
        parent,
        count: item.count,
        aggregates: item.aggregates ?? null,
        status: previous?.status === 'ready' ? 'ready' : 'idle',
        error: null,
        groups: previous?.groups ?? null,
        rows: previous?.rows ?? [],
        ids: previous?.ids ?? [],
        hasMore: previous?.hasMore ?? false,
        cursor: previous?.cursor ?? null,
        controller: null,
      };
      this.byKey.set(pathKey, node);
      out.push(node);
    }
    return out;
  }

  /** Loads (or appends the next chunk of) a group's children. */
  load(node: LazyNode, append = false): void {
    const query = this.query;
    if (!query || node.status === 'loading') return;
    if (!append && node.status === 'ready') return;
    const controller = createAbortController();
    node.controller = controller;
    node.status = 'loading';
    node.error = null;
    const start = append ? node.rows.length + (node.groups?.length ?? 0) : 0;
    const request: Omit<DataSourceRequest, 'version' | 'signal'> =
      append && node.cursor !== null
        ? { query, groupPath: node.path, cursor: node.cursor, range: { start, end: start + this.host.chunk } }
        : { query, groupPath: node.path, range: { start, end: start + this.host.chunk } };
    this.read(request, controller).then(
      (result) => {
        if (controller.signal.aborted || this.query !== query) return;
        node.controller = null;
        node.status = 'ready';
        const items = result.rows;
        if (items.length && isEnvelope(items[0])) {
          const groups = this.nodesFrom(items, node);
          node.groups = append && node.groups ? node.groups.concat(groups) : groups;
        } else {
          const rows = append ? node.rows.slice() : [];
          const ids = append ? node.ids.slice() : [];
          for (const row of items) {
            ids.push(this.host.getRowId(row, rows.length));
            rows.push(row);
          }
          node.rows = rows;
          node.ids = ids;
        }
        const loaded = node.rows.length + (node.groups?.length ?? 0);
        node.cursor = result.pageInfo?.endCursor ?? null;
        const total = result.totalRowCount;
        node.hasMore = result.pageInfo?.hasNextPage ?? (total !== undefined ? loaded < total : false);
        this.changed();
      },
      (error: unknown) => {
        if (controller.signal.aborted || this.query !== query) return;
        node.controller = null;
        node.status = 'error';
        node.error = error;
        this.changed();
      },
    );
    this.changed();
  }

  retry(node: LazyNode | null): void {
    if (node === null) {
      if (this.status === 'error') this.loadRoot();
      return;
    }
    if (node.status === 'error') {
      node.status = node.rows.length || node.groups ? 'ready' : 'idle';
      this.load(node, node.status === 'ready');
    }
  }

  /** Starts loads for expanded groups whose children are not loaded yet. */
  sync(isExpanded: (node: LazyNode) => boolean): void {
    const visit = (nodes: readonly LazyNode[]): void => {
      for (const node of nodes) {
        if (!isExpanded(node)) continue;
        if (node.status === 'idle') this.load(node);
        if (node.groups) visit(node.groups);
      }
    };
    visit(this.roots);
  }
}

const CAPTION = 0;
const DATA = 1;
const FOOTER = 2;

/** Flattened view of the loaded part of a lazy group tree. */
export class LazyGroupView implements RowModelView {
  readonly kind = 'lazyGrouped' as const;
  readonly count: number;
  readonly dataCount: number;
  readonly store: LazyGroupStore;
  readonly version: number;
  private readonly kinds: Uint8Array;
  private readonly nodes: LazyNode[];
  private readonly rowAt: Int32Array;
  private readonly captionIndex = new Map<LazyNode, number>();
  private readonly footerIndex = new Map<LazyNode, number>();
  private readonly dataIndex = new Map<RowId, number>();
  readonly depth: number;

  constructor(store: LazyGroupStore, depth: number, isExpanded: (node: LazyNode) => boolean, footers: boolean) {
    this.store = store;
    this.version = store.version;
    this.depth = depth;
    const kinds: number[] = [];
    const nodes: LazyNode[] = [];
    const rowAt: number[] = [];
    let dataCount = 0;
    const visit = (list: readonly LazyNode[]): void => {
      for (const node of list) {
        this.captionIndex.set(node, kinds.length);
        kinds.push(CAPTION);
        nodes.push(node);
        rowAt.push(-1);
        dataCount += node.count;
        if (!isExpanded(node)) continue;
        if (node.groups) visit(node.groups);
        for (let i = 0; i < node.rows.length; i++) {
          this.dataIndex.set(node.ids[i] as RowId, kinds.length);
          kinds.push(DATA);
          nodes.push(node);
          rowAt.push(i);
        }
        if (footers) {
          this.footerIndex.set(node, kinds.length);
          kinds.push(FOOTER);
          nodes.push(node);
          rowAt.push(-1);
        }
      }
    };
    visit(store.roots);
    this.kinds = Uint8Array.from(kinds);
    this.nodes = nodes;
    this.rowAt = Int32Array.from(rowAt);
    this.count = kinds.length;
    let top = 0;
    for (const r of store.roots) top += r.count;
    this.dataCount = top || dataCount;
  }

  kindAt(index: number): RowKind {
    const k = this.kinds[index];
    return k === CAPTION ? 'group' : k === FOOTER ? 'groupFooter' : 'data';
  }

  nodeAt(index: number): LazyNode | undefined {
    return this.nodes[index];
  }

  sourceIndexAt(): number {
    return -1;
  }

  idAt(index: number): RowId | undefined {
    const node = this.nodes[index];
    if (!node) return undefined;
    const k = this.kinds[index];
    if (k === CAPTION) return GROUP_ID_PREFIX + node.pathKey;
    if (k === FOOTER) return GROUP_FOOTER_ID_PREFIX + node.pathKey;
    return node.ids[this.rowAt[index] as number];
  }

  depthAt(index: number): number {
    const node = this.nodes[index];
    if (!node) return 0;
    return this.kinds[index] === DATA ? this.depth : node.depth;
  }

  indexOfSource(): number {
    return -1;
  }

  parentOfSource(): RowId | null {
    return null;
  }

  captionOf(node: LazyNode): number {
    return this.captionIndex.get(node) ?? -1;
  }

  footerOf(node: LazyNode): number {
    return this.footerIndex.get(node) ?? -1;
  }

  nodeOfId(id: RowId): LazyNode | undefined {
    const key = id.startsWith(GROUP_ID_PREFIX) ? id.slice(GROUP_ID_PREFIX.length) : id.startsWith(GROUP_FOOTER_ID_PREFIX) ? id.slice(GROUP_FOOTER_ID_PREFIX.length) : null;
    return key === null ? undefined : this.store.byKey.get(key);
  }

  resolve(id: RowId): ViewRowInfo | undefined {
    const data = this.dataIndex.get(id);
    if (data !== undefined) {
      const node = this.nodes[data] as LazyNode;
      return Object.freeze({ index: data, kind: 'data' as const, depth: this.depth, parentId: GROUP_ID_PREFIX + node.pathKey, row: node.rows[this.rowAt[data] as number] });
    }
    const node = this.nodeOfId(id);
    if (!node) return undefined;
    const footer = id.startsWith(GROUP_FOOTER_ID_PREFIX);
    const index = footer ? this.footerOf(node) : this.captionOf(node);
    if (index < 0) return undefined;
    return Object.freeze({
      index,
      kind: footer ? ('groupFooter' as const) : ('group' as const),
      depth: node.depth,
      parentId: footer ? GROUP_ID_PREFIX + node.pathKey : node.parent ? GROUP_ID_PREFIX + node.parent.pathKey : null,
      row: null,
    });
  }
}
