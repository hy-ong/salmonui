'use client';

// PivotTable: renders the
// result of a PivotController through the Data Grid renderer (row stubs and
// compiled columns, grid-model.ts / columns.tsx), so row and column
// virtualization, pinned row headers, stacked headers, resize, reorder,
// gridlines, selection and paging are the Data Grid's. Field list, axis bar,
// toolbar and the dialogs compose around it from the same store.

import { lazy, Suspense, useCallback, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type Ref } from 'react';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import type { PivotAggregate, PivotResult } from '@salmonui/pivot-table/engine';
import { DataGrid } from '@salmonui/data-grid';
import type { DataGridApi, DataGridCellKey, DataGridKeyDownContext, DataGridProps, DataGridSelectionChangeEvent } from '@salmonui/data-grid';
import type { DataGridCellClickEvent } from '@salmonui/data-grid';
import type { DataGridEditing } from '@salmonui/data-grid';
import { gridEvent } from '@salmonui/core/internal/events';
import { PivotController } from './controller.js';
import { buildColumns, cycleValueSort, useGridRole } from './columns.js';
import { buildView, columnSignature, defined, ROW_FIELD_PREFIX, ROW_HEADER_ID, type PivotRowStub, type PivotView } from './grid-model.js';
import { createText, type PivotLocaleText, type PivotText } from './locale.js';
import { captionOf } from './model-ops.js';
import { PivotAxisBar } from './PivotAxisBar.js';
import { PivotToolbar } from './PivotToolbar.js';
import { usePivotPersistence } from './state.js';
import type { PivotExportFile, PivotExportOptions, PivotExportWriters } from './export.js';
import type {
  PivotAxisBarOptions,
  PivotCellClickEvent,
  PivotCellContext,
  PivotCellKey,
  PivotDisplayProps,
  PivotHeaderContext,
  PivotLoadingContext,
  PivotPersistState,
  PivotTableLayout,
  PivotTableState,
  PivotToolbarItem,
  PivotToolbarItemId,
  PivotTooltipContext,
  UsePivotOptions,
} from './types.js';
import { usePivotState } from './usePivot.js';

const PivotDialogs = lazy(() => import('./dialogs.js'));

/** Instance API of `PivotTable` (`ref`). */
export interface PivotTableApi<Row = unknown> {
  readonly pivot: PivotController<Row>;
  /** The root element; null before mount. */
  readonly element: HTMLDivElement | null;
  /** The inner Data Grid instance (renderer); null before mount. */
  readonly grid: DataGridApi<PivotRowStub> | null;
  getResult(): PivotResult | null;
  getState(): PivotTableState;
  restoreState(state: PivotTableState | string): boolean;
  exportToExcel(options?: PivotExportOptions): Promise<PivotExportFile | null>;
  exportToCsv(options?: PivotExportOptions): Promise<PivotExportFile | null>;
  exportToPdf(options?: PivotExportOptions): Promise<PivotExportFile | null>;
  print(): Promise<null>;
  openFieldList(): void;
  openCalculatedFieldEditor(name?: string): void;
  openConditionalFormatEditor(): void;
  openNumberFormatEditor(measure?: string): void;
  refresh(): void;
}

export interface PivotTableProps<Row = unknown> extends UsePivotOptions<Row>, PivotDisplayProps {
  /** A shared store from `usePivot()`; without it the table creates its own from `data`, `fields`, `pivotModel`. */
  pivot?: PivotController<Row> | undefined;
  /** `compact` (default): row members as a tree in one column (`treegrid`); `tabular`: one pinned column per row field. */
  layout?: PivotTableLayout | undefined;
  /** Built-in field list: `'popup'` (or `true`) opens it from the toolbar and `api.openFieldList()`. */
  fieldList?: boolean | 'popup' | undefined;
  /** Built-in axis bar above the table. */
  axisBar?: boolean | PivotAxisBarOptions | undefined;
  /** Built-in toolbar items above the table. */
  toolbar?: readonly (PivotToolbarItemId | PivotToolbarItem)[] | undefined;
  /** Double-click or Enter on a value cell opens its raw rows. */
  drillThrough?: boolean | { readonly maxRows?: number } | undefined;
  /**
   * Value sort buttons on the leaf column headers: a click or Enter / Space on the header
   * cycles ascending, descending, none (Shift+Enter on a header that also
   * drills). `multipleAxis` (default true) sorts every row level.
   */
  valueSorting?: boolean | { readonly multipleAxis?: boolean } | undefined;
  /** Editing of the drill-through grid; edits write through and re-aggregate. */
  editing?: boolean | DataGridEditing<Row> | undefined;
  /**
   * Paging instead of virtualization (opt-in): page sizes for rows and
   * columns. `true` (or `{}`) uses the defaults, 10 rows and 5
   * column members per page; an object pages only the axes it names.
   */
  paging?: boolean | { readonly rows?: number; readonly columns?: number } | undefined;
  /** Aggregates offered by the value field menus. */
  aggregateOptions?: readonly PivotAggregate[] | undefined;
  /** Cell selection. Default off. */
  selection?: boolean | { readonly multiple?: boolean } | undefined;
  /** Text of empty value cells. Default ''. */
  emptyCellText?: string | undefined;
  renderCell?: ((ctx: PivotCellContext) => ReactNode) | undefined;
  renderHeader?: ((ctx: PivotHeaderContext) => ReactNode) | undefined;
  renderTooltip?: ((ctx: PivotTooltipContext) => ReactNode) | undefined;
  renderLoading?: ((ctx: PivotLoadingContext) => ReactNode) | undefined;
  getCellClassName?: ((ctx: PivotCellContext) => string | undefined) | undefined;
  onCellClick?: ((event: PivotCellClickEvent) => void) | undefined;
  /** Saves the model in storage and restores it on mount. */
  persistState?: PivotPersistState | undefined;
  /** Export writer loader: a dynamic import of the `pivot` subpath of the @salmonui/export package (Excel and PDF need it). */
  exportWriters?: PivotExportWriters | undefined;
  localeText?: PivotLocaleText | undefined;
  id?: string | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  'aria-label'?: string | undefined;
  ref?: Ref<PivotTableApi<Row>> | undefined;
}

/** The table's own controller when no `pivot` prop is given (hooks run unconditionally, inert with a shared store). */
function useOwnPivot<Row>(props: PivotTableProps<Row>): PivotController<Row> {
  const [own] = useState(() => (props.pivot ? null : new PivotController<Row>(props)));
  useLayoutEffect(() => {
    own?.updateOptions(props);
  });
  useLayoutEffect(() => (own ? own.mount() : undefined), [own]);
  const { data, pivotModel } = props;
  useLayoutEffect(() => {
    own?.applyDataProp(data);
  }, [own, data]);
  useLayoutEffect(() => {
    own?.applyModelProp(pivotModel);
  }, [own, pivotModel]);
  return props.pivot ?? (own as PivotController<Row>);
}

const EMPTY_ROWS: PivotRowStub[] = [];
const getRowId = (stub: PivotRowStub): string => stub.id;

/** Page sizes of `paging: true`. */
const DEFAULT_PAGING = Object.freeze({ rows: 10, columns: 5 });
const pagingOf = (paging: PivotTableProps<unknown>['paging']): { readonly rows?: number; readonly columns?: number } | null => {
  if (!paging) return null;
  if (paging === true || (paging.rows === undefined && paging.columns === undefined)) return DEFAULT_PAGING;
  return paging;
};
const rowClassName = (stub: PivotRowStub): string | undefined => {
  const kind = stub.v.result.memberAt('rows', stub.i).kind;
  return kind === 'grandTotal' ? 'salmon-pivot-table-grand-total-row' : kind === 'subtotal' ? 'salmon-pivot-table-subtotal-row' : undefined;
};

/** Pivot cell keys of Data Grid cell keys (value cells only). */
function pivotCells(view: PivotView | null, cells: readonly DataGridCellKey[]): PivotCellKey[] {
  if (!view) return [];
  const out: PivotCellKey[] = [];
  for (const cell of cells) {
    const r = view.rowIndex.get(String(cell.rowId));
    const c = view.columnIndex.get(cell.field);
    if (r === undefined || c === undefined) continue;
    out.push({ rowKey: view.result.memberAt('rows', r).key, columnKey: view.result.memberAt('columns', c).key });
  }
  return out;
}

/** The pivot table. */
export function PivotTable<Row = unknown>(own: PivotTableProps<Row>): ReactNode {
  // The nearest `LocaleProvider` text and locale under the table's own props; the parts, the dialogs, the
  // controller and the inner grid read them from here.
  const localeText = useLocaleText('pivotTable', own.localeText);
  const locale = useLocale(own.locale);
  const props: PivotTableProps<Row> = { ...own, localeText, locale };
  const pivot = useOwnPivot(props);
  const result = usePivotState(pivot, (s) => s.result);
  const status = usePivotState(pivot, (s) => s.status);
  const fields = usePivotState(pivot, (s) => s.fields);
  const dialog = usePivotState(pivot, (s) => s.dialog);
  const text = useMemo(() => createText(props.localeText), [props.localeText]);
  const layout = props.layout ?? 'compact';
  const gridRef = useRef<DataGridApi<PivotRowStub> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  // Read by the dialogs' portal (after hydration), never during render.
  const dialogAnchor = useCallback(() => rootRef.current, []);
  const [columnPage, setColumnPage] = useState(0);

  const { view, rows } = useMemo(() => (result ? buildView(result) : { view: null, rows: EMPTY_ROWS }), [result]);
  const signature = useMemo(() => (result ? columnSignature(result) : ''), [result]);
  const model = result?.model ?? pivot.model;
  const rowFieldKey = model.rows.map((f) => captionOf(model, f.field, fields)).join('\u0001');
  // Conditional formats change cell classes and styles without changing values: new column definitions re-render the cells.
  const conditionalKey = model.conditionalFormats;

  const pagingOption = pagingOf(props.paging);
  const columnPageSize = pagingOption?.columns ?? 0;
  const columnCount = result?.columnCount ?? 0;
  const columnPages = columnPageSize > 0 ? Math.max(1, Math.ceil(columnCount / columnPageSize)) : 1;
  const page = Math.min(columnPage, columnPages - 1);
  const columnRange: readonly [number, number] | null = columnPageSize > 0 ? [page * columnPageSize, (page + 1) * columnPageSize] : null;
  const rangeKey = columnRange ? columnRange.join(':') : '';

  const drillThrough = props.drillThrough !== undefined && props.drillThrough !== false;
  const multipleAxis = props.valueSorting ? (props.valueSorting === true || props.valueSorting.multipleAxis !== false) : null;
  const valueSorting = useMemo(() => (multipleAxis === null ? null : { multipleAxis }), [multipleAxis]);
  const { renderCell, renderHeader, renderTooltip, getCellClassName, emptyCellText = '', columnWidth = 120, rowHeaderWidth } = props;
  // Rebuilt only when the column tree shape, the layout or a render prop changes (not on every result).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `signature`, `rowFieldKey` and `conditionalKey` stand for the result's column tree, row fields and conditional formats.
  const columns = useMemo(
    () =>
      result
        ? buildColumns(result, {
            pivot,
            layout,
            text,
            rowFieldCaptions: rowFieldKey ? rowFieldKey.split('\u0001') : [],
            columnWidth,
            rowHeaderWidth,
            emptyCellText,
            drillThrough,
            valueSorting,
            columnRange,
            renderCell,
            renderHeader,
            renderTooltip,
            getCellClassName,
          })
        : [],
    [signature, rowFieldKey, conditionalKey, layout, text, columnWidth, rowHeaderWidth, emptyCellText, drillThrough, valueSorting, rangeKey, renderCell, renderHeader, renderTooltip, getCellClassName, pivot, result === null],
  );

  useGridRole(() => gridRef.current?.element, layout, result !== null);
  useWindowLoader(pivot, gridRef, result, columnRange ? columnRange[0] : 0);
  usePivotPersistence(pivot, props.persistState);

  const maxRows = typeof props.drillThrough === 'object' ? props.drillThrough.maxRows : undefined;
  const openDrill = useCallback(
    (stub: PivotRowStub, field: string, source: 'pointer' | 'keyboard') => {
      const c = stub.v.columnIndex.get(field);
      if (c === undefined) return false;
      return pivot.drillThrough(stub.i, c, { source });
    },
    [pivot],
  );

  const onKeyDown = useCallback(
    (ctx: DataGridKeyDownContext) => {
      const key = ctx.nativeEvent.key;
      const v = view;
      if (!v) return;
      if ((ctx.nativeEvent.ctrlKey || ctx.nativeEvent.metaKey) && (key === 'ArrowDown' || key === 'ArrowUp') && ctx.context === 'body') {
        ctx.preventDefault();
        ctx.nativeEvent.preventDefault();
        if (key === 'ArrowDown') pivot.expandAll('rows', { source: 'keyboard' });
        else pivot.collapseAll('rows', { source: 'keyboard' });
        return;
      }
      if (key !== 'Enter' && key !== ' ') return;
      if (ctx.context === 'header' && ctx.field) {
        const c = v.columnIndex.get(ctx.field);
        if (c === undefined) return;
        const leaf = v.result.memberAt('columns', c);
        if (valueSorting && (!leaf.expandable || ctx.nativeEvent.shiftKey)) {
          ctx.preventDefault();
          ctx.nativeEvent.preventDefault();
          cycleValueSort(pivot, leaf, valueSorting.multipleAxis, 'keyboard');
        } else if (leaf.expandable) {
          ctx.preventDefault();
          pivot.toggle(leaf, { source: 'keyboard' });
        }
        return;
      }
      if (ctx.context !== 'body' || ctx.rowId === null || !ctx.field) return;
      const r = v.rowIndex.get(String(ctx.rowId));
      if (r === undefined) return;
      const stub = rows[r] as PivotRowStub;
      if (ctx.field === ROW_HEADER_ID || ctx.field.startsWith(ROW_FIELD_PREFIX)) {
        const node = v.result.memberAt('rows', r);
        if (node.expandable && (ctx.field === ROW_HEADER_ID || ctx.field === `${ROW_FIELD_PREFIX}${node.path.length - 1}`)) {
          ctx.preventDefault();
          ctx.nativeEvent.preventDefault();
          pivot.toggle(node, { source: 'keyboard' });
        }
        return;
      }
      if (key === 'Enter' && drillThrough && openDrill(stub, ctx.field, 'keyboard')) {
        ctx.preventDefault();
        // The dialog focuses its first button during this keydown; without this the Enter activates (closes) it.
        ctx.nativeEvent.preventDefault();
      }
    },
    [view, rows, pivot, drillThrough, valueSorting, openDrill],
  );

  const onCellClickProp = props.onCellClick;
  const onCellClick = useCallback(
    (event: DataGridCellClickEvent<PivotRowStub>) => {
      if (!onCellClickProp) return;
      const stub = event.row;
      const c = stub.v.columnIndex.get(event.field);
      const rowHeader = stub.v.result.memberAt('rows', stub.i);
      const cell = c === undefined ? null : stub.v.result.cellAt(stub.i, c);
      const pivotEvent = gridEvent<PivotCellClickEvent>('cellClick', 'pointer', {
        cell,
        rowHeader,
        rowKey: rowHeader.key,
        columnKey: cell ? cell.columnKey : null,
        element: event.element,
        nativeEvent: event.nativeEvent,
      });
      onCellClickProp(pivotEvent);
      if (pivotEvent.defaultPrevented) event.preventDefault();
    },
    [onCellClickProp],
  );

  const onCellDoubleClick = useCallback(
    (event: DataGridCellClickEvent<PivotRowStub>) => {
      if (drillThrough && openDrill(event.row, event.field, 'pointer')) event.preventDefault();
    },
    [drillThrough, openDrill],
  );

  // Every selected value cell (the grid event's `cells` lists only the anchor and focus of each range):
  // the previous selection minus `removedCells` plus `addedCells`.
  const selectedRef = useRef<Map<string, PivotCellKey>>(new Map());
  const nextSelection = useCallback(
    (event: DataGridSelectionChangeEvent<PivotRowStub>): PivotCellKey[] => {
      const next = new Map(pivot.getSnapshot().selection.length ? selectedRef.current : undefined);
      for (const c of pivotCells(view, event.removedCells)) next.delete(`${c.rowKey}|${c.columnKey}`);
      for (const c of pivotCells(view, event.addedCells)) next.set(`${c.rowKey}|${c.columnKey}`, c);
      return [...next.values()];
    },
    [pivot, view],
  );

  const onBeforeSelectionChange = useCallback(
    (event: DataGridSelectionChangeEvent<PivotRowStub>) => {
      const handler = pivot.handlers.onBeforeSelectionChange;
      if (!handler) return;
      const cells = nextSelection(event);
      const pivotEvent = gridEvent<Parameters<typeof handler>[0]>('beforeSelectionChange', event.source, { cells, keys: cells.map((c) => `${c.rowKey}|${c.columnKey}`) });
      handler(pivotEvent);
      if (pivotEvent.defaultPrevented) event.preventDefault();
    },
    [pivot, nextSelection],
  );
  const onSelectionChange = useCallback(
    (event: DataGridSelectionChangeEvent<PivotRowStub>) => {
      const cells = nextSelection(event);
      selectedRef.current = new Map(cells.map((c) => [`${c.rowKey}|${c.columnKey}`, c]));
      pivot.setSelection(cells, { source: event.source, confirmed: true });
    },
    [pivot, nextSelection],
  );

  const selection: DataGridProps<PivotRowStub>['selection'] = props.selection ? { mode: 'cell', multiple: typeof props.selection === 'object' ? props.selection.multiple !== false : true, cellRange: 'box' } : false;
  const pageSize = pagingOption?.rows;

  useImperativeHandle(
    props.ref,
    (): PivotTableApi<Row> => ({
      pivot,
      get element() {
        return rootRef.current;
      },
      get grid() {
        return gridRef.current;
      },
      getResult: () => pivot.result,
      getState: () => pivot.getState({ layout }),
      restoreState: (state) => pivot.restoreState(state),
      exportToExcel: (options) => runExport(pivot, 'xlsx', { rowLayout: layout, ...options }, props.exportWriters, text),
      exportToCsv: (options) => runExport(pivot, 'csv', { rowLayout: layout, ...options }, props.exportWriters, text),
      exportToPdf: (options) => runExport(pivot, 'pdf', { rowLayout: layout, ...options }, props.exportWriters, text),
      print: () => runExport(pivot, 'print', undefined, props.exportWriters, text).then(() => null),
      openFieldList: () => pivot.openDialog({ kind: 'fieldList' }),
      openCalculatedFieldEditor: (name) => pivot.openDialog({ kind: 'calculatedField', name: name ?? null }),
      openConditionalFormatEditor: () => pivot.openDialog({ kind: 'conditionalFormat' }),
      openNumberFormatEditor: (measure) => pivot.openDialog({ kind: 'numberFormat', measure: measure ?? null }),
      refresh: () => pivot.refresh(),
    }),
    [pivot, layout, props.exportWriters, text],
  );

  const busy = status === 'computing';
  // Stable identity: a new `renderEmpty` per render re-renders every grid cell (template-identity-unstable).
  const renderEmpty = useCallback(() => (busy ? null : text('empty')), [busy, text]);
  const axisBar = props.axisBar ? <PivotAxisBar pivot={pivot} {...(typeof props.axisBar === 'object' ? props.axisBar : {})} aggregateOptions={props.aggregateOptions} localeText={props.localeText} /> : null;
  const toolbar = props.toolbar?.length ? <PivotToolbar pivot={pivot} items={props.toolbar} layout={layout} exportWriters={props.exportWriters} localeText={props.localeText} /> : null;

  return (
    <div
      ref={rootRef}
      id={props.id}
      className={props.className ? `salmon-pivot-table ${props.className}` : 'salmon-pivot-table'}
      style={props.style}
      aria-busy={busy || undefined}
      data-layout={layout}
      data-status={status}
    >
      {toolbar}
      {axisBar}
      <div className="salmon-pivot-table-body">
        <DataGrid<PivotRowStub>
          ref={gridRef}
          data={rows}
          columns={columns}
          getRowId={getRowId}
          rowClassName={rowClassName}
          aria-label={props['aria-label'] ?? text('pivotTable')}
          height={props.height ?? 400}
          gridLines={props.gridLines ?? 'both'}
          striped={props.striped ?? false}
          selection={selection}
          onKeyDown={onKeyDown}
          renderEmpty={renderEmpty}
          {...defined({
            rowHeight: props.rowHeight,
            resizable: props.resizable,
            reorderable: props.reorderable,
            textWrap: props.textWrap,
            overflow: props.overflow,
            highlightOnHover: props.highlightOnHover,
            paging: pageSize ? { pageSize } : undefined,
            locale: props.locale,
            onCellClick: onCellClickProp ? onCellClick : undefined,
            onCellDoubleClick: drillThrough ? onCellDoubleClick : undefined,
            onBeforeSelectionChange: props.selection ? onBeforeSelectionChange : undefined,
            onSelectionChange: props.selection ? onSelectionChange : undefined,
          })}
        />
        {busy ? (
          <div className="salmon-pivot-table-loading" role="status">
            {props.renderLoading ? props.renderLoading({ status }) : <span className="salmon-pivot-table-spinner" aria-hidden="true" />}
            <span className="salmon-pivot-table-visually-hidden">{text('loading')}</span>
          </div>
        ) : null}
      </div>
      {columnPages > 1 ? <ColumnPager page={page} count={columnPages} onPage={setColumnPage} text={text} /> : null}
      {dialog ? (
        <Suspense fallback={null}>
          <PivotDialogs pivot={pivot as PivotController<unknown>} text={text} localeText={props.localeText} editing={props.editing as never} maxRows={maxRows} aggregateOptions={props.aggregateOptions} deferUpdate={false} anchor={dialogAnchor} />
        </Suspense>
      ) : null}
    </div>
  );
}

/**
 * Worker engines: loads the windows of the
 * rendered range after each commit and on scroll (rAF-throttled, outside
 * React state), so only visible cells cross the worker boundary.
 */
function useWindowLoader<Row>(pivot: PivotController<Row>, gridRef: { current: DataGridApi<PivotRowStub> | null }, result: PivotResult | null, columnOffset: number): void {
  useLayoutEffect(() => {
    const windowed = pivot.windowed;
    const grid = gridRef.current;
    const root = grid?.element;
    if (!windowed || !grid || !root) return;
    let frame = 0;
    const load = (): void => {
      frame = 0;
      const { rows, columns } = grid.getRenderedRange();
      windowed.ensure({ rowStart: rows.overscanStart, rowEnd: rows.overscanEnd + 1, columnStart: columnOffset + columns.overscanStart, columnEnd: columnOffset + columns.overscanEnd + 1 });
    };
    const onScroll = (): void => {
      if (!frame) frame = requestAnimationFrame(load);
    };
    load();
    root.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      root.removeEventListener('scroll', onScroll, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pivot, gridRef, result, columnOffset]);
}

function ColumnPager({ page, count, onPage, text }: { page: number; count: number; onPage: (page: number) => void; text: PivotText }) {
  return (
    <nav className="salmon-pivot-table-column-pager" aria-label={text('columnPage', { page: page + 1, count })}>
      <button type="button" className="salmon-pivot-table-button" disabled={page === 0} onClick={() => onPage(page - 1)} aria-label={text('previousColumns')}>
        ‹
      </button>
      <span aria-live="polite">{text('columnPage', { page: page + 1, count })}</span>
      <button type="button" className="salmon-pivot-table-button" disabled={page >= count - 1} onClick={() => onPage(page + 1)} aria-label={text('nextColumns')}>
        ›
      </button>
    </nav>
  );
}

/** Export and print through the lazy export chunk (never a static import of the export package). */
async function runExport<Row>(pivot: PivotController<Row>, format: 'xlsx' | 'csv' | 'pdf' | 'print', options: PivotExportOptions | undefined, writers: PivotExportWriters | undefined, text: PivotText): Promise<PivotExportFile | null> {
  const { exportPivotTable } = await import('./export-impl.js');
  return exportPivotTable(pivot as PivotController<unknown>, format, options, writers, text);
}
