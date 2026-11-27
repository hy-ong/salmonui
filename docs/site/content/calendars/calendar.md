---
title: Calendar
description: An inline month, year and decade calendar with single or multiple selection, bounds, disabled days, custom day cells, week numbers, calendar systems and the APG date grid keyboard model.
category: Calendars
order: 10
demos: [calendar-basic, calendar-multiple, calendar-disabled-days]
---

`Calendar` is an inline calendar: a header with previous and next buttons
and a view button, and a grid of days (or months, or years). It lives in
`@salmonui/calendars/calendar` together with [RangeCalendar](/docs/calendars/range-calendar)
and has its own stylesheet.

```tsx
import { Calendar } from '@salmonui/calendars/calendar';
import '@salmonui/calendars/calendar/styles.css';

export function DeliveryDate() {
  return <Calendar aria-label="Delivery date" locale="en-US" defaultValue="2026-11-23" onValueChange={(date) => console.log(String(date))} />;
}
```

Values are plain ISO dates (`PlainDate`: frozen `{ year, month, day }`
with `toString()` and `toJSON()` returning `YYYY-MM-DD`), never `Date`
objects. See [Values, time zones and globalization](/docs/calendars/dates).

<!-- demo: calendar-basic -->

## Value and selection

`value` / `defaultValue` / `onValueChange` is the controlled and
uncontrolled triad of every Salmon UI component. The input accepts a
`DateInput` (date fields, an ISO string, a `Temporal.PlainDate` or a `Date`)
and `onValueChange(value, details)` receives a `PlainDate` (or `null`);
`details` carries `source` (`'pointer' | 'keyboard' | 'api'`), `reason`
(`'select' | 'today'`) and `iso`, the form value. The callback fires for
user changes only; a new `value` prop never echoes back.

With `selectionMode="multiple"` the value is an array: clicking a day or
pressing Enter / Space toggles it, and `onValueChange` receives the sorted
`PlainDate[]`.

```tsx
const [dates, setDates] = useState<readonly DateInput[]>([]);
<Calendar selectionMode="multiple" value={dates} onValueChange={setDates} />;
```

There are no `addDate()` / `removeDate()` methods: update the array you pass
as `value` (`setDates([...dates, d])`, or a filter to remove one).

<!-- demo: calendar-multiple -->

## Bounds and disabled days

`min` and `max` (`DateInput`) disable every day outside the range: those
days are `aria-disabled`, the previous / next buttons are disabled at the
bounds and keyboard focus is clamped. The calendar is unbounded by default
(set, for example, `min="1900-01-01" max="2099-12-31"` to bound it).

`isDateDisabled(date)` disables single days (weekends, holidays). Disabled
days stay focusable so keyboard users can move through them, but they
cannot be selected.

```tsx
<Calendar isDateDisabled={(date) => isWeekend(date) || holidays.has(String(date))} />
```

## Custom day cells

`renderDay(ctx)` replaces the content of a day cell and `getDayProps(ctx)`
adds a `className`, `style`, `title` or `data-*` attributes. Both are called
only for the cells that are rendered. `ctx` carries `date`, `selected`,
`disabled`, `outside`, `today`, `focused`, `inRange`, `rangeStart` and
`rangeEnd`.

```tsx
<Calendar
  getDayProps={({ date }) => (paydays.has(String(date)) ? { className: 'payday', title: 'Payday' } : undefined)}
  renderDay={({ date }) => <>{date.day}{paydays.has(String(date)) ? ' •' : null}</>}
/>
```

`showOutsideDays` shows the days of the previous and next month in the six
week grid (hidden by default); they carry `data-outside`
and are selectable.

<!-- demo: calendar-disabled-days -->

## Views

The header's view button shows the month heading; activating it moves up a
view: month → year (12 months) → decade (12 years, including one edge year
on each side). Activating a cell in a higher view moves back down.

| Prop | Meaning |
| --- | --- |
| `view` / `defaultView` / `onViewChange` | The navigation view: `'month'`, `'year'` or `'decade'`. |
| `granularity` | What is selected: `'day'` (default), `'month'` (a month picker, value on day 1) or `'year'` (value on January 1); it also sets the deepest view. |
| `minView` / `maxView` | The deepest view (default from `granularity`) and the highest view the heading can reach (default `'decade'`). |
| `focusedValue` / `defaultFocusedValue` / `onFocusedValueChange` | The date the calendar shows and focuses; changes by buttons and keys fire `onFocusedValueChange`. |

The previous and next buttons are labelled through `localeText`
(`previousMonth`, `nextMonth`, `previousYear`, `nextYear`,
`previousDecade`, `nextDecade`).

## Weeks

- `firstDayOfWeek` (0 Sunday ... 6 Saturday) defaults to the locale's week
  info (`Intl.Locale#getWeekInfo()`, with a CLDR region fallback and the
  `-u-fw-` extension), as the Data Grid date editor does.
- `showWeekNumbers` adds a labelled week-number row header to each week.
- `weekRule` (`'firstDay'`, `'firstFullWeek'` or `'firstFourDayWeek'`)
  decides which week of January is week 1; the default comes from the
  locale's minimal days (4 in most of Europe, the ISO rule).
- `weekdayFormat` (`'narrow'`, `'short'` or `'long'`, default `'short'`)
  sets the column header width. A two-letter width ("Su") is not offered
  because `Intl` does not expose it.

## Calendar systems

`calendar` takes an `Intl` calendar id; the default is the `-u-ca-`
extension of `locale`, else Gregorian. Gregorian-month calendars
(`buddhist`, `japanese`, `roc`) relabel the era and year; Islamic calendars
(`islamic-umalqura`, `islamic-civil`, ...) lay out their own months, found
by formatting days through `Intl`, with no calendar tables. The value is an
ISO date in every case.

```tsx
<Calendar locale="ar-SA" calendar="islamic-umalqura" defaultValue="2026-11-23" />
```

## Today

`showTodayButton` renders a Today button that selects and focuses today; it
is disabled when today is out of range or disabled. Today carries
`data-today` and `aria-current="date"`. Both are applied after hydration:
the server never computes "today", so its markup does not depend on its
clock or time zone. A calendar with no `value`, `defaultValue`,
`focusedValue` or `defaultFocusedValue` renders a sized frame with
`aria-busy="true"` on the server and shows the current month after
hydration; pass `defaultFocusedValue` for a complete server render.

## Keyboard

The grid follows the WAI-ARIA APG Date Picker Dialog grid: `role="grid"`
labelled by the heading, weekday headers with their long names as `abbr`,
`aria-selected`, `aria-disabled`, `aria-current="date"`, the full date as
each day's accessible name, and a roving tabindex (one focusable cell)
instead of `aria-activedescendant`.

| Key | Month view | Year and decade views |
| --- | --- | --- |
| Left / Right | Previous / next day (mirrored in RTL) | Previous / next cell (mirrored in RTL) |
| Up / Down | Same day of the previous / next week | Cell above / below |
| Home / End | First / last day of the week | First / last cell of the row |
| Ctrl+Home / Ctrl+End | First / last day of the month | First / last cell |
| PageUp / PageDown | Previous / next month | Previous / next year or decade |
| Shift+PageUp / Shift+PageDown | Previous / next year | – |
| Ctrl+Up / Ctrl+Down | Higher / deeper view | Higher / deeper view |
| Enter / Space | Select (toggle in multiple mode) | Select in the deepest view, else drill down |

Direction comes from the inherited `dir` (or the `dir` prop) and is read at
key time, so RTL mirrors Left and Right without a prop.

## Styling

Every part has a `.salmon-calendar__*` class: `__header`, `__nav`,
`__heading`, `__grid`, `__weekday`, `__week-number`, `__day` (month view),
`__cell` (year and decade views) and `__today`. State is exposed as data
attributes on `.salmon-calendar__day`: `data-selected`, `data-today`,
`data-outside`, `data-disabled`, `data-in-range`, `data-range-start` and
`data-range-end`. Colors come from the theme's `--salmon-*` variables, so the
calendar follows the theme's `colorScheme` (light, dark or auto) with no
calendar-specific theme input; under `forced-colors` the selection, focus,
today and disabled states use system colors, and under `pointer: coarse`
day cells grow to 44 px targets.

## API reference

The API reference for
[`@salmonui/calendars/calendar`](/docs/reference/calendars/calendar) lists every
prop, method and type.
