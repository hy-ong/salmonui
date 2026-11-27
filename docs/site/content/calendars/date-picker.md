---
title: DatePicker
description: A segmented date field with a popup calendar dialog; month and year pickers, min and max, disabled days, custom day cells, and an ISO form value.
category: DatePicker
order: 20
demos: [calendar-date-picker, date-picker-data-grid]
---

```tsx
import { DatePicker } from '@salmonui/calendars/date-picker';
import '@salmonui/calendars/date-picker/styles.css';

<DatePicker label="Arrival" defaultValue="2026-11-23" min="2026-11-05" max="2026-12-20" name="arrival" />;
```

`DatePicker` is a segmented `DateField` (one spinbutton per segment), a
calendar button and a popup dialog that holds a `Calendar` (the WAI-ARIA APG
"Date Picker Dialog" pattern).

## Value

`value` / `defaultValue` accept a `PlainDate`-like object (`{ year, month,
day }`, which `Temporal.PlainDate` satisfies), an ISO string
(`'2026-11-23'`) or a `Date` (an instant, read in `timeZone`).
`onValueChange(value, details)` receives a frozen `PlainDate` (ISO
`toString()` / `toJSON()`) or `null`, and `details` with `source`
(`'pointer' | 'keyboard' | 'touch' | 'api'`), `reason` (`'input'`,
`'calendar'`, `'time'`, `'clear'`, `'reset'`, `'strict'`) and `iso`, the
form value. It fires for user changes only: a new `value` prop never
echoes.

## The popup calendar

The calendar props of `Calendar` are forwarded to the popup: `min`, `max`
(out-of-range days are disabled and navigation stops at the bounds),
`firstDayOfWeek`, `showWeekNumbers`, `weekRule`, `weekdayFormat`,
`calendar`, `showTodayButton`; `isDateDisabled`, `renderDay` and
`getDayProps` also decide validity: a
typed or pasted disabled date makes the field `aria-invalid` and shows
`errorMessage`. `view` / `onViewChange` and `focusedValue` /
`onFocusedValueChange` control the popup's navigation.

The trigger has `aria-haspopup="dialog"` and `aria-expanded`; the popup is
in the top layer, below the field, flipped above when there is no room and
shifted onto the screen. On open, focus moves to the selected day,
else `placeholderValue`, else today; Escape closes and returns focus to
where it was.

## Format and parsing

`format` takes `Intl.DateTimeFormatOptions` or a pattern of the Data Grid
pattern grammar (`'dd/MM/yyyy'`, `'yMMMd'`); the segments follow it.
Paste on any segment parses the whole text: ISO always, then the locale's
numeric order, then `inputFormats`, then your `parse(text, { locale })`.

## Month and year pickers

`granularity="month"` shows month and year segments and opens the year view
(a grid of months); `granularity="year"` a year segment and the decade view.
The value is a `PlainDate` on day 1 (January 1), and the form value is
`YYYY-MM` (`YYYY`).

```tsx
<DatePicker label="Billing month" granularity="month" name="month" />
```

## Data Grid editor

The Data Grid's built-in `date` and `datetime` editors keep the grid's own
compact picker, so a grid never loads the full `DatePicker`. To edit a
column with `DatePicker`, pass `datePickerEditor()` from
`@salmonui/calendars/date-picker/data-grid` as the column's `renderEditor`. The
column's `editorProps` (`min`, `max`, `firstDayOfWeek`, `calendar`,
`weekRule`, `showWeekNumbers`, `weekdayFormat`, `showTodayButton`,
`showOutsideDays`, `isDateDisabled`, `format`, `inputFormats`, `hourCycle`,
`timeStep`, `minTime`, `maxTime`, `locale`, `timeZone`, `popupMode`,
`strict`, `clearable`, `placeholder`, `className`, `style`) reach the
picker under the same names, and the options
apply to every cell of the column:

```tsx
import { datePickerEditor } from '@salmonui/calendars/date-picker/data-grid';
import '@salmonui/calendars/date-picker/styles.css';

const columns = [
  { field: 'due', type: 'date', renderEditor: datePickerEditor(), editorProps: { min: '2026-01-01', firstDayOfWeek: 1, calendar: 'japanese' } },
  { field: 'at', type: 'datetime', renderEditor: datePickerEditor({ granularity: 'minute', timeZone: 'UTC' }), editorProps: { timeStep: 15 } },
];
```

Date-only cells are read as the UTC midnight the grid stores and written
back as ISO dates; date-times are written as `Date` instants in
`timeZone` (else the browser zone). Enter saves and Escape cancels the edit
as in any grid editor; inside the open popup Escape only closes the popup.
The editor is its own subpath, so it adds nothing to the Data Grid bundle.

<!-- demo: date-picker-data-grid -->

## Design notes

- The picker holds one date, so there is no method to remove a date from a
  multi-date selection; use `Calendar` for multiple dates.
- The value is a `PlainDate`, not a `Date`, so a date never shifts across
  time zones.
- The Data Grid `date` / `datetime` editors are not the `DatePicker`
  component: the `DatePicker` editor is opt-in through `datePickerEditor`,
  because loading the full picker by default would grow every Data Grid
  bundle.

## API reference

The API reference for
[`@salmonui/calendars/date-picker`](/docs/reference/calendars/date-picker) and
[`@salmonui/calendars/date-picker/data-grid`](/docs/reference/calendars/date-picker-data-grid)
lists every prop, method and type. Open state, focus, forms and events
shared by the pickers are in [Picker behavior and
forms](/docs/calendars/picker-behavior); server rendering, accessibility
coverage and budgets in [SSR, accessibility and
performance](/docs/calendars/platform).
