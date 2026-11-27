'use client';

// The listbox popup shared by Select and Combobox: the per-render controller (collection, view,
// active entry, selection), the windowed option list with
// `aria-activedescendant` focus, group headers, the select-all option,
// empty / loading / error states, the polite live region and the hidden
// native `<select>` that carries the value into forms.
//
// Built on the shared collection primitives (internal/collection/): the
// collection model, the list view, the per-instance store, the virtual
// window math, the search index and the remote adapter (both lazy chunks),
// and the selection helpers.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type Ref, type RefObject } from 'react';
import type { SortDescriptor } from '@salmonui/core/data';
import { createCollection, defaultItemDisabled, defaultItemLabel, defaultItemValue, type Collection } from '../internal/collection/collection.js';
import type { RemoteCollection, RemoteSnapshot } from '../internal/collection/remote.js';
import type { SearchOperatorName } from '../internal/collection/search.js';
import { selectAllValues } from '../internal/collection/selection.js';
import { createCollectionStore, type CollectionStore } from '@salmonui/core/internal/collection/store';
import { localView, remoteView, type ListView } from '../internal/collection/view.js';
import { nextWindow, OVERSCAN, revealOffset, windowRange } from '@salmonui/core/internal/collection/virtual';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';
import { pressSource } from '@salmonui/core/internal/press';
import { DROPDOWN_DEFAULT_LOCALE_TEXT } from './locale.js';
import { isRtl } from '@salmonui/core/internal/position';
import type { DropdownCommonProps, DropdownEventSource, DropdownLocaleText, DropdownPart, DropdownPartProps, DropdownValue, DropdownValueChangeEvent, DropdownValueChangeReason, RemoteSource } from './types.js';

export { OVERSCAN };
/** Above this many entries the list is windowed unless `virtualization={false}`. */
export const VIRTUAL_THRESHOLD = 100;
const DEFAULT_ITEM_HEIGHT = 32;
/** Active entry of the select-all option (it sits above the list). */
export const SELECT_ALL_ROW = -2;

const EMPTY_VALUES: readonly DropdownValue[] = Object.freeze([]);

type SearchModule = typeof import('../internal/collection/search.js');

export type DropdownKind = 'select' | 'combobox';

export interface ControllerConfig<Item> {
  readonly kind: DropdownKind;
  readonly props: DropdownCommonProps<Item>;
  /** The component's `localeText` over its LocaleProvider family (`useLocaleText('select', ...)`). */
  readonly localeText: Partial<DropdownLocaleText> | undefined;
  /** The component's `locale` over its LocaleProvider's (`useLocale(props.locale)`). */
  readonly locale: string | undefined;
  readonly multiple: boolean;
  readonly values: readonly DropdownValue[];
  readonly setValues: (next: readonly DropdownValue[], event: DropdownValueChangeEvent<Item>) => void;
  readonly open: boolean;
  readonly listId: string;
  /** Text the list is filtered by ('' shows everything). */
  readonly searchText: string;
  /** Load the search index (the popup opened, or the input has focus). */
  readonly wantSearch: boolean;
  /** Items created in this instance (Combobox `creatable`), by value. */
  readonly extraItems?: ReadonlyMap<DropdownValue, Item> | undefined;
  readonly defaultOperator: SearchOperatorName;
  /** Text searched per item when it is not the label (Combobox `searchFields` over local columns). */
  readonly searchTextOf?: ((item: Item) => string) | undefined;
  /** Local row order (Combobox `columns` sorting); applied to ungrouped lists. */
  readonly compare?: ((a: Item, b: Item) => number) | undefined;
  /** Remote sort (Combobox `columns` sorting over a remote source). */
  readonly sorting?: readonly SortDescriptor[] | undefined;
}

/** Shallow-merged texts over the defaults. */
export function useMergedText(localeText: Partial<DropdownLocaleText> | undefined): DropdownLocaleText {
  return useMemo(() => (localeText ? { ...DROPDOWN_DEFAULT_LOCALE_TEXT, ...localeText } : DROPDOWN_DEFAULT_LOCALE_TEXT), [localeText]);
}

export function partClass(base: string, props: DropdownCommonProps<unknown>, part: DropdownPart): string {
  const extra = props.classNames?.[part];
  return extra ? `${base} ${extra}` : base;
}

export function rootClass(base: string, part: string | undefined, className: string | undefined): string {
  return part || className ? [base, part, className].filter(Boolean).join(' ') : base;
}

export function partStyle(props: DropdownCommonProps<unknown>, part: DropdownPart): CSSProperties | undefined {
  return props.styles?.[part];
}

/** Change source of a click (shared `pressSource`: `detail === 0` is keyboard, `pointerType` decides touch). */
export const sourceOf: (event: { readonly detail?: number; readonly nativeEvent?: unknown }) => DropdownEventSource = pressSource;

/** A frozen change event whose `items` getter materializes the items only when read. */
export function changeEvent<Item>(source: DropdownEventSource, reason: DropdownValueChangeReason, previousValue: readonly DropdownValue[], items: () => readonly Item[]): DropdownValueChangeEvent<Item> {
  let cached: readonly Item[] | null = null;
  const event = {
    source,
    reason,
    previousValue,
    get items(): readonly Item[] {
      cached ??= Object.freeze(items().slice());
      return cached;
    },
  };
  return Object.freeze(event);
}

export function isRemoteSource(data: unknown): data is RemoteSource<unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data) && typeof (data as { read?: unknown }).read === 'function';
}

const noopSubscribe = (): (() => void) => () => {};
const nullSnapshot = (): null => null;

export interface RowInfo<Item> {
  readonly kind: 'item' | 'group' | 'pending';
  readonly item?: Item;
  readonly group?: string;
  /** Item ordinal for `aria-posinset` (1-based). */
  readonly position: number;
}

/** Remote list state the popup reads (loading, errors, retry). */
export interface RemoteState {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: unknown;
  readonly total: number;
}

export interface DropdownController<Item> {
  readonly kind: DropdownKind;
  readonly props: DropdownCommonProps<Item>;
  readonly text: DropdownLocaleText;
  /** `locale` over the LocaleProvider's (the component resolves it, so the lazy popup needs no locale import). */
  readonly locale: string | undefined;
  readonly multiple: boolean;
  readonly values: readonly DropdownValue[];
  readonly selected: ReadonlySet<DropdownValue>;
  readonly collection: Collection<Item>;
  readonly remote: RemoteCollection<Item> | null;
  readonly remoteState: RemoteState;
  readonly view: ListView<Item>;
  readonly count: number;
  readonly store: CollectionStore;
  readonly listId: string;
  readonly searchText: string;
  readonly operator: SearchOperatorName;
  readonly matchRanges: SearchModule['matchRanges'] | undefined;
  readonly virtual: boolean;
  readonly maxVisible: number;
  readonly limitReached: boolean;
  readonly loading: boolean;
  readonly listRef: RefObject<HTMLDivElement | null>;
  readonly showSelectAll: boolean;
  /** Changes when a new result set arrives (search text, index loaded, remote generation): callers reset the window and the active option on it. */
  readonly resultKey: string;
  optionId(row: number): string;
  rowInfo(row: number): RowInfo<Item>;
  valueOf(item: Item): DropdownValue;
  labelOf(item: Item): string;
  isDisabled(item: Item): boolean;
  /** Item for a selected value: extra (created) items, `selectedItems`, local data. */
  itemFor(value: DropdownValue): Item | undefined;
  labelFor(value: DropdownValue): string;
  itemsFor(values: readonly DropdownValue[]): Item[];
  commit(next: readonly DropdownValue[], reason: DropdownValueChangeReason, source: DropdownEventSource, extra?: readonly Item[]): void;
  setActive(row: number): void;
  /** Moves the active row; returns the new row. */
  move(to: 'next' | 'prev' | 'first' | 'last' | 'pageDown' | 'pageUp'): number;
  /** Active row on open: the (first) selected item, else the first enabled item. */
  initialActive(): number;
  /** Chooses an item row: single selects, multiple toggles. Returns false when nothing changed. */
  choose(row: number, source: DropdownEventSource, addReason?: 'select' | 'add'): boolean;
  toggleAll(source: DropdownEventSource): void;
  toggleGroup(group: string, source: DropdownEventSource): void;
  remove(value: DropdownValue, source: DropdownEventSource): void;
  clear(source: DropdownEventSource): void;
  groupState(group: string): 'all' | 'some' | 'none';
  allState(): 'all' | 'some' | 'none';
  /** Mounted window after a scroll offset change (one store write, commits only when the range moves). */
  scrolled(scrollTop: number): void;
}

/** One instance's popup store, created once (no module-level state). */
function useStore(): CollectionStore {
  const [store] = useState(() => createCollectionStore({ active: -1, first: 0, last: 0, itemHeight: DEFAULT_ITEM_HEIGHT, sticky: null }));
  return store;
}

export function useStoreField<K extends 'active' | 'first' | 'last' | 'itemHeight' | 'sticky'>(store: CollectionStore, key: K) {
  return useSyncExternalStore(
    store.subscribe,
    () => store.getState()[key],
    () => store.getState()[key],
  );
}

export function useDropdownController<Item>(config: ControllerConfig<Item>): DropdownController<Item> {
  const { props, multiple, values, open, searchText, kind } = config;
  const store = useStore();
  const text = useMergedText(config.localeText);
  const listRef = useRef<HTMLDivElement | null>(null);
  const operator: SearchOperatorName = typeof props.searchOperator === 'string' ? props.searchOperator : config.defaultOperator;
  const source = isRemoteSource(props.data) ? (props.data as RemoteSource<Item>) : null;
  const localItems = source ? (EMPTY_VALUES as unknown as readonly Item[]) : (props.data as readonly Item[]);
  const { getItemValue, getItemLabel, getItemGroup, isItemDisabled } = props;
  const collection = useMemo(() => createCollection<Item>(localItems, { getItemValue, getItemLabel, getItemGroup, isItemDisabled }), [localItems, getItemValue, getItemLabel, getItemGroup, isItemDisabled]);
  const valueOf = (getItemValue ?? defaultItemValue) as (item: Item) => DropdownValue;
  const labelOf = (getItemLabel ?? defaultItemLabel) as (item: Item) => string;
  const disabledOf = (isItemDisabled ?? defaultItemDisabled) as (item: Item) => boolean;
  const matchCase = props.matchCase ?? false;
  const ignoreAccents = props.ignoreAccents ?? false;
  const minSearch = props.minSearchLength ?? 0;
  const maxResults = props.maxResults;

  // The search index is a lazy chunk (as in Listbox), loaded when the popup
  // opens or the input gets focus, and built after the first paint.
  const [searchModule, setSearchModule] = useState<SearchModule | null>(null);
  const wantSearch = config.wantSearch && !source;
  useEffect(() => {
    if (!wantSearch || searchModule) return;
    let live = true;
    void import('../internal/collection/search.js').then((m) => live && setSearchModule(m));
    return () => {
      live = false;
    };
  }, [wantSearch, searchModule]);
  const searchTextOf = config.searchTextOf;
  const searchCollection = useMemo(() => (searchTextOf ? createCollection<Item>(localItems, { getItemLabel: searchTextOf }) : collection), [collection, localItems, searchTextOf]);
  const index = useMemo(() => (searchModule ? searchModule.createSearchIndex(searchCollection, { matchCase, ignoreAccents }) : null), [searchModule, searchCollection, matchCase, ignoreAccents]);
  useEffect(() => {
    if (!open || !index || index.built) return;
    const timer = setTimeout(() => index.build(), 0);
    return () => clearTimeout(timer);
  }, [open, index]);

  // Remote: the adapter is a lazy chunk; options are fixed per adapter, so a change re-creates it.
  const [remote, setRemote] = useState<RemoteCollection<Item> | null>(null);
  const { searchFields, query, debounce } = props;
  const sorting = config.sorting;
  useEffect(() => {
    if (!source) return;
    let live = true;
    let r: RemoteCollection<Item> | null = null;
    void import('../internal/collection/remote.js').then((m) => {
      if (!live) return;
      // Initial values without selectedItems: their items come from one read.
      r = m.createValueCollection(
        source,
        {
          searchFields,
          operator,
          matchCase,
          ignoreAccents,
          query: sorting?.length ? { ...query, sorting } : query,
          maxResults,
          minSearchLength: minSearch,
          debounce,
        },
        props.selectedItems ? undefined : values,
      );
      setRemote(r);
    });
    return () => {
      live = false;
      r?.dispose();
      setRemote(null);
    };
    // Keyed by value: inline literals (`searchFields={['a']}`) must not re-create the adapter on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, JSON.stringify([searchFields, query]), operator, matchCase, ignoreAccents, sorting, maxResults, minSearch, debounce]);
  const snapshot: RemoteSnapshot<Item> | null = useSyncExternalStore(remote ? remote.subscribe : noopSubscribe, remote ? remote.getSnapshot : nullSnapshot, nullSnapshot);
  useEffect(() => {
    if (remote && open) remote.setSearch(searchText);
  }, [remote, open, searchText]);
  const remoteState: RemoteState = {
    status: !source ? 'idle' : !snapshot ? 'loading' : snapshot.error !== null ? 'error' : snapshot.loading || snapshot.total < 0 ? 'loading' : 'ready',
    error: snapshot ? snapshot.error : null,
    total: snapshot ? Math.max(0, snapshot.total) : 0,
  };

  const selected = useMemo(() => new Set(values), [values]);
  const hideSelected = multiple && props.hideSelected === true;
  const fnOperator = typeof props.searchOperator === 'function' ? props.searchOperator : null;
  const compare = config.compare;
  const view = useMemo<ListView<Item>>(() => {
    if (source) return remoteView(snapshot, valueOf, labelOf, disabledOf);
    let subset: Int32Array | null = null;
    if (searchText && searchText.length >= minSearch && index) subset = index.search(searchText, fnOperator ?? operator);
    const hidden = hideSelected && selected.size > 0;
    const sorted = compare && !collection.grouped;
    if (hidden || sorted || (maxResults !== undefined && (subset ? subset.length : collection.size) > maxResults)) {
      let order: number[] = subset ? Array.from(subset) : Array.from({ length: collection.size }, (_, i) => i);
      if (hidden) order = order.filter((i) => !selected.has(collection.value(i)));
      if (sorted) order.sort((a, b) => compare(collection.items[a] as Item, collection.items[b] as Item) || a - b);
      if (maxResults !== undefined && order.length > maxResults) order.length = maxResults;
      subset = Int32Array.from(order);
    }
    return localView(collection, collection.entries(subset), disabledOf);
    // valueOf / labelOf / disabledOf follow the accessor props already in the deps through `collection`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, snapshot, collection, searchText, minSearch, index, fnOperator, operator, hideSelected, selected, compare, maxResults]);
  const count = view.count;
  const virtual = props.virtualization !== false && count > VIRTUAL_THRESHOLD;
  const maxVisible = Math.max(1, props.maxVisibleItems ?? 8);
  const limitReached = multiple && props.maxSelected !== undefined && values.length >= props.maxSelected;
  const loading = props.loading === true || remoteState.status === 'loading';
  const extra = config.extraItems;

  // Duplicate values: checked once per collection after mount, never during render.
  useEffect(() => {
    if (!DEV || collection.size === 0) return;
    const dupe = collection.duplicates()[0];
    if (dupe !== undefined) warnOnce(`dropdown-duplicate:${String(dupe)}`, `${kind === 'select' ? 'Select' : 'Combobox'}: duplicate item value ${JSON.stringify(dupe)}; values must be unique.`);
  }, [collection, kind]);

  const onLoadError = props.onLoadError;
  const error = snapshot?.error ?? null;
  useEffect(() => {
    if (error !== null) onLoadError?.(error);
    // Once per error: an inline `onLoadError` must not re-fire it on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const selectedItems = props.selectedItems;
  const itemFor = (value: DropdownValue): Item | undefined => {
    const e = extra?.get(value);
    if (e !== undefined) return e;
    for (const it of selectedItems ?? snapshot?.known ?? []) if (valueOf(it) === value) return it;
    const i = collection.indexOf(value);
    return i >= 0 ? collection.items[i] : undefined;
  };
  const itemsFor = (vs: readonly DropdownValue[]): Item[] => {
    const out: Item[] = [];
    for (const v of vs) {
      const it = itemFor(v);
      if (it !== undefined) out.push(it);
    }
    return out;
  };

  const rowInfo = (row: number): RowInfo<Item> => {
    const code = view.code(row);
    if (code < 0) return { kind: 'group', group: view.group(row) ?? '', position: 0 };
    const item = view.item(code);
    return item === undefined ? { kind: 'pending', position: row + 1 } : { kind: 'item', item, position: view.posinset(row) };
  };

  const isRowEnabled = (row: number): boolean => {
    const code = view.code(row);
    if (code < 0) return false;
    const item = view.item(code);
    if (item === undefined || disabledOf(item)) return false;
    return !(limitReached && !selected.has(valueOf(item)));
  };

  const findRow = (from: number, step: 1 | -1): number => {
    for (let r = from; r >= 0 && r < count; r += step) if (isRowEnabled(r)) return r;
    return -1;
  };

  const showSelectAll = multiple && props.showSelectAll === true && !source;

  const scrolled = (scrollTop: number): void => {
    const s = store.getState();
    const h = s.itemHeight;
    const start = Math.floor(scrollTop / h);
    const next = virtual ? nextWindow({ first: s.first, last: s.last }, count, start, maxVisible) : { first: 0, last: count };
    // Sticky group header of a windowed grouped list.
    const sticky = virtual && collection.grouped && !source ? (stickyGroup(view, start) ?? null) : null;
    store.set({ ...next, sticky });
  };

  const ensureVisible = (row: number): void => {
    const el = listRef.current;
    if (!el || row < 0) return;
    if (virtual) {
      // A sticky header (the grid popup) covers the top of the scroll viewport.
      const head = el.querySelector<HTMLElement>('[data-sticky-head]')?.offsetHeight ?? 0;
      const offset = revealOffset(row, store.getState().itemHeight, el.scrollTop, el.clientHeight - head);
      if (offset !== null) el.scrollTop = offset;
      scrolled(offset ?? el.scrollTop);
    } else {
      const opt = el.ownerDocument.getElementById(optionId(row));
      if (!opt) return;
      const top = opt.offsetTop;
      const bottom = top + opt.offsetHeight;
      if (top < el.scrollTop) el.scrollTop = top;
      else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
    }
  };

  const optionId = (row: number): string => (row === SELECT_ALL_ROW ? `${config.listId}-all` : `${config.listId}-r${row}`);

  const setActive = (row: number): void => {
    store.set({ active: row });
    if (row >= 0) ensureVisible(row);
  };

  const commit = (next: readonly DropdownValue[], reason: DropdownValueChangeReason, source: DropdownEventSource, extraItems?: readonly Item[]): void => {
    const previous = values;
    const frozen = Object.freeze(next.slice());
    config.setValues(
      frozen,
      changeEvent<Item>(source, reason, previous, () => {
        const out = itemsFor(frozen);
        if (extraItems) for (const it of extraItems) if (!out.includes(it)) out.push(it);
        return out;
      }),
    );
  };

  /** Item indexes of a group's items in the current view. */
  const groupItems = (group: string): number[] => {
    const out: number[] = [];
    let inGroup = false;
    for (let r = 0; r < view.count; r++) {
      const code = view.code(r);
      if (code < 0) inGroup = view.group(r) === group;
      else if (inGroup) out.push(code);
    }
    return out;
  };

  const ctl: DropdownController<Item> = {
    kind,
    props,
    text,
    locale: config.locale,
    multiple,
    values,
    selected,
    collection,
    remote,
    remoteState,
    view,
    count,
    store,
    listId: config.listId,
    searchText,
    operator,
    matchRanges: searchModule?.matchRanges,
    virtual,
    maxVisible,
    limitReached,
    loading,
    listRef,
    showSelectAll,
    resultKey: `${searchText}|${index ? 1 : 0}|${snapshot ? `${snapshot.generation}:${snapshot.total >= 0 ? 1 : 0}` : ''}`,
    optionId,
    rowInfo,
    valueOf,
    labelOf,
    isDisabled: disabledOf,
    itemFor,
    labelFor(value) {
      const it = itemFor(value);
      return it === undefined ? String(value) : labelOf(it);
    },
    itemsFor,
    commit,
    setActive,
    scrolled,
    move(to) {
      const active = store.getState().active;
      const base = active === SELECT_ALL_ROW ? -1 : active;
      let row = to === 'first' ? findRow(0, 1) : to === 'last' ? findRow(count - 1, -1) : to === 'pageDown' ? findRow(Math.min(count - 1, base + maxVisible), -1) : to === 'pageUp' ? findRow(Math.max(0, base - maxVisible), 1) : -1;
      if (to === 'next' || (to === 'pageDown' && row <= base)) row = findRow(base + 1, 1);
      if (to === 'prev' || (to === 'pageUp' && (row < 0 || row >= base))) row = base < 0 ? -1 : findRow(base - 1, -1);
      const up = to === 'prev' || to === 'pageUp' || to === 'first';
      if (showSelectAll && (to === 'first' || (row < 0 && up))) row = SELECT_ALL_ROW;
      if (row === -1) row = active;
      setActive(row);
      return row;
    },
    initialActive() {
      if (values.length && !source) {
        const i = collection.indexOf(values[0] as DropdownValue);
        const row = i >= 0 ? view.entryOf(i) : -1;
        if (row >= 0 && isRowEnabled(row)) return row;
      }
      return findRow(0, 1);
    },
    choose(row, source, addReason = 'select') {
      if (row === SELECT_ALL_ROW) {
        ctl.toggleAll(source);
        return true;
      }
      if (!isRowEnabled(row)) return false;
      const item = view.item(view.code(row)) as Item;
      const value = valueOf(item);
      const known = remote ? [item] : undefined;
      if (!multiple) {
        if (values.length === 1 && values[0] === value) return true;
        commit([value], addReason, source, known);
        return true;
      }
      if (selected.has(value)) commit(values.filter((v) => v !== value), 'deselect', source, known);
      else commit([...values, value], addReason, source, known);
      return true;
    },
    toggleAll(source) {
      if (ctl.allState() === 'all') {
        // Selected disabled values stay (the user cannot change them).
        commit(
          values.filter((v) => {
            const i = collection.indexOf(v);
            return i >= 0 && collection.disabled(i);
          }),
          'selectAll',
          source,
        );
        return;
      }
      let next: DropdownValue[];
      if (searchText) {
        // A filtered list selects the matching items only.
        next = values.slice();
        const seen = new Set(values);
        for (let r = 0; r < view.count; r++) {
          const i = view.code(r);
          if (i < 0 || collection.disabled(i)) continue;
          const v = collection.value(i);
          if (!seen.has(v)) next.push(v), seen.add(v);
        }
        if (props.maxSelected !== undefined && next.length > props.maxSelected) next = next.slice(0, props.maxSelected);
      } else next = selectAllValues(collection, selected, props.maxSelected);
      commit(next, 'selectAll', source);
    },
    toggleGroup(group, source) {
      const groupValues = groupItems(group)
        .filter((i) => !collection.disabled(i))
        .map((i) => collection.value(i));
      if (ctl.groupState(group) === 'all') {
        const drop = new Set(groupValues);
        commit(values.filter((v) => !drop.has(v)), 'deselect', source);
      } else {
        let next = values.slice();
        for (const v of groupValues) if (!selected.has(v)) next.push(v);
        if (props.maxSelected !== undefined && next.length > props.maxSelected) next = next.slice(0, props.maxSelected);
        commit(next, 'select', source);
      }
    },
    remove(value, source) {
      if (selected.has(value)) commit(values.filter((v) => v !== value), 'remove', source);
    },
    clear(source) {
      if (values.length) commit(EMPTY_VALUES, 'clear', source);
    },
    groupState(group) {
      let some = false;
      let all = true;
      for (const i of groupItems(group)) {
        if (collection.disabled(i)) continue;
        if (selected.has(collection.value(i))) some = true;
        else all = false;
      }
      return all && some ? 'all' : some ? 'some' : 'none';
    },
    allState() {
      if (!values.length) return 'none';
      let enabled = 0;
      let hit = 0;
      for (let i = 0; i < collection.size; i++) {
        if (collection.disabled(i)) continue;
        enabled++;
        if (selected.has(collection.value(i))) hit++;
      }
      return hit === 0 ? 'none' : hit === enabled ? 'all' : 'some';
    },
  };
  return ctl;
}

/** Group of the entry at or before `entry` in the view. */
function stickyGroup<Item>(view: ListView<Item>, entry: number): string | undefined {
  for (let r = Math.min(entry, view.count - 1); r >= 0; r--) if (view.code(r) < 0) return view.group(r);
  return undefined;
}

export { windowRange };

/** Callback ref body: sets the internal ref and the user's `ref` (object or function); returns the detach cleanup. */
export function assignRef<T>(own: { current: T | null }, user: Ref<T> | undefined, el: T | null): () => void {
  own.current = el;
  let cleanup: (() => void) | undefined;
  if (typeof user === 'function') {
    const result = user(el);
    cleanup = typeof result === 'function' ? result : () => user(null);
  } else if (user) {
    (user as { current: T | null }).current = el;
    cleanup = () => {
      (user as { current: T | null }).current = null;
    };
  }
  return () => {
    own.current = null;
    cleanup?.();
  };
}

export const ICON_X = 'M4.5 4.5l7 7M11.5 4.5l-7 7';
export const ICON_CHEVRON = 'M4 6l4 4 4-4';
export const ICON_CHECK = 'M3.5 8.5l3 3 6-7';

/** Stroke icon (decorative). */
export function Icon({ d, size = 16, width = 1.5 }: { readonly d: string; readonly size?: number; readonly width?: number }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} aria-hidden="true" focusable="false">
      <path d={d} stroke="currentColor" strokeWidth={width} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function preventFocusLoss(event: { preventDefault(): void }): void {
  event.preventDefault();
}

// ---------------------------------------------------------------------------
// Value display
// ---------------------------------------------------------------------------

/** `Intl.ListFormat` join of labels, or `valueSeparator`. */
export function joinLabels(labels: readonly string[], separator: string | undefined, locale: string): string {
  if (separator !== undefined) return labels.join(separator);
  return new Intl.ListFormat(locale, { type: 'conjunction', style: 'narrow' }).format(labels);
}

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export interface HiddenSelectProps {
  readonly name: string;
  readonly values: readonly DropdownValue[];
  readonly multiple: boolean;
  readonly required?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly form?: string | undefined;
  readonly onReset: () => void;
  readonly onInvalid: (event: { preventDefault(): void }) => void;
}

const noop = (): void => {};

/**
 * Native `<select>` holding one selected option per value: submits with the
 * form before hydration, appears in `FormData`, and gives `required` native
 * constraint validation. Visually hidden, out of the tab order and the
 * accessibility tree; an invalid submit moves focus to the visible control.
 */
export function HiddenSelect(props: HiddenSelectProps) {
  const ref = useRef<HTMLSelectElement | null>(null);
  const onReset = useRef(props.onReset);
  useLayoutEffect(() => {
    onReset.current = props.onReset;
  });
  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const listener = (): void => onReset.current();
    form.addEventListener('reset', listener);
    return () => form.removeEventListener('reset', listener);
  }, [props.form]);
  const strings = props.values.map(String);
  return (
    <select
      ref={ref}
      className="salmon-dropdown-native"
      name={props.name}
      multiple={props.multiple}
      required={props.required}
      disabled={props.disabled}
      form={props.form}
      tabIndex={-1}
      aria-hidden="true"
      value={props.multiple ? strings : (strings[0] ?? '')}
      onChange={noop}
      onInvalid={props.onInvalid}
    >
      {!props.multiple && strings.length === 0 ? <option value="" /> : null}
      {strings.map((v) => (
        <option key={v} value={v} />
      ))}
    </select>
  );
}

export function stopKeys(event: ReactKeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

type PopupModule = typeof import('./popup.js');

/**
 * The popup module (options, list window, overlay placement and dismissal)
 * is a lazy chunk: loaded after mount so a closed dropdown's initial JS
 * carries only the trigger, the value display and the form element.
 */
export function usePopupModule(): PopupModule | null {
  const [module, setModule] = useState<PopupModule | null>(null);
  useEffect(() => {
    let live = true;
    void import('./popup.js').then((m) => live && setModule(m));
    return () => {
      live = false;
    };
  }, []);
  return module;
}

export type PopupMode = 'popover' | 'sheet';

export interface PopupContext {
  readonly mode: PopupMode;
  readonly container: Element;
  readonly rtl: boolean;
}

/** Portal target (the modal dialog around the anchor, the theme scope or the body), direction and popup mode of an opening popup; event time or layout effect only. */
export function resolvePopupContext(mode: 'popover' | 'sheet' | 'auto', anchor: Element): PopupContext {
  const win = anchor.ownerDocument.defaultView;
  return {
    // `auto`: an event-time media query read (never during render, so SSR is unaffected).
    mode: mode === 'auto' ? (win?.matchMedia?.('(pointer: coarse) and (max-width: 640px)').matches ? 'sheet' : 'popover') : mode,
    container: portalScopeOf(anchor),
    rtl: isRtl(anchor),
  };
}
