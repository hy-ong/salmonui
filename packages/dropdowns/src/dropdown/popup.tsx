'use client';

// Popup content of Select and Combobox, a lazy chunk (core.tsx
// `usePopupModule`): the listbox with its fixed-height window on the shared
// virtual math, options with `aria-activedescendant` focus, group headers
// and the sticky group, the select-all option, empty / loading / error
// states and the polite live region, placed by the shared overlay.

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, type RefObject } from 'react';
import { windowRange } from '@salmonui/core/internal/collection/virtual';
import { OVERSCAN, partClass, partStyle, preventFocusLoss, SELECT_ALL_ROW, useStoreField, type DropdownController, type PopupContext } from './core.js';
import { Popup } from './overlay.js';
import type { DropdownCommonProps, DropdownPartProps } from './types.js';

// ---------------------------------------------------------------------------
// Popup content
// ---------------------------------------------------------------------------

export interface DropdownPopupProps<Item> {
  readonly ctl: DropdownController<Item>;
  readonly base: string;
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly context: PopupContext;
  readonly onOutsidePress: () => void;
  /** Chooses a row with the pointer (keeps focus on the trigger or input). */
  readonly onChoose: (row: number, event: ReactMouseEvent) => void;
  /** Search input (Select `searchable`) rendered above the list. */
  readonly search?: ReactNode;
  /** Accessible name of the sheet dialog (`popupMode="sheet"`). */
  readonly sheetTitle?: string | undefined;
  /** Extra rows after the list (Combobox "create" option). */
  readonly after?: ReactNode;
  readonly labelledBy?: string | undefined;
  readonly label?: string | undefined;
  /** Replaces the listbox (Combobox `columns` grid popup). */
  readonly body?: ReactNode;
}

export function DropdownPopup<Item>(props: DropdownPopupProps<Item>) {
  const { ctl, base, context } = props;
  const p = ctl.props;
  const sheet = context.mode === 'sheet';
  const liveRef = useRef<HTMLDivElement | null>(null);
  // Announcements: result count after a search, the selection limit. DOM write, no render.
  const resultCount = ctl.view.itemCount;
  const searching = ctl.searchText !== '';
  const { text, limitReached, loading } = ctl;
  const locale = ctl.locale ?? 'en-US';
  useEffect(() => {
    const el = liveRef.current;
    if (!el || !searching || loading) return;
    const timer = setTimeout(() => {
      el.textContent = text.resultCount(resultCount, new Intl.PluralRules(locale).select(resultCount));
    }, 150);
    return () => clearTimeout(timer);
  }, [searching, resultCount, loading, text, locale]);
  useEffect(() => {
    const el = liveRef.current;
    if (el && limitReached && p.maxSelected !== undefined) el.textContent = text.limitReached(p.maxSelected);
  }, [limitReached, text, p.maxSelected]);

  const empty = !loading && ctl.count === 0 && ctl.remoteState.status !== 'error';
  return (
    <Popup
      anchorRef={props.anchorRef}
      context={context}
      className={partClass(`${base}-popup salmon-dropdown-popup`, p as DropdownCommonProps<unknown>, 'popup')}
      style={partStyle(p as DropdownCommonProps<unknown>, 'popup')}
      onOutsidePress={props.onOutsidePress}
      role={sheet ? 'dialog' : undefined}
      aria-label={sheet ? props.sheetTitle : undefined}
    >
      {props.search}
      {p.popupHeader !== undefined ? <div className="salmon-dropdown-popup-header">{p.popupHeader}</div> : null}
      {props.body ?? <ListBody ctl={ctl} base={base} onChoose={props.onChoose} labelledBy={props.labelledBy} label={props.label} />}
      {props.after}
      {empty ? <div className="salmon-dropdown-empty">{p.renderEmpty ? p.renderEmpty({ reason: ctl.searchText ? 'noMatch' : 'noData' }) : ctl.searchText ? text.noResults : text.noData}</div> : null}
      {/* A remote read shows the row only over an empty list; a forced `loading` shows it over items too. */}
      {loading && (ctl.count === 0 || p.loading === true) ? (
        <div className="salmon-dropdown-loading" role="status">
          {p.renderLoading ? p.renderLoading() : (
            <>
              <span className="salmon-dropdown-spinner" aria-hidden="true" />
              {text.loading}
            </>
          )}
        </div>
      ) : null}
      {ctl.remoteState.status === 'error' ? (
        <div className="salmon-dropdown-error" role="alert">
          {p.renderError ? p.renderError({ error: ctl.remoteState.error, retry: () => ctl.remote?.retry() }) : (
            <>
              <span>{text.loadError}</span>
              <button type="button" className="salmon-dropdown-retry" onPointerDown={preventFocusLoss} onClick={() => ctl.remote?.retry()}>
                {text.retry}
              </button>
            </>
          )}
        </div>
      ) : null}
      {p.popupFooter !== undefined ? <div className="salmon-dropdown-popup-footer">{p.popupFooter}</div> : null}
      <div ref={liveRef} className="salmon-dropdown-live" aria-live="polite" aria-atomic="true" />
    </Popup>
  );
}


interface ListBodyProps<Item> {
  readonly ctl: DropdownController<Item>;
  readonly base: string;
  readonly onChoose: (row: number, event: ReactMouseEvent) => void;
  readonly labelledBy?: string | undefined;
  readonly label?: string | undefined;
}

function ListBody<Item>(props: ListBodyProps<Item>) {
  const { ctl, base, onChoose } = props;
  const { store, count, virtual, maxVisible, listRef } = ctl;
  const p = ctl.props;
  const { first, last, h } = useWindow(ctl);
  const start = virtual ? first : 0;
  const end = virtual ? last : count;
  // The active row when it is outside the mounted window, else -1: a move inside the window does not re-render the list.
  const outside = useSyncExternalStore(
    store.subscribe,
    () => {
      const a = store.getState().active;
      return virtual && a >= 0 && a < count && (a < start || a >= end) ? a : -1;
    },
    () => -1,
  );
  const outsideInfo = outside >= 0 ? ctl.rowInfo(outside) : null;
  const remote = ctl.remote;
  const onScroll = (): void => {
    const el = listRef.current;
    if (el && virtual) ctl.scrolled(el.scrollTop);
  };
  const rows: ReactNode[] = [];
  let groupRun: ReactNode[] | null = null;
  let groupLabel = '';
  let runKey = 0;
  const flush = (): void => {
    if (groupRun) {
      rows.push(
        <div key={`g${runKey++}`} role="group" aria-label={groupLabel} className={partClass(`${base}-group salmon-dropdown-group`, p as DropdownCommonProps<unknown>, 'group')} style={partStyle(p as DropdownCommonProps<unknown>, 'group')}>
          {groupRun}
        </div>,
      );
      groupRun = null;
    }
  };
  const grouped = !remote && ctl.collection.grouped;
  if (grouped && start > 0) {
    // The window starts inside a group: open its run.
    for (let r = start; r >= 0; r--) {
      const info = ctl.rowInfo(r);
      if (info.kind === 'group') {
        groupLabel = info.group ?? '';
        groupRun = [];
        break;
      }
    }
  }
  for (let r = start; r < end; r++) {
    const info = ctl.rowInfo(r);
    if (info.kind === 'group') {
      flush();
      groupLabel = info.group ?? '';
      groupRun = [<GroupHeader key={`h${r}`} ctl={ctl} row={r} group={groupLabel} />];
      continue;
    }
    const node = info.kind === 'pending' ? (
      <div key={r} id={ctl.optionId(r)} role="option" aria-selected={false} aria-disabled={true} aria-setsize={ctl.count} aria-posinset={r + 1} data-row={r} data-pending="" className="salmon-dropdown-option">
        <span className="salmon-dropdown-skeleton" aria-hidden="true" />
      </div>
    ) : (
      <Option key={r} ctl={ctl} row={r} item={info.item as Item} position={info.position} onChoose={onChoose} />
    );
    if (groupRun) groupRun.push(node);
    else rows.push(node);
  }
  flush();
  const listStyle: CSSProperties = { maxBlockSize: maxVisible * h, ...partStyle(p as DropdownCommonProps<unknown>, 'list') };
  return (
    <>
      {ctl.showSelectAll ? <SelectAllOption ctl={ctl} base={base} onChoose={onChoose} /> : null}
      <div
        ref={listRef}
        id={ctl.listId}
        role="listbox"
        aria-multiselectable={ctl.multiple ? true : undefined}
        // The select-all option sits above the scrolling list; aria-owns keeps it a listbox child.
        aria-owns={ctl.showSelectAll ? ctl.optionId(SELECT_ALL_ROW) : undefined}
        aria-labelledby={props.labelledBy}
        aria-label={props.labelledBy ? undefined : props.label}
        aria-busy={ctl.loading ? true : undefined}
        className={partClass(`${base}-list salmon-dropdown-list`, p as DropdownCommonProps<unknown>, 'list')}
        style={listStyle}
        data-virtual={virtual ? '' : undefined}
        onScroll={virtual ? onScroll : undefined}
        onPointerDown={preventFocusLoss}
      >
        {virtual ? (
          <div className="salmon-dropdown-sizer" style={{ blockSize: count * h }}>
            {grouped ? <StickyGroup ctl={ctl} /> : null}
            <div className="salmon-dropdown-window" style={{ transform: `translateY(${start * h}px)` }}>
              {rows}
            </div>
            {outside >= 0 && outsideInfo?.kind === 'item' ? (
              // The active option stays mounted outside the window.
              <div className="salmon-dropdown-window" role="presentation" style={{ transform: `translateY(${outside * h}px)` }}>
                <Option ctl={ctl} row={outside} item={outsideInfo.item as Item} position={outsideInfo.position} onChoose={onChoose} />
              </div>
            ) : null}
          </div>
        ) : (
          rows
        )}
      </div>
    </>
  );
}

/**
 * The mounted window `[first, last)` and the item height from the store.
 * The height is measured once per open from the first rendered option
 * (CSS controls it); a remote list requests the window plus one
 * overscan when it moves. Shared by the listbox and the grid popup.
 */
export function useWindow<Item>(ctl: DropdownController<Item>, fixedHeight?: number): { first: number; last: number; h: number } {
  const { store, count, virtual, maxVisible, listRef, remote } = ctl;
  const h = useStoreField(store, 'itemHeight');
  const stored = { first: useStoreField(store, 'first'), last: useStoreField(store, 'last') };
  // A new count (search, data) starts from the stored window clamped to it.
  const range = virtual ? (stored.last > stored.first && stored.last <= count ? stored : windowRange(count, Math.min(stored.first, count), maxVisible)) : { first: 0, last: count };
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-row]');
    const measured = fixedHeight ?? el?.offsetHeight ?? 0;
    if (measured > 0 && Math.abs(measured - store.getState().itemHeight) > 0.5) store.set({ itemHeight: measured });
  }, [listRef, store, fixedHeight, count > 0]);
  useEffect(() => {
    remote?.ensure(range.first, range.last + OVERSCAN);
  }, [remote, range.first, range.last, ctl.remoteState.total]);
  return { first: range.first, last: range.last, h };
}

/** Sticky header of a windowed grouped list: the group of the first visible row. */
function StickyGroup<Item>({ ctl }: { readonly ctl: DropdownController<Item> }) {
  const group = useStoreField(ctl.store, 'sticky') ?? (ctl.count ? (ctl.view.group(0) ?? '') : '');
  const p = ctl.props;
  return (
    <div className="salmon-dropdown-sticky-group" aria-hidden="true">
      {p.renderGroupHeader ? p.renderGroupHeader({ group }) : group}
    </div>
  );
}

function GroupHeader<Item>({ ctl, row, group }: { readonly ctl: DropdownController<Item>; readonly row: number; readonly group: string }) {
  const p = ctl.props;
  const content = p.renderGroupHeader ? p.renderGroupHeader({ group }) : group;
  // Tri-state group header option.
  if (ctl.multiple && p.groupSelection) return <TriOption ctl={ctl} row={row} state={ctl.groupState(group)} label={content} className="salmon-dropdown-group-header" onClick={() => ctl.toggleGroup(group, 'pointer')} />;
  return (
    <div role="presentation" aria-hidden="true" data-row={row} data-group-header="" className="salmon-dropdown-group-header">
      {content}
    </div>
  );
}

function SelectAllOption<Item>({ ctl, base, onChoose }: { readonly ctl: DropdownController<Item>; readonly base: string; readonly onChoose: (row: number, event: ReactMouseEvent) => void }) {
  const state = ctl.allState();
  return <TriOption ctl={ctl} row={SELECT_ALL_ROW} state={state} label={state === 'all' ? ctl.text.deselectAll : ctl.text.selectAll} className={`${base}-select-all salmon-dropdown-select-all`} onClick={(event) => onChoose(SELECT_ALL_ROW, event)} />;
}

/** A tri-state option (select all, a selectable group header): `aria-checked` carries `mixed`. */
function TriOption<Item>(props: { readonly ctl: DropdownController<Item>; readonly row: number; readonly state: 'all' | 'some' | 'none'; readonly label: ReactNode; readonly className: string; readonly onClick: (event: ReactMouseEvent) => void }) {
  const { ctl, row, state } = props;
  const active = useSyncExternalStore(ctl.store.subscribe, () => ctl.store.getState().active === row, () => false);
  return (
    <div
      id={ctl.optionId(row)}
      role="option"
      aria-selected={state === 'all'}
      aria-checked={state === 'all' ? true : state === 'some' ? 'mixed' : false}
      className={`${props.className} salmon-dropdown-option`}
      data-row={row >= 0 ? row : undefined}
      data-active={active ? '' : undefined}
      data-state={state}
      onPointerDown={preventFocusLoss}
      onClick={props.onClick}
    >
      <Indicator kind="checkbox" state={state} />
      <span className="salmon-dropdown-option-label">{props.label}</span>
    </div>
  );
}

/** Check mark or checkbox of an option, drawn in CSS (`data-state`). */
export function Indicator({ kind, state }: { readonly kind: 'check' | 'checkbox'; readonly state: 'all' | 'some' | 'none' }) {
  return <span className={`salmon-dropdown-${kind}`} data-state={state === 'all' ? 'checked' : state === 'some' ? 'mixed' : 'unchecked'} aria-hidden="true" />;
}

interface OptionProps<Item> {
  readonly ctl: DropdownController<Item>;
  readonly row: number;
  readonly item: Item;
  readonly position: number;
  readonly onChoose: (row: number, event: ReactMouseEvent) => void;
}

function Option<Item>({ ctl, row, item, position, onChoose }: OptionProps<Item>) {
  // Only the old and the new active option re-render on a move.
  const active = useSyncExternalStore(ctl.store.subscribe, () => ctl.store.getState().active === row, () => false);
  const p = ctl.props;
  const value = ctl.valueOf(item);
  const label = ctl.labelOf(item);
  const selected = ctl.selected.has(value);
  const disabled = ctl.isDisabled(item) || (ctl.limitReached && !selected);
  const matches = ctl.searchText && ctl.matchRanges && (p.highlightMatches || p.renderItem) ? ctl.matchRanges(label, ctl.searchText, ctl.operator, { matchCase: p.matchCase, ignoreAccents: p.ignoreAccents }) : NO_MATCHES;
  const extra = p.getItemProps?.(item);
  const indicator = p.indicator ?? 'check';
  const icon = p.getItemIcon?.(item);
  const content = p.renderItem ? p.renderItem({ item, label, selected, active, disabled, matches }) : p.highlightMatches ? <Highlighted label={label} matches={matches} /> : label;
  const className = partClass(`salmon-${ctl.kind}-option salmon-dropdown-option`, p as DropdownCommonProps<unknown>, 'option');
  const { className: extraClass, style: extraStyle, ...dataProps } = (extra ?? {}) as DropdownPartProps;
  return (
    <div
      {...dataProps}
      id={ctl.optionId(row)}
      role="option"
      aria-selected={selected}
      aria-disabled={disabled ? true : undefined}
      aria-setsize={ctl.view.itemCount}
      aria-posinset={position}
      data-row={row}
      data-active={active ? '' : undefined}
      data-selected={selected ? '' : undefined}
      data-disabled={disabled ? '' : undefined}
      className={extraClass ? `${className} ${extraClass}` : className}
      style={extraStyle || p.styles?.option ? { ...p.styles?.option, ...extraStyle } : undefined}
      onClick={disabled ? undefined : (event) => onChoose(row, event)}
      onPointerMove={disabled || active ? undefined : () => ctl.store.set({ active: row })}
    >
      {ctl.multiple || indicator === 'checkbox' ? <Indicator kind={indicator} state={selected ? 'all' : 'none'} /> : null}
      {icon != null ? (
        <span className="salmon-dropdown-option-icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="salmon-dropdown-option-label">{content}</span>
      {!ctl.multiple && indicator === 'check' ? <Indicator kind="check" state={selected ? 'all' : 'none'} /> : null}
    </div>
  );
}

const NO_MATCHES: readonly (readonly [number, number])[] = Object.freeze([]);

/** Label with `<mark>` around the matched ranges. */
export function Highlighted({ label, matches }: { readonly label: string; readonly matches: readonly (readonly [number, number])[] }) {
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

