---
title: Select multiple
description: Multiple selection without typing on Select multiple, with checkboxes, joined labels, select all, group selection, limits and summaries.
category: Recipes
order: 20
demos: [select-multiple, select-multiple-options]
---

Multiple selection comes in two components: `Select multiple` when users
pick from the list (with checkboxes or a joined-labels summary) and
[`Combobox multiple`](/docs/dropdowns/combobox-multiple) when they type
(chips, custom values). With `multiple`, `value` is an array
and the listbox carries `aria-multiselectable="true"`.

```tsx
import { Select } from '@salmonui/dropdowns/select';
import '@salmonui/dropdowns/select/styles.css';

<Select multiple aria-label="Fruits" indicator="checkbox" showSelectAll groupSelection data={fruits} defaultValue={['apple']} />
```

Controlled, `value` is a `readonly` array and `onValueChange(values, event)`
reports the whole next array, with `reason` `'select'`, `'deselect'`,
`'selectAll'`, `'clear'` or `'reset'`.

<!-- demo: select-multiple -->

| Task | How |
| --- | --- |
| Checkboxes in the list | `indicator="checkbox"` |
| Show the selection as text | The default `valueDisplay="text"`: labels joined with `Intl.ListFormat` of `locale`, or `valueSeparator` |
| Chips or text | One display per instance, set by `valueDisplay`; it does not switch on focus |
| Select all option | `showSelectAll`: a tri-state first option; texts `localeText.selectAll` / `deselectAll` |
| Select all from code, react to it | Set `value`; the select-all option reports `reason: 'selectAll'` with lazy `items` |
| Limit the selection | `maxSelected`: the remaining options become `aria-disabled` and the limit is announced (`localeText.limitReached`) |
| Select a whole group | `groupSelection`: group headers become tri-state options |
| Hide picked options | `hideSelected` (default `false`) |
| Order of the list | List order stays data order; `hideSelected` keeps picked options out of the way |
| Keep the popup open after a pick | `closeOnSelect` (default `false` with `multiple`) |
| React to changes | `onValueChange` fires on every change; act on blur in `onBlur` |
| Act on a chip | Chips are not selectable; add a handler in `renderChip` |
| Open on click | A click opens the popup |
| Summarize many values | `valueDisplay="count"` (`localeText.selectedCount`, plural through `Intl.PluralRules`) or `maxVisibleValues` with "+N" |

The text display shows up to `maxVisibleValues` labels (default 100), then
"+N", so a select all over 100,000 items costs no label work.

## Design notes

- One display per instance: switching between chips and text on
  focus changes the control's height and shifts the layout, so the display
  is fixed per instance. Use `valueDisplay="text"` or `"count"` on `Select
  multiple`, or [`Combobox multiple`](/docs/dropdowns/combobox-multiple)
  for chips.
- List order is data order: moving selected items to the top
  moves the option under the pointer and the active descendant, against the
  APG listbox model. To keep picked options out of the way, set
  `hideSelected`; the trigger text lists the values in selection order.
- A change event per change: one notification per change keeps
  `value` and the parent's state in step. To act once when focus leaves,
  do the work in `onBlur`, reading the last value from `onValueChange`, or
  read the value on submit.
- Chips are not selectable: a selected-chip state is a second
  selection model with no assistive technology pattern. `Select multiple`
  has no chips; on `Combobox multiple` chips are removable values that
  keyboard focus moves between. To act on a chip, add a handler in
  `renderChip` (for example an `onClick` on the chip content).

Select all covers local `data`. Over a remote source there is no select-all
option: the
value is the list of item values, and selecting every remote item would
need all of them. `showSelectAll` renders nothing there and Ctrl+A leaves
the value unchanged. Fetch the keys from your own endpoint and set `value`:

```tsx
const selectAll = async () => setValue(await fetch('/api/fruit-ids').then((r) => r.json()));
```

## Keyboard

Keys are the Select keys: Space and Enter toggle the active option
and the popup stays open, Ctrl+A (Cmd+A) selects all (or deselects all
when every option is selected; a no-op over a remote source), Alt+Up,
Escape and Tab close. Selected disabled options stay selected when all are
deselected.

See [Select](/docs/dropdowns/select) for events, search, the popup and SSR,
and the [API reference](/docs/reference/dropdowns/select) for every prop.

<!-- demo: select-multiple-options -->
