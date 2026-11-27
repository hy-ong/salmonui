---
title: Field
description: The behavior every Salmon input shares - labels, descriptions, errors, sizes, adornments, clearing, form participation, SSR and accessibility - and the public Field wrapper for custom controls.
category: Components
order: 2
demos: [field-custom, field-states, field-forms, inputs-keyboard]
---

Every Inputs component renders the same parts: a real `<label for>`, the
control, a description and an error. `label`, `description`,
`errorMessage`, `invalid`, `validation`, `validateOn` and `size` are props of
every field; `Field` is public for custom controls.

```tsx
import { Field } from '@salmonui/inputs/form';
import '@salmonui/inputs/form/styles.css';

<Field name="plan" label="Plan" description="You can change it later" validation={{ required: true }} value={plan}>
  {(field) => <MyControl {...field.inputProps} value={plan} onChange={setPlan} />}
</Field>
```

<!-- demo: field-custom -->

`Field` is controlled by its child: pass the control's current `value` so
the rules can check it. Every built-in field is controlled with `value` /
`onValueChange` (or `checked` / `onCheckedChange`) and uncontrolled with
`defaultValue` (or `defaultChecked`).

## Shared behavior

- **Labels and help.** `aria-describedby` lists the
  description and the visible error, `aria-errormessage` points at the error
  and `aria-invalid` is set only while an error is shown.
- **Error state.** `invalid` forces it; validation results set it.
  The root carries `data-invalid` for styling.
- **Placeholder.** Native `placeholder`.
- **Disabled and read-only.** Native `disabled` and
  `readOnly` (so `<fieldset disabled>` works); the root carries
  `data-disabled`.
- **Class names and styles.** `className` and `style` go to the
  root, `classNames` to the parts, every other prop to the native element.
- **Direction.** The inherited `dir` applies; CSS uses logical
  properties only.
- **Locale.** `localeText` overrides every built-in string per
  component (`clear`, `validation*`); the formatting fields (NumberField,
  Slider) take a BCP 47 `locale` (default `'en-US'`; the host locale is
  never read, so server and client agree).
- **Focus.** `ref` is the native element: `focus()`,
  `blur()`, `click()`; native `onFocus` / `onBlur`.
- **Value events.** Native `onChange` plus
  `onValueChange(value, details)`; `value` / `defaultValue` make the field
  controlled or uncontrolled.
- **Forms.** `name` and `form` are native, so `FormData`
  and React 19 `<form action>` see the value; a form reset restores
  `defaultValue`.
- **Clearing.** `clearable` adds a clear button named by
  `localeText.clear`; Escape clears too.
- **Adornments.** `startAdornment` / `endAdornment` take any node.
- **SSR.** Server and client markup are identical; ids come from
  `useId`; browser APIs are touched only after mount.
- **Size.** `size: 'sm' | 'md' | 'lg'` picks one of three fixed
  metric sets (`data-size`); the theme's `density: 'compact'` tightens
  each set (see [Density](/docs/data-grid/appearance#density)).
- **Accessibility.** axe-core runs on every Inputs component in
  light, dark and RTL with errors shown (`npm run test:a11y`); each
  component page has a keyboard table.

<!-- demo: field-states -->

<!-- demo: field-forms -->

<!-- demo: inputs-keyboard -->

## Design notes

| Behavior | Why | How to |
| --- | --- | --- |
| No floating label: the label is a static `<label>` above the control. | One look per component; a label inside the input is hard to read at zoom and cut off by translations. | Put hints in `placeholder` or `description`. |
| No attribute-bag prop or method. | React props already are the attribute API. | Unknown props spread on the native element (`data-id="x"`, `aria-*`, `inputMode`). |
| No `width` prop. | Sizing belongs to layout CSS. | `style={{ inlineSize: 240 }}` or `className`. |
| No built-in persistence. | Components never write storage; it would break server rendering. | Controlled `value` plus your own storage. |
| No HTML sanitizer option. | No Inputs component renders an HTML string, so there is nothing to sanitize. | Labels and templates are `ReactNode`. |
| No lifecycle events or imperative teardown and refresh methods. | React owns mounting and unmounting. | Effects in your component; `key` to remount. |
| `onChange` fires per edit, like the native `input` event, not on blur. | It matches React and the DOM. | `onBlur` or `onValueCommit` where a component has one. |
| No method that inserts icons into the input. | Imperative DOM insertion breaks React rendering and server markup. | `startAdornment` / `endAdornment`. |
| No warning or success states. | Status colors outside the five seeds; a green border tells a screen reader nothing. | `description` for guidance, error state for problems. |
| No animation option. | The theme has no animation API. | One fixed transition, off under `prefers-reduced-motion`. |

## API

| `Field` prop | Type |
| --- | --- |
| `children` | `(field) => ReactNode`; `field.inputProps` carries `id`, `name`, `required`, `disabled`, ARIA wiring, `ref` and `onBlur` |
| `value` | the control's value, for `validation` |
| `name`, `id`, `required`, `disabled` | forwarded through `inputProps` |
| `label`, `description`, `errorMessage`, `invalid`, `validation`, `validateOn`, `size`, `localeText` | shared field props |
| `errorPlacement` | `'auto' \| 'manual'` (`'manual'` when the children render `FieldError`) |
| `requiredMark` | `boolean`: `true` marks the label while the control is required, `false` opts out under a `Form requiredMark` ([Required marks](/docs/inputs/form#required-marks)) |

`useFieldContext()` returns the enclosing field's state (`errors`,
`invalid`, `validating`, ids); `FieldError` and `FieldDescription` are the
error and description parts for custom layouts.

Full signatures: [`@salmonui/inputs/form` API reference](/docs/reference/inputs/form)
(`Field`, `FieldError`, `FieldDescription`, `useFieldContext`, `FieldCommonProps`).
