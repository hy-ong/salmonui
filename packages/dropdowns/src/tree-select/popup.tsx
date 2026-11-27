'use client';

// TreeSelect popup, a lazy chunk (TreeSelect.tsx `usePopupModule`): the APG
// tree inside the shared dropdown popup shell (dropdown/overlay `Popup`:
// portal, top layer, placement, outside press), a fixed-row-height window on
// the shared virtual math, `aria-activedescendant` focus driven by the tree
// store's focused id, search results that keep ancestors, lazy-load status
// per node, the select-all row and the polite live region. The keyboard of
// the open popup (`onTreeKey`) lives here too, so the initial chunk carries
// only the trigger.

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { preventFocusLoss, type PopupContext } from '../dropdown/core.js';
import { Popup } from '../dropdown/overlay.js';
import type { DropdownEventSource, DropdownValue } from '../dropdown/types.js';
import { matchRanges } from '../internal/collection/search.js';
import { nextWindow, OVERSCAN, revealOffset, windowRange } from '@salmonui/core/internal/collection/virtual';
import { BIT_CHECKED, BIT_ERROR, BIT_EXPANDED, BIT_FOCUSED, BIT_LOADING, BIT_MIXED, BIT_SELECTED, DISABLED, HAS_CHILDREN, type TreeKey, type TreeStore } from '@salmonui/core/internal/tree-store';
import { createTypeahead, isTypeaheadKey, typeahead as typeaheadMatch } from '@salmonui/core/internal/typeahead';
import { pressSource } from '@salmonui/core/internal/press';
import { useLocale } from '@salmonui/core/internal/locale';
import { filterTree, positionIn, type TreeFilterResult } from './filter.js';
import { partClass, SELECT_ALL_NODE, type TreeSelectController, type TreeSelectView } from './TreeSelect.js';
import type { TreeSelectLocaleText, TreeSelectProps } from './types.js';

/** Above this many shown rows the tree is windowed unless `virtualization={false}`. */
const VIRTUAL_THRESHOLD = 100;
const NO_MATCHES: readonly (readonly [number, number])[] = Object.freeze([]);

export interface TreeSelectPopupProps {
  readonly ctl: TreeSelectController<unknown>;
  readonly onOutsidePress: () => void;
  readonly search?: ReactNode;
  readonly sheetTitle?: string | undefined;
  readonly labelledBy?: string | undefined;
  readonly label?: string | undefined;
}

/** Everything a row reads besides its own store bits; stable while these props are. */
interface RowContext {
  readonly store: TreeStore<unknown>;
  readonly listId: string;
  readonly checkbox: boolean;
  readonly multiple: boolean;
  readonly text: TreeSelectLocaleText;
  readonly props: TreeSelectProps<unknown>;
  readonly searchText: string;
  readonly actions: { current: RowActions };
}

interface RowActions {
  click(node: number, event: ReactMouseEvent<HTMLElement>): void;
  doubleClick(node: number, event: ReactMouseEvent<HTMLElement>): void;
  hover(node: number): void;
}

interface RowProps {
  readonly rc: RowContext;
  readonly id: TreeKey;
  readonly node: number;
  readonly item: unknown;
  readonly label: string;
  readonly level: number;
  readonly setsize: number;
  readonly posinset: number;
  readonly flags: number;
  readonly selectable: boolean;
  /** Search results show every matching branch open: `true` / `false` overrides the store's expansion. */
  readonly openInView: boolean | null;
  readonly top: number | null;
}

const TreeRow = memo(function TreeRow({ rc, id, node, item, label, level, setsize, posinset, flags, selectable, openInView, top }: RowProps): ReactNode {
  const { store, props: p, text } = rc;
  const bits = useSyncExternalStore(
    store.subscribe,
    () => store.bits(id),
    () => store.bits(id),
  );
  const parent = (flags & HAS_CHILDREN) !== 0;
  const expanded = parent && (openInView ?? (bits & BIT_EXPANDED) !== 0);
  const selected = (bits & BIT_SELECTED) !== 0;
  const checked: boolean | 'mixed' = bits & BIT_MIXED ? 'mixed' : (bits & BIT_CHECKED) !== 0;
  const disabled = p.disabled === true || (flags & DISABLED) !== 0;
  const active = (bits & BIT_FOCUSED) !== 0;
  const loading = (bits & BIT_LOADING) !== 0;
  const failed = (bits & BIT_ERROR) !== 0;
  const operator = typeof p.searchOperator === 'string' ? p.searchOperator : 'startsWith';
  const matches = rc.searchText && (p.highlightMatches || p.renderItem) && typeof p.searchOperator !== 'function' ? matchRanges(label, rc.searchText, operator, { matchCase: p.matchCase, ignoreAccents: p.ignoreAccents }) : NO_MATCHES;
  const content = p.renderItem ? p.renderItem({ item, label, level, selected, checked, expanded, active, disabled, matches }) : p.highlightMatches ? <Highlighted label={label} matches={matches} /> : label;
  const icon = p.getItemIcon?.(item);
  const extra = p.getItemProps?.(item);
  const { className: extraClass, style: extraStyle, ...rest } = extra ?? {};
  const style: CSSProperties = { ...p.styles?.item, ...extraStyle, ['--salmon-tree-select-level' as string]: level - 1 };
  if (top !== null) style.insetBlockStart = top;
  const base = partClass('salmon-tree-select-item salmon-dropdown-option', p.classNames, 'item');
  const retry = (): void => store.load(node);
  const state = checked === 'mixed' ? 'mixed' : checked ? 'checked' : 'unchecked';
  return (
    <div
      {...rest}
      id={`${rc.listId}-${node}`}
      role="treeitem"
      aria-level={level}
      aria-setsize={setsize}
      aria-posinset={posinset}
      aria-expanded={parent ? expanded : undefined}
      aria-selected={rc.checkbox ? undefined : selectable || selected ? selected : undefined}
      aria-checked={rc.checkbox ? checked : undefined}
      aria-disabled={disabled || undefined}
      aria-busy={loading || undefined}
      className={extraClass ? `${base} ${extraClass}` : base}
      style={style}
      data-row={node}
      data-active={active ? '' : undefined}
      data-selected={selected || checked === true ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      data-expanded={expanded ? '' : undefined}
      onClick={(event) => rc.actions.current.click(node, event)}
      onDoubleClick={(event) => rc.actions.current.doubleClick(node, event)}
      onPointerMove={active || disabled ? undefined : () => rc.actions.current.hover(node)}
    >
      <span className="salmon-tree-select-twisty" aria-hidden="true" data-part="twisty" data-leaf={parent ? undefined : ''} />
      {rc.checkbox ? <span className="salmon-dropdown-checkbox" data-state={state} aria-hidden="true" /> : null}
      {icon != null && icon !== false ? (
        <span className="salmon-dropdown-option-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="salmon-dropdown-option-label">{content}</span>
      {loading ? <span className="salmon-tree-select-status">{p.renderLoading ? p.renderLoading({ item }) : text.loadingChildren}</span> : null}
      {failed ? (
        <span className="salmon-tree-select-status" data-error="">
          {p.renderError ? (
            p.renderError({ error: store.loadError(node), item, retry })
          ) : (
            <>
              {text.loadError}{' '}
              <button type="button" className="salmon-dropdown-retry" tabIndex={-1} data-part="retry" onPointerDown={preventFocusLoss}>
                {text.retry}
              </button>
            </>
          )}
        </span>
      ) : null}
      {!rc.multiple ? <span className="salmon-dropdown-check" data-state={selected ? 'checked' : 'unchecked'} aria-hidden="true" /> : null}
    </div>
  );
});

/** Label with `<mark>` around the matched ranges (`highlightMatches`). */
function Highlighted({ label, matches }: { readonly label: string; readonly matches: readonly (readonly [number, number])[] }) {
  if (!matches.length) return <>{label}</>;
  const out: ReactNode[] = [];
  let at = 0;
  for (const [s, e] of matches) {
    if (s > at) out.push(label.slice(at, s));
    out.push(
      <mark key={s} className="salmon-dropdown__match">
        {label.slice(s, e)}
      </mark>,
    );
    at = e;
  }
  if (at < label.length) out.push(label.slice(at));
  return <>{out}</>;
}

export function TreeSelectPopup(props: TreeSelectPopupProps): ReactNode {
  const { ctl } = props;
  const { store, win, text } = ctl;
  const p = ctl.props;
  const context: PopupContext = ctl.context;
  const sheet = context.mode === 'sheet';
  useSyncExternalStore(store.subscribe, store.getOrderVersion, store.getOrderVersion);
  const model = store.model;
  const searchText = ctl.searchText;
  const operator = p.searchOperator;
  const filter: TreeFilterResult | null = useMemo(
    () => (searchText ? filterTree(model, (i) => store.label(i), searchText, { operator, matchCase: p.matchCase, ignoreAccents: p.ignoreAccents }) : null),
    [model, store, searchText, operator, p.matchCase, p.ignoreAccents],
  );
  const order = filter ? filter.order : store.order;
  const count = order.length;
  const virtual = p.virtualization !== false && count > VIRTUAL_THRESHOLD;
  const maxVisible = ctl.maxVisible;
  const h = useSyncExternalStore(win.subscribe, () => win.getState().itemHeight, () => win.getState().itemHeight);
  const sFirst = useSyncExternalStore(win.subscribe, () => win.getState().first, () => win.getState().first);
  const sLast = useSyncExternalStore(win.subscribe, () => win.getState().last, () => win.getState().last);
  const selectAllActive = useSyncExternalStore(win.subscribe, () => win.getState().active === SELECT_ALL_NODE, () => false);
  let first = 0;
  let last = count;
  if (virtual) {
    const ok = sLast <= count && sLast - sFirst >= Math.min(count, maxVisible + OVERSCAN * 2);
    const range = ok ? { first: sFirst, last: sLast } : windowRange(count, Math.min(sFirst, count), maxVisible);
    first = range.first;
    last = range.last;
  }
  const listRef = ctl.listRef;
  const liveRef = useRef<HTMLDivElement | null>(null);

  const scrolled = (): void => {
    const el = listRef.current;
    if (!el || !virtual) return;
    const s = win.getState();
    const next = nextWindow({ first: s.first, last: s.last }, count, Math.floor(el.scrollTop / s.itemHeight), maxVisible);
    win.set(next);
  };
  const reveal = (pos: number): void => {
    const el = listRef.current;
    if (!el || pos < 0) return;
    if (virtual) {
      const offset = revealOffset(pos, win.getState().itemHeight, el.scrollTop, el.clientHeight);
      if (offset !== null) el.scrollTop = offset;
      scrolled();
      return;
    }
    const row = el.ownerDocument.getElementById(`${ctl.listId}-${order[pos]}`);
    if (!row) return;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (bottom > el.scrollTop + el.clientHeight) el.scrollTop = bottom - el.clientHeight;
  };
  const view: TreeSelectView = { order, filter, reveal };
  useLayoutEffect(() => {
    ctl.view.current = view;
  });
  useLayoutEffect(
    () => () => {
      ctl.view.current = null;
    },
    [ctl.view],
  );

  // Row height once per open (CSS controls it); the active row scrolls into view on open.
  useLayoutEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>('[data-row]');
    const measured = row?.offsetHeight ?? 0;
    if (measured > 0 && Math.abs(measured - win.getState().itemHeight) > 0.5) win.set({ itemHeight: measured });
    const f = store.focusedId;
    if (f !== null) reveal(positionIn(order, store.nodeOf(f)));
    // Mount, and when the first rows appear.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count > 0]);

  // A new search result: the first matching enabled node becomes active, the window resets.
  // Compared by identity (not a first-run flag) so the StrictMode effect replay does not reset the active row.
  const lastFilter = useRef(filter);
  useLayoutEffect(() => {
    if (lastFilter.current === filter) return;
    lastFilter.current = filter;
    win.set({ active: -1, first: 0, last: 0 });
    let target = -1;
    for (let k = 0; k < order.length; k++) {
      const n = order[k] as number;
      if ((!filter || filter.matched[n]) && !ctl.isDisabled(n)) {
        target = n;
        break;
      }
    }
    store.setFocused(target >= 0 ? (model.ids[target] as TreeKey) : null);
    if (listRef.current) listRef.current.scrollTop = 0;
    // Only when a new result set arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  // Announcements: the match count after a search. DOM write, no render.
  const matchCount = filter ? filter.matches : -1;
  const locale = useLocale(p.locale) ?? 'en-US';
  useEffect(() => {
    const el = liveRef.current;
    if (!el || matchCount < 0) return;
    const timer = setTimeout(() => {
      el.textContent = text.resultCount(matchCount, new Intl.PluralRules(locale).select(matchCount));
    }, 150);
    return () => clearTimeout(timer);
  }, [matchCount, text, locale]);

  // Row actions read the latest controller.
  const latest = useRef(ctl);
  useLayoutEffect(() => {
    latest.current = ctl;
  });
  const actions = useRef<RowActions>({
    click(node, event) {
      const c = latest.current;
      const s = c.store;
      const target = event.target as HTMLElement;
      const part = target.closest('[data-part]')?.getAttribute('data-part');
      if (part === 'retry') {
        s.load(node);
        return;
      }
      if (c.isDisabled(node)) return;
      const id = s.model.ids[node] as TreeKey;
      c.win.set({ active: -1 });
      s.setFocused(id);
      const source = pressSource(event);
      const parent = ((s.model.flags[node] as number) & HAS_CHILDREN) !== 0;
      const searching = c.view.current?.filter != null;
      const expandOn = c.props.expandOn ?? 'auto';
      if (part === 'twisty') {
        if (parent && !searching) c.setExpanded(node, !s.isExpanded(node), source);
        return;
      }
      if (parent && expandOn === 'click' && !searching) {
        c.setExpanded(node, !s.isExpanded(node), source);
        return;
      }
      if (c.isSelectable(node)) c.choose(node, source, event.shiftKey);
      else if (parent && expandOn === 'auto' && !searching) c.setExpanded(node, !s.isExpanded(node), source);
    },
    doubleClick(node, event) {
      const c = latest.current;
      const s = c.store;
      if ((event.target as HTMLElement).closest('[data-part]') || c.isDisabled(node) || c.view.current?.filter) return;
      if ((c.props.expandOn ?? 'auto') === 'doubleClick' && (s.model.flags[node] as number) & HAS_CHILDREN) c.setExpanded(node, !s.isExpanded(node), 'pointer');
    },
    hover(node) {
      const c = latest.current;
      c.win.set({ active: -1 });
      c.store.setFocused(c.store.model.ids[node] as TreeKey);
    },
  });

  const rc = useMemo<RowContext>(
    () => ({ store, listId: ctl.listId, checkbox: ctl.checkbox, multiple: ctl.multiple, text, props: p, searchText, actions }),
    // `p` changes every parent render; rows follow the render-affecting props only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, ctl.listId, ctl.checkbox, ctl.multiple, text, searchText, p.renderItem, p.getItemIcon, p.getItemProps, p.highlightMatches, p.renderLoading, p.renderError, p.disabled, p.classNames, p.styles, p.matchCase, p.ignoreAccents, p.searchOperator],
  );

  const row = (pos: number, node: number): ReactNode => {
    const id = model.ids[node] as TreeKey;
    const parentNode = model.parent[node] as number;
    let openInView: boolean | null = null;
    if (filter) openInView = pos + 1 < count && (model.parent[order[pos + 1] as number] as number) === node;
    return (
      <TreeRow
        key={typeof id === 'number' ? `n${id}` : `s${id}`}
        rc={rc}
        id={id}
        node={node}
        item={model.items[node]}
        label={store.label(node)}
        level={(model.depth[node] as number) + 1}
        setsize={filter ? (filter.setsize[node] as number) : parentNode < 0 ? model.rootCount : (model.childCount[parentNode] as number)}
        posinset={filter ? (filter.posinset[node] as number) : (model.rank[node] as number) + 1}
        flags={model.flags[node] as number}
        selectable={ctl.isSelectable(node)}
        openInView={openInView}
        top={virtual ? pos * h : null}
      />
    );
  };
  const rows: ReactNode[] = [];
  for (let k = first; k < last; k++) rows.push(row(k, order[k] as number));
  // The active row stays rendered out of the window: aria-activedescendant always resolves.
  const focused = store.focusedId;
  if (virtual && focused !== null) {
    const fp = positionIn(order, store.nodeOf(focused));
    if (fp >= 0 && (fp < first || fp >= last)) rows.push(row(fp, order[fp] as number));
  }

  const empty = count === 0;
  const allState = ctl.showSelectAll ? ctl.allState() : 'none';
  const listStyle: CSSProperties = { maxBlockSize: maxVisible * h, ...p.styles?.tree };
  return (
    <Popup
      anchorRef={ctl.anchorRef}
      context={context}
      className={partClass('salmon-tree-select-popup salmon-dropdown-popup', p.classNames, 'popup')}
      style={p.styles?.popup}
      onOutsidePress={props.onOutsidePress}
      role={sheet ? 'dialog' : undefined}
      aria-label={sheet ? props.sheetTitle : undefined}
    >
      {props.search}
      {p.popupHeader !== undefined ? <div className="salmon-dropdown-popup-header">{p.popupHeader}</div> : null}
      {ctl.showSelectAll ? (
        <div
          id={ctl.optionId(SELECT_ALL_NODE)}
          role="treeitem"
          aria-level={1}
          aria-selected={ctl.checkbox ? undefined : allState === 'all'}
          aria-checked={allState === 'all' ? true : allState === 'some' ? 'mixed' : false}
          className="salmon-tree-select-select-all salmon-dropdown-select-all salmon-dropdown-option"
          data-active={selectAllActive ? '' : undefined}
          onPointerDown={preventFocusLoss}
          onClick={(event) => ctl.toggleAll(pressSource(event))}
        >
          <span className="salmon-dropdown-checkbox" data-state={allState === 'all' ? 'checked' : allState === 'some' ? 'mixed' : 'unchecked'} aria-hidden="true" />
          <span className="salmon-dropdown-option-label">{allState === 'all' ? text.deselectAll : text.selectAll}</span>
        </div>
      ) : null}
      <div
        ref={listRef}
        id={ctl.listId}
        role="tree"
        aria-multiselectable={ctl.multiple ? true : undefined}
        aria-owns={ctl.showSelectAll ? ctl.optionId(SELECT_ALL_NODE) : undefined}
        aria-labelledby={props.labelledBy}
        aria-label={props.labelledBy ? undefined : props.label}
        aria-busy={store.isBusy() || undefined}
        className={partClass('salmon-tree-select-tree salmon-dropdown-list', p.classNames, 'tree')}
        style={listStyle}
        data-virtual={virtual ? '' : undefined}
        onScroll={virtual ? scrolled : undefined}
        onPointerDown={preventFocusLoss}
      >
        {virtual ? (
          <div className="salmon-dropdown-sizer" style={{ blockSize: count * h }}>
            {rows}
          </div>
        ) : (
          rows
        )}
      </div>
      {empty ? <div className="salmon-dropdown-empty">{p.renderEmpty ? p.renderEmpty({ reason: searchText ? 'noMatch' : 'noData' }) : searchText ? text.noResults : text.noData}</div> : null}
      {p.popupFooter !== undefined ? <div className="salmon-dropdown-popup-footer">{p.popupFooter}</div> : null}
      <div ref={liveRef} className="salmon-dropdown-live" aria-live="polite" aria-atomic="true" />
    </Popup>
  );
}

/**
 * Keyboard of the open popup (APG tree keys inside the select-only
 * combobox). Returns true when the key was handled.
 */
export function onTreeKey(ctl: TreeSelectController<unknown>, event: ReactKeyboardEvent<HTMLElement>, inSearch: boolean): boolean {
  const v = ctl.view.current;
  const { store, win } = ctl;
  if (!v) return event.key !== 'Tab';
  const { order, filter } = v;
  const count = order.length;
  const m = store.model;
  const allActive = win.getState().active === SELECT_ALL_NODE;
  const f = store.focusedId;
  const node = allActive || f === null ? -1 : store.nodeOf(f);
  const pos = node < 0 ? -1 : positionIn(order, node);
  const enabled = (q: number): boolean => !ctl.isDisabled(order[q] as number);
  const find = (from: number, step: 1 | -1): number => {
    for (let q = from; q >= 0 && q < count; q += step) if (enabled(q)) return q;
    return -1;
  };
  const go = (q: number): void => {
    if (q < 0) return;
    win.set({ active: -1 });
    store.setFocused(m.ids[order[q] as number] as TreeKey);
    v.reveal(q);
  };
  const goAll = (): void => {
    store.setFocused(null);
    win.set({ active: SELECT_ALL_NODE });
    if (ctl.listRef.current) ctl.listRef.current.scrollTop = 0;
  };
  const source: DropdownEventSource = 'keyboard';
  const isParent = node >= 0 && ((m.flags[node] as number) & HAS_CHILDREN) !== 0;
  const activate = (): void => {
    if (allActive) ctl.toggleAll(source);
    else if (node >= 0) {
      if (ctl.isSelectable(node)) ctl.choose(node, source);
      else if (isParent && !filter) ctl.setExpanded(node, !store.isExpanded(node), source);
    } else if (!ctl.multiple) ctl.close(source, 'keyboard');
  };
  let key = event.key;
  if (ctl.context.rtl && key === 'ArrowLeft') key = 'ArrowRight';
  else if (ctl.context.rtl && key === 'ArrowRight') key = 'ArrowLeft';
  switch (key) {
    case 'ArrowDown':
      if (event.altKey) return true;
      go(allActive || pos < 0 ? find(0, 1) : find(pos + 1, 1));
      return true;
    case 'ArrowUp': {
      if (event.altKey) {
        if (!ctl.multiple && node >= 0 && ctl.isSelectable(node)) ctl.choose(node, source);
        ctl.close(source, 'keyboard');
        return true;
      }
      const q = pos < 0 ? -1 : find(pos - 1, -1);
      if (q < 0 && ctl.showSelectAll) goAll();
      else go(q);
      return true;
    }
    case 'Home':
      if (inSearch) return false;
      if (ctl.showSelectAll) goAll();
      else go(find(0, 1));
      return true;
    case 'End':
      if (inSearch) return false;
      go(find(count - 1, -1));
      return true;
    case 'PageDown': {
      const q = find(Math.min(count - 1, Math.max(pos, 0) + ctl.maxVisible), -1);
      go(q > pos ? q : find(pos + 1, 1));
      return true;
    }
    case 'PageUp': {
      const q = find(Math.max(0, pos - ctl.maxVisible), 1);
      go(q >= 0 && q < pos ? q : find(pos - 1, -1));
      return true;
    }
    case 'ArrowRight': {
      if (inSearch) return false;
      if (!isParent) return true;
      const next = pos + 1 < count && (m.parent[order[pos + 1] as number] as number) === node;
      if (next) go(pos + 1);
      else if (!filter && !store.isExpanded(node)) ctl.setExpanded(node, true, source);
      return true;
    }
    case 'ArrowLeft': {
      if (inSearch) return false;
      if (node < 0) return true;
      if (!filter && isParent && store.isExpanded(node)) ctl.setExpanded(node, false, source);
      else {
        const parent = m.parent[node] as number;
        if (parent >= 0) go(positionIn(order, parent));
      }
      return true;
    }
    case 'Enter':
      activate();
      return true;
    case ' ': {
      if (inSearch) return false;
      const t = ctl.typeahead.current;
      if (t?.text && event.timeStamp - t.at <= 500) {
        const q = typeaheadMatch(t, ' ', event.timeStamp, count, Math.max(pos, 0), (k) => store.label(order[k] as number), enabled);
        if (q >= 0) go(q);
        return true;
      }
      activate();
      return true;
    }
    case 'Escape':
      if (inSearch && ctl.searchText) ctl.clearSearch(source);
      else ctl.close(source, 'escape');
      return true;
    case 'Tab':
      ctl.close(source, 'tab');
      return false;
  }
  if ((event.key === 'a' || event.key === 'A') && (event.ctrlKey || event.metaKey) && ctl.multiple && !inSearch) {
    ctl.toggleAll(source);
    return true;
  }
  if (!inSearch && isTypeaheadKey(event)) {
    const q = typeaheadMatch((ctl.typeahead.current ??= createTypeahead()), event.key, event.timeStamp, count, Math.max(pos, 0), (k) => store.label(order[k] as number), enabled);
    if (q >= 0) go(q);
    return true;
  }
  return false;
}

export type { DropdownValue };
