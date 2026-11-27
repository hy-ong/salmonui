'use client';

// Added rows, the dialog edit form, and the confirm prompts. The dialogs are native
// `<dialog>` elements opened with `showModal()`: top layer, inert background,
// focus trap, Escape, and focus return to the invoker come from the platform.
// They render only after a user action, never on the server, and live in
// the lazy editing chunk (`edit-chunk.ts`). While the grid is adaptive the
// edit dialog carries `data-sheet="dialog"` and `adaptive.css` fills the
// screen with it.

import { use, useId, useMemo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { ColumnId, EditTarget, RowId } from '@salmonui/data-grid/engine';
import { columnInfo } from '../column-info.js';
import { customIcon, useDataGridIcons } from '../icons.js';
import { useDataGridInstance, useDataGridRender, useDataGridText } from '../context.js';
import { renderRowCells } from '../Row.js';
import type { DataGridInstance } from '../instance.js';
import { DataGridSheetContext } from '../sheet.js';
import { EDIT_LOCKED } from '@salmonui/data-grid/engine/edit-state';
import { EDIT_SHIFT } from './edit-host.js';
import { editRowAttrs, newRowAttrs } from './edit-view.js';
import { DataGridCellEditor } from './editors.js';
import type { DataGridDialogContext, DataGridDialogField } from './edit-types.js';

const NO_IDS: readonly RowId[] = Object.freeze([]);
const NO_ERRORS: readonly string[] = Object.freeze([]);

/** The always-visible add row: editors in every editable cell, disabled while another row edits. */
function DataGridNewRow({ rowId, index }: { rowId: RowId; index: number }) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const { engine, layout, editing } = instance;
  const view = useSyncExternalStore(layout.subscribe, layout.getColumnView, layout.getServerColumnView);
  const bits = useSyncExternalStore(
    (onChange) => engine.subscribeRow(rowId, onChange),
    () => editing.rowBits(rowId),
    () => 0,
  );
  const locked = ((bits >>> EDIT_SHIFT) & EDIT_LOCKED) !== 0;
  const marks = editRowAttrs(bits);
  return (
    <div
      {...newRowAttrs(rowId, render.text('newRowLabel'), render.headerRows + index + 1)}
      className="salmon-data-grid-row salmon-data-grid-added-row salmon-data-grid-new-row"
      data-dirty={marks?.['data-dirty']}
      data-invalid={marks?.['data-invalid']}
      data-editing={marks?.['data-editing']}
      aria-disabled={locked || undefined}
    >
      {renderRowCells(rowId, index, view, null, instance.renderKeyOf)}
    </div>
  );
}

function DataGridAddedRow({ rowId, index, tree }: { rowId: RowId; index: number; tree?: TreeSlot | undefined }) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const { engine, layout, editing } = instance;
  const view = useSyncExternalStore(layout.subscribe, layout.getColumnView, layout.getServerColumnView);
  const bits = useSyncExternalStore(
    (onChange) => engine.subscribeRow(rowId, onChange),
    () => editing.rowBits(rowId),
    () => 0,
  );
  // Tree-placed: over the gap opened at its slot; inline, so tree mode adds no grid CSS.
  const style: CSSProperties | undefined = tree
    ? ({
        ...render.styles?.row,
        position: 'absolute',
        zIndex: 1,
        insetInline: 0,
        top: `calc(${tree.top}px + var(--salmon-data-grid-row-height) * ${tree.before})`,
        '--salmon-data-grid-tree-depth': tree.depth,
      } as CSSProperties)
    : render.styles?.row;
  const base = tree ? 'salmon-data-grid-row salmon-data-grid-added-row salmon-data-grid-added-row--tree' : 'salmon-data-grid-row salmon-data-grid-added-row';
  return (
    <div
      role="row"
      aria-rowindex={render.headerRows + index + 1}
      aria-level={tree ? tree.depth + 1 : undefined}
      className={render.classNames?.row ? `${base} ${render.classNames.row}` : base}
      style={style}
      data-row-id={rowId}
      data-depth={tree?.depth}
      {...editRowAttrs(bits)}
      data-new=""
    >
      {renderRowCells(rowId, index, view, null, instance.renderKeyOf)}
    </div>
  );
}

/** `EditState.addedTreePlacements` entries. */
type TreePlacements = Readonly<Record<RowId, { readonly position: 'above' | 'below' | 'child'; readonly anchorId: RowId }>>;

/** Where a tree-placed added row renders: before view row `index`, `top` px into the rendered rows. */
interface TreeSlot {
  readonly rowId: RowId;
  readonly index: number;
  readonly depth: number;
  readonly top: number;
  /** Tree-placed rows rendered above this one (each adds a row height). */
  readonly before: number;
}

type TreeDepths = { getTreeRow(rowId: RowId): { readonly depth: number } | null };
const NO_SLOTS = '';

/**
 * Tree mode: the view index each `above` / `below` / `child` added
 * row renders before (the anchor itself; past the anchor's visible subtree),
 * serialized so unchanged slots keep the same snapshot. A row whose anchor is
 * not in the view stays in the edge band.
 */
function treeSlotsKey(instance: DataGridInstance<unknown>, ids: readonly RowId[], placements: TreePlacements | undefined): string {
  const engine = instance.engine;
  const tree = (engine as unknown as { tree?: TreeDepths }).tree;
  if (!placements || !tree) return NO_SLOTS;
  const count = engine.getSnapshot().rows.count;
  const { start, end } = instance.layout.getRowWindow();
  const metrics = instance.layout.getRowMetrics();
  const slots: [RowId, number, number][] = [];
  for (const id of ids) {
    const p = placements[id];
    const at = p ? engine.getRowIndex(p.anchorId) : -1;
    const anchor = p && at >= 0 ? tree.getTreeRow(p.anchorId) : null;
    if (!p || !anchor) continue;
    let k = at;
    if (p.position !== 'above') {
      for (k = at + 1; k < count; k++) {
        const next = engine.getRowIdAt(k) as RowId;
        // Child summary rows: a descendant's stays in the subtree; the anchor's own one follows its last child.
        if (next.startsWith('__tf:')) {
          if (next.slice(5) === p.anchorId && p.position === 'child') break;
          continue;
        }
        const d = tree.getTreeRow(next)?.depth;
        if (d === undefined || d <= anchor.depth) break;
      }
    }
    slots.push([id, k, p.position === 'child' ? anchor.depth + 1 : anchor.depth]);
  }
  if (!slots.length) return NO_SLOTS;
  slots.sort((a, b) => a[1] - b[1]);
  const origin = metrics.offsetOf(start);
  let shown = 0;
  return JSON.stringify(
    slots.map(([id, k, depth]) => {
      const out = [id, k, depth, metrics.offsetOf(k) - origin, shown];
      if (k >= start && k <= end) shown++;
      return out;
    }),
  );
}

/**
 * Tree-placed added rows inside the rendered rows, positioned at
 * their slot, with a gap of one row height opened before the view row they
 * precede: they read at their tree position until the save puts them into
 * the row model.
 */
function DataGridTreeAddedRows({ slots }: { slots: readonly TreeSlot[] }) {
  const instance = useDataGridInstance<unknown>();
  const rows = instance.getRowsElement();
  if (!rows) return null;
  const gaps = new Map<number, number>();
  for (const s of slots) gaps.set(s.index, (gaps.get(s.index) ?? 0) + 1);
  const scope = `[id=${JSON.stringify(instance.gridId)}]>.salmon-data-grid-viewport>.salmon-data-grid-body>.salmon-data-grid-rows>`;
  const css = [...gaps].map(([k, n]) => `${scope}[data-row-index="${k}"]{margin-block-start:calc(var(--salmon-data-grid-row-height) * ${n})}`).join('');
  return createPortal(
    <>
      <style>{css}</style>
      {slots.map((s) => (
        <DataGridAddedRow key={s.rowId} rowId={s.rowId} index={s.index} tree={s} />
      ))}
    </>,
    rows,
  );
}

/**
 * Rows added through editing and not saved yet, as a sticky rowgroup at the
 * `newRowPosition` edge of the body (they are not in the row model until the
 * data source stores them). In tree mode an `above` / `below` / `child` row
 * renders at its tree position instead.
 */
export function DataGridAddedRows({ position }: { position: 'top' | 'bottom' }) {
  const instance = useDataGridInstance<unknown>();
  const { engine, editing, layout } = instance;
  const subscribe = (onChange: () => void) => engine.subscribeModule('edit', onChange);
  const ids = useSyncExternalStore(subscribe, () => editing.state()?.addedRowIds ?? NO_IDS, () => NO_IDS);
  const where = useSyncExternalStore(subscribe, () => editing.state()?.options.newRowPosition ?? 'top', () => 'top');
  const blank = useSyncExternalStore(subscribe, () => editing.state()?.newRowId ?? null, () => editing.state()?.newRowId ?? null);
  const placements = useSyncExternalStore(subscribe, () => (editing.state() as { addedTreePlacements?: TreePlacements } | undefined)?.addedTreePlacements, () => undefined);
  const slotsKey = useSyncExternalStore(
    (onChange) => {
      if (!placements) return () => {};
      const a = engine.subscribe(onChange);
      const b = layout.subscribe(onChange);
      return () => {
        a();
        b();
      };
    },
    () => treeSlotsKey(instance, ids, placements),
    () => NO_SLOTS,
  );
  const slots = useMemo<readonly TreeSlot[]>(
    () => (slotsKey ? (JSON.parse(slotsKey) as [RowId, number, number, number, number][]).map(([rowId, index, depth, top, before]) => ({ rowId, index, depth, top, before })) : []),
    [slotsKey],
  );
  // Each added row renders at the edge its add chose (`addRow` index 0 / past the end), else `newRowPosition`.
  const facade = editing.facade();
  const mine = useMemo(() => {
    const placed = new Set(slots.map((s) => s.rowId));
    return ids.filter((id) => !placed.has(id) && (facade?.getAddedRowPosition(id) ?? where) === position);
  }, [ids, facade, where, position, slots]);
  // The always-visible add row sits at the outer edge of the `newRowPosition` band.
  const showBlank = blank !== null && where === position;
  const placedRows = position === 'top' && slots.length ? <DataGridTreeAddedRows slots={slots} /> : null;
  if (mine.length === 0 && !showBlank) return placedRows;
  const top = showBlank && position === 'top';
  return (
    <div role="rowgroup" className={`salmon-data-grid-added-rows salmon-data-grid-added-rows--${position}`}>
      {placedRows}
      {top ? <DataGridNewRow key={blank} rowId={blank} index={0} /> : null}
      {mine.map((id, i) => (
        <DataGridAddedRow key={id} rowId={id} index={top ? i + 1 : i} />
      ))}
      {showBlank && !top ? <DataGridNewRow key={blank} rowId={blank} index={mine.length} /> : null}
    </div>
  );
}

/** Opens a native dialog as modal on mount and closes it on unmount. */
function openModal(el: HTMLDialogElement | null): (() => void) | void {
  if (!el) return;
  if (!el.open && typeof el.showModal === 'function') {
    el.showModal();
    // showModal focuses the first focusable element: move focus to the intended one (first field, Cancel).
    el.querySelector<HTMLElement>('[data-salmon-focused], [data-autofocus]')?.focus({ preventScroll: true });
  }
  return () => {
    if (el.open) el.close();
  };
}

function cssWidth(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === 'number' ? `${value}px` : value;
}

function DataGridDialogFieldView({ rowId, columnId, autoFocus }: { rowId: RowId; columnId: ColumnId; autoFocus: boolean }) {
  const instance = useDataGridInstance<unknown>();
  const column = instance.engine.getSnapshot().columns.byId.get(columnId);
  if (!column) return null;
  const id = instance.editing.editorId(rowId, columnId);
  return (
    <div className="salmon-data-grid-edit-dialog__field" data-column-id={columnId}>
      <label className="salmon-data-grid-edit-dialog__label" htmlFor={id}>
        {column.headerText}
      </label>
      <DataGridCellEditor rowId={rowId} column={column} placement="dialog" autoFocus={autoFocus} />
    </div>
  );
}

function DataGridEditDialog({ target }: { target: EditTarget }) {
  const instance = useDataGridInstance<unknown>();
  const { engine, editing } = instance;
  const titleId = useId();
  const { rowId, isNew } = target;
  const facade = editing.facade();
  const rowErrors = useSyncExternalStore(
    (onChange) => engine.subscribeRow(rowId, onChange),
    () => facade?.getRowErrors(rowId) ?? NO_ERRORS,
    () => NO_ERRORS,
  );
  const settings = editing.settings();
  const dialogProps = settings?.dialogProps;
  const text = useDataGridText();
  const icons = useDataGridIcons();
  const ids = facade?.getEditableColumnIds(rowId) ?? [];
  const byId = engine.getSnapshot().columns.byId;
  const fields: DataGridDialogField<unknown>[] = [];
  ids.forEach((columnId, i) => {
    const column = byId.get(columnId);
    if (!column) return;
    const draft = editing.draft(rowId, columnId);
    fields.push({
      field: columnId,
      column: columnInfo(column),
      label: column.headerText,
      value: draft ? draft.value : facade?.getValue(rowId, columnId),
      errors: draft?.errors ?? NO_ERRORS,
      setValue: (v) => editing.setValue(rowId, columnId, v, 'api'),
      editor: <DataGridDialogFieldView key={columnId} rowId={rowId} columnId={columnId} autoFocus={i === 0} />,
    });
  });
  const ctx: DataGridDialogContext<unknown> = {
    row: editing.editedRow(rowId) ?? engine.getRow(rowId),
    rowId,
    isNew,
    fields,
    errors: rowErrors,
    save: () => editing.save('pointer', 'editor'),
    cancel: () => editing.cancel('pointer'),
  };
  const title = dialogProps?.title ?? text(isNew ? 'addDialogTitle' : 'editDialogTitle');
  // Adaptive mode: the form is a full-screen sheet, so a configured width does not apply.
  const sheet = use(DataGridSheetContext) !== null;
  const width = sheet ? undefined : cssWidth(dialogProps?.width);
  const style: CSSProperties | undefined = width || dialogProps?.style ? { ...dialogProps?.style, ...(width ? { width } : {}) } : undefined;
  const customHeader = settings?.renderDialogHeader;
  const header: ReactNode = customHeader ? customHeader(ctx) : (
    <h2 id={titleId} className="salmon-data-grid-edit-dialog__title">
      {title}
    </h2>
  );
  return (
    <dialog
      ref={openModal}
      className={dialogProps?.className ? `salmon-data-grid-edit-dialog ${dialogProps.className}` : 'salmon-data-grid-edit-dialog'}
      style={style}
      aria-labelledby={customHeader ? undefined : titleId}
      aria-label={customHeader ? title : undefined}
      data-row-id={rowId}
      data-sheet={sheet ? 'dialog' : undefined}
      onCancel={(event) => {
        event.preventDefault();
        editing.cancel('keyboard');
      }}
    >
      <form
        className="salmon-data-grid-edit-dialog__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          ctx.save();
        }}
      >
        <div className="salmon-data-grid-edit-dialog__header">
          {header}
          {dialogProps?.showCloseButton === false ? null : (
            <button type="button" className="salmon-data-grid-header-button salmon-data-grid-edit-dialog__close" aria-label={text('closeDialog')} onClick={ctx.cancel} data-custom-icon={customIcon(icons, 'close')}>
              {icons?.close}
            </button>
          )}
        </div>
        <div className="salmon-data-grid-edit-dialog__body">
          {rowErrors.length ? (
            <div className="salmon-data-grid-edit-dialog__errors" role="alert">
              {rowErrors.join(' ')}
            </div>
          ) : null}
          {settings?.renderDialog ? settings.renderDialog(ctx) : fields.map((f) => f.editor)}
        </div>
        {settings?.renderDialogFooter ? (
          settings.renderDialogFooter(ctx)
        ) : (
          <div className="salmon-data-grid-dialog__actions">
            <button type="submit" className="salmon-data-grid-button salmon-data-grid-button--primary">
              {text('save')}
            </button>
            <button type="button" className="salmon-data-grid-button" onClick={ctx.cancel}>
              {text('cancel')}
            </button>
          </div>
        )}
      </form>
    </dialog>
  );
}

function DataGridConfirmDialog() {
  const instance = useDataGridInstance<unknown>();
  const editing = instance.editing;
  const prompt = useSyncExternalStore(editing.subscribe, editing.getPrompt, editing.getServerPrompt);
  const titleId = useId();
  const messageId = useId();
  if (!prompt) return null;
  const text = useDataGridText();
  return (
    <dialog
      key={prompt.id}
      ref={openModal}
      role="alertdialog"
      className="salmon-data-grid-confirm"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      data-kind={prompt.kind}
      onCancel={(event) => {
        event.preventDefault();
        prompt.resolve(false);
      }}
    >
      <h2 id={titleId} className="salmon-data-grid-edit-dialog__title">
        {text('confirmTitle')}
      </h2>
      <p id={messageId} className="salmon-data-grid-confirm__message">
        {prompt.message}
      </p>
      <div className="salmon-data-grid-dialog__actions">
        <button type="button" className="salmon-data-grid-button salmon-data-grid-button--primary" data-confirm="ok" onClick={() => prompt.resolve(true)}>
          {text('ok')}
        </button>
        <button type="button" className="salmon-data-grid-button" data-confirm="cancel" data-autofocus="" onClick={() => prompt.resolve(false)}>
          {text('cancel')}
        </button>
      </div>
    </dialog>
  );
}

function DataGridEditDialogHost() {
  const instance = useDataGridInstance<unknown>();
  const { engine, editing } = instance;
  const target = useSyncExternalStore(
    (onChange) => engine.subscribeModule('edit', onChange),
    () => {
      const s = editing.state();
      return s?.options.mode === 'dialog' ? s.active : null;
    },
    () => null,
  );
  if (!target) return null;
  return <DataGridEditDialog key={target.rowId} target={target} />;
}

type RowErrorList = readonly (readonly [RowId, readonly string[]])[];
const NO_ROW_ERRORS: RowErrorList = Object.freeze([]);

/**
 * Row-level errors (`validateRow`, server `rowErrors`) in row, batch and cell
 * modes (the dialog shows its own): a visible `role="alert"` list beside the
 * grid, so a save blocked by a row error is announced and explained.
 */
function DataGridRowErrors() {
  const instance = useDataGridInstance<unknown>();
  const { engine, editing } = instance;
  const text = useDataGridText();
  const cache = useMemo(() => ({ version: -1, list: NO_ROW_ERRORS }), []);
  const list = useSyncExternalStore(
    (onChange) => engine.subscribeModule('edit', onChange),
    () => {
      const s = editing.state();
      if (!s || s.options.mode === 'dialog') return NO_ROW_ERRORS;
      if (s.version === cache.version) return cache.list;
      const snapshot = (engine as unknown as { edit?: { getSnapshot(): { readonly rowErrors: Readonly<Record<RowId, readonly string[]>> } } }).edit?.getSnapshot();
      const entries = Object.entries(snapshot?.rowErrors ?? {}).filter(([, errors]) => errors.length > 0);
      const same = entries.length === cache.list.length && entries.every(([id, errors], i) => cache.list[i]?.[0] === id && cache.list[i]?.[1] === errors);
      cache.version = s.version;
      if (!same) cache.list = entries.length ? Object.freeze(entries.map(([id, errors]) => Object.freeze([id, errors] as const))) : NO_ROW_ERRORS;
      return cache.list;
    },
    () => NO_ROW_ERRORS,
  );
  if (!list.length) return null;
  return (
    <div className="salmon-data-grid-row-errors" role="alert">
      {list.map(([rowId, errors]) => {
        const index = engine.getRowIndex(rowId);
        const message = errors.join(' ');
        return (
          <p key={rowId} className="salmon-data-grid-row-errors__item" data-row-id={rowId}>
            {index >= 0 ? text('rowErrors', { row: index + 1, errors: message }) : text('newRowErrors', { errors: message })}
          </p>
        );
      })}
    </div>
  );
}

/** Edit dialog, confirm prompt and row errors; rendered beside the grid root (never inside `role="grid"`). */
export function DataGridEditOverlays() {
  return (
    <>
      <DataGridRowErrors />
      <DataGridEditDialogHost />
      <DataGridConfirmDialog />
    </>
  );
}
