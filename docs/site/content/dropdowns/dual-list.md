---
title: Dual list and reordering
description: Reorder Listbox items from the keyboard or by drag and drop, drag items between lists, and build a dual list with moveItems and reorderItems.
category: Listbox
order: 30
demos: [listbox-dual-list]
---

`Listbox` never changes its own `data`: reordering and moving items fire
events, and the application applies them to its arrays with two exported
pure functions. A move toolbar is a set of plain buttons that call the
same functions (see
[Listbox](/docs/dropdowns/listbox#changing-data-and-selection-from-code)).
Reordering and dragging work on local arrays only: a remote source, a
`readOnly` or `disabled` list and `layout="grid"` do not reorder.

<!-- demo: listbox-dual-list -->

## Reordering within a list

`reorderable` turns on reordering by keyboard and by drag and drop within
one list. Every reorder fires `onReorder` with the moved
`values` and `items`, plus:

- `delta`: `-1` or `1` for a keyboard step, `null` for a drag;
- `toIndex`: the insertion index in the current `data` (before the moved
  items are removed), as `moveItems` takes it;
- `source`: `'keyboard'`, `'pointer'` or `'touch'`.

```tsx
const [items, setItems] = useState(fruits);

<Listbox
  data={items}
  multiple
  reorderable
  onReorder={(e) =>
    setItems((list) => (e.delta !== null ? reorderItems(list, e.values, e.delta) : moveItems(list, list, e.values, e.toIndex)[0]))
  }
  aria-label="Fruit order"
/>;
```

### Keyboard

With `reorderable`, Alt+Up and Alt+Down move the focused option one step,
or all selected options when the focused one is selected, the
keyboard alternative to drag and drop. After the application applies the
change, a polite live region announces the new position
(`localeText.moved`: "Fig moved to position 3 of 8"), as Data Grid column
reordering does. Focus stays on the moved option.

### Pointer and touch

With `reorderable`, options can be dragged within the list: dragging a
selected option moves the whole selection. The list auto-scrolls near its
edges and shows a drop indicator; Escape cancels the drag. The drag code
is a separate chunk loaded on the first drag, so lists that are never
dragged do not download it.

## Dragging between lists

Lists with the same `dragGroup` accept each other's items. The receiving list fires
`onItemDrop` with the dragged `values` and `items` (from the source list's
`data`), `fromList` (the source list's `id` prop or a generated id),
`dragGroup` and `toIndex` in its own `data`. The application moves the
items:

```tsx
<Listbox
  id="chosen"
  data={chosen}
  multiple
  dragGroup="fruit"
  onItemDrop={(e) => {
    const [nextAvailable, nextChosen] = moveItems(available, chosen, e.values, e.toIndex);
    setAvailable(nextAvailable);
    setChosen(nextChosen);
  }}
  aria-label="Chosen"
/>
```

### Drag events

Four events follow a drag from start to drop:

| Event | Fires | Argument |
| --- | --- | --- |
| `onItemDragStart` | When a drag starts, on the source list | `values`, `items`, `source`; `preventDefault()` cancels the drag |
| `onItemDrag` | While dragging, at most once per animation frame | `values`, `clientX`, `clientY`, `overGroup` (the `dragGroup` under the pointer, or `null`), `toIndex` |
| `onReorder` | On a drop in the same list | See above |
| `onItemDrop` | On a drop in another list of the group, on the receiving list | `values`, `items`, `fromList`, `dragGroup`, `toIndex`, `source` |

To veto a drop, ignore the event: nothing moves until the application
updates `data`.

## moveItems and reorderItems

Both functions are pure: they never mutate their inputs and return new
arrays.

```ts
import { moveItems, reorderItems } from '@salmonui/dropdowns/listbox';

// Move the items whose values are in `values` from `source` to `target`,
// inserted at `index` of `target` (default: the end), in source order.
const [nextSource, nextTarget] = moveItems(source, target, values, index?, getItemValue?);

// Move the items whose values are in `values` by `delta` positions
// (negative: up), keeping their relative order; a block stops at the ends.
const next = reorderItems(list, values, delta, getItemValue?);
```

With `source === target`, `moveItems` moves the items within one list:
`index` is the insertion index in the current list (as a drop position),
and both results are the same new array. Pass `getItemValue` when the
items do not have a `value` field, the same accessor the `Listbox` uses.

| Task | How |
| --- | --- |
| Move up / down one place | `reorderItems(list, selected, -1)` / `reorderItems(list, selected, 1)` |
| Move to the top / bottom | `moveItems(list, list, selected, 0)[0]` / `moveItems(list, list, selected, list.length)[0]` |
| Move the selection to the other list / back | `moveItems(left, right, leftSelected)` / `moveItems(right, left, rightSelected)` |
| Move everything to the other list / back | `moveItems(left, right, left.map(getValue))` / `moveItems(right, left, right.map(getValue))` |

## Recipe: dual list

A dual list (two lists joined by a `dragGroup` plus a toolbar) is two
`Listbox`es and a column of buttons. The demo above is built this way:

```tsx
'use client';

import { useState } from 'react';
import { Listbox, moveItems, reorderItems, type ListboxKey, type ListboxReorderEvent } from '@salmonui/dropdowns/listbox';
import '@salmonui/dropdowns/listbox/styles.css';

type Fruit = { value: string; label: string };

const applyReorder = (list: Fruit[], e: ListboxReorderEvent<Fruit>): Fruit[] =>
  e.delta !== null ? reorderItems(list, e.values, e.delta) : moveItems(list, list, e.values, e.toIndex)[0];

export function DualList({ initialLeft, initialRight }: { initialLeft: Fruit[]; initialRight: Fruit[] }) {
  const [left, setLeft] = useState(initialLeft);
  const [right, setRight] = useState(initialRight);
  const [leftSel, setLeftSel] = useState<readonly ListboxKey[]>([]);
  const [rightSel, setRightSel] = useState<readonly ListboxKey[]>([]);

  const toRight = (values: Iterable<ListboxKey>) => {
    const [l, r] = moveItems(left, right, values);
    setLeft(l);
    setRight(r);
    setLeftSel([]);
  };
  const toLeft = (values: Iterable<ListboxKey>) => {
    const [r, l] = moveItems(right, left, values);
    setRight(r);
    setLeft(l);
    setRightSel([]);
  };

  return (
    <div className="dual-list">
      <Listbox
        id="available"
        aria-label="Available"
        data={left}
        multiple
        reorderable
        dragGroup="fruit"
        value={leftSel}
        onValueChange={setLeftSel}
        onReorder={(e) => setLeft((list) => applyReorder(list, e))}
        onItemDrop={(e) => {
          const [r, l] = moveItems(right, left, e.values, e.toIndex);
          setRight(r);
          setLeft(l);
          setRightSel([]);
        }}
      />
      <div className="dual-list__toolbar">
        <button type="button" onClick={() => toRight(leftSel)} disabled={leftSel.length === 0}>Move selected →</button>
        <button type="button" onClick={() => toRight(left.map((f) => f.value))}>Move all →</button>
        <button type="button" onClick={() => toLeft(rightSel)} disabled={rightSel.length === 0}>← Move selected</button>
        <button type="button" onClick={() => toLeft(right.map((f) => f.value))}>← Move all</button>
        <button type="button" onClick={() => setRight((list) => reorderItems(list, rightSel, -1))}>Move up</button>
        <button type="button" onClick={() => setRight((list) => reorderItems(list, rightSel, 1))}>Move down</button>
      </div>
      <Listbox
        id="chosen"
        aria-label="Chosen"
        data={right}
        multiple
        reorderable
        dragGroup="fruit"
        value={rightSel}
        onValueChange={setRightSel}
        onReorder={(e) => setRight((list) => applyReorder(list, e))}
        onItemDrop={(e) => {
          const [l, r] = moveItems(left, right, e.values, e.toIndex);
          setLeft(l);
          setRight(r);
          setLeftSel([]);
        }}
      />
    </div>
  );
}
```

Toolbar position is plain layout: place the button column wherever the
design needs it.

The event and function types are in the
[API reference](/docs/reference/dropdowns/listbox).
