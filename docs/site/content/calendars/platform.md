---
title: SSR, accessibility and performance
description: How the calendar components server-render and hydrate (Next.js App Router, Vite SSR), what the server never computes, React Compiler rules, built-in icons, forced colors, axe and ARIA snapshot coverage, and the timing and bundle budgets.
category: Common behavior
order: 60
demos: [calendar-pickers-platform, control-sizes]
---

These guarantees hold for `Calendar`, `RangeCalendar`, `DateField`,
`TimeField`, `DatePicker`, `DateRangePicker` and `TimePicker`.

## Server rendering and hydration

The components render on the server in the Next.js App Router (16+) and in
Vite SSR and hydrate without warnings. A Server Component can render them
directly with plain values:

```tsx
// app/booking/page.tsx (a Server Component)
import { Calendar } from '@salmonui/calendars/calendar';
import { DatePicker } from '@salmonui/calendars/date-picker';

export default function Page() {
  return (
    <>
      <Calendar defaultValue="2026-11-23" />
      <DatePicker label="Arrival" defaultValue="2026-11-23" name="arrival" />
    </>
  );
}
```

Props that are functions (`isDateDisabled`, `renderDay`, preset functions)
need a Client Component, as for any React component.

- **No host locale or zone.** Render reads `locale` and `timeZone` from
  props only; the defaults are `'en-US'` and, on the server, no zone. The
  server HTML is the same in every host zone.
- **Zone-dependent text waits for the client.** An instant (a `Date`, an
  ISO string with an offset) without `timeZone` renders empty, sized
  segments (`data-salmon-deferred`) and fills in after hydration. Pass
  `timeZone` to render it on the server. Plain dates and times always
  render on the server.
- **Today is client-only.** `aria-current="date"` and the today mark are
  added after hydration. A `Calendar` with no `value`, `defaultValue`,
  `focusedValue` or `defaultFocusedValue` renders the heading and 42 empty
  cells with `aria-busy="true"` and shows today's month after hydration;
  pass `defaultFocusedValue` for a complete server render.
- **No popup and no preset on the server.** Popups mount on a user action
  (`defaultOpen` opens after hydration) and preset functions run when the
  popup opens.

## React Compiler

Renders are pure: no module-level render state, no browser globals and no
clock read during render (now and today are read in event handlers and
effects), and no `forwardRef`, `cloneElement` or `Children` traversal, so
the components are safe under the React Compiler and concurrent rendering.

## Icons

The trigger (calendar or clock) and the clear button carry built-in icons
drawn in each `styles.css` with `currentColor`, so they follow the theme
colors, the dark scheme and forced colors. There is no icon markup: the
buttons are labelled by `localeText` (`'Choose date'`, `'Choose date range'`, `'Choose time'`,
`'Clear'`), and `className` on the picker can restyle the
`.salmon-picker__trigger[data-icon]` and `.salmon-picker__clear` parts.

## Theme and sizing

- **One theme.** Salmon UI has one neutral theme driven by five
  color seeds (`primary`, `success`, `warning`, `danger`, `info`) and a
  `colorScheme`. Set the seeds to your brand colors on `ThemeProvider`, and
  use `className`, `style` and the `.salmon-*` parts for local
  adjustments.
- **Control sizes.** `DatePicker` (and the date-time picker),
  `DateRangePicker`, `TimePicker`, `DateField` and `TimeField` take
  `size` (`'sm' | 'md' | 'lg'`, default `'md'`), the same prop as
  `Button`, `TextField` and the dropdowns: 24, 32 or 40 px tall, 8, 12 or
  16 px of inline padding and 14, 16 or 20 px icons. The pickers carry
  `data-size` on the root, DateField and TimeField on the field group.
  The popup and the calendar keep one size. `size` is a component prop;
  the theme's `density: 'compact'` makes each size 4 px shorter with 2 px
  less inline padding (see
  [Density](/docs/data-grid/appearance#density)). Touch sizing still
  follows the input device: under `pointer: coarse`, the calendar day and
  navigation buttons grow to 44 px and date fields get a 44 px minimum
  height.

<!-- demo: control-sizes -->

## Forced colors

Under `forced-colors: active` (Windows High Contrast) selected days, range
ends and the selected time option use `Highlight` / `HighlightText`, days
between the range ends get a `Highlight` outline, today a dashed
`CanvasText` outline, disabled days `GrayText`, the focused day a 2 px
outline and the focused segment `Highlight`.

## Accessibility coverage

axe-core runs with no violations over every component and every popup
(DatePicker popover and modal sheet, the date-time popup, DateRangePicker
and TimePicker), and ARIA snapshots pin the accessibility tree a screen
reader receives for each of them. The scrolling time lists are tab stops
that answer the list keys.

<!-- demo: calendar-pickers-platform -->

## Performance budgets

Measured on the production build:

| Scenario | Budget |
| --- | --- |
| Arrow key in the calendar grid to focus painted | ≤ 8 ms |
| PageDown / Shift+PageDown (next month or year) to painted | ≤ 16 ms |
| Server render of one calendar month | ≤ 1 ms |

Bundle sizes are gzip budgets per subpath, gated by the build: the first
load of each picker holds the field and trigger, and the popup is a lazy
chunk preloaded when the browser is idle.

| Entry | First load | All chunks |
| --- | --- | --- |
| `@salmonui/calendars/calendar` | ≤ 8 KB | ≤ 8 KB |
| `@salmonui/calendars/date-picker` | ≤ 14 KB | ≤ 25 KB |
| `@salmonui/calendars/date-range-picker` | ≤ 17 KB | ≤ 23.5 KB |
| `@salmonui/calendars/time-picker` | ≤ 13 KB | ≤ 17.5 KB |
| All four together | | ≤ 33 KB |
| Each `styles.css` | ≤ 5 KB | |
