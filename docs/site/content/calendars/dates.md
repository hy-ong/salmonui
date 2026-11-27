---
title: Values, time zones and globalization
description: Plain, frozen, Temporal-compatible date and time values with ISO serialization, the accepted inputs, IANA time zones with DST, Intl locales, digits, calendar systems, patterns and localeText.
category: Calendars
order: 5
demos: [calendar-picker-formats]
---

Every calendar component (Calendar, RangeCalendar, DateField, TimeField and
the pickers that follow) uses the same value types and globalization rules.
The types and helpers are exported from each calendar subpath
(`@salmonui/calendars/calendar`, `/date-picker`, `/time-picker`) under the same
names.

## Value types

| Type | Fields | `String(value)` / `JSON.stringify` |
| --- | --- | --- |
| `PlainDate` | `year`, `month` (1-12), `day` | `2026-11-23` |
| `PlainTime` | `hour`, `minute`, `second`, `millisecond` | `14:30:00` |
| `PlainDateTime` | both | `2026-11-23T14:30:00` |
| `DateRange<T>` | `start`, `end` | an object of two ISO strings |

Outputs are frozen objects whose prototype carries `toString()` and
`toJSON()`, so they serialize as ISO strings. `month` is always 1-12 and
`year` is the ISO (proleptic Gregorian) year, whatever calendar the
component displays. Temporal is not required: the field names are
Temporal's, so a `Temporal.PlainDate` works as an input as it is, and
`Temporal.PlainDate.from(value)` accepts an output as a property bag. Across
a React Server Components boundary pass ISO strings or plain field objects
(RSC does not serialize prototypes).

## Inputs

`DateInput`, `TimeInput` and `DateTimeInput` accept:

- an object with the fields (`{ year: 2026, month: 11, day: 23 }`,
  `Temporal.*` objects included);
- an ISO 8601 string: a date (`'2026-11-23'`), a time (`'14:30'`,
  `'14:30:05'`) or a date-time (`'2026-11-23T14:30'`); with `Z` or an offset
  (`'2026-11-23T13:30:00Z'`) it is an instant;
- a `Date`, which is an instant: its wall-clock fields are read in the
  component's `timeZone`.

Locale text is never accepted as a value (only typed or pasted by the user).
An invalid input (`'2026-02-30'`, an invalid `Date`) is treated as empty and
logs a development warning; it never throws during render.

```ts
import { getRangeDays, toDate, toPlainDate, toPlainDateTime, toPlainTime } from '@salmonui/calendars/calendar';

toPlainDate('2026-11-23');                                  // PlainDate 2026-11-23
toPlainDate(new Date('2026-11-23T23:30:00Z'), 'Asia/Tokyo'); // 2026-11-24
toPlainTime('14:30');                                        // 14:30:00
toPlainDateTime({ year: 2026, month: 11, day: 23, hour: 9, minute: 0 });
getRangeDays({ start: toPlainDate('2026-11-03')!, end: toPlainDate('2026-11-09')! }); // 7
toDate(toPlainDateTime('2026-11-23T09:00')!, 'Europe/Berlin'); // the instant 08:00Z
```

## Time zones

`timeZone` (an IANA name such as `'America/New_York'`) matters only for
instants (a `Date`, an offset string, `details.epochMilliseconds`) and for
"today". Plain values never depend on a zone. Offsets come from
`Intl.DateTimeFormat#formatToParts` with one cached formatter per zone, and
DST is handled like Temporal's `disambiguation: 'compatible'`: a wall time in
a spring-forward gap moves forward by the gap (02:30 on 2026-03-08 in New
York is 03:30 EDT), an ambiguous one in a fall-back overlap takes the
earlier instant. Without `timeZone` the client uses the host zone; the
server never uses its own, so zone-dependent text is deferred to hydration
with sized placeholders (`data-salmon-deferred`). Zones are IANA names, not
fixed minute offsets, so they follow DST.

<!-- demo: calendar-picker-formats -->

## Locale

`locale` (BCP 47) is a prop on every component and defaults to `'en-US'`;
the host locale (`navigator.language`) is never read during render, so
server and client markup match. Month and weekday names, digits, era, day
period and segment order all come from `Intl`; no CLDR JSON is loaded,
because the browser and Node already ship the
data through `Intl`.

- **Numbering systems** follow the locale or its `-u-nu-` extension:
  `ar-EG` shows Arabic-Indic digits in day cells, headings and segments, and
  typing or pasting accepts both Latin and locale digits.
- **Calendar systems**: `calendar` or `-u-ca-` relabels the month heading
  and the full-date accessible names; Japanese (`令和8年11月`), Buddhist
  (`พ.ศ. 2569`) and ROC years appear in the heading while the value stays
  ISO. The year segment of `DateField` and the pickers keeps the ISO year
  (`2026`), as the Data Grid date editor's text input does.
- **Patterns**: `format` and `inputFormats` accept the Data Grid pattern
  grammar: `yyyy`, `yy`, `M`, `MM`, `MMM`, `MMMM`, `d`, `dd`, `H`, `HH`,
  `h`, `hh`, `m`, `mm`, `s`, `ss`, `a` and quoted literals (`'dd.MM.yyyy'`,
  `'d MMM yyyy'`, `'hh:mm a'`), as well as CLDR skeletons (`'yMMMd'`) and
  `Intl.DateTimeFormatOptions`.

## localeText

User-visible strings live in a `localeText` catalog per component, in the
Data Grid message format: a `{param}` template or plural forms chosen by
`Intl.PluralRules` (`{ one, other }`). Pass only the keys you translate;
the rest stay English.

```tsx
<Calendar
  locale="de-DE"
  localeText={{ previousMonth: 'Vorheriger Monat', nextMonth: 'Nächster Monat', today: 'Heute', weekNumber: 'KW', weekNumberLabel: 'Kalenderwoche {week}' }}
/>
<DateField locale="de-DE" localeText={{ dayPlaceholder: 'TT', monthPlaceholder: 'MM', yearPlaceholder: 'JJJJ', empty: 'Leer' }} />
```

## API reference

The API reference for
[`@salmonui/calendars/calendar`](/docs/reference/calendars/calendar),
[`@salmonui/calendars/date-picker`](/docs/reference/calendars/date-picker),
[`@salmonui/calendars/date-range-picker`](/docs/reference/calendars/date-range-picker)
and [`@salmonui/calendars/time-picker`](/docs/reference/calendars/time-picker) lists
every prop, method and type.
