---
title: RadioGroup and Radio
description: Native radio groups from @salmonui/inputs/radio-group in a fieldset with a legend, description, errors, orientation and the browser's own arrow-key selection.
category: Components
order: 21
demos: [radio-group-basics, choice-events, field-forms]
---

`RadioGroup` holds a set of `Radio` options. Every `Radio`
is a native `<input type="radio">` drawn with CSS; the group is a
`<fieldset role="radiogroup">` named by its `<legend>`, so the browser
provides the single Tab stop and arrow-key selection.

```tsx
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import '@salmonui/inputs/radio-group/styles.css';

<RadioGroup name="plan" label="Plan" defaultValue="pro" description="Billed monthly" required>
  <Radio value="free">Free</Radio>
  <Radio value="pro">Pro</Radio>
  <Radio value="team" disabled>Team</Radio>
</RadioGroup>
```

<!-- demo: radio-group-basics -->

## Value

`value` / `defaultValue` / `onValueChange(value, details)` on the group;
`null` selects nothing. `details.source` is
`'pointer'`, `'touch'`, `'keyboard'` (arrow keys, Space) or `'api'`;
`details.reason` is `'select'` or `'reset'` (the owning form was reset).
To read the selected value, use the controlled `value` or
`FormData.get(name)`. Without `value` the group is uncontrolled and a form
reset restores `defaultValue`.

<!-- demo: choice-events -->

## Name and submission

All radios share the group's `name`; the checked one submits `name=value`.
Without `name` the radios share a generated name (needed for
native grouping) and carry `form=""`, so nothing is submitted under it;
give the group a `name` to submit it. `form` and `required` are forwarded to
every radio.

<!-- demo: field-forms -->

## Labels and layout

- `Radio` children are its label, in a real `<label for>`.
- `labelPlacement: 'start' | 'end'` on the group or one radio.
- `orientation: 'vertical' | 'horizontal'` (horizontal wraps).
- `label`, `description`, `errorMessage` and `invalid` on the group:
the fieldset is `aria-labelledby` the legend and
  `aria-describedby` the description and the error, with `aria-invalid` and
  `aria-required` while relevant.

## Disabled and read-only

`disabled` on a `Radio` or on the group (the fieldset is disabled).
`readOnly` keeps the radios focusable but ignores changes; the group carries
`aria-readonly`.

## Standalone radios

A `Radio` outside a `RadioGroup` is a plain native radio grouped by its own
`name`, with native `checked` / `defaultChecked`.

## Keyboard

| Key | Action |
| --- | --- |
| Tab / Shift+Tab | Enters and leaves the group (one tab stop: the checked radio, or the first) |
| Arrow Down / Arrow Right | Selects the next radio, skipping disabled ones, wrapping |
| Arrow Up / Arrow Left | Selects the previous radio |
| Space | Selects the focused radio |

In right-to-left content the browser mirrors Arrow Left and Arrow Right.
Screen readers hear "radio, n of m" with the group's legend.
Try it in the [keyboard demo](/demos/inputs/inputs-keyboard).

## SSR

The radios are native inputs, so the server markup is the final markup:
ids come from `useId`, the checked radio is checked before hydration and
the group submits with its form without JavaScript.

The shared field behavior (labels, descriptions, validation) is described
on [Field](/docs/inputs/field#design-notes).

## API

### RadioGroup

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `string \| null` | `null` |
| `onValueChange` | `(value, { source, reason }) => void` | |
| `name`, `form` | `string` | generated name, not submitted |
| `label`, `description`, `errorMessage`, `invalid`, `validation`, `validateOn` | see [Field](/docs/inputs/field) | |
| `required`, `disabled`, `readOnly` | `boolean` | `false` |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` |
| `labelPlacement` | `'start' \| 'end'` | `'end'` |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `classNames` | `{ label, items, description, error }` | |
| `ref` | `HTMLFieldSetElement` | |

### Radio

| Prop | Type | Default |
| --- | --- | --- |
| `value` | `string` (required) | |
| `children` | `ReactNode` (label) | |
| `labelPlacement` | `'start' \| 'end'` | the group's |
| `disabled` and other native props | native | |
| `classNames` | `{ input, label }` | |
| `ref` | `HTMLInputElement` | |

Full signatures: [`@salmonui/inputs/radio-group` API reference](/docs/reference/inputs/radio-group).
