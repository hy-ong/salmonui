---
title: NumberField
description: A locale-aware numeric spin button from @salmonui/inputs/number-field, with Intl and Data Grid formats, stepping, clamping and form submission.
category: Components
order: 21
demos: [number-field-basics, number-field-precision]
---

`NumberField` is a numeric input. It is a native text input
with `role="spinbutton"` (`inputmode="decimal"`), formatted when blurred and
raw while focused; a hidden input with `name` submits the number.

```tsx
import { NumberField } from '@salmonui/inputs/number-field';
import '@salmonui/inputs/number-field/styles.css';

<NumberField name="price" label="Price" locale="de-DE" currency="EUR" min={0} step={0.5} />
```

<!-- demo: number-field-basics -->

## Value and format

- Controlled with `value` and `onValueChange`, uncontrolled with
  `defaultValue` (a form reset restores it); an empty field is `null`.
- `value: number | null` / `defaultValue` / `onValueChange(value, details)`
  with `details.formattedValue` and
  `reason` (`'input' | 'increment' | 'decrement' | 'clamp' | 'clear' |
  'reset'`).
- `formatOptions` (`Intl.NumberFormatOptions`) or `format` with the Data
  Grid `column.format` presets and patterns (`'N2'`, `'C2'`, `'P1'`,
  `'#,##0.00'`), one formatter for both. `currency` sets the ISO
  4217 code.
- `locale` drives formatting and parsing (default `'en-US'`; the browser
  locale is never read, so server and client markup agree). Typed text is
  parsed with `parseNumber` from `@salmonui/data-grid/engine/locale`: group,
  decimal, minus, currency and percent symbols of the locale.
- `decimals` rounds the committed value; `restrictDecimals` refuses typing
  more fraction digits.

<!-- demo: number-field-precision -->

## Range and stepping

- `min`, `max`, `step` (default 1). Float steps keep the
  step's precision (0.1 + 0.2 is 0.3).
- `clampBehavior: 'blur'` (default) clamps on blur; `'none'` keeps the value
  and reports the range error through the field (`aria-invalid`, the
  `validationMin` / `validationMax` messages).
- `showStepper` (default true) shows increment and decrement buttons that
  repeat while held; they are not tab stops.
- `incrementOnWheel` lets the wheel step a focused field. It is off by
  default because scrolling a page over a focused field should not change
  data (see [Design notes](#design-notes)).

## Keyboard

| Key | Action |
| --- | --- |
| ArrowUp / ArrowDown | Step by `step` |
| PageUp / PageDown | Step by ten steps |
| Home / End | Go to `min` / `max` (when set) |
| Escape | Clears a `clearable` field |

Screen readers hear a spin button with `aria-valuenow`, `aria-valuemin`,
`aria-valuemax` and the formatted `aria-valuetext`.

## Performance

A keystroke costs well under 0.5 ms of component work for NumberField and
MaskedField (`tests/browser/inputs-structured.spec.ts`); only the
edited field re-renders.

## SSR

Server and client render the same text because the format uses `locale`
(default `'en-US'`), never the browser locale. Before hydration the field
is a labelled text input showing the formatted value, and the hidden named
input submits the number.

## Design notes

- the mouse wheel does not change the value by default, so
  scrolling the page over a focused field never edits it. Pass
  `incrementOnWheel` to step the value with the wheel.
- there are no step methods; methods on a component instance do
  not fit React's data flow; `ref` is the native input. Step a controlled
  value instead: `setValue((v) => (v ?? 0) + 5)`.

## API

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `number \| null` | `null` |
| `onValueChange` | `(value, { formattedValue, source, reason }) => void` | |
| `min`, `max`, `step` | `number` | step `1` |
| `formatOptions` | `Intl.NumberFormatOptions` | |
| `format`, `currency`, `locale` | `string` | locale `'en-US'` |
| `decimals`, `restrictDecimals` | `number`, `boolean` | |
| `clampBehavior` | `'blur' \| 'none'` | `'blur'` |
| `showStepper`, `incrementOnWheel` | `boolean` | `true`, `false` |
| `localeText` | `{ increment, decrement, clear, validation* }` | English |
| shared field props | `label`, `description`, `errorMessage`, `invalid`, `validation`, `validateOn`, `size`, `clearable`, adornments | |

`ref` is the visible native `<input>`; unknown props go to it. Full
signatures: [`@salmonui/inputs/number-field` API reference](/docs/reference/inputs/number-field).
