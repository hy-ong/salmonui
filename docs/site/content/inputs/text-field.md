---
title: TextField and TextArea
description: Single and multi-line text inputs from @salmonui/inputs/text-field, on native input and textarea elements with labels, validation, adornments and a clear button.
category: Components
order: 10
demos: [text-field-basics, text-field-native]
---

`TextField` is a single-line text input and `TextArea` its multi-line
counterpart. Both render a real `<label>`, a native
`<input>` or `<textarea>` inside the shared input group, and the field's
description and error (see [Field](/docs/inputs/field)).

```tsx
import { TextArea, TextField } from '@salmonui/inputs/text-field';
import '@salmonui/inputs/text-field/styles.css';

<TextField name="email" label="Email" type="email" clearable validation={{ required: true, email: true }} />
<TextArea name="notes" label="Notes" rows={3} autoResize resize="vertical" />
```

<!-- demo: text-field-basics -->

## Value

Pass `value` with `onValueChange` for a controlled field, or `defaultValue`
(or nothing) for an uncontrolled one that a form reset restores.
`value` / `defaultValue` / `onValueChange(value, details)` with
`details.reason` `'input'`, `'clear'` or `'reset'` and `details.source`.
Native `onChange` still fires on every edit. A controlled
value never moves the caret: React writes only the changed value.

## Native attributes

Every prop the component does not own goes to the native element: `type` (`'text' | 'password' | 'email' | 'tel' | 'url' |
'search'`; numbers use `NumberField`), `autoComplete` with the full token set,
`maxLength`, `rows`, `cols`, `inputMode`, `enterKeyHint`, `name`, `form`,
`required`, `pattern`, `spellCheck`, `aria-*` and `data-*`. `ref` is the
native element, so `ref.current.focus()`, `select()` and `setSelectionRange()`
are the native methods.

<!-- demo: text-field-native -->

## TextArea

- `resize`: `'vertical' | 'horizontal' | 'both' | 'none'` (default
  `'both'`).
- `autoResize` grows the textarea with its content. Browsers with
  `field-sizing: content` size it in CSS; elsewhere the component reads
  `scrollHeight` once per value change and writes the height once.
- Adornments lay themselves out; there are no flow or orientation options
  (see [Design notes](#design-notes)).

## Keyboard

| Key | Action |
| --- | --- |
| Typing, arrows, Home / End | Native text editing |
| Escape | Clears a `clearable` field with a value |
| Tab | Moves to the next field (the clear button is not a tab stop) |

Screen readers hear a native textbox named by the label, described by the
description and, while shown, the error.

## SSR

Server and client render the same markup: ids come from `useId`, and
`autoResize` measures only after mount (browsers with `field-sizing:
content` need no measuring at all). The field works before hydration as a
plain labelled input that submits with its form.

## Design notes

- there are no adornment flow or orientation options. Adornments
  are `ReactNode`s that lay themselves out, so two enums for their flow
  would add surface without capability; wrap stacked adornments in your own
  flex container.

Shared field behavior (static label, no `width` prop, no persistence, ...)
is listed on [Field](/docs/inputs/field#design-notes).

## API

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `string` | `''` |
| `onValueChange` | `(value, { source, reason }) => void` | |
| `label`, `description` | `ReactNode` | |
| `errorMessage` | `ReactNode \| ({ errors }) => ReactNode` | first error |
| `invalid` | `boolean` | |
| `validation` | rule object ([Form](/docs/inputs/form)) | |
| `validateOn` | `'blur' \| 'change' \| 'submit'` | Form's, else `'blur'` |
| `clearable` | `boolean` | `false` |
| `startAdornment`, `endAdornment` | `ReactNode` | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `localeText` | `{ clear, validation* }` | English |
| `classNames` | `{ group, input, label, description, error }` | |
| `type` (TextField) | text input types | `'text'` |
| `resize`, `autoResize` (TextArea) | see above | `'both'`, `false` |

`ref` is the native `<input>` (TextField) or `<textarea>` (TextArea); every
other native attribute is passed through. Full signatures:
[`@salmonui/inputs/text-field` API reference](/docs/reference/inputs/text-field).
