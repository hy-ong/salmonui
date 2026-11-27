---
title: RangeCalendar
description: An inline calendar that selects a start and an end date, with several visible months, hover and focus preview, minimum and maximum spans, blocking disabled days and announced selections.
category: Calendars
order: 20
demos: [range-calendar]
---

`RangeCalendar` shares every prop of [Calendar](/docs/calendars/calendar)
(bounds, disabled days, custom cells, views, weeks, calendar systems,
keyboard) and selects a range instead of single days. It is exported from
`@salmonui/calendars/calendar`.

```tsx
import { getRangeDays, RangeCalendar, type DateRange } from '@salmonui/calendars/calendar';
import '@salmonui/calendars/calendar/styles.css';

const [range, setRange] = useState<DateRange | null>(null);

<RangeCalendar aria-label="Trip dates" visibleMonths={2} minDays={3} maxDays={14} value={range} onValueChange={setRange} />;
```

<!-- demo: range-calendar -->

## Value

`value` / `defaultValue` is a `DateRange<DateInput>` (`{ start, end }`) or
`null`; `onValueChange(range, details)` receives a frozen
`DateRange<PlainDate>` with `start <= end`, and `details.iso` is the ISO
8601 interval `start/end`. The first click (or Enter) chooses the start,
the second the end; the ends may be chosen in either order.
`getRangeDays(range)` returns the inclusive day count.

## Months and preview

- `visibleMonths` (default 1) renders that many months side by side, each
  with its own heading; the previous / next buttons move the window by one
  month and keyboard focus scrolls it as needed.
- While a start is chosen, the range previews to the hovered or focused day:
  those days carry `data-in-range`, and the ends `data-range-start` and
  `data-range-end`.

## Allowed spans

- `minDays` and `maxDays` limit the inclusive length of a range; once a start
  is chosen, the days that would make a shorter or longer range are
  disabled.
- `rangeOverDisabled` decides whether a range may span a day disabled by
  `isDateDisabled`, `min` or `max`: `'block'` (default) disables every day
  past the first disabled day on each side of the start; `'allow'` only
  keeps the ends themselves selectable.

## Announcements

A polite live region announces the selection: the start date when it is
chosen (`localeText.rangeStartSelected`, `{date}`), then the complete range
with its day count (`localeText.selectedRange`, `{start}`, `{end}`,
`{count}`, with plural forms). Month and view changes are announced through
the labelled heading.

```tsx
<RangeCalendar
  locale="de-DE"
  localeText={{
    rangeStartSelected: '{date} als Beginn gewählt',
    selectedRange: { one: '{start} bis {end}, {count} Tag', other: '{start} bis {end}, {count} Tage' },
  }}
/>
```

## API reference

The API reference for
[`@salmonui/calendars/calendar`](/docs/reference/calendars/calendar) lists every
prop, method and type.
