'use client';
// Kanban. The board model is
// pure (model.ts), memoized per data, columns and options; cards are
// memoized rows that subscribe to the focus store for their tab stop.
// Scroll, measurement and drag transients never enter React state: virtual
// card windows live in per-cell stores (window.ts), pointer and keyboard
// drag in the lazy drag chunk (drag.ts on internal/dnd), and the editor is a
// lazy chunk behind a native <dialog> (editor.tsx).
//
// Roles: the board is an ARIA grid in which every cell of the
// board (a column, or a column in a swimlane) is a `row` with a visually
// hidden `rowheader` naming the column, and every card is a `gridcell`
// (`aria-selected`, interactive content allowed). Visual columns are ARIA
// rows, so Left / Right move between ARIA rows and Up / Down along them; the
// column headers with their buttons sit above the grid.

import {
  Fragment,
  isValidElement,
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
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { holdInput, PRESS_EVENTS } from '@salmonui/core/internal/held-input';
import { announce, liveRegionProps } from '@salmonui/core/internal/live-region';
import { isRtl } from '@salmonui/core/internal/position';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { DEV } from '@salmonui/core/internal/dev';
import { useLocaleText } from '@salmonui/core/internal/locale';
import { buildBoard, canDropInto, fieldOf, keyOf, limitOf, moveRows, navigate, withField, type BoardModel, type CardEntry, type CardPlace, type ColumnInfo, type LaneInfo } from './model.js';
import { createCardWindow } from './window.js';
import { formatKanbanText, KANBAN_DEFAULT_LOCALE_TEXT, type KanbanLocaleText } from './locale.js';
import type { KanbanDragController, KanbanDragModule, KeyboardDrag } from './drag.js';
import type {
  KanbanApi,
  KanbanCardContext,
  KanbanCardFields,
  KanbanCardProps,
  KanbanCellRef,
  KanbanColumnDef,
  KanbanColumnProps,
  KanbanDataSource,
  KanbanEditing,
  KanbanEditorField,
  KanbanEventSource,
  KanbanKey,
  KanbanProps,
} from './types.js';

const GAP = 8;
const ESTIMATE = 88;
/** Cards a virtual cell renders before it is measured (server and first client render). */
const SSR_CARDS = 12;
const NO_KEYS: readonly KanbanKey[] = Object.freeze([]);
const EMPTY: readonly never[] = Object.freeze([]);
const NO_EXPANSION = { groups: {}, tree: {}, detail: {}, defaultGroupExpanded: true } as const;

const Editor = lazy(() => import('./editor.js'));

function cx(...parts: (string | undefined | false | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

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

const isSource = <T,>(data: readonly T[] | KanbanDataSource<T>): data is KanbanDataSource<T> => !Array.isArray(data);
const sourceOf = (e: { pointerType?: string } | null | undefined): KanbanEventSource => (e?.pointerType === 'touch' ? 'touch' : 'pointer');
const text$ = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/**
 * A column declared as an element (`<Kanban><KanbanColumn columnKey="todo" header="To do" /></Kanban>`).
 * Renders nothing itself: the board reads the props of its direct
 * `KanbanColumn` children (and fragments), so the columns are in the
 * server HTML without a registration effect.
 */
export function KanbanColumn(_props: KanbanColumnProps): null {
  return null;
}

function columnsFromChildren(children: ReactNode, out: KanbanColumnDef[] = []): KanbanColumnDef[] {
  if (Array.isArray(children)) for (const c of children as ReactNode[]) columnsFromChildren(c, out);
  else if (isValidElement(children)) {
    if (children.type === KanbanColumn) {
      const { columnKey, ...rest } = children.props as KanbanColumnProps;
      out.push(columnKey === undefined ? rest : { ...rest, key: columnKey });
    }
    else if (children.type === Fragment) columnsFromChildren((children.props as { children?: ReactNode }).children, out);
  }
  return out;
}

interface FocusStore {
  get(): string | null;
  set(key: string | null): void;
  subscribe(listener: () => void): () => void;
}

function createFocusStore(): FocusStore {
  let current: string | null = null;
  const listeners = new Set<() => void>();
  return {
    get: () => current,
    set(key) {
      if (key === current) return;
      current = key;
      for (const l of listeners) l();
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

interface CellApi {
  readonly el: HTMLElement;
  reveal(index: number): void;
}

/** What cells and cards read besides their own props (stable while these props are). */
interface BoardCtx {
  readonly focus: FocusStore;
  readonly firstKey: string | null;
  readonly text: KanbanLocaleText;
  readonly fields: KanbanCardFields;
  readonly renderCard: ((ctx: KanbanCardContext<unknown>) => ReactNode) | undefined;
  readonly getCardProps: ((ctx: KanbanCardContext<unknown>) => KanbanCardProps | undefined) | undefined;
  readonly selectable: boolean;
  readonly draggable: boolean;
  readonly instructionsId: string;
  readonly virtual: boolean;
  readonly cardHeight: number | 'auto';
  readonly initialRows: number;
  readonly cells: Map<string, CellApi>;
}

interface CardProps {
  readonly ctx: BoardCtx;
  readonly entry: CardEntry<unknown>;
  readonly columnKey: KanbanKey;
  readonly laneKey: KanbanKey | null;
  readonly index: number;
  readonly selected: boolean;
}

/** One card (`gridcell`). Memoized: a selection or focus change re-renders only the cards it touches. */
const Card = memo(function Card({ ctx, entry, columnKey, laneKey, index, selected }: CardProps): ReactNode {
  const { focus, fields } = ctx;
  const tab = useSyncExternalStore(
    focus.subscribe,
    () => (focus.get() ?? ctx.firstKey) === entry.key,
    () => ctx.firstKey === entry.key,
  );
  // A virtual window can unmount the focused card and mount it again (a
  // remeasured window, scrolling back): the new element takes the focus back
  // when it was lost to the body.
  const self = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = self.current;
    const active = el?.ownerDocument.activeElement;
    if (el && focus.get() === entry.key && (!active || active === el.ownerDocument.body)) el.focus({ preventScroll: true });
  }, [focus, entry.key]);
  const c: KanbanCardContext<unknown> = { card: entry.card, id: entry.id, columnKey, swimlaneKey: laneKey, index, selected };
  const extra = ctx.getCardProps?.(c);
  const accent = fieldOf(entry.card, fields.accentField);
  const fixed = typeof ctx.cardHeight === 'number' ? ctx.cardHeight : undefined;
  const style: CSSProperties | undefined =
    accent || fixed !== undefined || extra?.style ? { ...(accent ? ({ '--salmon-kanban-accent': String(accent) } as CSSProperties) : null), ...(fixed !== undefined ? { blockSize: fixed } : null), ...extra?.style } : undefined;
  let body: ReactNode;
  if (ctx.renderCard) body = ctx.renderCard(c);
  else {
    const raw = fieldOf(entry.card, fields.tagsField);
    const tags = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' && raw ? raw.split(',').map((t) => t.trim()) : EMPTY;
    const content = fieldOf(entry.card, fields.contentField);
    body = (
      <>
        <div className="salmon-kanban-card-header">{fields.headerField ? text$(fieldOf(entry.card, fields.headerField)) : String(entry.id)}</div>
        {content !== undefined && content !== null && content !== '' ? <div className="salmon-kanban-card-content">{String(content)}</div> : null}
        {tags.length ? (
          <div className="salmon-kanban-card-tags">
            {tags.map((t, i) => (
              <span key={i} className="salmon-kanban-tag">
                {t}
              </span>
            ))}
          </div>
        ) : null}
      </>
    );
  }
  const { className: extraClass, style: _s, ...rest } = extra ?? {};
  return (
    <div
      {...rest}
      ref={self}
      role="gridcell"
      className={cx('salmon-kanban-card', extraClass)}
      style={style}
      data-card={entry.key}
      data-accent={accent ? '' : undefined}
      tabIndex={tab ? 0 : -1}
      aria-selected={ctx.selectable ? selected : undefined}
      aria-roledescription={ctx.text.card}
      aria-describedby={ctx.draggable ? ctx.instructionsId : undefined}
    >
      {body}
    </div>
  );
});

interface CellProps {
  readonly ctx: BoardCtx;
  readonly laneIndex: number;
  readonly colIndex: number;
  readonly lane: LaneInfo;
  readonly column: ColumnInfo;
  readonly entries: readonly CardEntry<unknown>[];
  readonly collapsed: boolean;
  readonly limit: string | undefined;
  readonly label: string;
  readonly selected: ReadonlySet<string> | null;
  readonly addLabel: string | null;
}

/** One board cell (`row`): a column, or a column within a swimlane. Virtualized cells scroll on their own. */
const Cell = memo(function Cell({ ctx, laneIndex, colIndex, lane, column, entries, collapsed, limit, label, selected, addLabel }: CellProps): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const virtual = ctx.virtual && !collapsed;
  const fixed = typeof ctx.cardHeight === 'number';
  const estimate = (fixed ? (ctx.cardHeight as number) : ESTIMATE) + GAP;
  const [win] = useState(() => createCardWindow(entries.length, estimate, fixed, ctx.initialRows));
  const range = useSyncExternalStore(win.subscribe, win.get, () => win.initial);
  const id = `${laneIndex}:${colIndex}`;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (virtual) win.sync(entries.map((e) => e.key), el.scrollTop, el.clientHeight);
  }, [entries, virtual, win]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const api: CellApi = {
      el,
      reveal(index) {
        if (!virtual) {
          el.querySelectorAll<HTMLElement>('[data-card]')[index]?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
          return;
        }
        const top = win.offsetOf(index);
        if (top < el.scrollTop || top + estimate > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - GAP);
        win.scroll(el.scrollTop, el.clientHeight);
      },
    };
    ctx.cells.set(id, api);
    return () => {
      if (ctx.cells.get(id) === api) ctx.cells.delete(id);
    };
  }, [ctx, id, virtual, win, estimate]);
  // Measured heights (variable cards only); the observer reports every rendered card once and on resize.
  const observer = useRef<ResizeObserver | null>(null);
  useEffect(() => {
    if (!virtual || fixed || typeof ResizeObserver === 'undefined') return;
    // Heights apply in the next frame: applying them inside the observer
    // callback renders and observes new cards in the same frame, which the
    // browser reports as a "ResizeObserver loop" error.
    const pending = new Map<string, number>();
    let frame = 0;
    const flush = (): void => {
      frame = 0;
      for (const [key, h] of pending) win.measure(key, h);
      pending.clear();
    };
    const ro = new ResizeObserver((records) => {
      for (const r of records) {
        const key = (r.target as HTMLElement).dataset['card'];
        const h = r.borderBoxSize?.[0]?.blockSize ?? (r.target as HTMLElement).offsetHeight;
        if (key && h > 0) pending.set(key, h + GAP);
      }
      if (!frame && pending.size) frame = requestAnimationFrame(flush);
    });
    observer.current = ro;
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      observer.current = null;
    };
  }, [virtual, fixed, win]);
  useLayoutEffect(() => {
    const ro = observer.current;
    if (!ro || !ref.current) return;
    for (const el of ref.current.querySelectorAll(':scope > [data-card]')) ro.observe(el);
  });

  const n = entries.length;
  const start = virtual ? Math.min(range.start, n) : 0;
  const end = virtual ? Math.min(range.end, n) : n;
  const cards: ReactNode[] = [];
  if (!collapsed)
    for (let i = start; i < end; i++) {
      const e = entries[i] as CardEntry<unknown>;
      cards.push(<Card key={e.key} ctx={ctx} entry={e} columnKey={column.id} laneKey={lane.key} index={i} selected={selected?.has(e.key) ?? false} />);
    }
  return (
    <div
      ref={ref}
      role="row"
      className={cx('salmon-kanban-cell', column.def.className)}
      data-li={laneIndex}
      data-ci={colIndex}
      data-column={String(column.id)}
      data-limit={limit}
      data-collapsed={collapsed ? '' : undefined}
      data-virtual={virtual ? '' : undefined}
      onScroll={virtual ? (e) => win.scroll(e.currentTarget.scrollTop, e.currentTarget.clientHeight) : undefined}
    >
      <div role="rowheader" className="salmon-visually-hidden">
        {label}
      </div>
      {virtual && start > 0 ? <div className="salmon-kanban-spacer" aria-hidden="true" style={{ blockSize: range.top }} /> : null}
      {cards}
      {virtual && end < n ? <div className="salmon-kanban-spacer" aria-hidden="true" style={{ blockSize: range.bottom > 0 ? range.bottom : (n - end) * estimate }} /> : null}
      {!collapsed && n === 0 ? (
        <div role="gridcell" className="salmon-kanban-empty">
          {ctx.text.empty}
        </div>
      ) : null}
      {!collapsed && addLabel ? (
        <div role="gridcell" className="salmon-kanban-add-cell">
          <button type="button" className="salmon-kanban-add" data-add="" aria-label={addLabel}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
              <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
            {ctx.text.add}
          </button>
        </div>
      ) : null}
    </div>
  );
});

const Chevron = (): ReactNode => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </svg>
);

const Grip = (): ReactNode => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
    <path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface TipState {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly above: boolean;
}

/** The Kanban board. */
export function Kanban<T>(props: KanbanProps<T>): ReactNode {
  const {
    data,
    getCardId,
    columnField,
    columns: columnsProp,
    children,
    showEmptyColumns = true,
    collapsedColumns,
    defaultCollapsedColumns,
    onCollapsedColumnsChange,
    limitScope = 'column',
    columnGroups,
    swimlanes,
    card: cardFields,
    renderCard,
    cardHeight = 'auto',
    getCardProps,
    selection = 'single',
    selectedCards,
    defaultSelectedCards,
    onSelectedCardsChange,
    sort,
    filter,
    query,
    loading: loadingProp,
    cardsDraggable = false,
    onCardMove,
    dragGroup,
    dropTargets,
    columnsReorderable = false,
    columnOrder: columnOrderProp,
    defaultColumnOrder,
    onColumnOrderChange,
    onCardChange,
    onCardAdd,
    newCard,
    editor,
    renderEditor,
    editing: editingProp,
    defaultEditing,
    onEditingChange,
    tooltip,
    virtualization = false,
    height,
    onCardClick,
    onCardDoubleClick,
    onDataError,
    localeText: ownText,
    className,
    style,
    ref,
    id: idProp,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    ...dom
  } = props;
  const generatedId = useId();
  const boardId = idProp ?? generatedId;
  const localeText = useLocaleText('kanban', ownText);
  const text = useMemo(() => ({ ...KANBAN_DEFAULT_LOCALE_TEXT, ...localeText }), [localeText]);
  const hydrated = useHydrated();
  const rootRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef(0);

  // --- data: a copy of the array (reset when `data` changes) or the rows of the last source read ---
  const source = isSource(data) ? data : null;
  const [store, setStore] = useState<{ data: unknown; rows: readonly T[] }>(() => ({ data, rows: source ? EMPTY : (data as readonly T[]) }));
  let rows = store.rows;
  if (store.data !== data) {
    rows = source ? store.rows : (data as readonly T[]);
    setStore({ data, rows });
  }
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(source ? 'loading' : 'ready');
  const loading = loadingProp ?? (source !== null && status === 'loading');

  const columnDefs = useMemo(() => columnsProp ?? columnsFromChildren(children), [columnsProp, children]);
  const [collapsed, setCollapsed] = useControllableState(collapsedColumns, defaultCollapsedColumns ?? NO_KEYS, onCollapsedColumnsChange, 'Kanban collapsedColumns');
  const [selectedIds, setSelected] = useControllableState(selectedCards, defaultSelectedCards ?? NO_KEYS, onSelectedCardsChange, 'Kanban selectedCards');
  const [columnOrder, setColumnOrder] = useControllableState(columnOrderProp, defaultColumnOrder ?? NO_KEYS, onColumnOrderChange, 'Kanban columnOrder');
  const [editingRaw, setEditing] = useControllableState<KanbanEditing, [{ source: KanbanEventSource }]>(editingProp, defaultEditing ?? null, onEditingChange, 'Kanban editing');
  const editing = hydrated ? editingRaw : null;

  const model = useMemo(
    () =>
      buildBoard<T>({
        rows,
        getCardId,
        columnField,
        columns: columnDefs,
        columnOrder,
        showEmptyColumns,
        swimlanes,
        sort,
        filter,
        unassignedLabel: text.unassigned,
      }),
    [rows, getCardId, columnField, columnDefs, columnOrder, showEmptyColumns, swimlanes, sort, filter, text.unassigned],
  );
  const collapsedSet = useMemo(() => new Set(collapsed.map(String)), [collapsed]);
  const selectedSet = useMemo(() => (selection === 'none' || selectedIds.length === 0 ? null : new Set(selectedIds.map(keyOf))), [selectedIds, selection]);
  const isCollapsed = (col: number): boolean => collapsedSet.has(String(model.columns[col]?.id));
  const virtual = virtualization && !model.hasLanes;
  const fields = cardFields ?? EMPTY_FIELDS;
  const instructionsId = `${boardId}-dnd`;

  const [focus] = useState(createFocusStore);
  const cells = useMemo(() => new Map<string, CellApi>(), []);
  const firstKey = useMemo(() => {
    for (const lane of model.cells) for (let c = 0; c < lane.length; c++) if (!collapsedSet.has(String(model.columns[c]?.id)) && lane[c]!.length) return lane[c]![0]!.key;
    return null;
  }, [model, collapsedSet]);
  const initialRows = typeof height === 'number' ? Math.ceil(height / ((typeof cardHeight === 'number' ? cardHeight : ESTIMATE) + GAP)) + 2 : SSR_CARDS;
  const ctx = useMemo<BoardCtx>(
    () => ({
      focus,
      firstKey,
      text,
      fields,
      renderCard: renderCard as BoardCtx['renderCard'],
      getCardProps: getCardProps as BoardCtx['getCardProps'],
      selectable: selection !== 'none',
      draggable: cardsDraggable,
      instructionsId,
      virtual,
      cardHeight,
      initialRows,
      cells,
    }),
    [focus, firstKey, text, fields, renderCard, getCardProps, selection, cardsDraggable, instructionsId, virtual, cardHeight, initialRows, cells],
  );

  // Latest values for handlers, effects and the drag chunk.
  const latest = useRef({ props, model, rows, selectedIds, collapsedSet, text });
  useLayoutEffect(() => {
    latest.current = { props, model, rows, selectedIds, collapsedSet, text };
    // A focused card that left the board gives the tab stop back to the first card.
    const f = focus.get();
    if (f !== null && !model.byKey.has(f)) focus.set(null);
  });

  const say = (message: string): void => announce(liveRef.current, message);
  const entryAt = (p: CardPlace): CardEntry<T> | undefined => model.cells[p.lane]?.[p.col]?.[p.index] as CardEntry<T> | undefined;
  const entryOf = (key: string): CardEntry<T> | undefined => entryIn(latest.current.model, key);

  // --- source reads -------------------------------------------------------------------
  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    let version = 0;
    const load = (): void => {
      const v = ++version;
      setStatus('loading');
      const request = {
        version: v,
        query: { search: null, filters: query?.filters ?? EMPTY, sorting: query?.sorting ?? EMPTY, grouping: EMPTY, aggregates: EMPTY, paging: null, expansion: NO_EXPANSION },
        signal: controller.signal,
      };
      Promise.resolve()
        .then(() => source.read(request))
        .then(
          (result) => {
            if (controller.signal.aborted || v !== version) return;
            setStore((s) => ({ data: s.data, rows: result.rows }));
            setStatus('ready');
          },
          (error: unknown) => {
            if (controller.signal.aborted || v !== version) return;
            setStatus('error');
            latest.current.props.onDataError?.(error, 'read');
          },
        );
    };
    load();
    const unsubscribe = source.subscribe?.(load);
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [source, query]);

  // --- writes: optimistic, through the source when there is one ----------------------
  const commit = (kind: 'add' | 'update' | 'delete' | 'move', next: readonly T[], cards: readonly T[], previous: readonly T[], src: KanbanEventSource, placement?: { ids: readonly KanbanKey[]; before: KanbanKey | null; after: KanbanKey | null }): boolean => {
    const p = latest.current.props;
    const event = cancelable({ kind, card: (cards[0] ?? previous[0]) as T, cards, previous, source: src });
    p.onCardChange?.(event);
    if (event.defaultPrevented) return false;
    const before = latest.current.rows;
    latest.current.rows = next;
    setStore((s) => ({ data: s.data, rows: next }));
    const s = isSource(p.data) ? p.data : null;
    if (s?.write) {
      const id = p.getCardId;
      const prevById = new Map(previous.map((r) => [keyOf(id(r)), r]));
      const changedColumnIds = [p.columnField, ...(p.swimlanes ? [p.swimlanes.field] : [])];
      const request = {
        version: 0,
        added: kind === 'add' ? cards.map((row) => ({ tempId: String(id(row)), row })) : EMPTY,
        changed: kind === 'update' || kind === 'move' ? cards.map((row) => ({ rowId: String(id(row)), row, previous: prevById.get(keyOf(id(row))) ?? row, changedColumnIds })) : EMPTY,
        deleted: kind === 'delete' ? previous.map((row) => ({ rowId: String(id(row)), row })) : EMPTY,
        mode: 'row' as const,
        signal: new AbortController().signal,
        ...(placement ? { moved: { rowIds: placement.ids.map(String), targetRowId: placement.before !== null ? String(placement.before) : placement.after !== null ? String(placement.after) : null, position: placement.before !== null ? ('before' as const) : ('after' as const) } } : null),
      };
      const revert = (error: unknown): void => {
        setStore((st) => (st.rows === next ? { data: st.data, rows: before } : st));
        say(latest.current.text.writeError);
        latest.current.props.onDataError?.(error, 'write');
      };
      s.write(request).then((r) => {
        if (r.status === 'rejected') revert(r);
      }, revert);
    }
    return true;
  };

  // --- moves ------------------------------------------------------------------------
  const cellRef = (m: BoardModel<T>, lane: number, col: number): KanbanCellRef => ({ columnKey: m.columns[col]!.id, swimlaneKey: m.lanes[lane]?.key ?? null });
  const rewrite = (m: BoardModel<T>, lane: number, col: number) => {
    const p = latest.current.props;
    const column = m.columns[col]!;
    const laneKey = m.lanes[lane]?.key ?? null;
    const values = new Set(column.values.map(String));
    return (c: T): T => {
      let next = values.has(text$(fieldOf(c, p.columnField))) ? c : withField(c, p.columnField, column.values[0]);
      if (p.swimlanes && m.hasLanes && text$(fieldOf(next, p.swimlanes.field)) !== text$(laneKey)) next = withField(next, p.swimlanes.field, laneKey);
      return next;
    };
  };
  const placementIn = (m: BoardModel<T>, keys: readonly string[], lane: number, col: number, index: number) => {
    const moving = new Set(keys);
    const others = (m.cells[lane]?.[col] ?? EMPTY).filter((e) => !moving.has(e.key));
    const before = others[index]?.id ?? null;
    const after = before === null ? (others[others.length - 1]?.id ?? null) : null;
    return { others, before, after };
  };
  const announceLimit = (m: BoardModel<T>, lane: number, col: number, added: number): void => {
    const column = m.columns[col]!;
    const count = (limitScope === 'swimlane' && m.hasLanes ? (m.cells[lane]?.[col]?.length ?? 0) : (m.columnCounts[col] ?? 0)) + added;
    const state = limitOf(count, column.def);
    const t = latest.current.text;
    if (state === 'over') say(formatKanbanText(t.overLimit, { column: column.def.header, max: column.def.max ?? 0, count }));
    else if (state === 'under') say(formatKanbanText(t.underLimit, { column: column.def.header, min: column.def.min ?? 0, count }));
  };
  const moveCards = (keys: readonly string[], lane: number, col: number, index: number, src: KanbanEventSource): boolean => {
    const { model: m, rows: current, props: p } = latest.current;
    const entries = keys.map((k) => entryOf(k)).filter((e): e is CardEntry<T> => e !== undefined);
    const first = entries[0];
    const fromPlace = first ? m.byKey.get(first.key) : undefined;
    if (!first || !fromPlace || !m.columns[col]) return false;
    const { before, after } = placementIn(m, keys, lane, col, index);
    if (entries.length === 1 && fromPlace.lane === lane && fromPlace.col === col && fromPlace.index === index) return false;
    const event = cancelable({ cardId: first.id, cardIds: entries.map((e) => e.id), cards: entries.map((e) => e.card), from: cellRef(m, fromPlace.lane, fromPlace.col), to: cellRef(m, lane, col), index, source: src, external: null });
    p.onCardMove?.(event);
    if (event.defaultPrevented) return false;
    const update = rewrite(m, lane, col);
    const ids = entries.map((e) => e.id);
    const next = moveRows(current, p.getCardId, ids, update, before, after);
    const moved = entries.map((e) => update(e.card));
    const sameCol = fromPlace.col === col;
    if (!commit('move', next, moved, entries.map((e) => e.card), src, { ids, before, after })) return false;
    if (!sameCol || (limitScope === 'swimlane' && fromPlace.lane !== lane)) {
      announceLimit(m, lane, col, entries.length);
      announceLimit(m, fromPlace.lane, fromPlace.col, -entries.filter((e) => m.byKey.get(e.key)?.col === fromPlace.col).length);
    }
    return true;
  };
  /** Cards dropped here from another board of the drag group. */
  const receive = (from: KanbanDragController, keys: readonly string[], lane: number, col: number, index: number, src: KanbanEventSource): boolean => {
    const { model: m, rows: current, props: p } = latest.current;
    const cards = from.cards(keys) as readonly T[];
    const first = cards[0];
    if (first === undefined) return false;
    const fromRef = from.placeRef(keys[0] as string);
    const to = cellRef(m, lane, col);
    const ids = cards.map((c) => p.getCardId(c));
    const event = cancelable({ cardId: ids[0] as KanbanKey, cardIds: ids, cards, from: fromRef, to, index, source: src, external: 'in' as const });
    p.onCardMove?.(event);
    if (event.defaultPrevented || !from.release(keys, to, index, src)) return false;
    const { before, after } = placementIn(m, EMPTY, lane, col, index);
    const update = rewrite(m, lane, col);
    const added = cards.map(update);
    const next = moveRows([...current, ...added], p.getCardId, ids, (c) => c, before, after);
    if (!commit('add', next, added, EMPTY, src)) return false;
    announceLimit(m, lane, col, cards.length);
    return true;
  };
  const removeCards = (keys: readonly string[], src: KanbanEventSource): boolean => {
    const { rows: current, props: p } = latest.current;
    const set = new Set(keys);
    const gone = current.filter((r) => set.has(keyOf(p.getCardId(r))));
    return commit(
      'delete',
      current.filter((r) => !set.has(keyOf(p.getCardId(r)))),
      gone,
      gone,
      src,
    );
  };

  // --- focus and selection ------------------------------------------------------
  const cardElement = (key: string): HTMLElement | null => gridRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(key)}"]`) ?? null;
  const focusKey = (key: string, attempt = 0): void => {
    const p = latest.current.model.byKey.get(key);
    if (!p) return;
    focus.set(key);
    const el = cardElement(key);
    if (el) {
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      return;
    }
    cells.get(`${p.lane}:${p.col}`)?.reveal(p.index);
    if (attempt < 3) requestAnimationFrame(() => focusKey(key, attempt + 1));
  };
  const anchor = useRef<string | null>(null);
  const select = (key: string, mode: 'replace' | 'toggle' | 'range', src: KanbanEventSource): void => {
    if (selection === 'none') return;
    const e = entryOf(key);
    if (!e) return;
    if (selection === 'single' || mode === 'replace' || (mode === 'range' && anchor.current === null)) {
      anchor.current = key;
      setSelected([e.id], { source: src });
      return;
    }
    if (mode === 'toggle') {
      anchor.current = key;
      setSelected((prev) => (prev.some((x) => keyOf(x) === key) ? prev.filter((x) => keyOf(x) !== key) : [...prev, e.id]), { source: src });
      return;
    }
    const m = latest.current.model;
    const a = m.byKey.get(anchor.current as string);
    const b = m.byKey.get(key);
    if (!a || !b || a.lane !== b.lane || a.col !== b.col) {
      anchor.current = key;
      setSelected([e.id], { source: src });
      return;
    }
    const cell = m.cells[a.lane]![a.col]!;
    setSelected(cell.slice(Math.min(a.index, b.index), Math.max(a.index, b.index) + 1).map((x) => x.id), { source: src });
  };

  // --- editor ---------------------------------------------------------------------------
  // The new-card draft is created once, in the handler that opens the editor (`newCard` never runs in render).
  const [draft, setDraft] = useState<{ readonly card: T } | null>(null);
  const editorEnabled = editor !== undefined && editor !== false;
  const createDraft = (at?: Partial<KanbanCellRef>): T => {
    const { model: m, props: p } = latest.current;
    const cell: KanbanCellRef = { columnKey: at?.columnKey ?? m.columns[0]?.id ?? '', swimlaneKey: at?.swimlaneKey ?? (m.hasLanes ? (m.lanes[0]?.key ?? null) : null) };
    if (p.newCard) return p.newCard(cell);
    let n = m.byKey.size + 1;
    while (m.byKey.has(keyOf(`new-${n}`))) n++;
    let card = withField({ id: `new-${n}` } as T, p.columnField, cell.columnKey);
    if (p.swimlanes) card = withField(card, p.swimlanes.field, cell.swimlaneKey);
    return card;
  };
  const openEditor = (id: KanbanKey | 'new', src: KanbanEventSource, at?: Partial<KanbanCellRef>): void => {
    if (id === 'new') setDraft({ card: createDraft(at) });
    setEditing(id, { source: src });
  };
  // A controlled `editing="new"` without openEditor: create the draft after the commit.
  useEffect(() => {
    if (editing === 'new' && !draft) setDraft({ card: createDraft() });
  });
  const returnFocus = useRef<string | null>(null);
  const closeEditor = (src: KanbanEventSource): void => {
    setEditing(null, { source: src });
    const back = returnFocus.current;
    if (back) requestAnimationFrame(() => focusKey(back));
  };
  const addCard = (lane: number, col: number, src: KanbanEventSource): void => {
    const m = latest.current.model;
    const at = cellRef(m, lane, col);
    const event = cancelable({ ...at, source: src });
    latest.current.props.onCardAdd?.(event);
    if (event.defaultPrevented) return;
    if (editorEnabled || renderEditor) openEditor('new', src, at);
  };
  const editedEntry = editing !== null && editing !== 'new' ? entryIn(model, keyOf(editing)) : undefined;
  const editorFields = useMemo((): readonly KanbanEditorField<T>[] => {
    if (editor && typeof editor === 'object') return editor.fields;
    const list: KanbanEditorField<T>[] = [];
    list.push({ field: fields.headerField ?? 'title', label: text.fieldHeader, kind: 'text', required: true });
    if (fields.contentField) list.push({ field: fields.contentField, label: text.fieldContent, kind: 'textarea' });
    list.push({ field: columnField, label: text.fieldColumn, kind: 'select', options: model.columns.map((c) => ({ value: c.values[0] as KanbanKey, label: c.def.header })) });
    if (swimlanes && model.hasLanes) list.push({ field: swimlanes.field, label: text.fieldSwimlane, kind: 'select', options: model.lanes.filter((l) => l.key !== null).map((l) => ({ value: l.key as KanbanKey, label: l.label })) });
    return list;
  }, [editor, fields, text, columnField, swimlanes, model]);

  // --- drag chunk -----------------------------------------------------------
  const dragModule = useRef<KanbanDragModule | null>(null);
  const keyboardDrag = useRef<KeyboardDrag | null>(null);
  const controller: KanbanDragController = {
    boardId,
    group: dragGroup,
    text,
    rtl: () => isRtl(rootRef.current),
    cardsDraggable,
    columnsReorderable,
    laneCount: () => latest.current.model.lanes.length,
    colCount: () => latest.current.model.columns.length,
    collapsed: (col) => latest.current.collapsedSet.has(String(latest.current.model.columns[col]?.id)),
    dragKeys(key) {
      const { model: m, selectedIds: sel } = latest.current;
      const place = m.byKey.get(key);
      if (!place || m.columns[place.col]?.def.draggable === false) return null;
      const selectedKeys = new Set(sel.map(keyOf));
      if (selection !== 'multiple' || !selectedKeys.has(key)) return [key];
      const out: string[] = [];
      m.cells.forEach((lane) => lane.forEach((cell, c) => m.columns[c]?.def.draggable !== false && cell.forEach((e) => selectedKeys.has(e.key) && out.push(e.key))));
      return out;
    },
    cards: (keys) => keys.map((k) => entryOf(k)?.card).filter((c) => c !== undefined),
    place: (key) => latest.current.model.byKey.get(key),
    placeRef(key) {
      const m = latest.current.model;
      const p = m.byKey.get(key);
      return p ? cellRef(m, p.lane, p.col) : { columnKey: '', swimlaneKey: null };
    },
    cellKeys: (lane, col) => (latest.current.model.cells[lane]?.[col] ?? EMPTY).map((e) => e.key),
    canDrop(keys, lane, col, foreign) {
      const m = latest.current.model;
      const to = m.columns[col];
      if (!to || controller.collapsed(col)) return false;
      if (foreign) return to.def.droppable !== false;
      const p = m.byKey.get(keys[0] as string);
      return canDropInto(p ? m.columns[p.col] : undefined, to, !p || p.lane === lane, latest.current.props.swimlanes?.draggable === true);
    },
    drop: (keys, lane, col, index, src, from) => (from && from !== controller ? receive(from, keys, lane, col, index, src) : moveCards(keys, lane, col, index, src)),
    release(keys, to, index, src) {
      const m = latest.current.model;
      const entries = keys.map((k) => entryOf(k)).filter((e): e is CardEntry<T> => e !== undefined);
      const first = entries[0];
      const p = first ? m.byKey.get(first.key) : undefined;
      if (!first || !p) return false;
      const event = cancelable({ cardId: first.id, cardIds: entries.map((e) => e.id), cards: entries.map((e) => e.card), from: cellRef(m, p.lane, p.col), to, index, source: src, external: 'out' as const });
      latest.current.props.onCardMove?.(event);
      return !event.defaultPrevented && removeCards(keys, src);
    },
    targets: () => latest.current.props.dropTargets ?? EMPTY,
    externalDrop(i, keys, target, x, y) {
      const t = latest.current.props.dropTargets?.[i];
      if (!t) return;
      const entries = keys.map((k) => entryOf(k)).filter((e): e is CardEntry<T> => e !== undefined);
      const event = cancelable({ cardIds: entries.map((e) => e.id), cards: entries.map((e) => e.card), target, clientX: x, clientY: y });
      t.onDrop(event);
      if (!event.defaultPrevented) removeCards(keys, 'pointer');
    },
    describe(lane, col, index, count) {
      const m = latest.current.model;
      const t = latest.current.text;
      return formatKanbanText(t.position, { column: m.columns[col]?.def.header ?? '', lane: m.hasLanes ? `, ${m.lanes[lane]?.label ?? ''}` : '', index: index + 1, count });
    },
    label: (key) => cardLabel(entryOf(key)),
    announce: say,
    reveal: (lane, col, index) => cells.get(`${lane}:${col}`)?.reveal(index),
    focus: (key) => requestAnimationFrame(() => focusKey(key)),
    moveColumn: (from, to, src) => moveColumn(from, to, src),
  };
  const ctrlRef = useRef(controller);
  useLayoutEffect(() => {
    ctrlRef.current = controller;
  });
  const dragNeeded = cardsDraggable || columnsReorderable || dragGroup !== undefined || (dropTargets?.length ?? 0) > 0;
  // A layout effect: the hold is in place before the first paint.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!dragNeeded || !root) return;
    let cleanup: (() => void) | null = null;
    let live = true;
    // A press before the chunk is held and continues once it attaches.
    const held = holdInput(root, PRESS_EVENTS);
    void import('./drag.js').then((m) => {
      const events = held();
      if (!live) return;
      dragModule.current = m;
      cleanup = m.attachKanbanDrag(root, () => ctrlRef.current, events);
    }, held);
    return () => {
      live = false;
      held();
      keyboardDrag.current?.cancel(false);
      keyboardDrag.current = null;
      cleanup?.();
    };
  }, [dragNeeded]);
  const startKeyboardDrag = (key: string): void => {
    const run = (m: KanbanDragModule): void => {
      keyboardDrag.current = m.startKeyboardDrag(rootRef.current as HTMLElement, () => ctrlRef.current, key, () => {
        keyboardDrag.current = null;
      });
    };
    if (dragModule.current) run(dragModule.current);
    else
      void import('./drag.js').then((m) => {
        dragModule.current = m;
        run(m);
      });
  };

  // --- columns ------------------------------------------------------------------
  const toggleColumn = (id: KanbanKey): void => {
    setCollapsed((prev) => (prev.some((k) => String(k) === String(id)) ? prev.filter((k) => String(k) !== String(id)) : [...prev, id]), { source: 'pointer' });
  };
  function moveColumn(from: number, to: number, src: KanbanEventSource): void {
    const { model: m, props: p, text: t } = latest.current;
    if (from === to || to < 0 || to >= m.columns.length) return;
    const ids = m.columns.map((c) => c.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved as KanbanKey);
    const defs = p.columns ?? columnDefs;
    for (const d of defs) {
      const id = d.key ?? d.keys?.[0];
      if (id !== undefined && !ids.some((x) => String(x) === String(id))) ids.push(id);
    }
    setColumnOrder(ids, { source: src });
    say(formatKanbanText(t.columnMoved, { column: m.columns[from]?.def.header ?? '', index: to + 1, count: m.columns.length }));
  }

  // --- tooltip ---------------------------------------------------------------------------
  const [tip, setTip] = useState<TipState | null>(null);
  const tipDelay = typeof tooltip === 'object' ? (tooltip.delay ?? 500) : 500;
  const showTip = (el: HTMLElement | null, immediate: boolean): void => {
    if (!tooltip || !el) return;
    clearTimeout(tipTimer.current);
    const key = el.dataset['card'];
    if (!key) return;
    const run = (): void => {
      const r = el.getBoundingClientRect();
      const above = r.bottom + 120 > (el.ownerDocument.defaultView?.innerHeight ?? 0);
      setTip({ key, x: r.left, y: above ? r.top : r.bottom, above });
    };
    if (immediate) run();
    else tipTimer.current = window.setTimeout(run, tipDelay);
  };
  const hideTip = (): void => {
    clearTimeout(tipTimer.current);
    setTip(null);
  };
  useEffect(() => () => clearTimeout(tipTimer.current), []);
  const tipId = `${boardId}-tip`;
  useEffect(() => {
    if (!tip) return;
    const el = cardElement(tip.key);
    if (!el) return;
    const before = el.getAttribute('aria-describedby');
    el.setAttribute('aria-describedby', before ? `${before} ${tipId}` : tipId);
    return () => {
      if (before) el.setAttribute('aria-describedby', before);
      else el.removeAttribute('aria-describedby');
    };
  });

  // --- imperative API ------------------------------------------------------------------------------
  useImperativeHandle(
    ref,
    (): KanbanApi => ({
      get element() {
        return rootRef.current;
      },
      focusCard: (id) => focusKey(keyOf(id)),
      scrollToCard(id) {
        const p = latest.current.model.byKey.get(keyOf(id));
        if (!p) return;
        const el = cardElement(keyOf(id));
        if (el) el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        else cells.get(`${p.lane}:${p.col}`)?.reveal(p.index);
      },
      openEditor: (id, at) => openEditor(id, 'api', at),
      closeEditor: () => closeEditor('api'),
    }),
  );

  // --- events ----------------------------------------------------------------------------------------
  const cardFromEvent = (target: EventTarget | null): HTMLElement | null => {
    const el = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-card]');
    return el && gridRef.current?.contains(el) ? el : null;
  };
  const onGridClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const t = event.target as HTMLElement;
    const add = t.closest<HTMLElement>('[data-add]');
    if (add) {
      const cell = add.closest<HTMLElement>('[data-ci]');
      if (cell) addCard(Number(cell.dataset['li']), Number(cell.dataset['ci']), sourceOf(event.nativeEvent as PointerEvent));
      return;
    }
    const el = cardFromEvent(t);
    const key = el?.dataset['card'];
    const e = key ? entryOf(key) : undefined;
    if (!el || !key || !e) return;
    const src = event.detail === 0 ? 'keyboard' : sourceOf(event.nativeEvent as PointerEvent);
    const ev = cancelable({ card: e.card, id: e.id, source: src });
    onCardClick?.(ev);
    if (ev.defaultPrevented) return;
    focus.set(key);
    select(key, event.shiftKey ? 'range' : event.ctrlKey || event.metaKey ? 'toggle' : 'replace', src);
  };
  const onGridDoubleClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    const key = cardFromEvent(event.target)?.dataset['card'];
    const e = key ? entryOf(key) : undefined;
    if (!key || !e) return;
    const ev = cancelable({ card: e.card, id: e.id, source: sourceOf(event.nativeEvent as PointerEvent) });
    onCardDoubleClick?.(ev);
    if (!ev.defaultPrevented && (editorEnabled || renderEditor)) {
      returnFocus.current = key;
      openEditor(e.id, ev.source);
    }
  };
  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (keyboardDrag.current) {
      if (keyboardDrag.current.key(event.nativeEvent)) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    const el = cardFromEvent(event.target);
    if (!el || event.target !== el) return;
    const key = el.dataset['card'] as string;
    const at = model.byKey.get(key);
    if (!at) return;
    const ctrl = event.ctrlKey || event.metaKey;
    const rtl = isRtl(el);
    let dir: Parameters<typeof navigate>[2] | null = null;
    switch (event.key) {
      case 'ArrowUp':
        dir = 'up';
        break;
      case 'ArrowDown':
        dir = 'down';
        break;
      case 'ArrowLeft':
        dir = rtl ? 'right' : 'left';
        break;
      case 'ArrowRight':
        dir = rtl ? 'left' : 'right';
        break;
      case 'Home':
        dir = ctrl ? 'first' : 'home';
        break;
      case 'End':
        dir = ctrl ? 'last' : 'end';
        break;
      case 'Enter':
      case 'F2':
        event.preventDefault();
        if ((editorEnabled || renderEditor) && !ctrl) {
          returnFocus.current = key;
          openEditor(entryOf(key)!.id, 'keyboard');
        } else if (event.key === 'Enter') select(key, ctrl ? 'toggle' : 'replace', 'keyboard');
        return;
      case ' ':
        event.preventDefault();
        if (ctrl || !cardsDraggable) select(key, ctrl ? 'toggle' : event.shiftKey ? 'range' : 'replace', 'keyboard');
        else if (controller.dragKeys(key)) startKeyboardDrag(key);
        return;
      case 'Escape':
        hideTip();
        if (selectedIds.length && selection !== 'none') {
          event.preventDefault();
          setSelected(NO_KEYS, { source: 'keyboard' });
        }
        return;
      default:
        return;
    }
    event.preventDefault();
    const next = navigate(model as BoardModel<unknown>, at, dir, isCollapsed);
    if (!next) return;
    const target = entryAt(next);
    if (!target) return;
    focusKey(target.key);
    if (event.shiftKey && selection === 'multiple' && (dir === 'up' || dir === 'down')) {
      if (anchor.current === null) anchor.current = key;
      select(target.key, 'range', 'keyboard');
    }
    if (tooltip) showTip(cardElement(target.key), false);
  };
  const onGridFocus = (event: ReactFocusEvent<HTMLDivElement>): void => {
    const el = cardFromEvent(event.target);
    if (el && event.target === el) {
      focus.set(el.dataset['card'] as string);
      if (tooltip && !tip) showTip(el, false);
    }
  };
  const onGripKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, col: number): void => {
    if (!event.altKey || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
    event.preventDefault();
    const forward = (event.key === 'ArrowRight') !== isRtl(event.currentTarget);
    moveColumn(col, col + (forward ? 1 : -1), 'keyboard');
  };

  // --- render ------------------------------------------------------------------------------------------
  const template = model.columns.map((c) => (collapsedSet.has(String(c.id)) ? 'var(--salmon-kanban-collapsed, 3rem)' : 'minmax(var(--salmon-kanban-min, 16rem), 1fr)')).join(' ');
  const rootStyle = { ...style, '--salmon-kanban-template': template || 'none', '--salmon-kanban-count': model.columns.length, ...(height !== undefined ? { blockSize: height } : null) } as CSSProperties;
  const limitText = (def: KanbanColumnDef): string =>
    [def.min !== undefined ? formatKanbanText(text.limitMin, { min: def.min }) : '', def.max !== undefined ? formatKanbanText(text.limitMax, { max: def.max }) : ''].filter(Boolean).join(' · ');
  const columnLimit = (c: number): 'over' | 'under' | undefined => (limitScope === 'column' || !model.hasLanes ? (limitOf(model.columnCounts[c] ?? 0, model.columns[c]!.def) ?? undefined) : undefined);
  const groupRuns: { header: string; start: number; span: number }[] = [];
  if (columnGroups?.length) {
    const groupOf = (id: KanbanKey): number => columnGroups.findIndex((g) => g.columns.some((k) => String(k) === String(id)));
    model.columns.forEach((c, i) => {
      const g = groupOf(c.id);
      const last = groupRuns[groupRuns.length - 1];
      if (g >= 0 && last && last.header === columnGroups[g]!.header && last.start + last.span === i) last.span++;
      else groupRuns.push({ header: g >= 0 ? columnGroups[g]!.header : '', start: i, span: 1 });
    });
  }
  const groupLabel = (c: number): string => groupRuns.find((r) => c >= r.start && c < r.start + r.span)?.header ?? '';

  const tipEntry = tip ? entryIn(model, tip.key) : undefined;
  const tipPlace = tip ? model.byKey.get(tip.key) : undefined;
  let tipContent: ReactNode = null;
  if (tip && tipEntry && tipPlace) {
    const c: KanbanCardContext<T> = { card: tipEntry.card, id: tipEntry.id, columnKey: model.columns[tipPlace.col]!.id, swimlaneKey: model.lanes[tipPlace.lane]?.key ?? null, index: tipPlace.index, selected: selectedSet?.has(tip.key) ?? false };
    tipContent = typeof tooltip === 'object' && tooltip.render ? tooltip.render(c) : [cardLabel(tipEntry, fields), text$(fieldOf(tipEntry.card, fields.contentField))].filter(Boolean).join(' — ');
  }

  return (
    <div
      {...dom}
      ref={rootRef}
      id={idProp}
      className={cx('salmon-kanban', className)}
      style={rootStyle}
      data-lanes={model.hasLanes ? '' : undefined}
      data-virtual={virtual ? '' : undefined}
      data-state={loading ? 'loading' : status === 'error' ? 'error' : undefined}
      aria-busy={loading || undefined}
    >
      <div className="salmon-kanban-frame">
        <select className="salmon-kanban-picker" aria-label={text.columnPicker} onChange={(e) => cells.get(`0:${e.currentTarget.value}`)?.el.scrollIntoView?.({ inline: 'start', block: 'nearest' })}>
          {model.columns.map((c, i) => (
            <option key={keyOf(c.id)} value={i}>
              {c.def.header}
            </option>
          ))}
        </select>
        <div className="salmon-kanban-scroller">
          {groupRuns.length ? (
            <div className="salmon-kanban-groups">
              {groupRuns.map((r) => (
                <div key={r.start} className="salmon-kanban-group" style={{ gridColumn: `${r.start + 1} / span ${r.span}` }} data-empty={r.header ? undefined : ''}>
                  {r.header}
                </div>
              ))}
            </div>
          ) : null}
          <div className="salmon-kanban-header">
            {model.columns.map((c, i) => {
              const isC = collapsedSet.has(String(c.id));
              const count = model.columnCounts[i] ?? 0;
              const limit = columnLimit(i);
              const lt = limitText(c.def);
              const hctx = { key: c.id, header: c.def.header, count, collapsed: isC, limit: limit ?? null };
              return (
                <div key={keyOf(c.id)} className={cx('salmon-kanban-column-header', c.def.className)} data-ci={i} data-column={String(c.id)} data-limit={limit} data-collapsed={isC ? '' : undefined} data-reorderable={columnsReorderable ? '' : undefined}>
                  {c.def.collapsible ? (
                    <button type="button" className="salmon-kanban-toggle" aria-expanded={!isC} aria-label={formatKanbanText(isC ? text.expand : text.collapse, { column: c.def.header })} onClick={() => toggleColumn(c.id)}>
                      <Chevron />
                    </button>
                  ) : null}
                  {columnsReorderable ? (
                    <button type="button" className="salmon-kanban-grip" data-grip="" aria-label={formatKanbanText(text.moveColumn, { column: c.def.header })} onKeyDown={(e) => onGripKeyDown(e, i)}>
                      <Grip />
                    </button>
                  ) : null}
                  <span className="salmon-kanban-column-title">{c.def.renderHeader ? c.def.renderHeader(hctx) : c.def.header}</span>
                  {c.def.count !== false ? (
                    <span className="salmon-kanban-count" aria-label={formatKanbanText(text.count, { count })}>
                      {count}
                    </span>
                  ) : null}
                  {lt && !isC ? <span className="salmon-kanban-limits">{lt}</span> : null}
                </div>
              );
            })}
          </div>
          <div
            ref={gridRef}
            role="grid"
            className="salmon-kanban-board"
            aria-label={ariaLabel}
            aria-labelledby={ariaLabelledBy}
            aria-roledescription={text.board}
            aria-multiselectable={selection === 'multiple' || undefined}
            onClick={onGridClick}
            onDoubleClick={onGridDoubleClick}
            onKeyDown={onGridKeyDown}
            onFocus={onGridFocus}
            onBlur={tooltip ? hideTip : undefined}
            onPointerOver={tooltip ? (e) => showTip(cardFromEvent(e.target), false) : undefined}
            onPointerOut={tooltip ? hideTip : undefined}
            onScroll={tip ? hideTip : undefined}
          >
            {model.lanes.map((lane, li) => {
              const laneCells = model.cells[li] ?? EMPTY;
              const body = (
                <div className="salmon-kanban-lane-cells" key="cells">
                  {model.columns.map((c, ci) => {
                    const isC = collapsedSet.has(String(c.id));
                    const entries = (laneCells[ci] ?? EMPTY) as readonly CardEntry<unknown>[];
                    const limit = limitScope === 'swimlane' && model.hasLanes ? (limitOf(entries.length, c.def) ?? undefined) : columnLimit(ci);
                    const g = groupLabel(ci);
                    const label = [g ? `${g}: ${c.def.header}` : c.def.header, model.hasLanes ? lane.label : '', formatKanbanText(text.count, { count: entries.length })].filter(Boolean).join(', ');
                    return (
                      <Cell
                        key={keyOf(c.id)}
                        ctx={ctx}
                        laneIndex={li}
                        colIndex={ci}
                        lane={lane}
                        column={c}
                        entries={entries}
                        collapsed={isC}
                        limit={limit}
                        label={label}
                        selected={selectedSet}
                        addLabel={c.def.addButton ? formatKanbanText(text.addCard, { column: model.hasLanes ? `${c.def.header}, ${lane.label}` : c.def.header }) : null}
                      />
                    );
                  })}
                </div>
              );
              if (!model.hasLanes) return body;
              const lctx = { key: lane.key, label: lane.label, count: lane.count };
              return (
                <div key={lane.key === null ? 'unassigned' : keyOf(lane.key)} role="rowgroup" className="salmon-kanban-lane" data-li={li} data-sticky={swimlanes?.sticky ? '' : undefined}>
                  <div role="row" className="salmon-kanban-lane-header">
                    <div role="rowheader" className="salmon-kanban-lane-title">
                      {swimlanes?.renderHeader ? swimlanes.renderHeader(lctx) : lane.label}
                      {swimlanes?.count !== false ? (
                        <span className="salmon-kanban-count" aria-label={formatKanbanText(text.count, { count: lane.count })}>
                          {lane.count}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {body}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {cardsDraggable ? (
        <div id={instructionsId} className="salmon-visually-hidden">
          {text.dragInstructions}
        </div>
      ) : null}
      <div ref={liveRef} className="salmon-visually-hidden" {...liveRegionProps('polite')} />
      <div className="salmon-kanban-status" {...liveRegionProps('polite')}>
        {loading ? text.loading : status === 'error' ? text.loadError : null}
      </div>
      {tip && tipContent !== null ? (
        <div id={tipId} role="tooltip" className="salmon-kanban-tooltip" data-above={tip.above ? '' : undefined} style={{ left: tip.x, top: tip.y }}>
          {tipContent}
        </div>
      ) : null}
      {editing !== null && (editorEnabled || renderEditor) && (editing === 'new' ? draft : editedEntry) ? (
        <Suspense fallback={null}>
          <Editor
            text={text}
            isNew={editing === 'new'}
            card={editing === 'new' ? (draft as { card: T }).card : (editedEntry as CardEntry<T>).card}
            fields={editorFields as readonly KanbanEditorField<unknown>[]}
            renderEditor={renderEditor as ((ctx: import('./types.js').KanbanEditorContext<unknown>) => ReactNode) | undefined}
            onCancel={() => closeEditor('pointer')}
            onSave={(next) => {
              const t = next as T;
              const { rows: current, props: p } = latest.current;
              if (editing === 'new') commit('add', [...current, t], [t], EMPTY, 'pointer');
              else {
                const k = keyOf(editing);
                const prev = current.find((r) => keyOf(p.getCardId(r)) === k);
                commit('update', current.map((r) => (keyOf(p.getCardId(r)) === k ? t : r)), [t], prev === undefined ? EMPTY : [prev], 'pointer');
              }
              closeEditor('pointer');
            }}
            onDelete={() => {
              if (editing !== 'new') removeCards([keyOf(editing)], 'pointer');
              returnFocus.current = null;
              closeEditor('pointer');
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );

  function cardLabel(e: CardEntry<T> | undefined, f: KanbanCardFields = fields): string {
    if (!e) return '';
    return f.headerField ? text$(fieldOf(e.card, f.headerField)) || String(e.id) : String(e.id);
  }
}

const EMPTY_FIELDS: KanbanCardFields = Object.freeze({});

function entryIn<T>(m: BoardModel<T>, key: string): CardEntry<T> | undefined {
  const p = m.byKey.get(key);
  return p ? m.cells[p.lane]?.[p.col]?.[p.index] : undefined;
}
