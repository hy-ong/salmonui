'use client';

// The filter builder dialog: edits the nested AND/OR groups of the
// applied filters (`filtering.filters`) as one tree of groups and
// conditions, and applies them with one `filter.set` (reported through
// `onBeforeFilterChange` / `onFilterChange` with `ui: 'builder'`). The draft
// is local to the open dialog and discarded on close. The tree editor is the
// internal QueryTree shared with QueryBuilder; this module adds the
// dialog frame, the native field / operator / value editors and apply.
//
// A lazy chunk of its own: the overlay
// chunk (overlays.tsx) loads it when the dialog opens, and preloads it after
// mount for grids with `filtering.builder`. It never renders on the server.

import type { CompiledColumn } from '@salmonui/data-grid/engine';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { editDraft, idSource, newDraftRule, ruleOperators, type FieldInfoOf, type TreeGroup } from '@salmonui/core/internal/query/model';
import { clickSource, QueryTree, type QueryTreeHost } from '@salmonui/core/internal/query/tree';
import { builderCommand, builderFilters, builderTree, columnInfo } from './filter-builder-model.js';
import type { DataGridInstance } from './instance.js';
// Shared code comes through the overlay chunk only (see overlays.tsx).
import { filteringOf, DataGridPopover, gridFilters, inputTypeOf, NO_VALUE_OPERATORS, operatorLabel } from './overlays.js';
import type { AnchorRect } from './popover.js';

const CLS = 'salmon-data-grid-filter-builder';

export function FilterBuilderDialog({ instance, anchor, container }: { instance: DataGridInstance<unknown>; anchor: AnchorRect; container: Element }) {
  const chrome = instance.chrome;
  const engine = instance.engine;
  const text = instance.interaction.text;
  const settings = filteringOf(instance.props);
  const builder = settings?.builder;
  const includeHidden = typeof builder === 'object' && builder.includeHidden === true;
  const infoOf: FieldInfoOf = (field) => {
    const column = chrome.column(field);
    return column && columnInfo(column, settings);
  };
  // Fields offered for a new condition: filterable leaves (visible ones unless `includeHidden`).
  const fields = useMemo(() => {
    const columns = engine.getSnapshot().columns;
    const visible = new Set(columns.visible.map((c) => c.columnId));
    return columns.leaves.filter((c) => chrome.filterable(c as CompiledColumn<unknown>) && (includeHidden || visible.has(c.columnId))) as CompiledColumn<unknown>[];
  }, [engine, chrome, includeHidden]);
  const [nextId] = useState(idSource);
  const [root, setRoot] = useState<TreeGroup>(() => {
    const filters = engine.getModuleState<{ filters: readonly never[] }>('filter')?.filters ?? [];
    return builderTree(gridFilters(filters), infoOf, nextId);
  });
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(() => new Set());
  // Element focused after the next render, by the tree: the first invalid value after
  // apply, the add button after clear. The first control is focused on open (below).
  const focusNext = useRef<string | null>(null);
  // The first control on open. Here, not in a child: child layout effects run before
  // DataGridPopover places the box, while it is still `visibility: hidden` and so not
  // focusable (StrictMode's effect replay used to hide that in development).
  const popup = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    popup.current?.querySelector<HTMLElement>('select, input, button')?.focus({ preventScroll: true });
  }, []);

  const host = useMemo<QueryTreeHost>(() => {
    const field0 = fields[0]?.columnId;
    const rule = () => (field0 === undefined ? null : newDraftRule(field0, infoOf(field0), nextId()));
    return {
      cls: CLS,
      text,
      groupLabel: (_g, isRoot) => text(isRoot ? 'filterBuilder' : 'filterGroup'),
      not: true,
      maxDepth: Infinity,
      newRule: rule,
      newGroup: () => {
        const first = rule();
        return { id: nextId(), logic: 'and', filters: first ? [first] : [] };
      },
      onChange: (fn) => setRoot(fn),
      renderButton: ({ action, label, onClick, disabled }) => (
        <button type="button" className="salmon-data-grid-button" data-action={action} disabled={disabled || (action === 'addCondition' && field0 === undefined)} onClick={onClick}>
          {label}
        </button>
      ),
      renderRule: ({ rule: r, edit, remove }) => {
        const column = chrome.column(r.field);
        const info = infoOf(r.field);
        const bad = invalid.has(r.id) ? true : undefined;
        const set = (patch: Parameters<typeof editDraft>[1]): void => {
          edit((n) => editDraft(n, patch, infoOf));
          if (bad) {
            const next = new Set(invalid);
            next.delete(r.id);
            setInvalid(next);
          }
        };
        // A condition on a column the field list does not offer (hidden, not filterable) keeps it as its own option.
        const list = column && !fields.includes(column) ? [column, ...fields] : fields;
        const type = column && r.operator !== 'in' && r.operator !== 'notIn' ? inputTypeOf(column) : 'text';
        const input = (key: 'text' | 'text2', label: string) => (
          <input className="salmon-data-grid-input" aria-label={label} aria-invalid={bad} type={type} step={type === 'number' ? 'any' : undefined} value={r[key] ?? ''} onChange={(e) => set({ [key]: e.target.value })} />
        );
        return (
          <div className="salmon-data-grid-filter-builder__rule" data-node-id={r.id}>
            <select className="salmon-data-grid-input" aria-label={text('filterField')} value={r.field} onChange={(e) => set({ field: e.target.value })}>
              {column ? null : <option value={r.field}>{r.field}</option>}
              {list.map((c) => (
                <option key={c.columnId} value={c.columnId}>
                  {c.headerText}
                </option>
              ))}
            </select>
            <select className="salmon-data-grid-input" aria-label={text('filterOperator')} value={r.operator} onChange={(e) => set({ operator: e.target.value })}>
              {ruleOperators(r, info).map((op) => (
                <option key={op} value={op}>
                  {operatorLabel(text, op)}
                </option>
              ))}
            </select>
            {NO_VALUE_OPERATORS.has(r.operator) ? null : info?.type === 'boolean' ? (
              <select className="salmon-data-grid-input" aria-label={text('filterValue')} value={r.text || 'true'} onChange={(e) => set({ text: e.target.value })}>
                <option value="true">{text('true')}</option>
                <option value="false">{text('false')}</option>
              </select>
            ) : r.operator === 'between' ? (
              <>
                {input('text', text('filterFrom'))}
                {input('text2', text('filterTo'))}
              </>
            ) : (
              input('text', text('filterValue'))
            )}
            <button type="button" className="salmon-data-grid-button" data-action="removeCondition" title={text('removeCondition')} onClick={remove}>
              <span className="salmon-data-grid-visually-hidden">{text('removeCondition')}</span>
            </button>
          </div>
        );
      },
    };
  }, [fields, invalid, nextId, chrome, text, settings]);

  const apply = (source: 'pointer' | 'keyboard'): void => {
    const result = builderFilters(root, infoOf);
    if (result.invalid.length) {
      setInvalid(new Set(result.invalid));
      focusNext.current = `[data-node-id="${result.invalid[0]}"] [aria-invalid="true"]`;
      return;
    }
    const outcome = instance.dispatchFrom(source, builderCommand(result.filters));
    // A cancelled change (onBeforeFilterChange) keeps the dialog open with the draft.
    if (outcome.status !== 'rejected') chrome.close(true, source);
  };
  const clear = (): void => {
    focusNext.current = '[data-action="addCondition"]';
    setInvalid(new Set());
    setRoot((r) => ({ id: r.id, logic: 'and', filters: [] }));
  };

  return (
    <DataGridPopover
      anchor={anchor}
      container={container}
      rtl={instance.rtl}
      role="dialog"
      label={text('filterBuilder')}
      className={CLS}
      elementRef={popup}
      onDismiss={(reason) => chrome.close(reason !== 'outside', reason === 'outside' ? 'pointer' : 'keyboard')}
    >
      <QueryTree root={root} host={host} focus={focusNext} />
      <div className="salmon-data-grid-dialog__actions">
        <button type="button" className="salmon-data-grid-button salmon-data-grid-button--primary" onClick={(e) => apply(clickSource(e))}>
          {text('ok')}
        </button>
        <button type="button" className="salmon-data-grid-button" onClick={clear}>
          {text('clear')}
        </button>
        <button type="button" className="salmon-data-grid-button" onClick={(e) => chrome.close(true, clickSource(e))}>
          {text('cancel')}
        </button>
      </div>
    </DataGridPopover>
  );
}
