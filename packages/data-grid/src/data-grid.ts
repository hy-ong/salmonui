import { expectStylesheet } from '@salmonui/core/internal/dev';
export { DataGrid } from './data-grid/DataGrid.js';
// Render feature types for the `features` prop; the values are on `@salmonui/data-grid/features`.
export type { DataGridFeature, DataGridFeatureName } from './data-grid/features/types.js';
export { DataGridAggregate, DataGridAggregateRow, DataGridColumn } from './data-grid/children.js';
export { DataGridCell, DataGridDefaultCell } from './data-grid/Cell.js';
export type { DataGridCellProps, DataGridDefaultCellProps } from './data-grid/Cell.js';
export { DataGridRow } from './data-grid/Row.js';
export type { DataGridRowProps } from './data-grid/Row.js';
export { useDataGridApi } from './data-grid/context.js';
export { DataGridGroupCaptionRow, DataGridGroupPanel } from './data-grid/Group.js';
export { DataGridFooter, DataGridGroupFooterRow, DataGridGroupIndent } from './data-grid/aggregate-rows.js';
export { SELECTION_COLUMN_ID as DATA_GRID_SELECTION_COLUMN_ID } from './data-grid/interaction.js';
export { DEFAULT_LOCALE_TEXT as DATA_GRID_DEFAULT_LOCALE_TEXT } from '@salmonui/data-grid/engine/locale';
export type { DataGridDevtoolsCommit } from './data-grid/instance.js';
export { DataGridToolbar } from './data-grid/Toolbar.js';
export { DataGridIconsProvider } from './data-grid/icons.js';
export type { DataGridIconName, DataGridIcons } from './data-grid/icons.js';
export { DataGridDefaultPager, DataGridPager } from './data-grid/Pager.js';
export { DataGridSearchBox } from './data-grid/Search.js';
export type { DataGridSearchBoxProps } from './data-grid/Search.js';
export type { DataGridEvent, DataGridEventSource } from '@salmonui/core/internal/events';
export type { DataGridApiEngine, DataGridInfiniteScroll, DataGridInfiniteScrollFacade, DataGridLoadingRowContext } from './data-grid/infinite-types.js';
export type { DataGridPersistState, DataGridStateMethods } from './data-grid/persist-state.js';
export type { DataGridState, DataGridStatePart, DataGridStateOptions, DataGridStateStorageAdapter, RestoreResult as DataGridRestoreResult } from '@salmonui/data-grid/engine/persistence';
export { deserializeDataGridState, serializeDataGridState } from '@salmonui/data-grid/engine/persistence';

// Public column view, view change, data error, column chooser render props (feature-types.ts).
export { ROW_NUMBER_COLUMN_ID as DATA_GRID_ROW_NUMBER_COLUMN_ID } from './data-grid/row-number.js';
export type {
  DataGridColumnChooserContext,
  DataGridColumnChooserItem,
  DataGridColumnInfo,
  DataGridDataErrorContext,
  DataGridSearchBoxSearchEvent,
  DataGridViewChangeEvent,
  DataGridViewChangeReason,
} from './data-grid/feature-types.js';

// Loading indicator, refresh, row and cell click events (data-ui-types.ts).
export type {
  DataGridCellClickEvent,
  DataGridDataUiApi,
  DataGridDataUiProps,
  DataGridLoadingContext,
  DataGridLoadingPhase,
  DataGridRowClickEvent,
} from './data-grid/data-ui-types.js';

// Advanced filter builder (filter-builder-types.ts).
export type { DataGridFilterBuilderApi, DataGridFilterBuilderOpenEvent, DataGridFilterBuilderProps } from './data-grid/filter-builder-types.js';
// Viewport methods: scrollTo, getPageSizeForHeight, the Gantt extension points (view-api.ts).
export type { DataGridScrollToOptions, DataGridViewApi, DataGridViewport } from './data-grid/view-api.js';

// Adaptive UI (adaptive-types.ts).
export type {
  DataGridAdaptive,
  DataGridAdaptiveApi,
  DataGridAdaptiveDialogKind,
  DataGridAdaptiveDialogOpenEvent,
  DataGridAdaptiveProps,
  DataGridAdaptiveRowLayout,
  DataGridAdaptiveTarget,
} from './data-grid/adaptive-types.js';

// Sorting, filtering, search, paging (query-types.ts).
export type {
  DataGridActionResult,
  DataGridColumnFilter,
  DataGridErrorEvent,
  DataGridFilter,
  DataGridFilterChangeEvent,
  DataGridFilterMenuOpenEvent,
  DataGridFilterCondition,
  DataGridFilterContext,
  DataGridFilterGroup,
  DataGridFilterOperator,
  DataGridFilterUi,
  DataGridFiltering,
  DataGridPageChangeEvent,
  DataGridPagerContext,
  DataGridPaging,
  DataGridQueryApi,
  DataGridQueryColumn,
  DataGridQueryProps,
  DataGridSearch,
  DataGridSearchChangeEvent,
  DataGridSortChangeEvent,
  DataGridSortDirection,
  DataGridSortItem,
  DataGridSorting,
} from './data-grid/query-types.js';

// Pinning, spans, menus, toolbar, column events (chrome-types.ts).
export type {
  DataGridChromeApi,
  DataGridChromeColumn,
  DataGridChromeProps,
  DataGridColumnChooser,
  DataGridColumnChooserOpenEvent,
  DataGridColumnDragEvent,
  DataGridColumnMenuCloseEvent,
  DataGridColumnMenuContext,
  DataGridColumnMenuItemClickEvent,
  DataGridColumnMenuItemId,
  DataGridColumnMenuOpenEvent,
  DataGridColumnPin,
  DataGridColumnPinChangeEvent,
  DataGridColumnReorderEvent,
  DataGridColumnResizeEvent,
  DataGridColumnVisibilityChangeEvent,
  DataGridCommandHandler,
  DataGridContextMenuCloseEvent,
  DataGridContextMenuContext,
  DataGridContextMenuItemClickEvent,
  DataGridContextMenuItemId,
  DataGridContextMenuOpenEvent,
  DataGridContextMenuTarget,
  DataGridMenuItem,
  DataGridMergeCells,
  DataGridPinnedColumns,
  DataGridSpan,
  DataGridSpanColumn,
  DataGridSpanContext,
  DataGridToolbarContext,
  DataGridToolbarItem,
  DataGridToolbarItemClickEvent,
  DataGridToolbarItemId,
  DataGridUiCommand,
} from './data-grid/chrome-types.js';

// Detail rows, child grids, row drag and drop (detail-types.ts).
export { defineChildGrid, DETAIL_COLUMN_ID as DATA_GRID_DETAIL_COLUMN_ID } from './data-grid/child-grid.js';
export { DataGridDetailRow, DataGridDetailToggle } from './data-grid/detail.js';
export { ROW_DRAG_COLUMN_ID as DATA_GRID_ROW_DRAG_COLUMN_ID } from './data-grid/row-drag-id.js';
export { createRowDragHandoff } from '@salmonui/data-grid/engine/row-drag-state';
export type { RowDragHandoff } from '@salmonui/data-grid/engine';
export type {
  DataGridChildGrid,
  DataGridChildGridParent,
  DataGridDetailApi,
  DataGridDetailContext,
  DataGridDetailLoadContext,
  DataGridDetailProps,
  DataGridDetailStatus,
  DataGridDetailToggleEvent,
  DataGridRowDrag,
  DataGridRowDragEvent,
  DataGridRowDragPreviewContext,
  DataGridMoveTarget,
} from './data-grid/detail-types.js';

// Tree mode (tree-types.ts): the toggle part is a static file of its own (row templates).
export { DataGridTreeToggle } from './data-grid/tree-toggle.js';
export type { DataGridTreeToggleProps } from './data-grid/tree-toggle.js';
export type {
  DataGridTree,
  DataGridTreeApi,
  DataGridTreeContext,
  DataGridTreeFilterMode,
  DataGridTreeLoadContext,
  DataGridTreeLoadStatus,
  DataGridTreeProps,
  DataGridTreeRowInfo,
  DataGridTreeToggleEvent,
} from './data-grid/tree-types.js';

// DataGrid, columns, selection, grouping, aggregates (types.ts).
export type {
  DataGridAggregateContext,
  DataGridApi,
  DataGridCellContext,
  DataGridCellKey,
  DataGridElementProps,
  DataGridEmptyContext,
  DataGridFocusedCell,
  DataGridGroupCaptionContext,
  DataGridGroupChangeEvent,
  DataGridGrouping,
  DataGridGroupToggleEvent,
  DataGridHeaderContext,
  DataGridKeyContext,
  DataGridKeyDownContext,
  DataGridKeyHandler,
  DataGridLines,
  DataGridLocaleText,
  DataGridLocaleTextKey,
  DataGridOverflow,
  DataGridPart,
  DataGridProps,
  DataGridRowContext,
  DataGridRowElementProps,
  DataGridRowInfo,
  DataGridScrollOptions,
  DataGridSelection,
  DataGridSelectionApi,
  DataGridSelectionChangeEvent,
  DataGridTextWrap,
  DataGridVirtualization,
} from './data-grid/types.js';

// Engine types and the local data source, so applications rarely import `@salmonui/data-grid/engine` directly.
export { createAggregatesModule, createGroupingModule, createLocalDataSource, defineDataGridModule, DEFAULT_KEY_BINDINGS } from '@salmonui/data-grid/engine';
export type {
  CellRange,
  CellSnapshot,
  ColumnDef,
  ColumnId,
  ColumnType,
  ColumnWidth,
  CompiledColumn,
  DataSourceRequest,
  DataSourceResult,
  FilterDescriptor,
  FormatOptions,
  DataGridApi as DataGridCoreApi,
  DataGridCommand,
  DataSource,
  DataGridEngine,
  DataGridModule,
  DataQuery,
  DataGridSnapshot,
  DataGridWarning,
  KeyBinding,
  LocalDataSource,
  RowId,
  RowSnapshot,
  AggregateType,
  AggregateValues,
  GroupDescriptor,
  GroupPathSegment,
  GroupRowSnapshot,
  SelectionSummary,
  SerializedSelection,
  SortDescriptor,
  VirtualRange,
} from '@salmonui/data-grid/engine';

// Editing (edit-types.ts).
export type {
  DataGridAddEvent,
  DataGridCellValueChangeEvent,
  DataGridCommandClickEvent,
  DataGridCommandItem,
  DataGridDeleteEvent,
  DataGridDialogContext,
  DataGridDialogField,
  DataGridDialogProps,
  DataGridEditApi,
  DataGridEditCancelEvent,
  DataGridEditColumn,
  DataGridEditing,
  DataGridEditorContext,
  DataGridEditorInputProps,
  DataGridEditorOption,
  DataGridEditorProps,
  DataGridEditorType,
  DataGridEditProps,
  DataGridEditStartEvent,
  DataGridGuardedAction,
  DataGridSaveEvent,
} from './data-grid/editing/edit-types.js';
// Clipboard and fill handle (clipboard-types.ts).
export type {
  DataGridBeforeCopyEvent,
  DataGridBeforeFillEvent,
  DataGridBeforePasteEvent,
  DataGridClipboardApi,
  DataGridClipboardCell,
  DataGridClipboardProps,
  DataGridCopyOptions,
} from './data-grid/editing/clipboard-types.js';
// Export and print (output.ts).
export { downloadBlob } from './data-grid/output.js';
export { DataGridOutputStatus } from './data-grid/OutputStatus.js';
export type {
  DataGridAfterPrintEvent,
  DataGridBeforeExportEvent,
  DataGridBeforePrintEvent,
  DataGridCsvExportOptions,
  DataGridExcelExportOptions,
  DataGridExportEvent,
  DataGridExportHooks,
  DataGridExportOptions,
  DataGridExportWriters,
  DataGridOutputApi,
  DataGridOutputColumn,
  DataGridOutputProps,
  DataGridPdfExportOptions,
  DataGridPrinting,
  DataGridPrintOptions,
} from './data-grid/output.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/data-grid', 'salmon-data-grid');
