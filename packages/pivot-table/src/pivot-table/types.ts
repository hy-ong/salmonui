// Public React types of `@salmonui/pivot-table`. The engine types (`PivotModel`,
// `PivotResult`, ...) come from `@salmonui/pivot-table/engine`.

import type { CSSProperties, ReactNode } from 'react';
import type {
  PivotAggregate,
  PivotCalculatedField,
  PivotCell,
  PivotComputeStatus,
  PivotCustomAggregator,
  PivotFieldDefinition,
  PivotFieldInfo,
  PivotFilter,
  PivotHeaderNode,
  PivotMemberPath,
  PivotMemberSort,
  PivotModel,
  PivotModelInput,
  PivotResult,
  PivotValueSort,
} from '@salmonui/pivot-table/engine';
import type { DataGridEvent, DataGridEventSource } from '@salmonui/data-grid';

/** Base of every pivot event (the Data Grid event model: before-events cancel with `preventDefault()`). */
export type PivotEvent = DataGridEvent;
export type PivotEventSource = DataGridEventSource;

/** The four report axes plus `null` (not on the report). */
export type PivotAxis = 'rows' | 'columns' | 'values' | 'filters';

/** What a model change does. */
export type PivotAction =
  | 'set'
  | 'prop'
  | 'moveField'
  | 'removeField'
  | 'filter'
  | 'sort'
  | 'valueSort'
  | 'aggregate'
  | 'expand'
  | 'collapse'
  | 'expandAll'
  | 'collapseAll'
  | 'calculatedField'
  | 'format'
  | 'conditionalFormat'
  | 'group'
  | 'totals'
  | 'apply'
  | 'restore';

/** `onBeforePivotModelChange` / `onPivotModelChange`. */
export interface PivotModelChangeEvent extends PivotEvent {
  readonly action: PivotAction;
  /** The model proposed (before) or applied (after). */
  readonly model: PivotModel;
  readonly previousModel: PivotModel;
  /** Field the action is about, or null. */
  readonly field: string | null;
}

/** `onBeforeExpandedChange` / `onExpandedChange`. */
export interface PivotExpandedChangeEvent extends PivotEvent {
  readonly action: 'expand' | 'collapse' | 'expandAll' | 'collapseAll';
  /** The member drilled, or null for expand / collapse all. */
  readonly path: PivotMemberPath | null;
  readonly axis: 'rows' | 'columns' | null;
  readonly expanded: boolean;
}

/** `onBeforeFilterChange` / `onFilterChange`. */
export interface PivotFilterChangeEvent extends PivotEvent {
  readonly field: string;
  readonly filter: PivotFilter | null;
  readonly previousFilter: PivotFilter | null;
}

/** `onBeforeSortChange` / `onSortChange` (member sort and value sort). */
export interface PivotSortChangeEvent extends PivotEvent {
  readonly field: string | null;
  readonly sort: PivotMemberSort | null;
  readonly valueSort: PivotValueSort | null;
}

/** `onBeforeFieldMove` / `onFieldMove`. */
export interface PivotFieldMoveEvent extends PivotEvent {
  readonly field: string;
  readonly from: PivotAxis | null;
  /** Null removes the field from the report. */
  readonly to: PivotAxis | null;
  readonly index: number;
}

/** `onBeforeMemberEditorOpen`. */
export interface PivotMemberEditorOpenEvent extends PivotEvent {
  readonly field: string;
}

/** `onBeforeAggregateMenuOpen`. */
export interface PivotAggregateMenuOpenEvent extends PivotEvent {
  readonly field: string;
  /** Position in `pivotModel.values`. */
  readonly index: number;
  /** Aggregates offered; edit with `items` (mutable copy). */
  readonly items: PivotAggregate[];
}

/** `onBeforeCalculatedFieldChange` / `onCalculatedFieldChange`. */
export interface PivotCalculatedFieldChangeEvent extends PivotEvent {
  readonly name: string;
  /** The new definition, or null when removed. */
  readonly calculatedField: PivotCalculatedField | null;
  readonly previous: PivotCalculatedField | null;
}

/** `onComputeStart` / `onComputeEnd`. */
export interface PivotComputeEvent extends PivotEvent {
  readonly phase: 'initial' | 'update';
  readonly status: PivotComputeStatus;
  /** Milliseconds from start to end (end event only; 0 on start). */
  readonly duration: number;
  readonly result: PivotResult | null;
}

/** `onError`. */
export interface PivotErrorEvent extends PivotEvent {
  readonly error: Error;
  readonly action: PivotAction | 'compute' | 'drillThrough' | 'export' | 'restore';
}

/** `onBeforeDrillThrough` / `onDrillThrough`. */
export interface PivotDrillThroughEvent<Row = unknown> extends PivotEvent {
  readonly rowKey: string;
  readonly columnKey: string;
  readonly measure: string | null;
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly cell: PivotCell;
  /** The raw rows behind the cell (computed on call). */
  rows(): readonly Row[];
}

/** `onDataChange`: drill-through edits wrote these rows. */
export interface PivotDataChangeEvent<Row = unknown> {
  readonly data: readonly Row[];
  readonly changes: readonly { readonly index: number; readonly row: Row; readonly previous: Row | undefined }[];
  readonly action: 'update' | 'add' | 'delete';
}

/** A selected cell (`rowKey|columnKey`). */
export interface PivotCellKey {
  readonly rowKey: string;
  readonly columnKey: string;
}

/** `onBeforeSelectionChange` / `onSelectionChange`. */
export interface PivotSelectionChangeEvent extends PivotEvent {
  readonly cells: readonly PivotCellKey[];
  /** `rowKey|columnKey` strings. */
  readonly keys: readonly string[];
}

/** `onCellClick`. */
export interface PivotCellClickEvent extends PivotEvent {
  /** Value cell, or null for a row header cell. */
  readonly cell: PivotCell | null;
  /** Row header of the clicked row. */
  readonly rowHeader: PivotHeaderNode;
  readonly rowKey: string;
  readonly columnKey: string | null;
  readonly element: HTMLElement;
  readonly nativeEvent: MouseEvent;
}

/** `onBeforeExport` / `onExport`. */
export interface PivotExportEvent extends PivotEvent {
  readonly format: 'xlsx' | 'csv' | 'pdf' | 'print';
  readonly fileName: string;
}

/** Event handlers shared by `usePivot()` and `PivotTable` (the controller reads the latest ones). */
export interface PivotEventHandlers<Row = unknown> {
  onBeforePivotModelChange?: ((event: PivotModelChangeEvent) => void) | undefined;
  onPivotModelChange?: ((event: PivotModelChangeEvent) => void) | undefined;
  onBeforeExpandedChange?: ((event: PivotExpandedChangeEvent) => void) | undefined;
  onExpandedChange?: ((event: PivotExpandedChangeEvent) => void) | undefined;
  onBeforeFilterChange?: ((event: PivotFilterChangeEvent) => void) | undefined;
  onFilterChange?: ((event: PivotFilterChangeEvent) => void) | undefined;
  onBeforeSortChange?: ((event: PivotSortChangeEvent) => void) | undefined;
  onSortChange?: ((event: PivotSortChangeEvent) => void) | undefined;
  onBeforeFieldMove?: ((event: PivotFieldMoveEvent) => void) | undefined;
  onFieldMove?: ((event: PivotFieldMoveEvent) => void) | undefined;
  onBeforeMemberEditorOpen?: ((event: PivotMemberEditorOpenEvent) => void) | undefined;
  onBeforeAggregateMenuOpen?: ((event: PivotAggregateMenuOpenEvent) => void) | undefined;
  onBeforeCalculatedFieldChange?: ((event: PivotCalculatedFieldChangeEvent) => void) | undefined;
  onCalculatedFieldChange?: ((event: PivotCalculatedFieldChangeEvent) => void) | undefined;
  onBeforeDrillThrough?: ((event: PivotDrillThroughEvent<Row>) => void) | undefined;
  onDrillThrough?: ((event: PivotDrillThroughEvent<Row>) => void) | undefined;
  onBeforeSelectionChange?: ((event: PivotSelectionChangeEvent) => void) | undefined;
  onSelectionChange?: ((event: PivotSelectionChangeEvent) => void) | undefined;
  onDataChange?: ((event: PivotDataChangeEvent<Row>) => void) | undefined;
  onComputeStart?: ((event: PivotComputeEvent) => void) | undefined;
  onComputeEnd?: ((event: PivotComputeEvent) => void) | undefined;
  onBeforeExport?: ((event: PivotExportEvent) => void) | undefined;
  onExport?: ((event: PivotExportEvent) => void) | undefined;
  onError?: ((event: PivotErrorEvent) => void) | undefined;
}

/** A Worker (or a `MessagePort`-like object) running `@salmonui/pivot-table/engine/worker`. */
export interface PivotWorkerLike {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  terminate?(): void;
}

/** Options of `usePivot()` (and the matching `PivotTable` props). */
export interface UsePivotOptions<Row = unknown> extends PivotEventHandlers<Row> {
  /** Raw rows by reference. Reactive: a new array re-aggregates (incrementally for small deltas). */
  data?: readonly Row[] | undefined;
  /** Field definitions; inferred from the first rows when omitted. Read on creation. */
  fields?: readonly PivotFieldDefinition<Row>[] | undefined;
  /** Reactive report model: re-applied when it changes structurally, never reset by an equal fresh literal. */
  pivotModel?: PivotModelInput | undefined;
  /** Initial report model (uncontrolled). */
  defaultPivotModel?: PivotModelInput | undefined;
  locale?: string | undefined;
  customAggregates?: Readonly<Record<string, PivotCustomAggregator>> | undefined;
  /** Pure value override per cell. */
  getCellValue?: ((cell: PivotCell) => number | null) | undefined;
  /**
   * Runs the engine in this Worker (`new Worker(new URL('@salmonui/pivot-table/engine/worker', import.meta.url), { type: 'module' })`).
   * Read on creation. The server renders the loading state.
   */
  worker?: PivotWorkerLike | undefined;
  /**
   * Rows above which the first compute is deferred to the client after the first paint (the server renders the
   * header and a loading state, `aria-busy`). Default 50,000.
   */
  deferComputeAbove?: number | undefined;
  /**
   * Creates the engine instead of the local one (a remote pivot source: `(o) => source.createEngine(o)` from
   * `createJsonPivotSource()` of `@salmonui/data/json`). Its commands may answer asynchronously. Read on
   * creation; the server renders the loading state.
   */
  createEngine?: ((options: { readonly model: unknown; readonly locale?: string | undefined }) => unknown) | undefined;
}

/** Snapshot of the controller store; every field keeps its identity until it changes. */
export interface PivotState {
  readonly result: PivotResult | null;
  readonly model: PivotModel;
  /** Draft model of a field list with `deferUpdate`; null when nothing is pending. */
  readonly draft: PivotModel | null;
  readonly status: PivotComputeStatus;
  readonly error: Error | null;
  readonly fields: readonly PivotFieldInfo[];
  /** Selected cells as `rowKey|columnKey`. */
  readonly selection: readonly string[];
  /** Open dialog of the pivot parts (field list popup, editors, drill through), or null. */
  readonly dialog: PivotDialogState | null;
}

export type PivotDialogState =
  | { readonly kind: 'fieldList' }
  | { readonly kind: 'memberEditor'; readonly field: string }
  | { readonly kind: 'calculatedField'; readonly name: string | null }
  | { readonly kind: 'numberFormat'; readonly measure: string | null }
  | { readonly kind: 'conditionalFormat' }
  | { readonly kind: 'grouping'; readonly field: string }
  | { readonly kind: 'drillThrough'; readonly rowIndex: number; readonly columnIndex: number; readonly rowKey: string; readonly columnKey: string };

/** Options of a model command. */
export interface PivotCommandOptions {
  /** Input that caused the command. Default `'api'`. */
  readonly source?: PivotEventSource | undefined;
  /** Edit the draft model (a field list with `deferUpdate`) instead of the applied one. */
  readonly draft?: boolean | undefined;
}

/** Serializable state (`api.getState()`). */
export interface PivotTableState {
  /** Schema version; `restoreState()` rejects newer versions. */
  readonly version: 1;
  readonly pivotModel: PivotModel;
  readonly layout?: 'compact' | 'tabular' | undefined;
  /** User column widths by column key. */
  readonly columnWidths?: Readonly<Record<string, number>> | undefined;
}

/** Persistence. */
export interface PivotPersistState {
  /** Storage key suffix: `salmon-pivot-table:<id>`. */
  readonly id: string;
  /** Default `localStorage`. */
  readonly storage?: { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem?(key: string): void } | undefined;
  /** Saved states of another application version are ignored. */
  readonly version?: string | undefined;
}

/** Context of `renderCell` / `getCellClassName`. */
export interface PivotCellContext {
  readonly cell: PivotCell;
  readonly rowHeader: PivotHeaderNode;
  readonly columnHeader: PivotHeaderNode;
  readonly selected: boolean;
  /** The default content (the formatted value, or `emptyCellText`). */
  readonly defaultContent: ReactNode;
}

/** Context of `renderHeader`: row and column headers. */
export interface PivotHeaderContext {
  readonly header: PivotHeaderNode;
  readonly axis: 'rows' | 'columns';
  readonly defaultContent: ReactNode;
}

/** Context of `renderTooltip`. */
export interface PivotTooltipContext {
  readonly cell: PivotCell;
  readonly rowHeader: PivotHeaderNode;
  readonly columnHeader: PivotHeaderNode;
}

/** Context of `renderLoading`. */
export interface PivotLoadingContext {
  readonly status: PivotComputeStatus;
}

export type PivotTableLayout = 'compact' | 'tabular';

export interface PivotAxisBarOptions {
  /** The fields panel (fields not on the report). Default false. */
  readonly showFieldsPanel?: boolean | undefined;
  /** Aggregate menu on value field buttons. Default true. */
  readonly showAggregate?: boolean | undefined;
  readonly showFilter?: boolean | undefined;
  readonly showSort?: boolean | undefined;
  readonly showRemove?: boolean | undefined;
  readonly draggable?: boolean | undefined;
  /** Axes shown. Default every axis. */
  readonly axes?: readonly PivotAxis[] | undefined;
}

export type PivotToolbarItemId =
  | 'fieldList'
  | 'totals'
  | 'subtotals'
  | 'grandTotals'
  | 'formatting'
  | 'numberFormat'
  | 'conditionalFormat'
  | 'calculatedField'
  | 'export'
  | 'expandAll'
  | 'collapseAll';

export interface PivotToolbarItem {
  readonly id: string;
  readonly label?: ReactNode | undefined;
  /** Custom content; the item is then rendered as is. */
  readonly render?: (() => ReactNode) | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly disabled?: boolean | undefined;
}

/** Display props forwarded to the Data Grid renderer by whitelist. */
export interface PivotDisplayProps {
  rowHeight?: number | undefined;
  /** Value column width in px. Default 120. */
  columnWidth?: number | undefined;
  /** Row header column width in px (compact) or per row field (tabular). Default 220 / 150. */
  rowHeaderWidth?: number | undefined;
  height?: number | string | undefined;
  resizable?: boolean | undefined;
  reorderable?: boolean | undefined;
  textWrap?: boolean | 'header' | 'content' | 'both' | undefined;
  overflow?: 'clip' | 'ellipsis' | 'ellipsisWithTooltip' | undefined;
  gridLines?: 'default' | 'both' | 'none' | 'horizontal' | 'vertical' | undefined;
  striped?: boolean | undefined;
  highlightOnHover?: boolean | undefined;
}

export type { PivotState as PivotControllerState };
export type PivotStyleProps = { className?: string; style?: CSSProperties };
