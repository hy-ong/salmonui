---
title: OtpField
description: One-time code input from @salmonui/inputs/otp-field - one native input drawn as cells, with SMS autofill, paste, masking, separators and onComplete.
category: Components
order: 41
demos: [otp-field-basics, otp-field-options]
---

`OtpField` is a one-time code input. It is one native
`<input autocomplete="one-time-code">` with `maxLength={length}` laid over
cells drawn from the value and the caret, so SMS autofill, password
managers, paste and screen readers all see a single field.

```tsx
import { OtpField } from '@salmonui/inputs/otp-field';
import '@salmonui/inputs/otp-field/styles.css';

<OtpField name="code" label="Verification code" description="6 digits from the SMS" length={6} separator="-" groupSize={3} onComplete={verify} />
```

<!-- demo: otp-field-basics -->

## Value

`value` / `defaultValue` / `onValueChange(value, details)` with a string;
`details.reason` is `'input'` (typing or autofill), `'paste'` or
`'reset'`. `onComplete(value)` fires when an edit fills every cell.
`length` (default 4) is the number of cells. Controlled with
`value`, uncontrolled with `defaultValue` (restored by a form reset); with
`name` the native input submits the code.

## Characters

- `type: 'numeric' | 'alphanumeric' | 'text'` (default `'numeric'`) sets
  `inputmode` and `pattern` and drops other characters. Numeric
  codes are laid out left to right even in right-to-left content.
- `transform: 'uppercase' | 'lowercase' | 'none'` normalizes letters in the
  value.
- `mask` hides characters: the input becomes `type="password"` and the cells
  show `•` (or the given character).

## Cells

- `placeholder`: one character repeated in every empty cell, or one
  character per cell.
- `separator` (`ReactNode`) between groups of `groupSize` cells (default 1
  when a separator is given).
- The active cell follows the caret: arrow keys, Home and End move it, and a
  click on a filled cell selects its character so typing replaces it.

## Paste and autofill

A pasted code replaces the whole value after filtering (spaces and dashes in
"123 456" are dropped) and fills every cell; one-time-code autofill writes
the input directly. Both fire `onComplete` when the code is full.

## Validation

A partly filled code is invalid with `localeText.incomplete` ("Enter all {0}
characters"), shown after blur like every field; `required` and the
[Form](/docs/inputs/form) rules apply as usual. `autoFocus` is native.

<!-- demo: otp-field-options -->

## Keyboard

| Key | Action |
| --- | --- |
| Characters | Insert at the caret, up to `length`; with a selected character (click its cell), replace it |
| Backspace / Delete | Remove the character before / after the caret |
| Arrow Left / Arrow Right, Home / End | Move the active cell |
| Paste (Ctrl+V / Cmd+V) | Replaces the whole code |

Screen readers hear one textbox named by the label and described by the
description. Try it in the
[keyboard demo](/demos/inputs/inputs-keyboard).

## SSR

The cells are drawn from the value, so the server markup shows the
`defaultValue` and placeholders; the native input works (and SMS autofill
fills it) before hydration.

## Design notes

- the cells have one outlined look: the theme keeps one look per
  component, so there is no styling variant.
- there are no per-cell labels: the field is one native input with
  one accessible name, so per-cell labels would describe elements that do
  not exist. Put the instructions in one `label` and `description`
  ("6-digit code from the SMS").

## API

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `string` | `''` |
| `onValueChange` | `(value, { source, reason }) => void` | |
| `onComplete` | `(value) => void` | |
| `length` | `number` | `4` |
| `type` | `'numeric' \| 'alphanumeric' \| 'text'` | `'numeric'` |
| `mask` | `boolean \| string` | `false` |
| `placeholder` | `string` | |
| `separator` | `ReactNode` | |
| `groupSize` | `number` | `1` with a separator |
| `transform` | `'uppercase' \| 'lowercase' \| 'none'` | `'none'` |
| `label`, `description`, `errorMessage`, `invalid`, `validation`, `validateOn` | see [Field](/docs/inputs/field) | |
| `localeText` | `{ incomplete, validation* }` | English |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `classNames` | `{ cells, cell, input, label, description, error }` | |
| `ref` | `HTMLInputElement` | |

`normalizeOtp(raw, length, type?, transform?)` is exported for server-side
checks of submitted codes. Full signatures:
[`@salmonui/inputs/otp-field` API reference](/docs/reference/inputs/otp-field).
