---
title: Tree View editing and drag and drop
description: Inline rename with F2, pointer and keyboard moves before, after or into an item, moves between trees of one drag group, and the moveTreeItems helper for application-owned data.
category: Tree View
order: 50
demos: [tree-view-drag-drop]
---

The tree reports edits and moves; it never changes `data`. The application
applies them, which keeps one source of truth and works with any store.
`TreeView` and `moveTreeItems` come from `@salmonui/navigation/tree-view`, styled
by `@salmonui/navigation/tree-view/styles.css` (see
[Tree View](/docs/navigation/tree-view)); the rename field and the drag code
are lazy chunks of the same subpath.

<!-- demo: tree-view-drag-drop -->

## Rename

`renamable`: F2 on the focused item or
`api.startRename(id)` opens an inline text field (a lazy chunk, loaded on
first use). Enter or leaving the field commits, Escape cancels; focus returns
to the item. `onBeforeRename({ id, item, label, previousLabel })` is
cancellable and `onRename` reports the new label:

```tsx
<TreeView renamable onRename={(e) => setData((d) => renameItem(d, e.id, e.label))} /* ... */ />
```

An empty or unchanged label is not reported. The draft lives in the field,
never in React state.

## Drag and drop

`draggable` loads the pointer drag
chunk. Dragging an item (or the selection, when the item is selected) shows
an indicator: the top quarter of a target row drops `before` it, the bottom
quarter `after` it, the middle `into` it. A drop onto the dragged item or
its own subtree is refused, the list scrolls near its edges, and Escape
cancels. `onBeforeMove({ ids, items, targetId, position, sourceTreeId })`
is cancellable; `onMove` reports the move.

From the keyboard (with `draggable`): Alt+ArrowUp / Alt+ArrowDown move the
focused item before its previous or after its next sibling, Alt+ArrowRight
moves it into the previous sibling, Alt+ArrowLeft out of its parent. Each
move is announced in a live region (`moved` text).

`moveTreeItems(data, event, { getItemId, getChildren, withChildren })`
applies a move to nested data and keeps the identity of every unchanged
subtree:

```tsx
import { moveTreeItems } from '@salmonui/navigation/tree-view';

const options = { getItemId: (f) => f.id, getChildren: (f) => f.children, withChildren: (f, children) => ({ ...f, children }) };
<TreeView draggable onMove={(e) => setData((d) => moveTreeItems(d, e, options))} /* ... */ />
```

For flat data, update the moved items' parent id instead.

## Between trees

Trees with the same `dragGroup` exchange items: the target tree
reports `onMove` with `sourceTreeId` (the source tree's `id`) and `items`
taken from the source. Remove the items from the source data and insert
them in the target data (`moveTreeItems` accepts `items` for the insert).

## Design notes

- **Drop targets**: dropping onto arbitrary elements needs a
  cross-component drag protocol, and constraining the drag to an area is a
  niche case. Drops land on tree items only, inside the tree or another tree
  of the same `dragGroup`. Use the native drag and drop API on your own
  elements for other targets.
- **No item add, remove, move, update or refresh methods**: the
  data belongs to the application, and editing it is the fast path, because
  items keep their state by stable id and the tree re-flattens incrementally
  once per `data` identity. Make the matching immutable update of `data`
  (`moveTreeItems` for moves); no refresh is needed.
- **No data-changed events**: the tree never writes to `data`, so
  such events would have nothing to report. React to changes in `onMove`,
  `onRename`, `onCheckedChange` and `onExpandedChange`, and run code after
  new data arrives in an effect on `data`.

## Server rendering

Renaming and dragging only start from user input after hydration, so they
add nothing to the server markup; the tree renders its first window on the
server as described on the [Tree View](/docs/navigation/tree-view#server-rendering)
page.

## API reference

`renamable`, `onBeforeRename`, `onRename`, `draggable`, `dragGroup`,
`onBeforeMove`, `onMove`, `TreeViewApi.startRename` and `moveTreeItems` are
in the [`@salmonui/navigation/tree-view` reference](/docs/reference/navigation/tree-view).
