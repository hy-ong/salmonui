'use client';

// Filter row: one
// `role="gridcell"` per rendered leaf in the header rowgroup. Inputs are
// uncontrolled, so typing never re-renders React; the applied condition is
// read from the engine query per cell (a primitive selector) and written
// back into the input only when it changed elsewhere (menu, API, clear).

import { getColumnFilters, type CompiledColumn, type DataGridSnapshot, type Json } from '@salmonui/data-grid/engine';
import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { columnWidthStyle } from './Cell.js';
import { centerZone } from './fixed-zone.js';
import { columnInfo } from './column-info.js';
import { useEngineSelector, useDataGridInstance, useDataGridRender, useDataGridText } from './context.js';
import { barOperatorFor, barPrefixOf, conditionsCommand, editorClassName, filterEditorProps, filterSource, formatFilterValue, inputTypeOf, NO_VALUE_OPERATORS, operatorLabel, operatorsFor, parseBarExpression, valueTypeOf } from './filter-ui.js';
import { DEFAULT_FILTER_DEBOUNCE, filteringOf } from './query-config.js';
import type { ColumnView } from './layout.js';
import type { DataGridFilterContext, DataGridQueryColumn } from './query-types.js';

const SEP = '\u0000';

/** `operator\0json` of the column's single top-level condition (not a checklist `in`), or ''. */
function barKey<Row>(snapshot: DataGridSnapshot<Row>, columnId: string): string {
  const own = getColumnFilters(snapshot.query.filters, columnId);
  if (own.length !== 1) return '';
  const f = own[0]!;
  if (f.operator === 'in' || f.operator === 'notIn') return '';
  return `${f.operator}${SEP}${JSON.stringify(f.value ?? null)}`;
}

/**
 * Cell text of an applied condition. Without the operator dropdown the text
 * carries the operator prefix (`>=50`), so pressing Enter on it re-applies
 * the same condition; with the dropdown the select shows the operator.
 */
function textOf(column: CompiledColumn<unknown>, operator: string, value: Json, prefix: string | null): string {
  if (NO_VALUE_OPERATORS.has(operator)) return '';
  if (operator === 'between' && Array.isArray(value)) return `${formatFilterValue(column, value[0] as Json)}..${formatFilterValue(column, value[1] as Json)}`;
  const text = formatFilterValue(column, value);
  return prefix === null ? text : `${prefix}${text}`;
}

function FilterBarCellImpl({ column, colIndex }: { column: CompiledColumn<unknown>; colIndex: number; renderKey?: number | undefined }) {
  const instance = useDataGridInstance<unknown>();
  const engine = instance.engine;
  const columnId = column.columnId;
  // Render-time props (instance.props is synced after the render).
  const settings = filteringOf(useDataGridRender<unknown>());
  const showOperator = settings?.showOperators === true;
  // Applies on Enter by default; `trigger: 'input'` applies while typing after `debounce` (1500 ms).
  const onEnter = settings?.trigger !== 'input';
  const delay = settings?.debounce ?? DEFAULT_FILTER_DEBOUNCE;
  const text = useDataGridText();
  const enabled = instance.chrome.filterable(column as never, useDataGridRender<unknown>());
  const operators = operatorsFor(column, settings);
  const key = useEngineSelector(instance, (s) => barKey(s, columnId));
  const at = key.indexOf(SEP);
  const appliedOperator = at < 0 ? null : key.slice(0, at);
  const appliedValue: Json = at < 0 ? null : (JSON.parse(key.slice(at + 1)) as Json);
  const [draftOperator, setDraftOperator] = useState<string>(() => appliedOperator ?? barOperatorFor(column, settings));
  const operator = showOperator ? draftOperator : barOperatorFor(column, settings);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Key of the condition this cell last applied; any other applied key came from elsewhere and is shown. */
  const own = useRef<string | null>(null);
  /** Text written for a condition applied elsewhere; Enter on it unchanged keeps that condition (operators without a prefix). */
  const shown = useRef<string | null>(null);
  const appliedText = (): string =>
    appliedOperator === null ? '' : textOf(column, appliedOperator, appliedValue, showOperator ? null : barPrefixOf(column, appliedOperator, appliedValue, barOperatorFor(column, settings)));

  useLayoutEffect(() => {
    const input = inputRef.current;
    const next = appliedText();
    const mine = own.current === key;
    own.current = null;
    if (mine) return;
    shown.current = appliedOperator === null ? null : next;
    // The applied condition changed elsewhere (menu, API, clear): the row shows it, even while focused.
    if (input && input.value !== next) input.value = next;
    if (showOperator && appliedOperator !== null && appliedOperator !== draftOperator && operators.includes(appliedOperator)) setDraftOperator(appliedOperator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useLayoutEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  const dispatch = (condition: { operator: string; value: Json } | null): void => {
    const filters = engine.getSnapshot().query.filters;
    const conditions = condition ? [condition] : [];
    if (!condition && getColumnFilters(filters, columnId).length === 0) return;
    instance.dispatchFrom('keyboard', conditionsCommand(filters, columnId, conditions, 'and', filterSource('row')));
  };
  const apply = (raw: string, op = operator): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    const input = inputRef.current;
    if (shown.current !== null && raw === shown.current && (!showOperator || op === appliedOperator)) {
      // The shown text of a condition applied elsewhere, unchanged: keep that condition.
      input?.removeAttribute('aria-invalid');
      return;
    }
    shown.current = null;
    const parsed = parseBarExpression(column, raw, op, !showOperator);
    if (parsed === 'invalid') {
      input?.setAttribute('aria-invalid', 'true');
      return;
    }
    input?.removeAttribute('aria-invalid');
    own.current = parsed ? `${parsed.operator}${SEP}${JSON.stringify(parsed.value ?? null)}` : '';
    dispatch(parsed);
  };
  const onInput = (raw: string): void => {
    if (onEnter) return;
    if (delay <= 0) {
      apply(raw);
      return;
    }
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => apply(raw), delay);
  };
  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      apply(event.currentTarget.value);
    } else if (event.key === 'Escape' && event.currentTarget.value !== '') {
      event.preventDefault();
      event.currentTarget.value = '';
      apply('');
    }
  };

  let content: ReactNode = null;
  const def = column.def as DataGridQueryColumn<unknown>;
  if (enabled && def.renderFilterCell) {
    const ctx: DataGridFilterContext<unknown> = {
      column: columnInfo(column),
      field: columnId,
      editorProps: filterEditorProps(column),
      operators,
      operator: appliedOperator ?? operator,
      value: appliedValue,
      setOperator: (op) => setDraftOperator(op),
      setValue: (value) => dispatch(value === null || value === '' ? null : { operator, value }),
      apply: (value) => dispatch(value === undefined || value === null || value === '' ? null : { operator, value }),
      clear: () => dispatch(null),
    };
    content = def.renderFilterCell(ctx);
  } else if (enabled) {
    const bool = valueTypeOf(column) === 'boolean';
    const editorProps = filterEditorProps(column);
    content = (
      <>
        {showOperator ? (
          <select
            className="salmon-data-grid-input salmon-data-grid-filter-bar__operator"
            aria-label={text('filterBarOperator', { column: column.headerText })}
            value={operator}
            onChange={(e) => {
              const op = e.target.value;
              setDraftOperator(op);
              const raw = inputRef.current?.value ?? '';
              if (raw.trim() !== '' || NO_VALUE_OPERATORS.has(op) || appliedOperator !== null) apply(raw, op);
            }}
          >
            {operators.map((op) => (
              <option key={op} value={op}>
                {operatorLabel(text, op)}
              </option>
            ))}
          </select>
        ) : null}
        <input
          // Prefix text (">=50") and the dropdown's typed value differ: switching modes remounts the input with
          // the text of the new mode (a number input would reject the prefixed text).
          key={showOperator ? 'operator' : 'prefix'}
          ref={inputRef}
          // A `between` range ("100..500") is text: a number input would reject it (applied or drafted).
          type={bool || !showOperator || operator === 'between' || appliedOperator === 'between' ? 'text' : inputTypeOf(column) === 'number' ? 'number' : 'text'}
          inputMode={valueTypeOf(column) === 'number' && !showOperator ? 'decimal' : undefined}
          aria-label={text('filterBarInput', { column: column.headerText })}
          disabled={showOperator && NO_VALUE_OPERATORS.has(operator)}
          defaultValue={appliedText()}
          onInput={(e) => onInput((e.target as HTMLInputElement).value)}
          onKeyDown={onKeyDown}
          {...editorProps}
          className={editorClassName('salmon-data-grid-input salmon-data-grid-filter-bar__input', editorProps)}
        />
      </>
    );
  }
  return (
    <div role="gridcell" aria-colindex={colIndex} className="salmon-data-grid-filter-bar__cell" style={columnWidthStyle(column)} data-column-id={columnId} data-filtered={appliedOperator !== null ? '' : undefined}>
      {content}
    </div>
  );
}

const FilterBarCell = memo(FilterBarCellImpl);

/** The filter row under the header rows (`filtering.ui: 'row'`). */
function DataGridFilterBarImpl({ view, rowIndex }: { view: ColumnView<unknown>; rowIndex: number; columnRender?: number }) {
  const renderKeyOf = useDataGridInstance<unknown>().renderKeyOf;
  const cell = (column: CompiledColumn<unknown>, colIndex: number) => <FilterBarCell key={column.columnId} column={column} colIndex={colIndex} renderKey={renderKeyOf(column.columnId)} />;
  const leftCount = view.left.length;
  const centerBase = leftCount + view.centerStart + 1;
  const rightBase = leftCount + view.centerCount + 1;
  return (
    <div role="row" aria-rowindex={rowIndex} className="salmon-data-grid-header-row salmon-data-grid-filter-bar">
      {view.indent > 0 ? <div className="salmon-data-grid-indent" aria-hidden="true" /> : null}
      {leftCount > 0 ? (
        <div className="salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start">
          {view.left.map((c, i) => cell(c, i + 1))}
        </div>
      ) : null}
      {centerZone(view, view.center.map((c, j) => cell(c, centerBase + j)), view.center, cell)}
      {view.right.length > 0 ? (
        <div className="salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end">
          {view.right.map((c, k) => cell(c, rightBase + k))}
        </div>
      ) : null}
    </div>
  );
}

export const DataGridFilterBar = memo(DataGridFilterBarImpl);
