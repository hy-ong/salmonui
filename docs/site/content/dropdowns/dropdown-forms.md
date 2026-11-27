---
title: Forms and appearance
description: Form submission through a hidden native select, reset, required, disabled and read-only states, clear buttons, styling hooks, RTL and texts of Select and Combobox.
category: Guides
order: 70
demos: [dropdown-forms, select-labels]
---

<!-- demo: dropdown-forms -->

## Forms

With `name`, a Select or Combobox renders a visually hidden native
`<select>` holding one selected option per value, so the value
submits with the form, appears in `FormData`, works before hydration, and
`required` uses native constraint validation; an invalid submit moves focus
to the visible control. Values are stringified with `String(value)`.
`form`, `id`, `autoFocus`, `aria-*` and every other DOM prop reach the
focusable element. A `reset` of the owning form restores
`defaultValue`, reporting `reason: 'reset'`; a `Combobox` also
restores `defaultInputValue` and calls `onInputChange` with
`reason: 'reset'`.

```tsx
import { Combobox } from '@salmonui/dropdowns/combobox';
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/dropdowns/combobox/styles.css';
import '@salmonui/dropdowns/select/styles.css';

<form action={save}>
  <Select name="size" required data={['S', 'M', 'L']} />
  <Combobox name="tags" multiple creatable data={tags} />
</form>
```

- `placeholder`. There is no floating label:
  floating labels move layout on focus and need size and typography rules
  the theme does not expose. Use the `label` prop (below), a
  `<label htmlFor>` above the control (the trigger is a labelable button)
  or `aria-labelledby`.
- `readOnly` sets `aria-readonly`; the popup does not open and the value is
  still submitted.
- `disabled` is the native attribute on the focusable element, so
  `<fieldset disabled>` disables it too, and the value is not submitted.
- `clearable` adds a clear button: default `false` on `Select`,
  `true` on `Combobox`. Clearing reports `reason: 'clear'`;
  Delete or Backspace on a closed `clearable` Select clear too.
- No built-in persistence: no component writes to storage on
  its own, since hidden storage writes break
  SSR consistency. Store the value yourself:
  `value={saved} onValueChange={(next) => save(next)}`.
- One `value`: several entry points for one state would need
  precedence rules, and an index goes stale when `data` changes. The text
  and position are derived from the item; to select the third item, pass
  `value={data[2].value}`, and to select by text, pass the value of the
  matching item.

## Labels, descriptions and errors

`Select` and `Combobox` take the field props of `TextField`, so they need
no wrapping `Field` or hand-written `<label>`:

```tsx
<Select
  label="Status"
  description="Shown to the customer on the receipt."
  errorMessage="Choose a status."
  invalid={submitted && !status}
  required
  name="status"
  data={statuses}
/>
```

- `label` renders a `<label>` above the control and names it through
  `aria-labelledby`; the popup listbox is labelled by it too. Pressing the
  label focuses the control (it does not open the popup).
- `description` renders help text below the control; `errorMessage` shows
  below it while `invalid` is true. Both are listed in the control's
  `aria-describedby` (description first), and `invalid` sets
  `aria-invalid` (the red border).
- The parts render only when one of them is set: the wrapper is
  `.salmon-dropdown-field` with `.salmon-dropdown-field-label`,
  `-description` and `-error` (the `TextField` layout and colors); without
  them the markup is the bare control, as before. `className` and
  `style` stay on the control root (`.salmon-select` /
  `.salmon-combobox`).
- Explicit props win: `aria-labelledby`, `aria-describedby` and
  `aria-invalid` props replace the generated values (the visible parts
  still render).
- Inside a `Field` (`@salmonui/inputs/form`), let the `Field` render the
  label, description and error and pass its `inputProps` (`id`,
  `aria-describedby`, `aria-invalid`, `aria-errormessage`) to the
  control; they pass through unchanged. Do not also set `label` here, or
  the control is named by its own label instead of the Field's. A `Form` with `requiredMark` marks
  the label of a `required` Select or Combobox as well.

<!-- demo: select-labels -->

## Appearance

- `className` and `style` reach the root; `classNames` / `styles` reach the
  parts `root`, `trigger`, `input`, `value`, `popup`, `list`, `option`,
  `group`, `chip` and `search`. Width is `style` or a class.
- Classes are `.salmon-select*`, `.salmon-combobox*` and the shared popup
  `.salmon-dropdown-*`; states are `data-*` attributes (`data-open`,
  `data-active`, `data-selected`, `data-disabled`) and colors come from the
  five theme seeds. Import `@salmonui/dropdowns/select/styles.css`
  or `@salmonui/dropdowns/combobox/styles.css` (each includes the shared
  popup rules), or the package aggregate `@salmonui/dropdowns/styles.css`.
- RTL follows the inherited `dir`: logical CSS, the popup aligns
  to the inline start, and Left / Right among chips mirror.
- Texts: `localeText` over `SELECT_DEFAULT_LOCALE_TEXT` /
  `COMBOBOX_DEFAULT_LOCALE_TEXT`. Counts are functions of the
  number and its `Intl.PluralRules` category in `locale` (default
  `'en-US'`, identical on server and client).

```tsx
<Select multiple aria-label="Tags" valueDisplay="count" data={tags} localeText={{ selectedCount: (n, plural) => (plural === 'one' ? '1 Etikett' : `${n} Etiketten`) }} locale="de-DE" />
```

See the API reference of [`select`](/docs/reference/dropdowns/select) and
[`combobox`](/docs/reference/dropdowns/combobox).
