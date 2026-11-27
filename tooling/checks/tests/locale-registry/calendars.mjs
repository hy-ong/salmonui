// Locale families of @salmonui/calendars (see ../locale-coverage.test.mjs and
// navigation.mjs for the entry format). `calendar` covers Calendar and
// RangeCalendar, `dateField` DateField and TimeField; each picker reads its
// own family and the Calendar / DateField it composes read theirs.
export default {
  calendar: { defaults: [{ module: 'packages/calendars/dist/calendar/Calendar.js', export: 'CALENDAR_TEXT' }] },
  dateField: { defaults: [{ module: 'packages/calendars/dist/date-field/SegmentedField.js', export: 'FIELD_TEXT' }] },
  datePicker: { defaults: [{ module: 'packages/calendars/dist/date-picker/DatePicker.js', export: 'DATE_PICKER_DEFAULT_LOCALE_TEXT' }] },
  dateRangePicker: { defaults: [{ module: 'packages/calendars/dist/date-range-picker/DateRangePicker.js', export: 'DATE_RANGE_PICKER_DEFAULT_LOCALE_TEXT' }] },
  timePicker: { defaults: [{ module: 'packages/calendars/dist/time-picker/TimePicker.js', export: 'TIME_PICKER_DEFAULT_LOCALE_TEXT' }] },
};
