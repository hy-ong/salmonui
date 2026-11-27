'use client';

// PivotAxisBar: one
// `toolbar` per axis with a field button per field. A button opens the field
// menu (sort, filter, aggregation, "Move to", remove); buttons drag between
// axes; Alt+ArrowUp / ArrowDown reorders and Delete removes. Static markup
// renders on the server; menus load on first open.

import { useMemo, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { PivotAggregate, PivotFieldInfo, PivotModel } from '@salmonui/pivot-table/engine';
import type { PivotController } from './controller.js';
import { dropTargetProps, itemCaption, useFieldItem, type FieldItemOptions } from './field-item.js';
import { createText, type PivotLocaleText, type PivotText } from './locale.js';
import { axisItems, axisOf, captionOf, VALUES_FIELD } from './model-ops.js';
import type { PivotAxis, PivotAxisBarOptions } from './types.js';
import { usePivotState } from './usePivot.js';

export interface PivotAxisBarProps<Row = unknown> extends PivotAxisBarOptions {
  readonly pivot: PivotController<Row>;
  readonly aggregateOptions?: readonly PivotAggregate[] | undefined;
  readonly localeText?: PivotLocaleText | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

const ALL_AXES: readonly PivotAxis[] = ['filters', 'columns', 'rows', 'values'];

/** Roving focus between the buttons of one toolbar (ArrowLeft / ArrowRight, Home, End). */
export function rovingKeyDown(event: KeyboardEvent<HTMLElement>, vertical = false): void {
  if (event.altKey) return;
  const next = vertical ? 'ArrowDown' : 'ArrowRight';
  const prev = vertical ? 'ArrowUp' : 'ArrowLeft';
  const rtl = !vertical && getComputedStyle(event.currentTarget).direction === 'rtl';
  const key = rtl ? (event.key === 'ArrowLeft' ? 'ArrowRight' : event.key === 'ArrowRight' ? 'ArrowLeft' : event.key) : event.key;
  if (key !== next && key !== prev && key !== 'Home' && key !== 'End') return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-pivot-field]')];
  if (!items.length) return;
  const i = items.indexOf(event.target as HTMLElement);
  const j = key === 'Home' ? 0 : key === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (key === next ? 1 : -1)));
  event.preventDefault();
  for (const [k, el] of items.entries()) el.tabIndex = k === j ? 0 : -1;
  items[j]?.focus();
}

function AxisChip({ field, axis, index, model, fields, options }: { field: string; axis: PivotAxis | null; index: number; model: PivotModel; fields: readonly PivotFieldInfo[]; options: FieldItemOptions }) {
  const item = useFieldItem(field, axis, options);
  const { text } = options;
  const caption = itemCaption(model, field, axis, captionOf(model, field, fields), text);
  const sort = model.sort[field];
  const filtered = model.filterBy[field] !== undefined;
  return (
    <>
      <button
        type="button"
        ref={item.triggerRef as never}
        id={item.labelId}
        className="salmon-pivot-table-chip"
        data-pivot-field={field}
        data-axis={axis ?? undefined}
        data-filtered={filtered ? '' : undefined}
        tabIndex={index === 0 ? 0 : -1}
        aria-haspopup="menu"
        aria-expanded={item.menuOpen}
        aria-description={axis ? text('fieldMenu', { field: caption }) : undefined}
        onClick={(event) => item.openMenu(event.detail === 0 ? 'keyboard' : 'pointer')}
        onKeyDown={item.onKeyDown}
        {...item.dragProps}
      >
        <span className="salmon-pivot-table-chip-label">{caption}</span>
        {sort === 'desc' ? <span className="salmon-pivot-table-chip-icon" aria-hidden="true">↓</span> : sort === 'asc' ? <span className="salmon-pivot-table-chip-icon" aria-hidden="true">↑</span> : null}
        {filtered ? <span className="salmon-pivot-table-chip-icon" aria-hidden="true">⏷</span> : null}
        <span className="salmon-pivot-table-chip-caret" aria-hidden="true" />
      </button>
      {item.menuElement}
    </>
  );
}

function axisText(axis: PivotAxis, text: PivotText): string {
  return text(axis);
}

/** The axis bar. Bind it to the same store as the table: `<PivotAxisBar pivot={pivot} />`. */
export function PivotAxisBar<Row = unknown>(props: PivotAxisBarProps<Row>): ReactNode {
  const pivot = props.pivot as PivotController<unknown>;
  const model = usePivotState(pivot, (s) => s.model);
  const fields = usePivotState(pivot, (s) => s.fields);
  const localeText = useLocaleText('pivotTable', props.localeText);
  const text = useMemo(() => createText(localeText), [localeText]);
  const options: FieldItemOptions = {
    pivot,
    text,
    draft: false,
    aggregateOptions: props.aggregateOptions,
    show: { sort: props.showSort, filter: props.showFilter, remove: props.showRemove, aggregate: props.showAggregate, drag: props.draggable },
  };
  const axes = props.axes ?? ALL_AXES;
  const unused = props.showFieldsPanel ? fields.filter((f) => !f.hidden && axisOf(model, f.field) === null) : [];
  const visible = (id: string): boolean => id === VALUES_FIELD || !fields.find((f) => f.field === id)?.hidden;
  return (
    <div className={props.className ? `salmon-pivot-table-axis-bar ${props.className}` : 'salmon-pivot-table-axis-bar'} style={props.style} data-pivot-fields="">
      {props.showFieldsPanel ? (
        <div role="toolbar" aria-label={text('fields')} className="salmon-pivot-table-axis" data-axis="fields" onKeyDown={rovingKeyDown}>
          <span className="salmon-pivot-table-axis-label" aria-hidden="true">
            {text('fields')}
          </span>
          {unused.map((f, i) => (
            <AxisChip key={f.field} field={f.field} axis={null} index={i} model={model} fields={fields} options={options} />
          ))}
        </div>
      ) : null}
      {axes.map((axis) => {
        const items = axisItems(model, axis).filter(visible);
        return (
          <div key={axis} role="toolbar" aria-label={axisText(axis, text)} className="salmon-pivot-table-axis" data-axis={axis} onKeyDown={rovingKeyDown} {...dropTargetProps(axis, pivot, false)}>
            <span className="salmon-pivot-table-axis-label" aria-hidden="true">
              {axisText(axis, text)}
            </span>
            {items.length ? (
              items.map((field, i) => <AxisChip key={field} field={field} axis={axis} index={i} model={model} fields={fields} options={options} />)
            ) : (
              <span className="salmon-pivot-table-axis-empty">{text('dropHere')}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
