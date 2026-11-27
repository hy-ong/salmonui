// Localization and globalization. A `locale` drives number and date
// formats, a text catalog overrides every user-visible string, and a
// direction flag mirrors the layout. Text is plain JSON (SSR-serializable) with named `{param}`
// placeholders and optional plural forms; nothing here is module-level
// mutable state except caches of `Intl` objects.
//
// Public names defined here: `LocaleText`, `LocaleMessage`,
// `DEFAULT_LOCALE_TEXT`, `resolveLocaleText`, `formatLocaleText`,
// `createLocaleTextModule`, `createFormatter`, `formatValue`,
// `isRtlLocale`, `resolveLocale`.

import { defineDataGridModule } from './engine.js';
import { isRtlLocale, type FormatterOptions, type LocaleMessage } from '@salmonui/core/format';
import type { DataGridModule, ModuleContext } from './types.js';

/**
 * Built-in English text for every user-visible core and renderer string. Keys are flat camelCase; parameters are listed per key. Menu and
 * toolbar item labels use the item id as the key (`sortAscending`,
 * `columnChooser`, `exportExcel`, ...).
 */
export const DEFAULT_LOCALE_TEXT = Object.freeze({
  // Body and data status
  noRows: 'No records to display',
  loading: 'Loading',
  /** {count} */
  loaded: { one: 'Loaded 1 row', other: 'Loaded {count} rows' },
  /** {message} */
  dataError: '{message}. Press Enter on Retry.',
  /** Fallback message of a failed load without one. */
  error: 'Error',
  retry: 'Retry',
  /** Default `renderError` content. */
  dataErrorTitle: 'The data could not be loaded',
  /** Default header of a `type: 'rowNumber'` column. */
  rowNumberColumnHeader: '#',
  /** Boolean cell and filter values. */
  true: 'true',
  false: 'false',
  // Lookup columns
  /** {column} */
  lookupLoading: 'Loading {column} values',
  /** {column} */
  lookupError: 'Could not load {column} values',
  // Selection
  selectRow: 'Select row',
  selectAllRows: 'Select all rows',
  selectionColumnHeader: 'Selection',
  /** {count} */
  rowsSelected: { one: '1 row selected', other: '{count} rows selected' },
  selectionCleared: 'Selection cleared',
  /** {count} */
  allRowsSelected: 'All {count} rows selected',
  // Sorting
  sortAscending: 'Sort ascending',
  sortDescending: 'Sort descending',
  clearSort: 'Clear sort',
  ascending: 'ascending',
  descending: 'descending',
  /** {column} {direction} (`ascending` / `descending` text) */
  sortedBy: 'Sorted by {column} {direction}',
  sortCleared: 'Sort cleared',
  /** Touch multi-sort toggle: shown after a header tap when `sorting.multiple` is on. */
  touchMultiSort: 'Multi-sort',
  // Filtering
  filter: 'Filter',
  clear: 'Clear',
  ok: 'OK',
  selectAll: 'Select all',
  /** Checkbox filter entry of empty values. */
  blank: '(Blanks)',
  matchCase: 'Match case',
  and: 'And',
  or: 'Or',
  noMatches: 'No matches',
  /** {filters} {shown} {total}; plural on {filters} */
  filtered: { one: '{filters} filter active, {shown} of {total} rows shown', other: '{filters} filters active, {shown} of {total} rows shown' },
  filterOperator: 'Operator',
  filterValue: 'Value',
  // Filter builder; `filterBuilder` is also the toolbar item label.
  filterBuilder: 'Filter builder',
  filterField: 'Field',
  filterGroup: 'Condition group',
  /** Negates a filter builder group. */
  filterNot: 'Not',
  addCondition: 'Add condition',
  addGroup: 'Add group',
  removeCondition: 'Remove condition',
  removeGroup: 'Remove group',
  filterFrom: 'From',
  filterTo: 'To',
  /** {column} */
  filterButton: 'Filter {column}',
  /** {column} */
  filterMenuLabel: 'Filter {column}',
  /** {column} */
  filterBarInput: 'Filter {column}',
  /** {column} */
  filterBarOperator: '{column} filter operator',
  /** {conditions}: the pager filter status (`filtering.showStatus`) */
  filterStatus: 'Filtered by {conditions}',
  /** {column} {operator} {value}: one condition of the filter status */
  filterStatusCondition: '{column}: {operator} {value}',
  /** Between two conditions of the filter status. */
  filterStatusSeparator: '; ',
  searchValues: 'Search values',
  operatorEqual: 'Equal',
  operatorNotEqual: 'Not equal',
  operatorContains: 'Contains',
  operatorDoesNotContain: 'Does not contain',
  operatorStartsWith: 'Starts with',
  operatorDoesNotStartWith: 'Does not start with',
  operatorEndsWith: 'Ends with',
  operatorDoesNotEndWith: 'Does not end with',
  operatorIsEmpty: 'Empty',
  operatorIsNotEmpty: 'Not empty',
  operatorIsNull: 'Null',
  operatorIsNotNull: 'Not null',
  operatorGreaterThan: 'Greater than',
  operatorGreaterThanOrEqual: 'Greater than or equal',
  operatorLessThan: 'Less than',
  operatorLessThanOrEqual: 'Less than or equal',
  operatorBetween: 'Between',
  operatorIn: 'In',
  operatorNotIn: 'Not in',
  operatorLike: 'Like',
  operatorWildcard: 'Wildcard',
  // Search
  search: 'Search',
  searchLabel: 'Search grid',
  clearSearch: 'Clear search',
  /** {count} */
  searchMatches: { one: '1 row matches', other: '{count} rows match' },
  // Grouping
  groupPanel: 'Drag a column header here to group by that column',
  groupPanelLabel: 'Grouped columns',
  group: 'Group by this column',
  ungroup: 'Ungroup by this column',
  /** {column} */
  ungroupColumn: 'Ungroup {column}',
  /** {column}: header group toggle (`grouping.showHeaderToggle`). */
  groupByColumn: 'Group by {column}',
  /** {column} */
  ungroupByColumn: 'Ungroup by {column}',
  /** {column} {direction} */
  groupChip: 'Grouped by {column}, {direction}',
  /** {column} {direction} */
  groupChipToggle: 'Grouped by {column}, {direction}. Press to reverse the order',
  /** {count} */
  groupItems: { one: '1 item', other: '{count} items' },
  /** {level} {count}: accessible description of a group caption (1-based depth; `grid` rows carry no aria-level). */
  groupLevel: { one: 'Level {level}, 1 item', other: 'Level {level}, {count} items' },
  /** Caption of the group of empty values. */
  blankGroup: '(Blank)',
  groupLoading: 'Loading…',
  groupLoadFailed: 'Failed to load.',
  loadMore: 'Load more',
  expand: 'Expand',
  collapse: 'Collapse',
  /** {group} */
  expandGroup: 'Expand {group}',
  /** {group} */
  collapseGroup: 'Collapse {group}',
  expandAll: 'Expand all',
  collapseAll: 'Collapse all',
  // Aggregates
  sum: 'Sum',
  average: 'Average',
  min: 'Min',
  max: 'Max',
  count: 'Count',
  trueCount: 'True',
  falseCount: 'False',
  custom: 'Custom',
  // Pagination
  pagerLabel: 'Pagination',
  firstPage: 'First page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  lastPage: 'Last page',
  previousPages: 'Previous pages',
  nextPages: 'Next pages',
  /** {page} */
  pageButton: 'Page {page}',
  /** {page} {pageCount} (announcement) */
  pageOf: 'Page {page} of {pageCount}',
  /** {page} {pageCount} (pager info) */
  pagerInfo: '{page} of {pageCount} pages',
  /** {count} */
  pagerItems: { one: '(1 item)', other: '({count} items)' },
  pageSize: 'Rows per page',
  allRows: 'All',
  // Columns, menus, toolbar
  columnChooser: 'Columns',
  chooseColumns: 'Choose columns',
  searchColumns: 'Search columns',
  /** {shown} {total} */
  columnsShown: '{shown} of {total} columns shown',
  /** {column} */
  resizeColumn: 'Resize {column}',
  /** `aria-roledescription` of the resize handle. */
  columnResizer: 'column resizer',
  autoSize: 'Autosize this column',
  autoSizeAll: 'Autosize all columns',
  pinStart: 'Pin to start',
  pinEnd: 'Pin to end',
  unpin: 'Unpin',
  /** {column} */
  columnPinnedStart: '{column} pinned to the start',
  /** {column} */
  columnPinnedEnd: '{column} pinned to the end',
  /** {column} */
  columnPinnedCenter: '{column} fixed in place',
  /** {column} */
  columnUnpinned: '{column} unpinned',
  /** {column} */
  columnMenuButton: '{column} column menu',
  /** {column} */
  columnMenuLabel: '{column} column menu',
  contextMenuLabel: 'Context menu',
  toolbarLabel: 'Data Grid toolbar',
  more: 'More',
  /** {feature} (one of the `feature*` texts) */
  unavailable: '{feature} is not available',
  featureEditing: 'Editing',
  featureClipboard: 'Clipboard',
  featureExcelExport: 'Excel export',
  featurePdfExport: 'PDF export',
  featureCsvExport: 'CSV export',
  featurePrint: 'Print',
  featureGrouping: 'Grouping',
  featureSearch: 'Search',
  // Editing and toolbar
  add: 'Add',
  edit: 'Edit',
  delete: 'Delete',
  update: 'Update',
  cancel: 'Cancel',
  save: 'Save',
  editDialogTitle: 'Edit row',
  addDialogTitle: 'Add row',
  closeDialog: 'Close',
  confirmTitle: 'Confirm',
  /** {row} {errors}: row-level validation errors outside the dialog. */
  rowErrors: 'Row {row}: {errors}',
  /** {errors} */
  newRowErrors: 'New row: {errors}',
  /** {count} */
  confirmDelete: { one: 'Delete this row?', other: 'Delete {count} rows?' },
  confirmSave: 'Save all pending changes?',
  confirmDiscard: 'Discard all unsaved changes?',
  unsavedChangesLost: 'Unsaved changes will be lost. Are you sure you want to continue?',
  /** {column} */
  editingCell: 'Editing {column}',
  editingRow: 'Editing row',
  editSaved: 'Saved',
  editCancelled: 'Edit cancelled',
  rowAdded: 'Row added',
  /** {count} */
  rowsDeleted: { one: '1 row deleted', other: '{count} rows deleted' },
  saveFailed: 'Save failed',
  saveRejected: 'Save rejected',
  partialSave: 'Some changes were not saved',
  conflict: 'Conflict: the row was changed on the server.',
  /** {column}: accessible name of an editor. */
  editorLabel: '{column}',
  cellChanged: 'changed',
  cellInvalid: 'invalid',
  rowNew: 'new row',
  /** Accessible name of the always-visible add row. */
  newRowLabel: 'Add new row',
  rowDeleted: 'deleted',
  fillHandle: 'Fill handle',
  // Validation: `{0}` and `{1}` are the rule arguments, filled by the validator.
  validationRequired: 'This field is required.',
  validationMin: 'Please enter a value greater than or equal to {0}.',
  validationMax: 'Please enter a value less than or equal to {0}.',
  validationRange: 'Please enter a value between {0} and {1}.',
  validationMinLength: 'Please enter at least {0} characters.',
  validationMaxLength: 'Please enter no more than {0} characters.',
  validationRangeLength: 'Please enter a value between {0} and {1} characters long.',
  validationNumber: 'Please enter a valid number.',
  validationDigits: 'Please enter only digits.',
  validationEmail: 'Please enter a valid email address.',
  validationUrl: 'Please enter a valid URL.',
  validationDate: 'Please enter a valid date.',
  validationDateIso: 'Please enter a valid date (ISO).',
  validationCreditcard: 'Please enter a valid credit card number.',
  validationTel: 'Please enter a valid phone number.',
  validationPattern: 'Please enter a correct value.',
  validationValidate: 'Please enter a correct value.',
  // Date picker: the date and datetime editors' calendar dialog.
  chooseDate: 'Choose a date',
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  today: 'Today',
  timeLabel: 'Time',
  // Adaptive UI
  adaptiveBarLabel: 'Data Grid actions',
  sortDialogTitle: 'Sort',
  filterDialogTitle: 'Filter',
  adaptiveSortNone: 'None',
  adaptiveSortAscending: 'Ascending',
  adaptiveSortDescending: 'Descending',
  adaptiveApply: 'Apply',
  adaptiveClose: 'Close',
  multiSelect: 'Select multiple',
  /** {count} */
  selectedCount: '{count} selected',
  adaptiveFiltered: 'filtered',
  // Detail rows, child grids, row drag
  detailColumnHeader: 'Details',
  expandDetail: 'Expand details',
  collapseDetail: 'Collapse details',
  detailLoading: 'Loading details…',
  childGridLabel: 'Child rows',
  rowDragColumnHeader: 'Reorder',
  rowDragHandle: 'Drag row',
  rowDragHandleRole: 'drag handle',
  rowsGrabbed: { one: 'Grabbed 1 row', other: 'Grabbed {count} rows' },
  /** {position} */
  rowMoved: 'Moved to position {position}',
  rowsDropped: 'Dropped',
  // Tree mode toolbar items; the other tree texts default in the React tree feature.
  indent: 'Indent',
  outdent: 'Outdent',
  // Export, clipboard, print
  export: 'Export',
  exportExcel: 'Export to Excel',
  exportPdf: 'Export to PDF',
  exportCsv: 'Export to CSV',
  /** Busy status while an export runs. */
  exporting: 'Exporting…',
  /** Busy status while the print document is prepared. */
  preparingPrint: 'Preparing print…',
  print: 'Print',
  copy: 'Copy',
  paste: 'Paste',
  /** Clipboard fallback dialog when the browser blocks clipboard access. {shortcut} */
  clipboardCopyHint: 'Press {shortcut} to copy the selected cells.',
  /** {shortcut} */
  clipboardPasteHint: 'Press {shortcut} to paste into the grid.',
  clipboardText: 'Clipboard text',
} satisfies Record<string, LocaleMessage>);

export type LocaleTextKey = keyof typeof DEFAULT_LOCALE_TEXT;
/** Resolved text: every built-in key, plus any extra keys a bundle adds. */
export type LocaleText = { readonly [K in LocaleTextKey]: LocaleMessage } & { readonly [key: string]: LocaleMessage };
export type LocaleTextParams = Readonly<Record<string, string | number>>;

function isMessage(value: unknown): value is LocaleMessage {
  return typeof value === 'string' || (typeof value === 'object' && value !== null && typeof (value as { other?: unknown }).other === 'string');
}

/** English merged with override bundles, left to right. Invalid entries are ignored. */
export function resolveLocaleText(...bundles: readonly (Readonly<Record<string, unknown>> | null | undefined)[]): LocaleText {
  if (bundles.every((b) => !b)) return DEFAULT_LOCALE_TEXT as LocaleText;
  const out: Record<string, LocaleMessage> = { ...DEFAULT_LOCALE_TEXT };
  for (const bundle of bundles) {
    if (!bundle) continue;
    for (const [key, value] of Object.entries(bundle)) if (isMessage(value)) out[key] = typeof value === 'string' ? value : Object.freeze({ ...value });
  }
  return Object.freeze(out) as LocaleText;
}

const intlCache = new Map<string, Intl.PluralRules | Intl.NumberFormat>();

/** A cached `Intl.PluralRules` or `Intl.NumberFormat` of `locale` (`en-US` when the locale is invalid). */
function intl<T extends Intl.PluralRules | Intl.NumberFormat>(Ctor: new (locale: string) => T, locale: string): T {
  const key = `${Ctor.name}\u0000${locale}`;
  let value = intlCache.get(key) as T | undefined;
  if (!value) {
    try {
      value = new Ctor(locale);
    } catch {
      value = new Ctor('en-US');
    }
    intlCache.set(key, value);
  }
  return value;
}

const PARAM = /\{(\w+)\}/g;

/**
 * Formats a message: picks the plural form for `params.count` (or the first
 * numeric parameter) and fills `{param}` placeholders; numeric parameters
 * use the locale's number format. Unknown keys return the key; missing
 * parameters stay as written. Never throws.
 */
export function formatLocaleText(text: Readonly<Record<string, LocaleMessage>>, key: string, params: LocaleTextParams = {}, locale = 'en-US'): string {
  const message = text[key] ?? (DEFAULT_LOCALE_TEXT as Readonly<Record<string, LocaleMessage>>)[key];
  if (message === undefined) return key;
  let template: string;
  if (typeof message === 'string') {
    template = message;
  } else {
    const n = typeof params['count'] === 'number' ? params['count'] : (Object.values(params).find((v) => typeof v === 'number') as number | undefined);
    const forms = message as Readonly<Record<string, string | undefined>>;
    template = n === undefined ? message.other : ((n === 0 ? forms['zero'] : undefined) ?? forms[intl(Intl.PluralRules, locale).select(n)] ?? message.other);
  }
  return template.replace(PARAM, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : typeof value === 'number' ? intl(Intl.NumberFormat, locale).format(value) : String(value);
  });
}

// ---------------------------------------------------------------------------
// Locale text module
// ---------------------------------------------------------------------------

export interface LocaleTextState {
  readonly text: LocaleText;
}

export type LocaleTextSetCommand = { type: 'localeText.set'; text: Record<string, LocaleMessage> };
export type LocaleTextCommand = LocaleTextSetCommand;

export type LocaleTextMethods<Row> = {
  /** A message with placeholders filled, in the grid locale. */
  format(ctx: ModuleContext<Row>, key: string, params?: LocaleTextParams): string;
  get(ctx: ModuleContext<Row>): LocaleText;
};

export type LocaleTextModule<Row> = DataGridModule<Row, LocaleTextState, LocaleTextCommand, 'localeText', LocaleTextMethods<Row>>;

const textOf = <Row>(ctx: ModuleContext<Row>): LocaleText => (ctx.getModuleState<LocaleTextState>('localeText') as LocaleTextState).text;

/**
 * Keeps the resolved text in the snapshot (`snapshot.modules.localeText`).
 * Options: `localeText` (overrides over English). `localeText.set`
 * replaces the overrides.
 */
export function createLocaleTextModule<Row>(): LocaleTextModule<Row> {
  return defineDataGridModule<Row, LocaleTextState, LocaleTextCommand, 'localeText', LocaleTextMethods<Row>>({
    name: 'localeText',
    commands: ['localeText.set'],
    initialState: (options) => Object.freeze({ text: resolveLocaleText(options['localeText'] as Record<string, unknown> | undefined) }),
    reduce(state, command, ctx) {
      if (command.type !== 'localeText.set') return state;
      if (typeof command.text !== 'object' || command.text === null) return ctx.reject('invalidLocaleText');
      return Object.freeze({ text: resolveLocaleText(command.text) });
    },
    notify: () => ({ grid: true, allHeaders: true }),
    methods: {
      format: (ctx, key, params) => formatLocaleText(textOf(ctx), key, params, ctx.getSnapshot().locale),
      get: (ctx) => textOf(ctx),
    },
  });
}

export interface LocaleInput extends FormatterOptions {
  /** `auto` derives the direction from the locale (like `dir="auto"`). Default `ltr`. */
  readonly direction?: 'ltr' | 'rtl' | 'auto';
  /** Text overrides over English. */
  readonly localeText?: Readonly<Record<string, unknown>>;
}

export interface ResolvedLocale {
  readonly locale: string;
  readonly direction: 'ltr' | 'rtl';
  readonly currency: string;
  readonly timeZone: string | undefined;
  readonly localeText: LocaleText;
}

/** Resolves the locale props to the engine options (`locale`, `direction`, `currency`, `timeZone`) and the text. */
export function resolveLocale(input: LocaleInput = {}): ResolvedLocale {
  const locale = input.locale ?? 'en-US';
  const direction = input.direction === 'rtl' ? 'rtl' : input.direction === 'auto' ? (isRtlLocale(locale) ? 'rtl' : 'ltr') : 'ltr';
  return Object.freeze({ locale, direction, currency: input.currency ?? 'USD', timeZone: input.timeZone, localeText: resolveLocaleText(input.localeText) });
}

// Neutral formatting lives in `@salmonui/core/format`; re-exported so this
// subpath keeps every locale name.
export { createFormatter, formatValue, isRtlLocale, parseNumber } from '@salmonui/core/format';
export type { Formatter, FormatterOptions, LocaleMessage, ParseNumberOptions } from '@salmonui/core/format';
