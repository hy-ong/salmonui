---
title: TagGroup
description: Input chips as an APG grid - removable tags with Delete / Backspace, optional single or multiple selection, a form value, and keyboard or drag reordering within and across groups.
category: Components
order: 45
demos: [tag-group]
---

`TagGroup` holds input chips: tags the user
removes, adds through your own field, selects or drags into order. It lives
in `@salmonui/buttons/tag-group` with its own stylesheet and imports no other
family.

```tsx
import { useState } from 'react';
import { Tag, TagGroup, moveTags } from '@salmonui/buttons/tag-group';
import '@salmonui/buttons/tag-group/styles.css';

export function Labels() {
  const [tags, setTags] = useState(['Design', 'Docs', 'Bug']);
  return (
    <TagGroup
      aria-label="Labels"
      onRemove={(values) => setTags((t) => t.filter((v) => !values.includes(v)))}
      reorderable
      onReorder={(event) => setTags((t) => moveTags(t, event.values, event.toIndex))}
      name="labels"
    >
      {tags.map((tag) => (
        <Tag key={tag} value={tag}>
          {tag}
        </Tag>
      ))}
    </TagGroup>
  );
}
```

<!-- demo: tag-group -->

## Items, adding and removing

Tags are `Tag` children with a stable `value`; map your array to them. Adding
a tag is appending to your array and removing one is filtering it; there
are no imperative add or remove methods, only state updates.

`onRemove(values, event)` makes every tag removable: each tag gets
a remove button named `"Remove <label>"` (`localeText.remove` changes it,
`textValue` gives the label when the children are not plain text), and
Delete / Backspace remove the focused tag. Removable rows carry
`aria-keyshortcuts="Delete Backspace"`. A `Tag` opts out with
`removable={false}`; disabled tags are never removed.

`onRemove` is a request: `event` is `{ source, reason }` with `reason`
`'button'`, `'delete'` or `'backspace'`. Not removing the values vetoes the
removal, and your state update is the point where it happened. After a keyboard removal focus moves to the tag
that took its place, else the previous one, else the group.

## Selection

`selectionMode` is `'none'` (default), `'single'` or `'multiple'`; the value
is always `readonly string[]` through `value` / `defaultValue` /
`onValueChange(value, event)`. Selectable rows carry `aria-selected`, and the
group `aria-multiselectable` in multiple mode. Space / Enter or a click
toggle a tag; the remove button never changes selection. In multiple mode,
Delete on a selected tag removes every selected tag.

For choice and filter chips without removal, use
[ToggleButtonGroup](/docs/buttons/toggle-button-group) with `variant="chip"`.

## Reordering and drag and drop

`reorderable` turns on Alt + arrow keys and pointer drag within the group,
both reported by `onReorder({ values, toIndex, delta, source })`. `toIndex`
is the insertion index in the current order, which `moveTags(list, values,
toIndex)` applies.

Groups with the same `dragGroup` accept each other's tags, so tags can move
across lists: the receiving group fires `onTagDrop({ values, fromGroup,
toIndex })`, where `fromGroup` is the source group's `id`. Three drag events
report the gesture: `onTagDragStart` (call `preventDefault()` to cancel),
`onTagDrag` (at most once per frame, with the insertion index and the group
under the pointer) and `onTagDragEnd({ values, dropped })`. Escape cancels a
drag. The drag code is a lazy chunk loaded on the first press of a
draggable tag.

## Forms

With `name`, the group renders hidden inputs: the selected values when the
group is selectable, otherwise every tag's value (the value of an input
chips field, such as a recipients list). A form reset restores
`defaultValue`.

## Keyboard and accessibility

The group is a WAI-ARIA grid of one-cell rows with one tab stop:
ArrowLeft / ArrowRight and ArrowUp / ArrowDown move between tags (left and
right mirror in RTL), Home / End jump to the ends and disabled tags are
skipped. The remove buttons are not tab stops; keyboard users press Delete.
Name the group with `aria-label` or `aria-labelledby`; `empty` renders a
message row when there are no tags. `disabled` on the group disables every
tag and submits nothing; on a `Tag` it disables only that tag, which is never
removed.

The tags, selection state and hidden inputs render on the server; the drag
code loads only in the browser on the first press, so the group hydrates
without warnings.

## Styling

`.salmon-tag-group` with `data-size` and `data-selection-mode`; each tag is
`.salmon-tag` with `data-tone`, `data-selected` and `aria-disabled`; parts
are `.salmon-tag-cell`, `.salmon-tag-label`, `.salmon-tag-icon` and
`.salmon-tag-remove`. `tone` and `size` take the Button sets; `iconStart` /
`iconEnd` hold avatars or icons.

## API reference

[`@salmonui/buttons/tag-group`](/docs/reference/buttons/tag-group): `TagGroup`,
`Tag`, `moveTags` and the event types (`TagRemoveEvent`, `TagReorderEvent`,
`TagSelectionEvent`, `TagDropEvent`, `TagDragStartEvent`, `TagDragEvent`,
`TagDragEndEvent`).
