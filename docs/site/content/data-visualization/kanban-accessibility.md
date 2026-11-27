---
title: Kanban accessibility, RTL and localization
description: The Kanban keyboard model with one tab stop, the grid roles that name each card's column and lane, live announcements, inherited right-to-left direction and localeText for every built-in string.
category: Kanban
order: 240
demos: [kanban-basics]
---

The [Kanban](/docs/data-visualization/kanban) board follows the APG grid
keyboard model: it is one tab stop,
and arrow keys move focus between cards. Try it in the demo: Tab into the
board, then use the keys below.

<!-- demo: kanban-basics -->

## Keyboard

| Key | Action |
| --- | --- |
| Tab | Enters the board on the last focused card (the first card at first); Tab again leaves it |
| ArrowUp / ArrowDown | Previous or next card in the cell; continues into the lane above or below |
| ArrowLeft / ArrowRight | Same position in the previous or next column with cards (mirrored in RTL) |
| Home / End | First or last card of the cell |
| Ctrl+Home / Ctrl+End | First or last card of the board |
| Enter | Selects the card, or opens the editor when `editor` or `renderEditor` is set |
| F2 | Opens the editor (with `editor` or `renderEditor`) |
| Space | Selects the card; with `cardsDraggable` lifts it ([keyboard drag](/docs/data-visualization/kanban-drag-drop)) |
| Ctrl+Space, Ctrl+Enter | Toggles the card in the selection (`selection="multiple"`) |
| Shift+ArrowUp / Shift+ArrowDown | Extends the selection within the cell (`selection="multiple"`) |
| Escape | Clears the selection and hides the tooltip |

On macOS, Cmd works wherever Ctrl is listed. Collapsed columns are skipped.
The column header controls (collapse toggle, reorder grip with
Alt+ArrowLeft / Alt+ArrowRight) and the add buttons are ordinary buttons in
the tab order.

## Roles

The board is a `role="grid"` with `aria-roledescription="board"` and the
accessible name you give it (`aria-label` or `aria-labelledby`; give every
board one). Every board cell, a column or a column within a swimlane, is a
`row` that starts with a visually hidden `rowheader` naming the column, its
stacked group, the lane and the card count. Every card is a `gridcell`
with `aria-roledescription="card"` and, when selection is on,
`aria-selected`; `aria-multiselectable` marks `selection="multiple"`. A
swimlane is a `rowgroup` whose first row is the lane header.

A visual column is therefore an ARIA row: screen readers announce a card
with the name of its column, cards may hold interactive content (a link or
a button in `renderCard`), and each column keeps its own virtual window.

Draggable cards are described by the drag instructions. The tooltip is a
`role="tooltip"` element referenced by the card's `aria-describedby`. The
editor is a modal dialog labelled by its title; invalid fields carry
`aria-invalid` and point at their message.

## Live region

A polite live region announces keyboard drag steps (lift, each position,
drop, cancel), column moves, WIP limit changes and failed writes.
The status region shows the loading and load error texts; the board is
`aria-busy` while it loads.

## Right to left

The board inherits `dir` from its ancestors; there is no `rtl` prop.
Columns run from right to left, CSS uses
logical properties only, and ArrowLeft / ArrowRight (navigation, keyboard
drag and Alt+arrow column moves) follow the visual direction.

```tsx
<div dir="rtl">
  <Kanban /* ... */ />
</div>
```

## Localization

`localeText` overrides any built-in string; missing
keys fall back to `KANBAN_DEFAULT_LOCALE_TEXT`. Templates use `{param}`
placeholders. The object is plain JSON, so a server component can pass it.

```tsx
import { Kanban, type KanbanLocaleText } from '@salmonui/kanban';

const de: Partial<KanbanLocaleText> = {
  count: '{count} Karten',
  addCard: 'Karte zu {column} hinzufügen',
  add: 'Karte hinzufügen',
  empty: 'Keine Karten',
  dragInstructions: 'Leertaste zum Aufnehmen. Pfeiltasten bewegen, Leertaste legt ab, Escape bricht ab.',
};

<Kanban localeText={de} /* ... */ />
```

| Keys | Used for |
| --- | --- |
| `board`, `card` | `aria-roledescription` of the board and the cards |
| `count`, `limitMin`, `limitMax`, `overLimit`, `underLimit` | Header counts, WIP limits and their announcements |
| `collapse`, `expand`, `addCard`, `add`, `moveColumn`, `columnMoved` | Header and add buttons, column reorder |
| `unassigned`, `empty`, `columnPicker` | Unassigned lane, empty cells, the narrow-layout column picker |
| `loading`, `loadError`, `writeError` | Data states |
| `dragInstructions`, `lifted`, `position`, `dropped`, `cancelled` | Keyboard drag |
| `editTitle`, `newTitle`, `save`, `cancel`, `delete`, `required`, `fieldHeader`, `fieldContent`, `fieldColumn`, `fieldSwimlane` | The editor |
