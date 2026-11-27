'use client';

// Built-in editors (text, number, select, checkbox, date, datetime),
// `renderEditor`, and the cell editor wrapper with its keyboard
// routing and validation message; in the lazy editing
// chunk (the command column buttons and the edit marks of cells and rows are
// `edit-view.tsx`). Editors are uncontrolled
// where typing matters (text, number, dates): a keystroke dispatches
// `edit.setValue` and re-renders this one cell only.

import { useSyncExternalStore, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { ColumnId, CompiledColumn, EditDraft, RowId } from '@salmonui/data-grid/engine';
import { columnInfo, compiledOf } from '../column-info.js';
import { useDataGridInstance, useDataGridRender, useDataGridText } from '../context.js';
import type { DataGridInstance } from '../instance.js';
import type { DataGridColumn } from '../types.js';
import { DateEditor } from './date-picker.js';
import type { DataGridEditorContext, DataGridEditorInputProps, DataGridEditorOption, DataGridEditorProps, DataGridEditorType } from './edit-types.js';

const NO_ERRORS: readonly string[] = Object.freeze([]);
const NO_PROPS: DataGridEditorProps = Object.freeze({});

function pathValue(row: unknown, path: string): unknown {
  let v: unknown = row;
  for (const part of path.split('.')) {
    if (v === null || v === undefined) return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

/** The editor of a column: `editor`, else from the lookup or the column type. */
export function editorTypeOf(column: CompiledColumn<unknown>): DataGridEditorType | string {
  const editor = (column.def as DataGridColumn<unknown>).editor;
  if (editor) return editor;
  if (column.lookup) return 'select';
  switch (column.type) {
    case 'number':
      return 'number';
    case 'boolean':
      return 'checkbox';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    default:
      return 'text';
  }
}

/** Options of the `select` editor: `editorProps.options`, else the local lookup rows. */
export function selectOptions(column: CompiledColumn<unknown>, props: DataGridEditorProps): readonly DataGridEditorOption[] {
  if (props.options) {
    return props.options.map((o) => (typeof o === 'object' && o !== null ? o : { value: o, label: String(o) }));
  }
  const lookup = column.lookup;
  if (lookup && Array.isArray(lookup.data)) {
    return (lookup.data as readonly unknown[]).map((row) => {
      const label = pathValue(row, lookup.displayField);
      return { value: pathValue(row, lookup.keyField), label: label === null || label === undefined ? '' : String(label) };
    });
  }
  return [];
}

function sameOption(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return String(a) === String(b);
}

function plainText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  return String(value);
}

function truthy(value: unknown): boolean {
  return value === true || value === 'true' || value === 1;
}

/** Focuses the editor once when it mounts (re-renders keep the caret). */
function focusOnce(el: HTMLElement | null, select: boolean): void {
  if (!el || el.dataset['salmonFocused'] === '') return;
  el.dataset['salmonFocused'] = '';
  el.focus({ preventScroll: true });
  if (select && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) el.select();
}

/** A finite number from `editorProps.min` / `max` / `step`, else undefined. */
function numberProp(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function decimalsOf(n: number): number {
  const s = String(n);
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

/**
 * `number` editor range and step (`editorProps.min` / `max` / `step`): ArrowUp /
 * ArrowDown step within the range; a plain number typed outside it is clamped on commit keys and blur.
 * Text that is not a plain number is left to the column parser and validation.
 */
function numberRange(editorProps: DataGridEditorProps, setValue: (value: unknown) => void) {
  const min = numberProp(editorProps.min);
  const max = numberProp(editorProps.max);
  const step = numberProp(editorProps.step) ?? 1;
  const clamp = (n: number): number => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, n));
  const write = (el: HTMLInputElement, n: number): void => {
    const text = String(n);
    if (el.value === text) return;
    el.value = text;
    setValue(text);
  };
  const clampInput = (el: HTMLInputElement): void => {
    const text = el.value.trim();
    if (text === '' || (min === undefined && max === undefined)) return;
    const n = Number(text);
    if (Number.isFinite(n) && clamp(n) !== n) write(el, clamp(n));
  };
  return {
    min,
    max,
    onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>): void {
      const el = event.currentTarget;
      if (event.key === 'Enter' || event.key === 'Tab') {
        // Before the editor's commit keys run (they bubble to the editor wrapper).
        clampInput(el);
        return;
      }
      if ((event.key !== 'ArrowUp' && event.key !== 'ArrowDown') || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return;
      const text = el.value.trim();
      const current = text === '' ? (min ?? 0) : Number(text);
      if (!Number.isFinite(current)) return;
      event.preventDefault();
      const decimals = Math.max(decimalsOf(step), decimalsOf(current));
      const next = text === '' ? current : current + (event.key === 'ArrowUp' ? step : -step);
      write(el, clamp(Number(next.toFixed(decimals))));
    },
    onBlur(event: ReactFocusEvent<HTMLInputElement>): void {
      clampInput(event.currentTarget);
    },
  };
}

interface BuiltInProps {
  readonly type: DataGridEditorType | string;
  readonly ctx: DataGridEditorContext<unknown>;
  readonly utc: boolean;
}

/** One built-in editor element. */
function BuiltInEditor({ type, ctx, utc }: BuiltInProps): ReactNode {
  const { inputProps, editorProps, value, setValue } = ctx;
  const { autoFocus, ...aria } = inputProps;
  const className = editorProps.className ? `salmon-data-grid-input salmon-data-grid-editor__input ${editorProps.className}` : 'salmon-data-grid-input salmon-data-grid-editor__input';
  const common = { ...aria, className, style: editorProps.style };
  switch (type) {
    case 'checkbox':
      return (
        <input
          {...common}
          type="checkbox"
          className={editorProps.className ? `salmon-data-grid-check salmon-data-grid-editor__checkbox ${editorProps.className}` : 'salmon-data-grid-check salmon-data-grid-editor__checkbox'}
          checked={truthy(value)}
          ref={autoFocus ? (el) => focusOnce(el, false) : undefined}
          onChange={(e) => setValue(e.currentTarget.checked)}
        />
      );
    case 'select': {
      const options = selectOptions(compiledOf(ctx.column) as CompiledColumn<unknown>, editorProps);
      const index = options.findIndex((o) => sameOption(o.value, value));
      return (
        <select {...common} value={index < 0 ? '' : String(index)} ref={autoFocus ? (el) => focusOnce(el, false) : undefined} onChange={(e) => {
          const i = e.currentTarget.value;
          setValue(i === '' ? null : (options[Number(i)] as DataGridEditorOption).value);
        }}>
          {index < 0 || editorProps.placeholder !== undefined ? <option value="">{editorProps.placeholder ?? ''}</option> : null}
          {options.map((o, i) => (
            <option key={i} value={String(i)}>
              {o.label}
            </option>
          ))}
        </select>
      );
    }
    case 'date':
    case 'datetime': {
      const withTime = type === 'datetime';
      // Date-only values are UTC midnight (the column parser's ISO dates): edit their UTC fields.
      return <DateEditor ctx={ctx} input={common} withTime={withTime} utc={withTime ? utc : true} inputRef={autoFocus ? (el) => focusOnce(el, true) : undefined} />;
    }
    case 'number': {
      const range = numberRange(editorProps, setValue);
      return (
        <input
          {...common}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-valuemin={range.min}
          aria-valuemax={range.max}
          defaultValue={plainText(value)}
          ref={autoFocus ? (el) => focusOnce(el, true) : undefined}
          onChange={(e) => setValue(e.currentTarget.value)}
          onKeyDown={range.onKeyDown}
          onBlur={range.onBlur}
        />
      );
    }
    default:
      if (editorProps.multiline) {
        return (
          <textarea
            {...common}
            defaultValue={plainText(value)}
            minLength={editorProps.minLength}
            maxLength={editorProps.maxLength}
            spellCheck={editorProps.spellCheck}
            ref={autoFocus ? (el) => focusOnce(el, true) : undefined}
            onChange={(e) => setValue(e.currentTarget.value)}
          />
        );
      }
      return (
        <input
          {...common}
          type="text"
          defaultValue={plainText(value)}
          minLength={editorProps.minLength}
          maxLength={editorProps.maxLength}
          autoComplete={editorProps.autoComplete ?? 'off'}
          spellCheck={editorProps.spellCheck}
          ref={autoFocus ? (el) => focusOnce(el, true) : undefined}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
      );
  }
}

export interface DataGridCellEditorProps<Row> {
  readonly rowId: RowId;
  readonly column: CompiledColumn<Row>;
  readonly placement: 'cell' | 'dialog';
  /** Dialog: the field that takes focus when the dialog opens. */
  readonly autoFocus?: boolean;
}

/** Draft of one cell (stable identity until the draft changes; notified on the cell channel). */
export function useEditDraft<Row>(instance: DataGridInstance<Row>, rowId: RowId, columnId: ColumnId): EditDraft | undefined {
  const edit = instance.editing;
  return useSyncExternalStore(
    (onChange) => instance.engine.subscribeCell(rowId, columnId, onChange),
    () => edit.draft(rowId, columnId),
    () => undefined,
  );
}

/**
 * Editor of one cell, inline or in the dialog form. Keys go to the `editor`
 * keyboard context (Enter, Tab, Escape, ...); other keys stay in the editor.
 */
export function DataGridCellEditor<Row>({ rowId, column, placement, autoFocus }: DataGridCellEditorProps<Row>) {
  const instance = useDataGridInstance<Row>();
  const render = useDataGridRender<Row>();
  const edit = instance.editing;
  const columnId = column.columnId;
  const draft = useEditDraft(instance, rowId, columnId);
  const facade = edit.facade();
  const state = edit.state();
  const value = draft ? draft.value : facade?.getValue(rowId, columnId);
  const errors = draft?.errors ?? NO_ERRORS;
  const invalid = errors.length > 0;
  const id = edit.editorId(rowId, columnId);
  const errorId = edit.errorId(rowId, columnId);
  const def = column.def as DataGridColumn<Row>;
  const editorProps = (def.editorProps as DataGridEditorProps | undefined) ?? NO_PROPS;
  const inputProps: DataGridEditorInputProps = {
    id,
    'aria-label': edit.text('editorLabel', { column: column.headerText }),
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? errorId : undefined,
    'aria-required': facade?.isRequired(rowId, columnId) || undefined,
    autoFocus: autoFocus ?? (placement === 'cell' && edit.isFocusEditor(rowId, columnId)),
    // The always-visible add row while another row edits.
    disabled: (placement === 'cell' && state?.newRowId === rowId && state.active !== null && state.active.rowId !== rowId) || undefined,
  };
  const isNew = (state?.addedRowIds ?? []).includes(rowId) || state?.newRowId === rowId;
  const ctx: DataGridEditorContext<Row> = {
    value,
    setValue: (v) => edit.setValue(rowId, columnId, v),
    save: () => {
      if (edit.mode() === 'batch' && placement === 'cell') edit.commitAndMove('down', 'api');
      else edit.save('api', 'editor');
    },
    cancel: () => edit.cancel('api'),
    row: (edit.editedRow(rowId) ?? instance.engine.getRow(rowId)) as Row,
    rowId,
    field: columnId,
    column: columnInfo(column),
    errors,
    isNew,
    placement,
    editorProps,
    inputProps,
  };
  const type = editorTypeOf(column as CompiledColumn<unknown>);
  const content = def.renderEditor ? def.renderEditor(ctx) : <BuiltInEditor type={type} ctx={ctx as DataGridEditorContext<unknown>} utc={instance.props.timeZone === 'UTC'} />;
  const onKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.nativeEvent.isComposing) return;
    // The grid's navigation keys never act on an editor's content.
    event.stopPropagation();
    if (instance.interaction.handleKey(event.nativeEvent, 'editor')) event.preventDefault();
  };
  return (
    <div
      className={render.classNames?.editor ? `salmon-data-grid-editor ${render.classNames.editor}` : 'salmon-data-grid-editor'}
      style={render.styles?.editor}
      data-editor={type}
      data-invalid={invalid ? '' : undefined}
      data-pending={draft?.pending ? '' : undefined}
      onKeyDown={onKeyDown}
    >
      {content}
      {invalid ? (
        <div id={errorId} className="salmon-data-grid-editor__error">
          {errors.join(' ')}
        </div>
      ) : null}
    </div>
  );
}
