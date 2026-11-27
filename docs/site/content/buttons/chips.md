---
title: Chips
description: Chips split by interaction - action chips are small Buttons, choice and filter chips a chip-variant ToggleButtonGroup, input chips a TagGroup.
category: Recipes
order: 70
demos: [chips, chips-mapping]
---

Chips are built from the building block that matches what the chips do.

| Chips | Build them with |
| --- | --- |
| Action chips (click handlers) | `Button size="sm"` (optionally `variant="chip"` or `"outline"`) |
| Choice chips (one selected) | `ToggleButtonGroup variant="chip"` |
| Filter chips (several selected) | `ToggleButtonGroup variant="chip" selectionMode="multiple"`; a pressed chip shows a check |
| Chips without selection | Chip-styled `Button`s in a `ButtonGroup attached={false}` |
| A single chip | A chip-styled `Button` or `ToggleButton` |
| Input chips (delete, add, drag) | [TagGroup](/docs/buttons/tag-group) |

<!-- demo: chips -->

## Data, content and state

- Each chip is a `ToggleButton` child with its text and a `value`; map your
  data in JSX.
- The selection is `value` / `defaultValue`, by value only, since indexes
  are not stable.
- Avatars, leading and trailing icons are `iconStart` / `iconEnd` nodes.
- `disabled` goes on the group or the item; `className` and other
  attributes go on each item.
- Clicks are the item's `onClick`; to cancel a selection, keep `value`
  controlled and ignore the proposal.
- `tone` and `variant` on the group or the item set the style;
  states are `data-pressed` / `aria-checked`, `:focus-visible` and
  `disabled`.
- Keys are the toggle group keys: arrows move (and select in single mode),
  Space / Enter select or toggle.

```tsx
import { ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import '@salmonui/buttons/button/styles.css';

<ToggleButtonGroup aria-label="Assignees" variant="chip" selectionMode="multiple" value={ids} onValueChange={setIds}>
  {people.map((person) => (
    <ToggleButton key={person.id} value={person.id} disabled={person.away} iconStart={<Avatar person={person} />}>
      {person.name}
    </ToggleButton>
  ))}
</ToggleButtonGroup>;
```

<!-- demo: chips-mapping -->

## Design notes

- There are no imperative select or find methods: read and set the
  selection through the controlled `value` and your own data.
- The group is one tab stop with roving focus, so a long chip list does not
  flood the tab order.
- Chips use toggle semantics, not `listbox` / `option`: `radiogroup` /
  `radio` with `aria-checked` (single) or `group` with `aria-pressed`
  (multiple); listbox semantics are left to `Listbox`, and input chips are a
  `TagGroup` grid.
- Input chips are [TagGroup](/docs/buttons/tag-group): `onRemove` adds a
  remove button and Delete / Backspace, cancelling a removal is a controlled
  update you skip, adding and removing are changes to your array,
  `reorderable` and `dragGroup` with `onTagDragStart` / `onTagDrag` /
  `onTagDragEnd` handle drag and drop, and removable tags carry
  `aria-keyshortcuts`.
