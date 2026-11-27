'use client';

// PivotFieldList: the field
// `listbox` (checked = on the report; folders as option groups; search and
// sort) and four axis `listbox`es (Rows, Columns, Values, Filters) with drag
// and drop and the keyboard alternative (Enter opens the field menu with
// "Move to", Alt+ArrowUp / ArrowDown reorders, Delete removes). Bound to the
// shared store, so a standalone list needs no manual sync. `deferUpdate`
// edits a draft model that Apply commits.

import { useLayoutEffect, useMemo, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { useLocaleText } from '@salmonui/core/internal/locale';
import type { PivotAggregate, PivotFieldInfo, PivotModel } from '@salmonui/pivot-table/engine';
import type { PivotController } from './controller.js';
import { dropTargetProps, itemCaption, useFieldItem, type FieldItemOptions } from './field-item.js';
import { createText, type PivotLocaleText } from './locale.js';
import { axisItems, axisOf, captionOf, VALUES_FIELD } from './model-ops.js';
import { rovingKeyDown } from './PivotAxisBar.js';
import type { PivotAxis } from './types.js';
import { usePivotState } from './usePivot.js';

export interface PivotFieldListProps<Row = unknown> {
  readonly pivot: PivotController<Row>;
  /** Edit a draft model and commit it with Apply. */
  readonly deferUpdate?: boolean | undefined;
  /** Field search box. Default true. */
  readonly searchable?: boolean | undefined;
  /** Order of the field list: `'none'` (definition order, default), `'asc'`, `'desc'`, or field names in order. */
  readonly fieldOrder?: 'none' | 'asc' | 'desc' | readonly string[] | undefined;
  readonly aggregateOptions?: readonly PivotAggregate[] | undefined;
  readonly localeText?: PivotLocaleText | undefined;
  /** Called after Apply or Cancel (a popup closes itself). */
  readonly onDone?: (() => void) | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly 'aria-label'?: string | undefined;
}

const AXES: readonly PivotAxis[] = ['filters', 'columns', 'rows', 'values'];

function sortFields(fields: readonly PivotFieldInfo[], order: PivotFieldListProps['fieldOrder']): PivotFieldInfo[] {
  const list = fields.filter((f) => !f.hidden);
  if (!order || order === 'none') return list;
  if (Array.isArray(order)) {
    const rank = new Map(order.map((f, i) => [f, i]));
    return list.sort((a, b) => (rank.get(a.field) ?? Infinity) - (rank.get(b.field) ?? Infinity));
  }
  const dir = order === 'desc' ? -1 : 1;
  return list.sort((a, b) => dir * a.caption.localeCompare(b.caption));
}

function FieldOption({ info, model, index, options }: { info: PivotFieldInfo; model: PivotModel; index: number; options: FieldItemOptions }) {
  const item = useFieldItem(info.field, null, options);
  const on = axisOf(model, info.field) !== null;
  const toggle = (source: 'pointer' | 'keyboard'): void => {
    const opts = { source, draft: options.draft };
    if (on) options.pivot.moveField(info.field, null, -1, opts);
    else options.pivot.moveField(info.field, info.type === 'number' ? 'values' : 'rows', -1, opts);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key === ' ') {
      event.preventDefault();
      toggle('keyboard');
      return;
    }
    item.onKeyDown(event);
  };
  return (
    <>
      <div
        role="option"
        ref={item.triggerRef as never}
        id={item.labelId}
        aria-selected={on}
        className="salmon-pivot-table-field"
        data-pivot-field={info.field}
        tabIndex={index === 0 ? 0 : -1}
        onKeyDown={onKeyDown}
        onClick={() => toggle('pointer')}
        onContextMenu={(event) => {
          event.preventDefault();
          item.openMenu('pointer');
        }}
        {...item.dragProps}
      >
        <span className="salmon-pivot-table-checkbox" aria-hidden="true" data-checked={on ? '' : undefined} />
        <span className="salmon-pivot-table-field-label">{info.caption}</span>
      </div>
      {item.menuElement}
    </>
  );
}

function AxisOption({ field, axis, index, model, fields, options }: { field: string; axis: PivotAxis; index: number; model: PivotModel; fields: readonly PivotFieldInfo[]; options: FieldItemOptions }) {
  const item = useFieldItem(field, axis, options);
  const caption = itemCaption(model, field, axis, captionOf(model, field, fields), options.text);
  return (
    <>
      <div
        role="option"
        aria-selected={false}
        ref={item.triggerRef as never}
        id={item.labelId}
        className="salmon-pivot-table-chip"
        data-pivot-field={field}
        data-axis={axis}
        data-filtered={model.filterBy[field] ? '' : undefined}
        tabIndex={index === 0 ? 0 : -1}
        aria-haspopup="menu"
        onKeyDown={item.onKeyDown}
        onClick={(event) => item.openMenu(event.detail === 0 ? 'keyboard' : 'pointer')}
        {...item.dragProps}
      >
        <span className="salmon-pivot-table-chip-label">{caption}</span>
        <span className="salmon-pivot-table-chip-caret" aria-hidden="true" />
      </div>
      {item.menuElement}
    </>
  );
}

/** The field list. Bind it to the same store as the table: `<PivotFieldList pivot={pivot} />`. */
export function PivotFieldList<Row = unknown>(props: PivotFieldListProps<Row>): ReactNode {
  const pivot = props.pivot as PivotController<unknown>;
  const applied = usePivotState(pivot, (s) => s.model);
  const draft = usePivotState(pivot, (s) => s.draft);
  const fields = usePivotState(pivot, (s) => s.fields);
  const localeText = useLocaleText('pivotTable', props.localeText);
  const text = useMemo(() => createText(localeText), [localeText]);
  const [search, setSearch] = useState('');
  const deferred = props.deferUpdate === true;
  useLayoutEffect(() => {
    if (!deferred) return;
    pivot.beginDraft();
    return () => pivot.cancelDraft();
  }, [pivot, deferred]);
  const model = deferred ? (draft ?? applied) : applied;
  const options: FieldItemOptions = { pivot, text, draft: deferred, aggregateOptions: props.aggregateOptions, show: {} };
  const query = search.trim().toLocaleLowerCase();
  const listed = sortFields(fields, props.fieldOrder).filter((f) => !query || f.caption.toLocaleLowerCase().includes(query) || f.field.toLocaleLowerCase().includes(query));
  // Folders become option groups; fields without a folder come first.
  const groups: { folder: string | null; fields: PivotFieldInfo[] }[] = [];
  for (const f of listed) {
    const folder = f.folder ?? null;
    let group = groups.find((g) => g.folder === folder);
    if (!group) {
      group = { folder, fields: [] };
      if (folder === null) groups.unshift(group);
      else groups.push(group);
    }
    group.fields.push(f);
  }
  let optionIndex = 0;
  const visible = (id: string): boolean => id === VALUES_FIELD || !fields.find((f) => f.field === id)?.hidden;
  return (
    <div className={props.className ? `salmon-pivot-table-field-list ${props.className}` : 'salmon-pivot-table-field-list'} style={props.style} role="group" aria-label={props['aria-label'] ?? text('fieldList')} data-pivot-fields="">
      <div className="salmon-pivot-table-field-list-fields">
        {props.searchable !== false ? (
          <input type="search" className="salmon-pivot-table-input" aria-label={text('searchFields')} placeholder={text('searchFields')} value={search} onChange={(event) => setSearch(event.target.value)} />
        ) : null}
        <div role="listbox" aria-label={text('fields')} aria-multiselectable="true" className="salmon-pivot-table-list" data-orientation="vertical" onKeyDown={(event) => rovingKeyDown(event, true)}>
          {groups.map((group) =>
            group.folder === null ? (
              group.fields.map((f) => <FieldOption key={f.field} info={f} model={model} index={optionIndex++} options={options} />)
            ) : (
              <div role="group" aria-label={group.folder} key={group.folder} className="salmon-pivot-table-folder">
                <div className="salmon-pivot-table-folder-label" aria-hidden="true">
                  {group.folder}
                </div>
                {group.fields.map((f) => (
                  <FieldOption key={f.field} info={f} model={model} index={optionIndex++} options={options} />
                ))}
              </div>
            ),
          )}
        </div>
      </div>
      <div className="salmon-pivot-table-field-list-axes">
        {AXES.map((axis) => {
          const items = axisItems(model, axis).filter(visible);
          return (
            <div key={axis} className="salmon-pivot-table-field-list-axis">
              <div className="salmon-pivot-table-axis-label" aria-hidden="true">
                {text(axis)}
              </div>
              <div role="listbox" aria-label={text(axis)} className="salmon-pivot-table-list" data-axis={axis} data-orientation="vertical" onKeyDown={(event) => rovingKeyDown(event, true)} {...dropTargetProps(axis, pivot, deferred)}>
                {items.length ? (
                  items.map((field, i) => <AxisOption key={field} field={field} axis={axis} index={i} model={model} fields={fields} options={options} />)
                ) : (
                  <div className="salmon-pivot-table-axis-empty" aria-hidden="true">
                    {text('dropHere')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {deferred ? (
        <div className="salmon-pivot-table-actions">
          <button
            type="button"
            className="salmon-pivot-table-button"
            data-variant="primary"
            disabled={draft === null || draft === applied}
            onClick={() => {
              pivot.applyDraft('pointer');
              pivot.beginDraft();
              props.onDone?.();
            }}
          >
            {text('apply')}
          </button>
          <button
            type="button"
            className="salmon-pivot-table-button"
            onClick={() => {
              pivot.cancelDraft();
              pivot.beginDraft();
              props.onDone?.();
            }}
          >
            {text('cancel')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
