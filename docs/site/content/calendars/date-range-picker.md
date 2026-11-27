---
title: DateRangePicker
description: Two date fields with a separator, a popup with presets, two months side by side, the range summary and Apply / Cancel; minDays, maxDays, bounds and range form values.
category: DateRangePicker
order: 30
demos: [calendar-date-range-picker, date-range-picker-options]
---

```tsx
import { DateRangePicker, getRangeDays } from '@salmonui/calendars/date-range-picker';
import '@salmonui/calendars/date-range-picker/styles.css';

<DateRangePicker
  label="Stay"
  minDays={2}
  maxDays={14}
  presets={[{ label: 'Next 7 days', value: () => ({ start: today(), end: addDays(today(), 6) }) }]}
  onValueChange={(range) => setRange(range)}
/>;
```

## Value

`value` / `defaultValue` are `DateRange` objects (`{ start, end }`, each a
date input) or `null`; `onValueChange(range, details)` receives
`{ start: PlainDate, end: PlainDate }` and `details.iso`, the ISO 8601
interval `start/end`. `getRangeDays(range)` returns the inclusive
day count.

## The popup

- Two months side by side (`visibleMonths`, default 2); under a narrow
  container one month shows, by a CSS container query, without measuring.
- The first click sets the start, hovering or focusing previews the range
  (`data-in-range`, `data-range-end` on the day cells), the second
  click sets the end and fires `onRangeSelect(range)`. The summary shows the range and its day count with the
  `localeText.selectedDays` plural forms.
- `confirm` (default `true`) commits on Apply; Cancel
  restores. `confirm={false}` commits on the second click.
- `presets: { label, value }[]` render as a listbox; a `value` function is
  evaluated when the popup opens, so "last 7 days" never freezes at server
  render time. Choosing a preset commits and closes.
- `minDays` / `maxDays` disable the days that would make the span too short
  or too long once a start is chosen.
- `isDateDisabled`, `renderDay` and `getDayProps` work as in `DatePicker`;
  `rangeOverDisabled: 'block' | 'allow'` (default `'block'`) decides whether a
  range may span disabled days; with `'block'` the days past the next
  disabled day cannot end the range.
- Alt+Right / Alt+Left move between the presets, the calendars and the
  buttons (mirrored in RTL); Tab follows the same order.

## Fields

The two `DateField`s sit in one labelled group with `separator` between them
(a `ReactNode`, default an en dash). Paste on either field splits
the text on the separator (or an en dash, `/`, ` - `, ` to `) and parses both
ends. `format` applies to both fields. `granularity="month"
| "year"` picks month or year ranges from the year or decade view.
`min`, `max` and `strict` work as in `DatePicker`: with `strict`, an
out-of-range end moves to the nearest bound on blur.

<!-- demo: date-range-picker-options -->

## Forms

`name` posts one ISO interval (`2026-11-02/2026-11-06`); `startName` and
`endName` post two ISO dates instead.

## API reference

The API reference for
[`@salmonui/calendars/date-range-picker`](/docs/reference/calendars/date-range-picker)
lists every prop, method and type. Open state, focus, forms and events
shared by the pickers are in [Picker behavior and
forms](/docs/calendars/picker-behavior); server rendering, accessibility
coverage and budgets in [SSR, accessibility and
performance](/docs/calendars/platform).
