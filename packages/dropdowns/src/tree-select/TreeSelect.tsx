'use client';

// TreeSelect: the
// APG select-only combobox of `Select` with a tree popup (`aria-haspopup=
// "tree"`). The trigger, value display, form element and popup shell are the
// shared dropdown modules (dropdown/core, dropdown/overlay); the tree model
// (expansion, lazy loading with versions and abort, selection, tri-state
// cascade checks) is the framework-agnostic internal/tree-store that TreeView
// uses too. DOM focus stays on the trigger (or the popup search field); the
// active treeitem is `aria-activedescendant`. The popup and its keyboard are
// a lazy chunk loaded after mount.

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from 'react';
import { assignRef, changeEvent, HiddenSelect, Icon, ICON_CHEVRON, ICON_X, joinLabels, preventFocusLoss, resolvePopupContext, rootClass, sourceOf, type PopupContext } from '../dropdown/core.js';
import type { DropdownEventSource, DropdownOpenChangeEvent, DropdownOpenChangeReason, DropdownValueChangeEvent, DropdownValueChangeReason } from '../dropdown/types.js';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { createCollectionStore, type CollectionStore } from '@salmonui/core/internal/collection/store';
import { createTreeStore, DISABLED, HAS_CHILDREN, type TreeKey, type TreeStore } from '@salmonui/core/internal/tree-store';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import type { TypeaheadState } from '@salmonui/core/internal/typeahead';
import { TREE_SELECT_DEFAULT_LOCALE_TEXT } from './locale.js';
import type { TreeFilterResult } from './filter.js';
import type { TreeSelectLocaleText, TreeSelectMultipleProps, TreeSelectPart, TreeSelectProps, TreeSelectSingleProps } from './types.js';

/** A tree value: the id of a node. */
type DropdownValue = TreeKey;

const EMPTY: readonly DropdownValue[] = Object.freeze([]);
const ROW_HEIGHT = 32;

type AnyItem = Record<string, unknown>;
const isObject = (item: unknown): item is AnyItem => typeof item === 'object' && item !== null;
/** Default accessors. */
export const defaultTreeValue = (item: unknown): DropdownValue => (isObject(item) ? ((item.value ?? item.id) as DropdownValue) : (item as DropdownValue));
export const defaultTreeLabel = (item: unknown): string => (isObject(item) ? String(item.label ?? item.text ?? item.value ?? item.id ?? '') : String(item));
const defaultChildren = (item: unknown): readonly unknown[] | undefined => (isObject(item) && Array.isArray(item.children) ? (item.children as readonly unknown[]) : undefined);
const defaultDisabled = (item: unknown): boolean => isObject(item) && item.disabled === true;

const toArray = (value: DropdownValue | null | readonly DropdownValue[] | undefined): readonly DropdownValue[] => (value == null ? EMPTY : Array.isArray(value) ? (value as readonly DropdownValue[]) : [value as DropdownValue]);
const sameValues = (a: readonly DropdownValue[], b: readonly DropdownValue[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export function partClass(base: string, classNames: Partial<Record<TreeSelectPart, string>> | undefined, part: TreeSelectPart): string {
  const extra = classNames?.[part];
  return extra ? `${base} ${extra}` : base;
}

/** What the open popup shows (internal). */
export interface TreeSelectView {
  /** Shown node indexes in tree order: the store's visible order, or a search result. */
  readonly order: Int32Array;
  readonly filter: TreeFilterResult | null;
  /** Scrolls the row at `position` into view. */
  reveal(position: number): void;
}

/** The state the lazy popup chunk reads and drives (internal). */
export interface TreeSelectController<Item> {
  readonly props: TreeSelectProps<Item>;
  readonly text: TreeSelectLocaleText;
  readonly store: TreeStore<Item>;
  /** Mounted window `[first, last)` and the measured row height. */
  readonly win: CollectionStore;
  readonly listId: string;
  readonly multiple: boolean;
  readonly checkbox: boolean;
  readonly values: readonly DropdownValue[];
  readonly selected: ReadonlySet<DropdownValue>;
  readonly searchText: string;
  readonly maxVisible: number;
  readonly context: PopupContext;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly searchRef: RefObject<HTMLInputElement | null>;
  readonly listRef: RefObject<HTMLDivElement | null>;
  /** The rows the popup shows (the store's visible order or a search result), set by the popup. */
  readonly view: { current: TreeSelectView | null };
  /** Type-ahead buffer of the open popup. */
  readonly typeahead: { current: TypeaheadState | null };
  readonly showSelectAll: boolean;
  optionId(node: number): string;
  isDisabled(node: number): boolean;
  isSelectable(node: number): boolean;
  /** Chooses a node: select, toggle (multiple) or check (checkbox). Returns false when nothing changed. */
  choose(node: number, source: DropdownEventSource, range?: boolean): boolean;
  toggleAll(source: DropdownEventSource): void;
  allState(): 'all' | 'some' | 'none';
  setExpanded(node: number, open: boolean, source: DropdownEventSource): void;
  close(source: DropdownEventSource, reason: DropdownOpenChangeReason): void;
  clearSearch(source: DropdownEventSource): void;
}

type PopupModule = typeof import('./popup.js');

function usePopupModule(): PopupModule | null {
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

/** Active "row" of the select-all option (it sits above the tree). */
export const SELECT_ALL_NODE = -2;

/**
 * A dropdown whose popup is a tree. `ref`
 * receives the trigger `<button role="combobox">`.
 */
export function TreeSelect<Item = unknown>(props: TreeSelectProps<Item>): ReactNode {
  const {
    data,
    getItemValue,
    getItemLabel,
    getChildren,
    getParentId,
    hasChildren,
    loadChildren,
    onLoadError: _onLoadError,
    isItemDisabled,
    isItemSelectable: _isItemSelectable,
    getItemIcon: _getItemIcon,
    getItemProps: _getItemProps,
    selectedItems,
    expanded: expandedProp,
    defaultExpanded,
    onExpandedChange: _onExpandedChange,
    expandOn: _expandOn,
    open: openProp,
    defaultOpen,
    onOpenChange,
    popupMode = 'popover',
    searchable = false,
    searchPlaceholder,
    searchOperator: _searchOperator,
    matchCase: _matchCase,
    ignoreAccents: _ignoreAccents,
    onSearchChange,
    indicator = 'check',
    checkPropagation = 'cascade',
    showSelectAll = false,
    closeOnSelect,
    valueDisplay = 'text',
    maxVisibleValues,
    valueSeparator,
    showTrigger = true,
    clearable = false,
    placeholder,
    disabled = false,
    readOnly = false,
    name,
    required,
    form,
    id,
    autoFocus,
    maxVisibleItems,
    virtualization: _virtualization,
    locale: ownLocale,
    renderItem: _renderItem,
    renderValue,
    renderEmpty: _renderEmpty,
    renderError: _renderError,
    renderLoading: _renderLoading,
    popupHeader: _popupHeader,
    popupFooter: _popupFooter,
    highlightMatches: _highlightMatches,
    localeText: ownText,
    className,
    style,
    size,
    classNames,
    styles,
    ref,
    multiple: multipleProp,
    value: valueProp,
    defaultValue,
    onValueChange,
    ...dom
  } = props;
  const locale = useLocale(ownLocale) ?? 'en-US';
  const localeText = useLocaleText('treeSelect', ownText);
  const multiple = multipleProp === true;
  const checkbox = multiple && indicator === 'checkbox';
  const reactId = useId();
  const listId = `${reactId}-tree`;
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const view = useRef<TreeSelectView | null>(null);
  const typeahead = useRef<TypeaheadState | null>(null);
  const text = useMemo<TreeSelectLocaleText>(() => (localeText ? { ...TREE_SELECT_DEFAULT_LOCALE_TEXT, ...localeText } : TREE_SELECT_DEFAULT_LOCALE_TEXT), [localeText]);

  // Latest props for the store callbacks.
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });

  const valueOf = (getItemValue ?? defaultTreeValue) as (item: Item) => DropdownValue;
  const labelOf = (getItemLabel ?? defaultTreeLabel) as (item: Item) => string;
  const childrenOf = getChildren ?? (getParentId ? undefined : (defaultChildren as (item: Item) => readonly Item[] | undefined));
  const disabledOf = (isItemDisabled ?? defaultDisabled) as (item: Item) => boolean;
  const loader = loadChildren ? (item: Item, o: { readonly signal: AbortSignal }) => (latest.current.loadChildren as NonNullable<typeof loadChildren>)(item, o) : undefined;

  const [initial] = useState(() => toArray(defaultValue));
  const [values, setValues] = useControllableState<readonly DropdownValue[], [DropdownValueChangeEvent<Item>]>(
    valueProp === undefined ? undefined : toArray(valueProp),
    initial,
    onValueChange
      ? (next, event) => {
          if (multiple) (onValueChange as TreeSelectMultipleProps<Item>['onValueChange'])?.(next, event);
          else (onValueChange as TreeSelectSingleProps<Item>['onValueChange'])?.(next[0] ?? null, event);
        }
      : undefined,
    'TreeSelect value',
  );
  const [open, setOpenState] = useControllableState<boolean, [DropdownOpenChangeEvent]>(openProp, false, onOpenChange, 'TreeSelect open');
  const [popupContext, setPopupContext] = useState<PopupContext | null>(null);
  const popupModule = usePopupModule();
  const [search, setSearch] = useState('');

  // --- store -------------------------------------------------------------------
  const [store] = useState(() => {
    const s = createTreeStore<Item>({
      data,
      getItemId: valueOf,
      getItemLabel: labelOf,
      getChildren: childrenOf,
      getParentId: getParentId as ((item: Item) => DropdownValue | null | undefined) | undefined,
      hasChildren,
      isItemDisabled: disabledOf,
      checkPropagation,
      loadChildren: loader,
      onLoadError: (error, item) => latest.current.onLoadError?.(error, item),
    });
    const exp = expandedProp ?? defaultExpanded;
    if (exp) s.setExpandedIds(exp, false);
    if (checkbox) s.setCheckedIds(initialValues(valueProp, defaultValue));
    else s.setSelected(initialValues(valueProp, defaultValue));
    return s;
  });
  const [win] = useState<CollectionStore>(() => createCollectionStore({ active: -1, first: 0, last: 0, itemHeight: ROW_HEIGHT, sticky: null }));
  useLayoutEffect(() => {
    store.setOptions({
      data,
      getItemId: valueOf,
      getItemLabel: labelOf,
      getChildren: childrenOf,
      getParentId: getParentId as ((item: Item) => DropdownValue | null | undefined) | undefined,
      hasChildren,
      isItemDisabled: disabledOf,
      checkPropagation,
      loadChildren: loader,
    });
    // Accessor identities are read again when `data` changes (tree-store MODEL_KEYS).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, data, checkPropagation, loadChildren !== undefined]);
  // Model and visible order (data, loads, expansion): labels in the trigger follow it.
  useSyncExternalStore(store.subscribe, store.getOrderVersion, store.getOrderVersion);
  useEffect(() => () => store.dispose(), [store]);
  useEffect(() => {
    if (!DEV) return;
    const dupe = store.model.duplicates[0];
    if (dupe !== undefined) warnOnce(`tree-select-duplicate:${String(dupe)}`, `TreeSelect: duplicate item value ${JSON.stringify(dupe)}; values must be unique.`);
  });

  // Value -> store (selection bits, or checks with `indicator="checkbox"`). A value the store emitted is not re-applied.
  const emitted = useRef<readonly DropdownValue[] | null>(null);
  const applied = useRef<readonly DropdownValue[]>(values);
  useLayoutEffect(() => {
    if (applied.current === values) return;
    applied.current = values;
    if (checkbox) {
      if (values !== emitted.current) store.setCheckedIds(values);
    } else store.setSelected(values);
  }, [store, values, checkbox]);

  // Expansion: controlled `expanded` is applied when it changes; echoes of emitted arrays are no-ops.
  const emittedExpanded = useRef<readonly DropdownValue[] | null>(null);
  const prevExpanded = useRef(expandedProp);
  useLayoutEffect(() => {
    if (expandedProp === prevExpanded.current) return;
    prevExpanded.current = expandedProp;
    if (expandedProp && expandedProp !== emittedExpanded.current) store.setExpandedIds(expandedProp);
  }, [store, expandedProp]);

  const selected = useMemo(() => new Set(values), [values]);

  // defaultOpen applies after hydration, so server and client markup match.
  useEffect(() => {
    if (defaultOpen && openProp === undefined) setOpenState(true, Object.freeze({ source: 'api', reason: 'trigger' }));
    // Read once at mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useLayoutEffect(() => {
    if (open && !popupContext && rootRef.current) setPopupContext(resolvePopupContext(popupMode, rootRef.current));
  }, [open, popupContext, popupMode]);

  // --- helpers -----------------------------------------------------------------
  const itemOf = (v: DropdownValue): Item | undefined => {
    const n = store.nodeOf(v);
    if (n >= 0) return store.model.items[n] as Item;
    if (selectedItems) for (const it of selectedItems) if (valueOf(it) === v) return it;
    return undefined;
  };
  const itemsFor = (vs: readonly DropdownValue[]): Item[] => {
    const out: Item[] = [];
    for (const v of vs) {
      const it = itemOf(v);
      if (it !== undefined) out.push(it);
    }
    return out;
  };
  const labelFor = (v: DropdownValue): string => {
    const n = store.nodeOf(v);
    if (n >= 0) return store.label(n);
    const it = itemOf(v);
    return it === undefined ? String(v) : labelOf(it);
  };
  const isDisabled = (n: number): boolean => disabled || ((store.model.flags[n] as number) & DISABLED) !== 0;
  const isSelectable = (n: number): boolean => {
    if (isDisabled(n)) return false;
    const pred = latest.current.isItemSelectable;
    return pred ? pred(store.model.items[n] as Item) : true;
  };
  const valuesRef = useRef(values);
  useLayoutEffect(() => {
    valuesRef.current = values;
  });
  const commit = (next: readonly DropdownValue[], reason: DropdownValueChangeReason, source: DropdownEventSource): void => {
    const frozen = Object.freeze(next.slice());
    const previous = values;
    if (checkbox) {
      emitted.current = frozen;
      // The store already holds the new checks; a controlled value that vetoes (does not update) restores them.
      setTimeout(() => {
        if (valuesRef.current === previous) {
          emitted.current = null;
          store.setCheckedIds(previous);
        }
      }, 0);
    }
    setValues(frozen, changeEvent<Item>(source, reason, previous, () => itemsFor(frozen)));
  };
  const emitExpanded = (id: DropdownValue | null, source: DropdownEventSource): void => {
    const handler = latest.current.onExpandedChange;
    if (!handler) return;
    const ids = Object.freeze(store.expandedIds());
    emittedExpanded.current = ids;
    handler(ids, Object.freeze({ id, item: id === null ? undefined : itemOf(id), source }));
  };

  // On open (ensureVisible): the (first) selected node becomes active and its ancestors expand. Runs at
  // event time, before the popup mounts, so the popup's first layout reveals the active row; the open
  // effect repeats it (idempotent) for a controlled `open` or `defaultOpen`.
  const prepareOpen = (): void => {
    const first = values.length ? store.nodeOf(values[0] as DropdownValue) : -1;
    let active: number = -1;
    if (first >= 0) {
      const ancestors: DropdownValue[] = [];
      for (let p = store.model.parent[first] as number; p >= 0; p = store.model.parent[p] as number) if (!store.isExpanded(p)) ancestors.push(store.model.ids[p] as DropdownValue);
      if (ancestors.length) {
        store.expandAll({ ids: ancestors });
        emitExpanded(null, 'api');
      }
      active = first;
    }
    if (active < 0) {
      for (let p = 0; p < store.visibleCount; p++) {
        const n = store.order[p] as number;
        if (!isDisabled(n)) {
          active = n;
          break;
        }
      }
    }
    store.setFocused(active >= 0 ? (store.model.ids[active] as DropdownValue) : null);
  };

  const setOpen = (next: boolean, source: DropdownEventSource, reason: DropdownOpenChangeReason): void => {
    if (next === open) return;
    if (next) {
      if (disabled || readOnly) return;
      if (rootRef.current) setPopupContext(resolvePopupContext(popupMode, rootRef.current));
      prepareOpen();
    } else {
      if (search) {
        setSearch('');
        onSearchChange?.('', Object.freeze({ source }));
      }
      // Focus returns to the trigger when it was inside the popup.
      const doc = triggerRef.current?.ownerDocument;
      if (doc && doc.activeElement !== triggerRef.current && (doc.activeElement === searchRef.current || reason !== 'outside')) triggerRef.current?.focus({ preventScroll: true });
    }
    setOpenState(next, Object.freeze({ source, reason }));
  };

  const closeAfterSelect = closeOnSelect ?? !multiple;
  // Start of a Shift+click range: the node chosen last (multiple).
  const rangeAnchor = useRef<DropdownValue | null>(null);
  const ctl: TreeSelectController<Item> | null = popupContext
    ? {
        props,
        text,
        store,
        win,
        listId,
        multiple,
        checkbox,
        values,
        selected,
        searchText: search,
        maxVisible: Math.max(1, maxVisibleItems ?? 8),
        context: popupContext,
        anchorRef: rootRef,
        searchRef,
        listRef,
        view,
        typeahead,
        showSelectAll: multiple && showSelectAll,
        optionId: (node) => (node === SELECT_ALL_NODE ? `${listId}-all` : `${listId}-${node}`),
        isDisabled,
        isSelectable,
        choose(node, source, range = false) {
          if (node === SELECT_ALL_NODE) {
            ctl?.toggleAll(source);
            return true;
          }
          if (node < 0 || node >= store.model.count || !isSelectable(node)) return false;
          const v = store.model.ids[node] as DropdownValue;
          if (checkbox) {
            const on = store.checkState(node) !== 1;
            store.setChecked(node, on);
            commit(store.checkedIds(), on ? 'select' : 'deselect', source);
            return true;
          }
          if (!multiple) {
            if (values.length !== 1 || values[0] !== v) commit([v], 'select', source);
            if (closeAfterSelect) setOpen(false, source, 'select');
            return true;
          }
          const from = rangeAnchor.current ?? store.focusedId;
          if (range && from !== null && view.current) {
            // Shift+click: the shown rows between the last chosen node (the active one before any) and this one.
            const order = view.current.order;
            const a = indexOf(order, store.nodeOf(from));
            const b = indexOf(order, node);
            if (a >= 0 && b >= 0) {
              const next = values.slice();
              const seen = new Set(values);
              for (let p = Math.min(a, b); p <= Math.max(a, b); p++) {
                const x = order[p] as number;
                const id = store.model.ids[x] as DropdownValue;
                if (isSelectable(x) && !seen.has(id)) next.push(id), seen.add(id);
              }
              commit(next, 'select', source);
              return true;
            }
          }
          rangeAnchor.current = v;
          if (selected.has(v)) commit(values.filter((x) => x !== v), 'deselect', source);
          else commit([...values, v], 'select', source);
          if (closeAfterSelect) setOpen(false, source, 'select');
          return true;
        },
        allState() {
          if (checkbox) {
            let all = true;
            let some = false;
            for (let i = 0; i < store.model.count; i += store.model.size[i] as number) {
              const c = store.checkState(i);
              if (c !== 1) all = false;
              if (c !== 0) some = true;
            }
            return all && store.model.count > 0 ? 'all' : some ? 'some' : 'none';
          }
          if (!values.length) return 'none';
          let enabled = 0;
          let hit = 0;
          for (let i = 0; i < store.model.count; i++) {
            if (!isSelectable(i)) continue;
            enabled++;
            if (selected.has(store.model.ids[i] as DropdownValue)) hit++;
          }
          return hit === 0 ? 'none' : hit === enabled ? 'all' : 'some';
        },
        toggleAll(source) {
          const all = ctl?.allState() === 'all';
          if (checkbox) {
            if (all) store.uncheckAll();
            else store.checkAll();
            commit(store.checkedIds(), 'selectAll', source);
            return;
          }
          if (all) {
            commit(values.filter((v) => { const n = store.nodeOf(v); return n >= 0 && !isSelectable(n); }), 'selectAll', source);
            return;
          }
          const next = values.slice();
          const seen = new Set(values);
          for (let i = 0; i < store.model.count; i++) {
            const id = store.model.ids[i] as DropdownValue;
            if (isSelectable(i) && !seen.has(id)) next.push(id), seen.add(id);
          }
          commit(next, 'selectAll', source);
        },
        setExpanded(node, next, source) {
          if (node < 0 || !((store.model.flags[node] as number) & HAS_CHILDREN) || store.isExpanded(node) === next) return;
          if (isDisabled(node)) return;
          store.setExpanded(node, next);
          emitExpanded(store.model.ids[node] as DropdownValue, source);
        },
        close: (source, reason) => setOpen(false, source, reason),
        clearSearch(source) {
          setSearch('');
          onSearchChange?.('', Object.freeze({ source }));
        },
      }
    : null;

  // On open: prepareOpen (again) and the search field takes focus; on close the active node clears.
  const wasOpen = useRef(false);
  useLayoutEffect(() => {
    if (open && popupContext && popupModule && !wasOpen.current) {
      wasOpen.current = true;
      prepareOpen();
      if (searchable || popupContext.mode === 'sheet') (searchRef.current ?? triggerRef.current)?.focus({ preventScroll: true });
    } else if (!open && wasOpen.current) {
      wasOpen.current = false;
      rangeAnchor.current = null;
      store.setFocused(null);
      win.set({ active: -1, first: 0, last: 0 });
    }
  });

  // aria-activedescendant follows the store's focused node without re-rendering the TreeSelect.
  const sheet = popupContext?.mode === 'sheet';
  const showSearch = searchable || sheet;
  useEffect(() => {
    if (!open || !popupContext || !popupModule) return;
    const host = (): HTMLElement | null => (showSearch ? searchRef.current : triggerRef.current);
    let last: string | null = null;
    const sync = (): void => {
      const el = host();
      if (!el) return;
      const f = store.focusedId;
      const n = win.getState().active === SELECT_ALL_NODE ? SELECT_ALL_NODE : f === null ? -1 : store.nodeOf(f);
      const next = n === -1 ? null : n === SELECT_ALL_NODE ? `${listId}-all` : `${listId}-${n}`;
      if (next === last) return;
      last = next;
      if (next === null) el.removeAttribute('aria-activedescendant');
      else el.setAttribute('aria-activedescendant', next);
    };
    sync();
    const unsubscribe = store.subscribe(sync);
    const unsubscribeWin = win.subscribe(sync);
    return () => {
      unsubscribe();
      unsubscribeWin();
      triggerRef.current?.removeAttribute('aria-activedescendant');
    };
  }, [open, popupContext, popupModule, store, win, showSearch, listId]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>, inSearch: boolean): void => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || disabled) return;
    const { key } = event;
    let handled = true;
    if (!open) {
      switch (key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'Enter':
        case ' ':
          if (readOnly) return;
          setOpen(true, 'keyboard', 'keyboard');
          break;
        case 'Backspace':
        case 'Delete':
          if (!clearable || readOnly || !values.length) return;
          clear('keyboard');
          break;
        default:
          handled = false;
      }
    } else if (ctl && popupModule) handled = popupModule.onTreeKey(ctl as unknown as TreeSelectController<unknown>, event, inSearch);
    else handled = false;
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const clear = (source: DropdownEventSource): void => {
    if (!values.length) return;
    if (checkbox) store.uncheckAll();
    commit(EMPTY, 'clear', source);
  };

  const setRef = useCallback((el: HTMLButtonElement | null) => assignRef(triggerRef, ref, el), [ref]);

  // --- value display (labels of the shown values only) ---------------------------
  let display: ReactNode;
  const empty = values.length === 0;
  if (renderValue && !empty) display = renderValue({ items: itemsFor(values), labels: values.map(labelFor) });
  else if (empty) display = placeholder !== undefined ? <span className="salmon-tree-select-placeholder" aria-hidden="true">{placeholder}</span> : null;
  else if (!multiple) display = labelFor(values[0] as DropdownValue);
  else if (valueDisplay === 'count') display = text.selectedCount(values.length, new Intl.PluralRules(locale).select(values.length));
  else {
    const max = maxVisibleValues ?? 100;
    const shown = values.slice(0, max);
    const more = values.length > max ? text.moreValues(values.length - max) : null;
    if (valueDisplay === 'chips') {
      display = (
        <>
          {shown.map((v) => (
            <span key={`${typeof v}:${String(v)}`} className={partClass('salmon-tree-select-chip', classNames, 'chip')} style={styles?.chip}>
              {labelFor(v)}
            </span>
          ))}
          {more !== null ? <span className="salmon-tree-select-more">{more}</span> : null}
        </>
      );
    } else {
      const joined = joinLabels(shown.map(labelFor), valueSeparator, locale);
      display = more !== null ? `${joined} ${more}` : joined;
    }
  }

  const label = (dom['aria-label'] as string | undefined) ?? undefined;
  const labelledBy = (dom['aria-labelledby'] as string | undefined) ?? undefined;
  const searchInput = showSearch ? (
    <div className="salmon-tree-select-search">
      <input
        ref={searchRef}
        type="text"
        role="combobox"
        aria-expanded={true}
        aria-controls={listId}
        aria-haspopup="tree"
        aria-autocomplete="list"
        aria-label={text.search}
        autoComplete="off"
        spellCheck={false}
        className={partClass('salmon-tree-select-search-input', classNames, 'search')}
        style={styles?.search}
        placeholder={searchPlaceholder}
        value={search}
        onChange={(event) => {
          const t = event.currentTarget.value;
          setSearch(t);
          win.set({ first: 0, last: 0 });
          if (listRef.current) listRef.current.scrollTop = 0;
          onSearchChange?.(t, Object.freeze({ source: 'keyboard' }));
        }}
        onKeyDown={(event) => onKeyDown(event, true)}
      />
    </div>
  ) : null;

  const dataAttrs = {
    'data-size': size ?? 'md',
    'data-open': open ? '' : undefined,
    'data-disabled': disabled ? '' : undefined,
    'data-readonly': readOnly ? '' : undefined,
    'data-multiple': multiple ? '' : undefined,
    'data-empty': empty ? '' : undefined,
    'data-value-display': multiple ? valueDisplay : undefined,
  };
  return (
    <div ref={rootRef} className={rootClass('salmon-tree-select', classNames?.root, className)} style={style || styles?.root ? { ...styles?.root, ...style } : undefined} {...dataAttrs}>
      <button
        {...dom}
        ref={setRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup={sheet ? 'dialog' : 'tree'}
        aria-expanded={open}
        aria-controls={open && popupContext ? listId : undefined}
        aria-readonly={readOnly ? true : undefined}
        aria-required={required ? true : undefined}
        disabled={disabled}
        autoFocus={autoFocus}
        className={partClass('salmon-tree-select-trigger', classNames, 'trigger')}
        style={styles?.trigger}
        onClick={(event) => {
          dom.onClick?.(event as never);
          if (event.defaultPrevented || readOnly) return;
          // Keyboard clicks are handled in keydown.
          if (event.detail === 0) return;
          setOpen(!open, sourceOf(event), 'trigger');
        }}
        onKeyDown={(event) => {
          dom.onKeyDown?.(event as never);
          onKeyDown(event, false);
        }}
        onBlur={(event) => {
          dom.onBlur?.(event as never);
          const next = event.relatedTarget as Node | null;
          if (open && next && !rootRef.current?.contains(next) && !searchRef.current?.closest('.salmon-dropdown-popup')?.contains(next)) setOpen(false, 'keyboard', 'blur');
        }}
      >
        <span className={partClass('salmon-tree-select-value', classNames, 'value')} style={styles?.value}>
          {display}
        </span>
        {showTrigger ? (
          <span className="salmon-tree-select-chevron" aria-hidden="true">
            <Icon d={ICON_CHEVRON} />
          </span>
        ) : null}
      </button>
      {clearable && !empty && !disabled && !readOnly ? (
        <button type="button" tabIndex={-1} className="salmon-tree-select-clear" aria-label={text.clear} onPointerDown={preventFocusLoss} onClick={(event) => clear(sourceOf(event))}>
          <Icon d={ICON_X} />
        </button>
      ) : null}
      {name !== undefined ? (
        <HiddenSelect
          name={name}
          values={values}
          multiple={multiple}
          required={required}
          disabled={disabled}
          form={form}
          onReset={() => {
            if (!sameValues(initial, values)) {
              if (checkbox) {
                emitted.current = null;
                store.setCheckedIds(initial);
              }
              setValues(initial, changeEvent<Item>('api', 'reset', values, () => itemsFor(initial)));
            }
          }}
          onInvalid={(event) => (event.preventDefault(), triggerRef.current?.focus())}
        />
      ) : null}
      {open && ctl && popupModule ? (
        <popupModule.TreeSelectPopup
          ctl={ctl as unknown as TreeSelectController<unknown>}
          onOutsidePress={() => setOpen(false, 'pointer', 'outside')}
          search={
            sheet ? (
              <>
                <div className="salmon-dropdown-sheet-header">
                  <span className="salmon-dropdown-sheet-title">{label ?? placeholder ?? text.search}</span>
                  <button type="button" className="salmon-dropdown-sheet-close" aria-label={text.close} onPointerDown={preventFocusLoss} onClick={() => setOpen(false, 'pointer', 'escape')}>
                    <Icon d={ICON_X} />
                  </button>
                </div>
                {searchInput}
              </>
            ) : (
              searchInput
            )
          }
          sheetTitle={label ?? placeholder ?? text.search}
          labelledBy={labelledBy}
          label={label}
        />
      ) : null}
    </div>
  );
}

function initialValues(value: DropdownValue | null | readonly DropdownValue[] | undefined, defaultValue: DropdownValue | null | readonly DropdownValue[] | undefined): readonly DropdownValue[] {
  return toArray(value === undefined ? defaultValue : value);
}

function indexOf(order: Int32Array, node: number): number {
  let lo = 0;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((order[mid] as number) < node) lo = mid + 1;
    else hi = mid;
  }
  return order[lo] === node ? lo : -1;
}
