// @salmonui/calendars export surface: the exports map follows the package manifest and
// every entry exports the names its docs list.
import { describeExportSurface } from '../../core/tests/export-surface.ts';

describeExportSurface('@salmonui/calendars', {
  './calendar': ['Calendar', 'RangeCalendar', 'toPlainDate'],
  './date-field': ['DateField', 'TimeField'],
  './date-picker': ['DatePicker', 'DATE_PICKER_DEFAULT_LOCALE_TEXT'],
  './date-picker/data-grid': ['DATE_PICKER_EDITOR_PROPS'],
  './date-range-picker': ['DateRangePicker', 'DATE_RANGE_PICKER_DEFAULT_LOCALE_TEXT'],
  './time-picker': ['TimePicker', 'TIME_PICKER_DEFAULT_LOCALE_TEXT'],
});
