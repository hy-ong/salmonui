---
title: TimePicker
description: A segmented time field with a popup listbox of times every `step` minutes between `min` and `max`, custom options, disabled times and a windowed list for long steps.
category: TimePicker
order: 40
demos: [calendar-time-picker]
---

```tsx
import { TimePicker } from '@salmonui/calendars/time-picker';
import '@salmonui/calendars/time-picker/styles.css';

<TimePicker label="Start time" step={15} min="08:00" max="18:00" name="start" />;
```

## Value

`value` / `defaultValue` accept `{ hour, minute, second? }` objects
(`Temporal.PlainTime` satisfies them), `'HH:mm[:ss]'` strings or a `Date`
(an instant, read in `timeZone`). `onValueChange(value, details)` receives a
frozen `PlainTime` and `details.iso` (`HH:mm`, or `HH:mm:ss` with
`granularity="second"`). The value is a `PlainTime`, not a `Date`: a time of
day has no date and no zone.

## The list

- One option every `step` minutes (default 30) from `min` (or midnight) to
  `max` (or the end of the day), inclusive. Typed values
  outside `min` / `max` are `aria-invalid`.
- Labels use `Intl.DateTimeFormat` for `locale`; `hourCycle` and `format`
  (`Intl.DateTimeFormatOptions`) change them.
- `placeholderValue` positions the list (and seeds the segments) without a
  value.
- `renderOption(ctx)` renders an option's content (`ctx.time`, `ctx.text`,
  `ctx.selected`, `ctx.disabled`).
- `isTimeDisabled(time)` disables options (skipped by the keys) and makes a
  typed disabled time invalid.
- The popup is at least as wide as the field; size the field with `style`
  or `className`.
- Lists over 200 options (`step={1}` gives 1,440) are windowed: options have
  `aria-setsize` / `aria-posinset`, the active option always stays mounted,
  and scrolling never re-renders React state until the mounted range changes.
Holding ArrowDown through the 1,440-option list drops no frames.

## Keyboard

Focus stays in the field while the list is open; the focused segment carries
`aria-activedescendant` pointing at the active option, and the trigger has
`aria-haspopup="listbox"`. Alt+Down opens, Up / Down / PageUp /
PageDown / Home / End move the active option, Enter commits it and closes
(the selected option is scrolled into view on open), Escape and
Alt+Up close.

With the list closed, Up / Down are spinbutton keys on the focused segment,
not list navigation. A segment knows which part of the time changes, which keeps the field
consistent with `DateField` and the APG spinbutton pattern; open the list
with Alt+Down to step through options.

## API reference

The API reference for
[`@salmonui/calendars/time-picker`](/docs/reference/calendars/time-picker) lists
every prop, method and type. Open state, focus, forms and events shared by
the pickers are in [Picker behavior and
forms](/docs/calendars/picker-behavior); server rendering, accessibility
coverage and budgets in [SSR, accessibility and
performance](/docs/calendars/platform).
