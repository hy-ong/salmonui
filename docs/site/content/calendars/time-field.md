---
title: TimeField
description: A segmented time input with hour, minute, optional second and day period segments, the locale's or an explicit hour cycle, bounds and disabled times; values are PlainTime.
category: Fields
order: 40
demos: [time-field]
---

`TimeField` is the time counterpart of [DateField](/docs/calendars/date-field),
exported from `@salmonui/calendars/time-picker`. It has the same keyboard,
paste, partial-value, `strict`, field shell and form behavior; the
[TimePicker](/docs/calendars/time-picker) in the same subpath adds a list
popup to it.

```tsx
import { TimeField } from '@salmonui/calendars/time-picker';
import '@salmonui/calendars/time-picker/styles.css';

<TimeField label="Start" locale="en-US" defaultValue="14:30" onValueChange={(time) => console.log(String(time))} />;
```

<!-- demo: time-field -->

## Value

`value` / `defaultValue` take a `TimeInput` (`{ hour, minute, second? }`,
an ISO time such as `'14:30'` or `'14:30:05'`, a `Temporal.PlainTime` or a
`Date` read as wall time in `timeZone`); `onValueChange` receives a frozen
`PlainTime` whose `toString()` is `HH:mm:ss`, and `details.iso` is `HH:mm`
(or `HH:mm:ss` with seconds). A `Date` value carries a meaningless date and
shifts with the time zone, so it is accepted as input only.

## Segments

- `granularity`: `'hour'`, `'minute'` (default) or `'second'`.
- `hourCycle`: `'h12'` or `'h23'`; the default comes from the locale
  (12-hour in `en-US`, 24-hour in `de-DE`). A 12-hour clock adds the day
  period segment: type `a` / `p` (or the first letter of the locale's day
  period) or step it with Up / Down.
- `format`: `Intl` options or a pattern (`'HH:mm'`, `'hh:mm a'`).

## Bounds and disabled times

`min` and `max` (`TimeInput`) and `isTimeDisabled(time)` mark a complete
time as invalid (`aria-invalid` and `errorMessage`); with `strict` an
out-of-range time moves to the nearest bound on blur. `placeholderValue`
seeds Up / Down on empty segments.

```tsx
<TimeField min="09:00" max="17:00" isTimeDisabled={(t) => t.hour === 12} errorMessage="Office hours only" />
```

## API reference

The API reference for
[`@salmonui/calendars/time-picker`](/docs/reference/calendars/time-picker) lists
every prop, method and type. Open state, focus, forms and events shared by
the pickers are in [Picker behavior and
forms](/docs/calendars/picker-behavior); server rendering, accessibility
coverage and budgets in [SSR, accessibility and
performance](/docs/calendars/platform).
