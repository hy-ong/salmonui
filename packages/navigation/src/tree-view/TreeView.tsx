'use client';
// TreeView: a virtualized APG tree over the
// framework-agnostic tree store (internal/tree-store). The store holds the
// model, visible order, expanded / selected / checked / load state and focus
// by id; React subscribes with narrow selectors (one number per row, the
// visible-order version, the tab stop). Scroll, drag and the rename draft
// never enter React state. Rename and pointer drag are lazy chunks.

import {
  lazy,
  memo,
  Suspense,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { holdInput, PRESS_EVENTS } from '@salmonui/core/internal/held-input';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { createFixedRowMetrics, createVariableRowMetrics, type RowMetrics } from '@salmonui/core/internal/virtual-list';
import {
  BIT_CHECKED,
  BIT_ERROR,
  BIT_EXPANDED,
  BIT_LOADING,
  BIT_MIXED,
  BIT_RENAMING,
  BIT_SELECTED,
  createTreeStore,
  DISABLED,
  HAS_CHILDREN,
  type TreeKey,
  type TreeStore,
} from '@salmonui/core/internal/tree-store';
import { createCollectionStore, type CollectionStore } from '@salmonui/core/internal/collection/store';
import { nextWindow, OVERSCAN, revealOffset, windowRange } from '@salmonui/core/internal/collection/virtual';
import { isTypeaheadKey, useTypeahead } from '@salmonui/core/internal/roving';
import { isRtl } from '@salmonui/core/internal/position';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { formatTreeViewText, TREE_VIEW_DEFAULT_LOCALE_TEXT, type TreeViewLocaleText } from './locale.js';
import type { TreeDragController } from './dnd.js';
import type {
  TreeViewApi,
  TreeViewDropPosition,
  TreeViewEventSource,
  TreeViewItemContext,
  TreeViewKey,
  TreeViewProps,
} from './types.js';

const ROW_HEIGHT = 32;
/** Rows the server renders when `height` is not a number. */
const SSR_ROWS = 20;
const NO_IDS: readonly TreeViewKey[] = Object.freeze([]);

const RenameEditor = lazy(() => import('./rename.js'));

function cx(...parts: (string | undefined | false | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

const keyOf = (id: TreeKey): string => (typeof id === 'number' ? `n${id}` : `s${id}`);

function cancelable<F extends object>(fields: F): F & { preventDefault(): void; readonly defaultPrevented: boolean } {
  let prevented = false;
  const event = {
    ...fields,
    preventDefault() {
      prevented = true;
    },
    get defaultPrevented() {
      return prevented;
    },
  };
  return DEV ? Object.freeze(event) : event;
}

function frozen<F extends object>(fields: F): F {
  return DEV ? Object.freeze(fields) : fields;
}

/** A stable object whose methods call the same-named methods of `ref.current` (read at call time). */
function forwarder<A extends object>(ref: { readonly current: A }): A {
  const stable: Record<string, unknown> = {};
  for (const key of Object.keys(ref.current)) stable[key] = (...args: unknown[]) => (ref.current as Record<string, (...a: unknown[]) => unknown>)[key]!(...args);
  return stable as A;
}

const sourceOfPointer = (pointerType: string | null): TreeViewEventSource => (pointerType === 'touch' ? 'touch' : 'pointer');

/** Everything rows read besides their own state (stable while these props are). */
interface RowContext<T> {
  readonly store: TreeStore<T>;
  readonly checkable: boolean;
  readonly selectable: boolean;
  readonly disabled: boolean;
  readonly draggable: boolean;
  readonly virtual: boolean;
  readonly text: TreeViewLocaleText;
  readonly renderItem: TreeViewProps<T>['renderItem'];
  readonly getItemIcon: TreeViewProps<T>['getItemIcon'];
  readonly getItemHref: TreeViewProps<T>['getItemHref'];
  readonly renderLink: TreeViewProps<T>['renderLink'];
  readonly getItemProps: TreeViewProps<T>['getItemProps'];
  readonly actions: Actions;
}

interface Actions {
  rowClick(id: TreeKey, event: ReactMouseEvent<HTMLElement>): void;
  rowDoubleClick(id: TreeKey, event: ReactMouseEvent<HTMLElement>): void;
  rowFocus(id: TreeKey): void;
  retry(id: TreeKey): void;
  commitRename(id: TreeKey, label: string | null): void;
  register(id: TreeKey, el: HTMLElement | null): void;
}

interface RowProps {
  readonly ctx: RowContext<unknown>;
  readonly id: TreeKey;
  readonly node: number;
  /** Model facts as props, so a rebuilt model re-renders only the rows that changed. */
  readonly item: unknown;
  readonly label: string;
  readonly level: number;
  readonly setsize: number;
  readonly posinset: number;
  readonly flags: number;
  readonly top: number | null;
  readonly tabStop: boolean;
}

/** One treeitem. Memoized: a state change re-renders only the rows whose bits changed. */
const TreeRow = memo(function TreeRow({ ctx, id, node, item, label, level, setsize, posinset, flags, top, tabStop }: RowProps): ReactNode {
  const { store, actions } = ctx;
  const bits = useSyncExternalStore(
    store.subscribe,
    () => store.bits(id),
    () => store.bits(id),
  );
  const hasKids = (flags & HAS_CHILDREN) !== 0;
  const expanded = hasKids && (bits & BIT_EXPANDED) !== 0;
  const selected = (bits & BIT_SELECTED) !== 0;
  const checked: boolean | 'mixed' = bits & BIT_MIXED ? 'mixed' : (bits & BIT_CHECKED) !== 0;
  const disabled = ctx.disabled || (flags & DISABLED) !== 0;
  const loading = (bits & BIT_LOADING) !== 0;
  const failed = (bits & BIT_ERROR) !== 0;
  const context: TreeViewItemContext<unknown> = {
    item,
    id,
    level,
    label,
    expanded,
    selected,
    checked,
    disabled,
    loading,
    error: failed ? store.loadError(node) : undefined,
    retry: () => actions.retry(id),
  };
  const href = ctx.getItemHref?.(item);
  // renderItem returning undefined keeps the default label; a link wraps either.
  let content: ReactNode = ctx.renderItem?.(context);
  if (content === undefined) content = label;
  if (href !== undefined) {
    const linkProps = { href, className: 'salmon-tree-view-link', tabIndex: -1 as const, children: content };
    content = ctx.renderLink ? ctx.renderLink(linkProps, item) : <a {...linkProps} />;
  }
  const icon = ctx.getItemIcon?.(item);
  const extra = ctx.getItemProps?.(item, context);
  const { className: extraClass, style: extraStyle, ...rest } = extra ?? {};
  const style: CSSProperties = { ...extraStyle, ['--salmon-tree-view-level' as string]: level - 1 };
  if (top !== null) style.insetBlockStart = top;
  return (
    <div
      {...rest}
      ref={(el) => {
        actions.register(id, el);
        return () => actions.register(id, null);
      }}
      role="treeitem"
      aria-level={level}
      aria-setsize={setsize}
      aria-posinset={posinset}
      aria-expanded={hasKids ? expanded : undefined}
      aria-selected={ctx.selectable ? selected : undefined}
      aria-checked={ctx.checkable ? checked : undefined}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      tabIndex={tabStop ? 0 : -1}
      className={cx('salmon-tree-view-item', extraClass as string | undefined)}
      style={style}
      data-expanded={expanded ? '' : undefined}
      data-selected={selected ? '' : undefined}
      data-checked={checked === true ? '' : undefined}
      data-mixed={checked === 'mixed' ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-loading={loading ? '' : undefined}
      data-error={failed ? '' : undefined}
      data-draggable={ctx.draggable && !disabled ? '' : undefined}
      onClick={(event) => actions.rowClick(id, event)}
      onDoubleClick={(event) => actions.rowDoubleClick(id, event)}
      onFocus={(event) => {
        if (event.target === event.currentTarget) actions.rowFocus(id);
      }}
    >
      <span className="salmon-tree-view-twisty" aria-hidden="true" data-part="twisty" data-leaf={hasKids ? undefined : ''} />
      {ctx.checkable ? <span className="salmon-tree-view-checkbox" aria-hidden="true" data-part="checkbox" /> : null}
      {icon != null && icon !== false ? (
        <span className="salmon-tree-view-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {bits & BIT_RENAMING ? (
        <Suspense fallback={<span className="salmon-tree-view-label">{label}</span>}>
          <RenameEditor label={label} ariaLabel={formatTreeViewText(ctx.text.rename, { label })} onDone={(value) => actions.commitRename(id, value)} />
        </Suspense>
      ) : (
        <span className="salmon-tree-view-label">{content}</span>
      )}
      {loading ? <span className="salmon-tree-view-status">{ctx.text.loading}</span> : null}
      {failed ? (
        <span className="salmon-tree-view-status" data-error="">
          {ctx.text.loadError}{' '}
          <button type="button" className="salmon-tree-view-retry" tabIndex={-1} data-part="retry">
            {ctx.text.retry}
          </button>
        </span>
      ) : null}
    </div>
  );
});

/**
 * A hierarchical list (WAI-ARIA APG Tree View) over `data`, virtualized by
 * default. `ref` receives the {@link TreeViewApi}.
 */
export function TreeView<T>(props: TreeViewProps<T>): ReactNode {
  const {
    data,
    getItemId,
    getItemLabel,
    getChildren,
    getParentId,
    hasChildren,
    loadChildren,
    onLoadError,
    isItemDisabled,
    getItemIcon,
    getItemHref,
    renderLink,
    getItemProps,
    renderItem,
    selection = 'single',
    selected,
    onBeforeSelectedChange,
    onSelectedChange,
    expanded,
    onBeforeExpandedChange,
    onExpandedChange,
    expandOn = 'auto',
    checkable = false,
    checked,
    defaultChecked,
    onBeforeCheckedChange,
    onCheckedChange,
    checkPropagation = 'cascade',
    cascadeToDisabled = true,
    checkOnClick = false,
    name,
    form,
    renamable = false,
    onBeforeRename,
    onRename,
    draggable = false,
    dragGroup,
    onBeforeMove,
    onMove,
    onItemClick,
    onKeyDown: userKeyDown,
    sort = null,
    locale: ownLocale,
    height,
    virtualize = true,
    textWrap = false,
    rowHighlight = 'full',
    disabled = false,
    localeText: ownText,
    className,
    style,
    ref,
    id: idProp,
    onScroll: userScroll,
    onPointerDown: userPointerDown,
    ...dom
  } = props;
  const locale = useLocale(ownLocale);
  const localeText = useLocaleText('treeView', ownText);
  const generatedId = useId();
  const treeId = idProp ?? generatedId;
  const text = useMemo(() => ({ ...TREE_VIEW_DEFAULT_LOCALE_TEXT, ...localeText }), [localeText]);

  // Latest props for handlers and the store's callbacks.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
    // Development only (folds away in production, leaving no empty effect).
    if (DEV) {
      const dupes = store.model.duplicates;
      if (dupes.length > 0) warnOnce(`tree-view-dupes-${treeId}`, `TreeView "${treeId}": item ids must be unique; duplicates: ${dupes.slice(0, 5).map(String).join(', ')}.`);
    }
  });

  // --- store ----------------------------------------------------------------------
  // The store's data options: read at creation, then synced by the layout effect below.
  const options = {
    data,
    getItemId,
    getItemLabel,
    getChildren,
    getParentId,
    hasChildren,
    isItemDisabled,
    sort,
    locale,
    checkPropagation,
    cascadeToDisabled,
    loadChildren: loadChildren ? (item: T, o: { readonly signal: AbortSignal }) => (latest.current.loadChildren as NonNullable<typeof loadChildren>)(item, o) : undefined,
  };
  const [store] = useState(() => {
    const s = createTreeStore<T>({ ...options, onLoadError: (error, item, id) => latest.current.onLoadError?.(error, item, id) });
    if (expanded) s.setExpandedIds(expanded, false);
    if (selected) s.setSelected(selected);
    const initialChecked = checked ?? defaultChecked;
    if (initialChecked) s.setCheckedIds(initialChecked);
    return s;
  });
  const [win] = useState<CollectionStore>(() => {
    const rows = typeof height === 'number' ? Math.max(1, Math.ceil(height / ROW_HEIGHT)) : SSR_ROWS;
    const range = windowRange(store.visibleCount, 0, rows);
    return createCollectionStore({ active: rows, first: range.first, last: range.last, itemHeight: ROW_HEIGHT, sticky: null });
  });
  const prev = useRef({ expanded, selected, checked });
  // Arrays the tree itself emitted: echoing them back as props is a no-op.
  const emitted = useRef<{ expanded: unknown; selected: unknown; checked: unknown }>({ expanded: null, selected: null, checked: null });

  useLayoutEffect(() => {
    store.setOptions(options);
  }, [store, data, getItemId, getItemLabel, getChildren, getParentId, hasChildren, isItemDisabled, sort, locale, checkPropagation, cascadeToDisabled, loadChildren !== undefined]);
  useLayoutEffect(() => {
    const p = prev.current;
    store.batch(() => {
      if (expanded !== p.expanded) {
        p.expanded = expanded;
        if (expanded && expanded !== emitted.current.expanded) store.setExpandedIds(expanded);
      }
      if (selected !== p.selected) {
        p.selected = selected;
        if (selected && selected !== emitted.current.selected) store.setSelected(selected);
      }
      if (checked !== p.checked) {
        p.checked = checked;
        if (checked && checked !== emitted.current.checked) store.setCheckedIds(checked);
      }
    });
  }, [store, expanded, selected, checked]);
  // Lazy loads of initially expanded nodes start after mount (never on the server).
  useEffect(() => {
    store.loadPending();
  }, [store]);
  useEffect(() => () => store.dispose(), [store]);

  // --- subscriptions ------------------------------------------------------------
  const tabStopOf = (): TreeKey | null => {
    const f = store.focusedId;
    if (f !== null) {
      const n = store.nodeOf(f);
      if (n >= 0 && store.positionOf(n) >= 0) return f;
    }
    if (store.selected.size > 0 && store.selected.size <= 64) {
      let best = -1;
      for (const id of store.selected) {
        const p = store.positionOf(store.nodeOf(id));
        if (p >= 0 && (best < 0 || p < best)) best = p;
      }
      if (best >= 0) return store.model.ids[store.order[best] as number] as TreeKey;
    }
    return store.visibleCount > 0 ? (store.model.ids[store.order[0] as number] as TreeKey) : null;
  };
  useSyncExternalStore(store.subscribe, store.getOrderVersion, store.getOrderVersion);
  const tabStop = useSyncExternalStore(store.subscribe, tabStopOf, tabStopOf);
  const busy = useSyncExternalStore(store.subscribe, store.isBusy, store.isBusy);
  const checkVersion = useSyncExternalStore(store.subscribe, () => (name ? store.getCheckVersion() : 0), () => (name ? store.getCheckVersion() : 0));
  const storeFirst = useSyncExternalStore(win.subscribe, () => win.getState().first, () => win.getState().first);
  const storeLast = useSyncExternalStore(win.subscribe, () => win.getState().last, () => win.getState().last);
  const itemHeight = useSyncExternalStore(win.subscribe, () => win.getState().itemHeight, () => win.getState().itemHeight);
  const visibleRows = useSyncExternalStore(win.subscribe, () => win.getState().active, () => win.getState().active);
  const [heightsVersion, setHeightsVersion] = useState(0);

  // --- metrics and window --------------------------------------------------------------
  const count = store.visibleCount;
  const order = store.order;
  const model = store.model;
  const heights = useRef(new Map<TreeKey, number>());
  const metrics: RowMetrics = useMemo(
    () => (textWrap ? createVariableRowMetrics(count, (p) => heights.current.get(model.ids[order[p] as number] as TreeKey) ?? itemHeight) : createFixedRowMetrics(count, itemHeight)),
    // heightsVersion: measured heights changed.
    [textWrap, count, order, model, itemHeight, heightsVersion],
  );
  let first = 0;
  let last = count;
  if (virtualize) {
    const ok = storeLast <= count && storeLast - storeFirst >= Math.min(count, visibleRows + OVERSCAN * 2);
    const range = ok ? { first: storeFirst, last: storeLast } : windowRange(count, storeFirst, visibleRows);
    first = range.first;
    last = range.last;
  }

  const rootRef = useRef<HTMLDivElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const elements = useRef(new Map<TreeKey, HTMLElement>());
  const pendingFocus = useRef<TreeKey | null>(null);
  const pendingReveal = useRef<number | null>(null);
  const anchor = useRef<TreeKey | null>(null);
  const lastPointer = useRef<string | null>(null);
  const typeahead = useTypeahead();

  function onScroll(): void {
    const el = rootRef.current;
    if (!el || !virtualize) return;
    const s = win.getState();
    const mtx = metricsRef.current;
    const start = mtx.indexAt(el.scrollTop);
    const end = mtx.indexAt(el.scrollTop + el.clientHeight) + 1;
    const visible = Math.max(1, end - start);
    const next = nextWindow({ first: s.first, last: s.last }, mtx.count, start, visible);
    win.set({ first: next.first, last: next.last, active: Math.max(visible, 1) });
  }
  const metricsRef = useRef(metrics);
  useLayoutEffect(() => {
    metricsRef.current = metrics;
  });

  // Row height (fixed mode) once; viewport rows after mount and on data size changes.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!textWrap) {
      const row = el.querySelector<HTMLElement>('.salmon-tree-view-item');
      const h = row?.offsetHeight ?? 0;
      if (h > 0 && h !== win.getState().itemHeight) win.set({ itemHeight: h });
    }
    if (el.clientHeight > 0) onScroll();
  }, [count > 0, textWrap]);
  // textWrap: measure the rendered rows after every commit (read phase only).
  useLayoutEffect(() => {
    if (!textWrap) return;
    let changed = false;
    for (const [id, el] of elements.current) {
      const h = el.offsetHeight;
      if (h > 0 && heights.current.get(id) !== h) {
        heights.current.set(id, h);
        changed = true;
      }
    }
    if (changed) setHeightsVersion((v) => v + 1);
  });
  // Keyboard focus follows the store's focused id once its row is rendered.
  useLayoutEffect(() => {
    const id = pendingFocus.current;
    if (id === null) return;
    const el = elements.current.get(id);
    if (!el) return;
    pendingFocus.current = null;
    if (el.ownerDocument.activeElement !== el) el.focus({ preventScroll: true });
  });
  // A reveal clamped by a list that had not grown yet runs once more after the commit.
  useLayoutEffect(() => {
    const pos = pendingReveal.current;
    if (pos === null) return;
    pendingReveal.current = null;
    reveal(pos);
    pendingReveal.current = null;
  });

  // --- helpers ----------------------------------------------------------------------
  const itemOf = (id: TreeKey): T | undefined => {
    const n = store.nodeOf(id);
    return n < 0 ? undefined : (store.model.items[n] as T);
  };
  const isDisabled = (n: number): boolean => disabled || ((store.model.flags[n] as number) & DISABLED) !== 0;
  const announce = (message: string): void => {
    if (liveRef.current) liveRef.current.textContent = message;
  };
  const reveal = (pos: number): void => {
    const el = rootRef.current;
    if (!el || pos < 0) return;
    const mtx = metricsRef.current;
    const top = mtx.offsetOf(pos);
    const h = mtx.offsetOf(pos + 1) - top;
    let next: number | null = null;
    if (top < el.scrollTop) next = top;
    else if (top + h > el.scrollTop + el.clientHeight) next = top + h - el.clientHeight;
    if (next === null && !textWrap) next = revealOffset(pos, itemHeight, el.scrollTop, el.clientHeight);
    if (next !== null) {
      el.scrollTop = next;
      // The rows just expanded (scrollToItem, focusItem) are not in the DOM yet, so the
      // browser clamped the offset: scroll again after the commit that grows the list.
      pendingReveal.current = el.scrollTop < next - 1 ? pos : null;
      onScroll();
    }
  };
  const focusId = (id: TreeKey, scroll = true): void => {
    pendingFocus.current = id;
    store.setFocused(id);
    if (scroll) reveal(store.positionOf(store.nodeOf(id)));
    const el = elements.current.get(id);
    if (el && el.ownerDocument.activeElement !== el) {
      pendingFocus.current = null;
      el.focus({ preventScroll: true });
    }
  };

  function emitExpanded(id: TreeKey | null, source: TreeViewEventSource): void {
    const handler = latest.current.onExpandedChange;
    if (!handler) return;
    const ids = store.expandedIds();
    emitted.current.expanded = ids;
    handler(frozen({ expanded: ids, id, item: id === null ? undefined : itemOf(id), source }));
  }
  function setExpanded(id: TreeKey, open: boolean, source: TreeViewEventSource): boolean {
    const n = store.nodeOf(id);
    if (n < 0 || !((store.model.flags[n] as number) & HAS_CHILDREN) || store.isExpanded(n) === open) return false;
    const before = latest.current.onBeforeExpandedChange;
    if (before) {
      const e = cancelable({ id, item: store.model.items[n] as T, expanded: open, source });
      before(e);
      if (e.defaultPrevented) return false;
    }
    const f = store.focusedId;
    store.batch(() => {
      if (!open && f !== null) {
        const fn = store.nodeOf(f);
        if (fn > n && fn < n + (store.model.size[n] as number)) focusId(id, false);
      }
      store.setExpanded(n, open);
    });
    emitExpanded(id, source);
    return true;
  }
  function commitSelected(next: readonly TreeKey[], id: TreeKey | null, source: TreeViewEventSource): void {
    const p = latest.current;
    if (p.onBeforeSelectedChange) {
      const e = cancelable({ selected: next, id, item: id === null ? undefined : itemOf(id), source });
      p.onBeforeSelectedChange(e);
      if (e.defaultPrevented) return;
    }
    store.setSelected(next);
    if (p.onSelectedChange) {
      emitted.current.selected = next;
      p.onSelectedChange(frozen({ selected: next, id, item: id === null ? undefined : itemOf(id), source }));
    }
  }
  function emitChecked(id: TreeKey | null, source: TreeViewEventSource): void {
    const handler = latest.current.onCheckedChange;
    if (!handler) return;
    let ids: TreeKey[] | null = null;
    const read = (): readonly TreeKey[] => {
      if (!ids) {
        ids = store.checkedIds();
        emitted.current.checked = ids;
      }
      return ids;
    };
    handler(
      frozen({
        get checked() {
          return read();
        },
        id,
        item: id === null ? undefined : itemOf(id),
        source,
      }),
    );
  }
  function toggleChecked(id: TreeKey, source: TreeViewEventSource): void {
    const n = store.nodeOf(id);
    if (n < 0 || !checkable || isDisabled(n)) return;
    const next = store.checkState(n) !== 1;
    const before = latest.current.onBeforeCheckedChange;
    if (before) {
      const e = cancelable({ id, item: store.model.items[n] as T, checked: next, source });
      before(e);
      if (e.defaultPrevented) return;
    }
    store.setChecked(n, next);
    emitChecked(id, source);
  }
  const selectable = selection !== 'none';
  const multiple = selection === 'multiple';
  const rangeIds = (fromPos: number, toPos: number): TreeKey[] => {
    const out: TreeKey[] = [];
    const lo = Math.max(0, Math.min(fromPos, toPos));
    const hi = Math.min(store.visibleCount - 1, Math.max(fromPos, toPos));
    for (let p = lo; p <= hi; p++) {
      const n = store.order[p] as number;
      if (!isDisabled(n)) out.push(store.model.ids[n] as TreeKey);
    }
    return out;
  };
  function selectFrom(id: TreeKey, mode: 'only' | 'toggle' | 'range', source: TreeViewEventSource): void {
    const n = store.nodeOf(id);
    if (!selectable || n < 0 || isDisabled(n)) return;
    if (mode === 'only' || !multiple) {
      if (store.selected.size === 1 && store.selected.has(id)) return;
      anchor.current = id;
      return commitSelected([id], id, source);
    }
    if (mode === 'toggle') {
      anchor.current = id;
      const next = store.selected.has(id) ? [...store.selected].filter((x) => x !== id) : [...store.selected, id];
      return commitSelected(next, id, source);
    }
    const a = anchor.current ?? id;
    const ap = store.positionOf(store.nodeOf(a));
    commitSelected(rangeIds(ap < 0 ? store.positionOf(n) : ap, store.positionOf(n)), id, source);
  }
  function selectAll(source: TreeViewEventSource): void {
    if (!multiple) return;
    const out: TreeKey[] = [];
    for (let n = 0; n < store.model.count; n++) if (!isDisabled(n)) out.push(store.model.ids[n] as TreeKey);
    commitSelected(out, null, source);
  }
  function activate(id: TreeKey, source: TreeViewEventSource): void {
    const item = itemOf(id);
    if (item === undefined) return;
    latest.current.onItemClick?.(frozen({ id, item, source }));
  }
  function startRename(id: TreeKey): void {
    const n = store.nodeOf(id);
    if (!renamable || n < 0 || isDisabled(n)) return;
    focusId(id);
    store.setRenaming(id);
  }
  function move(ids: readonly TreeKey[], items: readonly T[], targetId: TreeKey, position: TreeViewDropPosition, source: TreeViewEventSource, sourceTreeId: string | undefined): boolean {
    const p = latest.current;
    if (p.onBeforeMove) {
      const e = cancelable({ ids, items, targetId, position, sourceTreeId, source });
      p.onBeforeMove(e);
      if (e.defaultPrevented) return false;
    }
    p.onMove?.(frozen({ ids, items, targetId, position, sourceTreeId, source }));
    const target = itemOf(targetId);
    // Items dropped from another tree are not in this store: label them from the item itself.
    const first = ids[0] as TreeKey;
    const n = store.nodeOf(first);
    const label = n >= 0 ? store.label(n) : items[0] !== undefined && p.getItemLabel ? p.getItemLabel(items[0]) : String(first);
    announce(formatTreeViewText(text.moved, { label: ids.length === 1 ? label : String(ids.length), target: target === undefined ? '' : store.label(store.nodeOf(targetId)) }));
    return true;
  }
  /** Ids a drag or keyboard move takes: the selection when it contains `id`. */
  function movedIds(id: TreeKey): TreeKey[] {
    if (!store.selected.has(id) || store.selected.size < 2) return [id];
    // Selection in tree order, without items whose ancestor is also moved.
    const nodes = [...store.selected].map((x) => store.nodeOf(x)).filter((n) => n >= 0 && !isDisabled(n)).sort((a, b) => a - b);
    const out: TreeKey[] = [];
    let end = -1;
    for (const n of nodes) {
      if (n < end) continue;
      out.push(store.model.ids[n] as TreeKey);
      end = n + (store.model.size[n] as number);
    }
    return out;
  }
  function keyboardMove(id: TreeKey, key: string): void {
    const m = store.model;
    const n = store.nodeOf(id);
    if (n < 0 || isDisabled(n)) return;
    const parent = m.parent[n] as number;
    // Previous sibling: walk the parent's children (or the roots).
    let prevSib = -1;
    let nextSib = -1;
    let c = parent < 0 ? 0 : parent + 1;
    const end = parent < 0 ? m.count : parent + (m.size[parent] as number);
    while (c < end) {
      if (c === n) {
        const after = c + (m.size[c] as number);
        nextSib = after < end ? after : -1;
        break;
      }
      prevSib = c;
      c += m.size[c] as number;
    }
    let target = -1;
    let position: TreeViewDropPosition = 'before';
    if (key === 'ArrowUp' && prevSib >= 0) [target, position] = [prevSib, 'before'];
    else if (key === 'ArrowDown' && nextSib >= 0) [target, position] = [nextSib, 'after'];
    else if (key === 'ArrowRight' && prevSib >= 0) [target, position] = [prevSib, 'into'];
    else if (key === 'ArrowLeft' && parent >= 0) [target, position] = [parent, 'after'];
    if (target < 0) return;
    const ids = movedIds(id);
    move(ids, ids.map((x) => itemOf(x) as T), m.ids[target] as TreeKey, position, 'keyboard', undefined);
  }

  // --- event handlers --------------------------------------------------------------------
  const actions: Actions = {
    rowClick(id, event) {
      const target = event.target as HTMLElement;
      if (target.closest('input')) return;
      const source = event.detail === 0 ? 'keyboard' : sourceOfPointer(lastPointer.current);
      const n = store.nodeOf(id);
      if (n < 0) return;
      const part = target.closest('[data-part]')?.getAttribute('data-part');
      if (part === 'retry') {
        store.load(n);
        return;
      }
      store.setFocused(id);
      if (disabled) return;
      if (part === 'twisty') {
        if (!isDisabled(n)) setExpanded(id, !store.isExpanded(n), source);
        return;
      }
      if (part === 'checkbox') {
        toggleChecked(id, source);
        return;
      }
      const mod = event.ctrlKey || event.metaKey;
      selectFrom(id, event.shiftKey ? 'range' : mod ? 'toggle' : 'only', source);
      if (checkable && checkOnClick) toggleChecked(id, source);
      if (!isDisabled(n) && (expandOn === 'click' || (expandOn === 'auto' && source === 'touch'))) setExpanded(id, !store.isExpanded(n), source);
      activate(id, source);
      // a click anywhere on a link row follows the link.
      if (!target.closest('a') && !mod && !event.shiftKey) {
        const link = (event.currentTarget as HTMLElement).querySelector<HTMLElement>('.salmon-tree-view-label a');
        link?.click();
      }
    },
    rowDoubleClick(id, event) {
      const part = (event.target as HTMLElement).closest('[data-part]');
      const n = store.nodeOf(id);
      if (part || n < 0 || disabled || isDisabled(n)) return;
      if (expandOn === 'doubleClick' || (expandOn === 'auto' && lastPointer.current !== 'touch')) setExpanded(id, !store.isExpanded(n), 'pointer');
    },
    rowFocus(id) {
      store.setFocused(id);
    },
    retry(id) {
      const n = store.nodeOf(id);
      if (n >= 0) store.load(n);
    },
    commitRename(id, value) {
      const n = store.nodeOf(id);
      store.setRenaming(null);
      if (n >= 0) focusId(id, false);
      if (value === null || n < 0) return;
      const previousLabel = store.label(n);
      const label = value.trim();
      if (label === '' || label === previousLabel) return;
      const item = store.model.items[n] as T;
      const p = latest.current;
      if (p.onBeforeRename) {
        const e = cancelable({ id, item, label, previousLabel, source: 'keyboard' as const });
        p.onBeforeRename(e);
        if (e.defaultPrevented) return;
      }
      p.onRename?.(frozen({ id, item, label, previousLabel, source: 'keyboard' as const }));
    },
    register(id, el) {
      if (el) elements.current.set(id, el);
      else elements.current.delete(id);
    },
  };

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    userKeyDown?.(event);
    if (event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.getAttribute('role') !== 'treeitem') return;
    const id = tabStopOf();
    if (id === null) return;
    const n = store.nodeOf(id);
    const pos = store.positionOf(n);
    if (pos < 0) return;
    const m = store.model;
    const mod = event.ctrlKey || event.metaKey;
    const rtl = isRtl(rootRef.current);
    let key = event.key;
    if (rtl && key === 'ArrowLeft') key = 'ArrowRight';
    else if (rtl && key === 'ArrowRight') key = 'ArrowLeft';
    const idAt = (p: number): TreeKey => m.ids[store.order[p] as number] as TreeKey;
    const moveTo = (p: number, extend: boolean): void => {
      const next = idAt(p);
      focusId(next);
      if (extend && multiple) selectFrom(next, 'range', 'keyboard');
      else if (!extend) anchor.current = anchor.current ?? id;
    };
    if (event.altKey && draggable && !disabled && key.startsWith('Arrow')) {
      event.preventDefault();
      keyboardMove(id, key);
      return;
    }
    switch (key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        const p = Math.max(0, Math.min(store.visibleCount - 1, pos + (key === 'ArrowDown' ? 1 : -1)));
        if (event.shiftKey && multiple && anchor.current === null) anchor.current = id;
        moveTo(p, event.shiftKey);
        return;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (!((m.flags[n] as number) & HAS_CHILDREN)) return;
        if (!store.isExpanded(n)) {
          if (!disabled && !isDisabled(n)) setExpanded(id, true, 'keyboard');
        } else if (pos + 1 < store.visibleCount && (m.parent[store.order[pos + 1] as number] as number) === n) moveTo(pos + 1, false);
        return;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (store.isExpanded(n) && (m.flags[n] as number) & HAS_CHILDREN && !disabled && !isDisabled(n)) setExpanded(id, false, 'keyboard');
        else if ((m.parent[n] as number) >= 0) focusId(m.ids[m.parent[n] as number] as TreeKey);
        return;
      }
      case 'Home':
      case 'End': {
        event.preventDefault();
        const p = key === 'Home' ? 0 : store.visibleCount - 1;
        if (event.shiftKey && mod && multiple) {
          anchor.current ??= id;
          moveTo(p, true);
        } else moveTo(p, false);
        return;
      }
      case 'Enter': {
        event.preventDefault();
        if (!disabled) selectFrom(id, 'only', 'keyboard');
        activate(id, 'keyboard');
        elements.current.get(id)?.querySelector<HTMLElement>('.salmon-tree-view-label a')?.click();
        return;
      }
      case ' ': {
        event.preventDefault();
        if (disabled) return;
        if (event.shiftKey && multiple) selectFrom(id, 'range', 'keyboard');
        else if (checkable) toggleChecked(id, 'keyboard');
        else selectFrom(id, multiple ? 'toggle' : 'only', 'keyboard');
        return;
      }
      case 'F2': {
        if (!renamable) return;
        event.preventDefault();
        startRename(id);
        return;
      }
      case '*': {
        event.preventDefault();
        if (disabled) return;
        // Expand every sibling of the focused item (one flatten).
        const parent = m.parent[n] as number;
        const ids: TreeKey[] = [];
        const end = parent < 0 ? m.count : parent + (m.size[parent] as number);
        for (let c = parent < 0 ? 0 : parent + 1; c < end; c += m.size[c] as number) {
          if ((m.flags[c] as number) & HAS_CHILDREN && !store.isExpanded(c) && !isDisabled(c)) ids.push(m.ids[c] as TreeKey);
        }
        if (ids.length === 0) return;
        const before = latest.current.onBeforeExpandedChange;
        const allowed = before
          ? ids.filter((x) => {
              const e = cancelable({ id: x, item: itemOf(x) as T, expanded: true, source: 'keyboard' as const });
              before(e);
              return !e.defaultPrevented;
            })
          : ids;
        for (const x of allowed) store.setExpanded(store.nodeOf(x), true);
        if (allowed.length) emitExpanded(null, 'keyboard');
        return;
      }
    }
    if ((event.key === 'a' || event.key === 'A') && mod && !event.altKey) {
      if (!multiple || disabled) return;
      event.preventDefault();
      selectAll('keyboard');
      return;
    }
    if (isTypeaheadKey(event)) {
      const p = typeahead(event.key, event.timeStamp, store.visibleCount, pos, (q) => store.label(store.order[q] as number), () => true);
      if (p >= 0) {
        event.preventDefault();
        focusId(idAt(p));
      }
    }
  }

  // --- api ----------------------------------------------------------------------------
  const api: TreeViewApi<T> = {
    scrollToItem(id) {
      const n = store.nodeOf(id);
      if (n < 0) return;
      const ancestors: TreeKey[] = [];
      for (let p = store.model.parent[n] as number; p >= 0; p = store.model.parent[p] as number) if (!store.isExpanded(p)) ancestors.push(store.model.ids[p] as TreeKey);
      if (ancestors.length) {
        store.expandAll({ ids: ancestors });
        emitExpanded(null, 'api');
      }
      reveal(store.positionOf(store.nodeOf(id)));
    },
    focusItem(id) {
      if (store.nodeOf(id) < 0) return;
      api.scrollToItem(id);
      focusId(id);
    },
    getItem(id) {
      const n = store.nodeOf(id);
      if (n < 0) return undefined;
      const m = store.model;
      const c = store.checkState(n);
      return frozen({
        item: m.items[n] as T,
        id,
        level: (m.depth[n] as number) + 1,
        parentId: (m.parent[n] as number) < 0 ? null : (m.ids[m.parent[n] as number] as TreeKey),
        expanded: store.isExpanded(n),
        selected: store.selected.has(id),
        checked: c === 2 ? ('mixed' as const) : c === 1,
        disabled: isDisabled(n),
        visible: store.positionOf(n) >= 0,
      });
    },
    expandAll(o) {
      store.expandAll(o);
      emitExpanded(null, 'api');
    },
    collapseAll(o) {
      store.collapseAll(o);
      emitExpanded(null, 'api');
    },
    checkAll(ids) {
      store.checkAll(ids);
      emitChecked(null, 'api');
    },
    uncheckAll(ids) {
      store.uncheckAll(ids);
      emitChecked(null, 'api');
    },
    getCheckedIds: () => store.checkedIds(),
    getSelectedIds: () => [...store.selected],
    getExpandedIds: () => store.expandedIds(),
    startRename,
  };
  const apiRef = useRef(api);
  useLayoutEffect(() => {
    apiRef.current = api;
  });
  useImperativeHandle(ref, () => forwarder(apiRef), []);
  const actionsRef = useRef(actions);
  useLayoutEffect(() => {
    actionsRef.current = actions;
  });
  const stableActions = useMemo(() => forwarder(actionsRef), []);

  // --- drag and drop (lazy chunk) ---------------------------------------------------------------
  const dragRef = useRef<TreeDragController | null>(null);
  const dragController: TreeDragController = {
    treeId,
    group: dragGroup,
    idOf: (el) => {
      for (const [id, row] of elements.current) if (row === el) return id;
      return undefined;
    },
    canDrag: (id) => !disabled && store.nodeOf(id) >= 0 && !isDisabled(store.nodeOf(id)),
    dragIds: (id) => movedIds(id),
    itemsOf: (ids) => ids.map((x) => itemOf(x) as T),
    accepts: (targetId, ids, sameTree) => {
      const t = store.nodeOf(targetId);
      if (t < 0 || isDisabled(t)) return false;
      if (!sameTree) return true;
      // Not onto a moved item or into its own subtree.
      for (const x of ids) {
        const n = store.nodeOf(x);
        if (n >= 0 && t >= n && t < n + (store.model.size[n] as number)) return false;
      }
      return true;
    },
    drop: (ids, items, targetId, position, sourceTreeId) => move(ids, items as readonly T[], targetId, position, 'pointer', sourceTreeId),
  };
  useLayoutEffect(() => {
    dragRef.current = dragController;
  });
  // A layout effect: the hold is in place before the first paint.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!draggable || !root) return;
    let cleanup: (() => void) | null = null;
    let live = true;
    // A press before the chunk is held and continues once it attaches.
    const held = holdInput(root, PRESS_EVENTS);
    void import('./dnd.js').then((m) => {
      const events = held();
      if (live) cleanup = m.attachTreeDrag(root, () => dragRef.current as TreeDragController, events);
    }, held);
    return () => {
      live = false;
      held();
      cleanup?.();
    };
  }, [draggable]);

  // --- form ---------------------------------------------------------------------------------
  const resetValue = useRef(defaultChecked ?? checked ?? NO_IDS);
  useEffect(() => {
    if (!name) return;
    const owner = form ? rootRef.current?.ownerDocument.getElementById(form) : rootRef.current?.closest('form');
    if (!owner) return;
    const onReset = (): void => {
      store.setCheckedIds(resetValue.current);
      emitChecked(null, 'api');
    };
    owner.addEventListener('reset', onReset);
    return () => owner.removeEventListener('reset', onReset);
  });
  const hiddenInputs = useMemo(
    () => (name ? store.checkedIds().map((id) => <input key={keyOf(id)} type="hidden" name={name} value={String(id)} form={form} />) : null),
    // checkVersion: a check changed.
    [name, form, checkVersion, store],
  );

  // --- render -------------------------------------------------------------------------------------
  const ctx = useMemo<RowContext<unknown>>(
    () => ({
      store: store as TreeStore<unknown>,
      checkable,
      selectable,
      disabled,
      draggable,
      virtual: virtualize,
      text,
      renderItem: renderItem as RowContext<unknown>['renderItem'],
      getItemIcon: getItemIcon as RowContext<unknown>['getItemIcon'],
      getItemHref: getItemHref as RowContext<unknown>['getItemHref'],
      renderLink: renderLink as RowContext<unknown>['renderLink'],
      getItemProps: getItemProps as RowContext<unknown>['getItemProps'],
      actions: stableActions,
    }),
    [store, checkable, selectable, disabled, draggable, virtualize, text, renderItem, getItemIcon, getItemHref, renderLink, getItemProps, stableActions],
  );
  const row = (p: number, node: number, id: TreeKey): ReactNode => {
    const parentNode = model.parent[node] as number;
    return (
      <TreeRow
        key={keyOf(id)}
        ctx={ctx}
        id={id}
        node={node}
        item={model.items[node]}
        label={store.label(node)}
        level={(model.depth[node] as number) + 1}
        setsize={parentNode < 0 ? model.rootCount : (model.childCount[parentNode] as number)}
        posinset={(model.rank[node] as number) + 1}
        flags={model.flags[node] as number}
        top={virtualize ? metrics.offsetOf(p) : null}
        tabStop={id === tabStop}
      />
    );
  };
  const rows: ReactNode[] = [];
  let tabStopRendered = false;
  for (let p = first; p < last; p++) {
    const node = order[p] as number;
    const id = model.ids[node] as TreeKey;
    if (id === tabStop) tabStopRendered = true;
    rows.push(row(p, node, id));
  }
  if (!tabStopRendered && tabStop !== null) {
    // The focused row stays rendered out of the window: one tab stop, focus never falls to <body>.
    const node = store.nodeOf(tabStop);
    const p = store.positionOf(node);
    if (p >= 0) rows.push(row(p, node, tabStop));
  }

  return (
    <>
      <div
        {...dom}
        id={idProp}
        ref={rootRef}
        role="tree"
        aria-multiselectable={multiple || undefined}
        aria-disabled={disabled || undefined}
        aria-busy={busy || undefined}
        className={cx('salmon-tree-view', className)}
        style={height === undefined ? style : { blockSize: height, ...style }}
        data-virtual={virtualize ? '' : undefined}
        data-wrap={textWrap ? '' : undefined}
        data-highlight={rowHighlight}
        data-checkable={checkable ? '' : undefined}
        data-disabled={disabled ? '' : undefined}
        onKeyDown={onKeyDown}
        onScroll={(event) => {
          userScroll?.(event);
          onScroll();
        }}
        onPointerDown={(event) => {
          userPointerDown?.(event);
          lastPointer.current = event.pointerType;
        }}
      >
        <div className="salmon-tree-view-sizer" style={virtualize ? { blockSize: metrics.totalHeight } : undefined}>
          {rows}
        </div>
      </div>
      {hiddenInputs}
      {draggable ? <div ref={liveRef} className="salmon-tree-view-live" role="status" aria-live="polite" /> : null}
    </>
  );
}
