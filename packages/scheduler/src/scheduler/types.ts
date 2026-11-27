// Public types of `Scheduler`: options props are reactive,
// user actions fire before / after pairs that cancel with
// `preventDefault()`, and `ref` receives the `SchedulerApi`.

import type { CSSProperties, ReactNode, Ref } from 'react';
import type { DateInput, PlainDate, WeekRule } from '@salmonui/core/internal/dates/index';
import type { CellSelection } from '../internal/scheduler/store.js';
import type { EditScope } from '../internal/scheduler/crud.js';
import type { FieldValidation } from '../internal/scheduler/rules.js';
import type { EventId, Occurrence, SchedulerEventFieldMap, SchedulerViewType } from '../internal/scheduler/types.js';
import type { SchedulerLocaleText } from './locale.js';
import type { MenuItemData } from '@salmonui/buttons/menu';

export type { EditScope, EventId, FieldValidation, SchedulerViewType, CellSelection as SchedulerCellSelection };

export type SchedulerEventSource = 'pointer' | 'keyboard' | 'touch' | 'api';

export interface SchedulerEvent {
  readonly type: string;
  readonly source: SchedulerEventSource;
}

export interface SchedulerCancelableEvent extends SchedulerEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** One view entry of `views`: overrides the top-level prop of the same name for that view. */
export interface SchedulerViewConfig<Row = unknown> {
  readonly type: SchedulerViewType;
  /** Name used by `view` (default `type`; give distinct names to two entries of one type). */
  readonly name?: string;
  /** Button label (default from `localeText`). */
  readonly label?: string;
  /** Days, weeks, months or years per page (a 3-day view: `{ type: 'day', interval: 3 }`). */
  readonly interval?: number;
  readonly startHour?: string;
  readonly endHour?: string;
  readonly workDays?: readonly number[];
  readonly showWeekend?: boolean;
  readonly readOnly?: boolean;
  readonly dateFormat?: Intl.DateTimeFormatOptions;
  readonly timeScale?: SchedulerTimeScale;
  readonly renderEvent?: (ctx: SchedulerEventRenderContext<Row>) => ReactNode;
  readonly eventLayout?: SchedulerEventLayout;
  /** Year views: months per page and the first month. */
  readonly monthCount?: number;
  readonly firstMonthOfYear?: number;
  /** Agenda: days per page. */
  readonly agendaDayCount?: number;
  /** Agenda: skip days without events (default true). */
  readonly hideEmptyAgendaDays?: boolean;
  /** Timeline Year: months as rows (`'horizontal'`, default) or as columns. */
  readonly orientation?: 'horizontal' | 'vertical';
  /** Virtual scrolling of timeline resource rows or of the agenda days. */
  readonly virtualScroll?: boolean | SchedulerVirtualScroll;
  /** Timeline header rows. */
  readonly headerRows?: readonly SchedulerHeaderRow[];
  /** Year and Timeline Year month and weekday headers. */
  readonly renderMonthHeader?: (ctx: SchedulerMonthHeaderContext) => ReactNode;
  readonly renderDayHeader?: (ctx: SchedulerDayHeaderContext) => ReactNode;
}

/** A resource definition: the items an event field refers to. Field options name the item properties. */
export interface SchedulerResource<Item = Record<string, unknown>> {
  /** The event property that holds the item id (or ids with `multiple`). */
  readonly field: string;
  /** Name used by `grouping.resources`. */
  readonly name: string;
  /** Editor field label (default `name`). */
  readonly label?: string;
  readonly data: readonly Item[];
  /** Item properties (defaults `id`, `text`, `color`, `parentId`, `workDays`, `startHour`, `endHour`, `className`, `expanded`). */
  readonly idField?: string;
  readonly textField?: string;
  readonly colorField?: string;
  readonly parentIdField?: string;
  readonly workDaysField?: string;
  readonly startHourField?: string;
  readonly endHourField?: string;
  readonly classNameField?: string;
  readonly expandedField?: string;
  /** An event may refer to several items (the field holds an array). */
  readonly multiple?: boolean;
}

/** Resource grouping. */
export interface SchedulerGrouping {
  /** Resource `name`s, outermost first: one header row (vertical views) or tree level (timeline views) each. */
  readonly resources: readonly string[];
  /** Dates above resources in day, week and month views. */
  readonly byDate?: boolean;
  /** Default true: children only under the parent their `parentIdField` names; false puts every child under every parent. */
  readonly byParent?: boolean;
  /** An event with several ids is one event in each of its resources: selecting one copy selects every copy. */
  readonly sharedEvents?: boolean;
  /** Each resource shows only its own work days (`workDaysField`) in day, week and work week views. */
  readonly hideNonWorkingDays?: boolean;
}

/** One resource item (`api.getResources()`, header templates). */
export interface SchedulerResourceInfo {
  readonly resource: string;
  readonly field: string;
  readonly id: unknown;
  readonly text: string;
  readonly color: string | undefined;
  readonly parentId: unknown;
  readonly className: string | undefined;
  readonly data: unknown;
}

export interface SchedulerResourceHeaderContext {
  readonly resource: SchedulerResourceInfo;
  /** Grouping level, 0 outermost. */
  readonly level: number;
  readonly expanded: boolean;
  readonly hasChildren: boolean;
  readonly view: SchedulerViewType;
}

export interface SchedulerVirtualScroll {
  /** Rows (or agenda batches) rendered beyond the viewport on each side (default 4). */
  readonly overscan?: number;
  /** Remote data reads only the rendered resources: `read` receives `resourceIds`. */
  readonly lazyLoad?: boolean;
  /** Rows rendered on the server and on the first client render, before the viewport is measured (default 0 to 20). */
  readonly initialRange?: { readonly start: number; readonly end: number };
}

export type SchedulerHeaderUnit = 'year' | 'month' | 'week' | 'date' | 'hour';

export interface SchedulerHeaderRow {
  readonly unit: SchedulerHeaderUnit;
  readonly render?: (ctx: SchedulerHeaderCellContext) => ReactNode;
}

export interface SchedulerHeaderCellContext {
  readonly unit: SchedulerHeaderUnit;
  /** First instant of the cell. */
  readonly start: Date;
  readonly date: PlainDate;
  readonly text: string;
  readonly view: SchedulerViewType;
}

export interface SchedulerMonthHeaderContext {
  /** First day of the month. */
  readonly date: PlainDate;
  readonly text: string;
  readonly view: SchedulerViewType;
}

export interface SchedulerDayHeaderContext {
  /** Year view weekday headers: the weekday, 0 Sunday (null in Timeline Year). */
  readonly weekday: number | null;
  /** Timeline Year day headers: the day of the month, 1-31 (null in the Year view). */
  readonly day: number | null;
  readonly text: string;
  readonly view: SchedulerViewType;
}

/** `api.getRenderedRange()`: rendered resource rows [start, end) of a timeline view and their leaf resource ids. */
export interface SchedulerRenderedRange {
  readonly start: number;
  readonly end: number;
  readonly resourceIds: readonly unknown[];
}

export type SchedulerViewEntry<Row = unknown> = SchedulerViewType | SchedulerViewConfig<Row>;

export interface SchedulerTimeScale {
  /** Default true; false hides the time slots of day views (events stack by start). */
  readonly enabled?: boolean;
  /** Minutes per major slot (default 60). */
  readonly interval?: number;
  /** Minor slots per major slot (default 2). */
  readonly slotCount?: number;
}

export interface SchedulerEventLayout {
  /** Timed events that cross midnight: the all-day row (default) or split into the time slots. */
  readonly spannedPlacement?: 'allDayRow' | 'timeSlot';
  /** Lanes of stacked events per month cell (and the all-day row) before "+N more" (default 3 / all). */
  readonly maxHeight?: number;
  /** Show the "+N more" part (default true). */
  readonly moreIndicator?: boolean;
  /** Day views: events shorter than this render this tall, in minutes (default 0). */
  readonly minimumDuration?: number;
  /** Month view: lanes take only the rows they need (no blank space left by hidden lanes). */
  readonly ignoreWhitespace?: boolean;
}

export interface SchedulerWorkHours {
  /** Highlight work hours in day views (default true). */
  readonly highlight?: boolean;
  /** `'HH:mm'` (default `'09:00'` and `'18:00'`). */
  readonly start?: string;
  readonly end?: string;
}

export interface SchedulerEventFieldConfig {
  readonly field?: string;
  readonly label?: string;
  readonly defaultValue?: unknown;
  readonly validation?: FieldValidation;
}

export type SchedulerEventFields = Partial<Record<keyof SchedulerEventFieldMap, string | SchedulerEventFieldConfig>>;

export interface SchedulerEditing<Row = unknown> {
  readonly add?: boolean;
  readonly edit?: boolean;
  readonly delete?: boolean;
  /** The built-in editor dialog (default true). */
  readonly dialog?: boolean;
  /** Offer the `'following'` scope. */
  readonly following?: boolean;
  /** Ask for the scope of recurring edits and deletes (default true). */
  readonly recurrencePrompt?: boolean;
  /** Validate recurrence rules and occurrence moves (default true). */
  readonly validateRecurrence?: boolean;
  /** Id of a new event (default: a counter above the largest numeric id, else a random string). */
  readonly createId?: (row: Row) => EventId;
  /** Replaces the editor dialog body. */
  readonly renderDialog?: (ctx: SchedulerDialogContext<Row>) => ReactNode;
  readonly renderDialogHeader?: (ctx: SchedulerDialogContext<Row>) => ReactNode;
  readonly renderDialogFooter?: (ctx: SchedulerDialogContext<Row>) => ReactNode;
  /** Typing in a focused cell creates an event; Enter on an event edits its title in place. A cell click then selects without the cell quick info. */
  readonly inline?: boolean;
}

export interface SchedulerDialogContext<Row = unknown> {
  readonly isNew: boolean;
  /** The editor values by role (`title`, `start`, `end`, ...), with resource fields and the row's other properties by their own names; `setValue` on such a name writes that property. */
  readonly values: Readonly<Record<string, unknown>>;
  readonly setValue: (role: string, value: unknown) => void;
  readonly errors: Readonly<Record<string, string>>;
  readonly row: Row | null;
  readonly save: () => void;
  readonly cancel: () => void;
  readonly delete: () => void;
}

export interface SchedulerQuickInfo<Row = unknown> {
  /** Open the cell popup when a drag selection of cells ends. */
  readonly onSelectionEnd?: boolean;
  readonly renderHeader?: (ctx: SchedulerQuickInfoContext<Row>) => ReactNode;
  readonly renderContent?: (ctx: SchedulerQuickInfoContext<Row>) => ReactNode;
  readonly renderFooter?: (ctx: SchedulerQuickInfoContext<Row>) => ReactNode;
}

export interface SchedulerQuickInfoContext<Row = unknown> {
  readonly kind: 'cell' | 'event';
  readonly row: Row | null;
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  readonly close: () => void;
}

export interface SchedulerEventRenderContext<Row = unknown> {
  readonly row: Row;
  readonly id: EventId;
  readonly title: string;
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  readonly view: SchedulerViewType;
  /** True for an occurrence of a recurring series. */
  readonly recurring: boolean;
  readonly selected: boolean;
  /** Formatted time range. */
  readonly timeText: string;
}

export interface SchedulerEventPropsContext<Row = unknown> extends SchedulerEventRenderContext<Row> {}

export type SchedulerCellPart = 'workCell' | 'monthCell' | 'allDayCell' | 'dateHeader' | 'timeSlot' | 'resourceHeader';

export interface SchedulerCellContext {
  readonly part: SchedulerCellPart;
  readonly date: PlainDate;
  /** Start and end of the cell (instants). */
  readonly start: Date;
  readonly end: Date;
  readonly view: SchedulerViewType;
  /** Inside work hours (work cells) or a work day. */
  readonly work: boolean;
  /** The resource of the cell in grouped views (the innermost level). */
  readonly resource?: SchedulerResourceInfo | undefined;
}

export interface SchedulerCellProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly title?: string;
  readonly [data: `data-${string}`]: string | number | boolean | undefined;
}

export interface SchedulerEventProps extends SchedulerCellProps {
  readonly hidden?: boolean;
}

export interface SchedulerSlotRenderContext {
  readonly date: PlainDate;
  /** Minutes after midnight. */
  readonly minutes: number;
  readonly major: boolean;
  readonly text: string;
}

export interface SchedulerDateRangeContext {
  readonly start: PlainDate;
  readonly end: PlainDate;
  readonly text: string;
  readonly view: SchedulerViewType;
}

export type SchedulerToolbarItem =
  | 'previous'
  | 'next'
  | 'today'
  | 'dateRange'
  | 'newEvent'
  | 'views'
  | { readonly id: string; readonly label: string; readonly align?: 'start' | 'end'; readonly onClick?: () => void; readonly render?: () => ReactNode };

/** Change events. */
export interface SchedulerDateChangeEvent extends SchedulerEvent {
  readonly date: PlainDate;
  readonly previousDate: PlainDate;
}

export interface SchedulerViewChangeEvent extends SchedulerEvent {
  readonly view: string;
  readonly previousView: string;
}

export interface SchedulerBeforeNavigateEvent extends SchedulerCancelableEvent {
  readonly kind: 'date' | 'view';
  readonly view: string;
  readonly date: PlainDate;
  readonly previousView: string;
  readonly previousDate: PlainDate;
}

export interface SchedulerBeforeAddEvent<Row> extends SchedulerCancelableEvent {
  readonly rows: readonly Row[];
}

export interface SchedulerAddEvent<Row> extends SchedulerEvent {
  readonly rows: readonly Row[];
  /** The complete row array after the change (local data). */
  readonly data: readonly Row[];
}

export interface SchedulerBeforeSaveEvent<Row> extends SchedulerCancelableEvent {
  readonly row: Row;
  readonly previous: Row;
  /** The scope of a recurring edit; assign through `setScope` when `editing.recurrencePrompt` is false. */
  readonly scope: EditScope;
  setScope(scope: EditScope): void;
  /** Original start of the edited occurrence of a series. */
  readonly occurrenceStart: Date | null;
}

export interface SchedulerSaveEvent<Row> extends SchedulerEvent {
  readonly added: readonly Row[];
  readonly changed: readonly Row[];
  readonly deleted: readonly Row[];
  readonly scope: EditScope;
  readonly data: readonly Row[];
}

export interface SchedulerBeforeDeleteEvent<Row> extends SchedulerCancelableEvent {
  readonly rows: readonly Row[];
  readonly scope: EditScope;
  setScope(scope: EditScope): void;
  readonly occurrenceStart: Date | null;
}

export interface SchedulerDeleteEvent<Row> extends SchedulerEvent {
  readonly deleted: readonly Row[];
  readonly changed: readonly Row[];
  readonly scope: EditScope;
  readonly data: readonly Row[];
}

export type SchedulerPopup = 'editor' | 'quickInfo' | 'moreEvents' | 'recurrenceAlert' | 'deleteAlert' | 'validationAlert' | 'overlapAlert';

export interface SchedulerBeforePopupOpenEvent<Row> extends SchedulerCancelableEvent {
  readonly popup: SchedulerPopup;
  readonly row: Row | null;
  readonly start: Date | null;
  readonly end: Date | null;
}

export interface SchedulerPopupCloseEvent<Row> extends SchedulerEvent {
  readonly popup: SchedulerPopup;
  readonly row: Row | null;
}

export interface SchedulerCellClickEvent extends SchedulerCancelableEvent {
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  readonly element: Element | null;
}

export interface SchedulerEventClickEvent<Row> extends SchedulerCancelableEvent {
  readonly row: Row;
  readonly start: Date;
  readonly end: Date;
  readonly element: Element | null;
}

/** `onEventSelectionChange`: the selected events after a click, Ctrl / Cmd + click (toggle) or Shift + click (range). */
export interface SchedulerEventSelectionChangeEvent<Row> extends SchedulerEvent {
  /** Selected occurrence keys (`id`, or `id@start` for a generated occurrence). */
  readonly keys: readonly string[];
  /** Rows of the selected events (a series once). */
  readonly rows: readonly Row[];
}

export interface SchedulerHoverEvent<Row> extends SchedulerEvent {
  readonly part: 'cell' | 'event' | 'header';
  readonly row: Row | null;
  readonly start: Date | null;
  readonly element: Element;
}

export interface SchedulerMoreEventsClickEvent<Row> extends SchedulerCancelableEvent {
  readonly date: PlainDate;
  readonly rows: readonly Row[];
  /** Navigates to `view` on that date instead of opening the popover. */
  navigate(view: string): void;
}

export interface SchedulerOverlapEvent<Row> extends SchedulerCancelableEvent {
  readonly row: Row;
  readonly conflicts: readonly Row[];
}

export interface SchedulerCellSelectionChangeEvent extends SchedulerEvent {
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
}

export interface SchedulerDataLoadEvent<Row> extends SchedulerEvent {
  readonly range: { readonly start: Date; readonly end: Date };
  readonly rows: readonly Row[];
}

export interface SchedulerErrorEvent extends SchedulerEvent {
  readonly error: unknown;
  readonly action: 'read' | 'add' | 'save' | 'delete';
}

/** A remote event source: reads per visible range, optional writes. */
/** `dragOptions`: drag, resize, multi-drag, drag out and drag between Schedulers. */
export interface SchedulerDragOptions {
  /** Minutes a timed start or end snaps to (default the slot length, `timeScale.interval / slotCount`). */
  readonly snapMinutes?: number | undefined;
  /** Scroll the view while the pointer is near its edges (default true). */
  readonly autoScroll?: boolean | undefined;
  /** Navigate to the previous / next range after the pointer rests at the inline edge of the Scheduler (default false; `delay` 1000 ms). */
  readonly navigateOnEdge?: boolean | { readonly delay?: number | undefined } | undefined;
  /** A pointer down inside an element matching this selector does not drag or resize. */
  readonly excludeSelector?: string | undefined;
  /** Dragging a selected event moves every selected event by the same offset. */
  readonly multiple?: boolean | undefined;
  /** Element or selector: dropping an event over it fires `onEventDragOut` instead of moving the event. */
  readonly dragOutArea?: Element | string | null | undefined;
  /** Schedulers with the same group accept each other's events; one registry per document. */
  readonly group?: string | undefined;
}

interface SchedulerDragFields<Row> {
  readonly row: Row;
  /** Every moved row (more than one with `dragOptions.multiple`). */
  readonly rows: readonly Row[];
  /** Proposed start and end of the dragged or resized event. */
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  /** Resource ids per resource field after the drop, or null when they do not change. */
  readonly resourceIds: Readonly<Record<string, readonly unknown[]>> | null;
  /** The event element the gesture started on. */
  readonly element: Element;
  /** The cell under the pointer, or null outside the view. */
  readonly target: Element | null;
  /** Resized edge (resize events). */
  readonly edge?: 'start' | 'end' | undefined;
}

export interface SchedulerDragStartEvent<Row> extends SchedulerCancelableEvent, SchedulerDragFields<Row> {}
export interface SchedulerDragEvent<Row> extends SchedulerEvent, SchedulerDragFields<Row> {}
export interface SchedulerBeforeDropEvent<Row> extends SchedulerCancelableEvent, SchedulerDragFields<Row> {
  readonly previousStart: Date;
  readonly previousEnd: Date;
}
export interface SchedulerDropEvent<Row> extends SchedulerEvent, SchedulerDragFields<Row> {
  readonly result: SchedulerActionResult<Row>;
}

/** `onExternalDrop`: HTML drag data dropped on a slot; return rows to add them (`onBeforeAdd` / `onAdd`). */
export interface SchedulerExternalDropEvent extends SchedulerEvent {
  readonly data: DataTransfer | null;
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  /** Resource ids of the slot (grouped views), else empty. */
  readonly resourceIds: Readonly<Record<string, readonly unknown[]>>;
  readonly element: Element;
}

/** `onEventDragOut`: an event dropped over `dragOptions.dragOutArea`. */
export interface SchedulerDragOutEvent<Row> extends SchedulerEvent {
  readonly row: Row;
  readonly rows: readonly Row[];
  readonly target: Element;
  readonly clientX: number;
  readonly clientY: number;
}

export interface SchedulerDataSource<Row> {
  read(request: SchedulerReadRequest): Promise<SchedulerReadResult<Row>> | SchedulerReadResult<Row>;
  write?(request: SchedulerWriteRequest<Row>): Promise<SchedulerWriteResult<Row> | void> | SchedulerWriteResult<Row> | void;
}

export interface SchedulerReadRequest {
  readonly range: { readonly start: Date; readonly end: Date };
  readonly view: SchedulerViewType;
  /** Rendered resource ids (lazy loading). */
  readonly resourceIds?: readonly unknown[];
  readonly signal: AbortSignal;
}

export interface SchedulerReadResult<Row> {
  readonly rows: readonly Row[];
}

export interface SchedulerWriteRequest<Row> {
  readonly action: 'add' | 'save' | 'delete';
  readonly added: readonly Row[];
  readonly changed: readonly Row[];
  readonly deleted: readonly Row[];
  readonly signal: AbortSignal;
}

export interface SchedulerWriteResult<Row> {
  /** `'rejected'` reverts the change (as a thrown error does). */
  readonly status?: 'applied' | 'rejected';
  /** Server versions of the added and changed rows (replace the local copies by id). */
  readonly rows?: readonly Row[];
}

export interface SchedulerActionResult<Row = unknown> {
  readonly status: 'applied' | 'cancelled' | 'rejected' | 'pending';
  readonly rows: readonly Row[];
  readonly reason?: string;
}

export interface SchedulerEventInfo<Row> {
  readonly row: Row;
  readonly id: EventId;
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
  /** Series id for occurrences of a recurring event. */
  readonly seriesId: EventId | null;
  /** Original start of a generated occurrence. */
  readonly occurrenceStart: Date | null;
}

export interface SchedulerCellInfo {
  readonly start: Date;
  readonly end: Date;
  readonly allDay: boolean;
}

export interface SchedulerState {
  readonly view: string;
  readonly date: string;
  readonly allDayExpanded: boolean;
}

// Export and import (Scheduler export).

export type SchedulerExportFormat = 'excel' | 'csv' | 'icalendar';

/** A file of `exportToExcel`, `exportToCsv` or `exportToICalendar`. */
export interface SchedulerExportFile<Data = Uint8Array | string> {
  readonly fileName: string;
  readonly mimeType: string;
  readonly data: Data;
}

/**
 * Writer loaders: dynamic imports of `@salmonui/export` subpaths,
 * so the writers load on first use (`@salmonui/scheduler` never imports them).
 */
export interface SchedulerExportWriters {
  /** A loader of @salmonui/export `xlsx` subpath (a dynamic import); needed by `exportToExcel`. */
  readonly excel?: (() => Promise<{ readonly exportXlsx: unknown }>) | undefined;
  /** A loader of @salmonui/export `ics` subpath (a dynamic import); needed by `exportToICalendar` and `importICalendar`. */
  readonly ics?: (() => Promise<{ readonly exportICalendar: unknown; readonly parseICalendar: unknown }>) | undefined;
}

/** An exported field: a role (`title`), a mapped property (`Subject`) or another row property; objects set the header and the width (px). */
export type SchedulerExportField = string | { readonly field: string; readonly headerText?: string | undefined; readonly width?: number | undefined };

export interface SchedulerTableExportOptions<Row = unknown> {
  /** Exported fields in order (`fields` / `fieldsInfo`). Default: every role whose property occurs in a row, then the resource fields. */
  readonly fields?: readonly SchedulerExportField[] | undefined;
  /** Header text by role, mapped property or field. Default: the row property name. */
  readonly headerTexts?: Readonly<Record<string, string>> | undefined;
  /** One row per occurrence of `range` (default the visible range) instead of one per stored row. */
  readonly includeOccurrences?: boolean | undefined;
  readonly range?: { readonly start: Date; readonly end: Date } | undefined;
  /** Rows to export instead of the Scheduler's events (`customData`). */
  readonly rows?: readonly Row[] | undefined;
  /** File name; the extension is added when missing. Default `Schedule`. */
  readonly fileName?: string | undefined;
  /** False resolves to the file without downloading it. Default true. */
  readonly download?: boolean | undefined;
}

export interface SchedulerExcelExportOptions<Row = unknown> extends SchedulerTableExportOptions<Row> {
  readonly sheetName?: string | undefined;
}

export interface SchedulerCsvExportOptions<Row = unknown> extends SchedulerTableExportOptions<Row> {
  /** Field separator (`separator`). Default `,`. */
  readonly separator?: string | undefined;
  readonly includeHeaders?: boolean | undefined;
  /** UTF-8 byte order mark. Default false. */
  readonly bom?: boolean | undefined;
  /** Neutralize spreadsheet formulas in text cells, as Data Grid CSV. Default true; `false` writes raw text. */
  readonly escapeFormulas?: boolean | undefined;
}

export interface SchedulerICalendarExportOptions<Row = unknown> {
  /** `.ics` is added when missing. Default `Schedule.ics`. */
  readonly fileName?: string | undefined;
  /** Rows to export instead of the Scheduler's events (`customData`). */
  readonly rows?: readonly Row[] | undefined;
  readonly download?: boolean | undefined;
  /** Timed events as UTC instants instead of TZID wall times. Default false. */
  readonly utc?: boolean | undefined;
  /** UID of an event row. Default `String(id)`. */
  readonly uid?: ((row: Row) => string) | undefined;
  /** Further `X-...` properties of an event row. */
  readonly extra?: ((row: Row) => Readonly<Record<string, string>> | undefined) | undefined;
  readonly calendarName?: string | undefined;
  readonly prodId?: string | undefined;
}

export interface SchedulerICalendarImportOptions<Row = unknown> {
  /** Final say over each imported row (copy `extra` properties, set resources). */
  readonly map?: ((row: Record<string, unknown>, event: { readonly uid: string; readonly extra?: Readonly<Record<string, string>> | undefined }) => Row) | undefined;
}

/** `onBeforeExport`: `preventDefault()` cancels; the export resolves to null. */
export interface SchedulerBeforeExportEvent<Row = unknown> extends SchedulerCancelableEvent {
  readonly format: SchedulerExportFormat;
  readonly options: SchedulerExcelExportOptions<Row> | SchedulerCsvExportOptions<Row> | SchedulerICalendarExportOptions<Row>;
}

/** `onExport`: the written file, before the download. */
export interface SchedulerExportEvent<Row = unknown> extends SchedulerEvent {
  readonly format: SchedulerExportFormat;
  readonly options: SchedulerExcelExportOptions<Row> | SchedulerCsvExportOptions<Row> | SchedulerICalendarExportOptions<Row>;
  readonly file: SchedulerExportFile;
}

/** Remappable keyboard commands; the arrow, Home and End keys of the grid are fixed (APG). */
export type SchedulerKeyCommand =
  | 'navigation.previous'
  | 'navigation.next'
  | 'view.1'
  | 'view.2'
  | 'view.3'
  | 'view.4'
  | 'view.5'
  | 'view.6'
  | 'view.7'
  | 'view.8'
  | 'view.9'
  | 'event.delete'
  | 'selection.clear'
  | 'clipboard.copy'
  | 'clipboard.cut'
  | 'clipboard.paste';

/** Where `paste` puts the clipboard (default: the selected cells, else the focused cell). */
export interface SchedulerPasteTarget {
  readonly start: Date;
  /** Shift by whole days and keep each event's time of day (month cells and the all-day row). */
  readonly allDay?: boolean | undefined;
  /** Resource ids by resource field; pasted (and cut) events move to them. */
  readonly resources?: Readonly<Record<string, readonly unknown[]>> | undefined;
}

/** `onBeforePaste`: `preventDefault()` cancels; replace `data` to paste other rows. */
export interface SchedulerBeforePasteEvent<Row = unknown> extends SchedulerCancelableEvent {
  /** The rows to add (copy) or the moved rows (cut), with their new times. */
  data: readonly Row[];
  readonly cut: boolean;
  readonly start: Date;
}

/** `adaptive` options. */
export interface SchedulerAdaptive {
  /** Container width (px) below which the adaptive layout applies; measured after hydration (default 640). */
  readonly breakpoint?: number | undefined;
}

/** A context menu entry: the data form of the `@salmonui/buttons/menu` entries (`items`, separators, groups, submenus). */
export type SchedulerMenuItem = MenuItemData;

/** What a context menu opened on: a cell (or cell range) or an event occurrence. */
export type SchedulerContextMenuContext<Row = unknown> =
  | {
      readonly kind: 'cell';
      readonly start: Date;
      readonly end: Date;
      readonly allDay: boolean;
      /** Resource ids per event field of the cell's group (grouped and timeline views), else null. */
      readonly resources: Readonly<Record<string, readonly unknown[]>> | null;
      readonly element: Element;
    }
  | {
      readonly kind: 'event';
      readonly occurrence: SchedulerEventInfo<Row>;
      readonly row: Row;
      readonly element: Element;
    };

/**
 * `onContextMenuItemClick`: a chosen item. The default items (`newEvent`,
 * `newRecurringEvent` and `today` on cells, `edit` and `delete` on events)
 * run their action unless `preventDefault()` is called.
 */
export interface SchedulerContextMenuItemClickEvent<Row = unknown> extends SchedulerCancelableEvent {
  readonly id: string;
  readonly item: SchedulerMenuItem | undefined;
  readonly context: SchedulerContextMenuContext<Row>;
}

/** The event a tooltip is about. */
export interface SchedulerTooltipContext<Row = unknown> {
  readonly occurrence: SchedulerEventInfo<Row>;
  readonly row: Row;
  readonly element: Element;
}

/** `tooltip` options. */
export interface SchedulerTooltip<Row = unknown> {
  /** Tooltip content; default the title, the time range and the location. */
  readonly render?: ((ctx: SchedulerTooltipContext<Row>) => ReactNode) | undefined;
}

/** `onBeforeTooltipOpen`: `preventDefault()` keeps the tooltip closed. */
export interface SchedulerBeforeTooltipOpenEvent<Row = unknown> extends SchedulerCancelableEvent, SchedulerTooltipContext<Row> {}

/** `print()` options: the printed Scheduler's size, as CSS lengths (numbers are px). */
export interface SchedulerPrintOptions {
  readonly height?: number | string | undefined;
  readonly width?: number | string | undefined;
}

/** `onBeforePrint`: `preventDefault()` cancels; `print()` resolves false. */
export interface SchedulerBeforePrintEvent extends SchedulerCancelableEvent {
  readonly options: SchedulerPrintOptions;
}

/** `onAfterPrint`: the window's `afterprint` after a `print()`. */
export interface SchedulerAfterPrintEvent extends SchedulerEvent {
  readonly options: SchedulerPrintOptions;
}

export interface SchedulerApi<Row = unknown> {
  readonly element: HTMLElement | null;
  navigate(action: 'previous' | 'next' | 'today'): void;
  setView(view: string, date?: DateInput): void;
  setDate(date: DateInput): void;
  getDateRangeText(): string;
  getViewDates(): PlainDate[];
  addEvents(rows: readonly Row[]): SchedulerActionResult<Row>;
  saveEvent(row: Row, options?: { readonly scope?: EditScope; readonly occurrenceStart?: Date }): SchedulerActionResult<Row>;
  deleteEvents(ids: readonly EventId[], options?: { readonly scope?: EditScope; readonly occurrenceStart?: Date }): SchedulerActionResult<Row>;
  openEditor(target: EventId | { readonly start: DateInput | Date; readonly end?: DateInput | Date; readonly allDay?: boolean }, options?: { readonly mode?: 'add' | 'edit' | 'editOccurrence' | 'editSeries'; readonly occurrenceStart?: Date }): void;
  closeEditor(): void;
  openQuickInfo(target: EventId | { readonly start: Date; readonly end: Date; readonly allDay?: boolean }): void;
  closeQuickInfo(): void;
  openOverlapAlert(): void;
  closeOverlapAlert(): void;
  getEvents(options?: { readonly start?: Date; readonly end?: Date; readonly includeOccurrences?: boolean }): SchedulerEventInfo<Row>[];
  getViewEvents(): SchedulerEventInfo<Row>[];
  getEventInfo(target: EventId | Element): SchedulerEventInfo<Row> | null;
  getCellInfo(target: Element): SchedulerCellInfo | null;
  getOccurrences(eventId: EventId): SchedulerEventInfo<Row>[];
  getOccurrencesInRange(start: Date, end: Date): SchedulerEventInfo<Row>[];
  getDeletedOccurrences(eventId: EventId): Date[];
  getBlockEvents(): Row[];
  isSlotAvailable(start: Date, end: Date, options?: { readonly resources?: Readonly<Record<string, readonly unknown[]>>; readonly excludeId?: EventId }): boolean;
  getSelectedCells(): SchedulerCellInfo | null;
  setWorkHours(dates: readonly DateInput[], start: string, end: string): void;
  resetWorkHours(dates?: readonly DateInput[]): void;
  scrollToTime(time: string, options?: { readonly date?: DateInput }): void;
  refresh(): void;
  reloadEvents(): void;
  setLoading(loading: boolean): void;
  getState(): SchedulerState;
  restoreState(state: Partial<SchedulerState>): void;
  /** Resource items: one by id (optionally of one resource `name`), or every item. */
  getResource(id: unknown, resource?: string): SchedulerResourceInfo | null;
  getResources(): SchedulerResourceInfo[];
  /** Expand or collapse a parent resource row of timeline views. */
  expandResource(id: unknown): void;
  collapseResource(id: unknown): void;
  /** Scrolls a resource row (timeline views) or column (grouped views) into view, also under virtualization. */
  scrollToResource(id: unknown): void;
  getRenderedRange(): SchedulerRenderedRange | null;
  /** XLSX export through `exportWriters.excel`; resolves to the file, or null when prevented. */
  exportToExcel(options?: SchedulerExcelExportOptions<Row>): Promise<SchedulerExportFile<Uint8Array> | null>;
  /** CSV export; no writer package needed. */
  exportToCsv(options?: SchedulerCsvExportOptions<Row>): Promise<SchedulerExportFile<string> | null>;
  /** iCalendar export through `exportWriters.ics`. */
  exportToICalendar(options?: SchedulerICalendarExportOptions<Row>): Promise<SchedulerExportFile<string> | null>;
  /** Adds the events of an iCalendar file or text through `exportWriters.ics`; fires `onBeforeAdd` / `onAdd`. */
  importICalendar(source: string | Blob, options?: SchedulerICalendarImportOptions<Row>): Promise<SchedulerActionResult<Row>>;
  /** Copies the selected events to the Scheduler clipboard; resolves to the number of copied events. */
  copy(): Promise<number>;
  /** As `copy`; the next `paste` moves the events instead of adding copies. */
  cut(): Promise<number>;
  /** Pastes the clipboard at `target` (default: the selected or focused cell), keeping the events' offsets. */
  paste(target?: SchedulerPasteTarget): Promise<SchedulerActionResult<Row>>;
  /** Closes the open event tooltip. */
  closeTooltip(): void;
  /** Prints the rendered view; resolves false when `onBeforePrint` cancels or outside a browser. */
  print(options?: SchedulerPrintOptions): Promise<boolean>;
}

export interface SchedulerProps<Row = Record<string, unknown>> {
  /** Events: an array (local) or a `SchedulerDataSource` (remote, read per visible range). */
  readonly data: readonly Row[] | SchedulerDataSource<Row>;
  readonly eventFields?: SchedulerEventFields | undefined;
  /** Resource definitions; reactive: add, remove and replace items by changing the prop. */
  readonly resources?: readonly SchedulerResource<object>[] | undefined;
  /** Group the views by resources. */
  readonly grouping?: SchedulerGrouping | undefined;
  /** Expanded parent resource ids of timeline views (default from `expandedField`, else expanded). */
  readonly expandedResourceIds?: readonly unknown[] | undefined;
  readonly onExpandedResourcesChange?: ((ids: readonly unknown[]) => void) | undefined;
  readonly renderResourceHeader?: ((ctx: SchedulerResourceHeaderContext) => ReactNode) | undefined;
  /** A tooltip for resource headers. */
  readonly renderResourceTooltip?: ((ctx: SchedulerResourceHeaderContext) => ReactNode) | undefined;
  readonly virtualScroll?: boolean | SchedulerVirtualScroll | undefined;
  readonly headerRows?: readonly SchedulerHeaderRow[] | undefined;
  readonly firstMonthOfYear?: number | undefined;
  readonly monthCount?: number | undefined;
  readonly agendaDayCount?: number | undefined;
  readonly hideEmptyAgendaDays?: boolean | undefined;
  readonly renderMonthHeader?: ((ctx: SchedulerMonthHeaderContext) => ReactNode) | undefined;
  readonly renderDayHeader?: ((ctx: SchedulerDayHeaderContext) => ReactNode) | undefined;
  readonly view?: string | undefined;
  readonly onViewChange?: ((view: string, event: SchedulerViewChangeEvent) => void) | undefined;
  /** Views offered by the header (default day, week, work week, month). */
  readonly views?: readonly SchedulerViewEntry<Row>[] | undefined;
  /** The anchor date. Server rendering needs it, with `view` and `timeZone`. */
  readonly date?: DateInput | undefined;
  readonly onDateChange?: ((date: PlainDate, event: SchedulerDateChangeEvent) => void) | undefined;
  readonly onBeforeNavigate?: ((event: SchedulerBeforeNavigateEvent) => void) | undefined;
  /** IANA zone the events are shown in; the host zone after hydration when omitted. */
  readonly timeZone?: string | undefined;
  /** Zones offered by the editor (default `Intl.supportedValuesOf('timeZone')`). */
  readonly timeZones?: readonly string[] | undefined;
  readonly locale?: string | undefined;
  readonly localeText?: Partial<SchedulerLocaleText> | undefined;
  readonly calendar?: string | undefined;
  readonly dateFormat?: Intl.DateTimeFormatOptions | undefined;
  readonly hourCycle?: 'h12' | 'h23' | undefined;
  readonly firstDayOfWeek?: number | undefined;
  readonly showWeekNumbers?: boolean | undefined;
  readonly weekRule?: WeekRule | undefined;
  readonly workDays?: readonly number[] | undefined;
  readonly showWeekend?: boolean | undefined;
  readonly startHour?: string | undefined;
  readonly endHour?: string | undefined;
  readonly workHours?: SchedulerWorkHours | undefined;
  readonly timeScale?: SchedulerTimeScale | undefined;
  readonly renderMajorSlot?: ((ctx: SchedulerSlotRenderContext) => ReactNode) | undefined;
  readonly renderMinorSlot?: ((ctx: SchedulerSlotRenderContext) => ReactNode) | undefined;
  readonly min?: DateInput | undefined;
  readonly max?: DateInput | undefined;
  readonly scrollTime?: string | undefined;
  readonly readOnly?: boolean | undefined;
  readonly editing?: boolean | SchedulerEditing<Row> | undefined;
  /** False rejects creates, saves and moves that collide with another event. */
  readonly overlap?: boolean | undefined;
  readonly quickInfo?: boolean | SchedulerQuickInfo<Row> | undefined;
  readonly cellSelection?: 'single' | 'multiple' | undefined;
  /** Default true; false keeps a drag selection in one day column (day views) or one row. */
  readonly cellSelectionRows?: boolean | undefined;
  readonly onCellSelectionChange?: ((selection: SchedulerCellSelectionChangeEvent) => void) | undefined;
  readonly eventLayout?: SchedulerEventLayout | undefined;
  readonly eventOrder?: ((a: Row, b: Row) => number) | undefined;
  readonly autoRowHeight?: boolean | undefined;
  readonly allDayRowExpanded?: boolean | undefined;
  readonly onAllDayRowExpandedChange?: ((expanded: boolean) => void) | undefined;
  readonly allDayRowScroll?: boolean | undefined;
  readonly currentTimeIndicator?: boolean | { readonly label?: boolean } | undefined;
  readonly toolbar?: readonly SchedulerToolbarItem[] | false | undefined;
  readonly renderToolbar?: ((ctx: { readonly items: ReactNode; readonly dateRangeText: string }) => ReactNode) | undefined;
  readonly renderEvent?: ((ctx: SchedulerEventRenderContext<Row>) => ReactNode) | undefined;
  readonly getEventProps?: ((ctx: SchedulerEventPropsContext<Row>) => SchedulerEventProps | undefined) | undefined;
  readonly getCellProps?: ((ctx: SchedulerCellContext) => SchedulerCellProps | undefined) | undefined;
  readonly renderCell?: ((ctx: SchedulerCellContext) => ReactNode) | undefined;
  readonly renderCellHeader?: ((ctx: SchedulerCellContext) => ReactNode) | undefined;
  readonly renderDateHeader?: ((ctx: SchedulerCellContext) => ReactNode) | undefined;
  readonly renderHeaderIndent?: (() => ReactNode) | undefined;
  readonly renderDateRange?: ((ctx: SchedulerDateRangeContext) => ReactNode) | undefined;
  readonly renderLoading?: (() => ReactNode) | undefined;
  readonly onCellClick?: ((event: SchedulerCellClickEvent) => void) | undefined;
  readonly onCellDoubleClick?: ((event: SchedulerCellClickEvent) => void) | undefined;
  readonly onEventClick?: ((event: SchedulerEventClickEvent<Row>) => void) | undefined;
  readonly onEventDoubleClick?: ((event: SchedulerEventClickEvent<Row>) => void) | undefined;
  readonly onHover?: ((event: SchedulerHoverEvent<Row>) => void) | undefined;
  /** Selected event ids; reactive: a change selects every visible occurrence of these events. */
  readonly selectedEventIds?: readonly EventId[] | undefined;
  readonly onEventSelectionChange?: ((ids: readonly EventId[], event: SchedulerEventSelectionChangeEvent<Row>) => void) | undefined;
  readonly onBeforeAdd?: ((event: SchedulerBeforeAddEvent<Row>) => void) | undefined;
  readonly onAdd?: ((event: SchedulerAddEvent<Row>) => void) | undefined;
  readonly onBeforeSave?: ((event: SchedulerBeforeSaveEvent<Row>) => void) | undefined;
  readonly onSave?: ((event: SchedulerSaveEvent<Row>) => void) | undefined;
  readonly onBeforeDelete?: ((event: SchedulerBeforeDeleteEvent<Row>) => void) | undefined;
  readonly onDelete?: ((event: SchedulerDeleteEvent<Row>) => void) | undefined;
  readonly onBeforePopupOpen?: ((event: SchedulerBeforePopupOpenEvent<Row>) => void) | undefined;
  readonly onPopupClose?: ((event: SchedulerPopupCloseEvent<Row>) => void) | undefined;
  readonly onMoreEventsClick?: ((event: SchedulerMoreEventsClickEvent<Row>) => void) | undefined;
  readonly onOverlap?: ((event: SchedulerOverlapEvent<Row>) => void) | undefined;
  readonly onDataLoad?: ((event: SchedulerDataLoadEvent<Row>) => void) | undefined;
  readonly onError?: ((event: SchedulerErrorEvent) => void) | undefined;
  readonly onReady?: ((api: SchedulerApi<Row>) => void) | undefined;
  /** Events move by pointer (default true when editable). */
  readonly draggable?: boolean | undefined;
  /** Events resize from their start and end edges (default true when editable). */
  readonly resizable?: boolean | undefined;
  readonly dragOptions?: SchedulerDragOptions | undefined;
  readonly onEventDragStart?: ((event: SchedulerDragStartEvent<Row>) => void) | undefined;
  /** At most once per frame, when the proposed time or resource changes. */
  readonly onEventDrag?: ((event: SchedulerDragEvent<Row>) => void) | undefined;
  readonly onBeforeEventDrop?: ((event: SchedulerBeforeDropEvent<Row>) => void) | undefined;
  readonly onEventDrop?: ((event: SchedulerDropEvent<Row>) => void) | undefined;
  readonly onEventResizeStart?: ((event: SchedulerDragStartEvent<Row>) => void) | undefined;
  readonly onEventResize?: ((event: SchedulerDragEvent<Row>) => void) | undefined;
  readonly onBeforeEventResizeEnd?: ((event: SchedulerBeforeDropEvent<Row>) => void) | undefined;
  readonly onEventResizeEnd?: ((event: SchedulerDropEvent<Row>) => void) | undefined;
  /** HTML drag data dropped on a slot; returned rows are added. */
  readonly onExternalDrop?: ((event: SchedulerExternalDropEvent) => readonly Row[] | null | undefined | void) | undefined;
  readonly onEventDragOut?: ((event: SchedulerDragOutEvent<Row>) => void) | undefined;
  /** A horizontal touch swipe navigates previous / next, mirrored in RTL (default true on coarse pointers). */
  readonly swipeNavigation?: boolean | undefined;
  /** Writer loaders of `exportToExcel`, `exportToICalendar` and `importICalendar`. */
  readonly exportWriters?: SchedulerExportWriters | undefined;
  readonly onBeforeExport?: ((event: SchedulerBeforeExportEvent<Row>) => void) | undefined;
  readonly onExport?: ((event: SchedulerExportEvent<Row>) => void) | undefined;
  /** Compact header with a view menu and one resource at a time: `true` always (server markup too), `{ breakpoint }` below a container width. */
  readonly adaptive?: boolean | SchedulerAdaptive | undefined;
  /** Item id of the resource the adaptive layout shows (default the first leaf); reactive. */
  readonly selectedResourceId?: unknown;
  readonly onSelectedResourceChange?: ((id: unknown, event: SchedulerEvent) => void) | undefined;
  /** Ctrl / Cmd + C, X and V on the selected events and cells; `api.copy` / `cut` / `paste` work without it. */
  readonly clipboard?: boolean | undefined;
  readonly onBeforePaste?: ((event: SchedulerBeforePasteEvent<Row>) => void) | undefined;
  /** Replaces the key combos of commands (`{ 'navigation.next': ['Alt+PageDown'] }`; `Mod` is Ctrl, Cmd on macOS); an empty list turns a command off. */
  readonly keyBindings?: Readonly<Partial<Record<SchedulerKeyCommand, readonly string[]>>> | undefined;
  /**
   * Context menu on cells and events (right-click, touch long-press,
   * Shift+F10 and the ContextMenu key): `true` shows the default items, an
   * array the same items everywhere, a function the items of each target
   * (an empty array or null leaves the browser menu). A lazy chunk on the
   * public `ContextMenu`; import `@salmonui/buttons/menu/styles.css` too.
   */
  readonly contextMenu?: boolean | readonly SchedulerMenuItem[] | ((ctx: SchedulerContextMenuContext<Row>) => readonly SchedulerMenuItem[] | null | undefined) | undefined;
  readonly onContextMenuItemClick?: ((event: SchedulerContextMenuItemClickEvent<Row>) => void) | undefined;
  /** Event tooltips on hover and keyboard focus: the public `Tooltip` in a lazy chunk; import `@salmonui/overlays/tooltip/styles.css` too. */
  readonly tooltip?: boolean | SchedulerTooltip<Row> | undefined;
  readonly onBeforeTooltipOpen?: ((event: SchedulerBeforeTooltipOpenEvent<Row>) => void) | undefined;
  /** `api.print()`: cancellable before, and after the print dialog closes. */
  readonly onBeforePrint?: ((event: SchedulerBeforePrintEvent) => void) | undefined;
  readonly onAfterPrint?: ((event: SchedulerAfterPrintEvent) => void) | undefined;
  readonly height?: number | string | undefined;
  readonly width?: number | string | undefined;
  readonly dir?: 'ltr' | 'rtl' | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly id?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly ref?: Ref<SchedulerApi<Row>> | undefined;
}

export type { Occurrence };
