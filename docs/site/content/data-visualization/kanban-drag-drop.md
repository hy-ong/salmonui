---
title: Kanban drag and drop
description: Pointer, touch and keyboard card drag within and between columns and swimlanes, per-column drag rules, column reorder, drops between boards of one drag group and drops on external elements.
category: Kanban
order: 210
demos: [kanban-swimlanes]
---

[Kanban](/docs/data-visualization/kanban) drag and drop is one lazy chunk,
loaded after hydration when `cardsDraggable`, `columnsReorderable`,
`dragGroup` or `dropTargets` is set.
During a drag the ghost, the drop indicator and edge auto-scroll are DOM
transients: React state changes once, on the drop.

<!-- demo: kanban-swimlanes -->

## Card drag

`cardsDraggable` lets cards move
within a column and between columns with the mouse, a pen or touch. The
drag starts after a few pixels of movement, so a click still selects. Near
the top or bottom of a column, or the start or end of the board, the view
scrolls; Escape cancels. Dragging a selected card moves every selected card.

Every drop calls `onCardMove(event)` before the board changes:

| Field | Meaning |
| --- | --- |
| `cardId`, `cardIds`, `cards` | The moved cards (before the move) |
| `from`, `to` | `{ columnKey, swimlaneKey }` of the source and target cell |
| `index` | Insertion index among the other cards of the target cell |
| `source` | `'pointer'`, `'touch'` or `'keyboard'` |
| `external` | `'in'` or `'out'` for a drop between boards, else `null` |

`event.preventDefault()` cancels the move. Otherwise the board writes it:
the moved cards get the target column's value in `columnField` (the first
of its `keys`) and the target lane in `swimlanes.field`, and the board
reports a `move` change through `onCardChange`
([editing](/docs/data-visualization/kanban-editing)). With a plain array the
board updates its own copy; with a data source the move is written through
the source, carrying the placement. To keep the cards in your own state,
cancel the move and apply it yourself:

```tsx
<Kanban
  cardsDraggable
  onCardMove={(e) => {
    e.preventDefault();
    setTasks((list) => list.map((t) => (e.cardIds.includes(t.id) ? { ...t, status: String(e.to.columnKey) } : t)));
  }}
  /* ... */
/>
```

## Keyboard drag

With `cardsDraggable`, every card is described by the drag instructions
(`dragInstructions` in `localeText`). On a focused card:

| Key | Action |
| --- | --- |
| Space | Lift the card (or the selection) |
| ArrowUp / ArrowDown | Move up or down within the cell |
| ArrowLeft / ArrowRight | Move to the previous or next column (mirrored in RTL) |
| PageUp / PageDown | Move to the previous or next swimlane (with `swimlanes.draggable`) |
| Space or Enter | Drop |
| Escape | Cancel; the card returns |
| Tab | Cancel and leave the board |

Each step is announced in the board's live region ("Picked up …", the
column, lane and position, "… dropped", "Move cancelled"). Steps skip
columns that refuse the card and collapsed columns.

## Drag rules per column

Column options restrict moves:

| Option | Default | Effect |
| --- | --- | --- |
| `draggable` | true | Cards cannot be dragged out of the column when false |
| `droppable` | true | Nothing can be dropped into the column when false |
| `allowedTargets` | every droppable column | Columns that cards of this column may move to; reordering within the column stays allowed |

A refused cell gets `data-drop-denied` instead of a drop indicator.
Collapsed columns accept no drops.

## Swimlanes

Cards move between columns of their own lane. `swimlanes.draggable`
 allows drops in
other lanes; the move then also writes the lane field. With
`limitScope="swimlane"` WIP limits are checked per lane.

## Column reorder

`columnsReorderable` adds a grip button to each column
header. Drag the grip, or focus it and press Alt+ArrowLeft / Alt+ArrowRight
(mirrored in RTL), to move the column; keyboard moves are announced
(`columnMoved`). The order is a triad of column keys:

```tsx
const [order, setOrder] = useState(['open', 'doing', 'done']);
<Kanban columnsReorderable columnOrder={order} onColumnOrderChange={(keys) => setOrder(keys)} /* ... */ />
```

Keys missing from `columnOrder` follow in definition order.

## Between boards

Boards with the same `dragGroup` accept each other's cards.
A drop calls `onCardMove` on
the receiving board with `external: 'in'` and on the source board with
`external: 'out'`; either can cancel. The source board then deletes the
cards and the receiving board adds them (a `delete` and an `add` change), so
each board's data or source stays consistent. Drops between boards use the
pointer; the keyboard drag stays within one board.

```tsx
<Kanban dragGroup="tasks" cardsDraggable data={teamA} /* ... */ />
<Kanban dragGroup="tasks" cardsDraggable data={teamB} /* ... */ />
```

## External drop targets

`dropTargets` turns elements outside the board into drop targets,
for
example a `TreeView` container, a trash area or a calendar:

```tsx
const archive = useRef<HTMLDivElement>(null);

<Kanban
  cardsDraggable
  dropTargets={[
    {
      ref: archive,
      accept: (cards) => cards.every((c) => c.status === 'done'),
      onDrop: (e) => archiveCards(e.cards, e.target),
    },
  ]}
  /* ... */
/>
<div ref={archive}>Archive</div>
```

`accept(cards)` refuses a drag (default: accepts); while an accepted drag
is over the element it carries `data-drop-target` for styling. `onDrop`
receives the cards, the element under the pointer (`target`) and the pointer position;
unless it calls `preventDefault()` the board removes the cards (a `delete`
change). A TreeView does not yet accept cards as tree items by itself; use
its container as a drop target and insert the items in your tree data.
