---
title: Kanban performance and mobile layout
description: Per-column card virtualization with measured variable heights, what stays out of React state, bundle and timing budgets, and the container-query layout that shows one column at a time on narrow boards.
category: Kanban
order: 230
demos: [kanban-virtualization]
---

<!-- demo: kanban-virtualization -->

## Virtualization

On a [Kanban](/docs/data-visualization/kanban) board, `virtualization`
with a `height` renders only the cards in view, per column:

```tsx
<Kanban virtualization height={600} data={items} getCardId={(i) => i.id} columnField="stage" columns={columns} />
```

- Each column scrolls on its own and keeps its own card window.
- Card heights are measured as cards appear (`ResizeObserver`) and kept per
  card id, so a reorder or a move keeps the measured heights. Cards of
  different heights need no configuration; `cardHeight={number}` skips
  measurement when every card has the same height.
- The server and the first client render use an estimated window, so the
  HTML is the same on both sides and hydration is clean.
- Drag auto-scroll works in virtual columns, and `api.focusCard(id)` and
  `api.scrollToCard(id)` reveal cards that are not rendered yet.

Virtualization does not apply with `swimlanes`: lanes grow with their
content and the board scrolls as a whole. Without `virtualization`, every
card is rendered; that is fine for boards of a few hundred cards.

## What stays out of React state

Scroll positions, measurements and drag transients (the ghost, drop
indicators, edge auto-scroll) never touch React state; the board commits
once per drop, selection change or write. The board model (columns, lanes,
cells) is recomputed once per change of `data`, `columns`, `sort`,
`filter` or `swimlanes`, so pass stable values (module constants or
`useMemo`) for props that do not change. `renderCard` runs only for
rendered cards and must be pure.

## Bundle and timing budgets

| Budget | Limit |
| --- | --- |
| `@salmonui/kanban` first load (gzip) | ≤ 20 KB |
| Lazy chunks (drag and drop, editor) | editor ≤ 4 KB; drag and drop within the `internal/dnd` budget |
| `@salmonui/kanban/styles.css` (gzip) | ≤ 3 KB |
| Mount, 5 columns × 2,000 cards, virtualized | ≤ 100 ms |
| Card drag frame | ≤ 16.7 ms p95 |

The drag chunk loads after hydration only when a drag feature is on
(`cardsDraggable`, `columnsReorderable`, `dragGroup`, `dropTargets`); the
editor chunk loads the first time the editor opens. The budgets are release
gates (`npm run release:verify`).

## Mobile layout

When the board is narrower than 600 px (a container query on the board,
not the viewport), it shows one column at a time:
columns snap as you swipe horizontally, and a column picker
(`columnPicker` in `localeText`) jumps to a column. Stacked headers are
hidden in this layout. There is no device detection, so the server renders
the same markup for every client and the layout follows the space the
board actually gets, for example in a narrow side panel on a desktop.

Touch input takes the same pointer drag path as the mouse; its events
report `source: 'touch'`.
