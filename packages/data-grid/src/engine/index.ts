export { createDataGridEngine, defineDataGridModule, orderModules } from './engine.js';
export type { ColumnsModule, DataGridEngineWithModules, ModuleFacade } from './engine.js';
export { createDataGridApi, findColumn, rowIdFromKey } from './api.js';
export type { FilterColumnOptions, DataGridApi } from './api.js';
export { createLocalDataSource } from './local-data-source.js';
export type { LocalDataSourceOptions } from './local-data-source.js';
export { createDataGridQuery, deserializeDataGridQuery, EMPTY_GRID_QUERY, serializeDataGridQuery } from './query.js';
export { createRowModel, dataRowCount, getSourceIndex, PIPELINE_STAGE_RANKS } from './pipeline.js';
export { fitColumnWidths, type FitColumn } from './column-fit.js';
export { clampColumnWidth, columnZone, declaredZone, isColumnVisible, orderLeaves, previewColumnsCommand, resolveColumnKeys, resolveColumnWidth, TYPE_INFERENCE_SAMPLE } from './columns.js';
export type {
  ColumnFreeze,
  ColumnKeyKind,
  ColumnZone,
  ColumnsCommand,
  ColumnsHideCommand,
  ColumnsMoveCommand,
  ColumnsSetFreezeCommand,
  ColumnsSetFrozenCountCommand,
  ColumnsSetPinningCommand,
  ColumnsSetOrderCommand,
  ColumnsSetVisibilityCommand,
  ColumnsSetWidthCommand,
  ColumnsSetWidthsCommand,
  ColumnsShowCommand,
  ColumnsState,
  ColumnsStateInit,
} from './columns.js';
export {
  computeRange,
  createColumnMetrics,
  createFixedRowMetrics,
  createScrollMapping,
  createVariableRowMetrics,
  DEFAULT_MAX_SCROLL_HEIGHT,
  EMPTY_RANGE,
  sameRange,
} from '@salmonui/core/virtual';
export type { ColumnMetrics, RowMetrics, ScrollMapping, VariableRowMetrics, VirtualRange } from '@salmonui/core/virtual';
export { isJsonValue, shallowEqual } from '@salmonui/core/data';
export { createSortModule, effectiveSortKeys, getSortInfo, sortRowOrder } from './sort.js';
export type {
  SortClearCommand,
  SortSetOptionsCommand,
  SortColumnCommand,
  SortCommand,
  SortDescriptorInput,
  SortMode,
  SortModule,
  SortOptions,
  SortRemoveCommand,
  SortSetCommand,
  SortState,
  SortToggleCommand,
} from './sort.js';
export { BLANK_FACET_KEY, createFilterModule, filtersNarrow, getColumnFilters } from './filter.js';
export { compilePattern, normalizeFilterOperator } from '@salmonui/core/data';
export type {
  ColumnFacet,
  CustomFilterOperator,
  CustomOperatorContext,
  FacetOptions,
  FacetValue,
  FilterAddCommand,
  FilterByColumnCommand,
  FilterClearCommand,
  FilterSetOptionsCommand,
  FilterCommand,
  FilterConditionInput,
  FilterEntryInput,
  FilterGroupInput,
  FilterMethods,
  FilterModule,
  FilterModuleConfig,
  FilterOptions,
  FilterRemoveCommand,
  FilterSetCommand,
  FilterState,
} from './filter.js';
export { createSearchModule, searchColumns, searchRowOrder } from './search.js';
export type { SearchClearCommand, SearchCommand, SearchModule, SearchOptions, SearchSetCommand, SearchState } from './search.js';
export { createPagingModule } from './paging.js';
export type {
  PageInfo,
  PagingCommand,
  PagingFirstCommand,
  PagingGoToPageCommand,
  PagingLastCommand,
  PagingMethods,
  PagingModule,
  PagingNextCommand,
  PagingOptions,
  PagingPreviousCommand,
  PagingSetEnabledCommand,
  PagingSetPageSizeCommand,
  PagingSetTotalRowCountCommand,
  PagingState,
} from './paging.js';
export { createGroupingModule, groupTargetKey } from './grouping.js';
export type {
  GroupDescriptorInput,
  GroupingClearCommand,
  GroupingCollapseAllCommand,
  GroupingCommand,
  GroupingExpandAllCommand,
  GroupingGroupByCommand,
  GroupingLoadMoreCommand,
  GroupingMethods,
  GroupingModule,
  GroupingMoveCommand,
  GroupingOptions,
  GroupingRetryCommand,
  GroupingSetCommand,
  GroupingSetDirectionCommand,
  GroupingSetEnabledCommand,
  GroupingSetExpandedCommand,
  GroupingSetOptionsCommand,
  GroupingState,
  GroupingToggleCommand,
  GroupingUngroupCommand,
  GroupRowSnapshot,
  GroupTarget,
} from './grouping.js';
export { GROUP_FOOTER_ID_PREFIX, GROUP_ID_PREFIX } from './group-tree.js';
export { AGGREGATE_TYPES, createAggregatesModule } from './aggregates.js';
export type {
  AggregateInput,
  AggregateScope,
  AggregatesCommand,
  AggregatesMethods,
  AggregatesModule,
  AggregatesOptions,
  AggregatesSetCommand,
  AggregatesSetScopeCommand,
  AggregatesState,
  CustomAggregate,
} from './aggregates.js';
export type { LazyStatus } from './lazy-groups.js';
export { createSelectionApi, createSelectionModule } from './selection.js';
export type {
  CellKey,
  CellRange,
  CellSelectionMode,
  CheckboxMode,
  ResolvedSelectionOptions,
  RowSelection,
  SelectionApi,
  SelectionChange,
  SelectionClearCommand,
  SelectionCommand,
  SelectionExtendCellSelectionCommand,
  SelectionMethods,
  SelectionMode,
  SelectionModule,
  SelectionOptions,
  SelectionPreview,
  SelectionRestoreCommand,
  SelectionSelectAllFilteredCommand,
  SelectionSelectAllVisibleCommand,
  SelectionSelectCellsCommand,
  SelectionSelectColumnsCommand,
  SelectionSelectRangeCommand,
  SelectionSelectRowsCommand,
  SelectionSetCellRangeCommand,
  SelectionSetOptionsCommand,
  SelectionState,
  SelectionSummary,
  SelectionToggleAllCommand,
  SelectionToggleRowCommand,
  SelectionType,
  SerializedSelection,
} from './selection.js';
export { createFocusModule, visibleColumnIndex } from './focus.js';
export type {
  FocusCommand,
  FocusDirection,
  FocusIntent,
  FocusMethods,
  FocusModule,
  FocusMoveCommand,
  FocusOptions,
  FocusSetCommand,
  FocusSetDirectionCommand,
  FocusSetModeCommand,
  FocusState,
  FocusTarget,
} from './focus.js';
export type { CellSpanBlock, CellSpanResolver } from './cell-spans.js';
export { createKeymap, DEFAULT_KEY_BINDINGS, keyComboFromEvent, normalizeKeyCombo } from './keyboard.js';
export type { KeyBinding, KeyBindingOverrides, KeyContext, KeyEventLike, Keymap, KeymapOptions, KeyPlatform } from './keyboard.js';
// Editing runtime code is published only on the ./edit, ./validation and
// ./clipboard subpaths (root bundle budget); types stay here.
export type {
  EditAddRecordCommand,
  EditApi,
  EditBatchChanges,
  EditDataChanges,
  EditCancelBatchCommand,
  EditCancelCommand,
  EditCellContext,
  EditChange,
  EditCommand,
  EditCommitAndMoveCommand,
  EditCommitCommand,
  EditDeleteRecordsCommand,
  EditDisplay,
  EditDraft,
  EditMessages,
  EditMessageTable,
  EditMethods,
  EditMode,
  EditModule,
  EditOptions,
  EditPreview,
  EditPreviewCell,
  EditRedoCommand,
  EditRestoreRecordsCommand,
  EditSaveBatchCommand,
  EditSetOptionsCommand,
  EditSetValueCommand,
  EditSetValuesCommand,
  EditSettleCommand,
  EditSnapshot,
  EditStartCommand,
  EditState,
  EditStatus,
  EditTarget,
  EditUndoCommand,
  EditUpdateCellCommand,
  EditUpdateRowCommand,
  EditValidateBatchCommand,
  EditWriteOutcome,
  ResolvedEditOptions,
  RowValidationContext,
  RowValidator,
} from './edit.js';
export type { CompiledValidator, CustomValidator, RuleValue, ColumnValidation, FieldValidation, FieldValidatorContext, FormDataLike, ValidationMessages, ValidatorContext } from '@salmonui/core/validation';
export type { ClipboardCommand, ClipboardCopy, ClipboardFillCommand, ClipboardMethods, ClipboardModule, ClipboardOptions, ClipboardPasteCommand, ClipboardState, CopyOptions, PasteResult } from './clipboard.js';
// Optional feature modules (detail rows, hierarchy, row drag and drop, lookup
// columns, state persistence, locale, edit, validation, clipboard, export)
// are published only on their
// subpaths (`./expansion.js`, ...); the root re-exports their
// types only, which costs nothing at runtime.
export type { DetailResolver } from './detail-view.js';
export type { DetailCommand, DetailInfo, DetailLoadContext, DetailLoadSnapshot, DetailMethods, DetailModule, DetailOptions, DetailState } from './expansion.js';
export type { ChildGridConfig, ChildGridDescriptor, ChildGridParent, ChildRelation, ChildScope, HierarchyMethods, HierarchyModule, HierarchyOptions, HierarchyState } from './hierarchy.js';
export type {
  DropPoint,
  DropPosition,
  DropTarget,
  RowDragCommand,
  RowDragDropMethods,
  RowDragDropModule,
  RowDragDropOptions,
  RowDragDropState,
  RowDragEventInfo,
  RowDragHandoff,
  RowDragPayload,
  RowDragSession,
  RowDropStatus,
} from './row-drag-drop.js';
export type { SparseRowMetrics, SparseRows } from './sparse-metrics.js';
export { DEFAULT_DEV } from './dev.js';
export type * from './types.js';

import type { ColumnsCommand } from './columns.js';
import type { FilterCommand } from './filter.js';
import type { FocusCommand } from './focus.js';
import type { SelectionCommand } from './selection.js';
import type { PagingCommand } from './paging.js';
import type { SearchCommand } from './search.js';
import type { SortCommand } from './sort.js';
import type { GroupingCommand } from './grouping.js';
import type { AggregatesCommand } from './aggregates.js';
import type { EditCommand } from './edit.js';
import type { ClipboardCommand } from './clipboard.js';
/** Union of the commands declared by the modules shipped with the core. */
export type CoreCommand =
  | ColumnsCommand
  | SortCommand
  | FilterCommand
  | SearchCommand
  | PagingCommand
  | SelectionCommand
  | FocusCommand
  | GroupingCommand
  | AggregatesCommand
  | EditCommand
  | ClipboardCommand;
export type {
  ColumnLookup,
  ColumnLookupStatus,
  CompiledLookup,
  LookupCommand,
  LookupLoadedCommand,
  LookupMethods,
  LookupModule,
  LookupReloadCommand,
  LookupRequest,
  LookupSource,
  LookupState,
  LookupStatus,
} from './lookup.js';
export type {
  DeserializeDataGridStateOptions,
  DataGridPersistence,
  DataGridPersistenceOptions,
  DataGridState,
  DataGridStateApi,
  DataGridStateOptions,
  DataGridStatePart,
  DataGridStateStorageAdapter,
  PersistedColumn,
  PersistedFilter,
  PersistedFilterCondition,
  PersistedFilterGroup,
  PersistedPinning,
  RestoreResult,
} from './persistence.js';
export type {
  Formatter,
  FormatterOptions,
  LocaleInput,
  LocaleMessage,
  LocaleText,
  LocaleTextCommand,
  LocaleTextKey,
  LocaleTextMethods,
  LocaleTextModule,
  LocaleTextParams,
  LocaleTextSetCommand,
  LocaleTextState,
  ResolvedLocale,
} from './locale.js';
