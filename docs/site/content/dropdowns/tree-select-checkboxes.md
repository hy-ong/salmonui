---
title: TreeSelect checkboxes
description: Multiple TreeSelect - tri-state checkboxes with cascade or independent checks, select all, and the text, chips, count and custom value displays.
category: Recipes
order: 70
demos: [tree-select-checkboxes]
---

`multiple` turns [TreeSelect](/docs/dropdowns/tree-select) into a
multi-value picker: `value` / `defaultValue` are arrays and
`onValueChange(values, event)` reports every change. The rest of the API
(data, expansion, search, keyboard, forms) is on the
[TreeSelect](/docs/dropdowns/tree-select) page and in the
[API reference](/docs/reference/dropdowns/tree-select).

```tsx
import { TreeSelect } from '@salmonui/dropdowns/tree-select';
import '@salmonui/dropdowns/tree-select/styles.css';

<TreeSelect aria-label="Produce" data={produce} multiple indicator="checkbox" showSelectAll valueDisplay="chips" />
```

<!-- demo: tree-select-checkboxes -->

## Checkboxes

`indicator="checkbox"` with `multiple` shows a tri-state checkbox on every
node. `checkPropagation` sets how checks spread:

- `'cascade'` (default): checking a parent checks its enabled descendants,
  a parent with some checked descendants reads `'mixed'`, and a parent
  whose descendants are all checked reads checked. A disabled node cannot
  be toggled itself.
- `'none'`: every node checks on its own.

The value is every checked node, parents included. A click or Space
toggles the checkbox of the active node; the tree marks rows with
`aria-checked` (`true`, `false` or `'mixed'`).

## Multiple selection without checkboxes

Plain `multiple` shows a check
mark on selected rows instead of checkboxes; a click, Enter or Space toggles
a node and the popup stays open (`closeOnSelect` closes it after each
choice). Shift+click adds every selectable shown node between the last
chosen node and the clicked one. Ctrl+A (Cmd+A on macOS) selects or clears every selectable node.
The tree carries `aria-multiselectable` and rows `aria-selected`.

## Select all

`showSelectAll` adds a first row that checks or clears every selectable
node. Its text is `localeText.selectAll` while something is
unchecked and `localeText.deselectAll` once everything is; it reads
`'mixed'` when some nodes are checked. To select all from code, set a
controlled `value` holding every node value.

## Value display

`valueDisplay` sets how the trigger shows the value:

| Display | How |
| --- | --- |
| Labels as text | `valueDisplay="text"` (default): labels joined with `Intl.ListFormat` in `locale`, or `valueSeparator` |
| Chips | `valueDisplay="chips"` |
| A count or custom summary (such as "3 item(s) selected") | `valueDisplay="count"` (`localeText.selectedCount`), or `renderValue({ items, labels })` |

`maxVisibleValues` caps the labels or chips shown; the rest become a
"+N" summary (`localeText.moreValues`). Chips are not interactive: remove
a value by unchecking it in the popup, or clear everything with
`clearable`.

Chips wrap onto more lines as the value grows, and the trigger grows with
them. To keep one line, use
`valueDisplay="count"` or a `maxVisibleValues`.

```tsx
<TreeSelect
  data={produce}
  multiple
  indicator="checkbox"
  renderValue={({ labels }) => (labels.length > 2 ? `${labels.length} picked` : labels.join(' + '))}
/>
```

## Change notifications

`onValueChange` fires on every check, select all or clear. There is no
blur-only change notification (as on
[Select multiple](/docs/dropdowns/select-multiple)):
one notification per change keeps `value` and the parent's state in step.
To commit on blur, keep the last value from `onValueChange` and act in
`onBlur`, or read the value when the form submits.
