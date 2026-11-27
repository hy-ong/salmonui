'use client';
// Listbox: a persistent APG listbox over the shared collection
// primitives (internal/collection). Single or multiple selection,
// aria-activedescendant focus, type-ahead, grouping, search, a fixed-height
// virtual list above 100 items, remote sources, keyboard reorder, and pointer
// drag and drop in a lazy chunk.

import {
  memo,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type Ref,
} from 'react';
import {
  createCollection,
  defaultItemDisabled,
  defaultItemLabel,
  defaultItemValue,
  groupAtEntry,
  type Collection,
  type CollectionEntries,
  type CollectionKey,
} from '../internal/collection/collection.js';
import type { MatchRange } from '../internal/collection/search.js';

type SearchModule = typeof import('../internal/collection/search.js');
type GridModule = typeof import('./grid.js');
import { selectAllValues } from '../internal/collection/selection.js';
import { createCollectionStore, type CollectionStore } from '@salmonui/core/internal/collection/store';
import { isTypeaheadKey, useTypeahead } from '@salmonui/core/internal/roving';
import { nextWindow, OVERSCAN, revealOffset, windowRange } from '@salmonui/core/internal/collection/virtual';
import { localView, remoteView, type ListView } from '../internal/collection/view.js';
import type { RemoteCollection, RemoteSnapshot } from '../internal/collection/remote.js';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { dropTargets } from './drag-types.js';
import { formatListboxText, LISTBOX_DEFAULT_LOCALE_TEXT, type ListboxLocaleText } from './locale.js';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type {
  ListboxDataSource,
  ListboxEventSource,
  ListboxItemProps,
  ListboxItemState,
  ListboxKey,
  ListboxMatchRange,
  ListboxProps,
  ListboxValueChangeEvent,
  ListboxValueChangeReason,
} from './types.js';

const DEFAULT_ITEM_HEIGHT = 32;
const VIRTUAL_THRESHOLD = 100;
const EMPTY_ITEMS: readonly never[] = [];
const NO_VALUES: readonly ListboxKey[] = [];

function cx(...parts: (string | undefined | false | null)[]): string {
  return parts.filter(Boolean).join(' ');
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) (ref as { current: T | null }).current = value;
}

function sourceOf(event: { pointerType?: string } | null): ListboxEventSource {
  if (!event) return 'keyboard';
  return event.pointerType === 'touch' ? 'touch' : 'pointer';
}

const noopSubscribe = (): (() => void) => () => {};
const nullSnapshot = (): null => null;

/** Option element. Memoized: moving the active option re-renders two options. */
const ListboxOption = memo(function ListboxOption(props: {
  readonly id: string;
  readonly entry: number;
  readonly index: number;
  readonly item: unknown;
  readonly value: ListboxKey | undefined;
  readonly label: string;
  readonly selected: boolean;
  readonly active: boolean;
  readonly disabled: boolean;
  readonly placeholder: boolean;
  readonly posinset: number;
  readonly setsize: number;
  readonly indicator: 'check' | 'checkbox';
  readonly cell: boolean;
  readonly draggable: boolean;
  readonly top: number | null;
  readonly search: string;
  readonly highlight: 'startsWith' | 'contains' | 'endsWith' | null;
  readonly matchRanges: SearchModule['matchRanges'] | undefined;
  readonly matchCase: boolean;
  readonly ignoreAccents: boolean;
  readonly loadingText: string;
  readonly className: string | undefined;
  readonly style: CSSProperties | undefined;
  readonly renderItem: ((state: ListboxItemState<never>) => ReactNode) | undefined;
  readonly getItemIcon: ((item: never) => ReactNode) | undefined;
  readonly getItemProps: ((item: never, state: { readonly selected: boolean; readonly disabled: boolean }) => ListboxItemProps | undefined) | undefined;
}) {
  if (props.placeholder) {
    return (
      <div
        id={props.id}
        role={props.cell ? 'gridcell' : 'option'}
        aria-selected={false}
        aria-disabled={true}
        aria-setsize={props.cell ? undefined : props.setsize}
        aria-posinset={props.cell ? undefined : props.posinset}
        className="salmon-listbox-option"
        data-placeholder=""
        data-entry={props.entry}
        style={props.top === null ? undefined : { position: 'absolute', insetBlockStart: props.top, insetInline: 0 }}
      >
        <span className="salmon-listbox-label">{props.loadingText}</span>
      </div>
    );
  }
  const matches: readonly MatchRange[] =
    props.highlight && props.search && props.matchRanges ? props.matchRanges(props.label, props.search, props.highlight, { matchCase: props.matchCase, ignoreAccents: props.ignoreAccents }) : [];
  const extra = props.getItemProps?.(props.item as never, { selected: props.selected, disabled: props.disabled });
  const { className: extraClass, style: extraStyle, ...rest } = extra ?? {};
  let content: ReactNode;
  if (props.renderItem) {
    content = props.renderItem({
      item: props.item as never,
      value: props.value as ListboxKey,
      label: props.label,
      selected: props.selected,
      active: props.active,
      disabled: props.disabled,
      matches,
    });
  } else if (matches.length > 0) {
    const [start, end] = matches[0] as MatchRange;
    content = (
      <>
        {props.label.slice(0, start)}
        <mark className="salmon-listbox__match">{props.label.slice(start, end)}</mark>
        {props.label.slice(end)}
      </>
    );
  } else content = props.label;
  const icon = props.getItemIcon?.(props.item as never);
  const positioned = props.top === null ? undefined : { position: 'absolute' as const, insetBlockStart: props.top, insetInline: 0 };
  return (
    <div
      {...rest}
      id={props.id}
      role={props.cell ? 'gridcell' : 'option'}
      aria-selected={props.selected}
      aria-disabled={props.disabled || undefined}
      aria-setsize={props.cell ? undefined : props.setsize}
      aria-posinset={props.cell ? undefined : props.posinset}
      className={cx('salmon-listbox-option', props.className, extraClass)}
      style={positioned || props.style || extraStyle ? { ...props.style, ...extraStyle, ...positioned } : undefined}
      data-entry={props.entry}
      data-active={props.active ? '' : undefined}
      data-selected={props.selected ? '' : undefined}
      data-disabled={props.disabled ? '' : undefined}
      data-draggable={props.draggable ? '' : undefined}
    >
      {props.indicator === 'checkbox' ? (
        <span className="salmon-listbox-checkbox" aria-hidden="true" data-checked={props.selected ? '' : undefined} />
      ) : (
        <span className="salmon-listbox-check" aria-hidden="true" />
      )}
      {icon != null && icon !== false ? (
        <span className="salmon-listbox-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="salmon-listbox-label">{content}</span>
    </div>
  );
});

function useStoreField<K extends 'active' | 'first' | 'last' | 'itemHeight' | 'sticky'>(store: CollectionStore, key: K) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState()[key],
    () => store.getState()[key],
  );
}

/**
 * A persistent list of options (WAI-ARIA APG listbox) with single or
 * multiple selection. `ref` receives the `role="listbox"` element.
 */
export function Listbox<T>(props: ListboxProps<T>): ReactNode {
  const {
    data,
    getItemValue,
    getItemLabel,
    getItemGroup,
    getItemIcon,
    isItemDisabled,
    multiple: multipleProp,
    value: valueProp,
    defaultValue,
    onValueChange,
    layout,
    columns: columnsProp,
    indicator = 'check',
    indicatorPosition,
    showSelectAll = false,
    maxSelected,
    searchable = false,
    searchOperator = 'startsWith',
    matchCase = false,
    ignoreAccents = false,
    searchPlaceholder,
    onSearchChange,
    debounce,
    minSearchLength,
    maxResults,
    query,
    searchFields,
    virtualization,
    maxVisibleItems = 8,
    highlightMatches = false,
    renderItem,
    renderGroupHeader,
    renderEmpty,
    renderError,
    renderLoading,
    getItemProps,
    onLoadError,
    loading: loadingProp,
    name,
    required,
    form,
    disabled = false,
    readOnly = false,
    reorderable = false,
    onReorder,
    dragGroup,
    onItemDragStart,
    onItemDrag,
    onItemDrop,
    localeText: ownText,
    className,
    style,
    classNames,
    styles,
    ref,
    id: idProp,
    onKeyDown: userKeyDown,
    onFocus: userFocus,
    onClick: userClick,
    onPointerDown: userPointerDown,
    onScroll: userScroll,
    ...dom
  } = props;
  const multiple = multipleProp === true;
  const grid = layout === 'grid';
  const columns = grid ? Math.max(1, Math.floor(columnsProp ?? 1)) : 1;
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const localeText = useLocaleText('listbox', ownText);
  const text = useMemo(() => ({ ...LISTBOX_DEFAULT_LOCALE_TEXT, ...localeText }) as ListboxLocaleText, [localeText]);

  // --- value (controlled / uncontrolled) -----------------------------------
  const controlled = valueProp !== undefined;
  const [initialValue] = useState(() => (defaultValue !== undefined ? defaultValue : multiple ? NO_VALUES : null));
  const [innerValue, setInnerValue] = useState<ListboxKey | readonly ListboxKey[] | null>(initialValue as ListboxKey | readonly ListboxKey[] | null);
  const current = (controlled ? valueProp : innerValue) as ListboxKey | readonly ListboxKey[] | null;
  const values: readonly ListboxKey[] = useMemo(
    () => (multiple ? ((current as readonly ListboxKey[] | null) ?? NO_VALUES) : current === null || current === undefined ? NO_VALUES : [current as ListboxKey]),
    [current, multiple],
  );
  const selectedSet = useMemo(() => new Set<CollectionKey>(values), [values]);
  const [wasControlled] = useState(controlled);

  // --- data ------------------------------------------------------------------
  const remoteSource = Array.isArray(data) ? null : (data as ListboxDataSource<T>);
  const items = remoteSource ? (EMPTY_ITEMS as readonly T[]) : (data as readonly T[]);
  const collection = useMemo(() => createCollection(items, { getItemValue, getItemLabel, getItemGroup: grid ? undefined : getItemGroup }), [items, getItemValue, getItemLabel, getItemGroup, grid]);
  // The search index is a lazy chunk, loaded and built after the first paint.
  const [searchModule, setSearchModule] = useState<SearchModule | null>(null);
  const searchIndex = useMemo(
    () => (searchModule && searchable ? searchModule.createSearchIndex(collection, { matchCase, ignoreAccents }) : null),
    [searchModule, searchable, collection, matchCase, ignoreAccents],
  );
  const [search, setSearch] = useState('');
  const matched = useMemo(() => {
    if (remoteSource) return null;
    let hits = searchIndex ? searchIndex.search(search, searchOperator) : null;
    if (maxResults !== undefined && (hits ? hits.length : collection.size) > maxResults) {
      hits = hits ? hits.subarray(0, maxResults) : Int32Array.from({ length: maxResults }, (_, i) => i);
    }
    return hits;
  }, [remoteSource, searchable, searchIndex, search, searchOperator, maxResults, collection]);
  const entries = useMemo(() => collection.entries(matched), [collection, matched]);

  const [remote, setRemote] = useState<RemoteCollection<T> | null>(null);
  // Keyed by value: inline literals (`searchFields={['a']}`, `query={{ ... }}`) must not re-create the adapter on every render.
  const remoteKey = JSON.stringify([searchFields, query]);
  useEffect(() => {
    if (!remoteSource) return;
    // The remote adapter is a lazy chunk: local lists never load it.
    let r: RemoteCollection<T> | null = null;
    let live = true;
    void import('../internal/collection/remote.js').then((m) => {
      if (!live) return;
      r = m.createRemoteCollection(remoteSource, {
        searchFields,
        operator: typeof searchOperator === 'string' ? searchOperator : 'startsWith',
        matchCase,
        ignoreAccents,
        query,
        maxResults,
        minSearchLength,
        debounce,
      });
      setRemote(r);
    });
    return () => {
      live = false;
      r?.dispose();
      setRemote(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteSource, remoteKey, searchOperator, matchCase, ignoreAccents, maxResults, minSearchLength, debounce]);
  const snapshot = useSyncExternalStore(remote ? remote.subscribe : noopSubscribe, remote ? remote.getSnapshot : nullSnapshot, nullSnapshot);

  const valueOf = (getItemValue ?? defaultItemValue) as (item: T) => ListboxKey;
  const labelOf = (getItemLabel ?? defaultItemLabel) as (item: T) => string;
  const disabledOf = (isItemDisabled ?? defaultItemDisabled) as (item: T) => boolean;
  const view: ListView<T> = remoteSource ? remoteView(snapshot, valueOf, labelOf, disabledOf) : localView(collection, entries, disabledOf);
  const count = view.count;
  // The virtual list windows rows: one entry per row, or `columns` cells per grid row.
  const rows = Math.ceil(count / columns);
  const virtual = virtualization ?? count > VIRTUAL_THRESHOLD;

  // --- store: active entry, mounted window ------------------------------------
  const [store] = useState(() => createCollectionStore({ active: -1, first: 0, last: maxVisibleItems + OVERSCAN * 2, itemHeight: DEFAULT_ITEM_HEIGHT, sticky: null }));
  const active = useStoreField(store, 'active');
  const storeFirst = useStoreField(store, 'first');
  const storeLast = useStoreField(store, 'last');
  const itemHeight = useStoreField(store, 'itemHeight');
  const sticky = useStoreField(store, 'sticky');
  let first = 0;
  let last = rows;
  if (virtual) {
    const win = storeLast <= rows && storeLast - storeFirst >= Math.min(rows, maxVisibleItems + OVERSCAN * 2) ? { first: storeFirst, last: storeLast } : windowRange(rows, storeFirst, maxVisibleItems);
    first = win.first;
    last = win.last;
  }
  const activeEntry = active < count ? active : -1;

  const listRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const liveRef = useRef<HTMLDivElement | null>(null);
  const nativeRef = useRef<HTMLSelectElement | null>(null);
  const typeahead = useTypeahead();
  const latest = useRef({ view, values, current, count, rows, virtual, props, collection, itemHeight, multiple, search, remote });
  useLayoutEffect(() => {
    latest.current = { view, values, current, count, rows, virtual, props, collection, itemHeight, multiple, search, remote };
  });
  const anchor = useRef(-1);
  const pendingMove = useRef<{ value: ListboxKey; label: string } | null>(null);
  const activeValue = useRef<ListboxKey | undefined>(undefined);

  // --- development checks ----------------------------------------------------
  useEffect(() => {
    if (!DEV) return;
    if (wasControlled !== controlled) warnOnce(`listbox-controlled-${id}`, `Listbox "${id}" switched between controlled and uncontrolled value; pass value (or undefined) for the whole lifetime.`);
    if (grid && (getItemGroup || reorderable || dragGroup !== undefined)) warnOnce(`listbox-grid-${id}`, `Listbox "${id}": layout="grid" has no group headers or reordering; getItemGroup, reorderable and dragGroup are ignored.`);
  }, [controlled, wasControlled, id, grid, getItemGroup, reorderable, dragGroup]);
  useEffect(() => {
    if (!DEV || remoteSource) return;
    const dupes = collection.duplicates();
    if (dupes.length > 0) warnOnce(`listbox-dupes-${id}`, `Listbox "${id}": item values must be unique; duplicates: ${dupes.slice(0, 5).map(String).join(', ')}.`);
    const split = collection.splitGroups();
    if (split.length > 0) warnOnce(`listbox-groups-${id}`, `Listbox "${id}": items of a group must be contiguous; split groups: ${split.slice(0, 5).join(', ')}.`);
  }, [collection, remoteSource, id]);

  // --- search index after the first paint ------------------------
  useEffect(() => {
    if (!searchable || remoteSource) return;
    if (!searchModule) {
      let live = true;
      void import('../internal/collection/search.js').then((m) => {
        if (live) setSearchModule(m);
      });
      return () => {
        live = false;
      };
    }
    if (!searchIndex || searchIndex.built) return;
    const handle = setTimeout(() => searchIndex.build(), 0);
    return () => clearTimeout(handle);
  }, [searchable, remoteSource, searchModule, searchIndex]);

  // --- grid layout: keyboard and tab stops are a lazy chunk ---------
  const [gridModule, setGridModule] = useState<GridModule | null>(null);
  useEffect(() => {
    if (!grid || gridModule) return;
    let live = true;
    void import('./grid.js').then((m) => {
      if (live) setGridModule(m);
    });
    return () => {
      live = false;
    };
  }, [grid, gridModule]);

  // --- item height measured once per mount from the first option -------------
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('.salmon-listbox-option');
    const h = el?.offsetHeight ?? 0;
    if (h > 0) store.set({ itemHeight: h });
  }, [store, count > 0, virtual]);

  // --- a new entry set (search, data) starts at the top; active follows its value
  const prevEntries = useRef<unknown>(null);
  useLayoutEffect(() => {
    const key = remoteSource ? snapshot?.generation : entries;
    if (prevEntries.current === key) return;
    const searchChanged = prevEntries.current !== null;
    prevEntries.current = key;
    const el = listRef.current;
    const v = latest.current.view;
    let nextActive = -1;
    if (activeValue.current !== undefined && !remoteSource) {
      const index = collection.indexOf(activeValue.current);
      nextActive = index >= 0 ? v.entryOf(index) : -1;
    }
    if (nextActive < 0 && searchChanged && search) {
      for (let e = 0; e < v.count; e++) {
        const code = v.code(e);
        if (code >= 0 && !v.disabled(code)) {
          nextActive = e;
          break;
        }
      }
    }
    if (searchChanged && search && el) el.scrollTop = 0;
    const range = windowRange(Math.ceil(v.count / columns), el ? Math.floor(el.scrollTop / store.getState().itemHeight) : 0, maxVisibleItems);
    store.set({ active: nextActive, first: range.first, last: range.last, sticky: v.count > 0 && collection.grouped ? (groupAtEntry(entries, range.first) ?? null) : null });
  });

  // --- remote window reads -----------------------------------------------------
  useEffect(() => {
    if (!remote) return;
    remote.ensure(first * columns, (last + OVERSCAN) * columns);
  }, [remote, first, last, columns, snapshot?.generation]);
  const remoteError = snapshot?.error ?? null;
  useEffect(() => {
    if (remoteError !== null) onLoadError?.(remoteError);
    // Once per error: an inline `onLoadError` must not re-fire it on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteError]);

  // --- announcements ----------------------------------------------------------
  const announce = (message: string): void => {
    const el = liveRef.current;
    if (el) el.textContent = message;
  };
  const searchDone = useRef('');
  useEffect(() => {
    if (!searchable || search === searchDone.current) return;
    // The count is known once the matches are: the remote page for this search, or the local search index.
    if (search && (remoteSource ? !snapshot || snapshot.loading || snapshot.search !== search : !searchIndex)) return;
    searchDone.current = search;
    if (!search) return announce('');
    announce(formatListboxText(text.resultCount, { count: view.itemCount }));
  });
  useEffect(() => {
    const move = pendingMove.current;
    if (!move || remoteSource) return;
    const index = collection.indexOf(move.value);
    if (index < 0) return;
    pendingMove.current = null;
    announce(formatListboxText(text.moved, { label: move.label, position: index + 1, count: collection.size }));
  }, [collection, remoteSource, text]);

  // --- form: owning form reset ------------------------------------------------
  useEffect(() => {
    const form = nativeRef.current?.form;
    if (!form) return;
    const onReset = (): void => {
      const initial = initialValue as ListboxKey | readonly ListboxKey[] | null;
      const now = latest.current.current;
      const same = Array.isArray(initial) && Array.isArray(now) ? initial.length === now.length && initial.every((v, i) => v === now[i]) : initial === now;
      if (!same) commit(initial, 'reset', 'api');
      // The browser resets the native options after this event; re-sync them.
      setTimeout(() => {
        const select = nativeRef.current;
        if (!select) return;
        const set = new Set(latest.current.values.map(String));
        for (const option of Array.from(select.options)) option.selected = set.has(option.value) || (set.size === 0 && option.value === '');
      }, 0);
    };
    form.addEventListener('reset', onReset);
    return () => form.removeEventListener('reset', onReset);
  });

  // --- value commits -----------------------------------------------------------
  function commit(next: ListboxKey | readonly ListboxKey[] | null, reason: ListboxValueChangeReason, source: ListboxEventSource): void {
    const { props: p, current: previousValue, view: v, collection: c } = latest.current;
    if (!controlled) setInnerValue(next);
    const handler = p.onValueChange as ((value: unknown, event: ListboxValueChangeEvent<T>) => void) | undefined;
    if (!handler) return;
    let materialized: readonly T[] | null = null;
    const nextValues: readonly ListboxKey[] = Array.isArray(next) ? next : next === null ? [] : [next as ListboxKey];
    const event = Object.freeze({
      reason,
      source,
      previousValue,
      get items(): readonly T[] {
        if (materialized) return materialized;
        const out: T[] = [];
        if (!v.remote) {
          for (const val of nextValues) {
            const i = c.indexOf(val);
            if (i >= 0) out.push(c.items[i] as T);
          }
        } else {
          const set = new Set(nextValues);
          for (let i = 0; i < v.count; i++) {
            const item = v.item(i);
            if (item !== undefined && set.has(valueOf(item))) out.push(item);
          }
        }
        materialized = Object.freeze(out);
        return materialized;
      },
    }) as ListboxValueChangeEvent<T>;
    handler(next, event);
  }

  const canChange = !disabled && !readOnly;

  const selectOnly = (index: number, source: ListboxEventSource): void => {
    const v = view.value(index);
    if (v === undefined || !canChange || view.disabled(index)) return;
    if (multiple) {
      if (values.length === 1 && values[0] === v) return;
      commit([v], 'select', source);
    } else if (current !== v) commit(v, 'select', source);
  };

  const limitReached = (adding: number): boolean => {
    if (!multiple || maxSelected === undefined || values.length + adding <= maxSelected) return false;
    announce(formatListboxText(text.selectionLimit, { max: maxSelected }));
    return true;
  };

  const toggle = (index: number, source: ListboxEventSource): void => {
    const v = view.value(index);
    if (v === undefined || !canChange || view.disabled(index)) return;
    if (!multiple) {
      if (current !== v) commit(v, 'select', source);
      return;
    }
    if (selectedSet.has(v)) commit(values.filter((x) => x !== v), 'deselect', source);
    else if (!limitReached(1)) commit([...values, v], 'select', source);
  };

  const selectRange = (fromEntry: number, toEntry: number, source: ListboxEventSource): void => {
    if (!multiple || !canChange) return;
    const lo = Math.max(0, Math.min(fromEntry, toEntry));
    const hi = Math.min(count - 1, Math.max(fromEntry, toEntry));
    const next = values.slice();
    const set = new Set(values);
    for (let e = lo; e <= hi; e++) {
      const code = view.code(e);
      if (code < 0 || view.disabled(code)) continue;
      const v = view.value(code);
      if (v === undefined || set.has(v)) continue;
      if (maxSelected !== undefined && next.length >= maxSelected) {
        announce(formatListboxText(text.selectionLimit, { max: maxSelected }));
        break;
      }
      set.add(v);
      next.push(v);
    }
    if (next.length !== values.length) commit(next, 'select', source);
  };

  const allSelectable = useMemo(() => {
    if (!multiple || !showSelectAll || remoteSource) return { all: false, some: false };
    let selectable = 0;
    let selected = 0;
    for (let i = 0; i < collection.size; i++) {
      if (disabledOf(collection.items[i] as T)) continue;
      selectable++;
      if (selectedSet.has(collection.value(i))) selected++;
    }
    return { all: selectable > 0 && selected === selectable, some: selected > 0 };
    // disabledOf follows isItemDisabled.
  }, [multiple, showSelectAll, remoteSource, collection, selectedSet, isItemDisabled]);

  const selectAll = (source: ListboxEventSource): void => {
    if (!multiple || !canChange) return;
    let all = true;
    if (remoteSource) {
      // Remote: the loaded items (the value holds item values, which need the items).
      const next = new Set(values);
      for (let i = 0; i < count; i++) {
        const item = view.item(i);
        if (item !== undefined && !disabledOf(item)) next.add(valueOf(item));
      }
      if (next.size !== values.length) return commit([...next].slice(0, maxSelected ?? Infinity), 'selectAll', source);
      all = true;
    } else {
      const next = selectAllValues({ ...collection, disabled: (i: number) => disabledOf(collection.items[i] as T) }, selectedSet, maxSelected === undefined ? Infinity : maxSelected);
      if (next.length !== values.length) return commit(next, 'selectAll', source);
      for (let i = 0; i < collection.size; i++) {
        if (!disabledOf(collection.items[i] as T) && !selectedSet.has(collection.value(i))) all = false;
      }
      if (!all) {
        // Not everything is selected, but maxSelected is reached.
        limitReached(1);
        return;
      }
    }
    // Everything selectable is selected: clear (disabled values keep their state).
    const keep = values.filter((v) => {
      const i = remoteSource ? -1 : collection.indexOf(v);
      return i >= 0 && disabledOf(collection.items[i] as T);
    });
    commit(keep, 'clear', source);
  };

  // --- active entry ------------------------------------------------------------
  const optionId = (index: number): string => `${id}-opt-${index}`;
  const setActive = (entry: number, reveal: boolean): void => {
    const code = entry >= 0 ? view.code(entry) : -1;
    activeValue.current = code >= 0 ? view.value(code) : undefined;
    store.set({ active: entry });
    if (!reveal) return;
    const el = listRef.current;
    if (!el) return;
    const top = revealOffset(Math.floor(entry / columns), itemHeight, el.scrollTop, el.clientHeight || maxVisibleItems * itemHeight);
    if (top !== null) {
      el.scrollTop = top;
      onScroll();
    }
  };
  const step = (from: number, dir: 1 | -1, distance = 1): number => {
    let e = from;
    let found = from;
    let moved = 0;
    while (moved < distance) {
      e += dir;
      if (e < 0 || e >= count) break;
      const code = view.code(e);
      if (code < 0 || view.disabled(code)) continue;
      found = e;
      moved++;
    }
    if (found === from && distance > 1) {
      // Page moves stop at the last enabled entry in that direction.
      for (let k = from + dir; k >= 0 && k < count; k += dir) {
        const code = view.code(k);
        if (code >= 0 && !view.disabled(code)) found = k;
      }
    }
    return found;
  };
  const edge = (dir: 1 | -1): number => step(dir === 1 ? -1 : count, dir);

  // --- scroll: the mounted window moves about once per overscan ---------------
  function onScroll(): void {
    const el = listRef.current;
    const l = latest.current;
    if (!el || !l.virtual) return;
    const h = store.getState().itemHeight;
    const start = Math.floor(el.scrollTop / h);
    const visible = Math.max(1, Math.ceil((el.clientHeight || maxVisibleItems * h) / h));
    const s = store.getState();
    const next = nextWindow({ first: s.first, last: s.last }, l.rows, start, visible);
    const stickyGroup = l.collection.grouped && !l.view.remote ? (l.view.group(Math.min(start, l.count - 1)) ?? null) : null;
    store.set({ first: next.first, last: next.last, sticky: stickyGroup });
  }

  // --- keyboard ------------------------------------------------------------------
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>, fromSearch: boolean): void => {
    if (disabled || count === 0) return;
    // The grid keys (lazy chunk); other keys of a control inside a cell belong to it.
    if (grid && !fromSearch && (gridModule?.gridKeyDown(event, listRef.current as HTMLElement, view, count, columns, activeEntry, maxVisibleItems, setActive) || event.target !== listRef.current)) return;
    const mod = event.ctrlKey || event.metaKey;
    const from = activeEntry >= 0 ? activeEntry : -1;
    let target = -1;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        const dir = event.key === 'ArrowDown' ? 1 : -1;
        if (event.altKey) {
          if (reorderable && !fromSearch) keyboardReorder(dir);
          event.preventDefault();
          return;
        }
        target = from < 0 ? edge(dir) : step(from, dir);
        event.preventDefault();
        setActive(target, true);
        const code = view.code(target);
        if (code < 0) return;
        // Shift+Arrow toggles the option it lands on, which becomes the anchor; a plain move keeps the anchor (APG listbox).
        if (multiple && event.shiftKey) toggle(code, 'keyboard'), (anchor.current = target);
        else if (!multiple && !mod && !grid) selectOnly(code, 'keyboard');
        return;
      }
      case 'PageDown':
      case 'PageUp': {
        const dir = event.key === 'PageDown' ? 1 : -1;
        target = step(from < 0 ? (dir === 1 ? -1 : count) : from, dir, maxVisibleItems);
        event.preventDefault();
        setActive(target, true);
        if (!multiple && !mod && !grid) selectOnly(view.code(target), 'keyboard');
        return;
      }
      case 'Home':
      case 'End': {
        if (fromSearch) return;
        target = event.key === 'End' ? edge(-1) : edge(1);
        event.preventDefault();
        if (multiple && mod && event.shiftKey && from >= 0) selectRange(from, target, 'keyboard');
        setActive(target, true);
        if (!multiple && !mod && !grid) selectOnly(view.code(target), 'keyboard');
        return;
      }
      case ' ':
      case 'Enter': {
        if (fromSearch && event.key === ' ') return;
        if (from < 0) return;
        event.preventDefault();
        const code = view.code(from);
        if (code < 0) return;
        if (multiple && event.shiftKey && anchor.current >= 0) selectRange(anchor.current, from, 'keyboard');
        else toggle(code, 'keyboard');
        anchor.current = from;
        return;
      }
      case 'Escape': {
        if (fromSearch && search) {
          event.preventDefault();
          changeSearch('');
        }
        return;
      }
      case 'a':
      case 'A': {
        if (mod && multiple && !fromSearch) {
          event.preventDefault();
          selectAll('keyboard');
          return;
        }
        break;
      }
      default:
        break;
    }
    if (!fromSearch && isTypeaheadKey(event)) {
      const found = typeahead(
        event.key,
        event.timeStamp || Date.now(),
        count,
        from,
        (e) => {
          const code = view.code(e);
          return code < 0 ? '' : view.label(code);
        },
        (e) => {
          const code = view.code(e);
          return code >= 0 && !view.disabled(code);
        },
      );
      if (found >= 0) {
        event.preventDefault();
        setActive(found, true);
        if (!multiple && !grid) selectOnly(view.code(found), 'keyboard');
      }
    }
  };

  const keyboardReorder = (dir: 1 | -1): void => {
    if (remoteSource || activeEntry < 0 || readOnly) return;
    const code = view.code(activeEntry);
    if (code < 0) return;
    const activeVal = view.value(code) as ListboxKey;
    const moving = multiple && selectedSet.has(activeVal) ? values : [activeVal];
    const indexes = moving.map((v) => collection.indexOf(v)).filter((i) => i >= 0).sort((a, b) => a - b);
    if (indexes.length === 0) return;
    const firstIndex = indexes[0] as number;
    const lastIndex = indexes[indexes.length - 1] as number;
    if ((dir < 0 && firstIndex === 0) || (dir > 0 && lastIndex === collection.size - 1)) return;
    const toIndex = dir < 0 ? firstIndex - 1 : lastIndex + 2;
    pendingMove.current = { value: activeVal, label: view.label(code) };
    const moved = indexes.map((i) => collection.value(i));
    onReorder?.({ values: moved, items: indexes.map((i) => collection.items[i] as T), toIndex, delta: dir, source: 'keyboard' });
  };

  // --- search ---------------------------------------------------------------------
  const changeSearch = (next: string): void => {
    setSearch(next);
    onSearchChange?.({ text: next });
    remote?.setSearch(next);
  };

  // --- pointer ----------------------------------------------------------------------
  const entryFromEvent = (target: EventTarget | null): number => {
    const option = (target as Element | null)?.closest?.('[data-entry]');
    if (!option || !listRef.current?.contains(option)) return -1;
    const entry = Number(option.getAttribute('data-entry'));
    return Number.isFinite(entry) ? entry : -1;
  };
  const suppressClick = useRef(false);
  const pressing = useRef(false);
  const onClick = (event: ReactMouseEvent<HTMLDivElement>): void => {
    userClick?.(event);
    if (event.defaultPrevented || disabled) return;
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    const entry = entryFromEvent(event.target);
    if (entry < 0) return;
    const code = view.code(entry);
    if (code < 0 || view.disabled(code)) return;
    const source = sourceOf(event.nativeEvent as { pointerType?: string });
    setActive(entry, false);
    // A click on a control inside a grid cell only makes the cell active.
    if (grid && gridModule?.controlOf(event.target, listRef.current as HTMLElement)) return;
    if (multiple && event.shiftKey && anchor.current >= 0) selectRange(anchor.current, entry, source);
    else if (multiple || event.ctrlKey || event.metaKey) toggle(code, source);
    else selectOnly(code, source);
    anchor.current = entry;
  };

  const dragging = useRef<(() => void) | null>(null);
  const draggable = !grid && (reorderable || dragGroup !== undefined) && canChange && !remoteSource;
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    userPointerDown?.(event);
    pressing.current = true;
    setTimeout(() => {
      pressing.current = false;
    }, 0);
    if (event.defaultPrevented || !draggable || event.button !== 0 || dragging.current) return;
    const entry = entryFromEvent(event.target);
    const code = entry < 0 ? -1 : view.code(entry);
    const list = listRef.current;
    const target = list ? dropTargets.get(list) : undefined;
    if (code < 0 || view.disabled(code) || !list || !target) return;
    const { clientX, clientY, pointerId, pointerType } = event;
    const win = list.ownerDocument.defaultView;
    if (!win) return;
    // The drag chunk loads on the first press of a draggable option; a
    // release before it arrives is a click, not a drag.
    let released = false;
    const onRelease = (): void => {
      released = true;
    };
    win.addEventListener('pointerup', onRelease, { once: true });
    win.addEventListener('pointercancel', onRelease, { once: true });
    dragging.current = () => {};
    void import('./drag.js').then((m) => {
      win.removeEventListener('pointerup', onRelease);
      win.removeEventListener('pointercancel', onRelease);
      if (released) {
        dragging.current = null;
        return;
      }
      const l = latest.current;
      const c = l.collection;
      const pressed = c.value(code);
      const moving = l.multiple && l.values.includes(pressed) ? c.items.map((_, i) => i).filter((i) => l.values.includes(c.value(i))) : [code];
      dragging.current = m.armDrag(list, target, {
        pointerId,
        pointerType,
        startX: clientX,
        startY: clientY,
        values: moving.map((i) => c.value(i)),
        items: moving.map((i) => c.items[i]),
        label: c.label(code),
        onDragStart: (e) => latest.current.props.onItemDragStart?.(e as never),
        onDrag: (e) => latest.current.props.onItemDrag?.(e),
        onStart: () => {
          suppressClick.current = true;
        },
        onEnd: () => {
          dragging.current = null;
          setTimeout(() => {
            suppressClick.current = false;
          }, 0);
        },
      });
    });
  };

  // Drop target registration: the drag chunk loads after mount for a list
  // that reorders or shares a dragGroup, and registers it in its WeakMap.
  useEffect(() => {
    const list = listRef.current;
    if (!list || (!reorderable && dragGroup === undefined) || remoteSource || grid) return;
    let live = true;
    let unregister = (): void => {};
    void import('./drag.js').then((m) => {
      if (live) unregister = m.registerDropTarget(list, id, dragGroup ?? null, reorderable, latest as never);
    });
    return () => {
      live = false;
      unregister();
    };
  }, [id, reorderable, dragGroup, remoteSource, grid]);
  useEffect(
    () => () => {
      dragging.current?.();
    },
    [],
  );

  // --- render --------------------------------------------------------------------
  const busy = loadingProp === true || (snapshot?.loading ?? false) || (remoteSource !== null && snapshot === null);
  const setsize = view.itemCount;
  const highlight = highlightMatches && typeof searchOperator === 'string' ? searchOperator : null;
  const limitHit = multiple && maxSelected !== undefined && values.length >= maxSelected;
  const renderOption = (entry: number, top: number | null): ReactNode => {
    const code = view.code(entry);
    const item = view.item(code);
    const placeholder = item === undefined;
    const value = placeholder ? undefined : view.value(code);
    const selected = value !== undefined && selectedSet.has(value);
    const itemDisabled = placeholder ? true : view.disabled(code) || (limitHit && !selected);
    return (
      <ListboxOption
        key={placeholder ? `p${code}` : String(value)}
        id={optionId(code)}
        entry={entry}
        index={code}
        item={item}
        value={value}
        label={placeholder ? '' : view.label(code)}
        selected={selected}
        active={entry === activeEntry}
        disabled={itemDisabled}
        placeholder={placeholder}
        posinset={view.posinset(entry)}
        setsize={setsize}
        indicator={indicator}
        cell={grid}
        draggable={draggable && !itemDisabled}
        top={top}
        search={search}
        highlight={highlight}
        matchRanges={searchModule?.matchRanges}
        matchCase={matchCase}
        ignoreAccents={ignoreAccents}
        loadingText={formatListboxText(text.loading)}
        className={classNames?.option}
        style={styles?.option}
        renderItem={renderItem as ((state: ListboxItemState<never>) => ReactNode) | undefined}
        getItemIcon={getItemIcon as ((item: never) => ReactNode) | undefined}
        getItemProps={getItemProps as ((item: never, state: { readonly selected: boolean; readonly disabled: boolean }) => ListboxItemProps | undefined) | undefined}
      />
    );
  };
  const renderHeader = (group: string, key: string): ReactNode => (
    <div key={key} className={cx('salmon-listbox-group-header', classNames?.groupHeader)} style={styles?.groupHeader} aria-hidden="true">
      {renderGroupHeader ? renderGroupHeader({ group }) : group}
    </div>
  );
  // Entries of the window, wrapped per group in role="group" containers.
  const body: ReactNode[] = [];
  let chunk: ReactNode[] = [];
  let chunkGroup: string | undefined;
  let chunkStart = first;
  const flush = (): void => {
    if (chunk.length === 0) return;
    if (chunkGroup === undefined) body.push(...chunk);
    else
      body.push(
        <div key={`g${chunkStart}`} role="group" aria-label={chunkGroup} className={cx('salmon-listbox-group', classNames?.group)} style={styles?.group}>
          {chunk}
        </div>,
      );
    chunk = [];
  };
  const renderRow = (r: number, top: number | null): ReactNode => {
    const cells: ReactNode[] = [];
    for (let e = r * columns; e < Math.min(count, (r + 1) * columns); e++) cells.push(renderOption(e, null));
    return (
      <div key={`r${r}`} role="row" aria-rowindex={r + 1} className="salmon-listbox-row" style={top === null ? undefined : { position: 'absolute', insetBlockStart: top, insetInline: 0 }}>
        {cells}
      </div>
    );
  };
  for (let e = first; e < last; e++) {
    if (grid) {
      body.push(renderRow(e, null));
      continue;
    }
    const code = view.code(e);
    const group = collection.grouped && !view.remote ? view.group(e) : undefined;
    if (e === first || group !== chunkGroup) {
      flush();
      chunkGroup = group;
      chunkStart = e;
    }
    chunk.push(code < 0 ? renderHeader(group ?? '', `h${e}`) : renderOption(e, null));
  }
  flush();
  // The active option stays mounted outside the window.
  const activeRow = Math.floor(activeEntry / columns);
  const outOfBand =
    virtual && activeEntry >= 0 && (activeRow < first || activeRow >= last) && view.code(activeEntry) >= 0
      ? grid
        ? renderRow(activeRow, activeRow * itemHeight)
        : renderOption(activeEntry, activeEntry * itemHeight)
      : null;

  const listHeight = Math.max(1, Math.min(rows, maxVisibleItems)) * itemHeight;
  const emptyReason = count === 0 && !busy && remoteError === null ? (search || (snapshot?.held ?? false) ? 'noMatch' : 'noData') : null;
  const activeId = activeEntry >= 0 && view.code(activeEntry) >= 0 ? optionId(view.code(activeEntry)) : undefined;
  const userSized = style?.height !== undefined || style?.blockSize !== undefined;
  useLayoutEffect(() => {
    if (gridModule && listRef.current) gridModule.syncTabStops(listRef.current, activeId);
  });

  return (
    <div
      className={cx('salmon-listbox', className, classNames?.root)}
      style={style || styles?.root ? { ...styles?.root, ...style } : undefined}
      data-multiple={multiple ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-readonly={readOnly ? '' : undefined}
      data-virtual={virtual ? '' : undefined}
      data-layout={grid ? 'grid' : undefined}
      data-indicator-position={indicatorPosition === 'end' ? 'end' : undefined}
    >
      {searchable ? (
        <div className={cx('salmon-listbox-search', classNames?.search)} style={styles?.search}>
          <input
            ref={searchRef}
            type="search"
            className="salmon-listbox-search-input"
            value={search}
            placeholder={searchPlaceholder}
            aria-label={formatListboxText(text.searchLabel)}
            aria-controls={id}
            aria-activedescendant={activeId}
            autoComplete="off"
            disabled={disabled}
            onChange={(event) => changeSearch(event.target.value)}
            onKeyDown={(event) => onKeyDown(event, true)}
          />
        </div>
      ) : null}
      {multiple && showSelectAll ? (
        <label className={cx('salmon-listbox-select-all', classNames?.selectAll)} style={styles?.selectAll}>
          <input
            type="checkbox"
            checked={allSelectable.all}
            ref={(el) => {
              if (el) el.indeterminate = allSelectable.some && !allSelectable.all;
            }}
            aria-controls={id}
            disabled={disabled || readOnly}
            onChange={() => selectAll('pointer')}
          />
          <span>{formatListboxText(text.selectAll)}</span>
        </label>
      ) : null}
      <div
        {...dom}
        ref={(el) => {
          listRef.current = el;
          setRef(ref, el);
        }}
        id={id}
        role={grid ? 'grid' : 'listbox'}
        tabIndex={disabled ? -1 : 0}
        aria-multiselectable={multiple || undefined}
        aria-activedescendant={activeId}
        aria-disabled={disabled || undefined}
        aria-readonly={readOnly || undefined}
        aria-required={(required && !grid) || undefined}
        aria-rowcount={grid ? rows : undefined}
        aria-busy={busy || undefined}
        className={cx('salmon-listbox-list', classNames?.list)}
        style={{
          ...(userSized ? undefined : { maxBlockSize: listHeight }),
          ...(virtual && count > 0 ? { blockSize: listHeight } : undefined),
          ...(grid ? { '--salmon-listbox-columns': columns } : undefined),
          ...styles?.list,
        }}
        data-count={count}
        onScroll={
          virtual || userScroll
            ? (event) => {
                userScroll?.(event);
                if (virtual) onScroll();
              }
            : undefined
        }
        onKeyDown={(event) => {
          userKeyDown?.(event);
          if (!event.defaultPrevented) onKeyDown(event, false);
        }}
        onFocus={(event) => {
          userFocus?.(event);
          // Focus on a control inside a grid cell (Tab, click) makes its cell active.
          if (grid && event.target !== event.currentTarget) return setActive(entryFromEvent(event.target), false);
          if (activeEntry >= 0 || count === 0) return;
          const firstSelected = values.length > 0 && !remoteSource ? view.entryOf(collection.indexOf(values[0] as ListboxKey)) : -1;
          // A pointer press focuses without scrolling: the click picks the option under the pointer.
          setActive(firstSelected >= 0 ? firstSelected : edge(1), !pressing.current);
        }}
        onClick={onClick}
        onPointerDown={onPointerDown}
      >
        {virtual && sticky !== null ? (
          <div className="salmon-listbox-sticky" aria-hidden="true" style={{ blockSize: itemHeight, marginBlockEnd: -itemHeight }}>
            {renderGroupHeader ? renderGroupHeader({ group: sticky }) : sticky}
          </div>
        ) : null}
        {virtual ? (
          <div className="salmon-listbox-sizer" role="presentation" style={{ blockSize: count * itemHeight }}>
            <div role="presentation" style={{ transform: `translateY(${first * itemHeight}px)` }}>
              {body}
            </div>
            {outOfBand}
          </div>
        ) : (
          <div className="salmon-listbox-items" role="presentation">
            {body}
          </div>
        )}
      </div>
      {emptyReason ? (
        <div className={cx('salmon-listbox-empty', classNames?.empty)} style={styles?.empty}>
          {renderEmpty ? renderEmpty({ reason: emptyReason }) : formatListboxText(emptyReason === 'noMatch' ? text.noResults : text.noData)}
        </div>
      ) : null}
      {busy && count === 0 ? <div className="salmon-listbox-loading">{renderLoading ? renderLoading() : formatListboxText(text.loading)}</div> : null}
      {remoteError !== null ? (
        <div className="salmon-listbox-error" role="alert">
          {renderError ? (
            renderError({ error: remoteError, retry: () => remote?.retry() })
          ) : (
            <>
              <span>{formatListboxText(text.loadError)}</span>{' '}
              <button type="button" className="salmon-listbox-retry" onClick={() => remote?.retry()}>
                {formatListboxText(text.retry)}
              </button>
            </>
          )}
        </div>
      ) : null}
      <div ref={liveRef} className="salmon-listbox-live" role="status" aria-live="polite" />
      {name !== undefined ? (
        <select
          ref={nativeRef}
          className="salmon-listbox-native"
          name={name}
          form={form}
          multiple={multiple}
          required={required}
          disabled={disabled}
          tabIndex={-1}
          aria-hidden="true"
          value={multiple ? values.map(String) : values.length > 0 ? String(values[0]) : ''}
          onChange={() => {}}
        >
          {multiple ? null : <option value="" />}
          {values.map((v) => (
            <option key={String(v)} value={String(v)} />
          ))}
        </select>
      ) : null}
    </div>
  );
}
