---
title: MaskedField
description: A text input with an input mask from @salmonui/inputs/masked-field, with raw and masked values, custom tokens and form submission.
category: Components
order: 20
demos: [masked-field-basics, masked-field-tokens, field-forms]
---

`MaskedField` is a text input with an input mask. The visible native input
shows the masked text; the value is the raw text (entered characters only),
and a hidden input with `name` submits the raw or masked value.

```tsx
import { formatMasked, MaskedField } from '@salmonui/inputs/masked-field';
import '@salmonui/inputs/masked-field/styles.css';

<MaskedField name="phone" label="Phone" mask="(000) 000-0000" description="(555) 123-4567" />
formatMasked('(000) 000-0000', '5551234567'); // '(555) 123-4567'
```

<!-- demo: masked-field-basics -->

## Mask syntax

Mask elements. An empty mask is a plain text field.

| Element | Accepts |
| --- | --- |
| `0` | a digit (required) |
| `9` | a digit or space (optional) |
| `#` | a digit, space, `+` or `-` (optional) |
| `L` / `?` | a letter (required / optional) |
| `&` / `C` | any non-space character (required) / any character (optional) |
| `A` / `a` | a letter or digit (required / optional) |
| `>` / `<` / `\|` | upper-case / lower-case what follows / stop shifting |
| `\x` | the literal `x` |
| `[0-2]` | one character of the class |
| `tokens` | custom characters: `{ '#': '+-' }` (allowed characters) or `{ P: /[A-Z]/ }` |

`placeholderChar` (default `_`) fills empty positions. The masked text appears when the field is focused or has a
value; otherwise the native `placeholder` shows.

## Value

`value` with `onValueChange` makes the field controlled, `defaultValue`
uncontrolled (restored by a form reset). `value` / `defaultValue` are raw;
`onValueChange(raw, details)` carries
`details.masked`, `details.complete` and `reason` (`'input' | 'paste' |
'delete' | 'clear' | 'reset'`). `formatMasked(mask, raw, { tokens,
placeholderChar })` is the pure masked text; `parseMask` compiles a mask once.

`submitValue: 'raw' | 'masked'` (default `'raw'`) picks what the hidden
named input submits.

<!-- demo: field-forms -->

## Editing

Edits go through `beforeinput`: typing fills the next accepting
position and skips literals; Backspace and Delete clear the previous or next
position without shifting the rest; a selection is cleared first; pasted text
is masked character by character. During IME composition the mask pauses
and applies the composed text on `compositionend`.

<!-- demo: masked-field-tokens -->

A value with empty required positions is invalid with
`localeText.incomplete` ("Please complete the value.");
`required` makes an empty field invalid too.

## Keyboard and screen readers

| Key | Action |
| --- | --- |
| Characters | Fill the next accepting position |
| Backspace / Delete | Clear the previous / next position |
| Arrow keys, Home, End | Native caret movement |
| Escape | Clears a `clearable` field |

The field is a native textbox; put the expected format in `description`.
Masks of digits and literals render `dir="ltr"` so they read the
same in right-to-left pages. Try it in the
[keyboard demo](/demos/inputs/inputs-keyboard).

## SSR

The server renders the masked text of `value` / `defaultValue` (or the
`placeholder`) and the hidden named input, so the markup hydrates without a
mismatch and the form submits before hydration.

The label follows the shared [Field](/docs/inputs/field#design-notes)
rule: a static `<label>` above the input.

## API

| Prop | Type | Default |
| --- | --- | --- |
| `mask` | `string` | required |
| `tokens` | `Record<string, string \| RegExp>` | |
| `placeholderChar` | `string` | `'_'` |
| `value`, `defaultValue` | raw `string` | `''` |
| `onValueChange` | `(raw, { masked, complete, source, reason }) => void` | |
| `submitValue` | `'raw' \| 'masked'` | `'raw'` |
| `localeText` | `{ incomplete, clear, validation* }` | English |
| shared field props | `label`, `description`, `errorMessage`, `invalid`, `validation`, `validateOn`, `size`, `clearable`, adornments | |

`ref` is the visible native `<input>`. Full signatures:
[`@salmonui/inputs/masked-field` API reference](/docs/reference/inputs/masked-field).
