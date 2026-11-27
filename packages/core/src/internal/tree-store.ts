// Framework-agnostic flat tree store for TreeView. No React, no DOM globals.
// Modeled on the techniques of Data Grid engine `group-tree.ts` (typed arrays
// for parent, rank and subtree size) and `expansion.ts` (versioned async
// loads with abort); new code, the Data Grid is not touched.
//
// Consumers: `TreeView` (@salmonui/navigation/tree-view) and, by design, the
// Dropdowns category's `TreeSelect`. Import it as an internal module
// (`../internal/tree-store.js`), never through /tree-view private files.
//
// ---------------------------------------------------------------------------
// API (stable for TreeSelect)
// ---------------------------------------------------------------------------
//
//   const store = createTreeStore<T>({ data, getItemId, getItemLabel,
//     getChildren | getParentId, hasChildren, isItemDisabled, sort, locale,
//     checkPropagation, cascadeToDisabled, loadChildren, onLoadError });
//
//   Data
//     store.setOptions(partial)   rebuilds the model when data, sort, locale
//                                 or cascadeToDisabled changes (accessors
//                                 are read again on the next rebuild)
//                                 (O(n), one per `data` identity); expanded,
//                                 selected and checked state survive by id.
//     store.model                 the current TreeModel (read only):
//                                 `count`, `items`, `ids`, `index` (id ->
//                                 node), typed arrays `parent`, `depth`,
//                                 `size` (subtree size incl. self),
//                                 `childCount`, `rank` (0-based sibling
//                                 position), `rootCount`, `flags`
//                                 (HAS_CHILDREN, DISABLED, UNKNOWN).
//                                 Nodes are numbered in pre-order, so the
//                                 subtree of node i is [i, i + size[i]).
//   Visible order (only expanded subtrees are flattened)
//     store.order                 Int32Array of node indexes, ascending.
//     store.positionOf(node)      visible position or -1 (binary search).
//     store.visibleCount
//   Expansion
//     store.isExpanded(node), store.setExpanded(node, open) (splice,
//     O(visible descendants) + one copy), store.expandAll({ ids, level }),
//     store.collapseAll({ ids, level }) (one flatten), store.expandedIds().
//     Expanding a node with UNKNOWN children starts `loadChildren`.
//   Lazy loading
//     store.loadStatus(node): 'idle' | 'loading' | 'error'; store.load(node)
//     (retry). Each request carries a version and an AbortController: a
//     stale response (a newer request for the node, a data change, dispose)
//     is dropped and its request aborted.
//   Selection
//     store.selected (Set of ids), store.setSelected(ids), store.isSelected(node)
//   Checks (`checkPropagation: 'cascade' | 'none'`)
//     store.checkState(node): 0 unchecked, 1 checked, 2 mixed.
//     store.setChecked(node, checked): cascade costs O(depth^2), never
//     O(subtree): a mark on the node (a version stamp) is resolved lazily by
//     every descendant through its ancestor path, and checked-leaf counts
//     are kept per node along that path.
//     store.checkAll(ids?), store.uncheckAll(ids?), store.setCheckedIds(ids),
//     store.checkedIds() (O(n), materialized on demand only).
//   Focus and rename
//     store.focusedId, store.setFocused(id), store.renamingId, store.setRenaming(id)
//   Subscription
//     store.subscribe(listener), store.getVersion() (any change),
//     store.getOrderVersion() (model or visible order changed),
//     store.bits(id) (a number per row for `useSyncExternalStore` narrow
//     selectors: EXPANDED | SELECTED | CHECKED | MIXED | LOADING | ERROR |
//     FOCUSED | RENAMING), store.dispose() (aborts pending loads).

export type TreeKey = string | number;

/** Node flags (`model.flags`). */
export const HAS_CHILDREN = 1;
export const DISABLED = 2;
/** `hasChildren(item)` is true but no children are known yet: expanding loads them. */
export const UNKNOWN = 4;

/** Row bits (`store.bits(id)`). */
export const BIT_EXPANDED = 1;
export const BIT_SELECTED = 2;
export const BIT_CHECKED = 4;
export const BIT_MIXED = 8;
export const BIT_LOADING = 16;
export const BIT_ERROR = 32;
export const BIT_FOCUSED = 64;
export const BIT_RENAMING = 128;

export type CheckPropagation = 'cascade' | 'none';
export type LoadStatus = 'idle' | 'loading' | 'error';

export interface TreeStoreOptions<T> {
  readonly data: readonly T[];
  readonly getItemId: (item: T) => TreeKey;
  readonly getItemLabel?: ((item: T) => string) | undefined;
  /** Nested data: the children of an item. */
  readonly getChildren?: ((item: T) => readonly T[] | null | undefined) | undefined;
  /** Flat data: the parent id of an item (null or unknown id: a root). Ignored when `getChildren` is given. */
  readonly getParentId?: ((item: T) => TreeKey | null | undefined) | undefined;
  /** Shows a twisty before children are known (lazy loading). */
  readonly hasChildren?: ((item: T) => boolean) | undefined;
  readonly isItemDisabled?: ((item: T) => boolean) | undefined;
  readonly sort?: 'asc' | 'desc' | null | undefined;
  readonly locale?: string | undefined;
  readonly checkPropagation?: CheckPropagation | undefined;
  /** Default true: a cascade also checks disabled descendants. False: disabled subtrees keep their own state and do not count. */
  readonly cascadeToDisabled?: boolean | undefined;
  readonly loadChildren?: ((item: T, options: { readonly signal: AbortSignal }) => Promise<readonly T[]>) | undefined;
  /** Called after a rejected `loadChildren` (the node is then in the error state). */
  readonly onLoadError?: ((error: unknown, item: T, id: TreeKey) => void) | undefined;
  /** Called after loaded children were merged into the model. */
  readonly onLoaded?: ((item: T, id: TreeKey, children: readonly T[]) => void) | undefined;
}

export interface TreeModel<T> {
  readonly count: number;
  readonly items: readonly T[];
  readonly ids: readonly TreeKey[];
  readonly index: ReadonlyMap<TreeKey, number>;
  readonly parent: Int32Array;
  readonly depth: Int32Array;
  readonly size: Int32Array;
  readonly childCount: Int32Array;
  readonly rank: Int32Array;
  readonly flags: Uint8Array;
  readonly rootCount: number;
  /** Ids that occur more than once (development warning; the first wins the id index). */
  readonly duplicates: readonly TreeKey[];
}

interface Frame<T> {
  readonly list: readonly T[];
  i: number;
  readonly parent: number;
  readonly depth: number;
}

/** Builds the pre-order model in O(n) (plus O(n log n) when `sort` is set). */
export function buildTreeModel<T>(options: TreeStoreOptions<T>, loaded?: ReadonlyMap<TreeKey, readonly T[]>): TreeModel<T> {
  const { data, getItemId, getChildren, getParentId, hasChildren, isItemDisabled, sort } = options;
  let roots: readonly T[] = data;
  let byParent: Map<TreeKey, T[]> | null = null;
  if (!getChildren && getParentId) {
    const present = new Set<TreeKey>();
    for (const item of data) present.add(getItemId(item));
    const top: T[] = [];
    byParent = new Map();
    for (const item of data) {
      const p = getParentId(item);
      if (p === null || p === undefined || !present.has(p)) top.push(item);
      else {
        const list = byParent.get(p);
        if (list) list.push(item);
        else byParent.set(p, [item]);
      }
    }
    roots = top;
  }
  let collator: Intl.Collator | null = null;
  const label = options.getItemLabel ?? ((item: T) => String(getItemId(item)));
  const ordered = (list: readonly T[]): readonly T[] => {
    if (!sort || list.length < 2) return list;
    collator ??= new Intl.Collator(options.locale, { numeric: true, sensitivity: 'base' });
    const c = collator;
    const keyed = list.map((item) => ({ item, key: label(item) }));
    keyed.sort((a, b) => c.compare(a.key, b.key) * (sort === 'desc' ? -1 : 1));
    return keyed.map((k) => k.item);
  };
  const items: T[] = [];
  const ids: TreeKey[] = [];
  const parent: number[] = [];
  const depth: number[] = [];
  const rank: number[] = [];
  const childCount: number[] = [];
  const flagList: number[] = [];
  const index = new Map<TreeKey, number>();
  const duplicates: TreeKey[] = [];
  const stack: Frame<T>[] = [{ list: ordered(roots), i: 0, parent: -1, depth: 0 }];
  while (stack.length > 0) {
    const f = stack[stack.length - 1] as Frame<T>;
    if (f.i >= f.list.length) {
      stack.pop();
      continue;
    }
    const r = f.i++;
    const item = f.list[r] as T;
    const id = getItemId(item);
    const n = items.length;
    if (index.has(id)) duplicates.push(id);
    else index.set(id, n);
    items.push(item);
    ids.push(id);
    parent.push(f.parent);
    depth.push(f.depth);
    rank.push(r);
    let flags = f.parent >= 0 && ((flagList[f.parent] as number) & DISABLED) ? DISABLED : 0;
    if (!flags && isItemDisabled?.(item)) flags = DISABLED;
    let kids: readonly T[] | null | undefined = getChildren ? getChildren(item) : byParent?.get(id);
    if ((!kids || kids.length === 0) && loaded) kids = loaded.get(id) ?? kids;
    const k = kids ? kids.length : 0;
    childCount.push(k);
    if (k > 0) flags |= HAS_CHILDREN;
    else if (hasChildren?.(item) && !loaded?.has(id)) flags |= HAS_CHILDREN | UNKNOWN;
    flagList.push(flags);
    if (k > 0) stack.push({ list: ordered(kids as readonly T[]), i: 0, parent: n, depth: f.depth + 1 });
  }
  const count = items.length;
  const size = new Int32Array(count);
  const parentArr = Int32Array.from(parent);
  for (let i = count - 1; i >= 0; i--) {
    size[i] = (size[i] as number) + 1;
    const p = parentArr[i] as number;
    if (p >= 0) size[p] = (size[p] as number) + (size[i] as number);
  }
  return {
    count,
    items,
    ids,
    index,
    parent: parentArr,
    depth: Int32Array.from(depth),
    size,
    childCount: Int32Array.from(childCount),
    rank: Int32Array.from(rank),
    flags: Uint8Array.from(flagList),
    rootCount: roots.length,
    duplicates,
  };
}

/** First index in the ascending `order` whose value is >= `node`. */
function lowerBound(order: Int32Array, node: number, from = 0): number {
  let lo = from;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((order[mid] as number) < node) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

interface LoadEntry {
  status: LoadStatus;
  version: number;
  controller: AbortController | null;
  error: unknown;
}

export interface TreeStore<T> {
  readonly model: TreeModel<T>;
  readonly order: Int32Array;
  readonly visibleCount: number;
  readonly selected: ReadonlySet<TreeKey>;
  readonly focusedId: TreeKey | null;
  readonly renamingId: TreeKey | null;
  readonly options: TreeStoreOptions<T>;
  setOptions(patch: Partial<TreeStoreOptions<T>>): void;
  positionOf(node: number): number;
  nodeOf(id: TreeKey): number;
  label(node: number): string;
  isExpanded(node: number): boolean;
  setExpanded(node: number, open: boolean): boolean;
  /** Replaces the expanded set; `startLoads` false defers lazy loads (server render) to `loadPending()`. */
  setExpandedIds(ids: Iterable<TreeKey>, startLoads?: boolean): void;
  /** Starts the loads of visible expanded nodes whose children are unknown. */
  loadPending(): void;
  /** True while any load is pending (`aria-busy`). */
  isBusy(): boolean;
  expandAll(options?: { readonly ids?: readonly TreeKey[] | undefined; readonly level?: number | undefined }): void;
  collapseAll(options?: { readonly ids?: readonly TreeKey[] | undefined; readonly level?: number | undefined }): void;
  expandedIds(): TreeKey[];
  loadStatus(node: number): LoadStatus;
  loadError(node: number): unknown;
  load(node: number): void;
  isSelected(node: number): boolean;
  setSelected(ids: Iterable<TreeKey>): void;
  checkState(node: number): 0 | 1 | 2;
  setChecked(node: number, checked: boolean): void;
  setCheckedIds(ids: Iterable<TreeKey>): void;
  checkAll(ids?: readonly TreeKey[]): void;
  uncheckAll(ids?: readonly TreeKey[]): void;
  checkedIds(): TreeKey[];
  setFocused(id: TreeKey | null): void;
  setRenaming(id: TreeKey | null): void;
  bits(id: TreeKey): number;
  subscribe(listener: () => void): () => void;
  getVersion(): number;
  getOrderVersion(): number;
  /** Changes whenever a check state may have changed. */
  getCheckVersion(): number;
  /** Starts a batch: listeners run once when the outermost batch ends. */
  batch(run: () => void): void;
  dispose(): void;
}

// Accessor identities alone do not rebuild (inline arrow functions are common);
// they are read again whenever `data` changes.
const MODEL_KEYS = ['data', 'sort', 'locale', 'cascadeToDisabled'] as const;

export function createTreeStore<T>(initial: TreeStoreOptions<T>): TreeStore<T> {
  let options: TreeStoreOptions<T> = initial;
  const loaded = new Map<TreeKey, readonly T[]>();
  const loads = new Map<TreeKey, LoadEntry>();
  const expanded = new Set<TreeKey>();
  let selected: Set<TreeKey> = new Set();
  let focusedId: TreeKey | null = null;
  let renamingId: TreeKey | null = null;
  let model: TreeModel<T> = buildTreeModel(options, loaded);
  let exp = new Uint8Array(model.count);
  let order = new Int32Array(0);
  let labels: (string | undefined)[] = [];
  // Checks: a mark (stamp, value) per node, checked-leaf counts valid as of a stamp.
  let clock = 0;
  let mStamp = new Int32Array(model.count);
  let mVal = new Uint8Array(model.count);
  let cnt = new Int32Array(model.count);
  let cntStamp = new Int32Array(model.count);
  let leafCount = new Int32Array(model.count);
  let selfLeaf = new Uint8Array(model.count);
  let version = 0;
  let checkVersion = 0;
  let orderVersion = 0;
  let depthOfBatch = 0;
  let dirty = false;
  const listeners = new Set<() => void>();

  const cascade = (): boolean => (options.checkPropagation ?? 'cascade') === 'cascade';
  const freezeDisabled = (): boolean => options.cascadeToDisabled === false;
  /** A disabled node whose parent is enabled, when disabled subtrees keep their own state. */
  const boundary = (x: number): boolean => {
    if (!freezeDisabled() || !((model.flags[x] as number) & DISABLED)) return false;
    const p = model.parent[x] as number;
    return p < 0 || !((model.flags[p] as number) & DISABLED);
  };

  function notify(orderChanged: boolean): void {
    version++;
    if (orderChanged) orderVersion++;
    if (depthOfBatch > 0) {
      dirty = true;
      return;
    }
    for (const l of [...listeners]) l();
  }

  function flatten(): void {
    const n = model.count;
    const out = new Int32Array(n);
    let k = 0;
    const size = model.size;
    for (let i = 0; i < n; ) {
      out[k++] = i;
      i += exp[i] ? 1 : (size[i] as number);
    }
    order = k === n ? out : out.slice(0, k);
  }

  function initChecks(): void {
    const n = model.count;
    mStamp = new Int32Array(n);
    mVal = new Uint8Array(n);
    cnt = new Int32Array(n);
    cntStamp = new Int32Array(n);
    leafCount = new Int32Array(n);
    selfLeaf = new Uint8Array(n);
    clock = 0;
    checkVersion++;
    // Bottom-up (children have higher indexes): leaf counts exclude frozen
    // (boundary) subtrees; a node without counted children counts itself.
    for (let i = n - 1; i >= 0; i--) {
      if (leafCount[i] === 0) {
        leafCount[i] = 1;
        selfLeaf[i] = 1;
      }
      const p = model.parent[i] as number;
      if (p >= 0 && !boundary(i)) leafCount[p] = (leafCount[p] as number) + (leafCount[i] as number);
    }
  }

  // Newest mark over the ancestor-or-self path (stops at a frozen boundary). Returns the stamp; `lastVal` the value.
  let lastVal = 0;
  function markOf(x: number): number {
    let best = 0;
    let val = 0;
    let y = x;
    while (y >= 0) {
      const s = mStamp[y] as number;
      if (s > best) {
        best = s;
        val = mVal[y] as number;
      }
      if (boundary(y)) break;
      y = model.parent[y] as number;
    }
    lastVal = val;
    return best;
  }
  function effCount(x: number): number {
    const s = markOf(x);
    if (s > (cntStamp[x] as number)) return lastVal ? (leafCount[x] as number) : 0;
    return cnt[x] as number;
  }
  /** No counted child: the node's own mark decides its state. */
  const leafSelf = (x: number): boolean => selfLeaf[x] === 1;

  function checkStateOf(x: number): 0 | 1 | 2 {
    if (!cascade() || leafSelf(x)) {
      if (!cascade()) return (mStamp[x] as number) > 0 && mVal[x] ? 1 : 0;
      return markOf(x) > 0 && lastVal ? 1 : 0;
    }
    const c = effCount(x);
    return c === 0 ? 0 : c === (leafCount[x] as number) ? 1 : 2;
  }

  function mark(x: number, v: boolean): void {
    if (x < 0 || x >= model.count) return; // an unknown id
    checkVersion++;
    const stamp = ++clock;
    if (!cascade()) {
      mStamp[x] = stamp;
      mVal[x] = v ? 1 : 0;
      return;
    }
    const old = effCount(x);
    mStamp[x] = stamp;
    mVal[x] = v ? 1 : 0;
    const now = v ? (leafCount[x] as number) : 0;
    cnt[x] = now;
    cntStamp[x] = stamp;
    const delta = now - old;
    if (delta === 0 || boundary(x)) return;
    for (let y = model.parent[x] as number; y >= 0; y = model.parent[y] as number) {
      cnt[y] = effCount(y) + delta;
      cntStamp[y] = stamp;
      if (boundary(y)) break;
    }
  }

  /** Effective check state of every node in O(n) (pre-order inherit, then bottom-up counts). */
  function allStates(): Uint8Array {
    const n = model.count;
    const out = new Uint8Array(n);
    if (!cascade()) {
      for (let i = 0; i < n; i++) out[i] = (mStamp[i] as number) > 0 && mVal[i] ? 1 : 0;
      return out;
    }
    const inhS = new Int32Array(n);
    const inhV = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const p = model.parent[i] as number;
      let s = p >= 0 && !boundary(i) ? (inhS[p] as number) : 0;
      let v = p >= 0 && !boundary(i) ? (inhV[p] as number) : 0;
      if ((mStamp[i] as number) > s) {
        s = mStamp[i] as number;
        v = mVal[i] as number;
      }
      inhS[i] = s;
      inhV[i] = v;
    }
    const tmp = new Int32Array(n);
    const self = new Uint8Array(n);
    for (let i = n - 1; i >= 0; i--) {
      if (leafSelf(i)) {
        self[i] = 1;
        tmp[i] = inhS[i] && inhV[i] ? 1 : 0;
      }
      const p = model.parent[i] as number;
      if (p >= 0 && !boundary(i)) tmp[p] = (tmp[p] as number) + (tmp[i] as number);
    }
    for (let i = 0; i < n; i++) {
      if (self[i]) out[i] = tmp[i] ? 1 : 0;
      else out[i] = tmp[i] === 0 ? 0 : tmp[i] === leafCount[i] ? 1 : 2;
    }
    return out;
  }

  /** Minimal marks that reproduce the check state on another model (by id). */
  function canonicalChecks(): TreeKey[] {
    const states = allStates();
    const out: TreeKey[] = [];
    for (let i = 0; i < model.count; i++) {
      if (states[i] !== 1) continue;
      const p = model.parent[i] as number;
      if (cascade() && p >= 0 && states[p] === 1 && !boundary(i)) continue;
      out.push(model.ids[i] as TreeKey);
    }
    return out;
  }

  function rebuild(checks: readonly TreeKey[] = canonicalChecks()): void {
    model = buildTreeModel(options, loaded);
    labels = [];
    exp = new Uint8Array(model.count);
    for (const id of expanded) {
      const i = model.index.get(id);
      if (i !== undefined) exp[i] = 1;
    }
    initChecks();
    for (const id of checks) {
      const i = model.index.get(id);
      if (i !== undefined) mark(i, true);
    }
    flatten();
  }

  initChecks();
  flatten();

  function startLoad(node: number): void {
    const loader = options.loadChildren;
    if (!loader) return;
    const id = model.ids[node] as TreeKey;
    const item = model.items[node] as T;
    const prev = loads.get(id);
    if (prev?.status === 'loading') return;
    prev?.controller?.abort();
    const entry: LoadEntry = { status: 'loading', version: (prev?.version ?? 0) + 1, controller: typeof AbortController === 'function' ? new AbortController() : null, error: undefined };
    loads.set(id, entry);
    const v = entry.version;
    const signal = (entry.controller?.signal ?? ({ aborted: false } as AbortSignal));
    let promise: Promise<readonly T[]>;
    try {
      promise = Promise.resolve(loader(item, { signal }));
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise.then(
      (children) => {
        const e = loads.get(id);
        if (!e || e.version !== v) return;
        e.status = 'idle';
        e.controller = null;
        loaded.set(id, children ?? []);
        rebuild();
        notify(true);
        options.onLoaded?.(item, id, children ?? []);
      },
      (error: unknown) => {
        const e = loads.get(id);
        if (!e || e.version !== v) return;
        if (signal.aborted) return;
        e.status = 'error';
        e.controller = null;
        e.error = error;
        notify(false);
        options.onLoadError?.(error, item, id);
      },
    );
  }

  function splice(node: number, open: boolean): void {
    const p = lowerBound(order, node);
    if (order[p] !== node) return; // not visible: the flag alone matters
    const end = node + (model.size[node] as number);
    if (open) {
      const desc: number[] = [];
      for (let j = node + 1; j < end; ) {
        desc.push(j);
        j += exp[j] ? 1 : (model.size[j] as number);
      }
      if (desc.length === 0) return;
      const next = new Int32Array(order.length + desc.length);
      next.set(order.subarray(0, p + 1));
      next.set(desc, p + 1);
      next.set(order.subarray(p + 1), p + 1 + desc.length);
      order = next;
    } else {
      const q = lowerBound(order, end, p + 1);
      if (q === p + 1) return;
      const next = new Int32Array(order.length - (q - p - 1));
      next.set(order.subarray(0, p + 1));
      next.set(order.subarray(q), p + 1);
      order = next;
    }
  }

  function levelSet(level: number | undefined, ids: readonly TreeKey[] | undefined, value: number): void {
    if (ids) {
      for (const id of ids) {
        const i = model.index.get(id);
        if (i === undefined || !((model.flags[i] as number) & HAS_CHILDREN)) continue;
        if (level !== undefined && (model.depth[i] as number) + 1 > level) continue;
        exp[i] = value;
        if (value) expanded.add(id);
        else expanded.delete(id);
      }
      return;
    }
    for (let i = 0; i < model.count; i++) {
      if (!((model.flags[i] as number) & HAS_CHILDREN)) continue;
      if (level !== undefined && (model.depth[i] as number) + 1 > level) continue;
      if (value && (model.flags[i] as number) & UNKNOWN) continue; // expandAll does not fire loads
      exp[i] = value;
      const id = model.ids[i] as TreeKey;
      if (value) expanded.add(id);
      else expanded.delete(id);
    }
  }

  const store: TreeStore<T> = {
    get model() {
      return model;
    },
    get order() {
      return order;
    },
    get visibleCount() {
      return order.length;
    },
    get selected() {
      return selected;
    },
    get focusedId() {
      return focusedId;
    },
    get renamingId() {
      return renamingId;
    },
    get options() {
      return options;
    },
    setOptions(patch) {
      const prev = options;
      const next = { ...options, ...patch };
      let changed = false;
      for (const key of MODEL_KEYS) if (key in patch && prev[key] !== next[key]) changed = true;
      const toNone = (prev.checkPropagation ?? 'cascade') !== (next.checkPropagation ?? 'cascade') && next.checkPropagation === 'none';
      const propagation = (prev.checkPropagation ?? 'cascade') !== (next.checkPropagation ?? 'cascade');
      if (prev.getItemLabel !== next.getItemLabel) labels = [];
      if (!changed && !propagation) {
        options = next;
        return;
      }
      // Check state is carried by id, read under the previous options.
      const checks = toNone ? store.checkedIds() : canonicalChecks();
      options = next;
      if (prev.data !== next.data) {
        // Loads started for the previous data are dropped.
        for (const entry of loads.values()) entry.controller?.abort();
        loads.clear();
      }
      rebuild(checks);
      notify(true);
    },
    positionOf(node) {
      const p = lowerBound(order, node);
      return order[p] === node ? p : -1;
    },
    nodeOf(id) {
      return model.index.get(id) ?? -1;
    },
    label(node) {
      let l = labels[node];
      if (l === undefined) {
        const item = model.items[node] as T;
        l = options.getItemLabel ? options.getItemLabel(item) : String(model.ids[node]);
        labels[node] = l;
      }
      return l;
    },
    isExpanded: (node) => exp[node] === 1,
    setExpanded(node, open) {
      if (node < 0 || node >= model.count || (exp[node] === 1) === open) return false;
      if (open && !((model.flags[node] as number) & HAS_CHILDREN)) return false;
      exp[node] = open ? 1 : 0;
      const id = model.ids[node] as TreeKey;
      if (open) expanded.add(id);
      else expanded.delete(id);
      splice(node, open);
      if (open && (model.flags[node] as number) & UNKNOWN) startLoad(node);
      notify(true);
      return true;
    },
    setExpandedIds(ids, startLoads = true) {
      expanded.clear();
      exp.fill(0);
      for (const id of ids) {
        expanded.add(id);
        const i = model.index.get(id);
        if (i !== undefined) exp[i] = 1;
      }
      flatten();
      if (startLoads) store.loadPending();
      notify(true);
    },
    loadPending() {
      for (const id of expanded) {
        const i = model.index.get(id);
        if (i !== undefined && (model.flags[i] as number) & UNKNOWN && store.positionOf(i) >= 0 && !loads.has(id)) startLoad(i);
      }
    },
    isBusy() {
      for (const entry of loads.values()) if (entry.status === 'loading') return true;
      return false;
    },
    expandAll(o = {}) {
      levelSet(o.level, o.ids, 1);
      flatten();
      notify(true);
    },
    collapseAll(o = {}) {
      if (o.level !== undefined && !o.ids) {
        // collapseAll({ level }): collapse nodes at that level and deeper.
        for (let i = 0; i < model.count; i++) {
          if ((model.depth[i] as number) + 1 >= o.level && exp[i]) {
            exp[i] = 0;
            expanded.delete(model.ids[i] as TreeKey);
          }
        }
      } else levelSet(undefined, o.ids, 0);
      flatten();
      notify(true);
    },
    expandedIds: () => [...expanded],
    loadStatus(node) {
      return loads.get(model.ids[node] as TreeKey)?.status ?? 'idle';
    },
    loadError(node) {
      return loads.get(model.ids[node] as TreeKey)?.error;
    },
    load(node) {
      startLoad(node);
      notify(false);
    },
    isSelected: (node) => selected.has(model.ids[node] as TreeKey),
    setSelected(ids) {
      selected = new Set(ids);
      notify(false);
    },
    checkState: (node) => checkStateOf(node),
    setChecked(node, checked) {
      if (node < 0 || node >= model.count) return;
      mark(node, checked);
      notify(false);
    },
    setCheckedIds(ids) {
      initChecks();
      for (const id of ids) {
        const i = model.index.get(id);
        if (i !== undefined) mark(i, true);
      }
      notify(false);
    },
    checkAll(ids) {
      if (ids) for (const id of ids) mark(model.index.get(id) ?? -1, true);
      else if (cascade()) {
        for (let i = 0; i < model.count; i += model.size[i] as number) mark(i, true);
        // Frozen subtrees are not reached by the root marks.
        if (freezeDisabled()) for (let i = 0; i < model.count; i++) if (boundary(i)) mark(i, true);
      } else for (let i = 0; i < model.count; i++) mark(i, true);
      notify(false);
    },
    uncheckAll(ids) {
      if (ids) for (const id of ids) mark(model.index.get(id) ?? -1, false);
      else initChecks();
      notify(false);
    },
    checkedIds() {
      const states = allStates();
      const out: TreeKey[] = [];
      for (let i = 0; i < model.count; i++) if (states[i] === 1) out.push(model.ids[i] as TreeKey);
      return out;
    },
    setFocused(id) {
      if (focusedId === id) return;
      focusedId = id;
      notify(false);
    },
    setRenaming(id) {
      if (renamingId === id) return;
      renamingId = id;
      notify(false);
    },
    bits(id) {
      const i = model.index.get(id);
      if (i === undefined) return 0;
      let b = 0;
      if (exp[i]) b |= BIT_EXPANDED;
      if (selected.has(id)) b |= BIT_SELECTED;
      const c = checkStateOf(i);
      if (c === 1) b |= BIT_CHECKED;
      else if (c === 2) b |= BIT_MIXED;
      const l = loads.get(id);
      if (l?.status === 'loading') b |= BIT_LOADING;
      else if (l?.status === 'error') b |= BIT_ERROR;
      if (focusedId === id) b |= BIT_FOCUSED;
      if (renamingId === id) b |= BIT_RENAMING;
      return b;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getVersion: () => version,
    getOrderVersion: () => orderVersion,
    getCheckVersion: () => checkVersion,
    batch(run) {
      depthOfBatch++;
      try {
        run();
      } finally {
        depthOfBatch--;
        if (depthOfBatch === 0 && dirty) {
          dirty = false;
          for (const l of [...listeners]) l();
        }
      }
    },
    dispose() {
      // Aborts pending loads; their late responses are dropped. The store stays
      // usable (React StrictMode unmounts and remounts effects).
      for (const entry of loads.values()) entry.controller?.abort();
      for (const [id, entry] of loads) if (entry.status === 'loading') loads.delete(id);
    },
  };
  return store;
}
