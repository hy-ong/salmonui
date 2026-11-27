---
title: Date and time
description: Picking a date and a time with `DatePicker granularity="minute"`: one popup with the calendar, a time field and a time list at `timeStep`, a daily window and time-aware bounds.
category: DatePicker
order: 21
demos: [calendar-date-time-picker]
---

```tsx
import { DatePicker } from '@salmonui/calendars/date-picker';
import '@salmonui/calendars/date-picker/styles.css';

<DatePicker label="Appointment" granularity="minute" timeStep={15} minTime="09:00" maxTime="17:00" min="2026-11-10T10:30" />;
```

To pick a date and a time together, give `DatePicker` a time granularity:
`granularity="minute"` (or `"hour"`, `"second"`) adds time segments to
the field and a time list to the popup, beside the calendar.
`timeStep` sets the list's interval in minutes, `hourCycle` the 12- or
24-hour clock, `minTime` / `maxTime` a daily window, and
`placeholderValue` where the calendar and the list open when there is no
value.

## Value

`value` / `defaultValue` accept `{ year, month, day, hour, minute, second? }`
objects, ISO date-times (`'2026-11-23T14:30'`), ISO strings with an offset
or `Z` and `Date`s (instants). `onValueChange` receives a `PlainDateTime`;
`details.iso` is `YYYY-MM-DDTHH:mm` (`:ss` with `granularity="second"`),
plus the RFC 3339 offset when `timeZone` is given, and
`details.epochMilliseconds` is the instant in the resolved zone.
A wall time that does not exist in the zone (a spring-forward gap) stays in
the field as typed, while `details.iso` and `details.epochMilliseconds` name
the instant it resolves to: 02:30 on 8 March 2026 in `America/New_York`
reports `2026-03-08T03:30-04:00`.

## The time part

- Choosing a day commits the date (keeping the time, else
  `placeholderValue`'s, else `minTime`) and moves focus to the time field in
  the popup; the list beside it has an option every `timeStep` minutes
  (default 30). Up / Down / Home / End / PageUp / PageDown
  move the active option, Enter or a click commits it and closes.
- `hourCycle: 'h12' | 'h23'` overrides the locale's clock;
  `granularity="second"` adds a seconds segment.
- `minTime` / `maxTime` are a daily window, applied to every day;
  `min` / `max` with a time limit the list on the boundary days.
- `placeholderValue` positions the calendar and the time list when there is
  no value.

Every DatePicker prop and behavior (`editable`, `clearable`, `strict`,
`open`, `ref.open()`, ...) applies to the time granularities too.

## API reference

The API reference for
[`@salmonui/calendars/date-picker`](/docs/reference/calendars/date-picker) lists
every prop, method and type. Open state, focus, forms and events shared by
the pickers are in [Picker behavior and
forms](/docs/calendars/picker-behavior); server rendering, accessibility
coverage and budgets in [SSR, accessibility and
performance](/docs/calendars/platform).
