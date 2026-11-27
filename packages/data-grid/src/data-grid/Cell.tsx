'use client';

import { memo, use, useSyncExternalStore, type CSSProperties, type ReactElement, type ReactNode } from 'react';
import type { CellSnapshot, CompiledColumn, EditDisplay, RowId } from '@salmonui/data-grid/engine';
import { columnInfo } from './column-info.js';

/** A cell's value and text: the engine snapshot, or the draft display while edited. */
type CellValue = CellSnapshot | EditDisplay | undefined;
import { DataGridRenderContext, useDataGridInstance, useDataGridRender, useRenderRecord } from './context.js';
import { DEFAULT_GRID_TEXT } from './locale-text.js';
import type { DataGridColumnInfo } from './feature-types.js';
import { rangeEdgeAttribute, UI_CHECKED, UI_ROW_SELECTED, UI_SELECTED, UI_TABSTOP } from './interaction.js';
import { DataGridRowNumber, rowNumberAt } from './row-number.js';
import { widthVar } from './layout.js';
import type { DataGridCellContext, DataGridColumn, DataGridElementProps, DataGridOverflow } from './types.js';

// Pure per-column caches keyed by the compiled column (immutable), so cells
// never allocate a style object on the default path.
const widthStyles = new WeakMap<object, CSSProperties>();

/** `width: var(--salmon-data-grid-cw-<leafIndex>)`; resizing writes the variable, not React props. */
export function columnWidthStyle(column: CompiledColumn<unknown>): CSSProperties {
  let style = widthStyles.get(column);
  if (!style) {
    style = Object.freeze({ width: `var(${widthVar(column.leafIndex)})` });
    widthStyles.set(column, style);
  }
  return style;
}

export function alignOf(align: string | undefined): 'center' | 'end' | 'justify' | undefined {
  return align === 'center' || align === 'end' || align === 'justify' ? align : undefined;
}

export function clipOf(column: CompiledColumn<unknown>, fallback?: DataGridOverflow): 'clip' | 'tooltip' | undefined {
  const mode = (column.def as DataGridColumn<unknown>).overflow ?? fallback;
  return mode === 'clip' ? 'clip' : mode === 'ellipsisWithTooltip' ? 'tooltip' : undefined;
}

/** @internal Space-joined truthy class names (shared by the static row, header and root renders). */
export function joinClass(...parts: (string | undefined | false | null)[]): string {
  let out = '';
  for (const p of parts) if (p) out = out ? `${out} ${p}` : p;
  return out;
}

export interface DataGridDefaultCellProps<Row = unknown> {
  /** The render context's `column`. */
  column: DataGridColumnInfo<Row>;
  value: unknown;
  formattedValue: string;
}

function checkboxCell(value: unknown, label: string): ReactElement {
  const checked = value === true || value === 'true' || value === 1;
  return <span className="salmon-data-grid-checkbox" role="checkbox" aria-checked={checked} aria-readonly="true" aria-label={label} data-checked={checked ? '' : undefined} />;
}

/** Default cell content: formatted text, or a read-only checkbox for `displayAsCheckbox` columns. */
export function DataGridDefaultCell<Row = unknown>({ column, value, formattedValue }: DataGridDefaultCellProps<Row>) {
  if (column.displayAsCheckbox || column.type === 'selection') return checkboxCell(value, column.header);
  // Boolean text follows the catalog (`true` / `false` keys) unless the column formats it.
  if (column.type === 'boolean' && (value === true || value === false) && column.format === undefined && column.definition['valueFormatter'] === undefined) {
    return <>{(use(DataGridRenderContext)?.text ?? DEFAULT_GRID_TEXT)(value ? 'true' : 'false')}</>;
  }
  return <>{formattedValue}</>;
}

export interface DataGridCellProps<Row> {
  rowId: RowId;
  column: CompiledColumn<Row>;
  rowIndex: number;
  /** 1-based `aria-colindex` (display position among visible leaves). */
  colIndex: number;
  /** Cell span: `aria-colspan` / `aria-rowspan` and the spanned width/height. */
  colSpan?: number;
  rowSpan?: number;
  spanStyle?: CSSProperties | undefined;
  /**
   * A row span whose first row is above the rendered window, drawn in the
   * window's first row: the cell carries its own `data-row-id` so pointer,
   * focus and context-menu targets resolve to the span's row.
   */
  spanAnchor?: boolean;
  /**
   * Render key of the column's render-only fields (`renderCell`,
   * `cellClassName`, ...): changes when one of them changed without a
   * recompile, so `memo` re-renders this column's cells only.
   */
  renderKey?: number | undefined;
}

function DataGridCellImpl<Row>({ rowId, column, rowIndex, colIndex, colSpan, rowSpan, spanStyle, spanAnchor }: DataGridCellProps<Row>) {
  const instance = useDataGridInstance<Row>();
  const render = useDataGridRender<Row>();
  const engine = instance.engine;
  const interaction = instance.interaction;
  const columnId = column.columnId;
  // The `tree` feature's tree column (inert: null): its cells wrap their content in the toggle and indentation.
  const treeCell = instance.features.parts.treeCell;
  const inTree = treeCell !== null && treeCell.is(instance as never, columnId);
  // Editing: draft-backed display values and edit flags; `null` keeps the default path untouched.
  const edit = instance.editing.active ? instance.editing : null;
  const commandColumn = edit !== null && edit.commandsOf(column) !== null;
  const read: () => CellValue = edit ? () => edit.cellRead(rowId, columnId) : () => engine.getCellSnapshot(rowId, columnId);
  // Server snapshots return what the server rendered, never the live state (hydration).
  const readServer = (): CellValue => instance.serverRead(`c\u0000${rowId}\u0000${columnId}`, read);
  const cell = useSyncExternalStore((onChange) => engine.subscribeCell(rowId, columnId, onChange), read, readServer);
  const def = column.def as DataGridColumn<Row>;
  const selectionColumn = interaction.isSelectionColumn(column);
  // Templates and per-cell props may depend on `isSelected`; plain cells do not re-render on row selection.
  const wantsRowSelected = def.renderCell !== undefined || typeof def.cellProps === 'function' || typeof def.cellClassName === 'function' || render.getCellProps !== undefined;
  // One primitive for focus (tab stop) and selection: a focus move re-renders the old and the new cell only.
  // `boxWithBorder` range edges use bits 4..7, below the edit bits (EDIT_SHIFT).
  const edges = render.cellRangeBorder;
  const readUi = edit
    ? (): number => interaction.cellUi(rowId, columnId, selectionColumn, wantsRowSelected, false, edges) | edit.cellBits(rowId, columnId, commandColumn)
    : (): number => interaction.cellUi(rowId, columnId, selectionColumn, wantsRowSelected, false, edges);
  const readUiServer = (): number => instance.serverRead(`cu\u0000${rowId}\u0000${columnId}`, () => interaction.cellUi(rowId, columnId, selectionColumn, wantsRowSelected, true, edges));
  const ui = useSyncExternalStore(
    (onChange) => {
      const a = engine.subscribeCell(rowId, columnId, onChange);
      const b = engine.subscribeRow(rowId, onChange);
      const c = engine.subscribeHeader(columnId, onChange);
      return () => {
        a();
        b();
        c();
      };
    },
    readUi,
    readUiServer,
  );
  useRenderRecord(instance, 'cell', `${rowId}:${columnId}`);
  const tabStop = (ui & UI_TABSTOP) !== 0;
  const selected = (ui & UI_SELECTED) !== 0;
  const rowNumberColumn = column.type === 'rowNumber';
  let value = cell?.value;
  let formattedValue = cell?.formattedValue ?? '';
  if (rowNumberColumn && def.renderCell) {
    // Templates of a row number column receive the number as the value.
    const n = rowNumberAt(instance, engine.getSnapshot(), rowIndex);
    value = n;
    formattedValue = n > 0 ? String(n) : '';
  }

  let ctx: DataGridCellContext<Row> | null = null;
  const context = (): DataGridCellContext<Row> =>
    (ctx ??= {
      row: (engine.getRow(rowId) ?? edit?.editedRow(rowId)) as Row,
      rowId,
      field: columnId,
      column: columnInfo(column),
      value,
      formattedValue,
      rowIndex,
      selected: selected || (ui & UI_ROW_SELECTED) !== 0,
      editing: editView !== null && editView.attrs['data-editing'] !== undefined,
    });
  // The `editing` feature's cell view (the inert selector returns null).
  const editView = edit ? instance.features.selectors.editCellView(instance, rowId, column, ui) : null;

  let content: ReactNode;
  if (selectionColumn) {
    const checked = (ui & UI_CHECKED) !== 0;
    content = (
      <span className="salmon-data-grid-checkbox salmon-data-grid-select-checkbox" role="checkbox" aria-checked={checked} aria-label={render.text('selectRow')} data-checked={checked ? '' : undefined} />
    );
  } else if (editView?.content) {
    content = editView.content;
  } else if (def.renderCell) {
    // The tree cell calls the template with `ctx.tree`.
    if (!inTree) content = def.renderCell(context());
  } else if (rowNumberColumn) {
    content = <DataGridRowNumber instance={instance} rowIndex={rowIndex} />;
  } else {
    content =
      column.flags.displayAsCheckBox || column.type === 'selection'
        ? checkboxCell(value, column.headerText)
        : column.type === 'boolean' && (value === true || value === false) && def.format === undefined && def.valueFormatter === undefined
          ? render.text(value ? 'true' : 'false') // boolean text follows the catalog
          : render.searchHighlight !== null && render.searchHighlight.has(columnId)
            ? render.searchHighlight.render(formattedValue) // `search.highlight`
            : formattedValue;
  }
  if (inTree) content = <treeCell.Cell rowId={rowId} column={column as never} context={context as never} content={content} />;
  const columnProps: DataGridElementProps | undefined = typeof def.cellProps === 'function' ? def.cellProps(context()) : def.cellProps;
  const gridProps = render.getCellProps ? render.getCellProps(context()) : undefined;
  const extraClass = typeof def.cellClassName === 'function' ? def.cellClassName(context()) : def.cellClassName;
  const partStyle = render.styles?.cell;

  const base = columnWidthStyle(column as CompiledColumn<unknown>);
  let style = partStyle || columnProps?.style || gridProps?.style ? { ...partStyle, ...columnProps?.style, ...gridProps?.style, ...base } : base;
  if (spanStyle) style = { ...style, ...spanStyle };
  const { className: columnClass, style: _cs, ...columnRest } = columnProps ?? {};
  const { className: gridClass, style: _gs, ...gridRest } = gridProps ?? {};

  return (
    <div
      {...columnRest}
      {...gridRest}
      role="gridcell"
      aria-colindex={colIndex}
      aria-colspan={colSpan !== undefined && colSpan > 1 ? colSpan : undefined}
      aria-rowspan={rowSpan !== undefined && rowSpan > 1 ? rowSpan : undefined}
      data-span={spanStyle ? '' : undefined}
      data-row-id={spanAnchor ? rowId : undefined}
      aria-selected={interaction.cellSelectionMode() && !selectionColumn ? selected : undefined}
      tabIndex={tabStop ? 0 : -1}
      ref={tabStop ? interaction.targetRef : undefined}
      className={joinClass('salmon-data-grid-cell', render.classNames?.cell, extraClass, columnClass, gridClass)}
      style={style}
      data-column-id={columnId}
      data-selected={selected ? '' : undefined}
      data-range-edge={edges && selected ? rangeEdgeAttribute(ui) : undefined}
      data-row-number={rowNumberColumn ? '' : undefined}
      data-selection-column={selectionColumn ? '' : undefined}
      data-align={alignOf(def.align)}
      data-clip={clipOf(column as CompiledColumn<unknown>, render.overflow)}
      {...editView?.attrs}
    >
      {content}
      {editView?.message}
    </div>
  );
}

/**
 * Body cell part. Subscribes to its own engine cell channel only, so a change
 * to one cell re-renders one cell. `memo` (instead of compiler-derived
 * memoization, the package is not compiled yet) keeps retained cells from
 * re-rendering when a row re-renders for a column-window change.
 */
export const DataGridCell = memo(DataGridCellImpl) as <Row>(props: DataGridCellProps<Row>) => ReactNode;
