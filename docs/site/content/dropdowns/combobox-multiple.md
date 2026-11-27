---
title: Combobox multiple
description: Typing multiple selection with Combobox multiple - chips in the field, custom values, removable chips, keyboard chip navigation and values added on blur.
category: Recipes
order: 50
demos: [combobox-tags]
---

`Combobox multiple` is multiple selection with typing: selected values show as
chips in the field, typing filters the
list, and Enter adds the active option. Chips sit in a list labelled
`localeText.selectedValues`.

```tsx
import { Combobox } from '@salmonui/dropdowns/combobox';
import '@salmonui/dropdowns/combobox/styles.css';

<Combobox
  aria-label="Tags"
  multiple
  creatable
  commitOnBlur
  data={tags}
  defaultValue={['news']}
  getChipProps={(t) => (t.value === 'urgent' ? { className: 'urgent' } : undefined)}
/>
```

`value` / `defaultValue` hold an array; `onValueChange(values, event)`
reports `event.reason` `'add'`, `'create'`, `'deselect'` (picking a
selected option again), `'remove'` (a chip), `'clear'` or `'reset'`, and a controlled `value` vetoes any of them. The popup stays
open after each pick (`closeOnSelect` defaults to `false` here), and
`maxSelected` caps the count. Props, keys and server rendering are
otherwise those of [Combobox](/docs/dropdowns/combobox).

<!-- demo: combobox-tags -->

| Task | How |
| --- | --- |
| Accept typed values not in the list | `creatable` |
| Add the typed text when focus leaves | `commitOnBlur` |
| React to or veto an added chip, style it | `onValueChange` with `reason: 'add'` or `'create'`; a controlled `value` vetoes; `getChipProps(item)` styles the chip |
| Build the item for a custom value | `onCreateItem(text)` |
| React to a removed chip | `onValueChange` with `reason: 'remove'` |
| Remove chips | Each chip has a remove button named `localeText.removeValue(label)`; `clearable` clears all |
| Show or hide the dropdown button | `showTrigger` |
| Custom chip content | `renderChip({ item, label, remove, disabled })` |

Chip keys: Backspace on an empty input removes the last chip; Left
Arrow at the start of the input moves focus to the last chip's remove
button; Left / Right move between chips (mirrored under `dir="rtl"`); Delete
or Backspace removes the focused chip; Right from the last chip, or Escape,
returns to the input. `maxVisibleValues` shows the first chips and a "+N"
chip.

See the [API reference](/docs/reference/dropdowns/combobox) for every prop.
