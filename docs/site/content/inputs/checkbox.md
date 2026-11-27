---
title: Checkbox and CheckboxGroup
description: Native checkboxes from @salmonui/inputs/checkbox with a mixed state, label placement, form submission and a CheckboxGroup whose value is a string array.
category: Components
order: 20
demos: [checkbox-basics, choice-events]
---

`Checkbox` is a native
`<input type="checkbox">` drawn with CSS (`appearance: none` and a mask
icon), labelled by its children through a real `<label for>`, with the
shared description and error parts (see [Field](/docs/inputs/field)).
`CheckboxGroup` (a Salmon addition) holds several checkboxes as one
`string[]` value inside a `<fieldset>`.

```tsx
import { Checkbox, CheckboxGroup } from '@salmonui/inputs/checkbox';
import '@salmonui/inputs/checkbox/styles.css';

<Checkbox name="terms" value="yes" required>I accept the terms</Checkbox>
<CheckboxGroup name="fruit" label="Fruit" defaultValue={['apple']} orientation="horizontal">
  <Checkbox value="apple">Apple</Checkbox>
  <Checkbox value="pear">Pear</Checkbox>
</CheckboxGroup>
```

<!-- demo: checkbox-basics -->

## Checked state

`checked` / `defaultChecked` / `onCheckedChange(checked, details)`. `details` is a frozen `{ source, reason }`: `source` is
`'pointer'`, `'touch'`, `'keyboard'` or `'api'`, `reason` is `'toggle'` or
`'reset'` (the owning form was reset). Native `onChange`
still fires. Without `checked` the checkbox is uncontrolled and a form reset
restores `defaultChecked`.

<!-- demo: choice-events -->

## Mixed state

`indeterminate` is a DOM property, so the component sets it in an
effect after every commit; the server markup already carries
`aria-checked="mixed"` and `data-indeterminate`, so the first paint and the
accessibility tree are right before hydration and there is no hydration
difference. Clicking a mixed checkbox checks it; a controlled parent decides
whether it stays mixed.

```tsx
<Checkbox checked={all} indeterminate={some && !all} onCheckedChange={(c) => setItems(c ? ids : [])}>
  All toppings
</Checkbox>
```

## Label and placement

Children are the label; without children, name the
checkbox with `aria-label`. `labelPlacement: 'start' | 'end'` (default
`'end'`) also reorders the DOM, so reading order matches the visual order.
The 16px box answers clicks inside a 26px area (a pseudo-element, WCAG 2.2
target size) and the whole label is clickable.

## Form submission

`name`, `value` (default `'on'`), `form` and `required` are native: a checked box submits `name=value` with `FormData` and React 19
`<form action>`.

## CheckboxGroup

- `value` / `defaultValue` / `onValueChange(value, details)` with a
  `string[]` in the order the items were checked; `details.item` is the
  toggled value.
- `name` and `form` apply to every item; each checked item submits one
  `name=value` entry.
- `label` (the `<legend>`), `description`, `errorMessage`, `invalid`,
  `orientation: 'vertical' | 'horizontal'`, `disabled` (the fieldset is
  disabled, so every item is).
- `required` means at least one item; the error appears once the group
  becomes empty or on submit.
- A `Checkbox` inside a group takes its checked state from the group and
  ignores `checked` / `defaultChecked`.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Toggles the focused checkbox |
| Tab / Shift+Tab | Moves between checkboxes (each is a tab stop) |

Screen readers hear a native checkbox ("checked", "not checked", "mixed")
named by its label; a group is announced by its legend and description.
Try it in the [keyboard demo](/demos/inputs/inputs-keyboard), and
see the [form demo](/demos/inputs/field-forms) for submission.

## SSR

The checkbox is a native input, so the server markup is final (ids from
`useId`); only `indeterminate`, a DOM property, is set after hydration, and
the server already renders `aria-checked="mixed"` for it.

The shared field behavior (labels, descriptions, validation) is described
on [Field](/docs/inputs/field#design-notes).

## API

### Checkbox

| Prop | Type | Default |
| --- | --- | --- |
| `checked`, `defaultChecked` | `boolean` | `false` |
| `onCheckedChange` | `(checked, { source, reason }) => void` | |
| `indeterminate` | `boolean` | `false` |
| `children` | `ReactNode` (label) | |
| `labelPlacement` | `'start' \| 'end'` | `'end'` |
| `name`, `value`, `form`, `required`, `disabled` | native | `value: 'on'` |
| `description`, `errorMessage`, `invalid`, `validation`, `validateOn` | see [Field](/docs/inputs/field) | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `classNames` | `{ input, label, description, error }` | |
| `ref` | `HTMLInputElement` | |

Other props go to the native input; `className` / `style` go to the root.

### CheckboxGroup

| Prop | Type | Default |
| --- | --- | --- |
| `value`, `defaultValue` | `readonly string[]` | `[]` |
| `onValueChange` | `(value, { source, reason, item }) => void` | |
| `name`, `form` | `string` | |
| `label`, `description`, `errorMessage`, `invalid` | see [Field](/docs/inputs/field) | |
| `required` | `boolean` (at least one) | `false` |
| `disabled` | `boolean` | `false` |
| `orientation` | `'vertical' \| 'horizontal'` | `'vertical'` |
| `classNames` | `{ label, items, description, error }` | |
| `ref` | `HTMLFieldSetElement` | |

Full signatures: [`@salmonui/inputs/checkbox` API reference](/docs/reference/inputs/checkbox).
