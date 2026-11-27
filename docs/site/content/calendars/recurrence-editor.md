---
title: RecurrenceEditor
description: Edit an RFC 5545 recurrence rule (RRULE) with labelled controls, and parse, print, summarize and expand rules with pure helpers that keep wall times across DST.
category: Scheduler
order: 60
demos: [calendar-recurrence-editor, recurrence-editor-options]
---

```tsx
import { RecurrenceEditor } from '@salmonui/scheduler';
import '@salmonui/scheduler/styles.css';

<RecurrenceEditor defaultValue="FREQ=WEEKLY;BYDAY=MO,WE" start="2026-11-23T09:00" onValueChange={(rule) => save(rule)} />;
```

## Value

`value` / `defaultValue` / `onValueChange(rule, details)` is the usual
triad. `rule` is the RRULE string without the `RRULE:` prefix, in
canonical part order, or `null` for "never". `details` carries the parsed
`rule` (or `null`) and the localized `summary`. A controlled `value` that
changes from outside re-derives the form and does not call
`onValueChange`. There is no persistence and no lifecycle event: keep the
string in your own state.

## Options

- `frequencies` lists the repeat types offered, in order: `'never'`,
  `'daily'`, `'weekly'`, `'monthly'`, `'yearly'`.
- `endTypes` lists the end types: `'never'`, `'until'` (a `DatePicker`)
  and `'count'`.
- `defaultFrequency` is the repeat type when the editor starts without a
  rule.
- `start` is the first occurrence. It anchors the defaults: the weekday of
  a new weekly rule, the day and month of monthly and yearly rules, and the
  earliest until date. `min` and `max` bound the until `DatePicker`.
Without `start` the anchor is January 1, 2026, never "today",
  so server and client render the same form.
- Monthly and yearly rules repeat "on day N" (`BYMONTHDAY`) or "on the Nth
  weekday" (`BYDAY=2TU`; "last" is `-1`); yearly rules add the
  month (`BYMONTH`).

## Globalization

`locale` picks the weekday and month names, the list joiner of the summary
and the first day of the week (override with `firstDayOfWeek`); `calendar`
(an `Intl` calendar id) relabels month names and the until picker, values
stay ISO; `dateFormat` formats the until date. Every label is in
`localeText` (Data Grid message format with plural forms), including the
summary messages.

```tsx
<RecurrenceEditor
  locale="de-DE"
  localeText={{ repeat: 'Wiederholen', weeklyOn: { one: 'Jede Woche am {days}', other: 'Alle {interval} Wochen am {days}' } }}
/>
```

<!-- demo: recurrence-editor-options -->

## Inside the Scheduler editor

The Scheduler editor dialog embeds `RecurrenceEditor` for its repeat part.
In a custom editor (`editing.renderDialog`) it is an ordinary controlled
component: pass the event's rule as `value` and write `onValueChange` back
into your form state. There is no registration method.

## Accessibility and layout

The editor is a `role="group"` labelled "Recurrence" (`aria-label` or
`aria-labelledby` replace it). Each control has a visible label: the repeat
and end `Select`s, the interval and count number inputs, a weekday
`ToggleButtonGroup` (arrow keys move between days, each day is named in
full), and a radio group for the monthly mode. The summary is an
`<output aria-live="polite">`. The editor is axe-core clean.
`dir` (or the inherited direction) mirrors the rows; `className` and
`style` go to the root. The interval and count are
labelled `<input type="number">` controls.

## Rule helpers

The RRULE engine is shared by `RecurrenceEditor`, the Scheduler and the
iCalendar writer. Pure exports from `@salmonui/scheduler`:

| Helper | Result |
| --- | --- |
| `parseRecurrenceRule(text)` | `{ ok: true, rule }` or `{ ok: false, error }`; never throws |
| `formatRecurrenceRule(rule)` | The canonical string |
| `getRecurrenceSummary(rule, { locale, localeText, start })` | "Every 2 weeks on Monday and Wednesday, until Dec 31, 2026" |
| `getRecurrenceDates(rule, { start, timeZone, exceptions, range, maxCount })` | `PlainDateTime[]` wall times |

Supported parts: `FREQ` (`DAILY`, `WEEKLY`, `MONTHLY`,
`YEARLY`), `INTERVAL`, `COUNT`, `UNTIL` (date, floating date-time or UTC
`...Z`), `BYDAY` with ordinals (`2MO`, `-1FR`), `BYMONTHDAY` (negative from
the month end), `BYMONTH`, `BYSETPOS` and `WKST`. Any other part, a
duplicate part, `COUNT` together with `UNTIL`, or an ordinal `BYDAY` with a
daily or weekly frequency is an error result.

Semantics:

- The start is an occurrence only when it matches the rule (as rrule.js
  and other RFC 5545 engines); nothing before the start is generated.
- `COUNT` counts occurrences before `exceptions` are removed, as RFC 5545
  `EXDATE` does. The Scheduler also replaces edited occurrences
  (events with a `recurrenceId`) with their edited copy.
- `UNTIL` is inclusive. A date-only `UNTIL` compares dates, a UTC one
  instants, a floating one wall times.
- Occurrences keep their wall time in `timeZone` across DST transitions; a
  wall time inside a spring-forward gap moves forward by the gap (Temporal
  `'compatible'`). Without `timeZone` the wall times are floating.

```ts
getRecurrenceDates('FREQ=DAILY;COUNT=3', { start: '2026-03-07T09:30', timeZone: 'America/New_York' });
// 2026-03-07T09:30, 2026-03-08T09:30 (after the DST switch), 2026-03-09T09:30
```

Expanding one rule into a visible range takes well under a millisecond;
rules without `COUNT` skip straight
to the range.

## Time zone helpers

Time zone conversion is three pure functions:

| Helper | Result |
| --- | --- |
| `getTimeZoneOffset(instant, zone)` | Minutes east of UTC (`60` for Europe/Berlin in winter), or `null` |
| `toZonedDateTime(instant, zone)` | The wall time as a `PlainDateTime`, or `null` |
| `fromZonedDateTime(wallTime, zone)` | The instant as a `Date` (DST gaps move forward, overlaps take the earlier instant) |

An instant is a `Date`, epoch milliseconds or an ISO string with `Z` or an
offset.

## API reference

The API reference for
[`@salmonui/scheduler`](/docs/reference/scheduler) lists every
prop, method and type.
