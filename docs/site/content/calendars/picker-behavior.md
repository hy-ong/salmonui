---
title: Picker behavior and forms
description: What DatePicker, DateRangePicker and TimePicker share: open state, popup modes, ref methods, focus events, disabled and read-only, clear button, placeholder, form values, validation and reset.
category: Common behavior
order: 50
demos: [calendar-picker-forms, calendar-picker-behavior, calendar-picker-validation]
---

These props and behaviors are the same on `DatePicker`, `DateRangePicker`
and `TimePicker`.

## Open state and popup

- `open` / `defaultOpen` / `onOpenChange(open, { source, reason })`.
  `reason` is `'trigger'`, `'keyboard'`, `'focus'`, `'field'`, `'escape'`,
  `'outside'`, `'tab'`, `'select'`, `'apply'`, `'cancel'` or `'api'`. To veto
  an open or close, control
  `open` and do not update it. `defaultOpen` takes effect after
  hydration: the server never renders a popup.
- `openOnFocus` opens when focus enters the field.
- `ref` receives `{ element, focus(), blur(), open(), close() }`.
- `onFocus` / `onBlur` fire once when focus enters or leaves the whole field
  group, popup included.
- `popupMode: 'popover' | 'modal' | 'auto'`:
  `'popover'` is a top-layer popup anchored to the field; `'modal'` a
  `<dialog>` bottom sheet with a Close button; `'auto'` (default) decides
  when opening, in the event handler, with
  `matchMedia('(pointer: coarse) and (max-width: 640px)')`.
- Keys: Alt+Down opens, Alt+Up and Escape close and return focus
  to the field; in popover mode Tab leaves the popup and closes it, in modal
  mode Tab stays inside.

## Field

- `disabled`: no tab stops, no popup.
`readOnly`: focusable, no edits, no popup.
- `placeholder` is a watermark shown while the field is empty and not
  focused.
- `clearable` renders a clear button; clearing fires `onValueChange(null)`
  with `reason: 'clear'` and `onClear`.
- `editable={false}` makes the segments
  read-only; a click on the field opens the popup.
- `label`, `description` and `errorMessage` are wired to the field group
  (`aria-labelledby`, `aria-describedby`). There is no floating label.
- `className` and `style` go on the root; other DOM props (`data-*`,
  `aria-*`, `title`, DOM event handlers) go on the field group.
  There is no `width` prop: size the root with `style` or a class.
- `size` (`'sm' | 'md' | 'lg'`, default `'md'`) sets the control to 24,
  32 or 40 px tall with the Button metrics; see
  [Theme and sizing](/docs/calendars/platform#theme-and-sizing).
- Direction is inherited (`dir` on an ancestor) or set with `dir`: the popup
  aligns to the inline end and arrow keys mirror in RTL.

<!-- demo: calendar-picker-behavior -->

## Values and events

`onValueChange(value, details)` fires for user changes only, never for a
new `value` prop, so a controlled picker works with any
form library: pass `value`, update it in `onValueChange`, use `onBlur` and
`ref.focus()`. `details.iso` is the form value; zoned date-times also carry
`details.epochMilliseconds`. Instants are read in `timeZone` (an IANA name;
a fixed minute offset could not follow DST).

## Forms

- `name` posts an ISO string, not the displayed text: `YYYY-MM-DD`,
  `YYYY-MM`, `YYYY`, `YYYY-MM-DDTHH:mm[:ss]` (plus the offset when `timeZone`
  is given), `HH:mm[:ss]`. The server parses one format whatever
  the user's locale.
- The form value is a visually hidden `<input>` (not `type="hidden"`), so
  `required` and the custom validity (out of range, unavailable date or time)
  take part in constraint validation; an `invalid` event focuses the first
  segment.
- `invalid`, `errorMessage` and `onInvalid` integrate with your own
  validation.
- A form `reset` restores `defaultValue`.

<!-- demo: calendar-picker-validation -->

## Not offered

- Built-in value persistence: store the value yourself
  (`localStorage`, URL) and pass it as `value` or `defaultValue`.
- Remappable keys: the keys follow the WAI-ARIA patterns.
- A popup z-index option: popups use the top layer, above every
  z-index.
- Lifecycle events and methods: use React effects.

## API reference

The API reference for
[`@salmonui/calendars/date-picker`](/docs/reference/calendars/date-picker),
[`@salmonui/calendars/date-range-picker`](/docs/reference/calendars/date-range-picker)
and [`@salmonui/calendars/time-picker`](/docs/reference/calendars/time-picker) lists
every prop, method and type.
