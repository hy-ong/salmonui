'use client';

// DataGrid overlays: column menu, context menu, toolbar overflow menu,
// filter menu (Excel / checklist with a virtualized facet list,
// operator menu), and the column chooser. One overlay is open at a time; the
// open state lives in the `DataGridChrome` store, never in React state of the
// grid. Draft values inside an open dialog (checked facet keys, search text,
// chooser checkboxes) are local to the dialog and discarded on close.
//
// A lazy chunk: `DataGridOverlays`
// (overlay-slot.tsx) loads it when an overlay opens, and preloads it after
// mount for grids whose props can open one.

import {
  getColumnFilters,
  isColumnVisible,
  type ColumnFacet,
  type ColumnId,
  type ColumnsState,
  type CompiledColumn,
  type FacetOptions,
  type FacetValue,
  type FilterDescriptor,
  type Json,
} from '@salmonui/data-grid/engine';
import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { DataGridColumnChooser, DataGridMenuItem } from './chrome-types.js';
import type { DataGridColumnChooserContext } from './feature-types.js';
import { barOperatorFor, conditionsCommand, editableConditions, editorClassName, filterEditorProps, filterSource, formatFilterValue, inputTypeOf, NO_VALUE_OPERATORS, operatorLabel, operatorsFor, parseFilterValue, valueTypeOf, type FilterCondition } from './filter-ui.js';
import { FilterValuesLoading } from './filter-loading.js';
import { filteringOf } from './query-config.js';
import type { DataGridColumn } from './types.js';
import type { OverlayState } from './chrome.js';
import type { DataGridEventSource } from '@salmonui/core/internal/events';
import { columnInfo } from './column-info.js';
import { useEngineSelector, useDataGridInstance, useDataGridText } from './context.js';
import type { DataGridInstance } from './instance.js';
import { menuAction } from './menu-action.js';
import { DataGridMenu, DataGridPopover, type AnchorRect } from './popover.js';
import { hasRemoteSelection, isRemoteFacet, readRemoteFacet, useRemoteFacet } from './remote-facet.js';

function joinClass(...parts: (string | undefined | false | null)[]): string {
  let out = '';
  for (const p of parts) if (p) out = out ? `${out} ${p}` : p;
  return out;
}

/** Event source of a menu dismissal. */
function closeSource(reason: 'outside' | 'escape' | 'tab' | 'action' | 'collapse'): 'pointer' | 'keyboard' {
  return reason === 'outside' || reason === 'action' ? 'pointer' : 'keyboard';
}

/** The open overlay (rendered by `DataGridOverlays` in overlay-slot.tsx once this chunk is loaded). */
export function OverlayContent({ instance, overlay, loadBuilder }: { instance: DataGridInstance<unknown>; overlay: OverlayState; loadBuilder: BuilderLoader }) {
  const chrome = instance.chrome;
  const props = instance.props;
  const text = useDataGridText();
  const rtl = instance.rtl;
  const close = (): void => chrome.close();
  switch (overlay.kind) {
    case 'columnMenu': {
      const column = chrome.column(overlay.columnId);
      if (!column) return null;
      const menu = (
        <DataGridMenu
          items={overlay.items}
          anchor={overlay.anchor}
          container={overlay.container}
          rtl={rtl}
          label={text('columnMenuLabel', { column: column.headerText })}
          className={joinClass('salmon-data-grid-column-menu', props.classNames?.columnMenu)}
          style={props.styles?.columnMenu}
          onAction={(item, source) => menuAction(chrome, item, overlay.columnId, null, source)}
          onClose={(reason) => chrome.close(reason !== 'outside', closeSource(reason))}
        />
      );
      return props.renderColumnMenu ? <>{props.renderColumnMenu({ field: overlay.columnId, column: columnInfo(column), items: overlay.items, defaultMenu: menu, close })}</> : menu;
    }
    case 'contextMenu': {
      const menu = (
        <DataGridMenu
          items={overlay.items}
          anchor={overlay.anchor}
          container={overlay.container}
          rtl={rtl}
          label={text('contextMenuLabel')}
          className={joinClass('salmon-data-grid-context-menu', props.classNames?.contextMenu)}
          style={props.styles?.contextMenu}
          onAction={(item, source) => menuAction(chrome, item, 'field' in overlay.target ? overlay.target.field : null, overlay.target, source)}
          onClose={(reason) => chrome.close(reason !== 'outside', closeSource(reason))}
        />
      );
      return props.renderContextMenu ? <>{props.renderContextMenu({ target: overlay.target, items: overlay.items, defaultMenu: menu, close })}</> : menu;
    }
    case 'toolbarOverflow':
      return (
        <DataGridMenu
          items={overlay.items}
          anchor={overlay.anchor}
          container={overlay.container}
          rtl={rtl}
          label={text('more')}
          className="salmon-data-grid-toolbar-overflow"
          onAction={(item, source) => {
            const tb = chrome.toolbarItems().find((i) => i.id === item.id);
            chrome.close();
            if (tb) chrome.runToolbarItem(tb, null, source);
          }}
          onClose={(reason) => chrome.close(reason !== 'outside')}
        />
      );
    case 'filterMenu':
      return <FilterMenu instance={instance} columnId={overlay.columnId} anchor={overlay.anchor} container={overlay.container} source={overlay.source} />;
    case 'columnChooser':
      return <ColumnChooser instance={instance} anchor={overlay.anchor} container={overlay.container} />;
    case 'filterBuilder':
      return <FilterBuilderOverlay instance={instance} anchor={overlay.anchor} container={overlay.container} load={loadBuilder} />;
  }
}

// ---------------------------------------------------------------------------
// Filter builder: a lazy chunk of its own, loaded from this chunk
// ---------------------------------------------------------------------------

// The filter builder chunk imports shared code through this chunk only: every
// module it reaches is then reached by this chunk too, so the new dynamic
// entry changes no chunk grouping of the static bundle.
export { barOperatorFor, formatFilterValue, inputTypeOf, NO_VALUE_OPERATORS, operatorLabel, operatorsFor, parseFilterValue, valueTypeOf } from './filter-ui.js';
export { filterEntries, filteringOf, gridFilters } from './query-config.js';
export { DataGridPopover } from './popover.js';

type BuilderChunk = typeof import('./filter-builder.js');
/**
 * `() => import('./filter-builder.js')`, passed in by overlay-slot.tsx: the
 * dynamic import stays in the static bundle, so this chunk needs no preload
 * helper of its own.
 */
export type BuilderLoader = () => Promise<BuilderChunk>;

// One load per page (a load cache, not render state).
let builderLoad: Promise<BuilderChunk> | null = null;
let loadedBuilder: BuilderChunk | null = null;
const builderListeners = new Set<() => void>();

/** Loads the filter builder chunk (preloaded after mount for grids with `filtering.builder`). */
export function preloadFilterBuilder(load: BuilderLoader): Promise<BuilderChunk> {
  return (builderLoad ??= load().then((chunk) => {
    loadedBuilder = chunk;
    for (const l of builderListeners) l();
    return chunk;
  }));
}

const subscribeBuilder = (listener: () => void): (() => void) => {
  builderListeners.add(listener);
  return () => {
    builderListeners.delete(listener);
  };
};
const getBuilder = (): BuilderChunk | null => loadedBuilder;
const getServerBuilder = (): BuilderChunk | null => null;

function FilterBuilderOverlay({ instance, anchor, container, load }: { instance: DataGridInstance<unknown>; anchor: AnchorRect; container: Element; load: BuilderLoader }) {
  const chunk = useSyncExternalStore(subscribeBuilder, getBuilder, getServerBuilder);
  useEffect(() => {
    if (!chunk) void preloadFilterBuilder(load).catch(() => undefined);
  }, [chunk, load]);
  return chunk ? <chunk.FilterBuilderDialog instance={instance} anchor={anchor} container={container} /> : null;
}

// ---------------------------------------------------------------------------
// Filter menu
// ---------------------------------------------------------------------------

type FacetApi = { getFacet(columnId: ColumnId, options?: FacetOptions): ColumnFacet | undefined };

const ALL_VALUES = 0x7fffffff;
const ITEM_HEIGHT = 32;
const LIST_HEIGHT = 256;
const OVERSCAN = 6;
/** `filtering.checklistPageSize` default. */
export const DEFAULT_CHECKLIST_PAGE_SIZE = 100;

/**
 * Checklist draft over a paged facet: `base` is the checked
 * state of every value without a flip (all, none, or each value's current
 * `selected`), `flips` the values toggled away from it. Only toggled values
 * are held, so a draft never needs the values that are not loaded yet.
 */
interface Draft {
  readonly base: 'all' | 'none' | 'current';
  readonly flips: ReadonlyMap<string, FacetValue>;
}

const ALL_CHECKED: Draft = { base: 'all', flips: new Map() };

function baseChecked(draft: Draft, v: FacetValue): boolean {
  return draft.base === 'all' ? true : draft.base === 'none' ? false : v.selected;
}

function isChecked(draft: Draft, v: FacetValue): boolean {
  return draft.flips.has(v.key) !== baseChecked(draft, v);
}

function flipped(draft: Draft, v: FacetValue): Draft {
  const flips = new Map(draft.flips);
  if (!flips.delete(v.key)) flips.set(v.key, v);
  return { base: draft.base, flips };
}

/** Checked values of the whole facet (loaded or not). */
function checkedCountOf(draft: Draft, facet: ColumnFacet | undefined): number {
  const total = facet?.distinctCount ?? 0;
  let n = draft.base === 'all' ? total : draft.base === 'none' ? 0 : (facet?.selectedCount ?? 0);
  for (const v of draft.flips.values()) n += baseChecked(draft, v) ? -1 : 1;
  return n;
}

/** One condition of the menu / Excel custom filter: operator plus editor text (two for `between`). */
interface ConditionDraft {
  readonly operator: string;
  readonly text: string;
  readonly text2: string;
}

function draftOf(column: CompiledColumn<unknown>, condition: FilterCondition | undefined, fallback: string): ConditionDraft {
  if (!condition) return { operator: fallback, text: '', text2: '' };
  const v = condition.value;
  if (condition.operator === 'between' && Array.isArray(v)) return { operator: 'between', text: formatFilterValue(column, v[0] as Json), text2: formatFilterValue(column, v[1] as Json) };
  return { operator: condition.operator, text: formatFilterValue(column, v), text2: '' };
}

/** Parsed condition, or null when the draft is incomplete or invalid. */
function conditionOf(column: CompiledColumn<unknown>, d: ConditionDraft, templateValue: Json | undefined): FilterCondition | null {
  if (NO_VALUE_OPERATORS.has(d.operator)) return { operator: d.operator, value: null };
  if (templateValue !== undefined) return templateValue === null || templateValue === '' ? null : { operator: d.operator, value: templateValue };
  if (d.operator === 'between') {
    const a = parseFilterValue(column, d.text);
    const b = parseFilterValue(column, d.text2);
    return a === undefined || b === undefined ? null : { operator: 'between', value: [a, b] };
  }
  if (valueTypeOf(column) === 'boolean' && d.text === '') return { operator: d.operator, value: true };
  const value = parseFilterValue(column, d.text);
  return value === undefined ? null : { operator: d.operator, value };
}

function FilterMenu({ instance, columnId, anchor, container, source: openSource }: { instance: DataGridInstance<unknown>; columnId: ColumnId; anchor: AnchorRect; container: Element; source: DataGridEventSource }) {
  const chrome = instance.chrome;
  const engine = instance.engine;
  const text = useDataGridText();
  const settings = filteringOf(instance.props);
  const column = chrome.column(columnId) as CompiledColumn<unknown>;
  const rawUi = chrome.filterUi(column);
  // A filter row column opened through the column menu gets the operator menu.
  const ui = rawUi === 'row' ? 'menu' : rawUi;
  const checklist = ui === 'excel' || ui === 'checklist';
  const facetApi = (engine as unknown as { filter?: FacetApi }).filter;
  const id = useId();
  const operators = operatorsFor(column, settings);
  const fallback = barOperatorFor(column, settings);
  const initialOperator = operators.includes(fallback) ? fallback : (operators[0] as string);
  const existing = useMemo(() => editableConditions(engine.getSnapshot().query.filters, columnId), [engine, columnId]);
  const [search, setSearch] = useState('');
  // Values load `checklistPageSize` at a time (more as the list scrolls to its end), never all at once by default.
  const pageSize = Math.max(1, Math.floor(settings?.checklistPageSize ?? DEFAULT_CHECKLIST_PAGE_SIZE));
  const firstLimit = settings?.checklistInfiniteScroll === false ? ALL_VALUES : pageSize;
  const [limit, setLimit] = useState(firstLimit);
  // a remote source answers the checklist values (`read({ facet })`); the core facet is local only.
  const remote = checklist && isRemoteFacet(engine as never);
  const remoteFacet = useRemoteFacet(engine as never, column, remote, search, limit);
  const localFacet = useMemo(
    () => (checklist && !remote ? facetApi?.getFacet(columnId, search ? { search, limit } : { limit }) : undefined),
    [checklist, remote, facetApi, columnId, search, limit],
  );
  const facet = remote ? remoteFacet.facet : localFacet;
  // The unsearched draft starts from the column's current filter; a search starts with every match checked.
  const [draft, setDraft] = useState<Draft>(() => {
    if (remote) return { base: hasRemoteSelection(engine as never, column) ? 'current' : 'all', flips: new Map() };
    const initial = checklist ? facetApi?.getFacet(columnId, { limit: firstLimit }) : undefined;
    return { base: initial && initial.selectedCount < initial.distinctCount ? 'current' : 'all', flips: new Map() };
  });
  const [searchDraft, setSearchDraft] = useState<Draft>(ALL_CHECKED);
  const canLoadMore = facet?.truncated === true && !(remote && remoteFacet.loading);
  const loadMore = (): void => {
    if (canLoadMore && facet) setLimit(facet.values.length + pageSize);
  };
  const [first, setFirst] = useState<ConditionDraft>(() => draftOf(column, existing.conditions[0], initialOperator));
  const [second, setSecond] = useState<ConditionDraft>(() => draftOf(column, existing.conditions[1], initialOperator));
  const [predicate, setPredicate] = useState<'and' | 'or'>(existing.predicate);
  const [templateValue, setTemplateValue] = useState<Json | undefined>(undefined);
  const [custom, setCustom] = useState(ui === 'menu' || existing.conditions.length > 0);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const firstRef = useRef<HTMLSelectElement | null>(null);

  useLayoutEffect(() => {
    (checklist ? searchRef.current : firstRef.current)?.focus({ preventScroll: true });
  }, [checklist]);
  // onFilterMenuOpen once per opening, after the menu rendered (the ref survives StrictMode's effect replay).
  const announced = useRef(false);
  useLayoutEffect(() => {
    if (announced.current) return;
    announced.current = true;
    chrome.filterMenuOpened(columnId, 'menu', openSource);
  }, [chrome, columnId, openSource]);

  const values = facet?.values ?? [];
  const searched = search !== '';
  const active = searched ? searchDraft : draft;
  const setActive = searched ? setSearchDraft : setDraft;
  // Select-all reflects every (searched) value, loaded or not.
  const total = facet?.distinctCount ?? 0;
  const checkedCount = checkedCountOf(active, facet);
  const allState = checkedCount === 0 ? false : checkedCount === total ? true : 'mixed';

  const onSearch = (next: string): void => {
    setSearch(next);
    setLimit(firstLimit);
    setSearchDraft(ALL_CHECKED);
  };
  const toggleAll = (): void => setActive({ base: allState !== true ? 'all' : 'none', flips: new Map() });
  const toggle = (v: FacetValue): void => setActive(flipped(active, v));

  const def = column.def as DataGridColumn<unknown>;
  const c1 = conditionOf(column, first, def.renderFilter ? templateValue : undefined);
  const c2 = ui === 'excel' ? conditionOf(column, second, undefined) : null;
  const source = filterSource(ui);
  const useConditions = custom && ui !== 'checklist';

  const apply = (override?: Json): void => {
    const filters = engine.getSnapshot().query.filters;
    if (useConditions) {
      const head = override !== undefined ? conditionOf(column, first, override) : c1;
      if (!head) return;
      instance.dispatchFrom('pointer', conditionsCommand(filters, columnId, c2 ? [head, c2] : [head], predicate, source));
    } else if (checklist) {
      if (!searched && draft.base === 'all' && draft.flips.size === 0) instance.dispatchFrom('pointer', { type: 'filter.remove', columnId });
      else {
        const unchecked = total - checkedCount;
        const flips = [...active.flips.values()].map((v) => v.value);
        let operator: 'in' | 'notIn';
        let value: Json[];
        if (!searched && active.base === 'all' && unchecked <= checkedCount) {
          // The unchecked values are exactly the flips: no full read.
          operator = 'notIn';
          value = flips;
        } else if (active.base === 'none' && (searched || checkedCount <= unchecked)) {
          operator = 'in';
          value = flips;
        } else {
          // Every (searched) value is read once, on apply only.
          const decide = (all: readonly FacetValue[]): void => {
            const pick: Json[] = [];
            const skip: Json[] = [];
            for (const v of all) (isChecked(active, v) ? pick : skip).push(v.value);
            const useNotIn = !searched && skip.length < pick.length;
            instance.dispatchFrom('pointer', { type: 'filter.byColumn', columnId, operator: useNotIn ? 'notIn' : 'in', value: useNotIn ? skip : pick, source: filterSource(ui) });
          };
          if (!remote) decide(facetApi?.getFacet(columnId, searched ? { search, limit: ALL_VALUES } : { limit: ALL_VALUES })?.values ?? []);
          else if (facet && !facet.truncated) decide(facet.values);
          else {
            // Remote and not every value loaded: one more facet read for all of them, then apply.
            readRemoteFacet(engine as never, column, { search, limit: ALL_VALUES, signal: new AbortController().signal }).then(
              (all) => decide(all.values),
              () => {},
            );
          }
          chrome.close();
          return;
        }
        instance.dispatchFrom('pointer', { type: 'filter.byColumn', columnId, operator, value, source: filterSource(ui) });
      }
    }
    chrome.close();
  };
  const clear = (): void => {
    instance.dispatchFrom('pointer', { type: 'filter.remove', columnId });
    chrome.close();
  };
  const canApply = useConditions ? c1 !== null : checkedCount > 0;
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT' && (event.target as HTMLInputElement).type !== 'checkbox' && canApply) {
      event.preventDefault();
      apply();
    }
  };
  const template = def.renderFilter
    ? def.renderFilter({
        column: columnInfo(column),
        field: columnId,
        editorProps: filterEditorProps(column),
        operators,
        operator: first.operator,
        value: templateValue ?? c1?.value ?? null,
        setOperator: (operator) => setFirst({ ...first, operator }),
        setValue: (value) => setTemplateValue(value),
        apply: (value) => apply(value),
        clear,
      })
    : null;
  const editorProps = { column, operators, text };
  const conditions = (
    <>
      <ConditionEditor {...editorProps} draft={first} onChange={setFirst} selectRef={firstRef} template={template} index={0} />
      {ui === 'excel' ? (
        <>
          <div className="salmon-data-grid-filter-menu__predicate" role="radiogroup" aria-label={`${text('and')} / ${text('or')}`}>
            <label>
              <input type="radio" className="salmon-data-grid-check" name={`${id}-predicate`} checked={predicate === 'and'} onChange={() => setPredicate('and')} />
              {text('and')}
            </label>
            <label>
              <input type="radio" className="salmon-data-grid-check" name={`${id}-predicate`} checked={predicate === 'or'} onChange={() => setPredicate('or')} />
              {text('or')}
            </label>
          </div>
          <ConditionEditor {...editorProps} draft={second} onChange={setSecond} selectRef={null} template={null} index={1} />
        </>
      ) : null}
    </>
  );
  return (
    <DataGridPopover
      anchor={anchor}
      container={container}
      rtl={instance.rtl}
      role="dialog"
      label={text('filterMenuLabel', { column: column.headerText })}
      className={joinClass('salmon-data-grid-filter-menu', instance.props.classNames?.filterMenu)}
      style={instance.props.styles?.filterMenu}
      onDismiss={(reason) => chrome.close(reason !== 'outside')}
      onKeyDown={onKeyDown}
      dataAttributes={{ 'data-ui': ui, 'data-column-id': columnId }}
    >
      {checklist ? (
        <>
          <input
            ref={searchRef}
            className="salmon-data-grid-input salmon-data-grid-filter-menu__search"
            type="search"
            aria-label={text('searchValues')}
            placeholder={text('search')}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
          />
          <label className="salmon-data-grid-filter-menu__all">
            <input
              type="checkbox"
              className="salmon-data-grid-check"
              checked={allState === true}
              ref={(el) => {
                if (el) el.indeterminate = allState === 'mixed';
              }}
              onChange={toggleAll}
            />
            {text('selectAll')}
          </label>
          {facet?.status === 'unavailable' ? (
            <p className="salmon-data-grid-filter-menu__empty">{text('unavailable', { feature: text('filter') })}</p>
          ) : remote && remoteFacet.error !== null && !facet ? (
            <p className="salmon-data-grid-filter-menu__empty" role="alert">
              {text('dataErrorTitle')}{' '}
              <button type="button" className="salmon-data-grid-button" onClick={remoteFacet.retry}>
                {text('retry')}
              </button>
            </p>
          ) : remote && !facet ? (
            <FilterValuesLoading indicator={settings?.loadingIndicator} label={`${text('loading')}…`} />
          ) : (
            <FacetList
              id={id}
              values={values}
              total={total}
              resetKey={search}
              draft={active}
              blankLabel={text('blank')}
              emptyLabel={text('noMatches')}
              label={text('filterMenuLabel', { column: column.headerText })}
              onToggle={toggle}
              onLoadMore={canLoadMore ? loadMore : undefined}
            />
          )}
        </>
      ) : null}
      {ui === 'excel' ? (
        <details
          className="salmon-data-grid-filter-menu__custom"
          open={custom}
          onToggle={(e) => {
            const el = e.currentTarget as HTMLDetailsElement;
            if (el.open === custom) return;
            // Opening the custom-condition section raises the filter menu events with dialog 'custom'.
            if (el.open && !chrome.beforeFilterMenuOpen(columnId, 'custom', 'pointer')) {
              el.open = false;
              return;
            }
            setCustom(el.open);
            if (el.open) chrome.filterMenuOpened(columnId, 'custom', 'pointer');
          }}
        >
          <summary>{text('filter')}…</summary>
          {conditions}
        </details>
      ) : ui === 'menu' ? (
        conditions
      ) : null}
      <div className="salmon-data-grid-dialog__actions">
        <button type="button" className="salmon-data-grid-button salmon-data-grid-button--primary" disabled={!canApply} onClick={() => apply()}>
          {text('ok')}
        </button>
        <button type="button" className="salmon-data-grid-button" onClick={clear}>
          {text('clear')}
        </button>
        <button type="button" className="salmon-data-grid-button" onClick={() => chrome.close()}>
          {text('cancel')}
        </button>
      </div>
    </DataGridPopover>
  );
}

/** Operator select plus the typed value editor(s): number, date, datetime, boolean, text; two inputs for `between`. */
function ConditionEditor(props: {
  column: CompiledColumn<unknown>;
  operators: readonly string[];
  draft: ConditionDraft;
  onChange: (draft: ConditionDraft) => void;
  text: DataGridInstance<unknown>['interaction']['text'];
  selectRef: React.RefObject<HTMLSelectElement | null> | null;
  template: ReactNode;
  index: number;
}) {
  const { column, text, draft, onChange } = props;
  const bool = valueTypeOf(column) === 'boolean';
  const type = inputTypeOf(column);
  const suffix = props.index === 0 ? '' : ' 2';
  const editorProps = filterEditorProps(column);
  const input = (value: string, label: string, set: (v: string) => void) => (
    <input aria-label={label} type={type} step={type === 'number' ? 'any' : undefined} value={value} onChange={(e) => set(e.target.value)} {...editorProps} className={editorClassName('salmon-data-grid-input', editorProps)} />
  );
  return (
    <div className="salmon-data-grid-filter-menu__condition" data-index={props.index}>
      <select ref={props.selectRef ?? undefined} className="salmon-data-grid-input" aria-label={`${text('filterOperator')}${suffix}`} value={draft.operator} onChange={(e) => onChange({ ...draft, operator: e.target.value })}>
        {props.operators.map((op) => (
          <option key={op} value={op}>
            {operatorLabel(text, op)}
          </option>
        ))}
      </select>
      {NO_VALUE_OPERATORS.has(draft.operator) ? null : props.template ? (
        <div className="salmon-data-grid-filter-menu__template">{props.template}</div>
      ) : bool ? (
        <select aria-label={`${text('filterValue')}${suffix}`} value={draft.text || 'true'} onChange={(e) => onChange({ ...draft, text: e.target.value })} {...editorProps} className={editorClassName('salmon-data-grid-input', editorProps)}>
          <option value="true">{text('true')}</option>
          <option value="false">{text('false')}</option>
        </select>
      ) : draft.operator === 'between' ? (
        <div className="salmon-data-grid-filter-menu__range">
          {input(draft.text, `${text('filterFrom')}${suffix}`, (v) => onChange({ ...draft, text: v }))}
          {input(draft.text2, `${text('filterTo')}${suffix}`, (v) => onChange({ ...draft, text2: v }))}
        </div>
      ) : (
        input(draft.text, `${text('filterValue')}${suffix}`, (v) => onChange({ ...draft, text: v }))
      )}
    </div>
  );
}

/**
 * Virtualized checklist: `role="listbox"` with
 * `aria-activedescendant`, only the rows in view (plus overscan) mounted, so
 * opening on 100k distinct values and filtering it per keystroke stay cheap.
 * `values` is the loaded prefix of `total` values; reaching its end (scroll
 * or keys) asks for the next page (`onLoadMore`).
 */
function FacetList(props: {
  id: string;
  values: readonly FacetValue[];
  total: number;
  /** A new key (search text) scrolls back to the top; loading more pages keeps the position. */
  resetKey: string;
  draft: Draft;
  blankLabel: string;
  emptyLabel: string;
  label: string;
  onToggle: (value: FacetValue) => void;
  onLoadMore: (() => void) | undefined;
}) {
  const { values, draft, id, onLoadMore } = props;
  const listRef = useRef<HTMLDivElement | null>(null);
  const [start, setStart] = useState(0);
  const [active, setActive] = useState(0);
  const count = values.length;
  const visible = Math.ceil(LIST_HEIGHT / ITEM_HEIGHT);
  const first = Math.max(0, Math.min(start, Math.max(0, count - visible)) - OVERSCAN);
  const last = Math.min(count, first + visible + OVERSCAN * 2);
  const activeIndex = Math.min(active, Math.max(0, count - 1));

  useLayoutEffect(() => {
    // A new value set (search) starts at the top.
    const el = listRef.current;
    if (el) el.scrollTop = 0;
    setStart(0);
    setActive(0);
  }, [props.resetKey]);

  // The next page loads while its rows are still an overscan away.
  const nearEnd = (index: number): void => {
    if (onLoadMore && index + visible + OVERSCAN >= count) onLoadMore();
  };
  const onScroll = (): void => {
    const el = listRef.current;
    if (!el) return;
    const next = Math.floor(el.scrollTop / ITEM_HEIGHT);
    nearEnd(next);
    // Re-render only when the mounted window moves by a few rows.
    if (Math.abs(next - start) >= 2 || next === 0) setStart(next);
  };
  const reveal = (index: number): void => {
    const el = listRef.current;
    if (!el) return;
    const top = index * ITEM_HEIGHT;
    if (top < el.scrollTop) el.scrollTop = top;
    else if (top + ITEM_HEIGHT > el.scrollTop + LIST_HEIGHT) el.scrollTop = top + ITEM_HEIGHT - LIST_HEIGHT;
    setStart(Math.floor(el.scrollTop / ITEM_HEIGHT));
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    let next = activeIndex;
    switch (event.key) {
      case 'ArrowDown':
        next = Math.min(count - 1, activeIndex + 1);
        break;
      case 'ArrowUp':
        next = Math.max(0, activeIndex - 1);
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = count - 1;
        break;
      case 'PageDown':
        next = Math.min(count - 1, activeIndex + visible);
        break;
      case 'PageUp':
        next = Math.max(0, activeIndex - visible);
        break;
      case ' ': {
        const v = values[activeIndex];
        if (v) props.onToggle(v);
        event.preventDefault();
        return;
      }
      default:
        return;
    }
    event.preventDefault();
    setActive(next);
    reveal(next);
    nearEnd(next);
  };
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i++) {
    const v = values[i] as FacetValue;
    rows.push(<FacetOption key={v.key} id={`${id}-o${i}`} index={i} total={props.total} value={v} checked={isChecked(draft, v)} active={i === activeIndex} blankLabel={props.blankLabel} onToggle={props.onToggle} onActivate={setActive} />);
  }
  return (
    <div
      ref={listRef}
      className="salmon-data-grid-facet-list"
      role="listbox"
      aria-multiselectable="true"
      aria-label={props.label}
      aria-activedescendant={count ? `${id}-o${activeIndex}` : undefined}
      tabIndex={0}
      style={{ height: LIST_HEIGHT }}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      data-count={count}
      data-total={props.total}
    >
      {count === 0 ? (
        <div className="salmon-data-grid-facet-list__empty" role="presentation">
          {props.emptyLabel}
        </div>
      ) : (
        <div className="salmon-data-grid-facet-list__sizer" role="presentation" style={{ height: count * ITEM_HEIGHT }}>
          <div role="presentation" style={{ transform: `translateY(${first * ITEM_HEIGHT}px)` }}>
            {rows}
          </div>
        </div>
      )}
    </div>
  );
}

const FacetOption = memo(function FacetOption(props: {
  id: string;
  index: number;
  total: number;
  value: FacetValue;
  checked: boolean;
  active: boolean;
  blankLabel: string;
  onToggle: (value: FacetValue) => void;
  onActivate: (index: number) => void;
}) {
  const v = props.value;
  return (
    <div
      id={props.id}
      role="option"
      aria-selected={props.checked}
      aria-setsize={props.total}
      aria-posinset={props.index + 1}
      className="salmon-data-grid-facet-list__option"
      data-active={props.active ? '' : undefined}
      onClick={() => {
        props.onActivate(props.index);
        props.onToggle(v);
      }}
    >
      <span className="salmon-data-grid-checkbox" aria-hidden="true" data-checked={props.checked ? '' : undefined} />
      <span className="salmon-data-grid-facet-list__label">{v.blank ? props.blankLabel : v.label}</span>
      <span className="salmon-data-grid-facet-list__count">{v.count}</span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Column chooser
// ---------------------------------------------------------------------------

interface ChooserNode {
  readonly column: CompiledColumn<unknown>;
  readonly depth: number;
  readonly leaves: readonly ColumnId[];
  readonly search: string;
}

/** Lowercased search text; accents folded (NFD without combining marks) with `ignoreAccents`. */
function foldText(text: string, ignoreAccents: boolean): string {
  const t = text.toLowerCase();
  return ignoreAccents ? t.normalize('NFD').replace(/\p{M}/gu, '') : t;
}

function matches(text: string, query: string, operator: NonNullable<DataGridColumnChooser['searchOperator']>, ignoreAccents: boolean): boolean {
  if (!query) return true;
  const t = foldText(text, ignoreAccents);
  const q = foldText(query, ignoreAccents);
  switch (operator) {
    case 'startsWith':
      return t.startsWith(q);
    case 'endsWith':
      return t.endsWith(q);
    case 'equal':
      return t === q;
    default:
      return t.includes(q);
  }
}

function ColumnChooser({ instance, anchor, container }: { instance: DataGridInstance<unknown>; anchor: AnchorRect; container: Element }) {
  const chrome = instance.chrome;
  const engine = instance.engine;
  const text = useDataGridText();
  const settings: DataGridColumnChooser<unknown> = typeof instance.props.columnChooser === 'object' ? instance.props.columnChooser : {};
  const operator = settings.searchOperator ?? 'contains';
  const immediate = settings.mode === 'immediate';
  const searchable = settings.searchable !== false;
  const ignoreAccents = settings.ignoreAccents === true;
  const delay = Math.max(0, settings.debounce ?? 0);
  const columns = useEngineSelector(instance, (s) => s.columns);
  // Tree nodes: groups list their chooser leaves; leaves are in definition order.
  const nodes = useMemo(() => {
    const out: ChooserNode[] = [];
    const leavesOf = (col: CompiledColumn<unknown>): ColumnId[] => {
      if (col.leaf) return col.flags.showInColumnChooser && !instance.interaction.isSelectionColumn(col) ? [col.columnId] : [];
      return col.children.flatMap((c) => {
        const child = columns.byId.get(c);
        return child ? leavesOf(child) : [];
      });
    };
    for (const col of columns.tree) {
      const leaves = leavesOf(col);
      if (leaves.length) out.push({ column: col, depth: col.depth, leaves, search: col.headerText });
    }
    return out;
  }, [columns, instance]);
  const leafIds = useMemo(() => nodes.filter((n) => n.column.leaf).map((n) => n.column.columnId), [nodes]);
  const [draft, setDraft] = useState<Readonly<Record<ColumnId, boolean>>>(() => {
    const out: Record<ColumnId, boolean> = {};
    const live = engine.getModuleState<ColumnsState>('columns') as ColumnsState;
    for (const id of leafIds) out[id] = isColumnVisible(columns.byId.get(id) as CompiledColumn<unknown>, live);
    return out;
  });
  // `input` is the search box text; `query` the text the list is filtered by (after `debounce`).
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    (searchRef.current ?? listRef.current?.querySelector<HTMLElement>('input'))?.focus({ preventScroll: true });
  }, []);
  useEffect(
    () => () => {
      if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    },
    [],
  );
  const search = (value: string, now = false): void => {
    setInput(value);
    if (searchTimer.current !== null) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    if (now || delay === 0) setQuery(value);
    else searchTimer.current = setTimeout(() => setQuery(value), delay);
  };

  // A node shows when it or any descendant leaf matches; groups show when a leaf under them matches.
  const shown = useMemo(() => {
    const set = new Set<ColumnId>();
    if (!query) return null;
    for (const n of nodes) {
      if (!n.column.leaf) continue;
      if (matches(n.search, query, operator, ignoreAccents)) {
        set.add(n.column.columnId);
        for (const p of n.column.path) set.add(p);
      }
    }
    for (const n of nodes) if (!n.column.leaf && matches(n.search, query, operator, ignoreAccents)) for (const id of n.leaves) set.add(id), set.add(n.column.columnId);
    return set;
  }, [nodes, query, operator, ignoreAccents]);

  const commit = (next: Readonly<Record<ColumnId, boolean>>): void => {
    const changes: Record<ColumnId, boolean> = {};
    let any = false;
    for (const id of leafIds) {
      const col = columns.byId.get(id) as CompiledColumn<unknown>;
      const now = isColumnVisible(col, engine.getModuleState<ColumnsState>('columns') as ColumnsState);
      if ((next[id] ?? now) !== now) {
        changes[id] = next[id] as boolean;
        any = true;
      }
    }
    if (any) {
      instance.dispatchFrom('pointer', { type: 'columns.setVisibility', visibility: changes });
      const total = leafIds.length;
      const visible = leafIds.filter((id) => next[id]).length;
      instance.interaction.announce(text('columnsShown', { shown: visible, total: total }));
    }
  };
  const touched = useRef(false);
  // Stable for the memoized rows: a search keystroke re-renders only rows whose `hidden` flips.
  const update = useCallback((ids: readonly ColumnId[], value: boolean): void => {
    touched.current = true;
    setDraft((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = value;
      // At least one column stays visible.
      return Object.values(next).some(Boolean) ? next : prev;
    });
  }, []);
  useEffect(() => {
    if (immediate && touched.current) {
      touched.current = false;
      commit(draft);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, immediate]);
  const visibleLeaves = shown ? leafIds.filter((id) => shown.has(id)) : leafIds;
  const checkedVisible = visibleLeaves.filter((id) => draft[id]).length;
  const allState = checkedVisible === 0 ? false : checkedVisible === visibleLeaves.length ? true : 'mixed';
  const anyChecked = leafIds.some((id) => draft[id]);
  const apply = (): void => {
    commit(draft);
    chrome.close();
  };

  const body: ReactNode = (
    <>
      {searchable ? (
        <input
          ref={searchRef}
          type="search"
          className="salmon-data-grid-input salmon-data-grid-column-chooser__search"
          aria-label={text('searchColumns')}
          placeholder={text('searchColumns')}
          value={input}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') search(e.currentTarget.value, true);
          }}
        />
      ) : null}
      <label className="salmon-data-grid-column-chooser__all">
        <input
          type="checkbox"
          className="salmon-data-grid-check"
          checked={allState === true}
          ref={(el) => {
            if (el) el.indeterminate = allState === 'mixed';
          }}
          onChange={() => update(visibleLeaves, allState !== true)}
        />
        {text('selectAll')}
      </label>
      <div className="salmon-data-grid-column-chooser__list" role="group" aria-label={text('chooseColumns')} ref={listRef}>
        {nodes.map((n) => (
          <ChooserRow
            key={n.column.columnId}
            node={n}
            hidden={shown !== null && !shown.has(n.column.columnId)}
            state={n.column.leaf ? (draft[n.column.columnId] ?? false) : groupState(n.leaves, draft)}
            onChange={update}
          />
        ))}
        {visibleLeaves.length === 0 ? <p className="salmon-data-grid-column-chooser__empty">{text('noMatches')}</p> : null}
      </div>
    </>
  );
  const footer: ReactNode = immediate ? null : (
    <div className="salmon-data-grid-dialog__actions">
      <button type="button" className="salmon-data-grid-button salmon-data-grid-button--primary" disabled={!anyChecked} onClick={apply}>
        {text('ok')}
      </button>
      <button type="button" className="salmon-data-grid-button" onClick={() => chrome.close()}>
        {text('cancel')}
      </button>
    </div>
  );
  // The render context is built only when a render prop is set.
  const { renderChooser, renderHeader, renderFooter } = settings;
  const context = (defaultContent: ReactNode): DataGridColumnChooserContext<unknown> => ({
    columns: leafIds.map((id) => {
      const column = columns.byId.get(id) as CompiledColumn<unknown>;
      return { field: id, header: column.headerText, hidden: draft[id] !== true, matches: shown === null || shown.has(id), column: columnInfo(column) };
    }),
    searchText: query,
    setSearchText: (value) => search(value, true),
    setHidden: (fields, hidden) => update(typeof fields === 'string' ? [fields] : fields, !hidden),
    apply,
    close: () => chrome.close(),
    defaultContent,
  });
  return (
    <DataGridPopover
      anchor={anchor}
      container={container}
      rtl={instance.rtl}
      role="dialog"
      label={text('chooseColumns')}
      className="salmon-data-grid-column-chooser"
      onDismiss={(reason) => chrome.close(reason !== 'outside')}
    >
      {renderHeader ? <div className="salmon-data-grid-column-chooser__header">{renderHeader(context(null))}</div> : null}
      {renderChooser ? <div className="salmon-data-grid-column-chooser__custom">{renderChooser(context(body))}</div> : body}
      {renderFooter ? <div className="salmon-data-grid-column-chooser__footer">{renderFooter(context(footer))}</div> : footer}
    </DataGridPopover>
  );
}

function groupState(leaves: readonly ColumnId[], draft: Readonly<Record<ColumnId, boolean>>): boolean | 'mixed' {
  let on = 0;
  for (const id of leaves) if (draft[id]) on++;
  return on === 0 ? false : on === leaves.length ? true : 'mixed';
}

const ChooserRow = memo(function ChooserRow(props: { node: ChooserNode; hidden: boolean; state: boolean | 'mixed'; onChange: (ids: readonly ColumnId[], value: boolean) => void }) {
  const { node, state } = props;
  return (
    <label className="salmon-data-grid-column-chooser__item" hidden={props.hidden} style={{ paddingInlineStart: node.depth * 16 + 4 }} data-column-id={node.column.columnId} data-group={node.column.leaf ? undefined : ''}>
      <input
        type="checkbox"
        className="salmon-data-grid-check"
        checked={state === true}
        ref={(el) => {
          if (el) el.indeterminate = state === 'mixed';
        }}
        onChange={() => props.onChange(node.leaves, state !== true)}
      />
      {node.column.headerText}
    </label>
  );
});

export type { DataGridMenuItem };
// Touch multi-sort popup, rendered by `DataGridOverlays` next to the open overlay.
export { TouchSortPopup } from './touch-sort-popup.js';

/** Chunking hub: keeps the static graph in one chunk. Never called. */
export { DataGrid as hub } from './DataGrid.js';
