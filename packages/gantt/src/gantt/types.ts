// Public types of `Gantt`. Options props are reactive and
// re-applied when they change, user actions fire before / after pairs that
// cancel with `preventDefault()`, and `ref` receives the `GanttApi`, which
// extends the `DataGridApi` of the grid pane. Grid-pane props keep their Data
// Grid names (`GanttGridProps`).

import type { CSSProperties, ReactNode, Ref } from 'react';
import type { RowId } from '@salmonui/core/data';
import type { DataGridApi, DataGridColumn, DataGridProps } from '@salmonui/data-grid';
import type { DataGridContextMenuItemId, DataGridMenuItem } from '@salmonui/data-grid';
import type { DataGridExportOptions } from '@salmonui/data-grid';
import type { DataGridEvent } from '@salmonui/data-grid';
import type { DataSource } from '@salmonui/data-grid/engine';
import type {
  ConstraintType,
  Dependency,
  DependencyType,
  DurationUnit,
  ScheduleConflict,
  TaskMode,
  TaskType,
  WorkUnit,
} from '../internal/timeline/project/types.js';
import type { ScaleUnit } from '../internal/timeline/scale.js';
import type { GanttLocaleText } from './locale.js';

export type { ConstraintType, Dependency as GanttDependency, DependencyType as GanttDependencyType, DurationUnit as GanttDurationUnit, TaskMode as GanttTaskMode, TaskType as GanttTaskType, WorkUnit as GanttWorkUnit, ScaleUnit as GanttTimeUnit };

/** A date value accepted by the task roles: `Date`, ISO string, epoch ms or a plain date-time (`{ year, month, day, hour?, minute? }`). */
export type GanttDateInput = Date | string | number | { readonly year: number; readonly month: number; readonly day: number; readonly hour?: number; readonly minute?: number };

/** `taskFields`: the row property that holds each task role. Defaults are the role names. */
export interface GanttTaskFields {
  readonly id?: string;
  readonly title?: string;
  readonly start?: string;
  readonly end?: string;
  readonly duration?: string;
  readonly durationUnit?: string;
  readonly progress?: string;
  /** Flat data: the parent task id. */
  readonly parentId?: string;
  /** Nested data: the child task array. Default `'children'` when `parentId` is not mapped. */
  readonly children?: string;
  readonly predecessors?: string;
  readonly milestone?: string;
  readonly notes?: string;
  readonly baselineStart?: string;
  readonly baselineEnd?: string;
  readonly baselineDuration?: string;
  readonly resources?: string;
  readonly work?: string;
  readonly taskType?: string;
  readonly manual?: string;
  readonly segments?: string;
  readonly indicators?: string;
  readonly expanded?: string;
  readonly constraintType?: string;
  readonly constraintDate?: string;
  readonly calendar?: string;
  readonly className?: string;
}

export type GanttTaskRole = Exclude<keyof GanttTaskFields, 'children'>;

/** `workingTime`: hours as decimals (`8`, `17.5`); `week` overrides `dayRanges` per weekday (0 = Sunday). */
export interface GanttWorkingTime {
  readonly dayRanges?: readonly { readonly from: number; readonly to: number }[];
  readonly week?: Partial<Readonly<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, readonly { readonly from: number; readonly to: number }[]>>>;
  readonly workDays?: readonly number[];
  readonly includeWeekend?: boolean;
  readonly hoursPerDay?: number;
  readonly daysPerWeek?: number;
  readonly daysPerMonth?: number;
}

/** A holiday: shaded and non-working for the engine. */
export interface GanttHoliday {
  readonly start: GanttDateInput;
  /** Inclusive day (default `start`). */
  readonly end?: GanttDateInput;
  readonly label?: string;
  readonly className?: string;
}

/** A named working calendar. `exceptions` without `ranges` are non-working. */
export interface GanttCalendar {
  readonly id: string;
  readonly workingTime?: GanttWorkingTime;
  readonly exceptions?: readonly { readonly start: GanttDateInput; readonly end?: GanttDateInput; readonly ranges?: readonly { readonly from: number; readonly to: number }[] }[];
}

/** An event marker. */
export interface GanttMarker {
  readonly date: GanttDateInput;
  readonly label?: string;
  readonly className?: string;
}

/** One timeline tier. */
export interface GanttTier {
  readonly unit: ScaleUnit;
  readonly count?: number;
  /** `Intl.DateTimeFormat` options for the cell text. */
  readonly format?: Intl.DateTimeFormatOptions;
  readonly render?: (ctx: GanttTimelineCellContext) => ReactNode;
}

/** `timeline.renderCell` / tier `render` context. */
export interface GanttTimelineCellContext {
  readonly tier: 'top' | 'bottom';
  /** Cell start as a `Date` whose UTC fields are the wall time in `timeZone`. */
  readonly date: Date;
  readonly unit: ScaleUnit;
  readonly width: number;
  readonly text: string;
}

/** A zoom level: two tiers and the bottom-tier cell width. */
export interface GanttZoomLevel {
  readonly top?: GanttTier | null;
  readonly bottom: GanttTier;
  readonly unitWidth?: number;
}

/** `timeline`. */
export interface GanttTimeline {
  /** Tier preset. Default `'week'`. */
  readonly mode?: 'hour' | 'day' | 'week' | 'month' | 'year';
  readonly topTier?: GanttTier | null;
  readonly bottomTier?: GanttTier;
  /** Width of one bottom-tier cell in px (`timelineUnitSize`). Default 33. */
  readonly unitWidth?: number;
  /** First day of week (0 = Sunday). Default from `locale`. */
  readonly weekStart?: number;
  readonly renderCell?: (ctx: GanttTimelineCellContext) => ReactNode;
  /** Extends the range when scrolled to an edge (`enableInfiniteTimelineScroll`). */
  readonly infinite?: boolean;
  /** Tier cell tooltips (the full date). Default true. */
  readonly tooltips?: boolean;
}

/** `splitter`. */
export interface GanttSplitter {
  /** Grid pane width (px or `'40%'`). */
  readonly position?: number | string;
  /** Grid pane ends after this column (wins over `position`). */
  readonly columnIndex?: number;
  readonly minSize?: number;
}

/** A taskbar render context. */
export interface GanttTaskbarContext<Row> {
  readonly task: Row;
  readonly info: GanttTaskInfo;
  readonly start: Date | null;
  readonly end: Date | null;
  readonly progress: number;
  readonly width: number;
  readonly critical: boolean;
  readonly selected: boolean;
}

/** `getTaskbarProps` result: applied to the taskbar part. */
export interface GanttTaskbarProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly [data: `data-${string}`]: string | number | boolean | undefined;
}

/** Label value: a field name or a render function. */
export type GanttLabel<Row> = string | ((ctx: GanttTaskbarContext<Row>) => ReactNode);

/** `tooltip`. */
export interface GanttTooltipOptions<Row> {
  readonly renderTaskbar?: (ctx: GanttTaskbarContext<Row>) => ReactNode;
  readonly renderBaseline?: (ctx: GanttTaskbarContext<Row>) => ReactNode;
  readonly renderConnector?: (ctx: { readonly from: Row; readonly to: Row; readonly dependency: Dependency }) => ReactNode;
  readonly renderEditing?: (ctx: GanttTaskbarContext<Row> & { readonly action: GanttTaskbarAction }) => ReactNode;
  readonly renderTimeline?: (ctx: GanttTimelineCellContext) => ReactNode;
}

/** A task indicator. */
export interface GanttIndicator {
  readonly date: GanttDateInput;
  readonly label?: string;
  readonly icon?: ReactNode;
  readonly tooltip?: string;
  readonly className?: string;
}

export type GanttTaskbarAction = 'move' | 'resizeStart' | 'resizeEnd' | 'progress' | 'connect' | 'segmentMove' | 'segmentResize';

/** Computed task information (`getTaskInfo`). */
export interface GanttTaskInfo {
  readonly id: RowId;
  readonly parentId: RowId | null;
  readonly level: number;
  readonly start: Date | null;
  readonly end: Date | null;
  readonly duration: number;
  readonly durationUnit: DurationUnit;
  readonly progress: number;
  readonly milestone: boolean;
  readonly parent: boolean;
  readonly manual: boolean;
  readonly unscheduled: boolean;
  readonly work: number;
  readonly wbs: string;
  readonly critical: boolean;
  /** Total float in hours of working time (valid with `criticalPath`). */
  readonly totalFloat: number;
  readonly predecessors: readonly Dependency[];
  readonly segments: readonly { readonly start: Date; readonly end: Date }[] | null;
}

export type GanttEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Base of Gantt events: the Data Grid event shape. */
export type GanttEvent = DataGridEvent;

export interface GanttTaskbarEditEvent<Row> extends GanttEvent {
  readonly action: GanttTaskbarAction;
  readonly taskId: RowId;
  readonly task: Row;
  /** Proposed dates and progress (start of the edit in `onTaskbarEditStart`). */
  readonly start: Date | null;
  readonly end: Date | null;
  readonly progress: number;
  /** For `'connect'`: the link being drawn. */
  readonly dependency?: Dependency & { readonly to: RowId };
  readonly segmentIndex?: number;
}

export interface GanttDependencyChangeEvent<Row> extends GanttEvent {
  readonly action: 'add' | 'remove' | 'update';
  readonly taskId: RowId;
  readonly task: Row | null;
  readonly dependencies: readonly Dependency[];
  readonly previous: readonly Dependency[];
}

export interface GanttScheduleConflictEvent<Row> extends GanttEvent {
  readonly conflicts: readonly (ScheduleConflict & { readonly task: Row | null })[];
  /** Settles the conflict: keep the link and move the task, remove the link, or cancel the change. Default: the built-in dialog asks. */
  resolve(choice: 'move' | 'removeLink' | 'cancel'): void;
}

export interface GanttTaskChangeEvent<Row> extends GanttEvent {
  readonly action: 'add' | 'update' | 'delete' | 'indent' | 'outdent' | 'move' | 'split' | 'merge' | 'undo' | 'redo';
  readonly taskIds: readonly RowId[];
  /** The changed rows after the change (empty for deletes). */
  readonly rows: readonly Row[];
}

export interface GanttZoomChangeEvent extends GanttEvent {
  readonly level: number;
  readonly previous: number;
}

export interface GanttSplitterEvent extends GanttEvent {
  /** Grid pane width in px. */
  readonly position: number;
}

export interface GanttTaskbarClickEvent<Row> extends GanttEvent {
  readonly taskId: RowId;
  readonly task: Row;
  readonly target: 'taskbar' | 'milestone' | 'parent' | 'baseline' | 'connector' | 'label';
}

export interface GanttChartPointerEvent<Row> extends GanttEvent {
  readonly date: Date;
  readonly taskId: RowId | null;
  readonly task: Row | null;
}

export interface GanttTooltipOpenEvent<Row> extends GanttEvent {
  readonly kind: 'taskbar' | 'baseline' | 'connector' | 'timeline' | 'editing';
  readonly task: Row | null;
}

export interface GanttToolbarItemClickEvent extends GanttEvent {
  readonly item: string;
}

export interface GanttContextMenuOpenEvent<Row> extends GanttEvent {
  readonly pane: 'grid' | 'chart';
  readonly taskId: RowId | null;
  readonly task: Row | null;
}

export interface GanttContextMenuItemClickEvent<Row> extends GanttEvent {
  readonly item: string;
  readonly taskId: RowId | null;
  readonly task: Row | null;
}

export interface GanttDialogOpenEvent<Row> extends GanttEvent {
  readonly mode: 'add' | 'edit';
  readonly taskId: RowId | null;
  readonly task: Row | null;
}

export interface GanttExportEvent extends GanttEvent {
  readonly format: 'excel' | 'csv' | 'pdf';
  readonly fileName: string;
}

export interface GanttErrorEvent {
  readonly error: unknown;
  readonly action: string;
  readonly taskIds: readonly RowId[];
}

/** `adaptive` options. */
export interface GanttAdaptive {
  /** Container width (px) below which the adaptive layout applies; measured after hydration (default 640). */
  readonly breakpoint?: number;
}

/** Built-in toolbar items. */
export type GanttToolbarItemId =
  | 'add' | 'edit' | 'update' | 'delete' | 'cancel' | 'expandAll' | 'collapseAll' | 'search'
  | 'previousTimeSpan' | 'nextTimeSpan' | 'zoomIn' | 'zoomOut' | 'zoomToFit' | 'indent' | 'outdent'
  | 'criticalPath' | 'excelExport' | 'csvExport' | 'pdfExport' | 'undo' | 'redo';

export type GanttToolbarItem = GanttToolbarItemId | { readonly id: string; readonly text?: string; readonly icon?: ReactNode; readonly disabled?: boolean; readonly align?: 'start' | 'end'; readonly render?: () => ReactNode };

/** Built-in context menu items. */
export type GanttContextMenuItemId =
  | 'taskInformation' | 'deleteTask' | 'addAbove' | 'addBelow' | 'addChild' | 'addMilestone'
  | 'convertToTask' | 'convertToMilestone' | 'deleteDependency' | 'indent' | 'outdent' | 'splitTask' | 'mergeTask'
  | 'cancel';

export type GanttContextMenuItem = GanttContextMenuItemId | DataGridContextMenuItemId | DataGridMenuItem;

/** A dialog tab. */
export type GanttDialogTab<Row> =
  | { readonly type: 'general' | 'dependency' | 'resources' | 'notes' | 'segments'; readonly label?: string; readonly fields?: readonly string[] }
  | { readonly type: 'custom'; readonly label: string; readonly render: (ctx: { readonly task: Row | null; readonly values: Record<string, unknown>; readonly setValue: (field: string, value: unknown) => void }) => ReactNode };

/** `editing`. */
export interface GanttEditing<Row> {
  /** Grid pane edit mode; `'auto'` is cell editing in the grid and the dialog from the chart. Default `'auto'`. */
  readonly mode?: 'cell' | 'row' | 'dialog' | 'auto';
  readonly edit?: boolean;
  readonly add?: boolean;
  readonly delete?: boolean;
  /** Taskbar drag, resize, progress and connect (default true when editable). */
  readonly taskbar?: boolean;
  /** Dropping a taskbar on another row reparents (or reassigns in the resource view). */
  readonly taskbarDragBetweenRows?: boolean;
  readonly newRowPosition?: 'top' | 'bottom' | 'above' | 'below' | 'child';
  readonly confirmDelete?: boolean;
  readonly dialogTabs?: readonly GanttDialogTab<Row>[];
}

/** `undo`. */
export interface GanttUndo {
  readonly actions?: readonly string[];
  readonly limit?: number;
}

/** A resource. */
export type GanttResource = Readonly<Record<string, unknown>>;

/** `resourceFields`. Defaults `id`, `name`, `unit`, `group`. */
export interface GanttResourceFields {
  readonly id?: string;
  readonly name?: string;
  readonly unit?: string;
  readonly group?: string;
}

/** Export writers: loaders of `@salmonui/export` subpaths. */
export interface GanttExportWriters {
  readonly excel?: () => Promise<{ readonly exportXlsx: unknown }>;
  readonly pdf?: () => Promise<{ readonly exportGanttPdf: unknown }>;
}

/** A PDF export. */
export interface GanttPdfExportOptions<Row> {
  readonly fileName?: string;
  readonly pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal' | { readonly width: number; readonly height: number };
  readonly orientation?: 'portrait' | 'landscape';
  /** Scales the chart so the whole timeline fits the page width. Default false (pages across). */
  readonly fitToWidth?: boolean;
  readonly header?: string;
  readonly footer?: string;
  /** A TrueType font for non-Latin text (the PDF writer's `font`). */
  readonly font?: unknown;
  readonly cell?: (ctx: { readonly task: Row; readonly field: string; readonly value: unknown; text: string }) => void;
  readonly headerCell?: (ctx: { readonly field: string; text: string }) => void;
  readonly taskbar?: (ctx: { readonly task: Row; readonly info: GanttTaskInfo; color: string; progressColor: string }) => void;
  readonly timelineCell?: (ctx: { readonly date: Date; readonly tier: 'top' | 'bottom'; text: string }) => void;
}

/** Excel / CSV export options: the Data Grid export options and hooks. */
export type GanttGridExportOptions<Row> = Pick<DataGridExportOptions<Row>, 'fileName' | 'cell' | 'headerCell' | 'tree' | 'includeHiddenColumns' | 'columns'>;

export interface GanttExportFile<T> {
  readonly fileName: string;
  readonly mimeType: string;
  readonly data: T;
}

/** Grid-pane props passed to the `DataGrid` unchanged (GGRID rows keep the Data Grid names). */
export type GanttGridProps<Row> = Pick<
  DataGridProps<Row>,
  | 'sorting' | 'onBeforeSortChange' | 'onSortChange'
  | 'filtering' | 'onBeforeFilterChange' | 'onFilterChange'
  | 'search' | 'onBeforeSearchChange' | 'onSearchChange'
  | 'selection' | 'onBeforeSelectionChange' | 'onSelectionChange'
  | 'columnMenu' | 'renderContextMenu'
  | 'reorderable' | 'onBeforeColumnReorder' | 'onColumnReorder'
  | 'resizable' | 'resizeMode' | 'onColumnResizeStart' | 'onColumnResize' | 'onColumnResizeEnd'
  | 'columnChooser' | 'onBeforeColumnVisibilityChange' | 'onColumnVisibilityChange'
  | 'gridLines' | 'highlightOnHover' | 'striped' | 'textWrap' | 'overflow'
  | 'getRowProps' | 'getCellProps' | 'rowClassName'
  | 'renderEmpty' | 'loadingIndicator' | 'onViewChange' | 'onRowDoubleClick' | 'onRowClick' | 'onCellClick'
  | 'rowDrag' | 'onBeforeRowDrop' | 'onRowDrop' | 'onRowDragStart' | 'onRowDrag'
  | 'onBeforeTreeToggle' | 'onTreeToggle'
  | 'onBeforeEditStart' | 'onBeforeCellValueChange' | 'onBeforeSave' | 'onSave'
  | 'keyBindings' | 'onKeyDown' | 'virtualization' | 'initialRows' | 'currency' | 'icons' | 'features'
>;

export interface GanttProps<Row = Record<string, unknown>> extends Partial<GanttGridProps<Row>> {
  /** Tasks (nested `children` or flat `parentId`), or a `@salmonui/data` / Data Grid source. Reactive. */
  readonly data: readonly Row[] | DataSource<Row>;
  readonly taskFields?: GanttTaskFields;
  /** Grid pane columns: Data Grid columns or task column presets. Default title, start, end, duration, progress. */
  readonly columns?: readonly (GanttColumnPreset | DataGridColumn<Row>)[];
  /** Field of the tree column. Default the title column. */
  readonly treeColumn?: string;
  /** Rows a filter or search keeps around the matches (Data Grid `tree.filterMode`). Default `'ancestors'`. */
  readonly treeFilterMode?: 'ancestors' | 'descendants' | 'both' | 'none';
  /** `'all'` (default) or `'none'`; the `expanded` role wins per task. */
  readonly defaultExpanded?: 'all' | 'none' | boolean;
  /** Load children on demand: rows with this field true have children loaded on expand. */
  readonly hasChildrenField?: string;
  readonly loadChildren?: (ctx: { readonly rowId: RowId; readonly row: Row; readonly signal: AbortSignal }) => readonly Row[] | Promise<readonly Row[]>;

  // Scheduling (project engine).
  readonly taskMode?: TaskMode;
  readonly autoSchedule?: boolean;
  readonly projectStart?: GanttDateInput | null;
  readonly projectEnd?: GanttDateInput | null;
  readonly workingTime?: GanttWorkingTime;
  readonly holidays?: readonly GanttHoliday[];
  readonly calendars?: readonly GanttCalendar[];
  readonly projectCalendar?: string;
  readonly durationUnit?: DurationUnit;
  readonly workUnit?: WorkUnit;
  readonly taskType?: TaskType;
  readonly dependencyTypes?: readonly DependencyType[];
  readonly validateDependencies?: boolean;
  readonly validateManualTasks?: boolean;
  readonly parentDependencies?: boolean;
  readonly dependencyLag?: { readonly normalizeOnLoad?: boolean; readonly updateOnTaskbarEdit?: boolean };
  readonly unscheduledTasks?: boolean;
  readonly criticalPath?: boolean;
  /** IANA zone the task dates are wall times in. Set it for SSR. */
  readonly timeZone?: string;
  readonly locale?: string;
  readonly localeText?: GanttLocaleText;
  /**
   * Column, label and tooltip date format: `Intl.DateTimeFormat` options, or a Data Grid format string
   * (a skeleton such as `'yMMMd'` or a style such as `'short'`; a pattern such as `'dd.MM.yyyy'` formats the grid columns).
   */
  readonly dateFormat?: Intl.DateTimeFormatOptions | string;
  readonly wbs?: boolean | { readonly autoUpdate?: boolean };

  // Resources.
  readonly resources?: readonly GanttResource[];
  readonly resourceFields?: GanttResourceFields;
  readonly resourceView?: boolean;
  readonly overAllocation?: boolean;
  readonly multiTaskbar?: boolean;
  readonly taskbarOverlap?: boolean;

  // Timeline.
  readonly timeline?: GanttTimeline;
  /** Zoom level index into `zoomLevels` (reactive) / `onZoomChange`. */
  readonly zoom?: number;
  readonly defaultZoom?: number;
  readonly zoomLevels?: readonly GanttZoomLevel[];
  readonly onZoomChange?: (event: GanttZoomChangeEvent) => void;
  readonly highlightWeekends?: boolean;
  readonly markers?: readonly GanttMarker[];

  // Chart pane.
  readonly rowHeight?: number;
  /** Per-row height (taller rows for baselines or lanes), shared with the grid through the row-height extension point. */
  readonly getRowHeight?: (row: Row) => number;
  readonly taskbarHeight?: number;
  readonly baselines?: boolean;
  readonly labels?: { readonly start?: GanttLabel<Row>; readonly end?: GanttLabel<Row>; readonly inside?: GanttLabel<Row> };
  readonly tooltip?: boolean | GanttTooltipOptions<Row>;
  readonly onBeforeTooltipOpen?: (event: GanttTooltipOpenEvent<Row>) => void;
  readonly renderTaskbar?: (ctx: GanttTaskbarContext<Row>) => ReactNode;
  readonly renderParentTaskbar?: (ctx: GanttTaskbarContext<Row>) => ReactNode;
  readonly renderMilestone?: (ctx: GanttTaskbarContext<Row>) => ReactNode;
  readonly renderBaseline?: (ctx: GanttTaskbarContext<Row>) => ReactNode;
  readonly getTaskbarProps?: (ctx: GanttTaskbarContext<Row>) => GanttTaskbarProps | undefined;
  readonly connectorWidth?: number;
  readonly inlineNotes?: boolean;
  readonly focusTaskOnSelect?: boolean;
  readonly splitter?: GanttSplitter;
  readonly panes?: 'both' | 'grid' | 'chart';
  /** Adaptive UI: one pane at a time with a pane switch and full-screen dialogs; `true` always (server markup included), `{ breakpoint }` below the container width (measured after hydration). */
  readonly adaptive?: boolean | GanttAdaptive;

  // Editing.
  readonly readOnly?: boolean;
  readonly editing?: boolean | GanttEditing<Row>;
  readonly undo?: boolean | GanttUndo;
  readonly toolbar?: readonly GanttToolbarItem[];
  readonly onToolbarItemClick?: (event: GanttToolbarItemClickEvent) => void;
  /** Context menu of both panes: Gantt items, Data Grid items and custom items; `true` for the default set. */
  readonly contextMenu?: boolean | readonly GanttContextMenuItem[];
  readonly onBeforeContextMenuOpen?: (event: GanttContextMenuOpenEvent<Row>) => void;
  readonly onContextMenuItemClick?: (event: GanttContextMenuItemClickEvent<Row>) => void;

  // Events.
  readonly onTaskbarEditStart?: (event: GanttTaskbarEditEvent<Row>) => void;
  /** At most once per animation frame. */
  readonly onTaskbarEdit?: (event: GanttTaskbarEditEvent<Row>) => void;
  readonly onBeforeTaskbarEditEnd?: (event: GanttTaskbarEditEvent<Row>) => void;
  readonly onTaskbarEditEnd?: (event: GanttTaskbarEditEvent<Row>) => void;
  readonly onBeforeDependencyChange?: (event: GanttDependencyChangeEvent<Row>) => void;
  readonly onDependencyChange?: (event: GanttDependencyChangeEvent<Row>) => void;
  readonly onScheduleConflict?: (event: GanttScheduleConflictEvent<Row>) => void;
  readonly onBeforeTaskChange?: (event: GanttTaskChangeEvent<Row>) => void;
  readonly onTaskChange?: (event: GanttTaskChangeEvent<Row>) => void;
  readonly onTaskbarClick?: (event: GanttTaskbarClickEvent<Row>) => void;
  /** At most once per animation frame. */
  readonly onChartPointerMove?: (event: GanttChartPointerEvent<Row>) => void;
  readonly onSplitterResizeStart?: (event: GanttSplitterEvent) => void;
  readonly onSplitterResize?: (event: GanttSplitterEvent) => void;
  readonly onSplitterResizeEnd?: (event: GanttSplitterEvent) => void;
  readonly onBeforeDialogOpen?: (event: GanttDialogOpenEvent<Row>) => void;
  readonly onBeforeExport?: (event: GanttExportEvent) => void;
  readonly onExport?: (event: GanttExportEvent) => void;
  readonly onError?: (event: GanttErrorEvent) => void;
  readonly onReady?: (api: GanttApi<Row>) => void;
  /** Writes the changed rows back (local `data`): called once per committed change with the full new array. */
  readonly onDataChange?: (rows: readonly Row[], event: GanttTaskChangeEvent<Row>) => void;

  readonly exportWriters?: GanttExportWriters;
  readonly height?: number | string;
  readonly width?: number | string;
  readonly dir?: 'ltr' | 'rtl' | 'auto';
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly id?: string;
  readonly 'aria-label'?: string;
  readonly ref?: Ref<GanttApi<Row>>;
}

/** Task column presets. */
export type GanttColumnPreset =
  | 'title' | 'start' | 'end' | 'duration' | 'progress' | 'predecessors' | 'resources' | 'work' | 'taskType'
  | 'notes' | 'baselineStart' | 'baselineEnd' | 'wbs' | 'wbsPredecessors' | 'serialNumber' | 'id';

/** Results of Gantt actions. */
export interface GanttActionResult {
  readonly status: 'applied' | 'rejected' | 'conflict';
  readonly reason?: string;
}

export interface GanttState {
  readonly grid: unknown;
  readonly splitter: number | null;
  readonly zoom: number;
  readonly scrollDate: string | null;
}

/** `ref`; extends the grid pane's `DataGridApi`. */
export interface GanttApi<Row = Record<string, unknown>> extends Omit<DataGridApi<Row>, 'cancelEdit' | 'getState' | 'restoreState' | 'exportToExcel' | 'exportToCsv' | 'exportToPdf' | 'print' | 'undo' | 'redo' | 'setLoading'> {
  readonly grid: DataGridApi<Row>;
  getTask(id: RowId): Row | undefined;
  getTaskInfo(id: RowId): GanttTaskInfo | undefined;
  getViewRows(): readonly Row[];
  getCriticalTasks(): readonly Row[];
  formatDuration(id: RowId): string;
  formatWork(id: RowId): string;
  addTask(task?: Partial<Row>, options?: { readonly position?: 'top' | 'bottom' | 'above' | 'below' | 'child'; readonly targetId?: RowId }): GanttActionResult;
  updateTask(id: RowId, changes: Partial<Row>): GanttActionResult;
  deleteTasks(ids: RowId | readonly RowId[]): GanttActionResult;
  changeTaskId(id: RowId, newId: RowId): GanttActionResult;
  cancelEdit(): void;
  indent(ids: RowId | readonly RowId[]): GanttActionResult;
  outdent(ids: RowId | readonly RowId[]): GanttActionResult;
  moveTasks(ids: RowId | readonly RowId[], targetId: RowId, position: 'above' | 'below' | 'child'): GanttActionResult;
  addDependency(taskId: RowId, dependency: Dependency | string): GanttActionResult;
  removeDependency(taskId: RowId, predecessorId: RowId): GanttActionResult;
  updateDependencies(taskId: RowId, dependencies: readonly Dependency[] | string): GanttActionResult;
  splitTask(id: RowId, date: GanttDateInput): GanttActionResult;
  mergeSegments(id: RowId, segmentIndexes: readonly number[]): GanttActionResult;
  convertToMilestone(id: RowId): GanttActionResult;
  convertToTask(id: RowId): GanttActionResult;
  setTaskMode(id: RowId, mode: 'auto' | 'manual'): GanttActionResult;
  setProjectDates(start: GanttDateInput, end: GanttDateInput): void;
  expandAll(): void;
  collapseAll(): void;
  expandRows(ids: RowId | readonly RowId[]): void;
  collapseRows(ids: RowId | readonly RowId[]): void;
  zoomIn(): void;
  zoomOut(): void;
  zoomToFit(): void;
  getZoom(): number;
  extendTimeline(side: 'start' | 'end'): void;
  scrollToDate(date: GanttDateInput): void;
  scrollToTask(id: RowId): void;
  scrollTo(options: { readonly top?: number; readonly left?: number }): void;
  setSplitterPosition(position: number | string): void;
  openAddDialog(): void;
  openEditDialog(id: RowId): void;
  closeDialog(): void;
  undo(): void;
  redo(): void;
  getUndoActions(): readonly string[];
  getRedoActions(): readonly string[];
  clearUndo(): void;
  clearRedo(): void;
  setLoading(loading: boolean): void;
  getState(): GanttState;
  restoreState(state: GanttState): void;
  /** The grid pane's Excel export with the Data Grid `cell` / `headerCell` hooks; tree rows as outline levels. */
  exportToExcel(options?: GanttGridExportOptions<Row> & { readonly sheetName?: string }): Promise<GanttExportFile<Uint8Array> | null>;
  exportToCsv(options?: GanttGridExportOptions<Row> & { readonly separator?: string; /** Default true; `false` writes raw text. */ readonly escapeFormulas?: boolean }): Promise<GanttExportFile<string> | null>;
  exportToPdf(options?: GanttPdfExportOptions<Row>): Promise<GanttExportFile<Uint8Array> | null>;
  print(): void;
  getTaskbarElement(id: RowId): HTMLElement | null;
  getChartElement(): HTMLElement | null;
}
