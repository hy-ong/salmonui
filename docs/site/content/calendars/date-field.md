---
title: DateField
description: A segmented date or date-time input with one spinbutton per segment in the locale's order, typing with auto-advance, paste parsing, partial values, strict bounds and an ISO form value.
category: Fields
order: 30
demos: [date-field]
---

`DateField` is a date input without a popup: one focusable segment per
field (month, day, year, and hour, minute, second and AM/PM for date-times)
in the order and digits of the locale. It is exported from
`@salmonui/calendars/date-picker`, next to the
[DatePicker](/docs/calendars/date-picker) that adds a calendar popup to it.

```tsx
import { DateField } from '@salmonui/calendars/date-picker';
import '@salmonui/calendars/date-picker/styles.css';

<DateField label="Start date" locale="en-US" defaultValue="2026-11-23" name="start" onValueChange={(date, { iso }) => save(iso)} />;
```

<!-- demo: date-field -->

## Segments and format

The segments follow `format`: `Intl.DateTimeFormatOptions`, a CLDR skeleton
(`'yMMMd'`) or a pattern in the Data Grid pattern grammar (`'dd/MM/yyyy'`,
`'d MMM yyyy'`). Without `format` the field uses the locale's numeric order
(`mm/dd/yyyy` in `en-US`, `dd.mm.yyyy` in `de-DE`). `granularity` sets the
deepest segment:

| `granularity` | Segments | Value |
| --- | --- | --- |
| `'year'` | year | `PlainDate` on January 1 |
| `'month'` | month, year | `PlainDate` on day 1 |
| `'day'` (default) | month, day, year | `PlainDate` |
| `'hour'`, `'minute'`, `'second'` | the date plus the time segments | `PlainDateTime` |

`hourCycle` (`'h12'` or `'h23'`) overrides the locale's clock; a 12-hour
clock adds the day period segment.

## Keyboard

Each segment is a WAI-ARIA spinbutton (`aria-valuenow`, `aria-valuemin`,
`aria-valuemax`, `aria-valuetext` with the localized text, and the segment
name from `Intl.DisplayNames` as its label) inside a `role="group"`
labelled by `label`. Literals are `aria-hidden`. Segments are focusable
spans with `inputMode="numeric"`, not `contentEditable`, so there is no
caret or IME side effect.

| Key | Action |
| --- | --- |
| Up / Down | Increment / decrement, wrapping within the segment; an empty segment starts at `placeholderValue` (else now) |
| PageUp / PageDown | Larger steps (10 years, 3 months, 7 days, 2 hours, 15 minutes or seconds) |
| Home / End | The segment's minimum / maximum |
| Digits | Type the value; the field moves to the next segment when no further digit fits. Latin and locale digits both work |
| Backspace / Delete | Remove the last typed digit, then clear the segment |
| Left / Right | Previous / next segment (mirrored in RTL) |
| The separator (`/`, `.`, `-`, `:`) | Next segment |
| Letters | Month names by prefix on a month-name segment; `a` / `p` (or the locale's day period) on AM/PM |

## Paste and typed text

Pasting on any segment parses the whole text, trying in order: ISO 8601
(always), the field's own segment order (digit groups, month names and the
day period in the locale), every pattern in `inputFormats`, then the
`parse(text, { locale })` callback. There is no unmasked free-text mode:
typing and paste cover it with per-segment semantics.

```tsx
<DateField inputFormats={['yyyyMMdd', 'd MMM yyyy']} parse={(text) => (text === 'today' ? todayFields() : null)} />
```

## Partial and invalid values

While any segment is empty, the value is `null`; typed segments keep their
state until blur. Segment placeholders come from `localeText`
(`yearPlaceholder`, `monthPlaceholder`, ...).

A complete value outside `min` / `max` or rejected by `isDateDisabled`
makes the field `aria-invalid` and shows `errorMessage`. Without `strict`
(the default) the value is kept and reported. With `strict`,
on blur an out-of-range value moves to the nearest bound, and incomplete or
disabled input reverts to the last valid value.

## Field shell and forms

`label`, `description` and `errorMessage` render above and below the
segments and are wired with `aria-labelledby` / `aria-describedby`;
`disabled`, `readOnly`, `required` and `invalid` apply to every segment.
`onFocus` and `onBlur` fire once when focus enters or leaves the whole
group. With `name`, a visually hidden input posts the ISO value
(`YYYY-MM-DD`, `YYYY-MM`, `YYYY` or `YYYY-MM-DDTHH:mm[:ss]`), not the
display text. With `timeZone`, a date-time value's `details` also carries
`epochMilliseconds` and an `iso` with the RFC 3339 offset.

`size` (`'sm' | 'md' | 'lg'`, default `'md'`) sets the field group to 24,
32 or 40 px with 8, 12 or 16 px of inline padding and puts `data-size` on
the group; `TimeField` takes the same prop
([Theme and sizing](/docs/calendars/platform#theme-and-sizing)).

## Performance

A segment keystroke re-renders only the field (a few spans); the typed
digit buffer lives in a ref. The keystroke-to-paint budget is 8 ms on the
reference desktop.

## API reference

The API reference for
[`@salmonui/calendars/date-picker`](/docs/reference/calendars/date-picker) lists
every prop, method and type. Open state, focus, forms and events shared by
the pickers are in [Picker behavior and
forms](/docs/calendars/picker-behavior); server rendering, accessibility
coverage and budgets in [SSR, accessibility and
performance](/docs/calendars/platform).
