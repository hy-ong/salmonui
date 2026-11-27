---
title: Kanban
description: Kanban renders cards in columns keyed by a card field, with multi-key columns, swimlanes, WIP limits, collapsible and stacked column headers, card fields or templates, selection, sorting, filtering, tooltips and card events.
category: Kanban
order: 200
demos: [kanban-basics]
---

```tsx
import { Kanban } from '@salmonui/kanban';
import '@salmonui/kanban/styles.css';

<Kanban
  aria-label="Sprint board"
  data={tasks}
  getCardId={(t) => t.id}
  columnField="status"
  columns={[
    { key: 'todo', header: 'To do' },
    { keys: ['doing', 'review'], header: 'In progress', max: 3 },
    { key: 'done', header: 'Done' },
  ]}
  card={{ headerField: 'title', contentField: 'summary' }}
/>
```

`@salmonui/kanban` is self-contained: it loads neither the Data Grid
nor another component family. Its stylesheet needs nothing besides
`@salmonui/core/styles.css`, which every app imports once. The board renders
on the server; drag and drop and the editor are lazy chunks loaded after
hydration when enabled ([drag and drop](/docs/data-visualization/kanban-drag-drop),
[editing](/docs/data-visualization/kanban-editing)).

<!-- demo: kanban-basics -->

## Columns and keys

`columnField` names the card field that places a card in a column, and each
column matches it by `key`. `keys` shows several values in one
column; a card moved into such a column gets the first value.
`1` and `'1'` match the same column. `getCardId` returns a stable id
(string or number) per card.

Columns are a `columns` array or `KanbanColumn` children; React reserves
`key`, so the element form names the value `columnKey`:

```tsx
import { Kanban, KanbanColumn } from '@salmonui/kanban';

<Kanban data={issues} getCardId={(i) => i.id} columnField="state" aria-label="Issues">
  <KanbanColumn columnKey="open" header="Open" collapsible />
  <KanbanColumn columnKey="done" header="Done" count={false} />
</Kanban>
```

Children are read as data (direct children and fragments), so they render
on the server like the array form.

Columns are reactive: add, remove or reorder entries of `columns`
to change the board, and set `hidden: true` to hide one. Cards whose value
matches no visible column are not shown.

## Column headers

Each header shows the column name, its card count (`count`, default true)
and optional WIP limits.
`renderHeader(ctx)` replaces the header text with your content (`ctx`:
`key`, `header`, `count`, `collapsed`, `limit`); the collapse toggle, the
count and the add button stay. `showEmptyColumns` (default true) hides
columns without cards when false.

`collapsible` shows a collapse toggle. Collapsed
columns are a triad: `collapsedColumns` / `defaultCollapsedColumns` /
`onCollapsedColumnsChange(keys, { source })`. A
collapsed column shrinks to a narrow strip with its name and count.

## WIP limits

`min` and `max` set a work-in-progress range per column. A column out of range gets
`data-limit="over"` or `data-limit="under"` on its header (and on the
offending cells) and is styled in the danger or warning color. When a moved
or added card leaves its target column out of range, the board announces it
in its live region (`overLimit`, `underLimit` in `localeText`). Limits never
block a move; cancel `onCardMove` if your process requires that.

`limitScope="swimlane"` applies the limits to each column within each swimlane instead of the whole column.

## Stacked headers

`columnGroups` puts a header over consecutive columns:

```tsx
<Kanban
  columnGroups={[
    { header: 'Planned', columns: ['backlog', 'todo'] },
    { header: 'Active', columns: ['doing', 'done'] },
  ]}
  /* ... */
/>
```

Group names are part of each cell's accessible header.

## Cards

`card` maps fields to the default card layout: `headerField`, `contentField`, `tagsField` (a comma-separated
string or a string array) and `accentField` (a CSS color used for the card's
accent edge, for example a priority color). `renderCard(ctx)` replaces the
card body; it is pure and called for rendered cards only (`ctx`: `card`,
`id`, `columnKey`, `swimlaneKey`, `index`, `selected`).

`cardHeight` is `'auto'` (default; heights are measured) or a fixed height
in pixels, which skips measurement.

`getCardProps(ctx)` adds a `className`, `style`, `title` or `data-*`
attributes per card:

```tsx
<Kanban getCardProps={({ card }) => ({ 'data-priority': card.priority })} /* ... */ />
```

## Swimlanes

`swimlanes` splits every column into horizontal lanes by a second card
field:

```tsx
<Kanban
  swimlanes={{
    field: 'owner',
    labelField: 'ownerName',
    lanes: [{ key: 'ana', label: 'Ana' }, { key: 'ben', label: 'Ben' }],
    showEmpty: true,
    sticky: true,
  }}
  /* ... */
/>
```

| Option | Default | Effect |
| --- | --- | --- |
| `field` | required | The card field that holds the lane key |
| `labelField` | the key | The card field that holds the lane label |
| `lanes` | lanes in order of first appearance | Declares lane order and labels |
| `renderHeader(ctx)` | lane label and count | Custom lane header content |
| `sort` | declared lanes, then first appearance | `'asc'`, `'desc'` or a comparator |
| `showEmpty` | false | Shows declared lanes without cards |
| `count` | true | Shows the card count in the lane header |
| `unassigned` | true | Shows cards without a lane key; false hides them |
| `sticky` | false | Lane headers stick while the board scrolls |
| `draggable` | false | Cards can move across lanes |

The unassigned lane is always last. Virtualization does not apply with
swimlanes: lanes grow with their content and the board scrolls as a whole.

## Selection

`selection` is `'single'` (default), `'multiple'` or `'none'`.
A click selects a card; with
`'multiple'` Ctrl/Cmd+click toggles and Shift+click selects a range, from
the keyboard Ctrl+Space toggles and Shift+ArrowUp/Down extends. Escape
clears the selection. Selected ids are a triad: `selectedCards` /
`defaultSelectedCards` / `onSelectedCardsChange(ids, { source })`. Dragging a selected card moves the whole
selection.

## Sorting and filtering

`sort` orders cards within each cell:

```tsx
sort={{ by: 'data' }}                                   // array order (default)
sort={{ by: 'field', field: 'priority', direction: 'asc' }} // by a card field
sort={{ by: 'custom', comparator: (a, b) => a.due - b.due }} // your comparator
```

`filter(card)` hides cards on the client; it is pure and the board
re-buckets once per change. For a data source, filter on the server with
`query` ([editing and data](/docs/data-visualization/kanban-editing)).

## Tooltips

`tooltip` shows a tooltip for the hovered or focused card.
`true` shows the header and
content fields; `{ render, delay }` renders your content after `delay` ms
(default 500). The tooltip is a `role="tooltip"` element referenced by the
card's `aria-describedby`, and Escape hides it.

## Events

| Event | Notes |
| --- | --- |
| `onCardClick(e)` | `e.card`, `e.id`, `e.source`; `preventDefault()` skips focus and selection |
| `onCardDoubleClick(e)` | Default action opens the editor (with `editor`); `preventDefault()` keeps it closed |
| `getCardProps(ctx)` | Pure per-card props |
| `onCardMove(e)` | See [drag and drop](/docs/data-visualization/kanban-drag-drop) |
| `onCardChange(e)` | See [editing](/docs/data-visualization/kanban-editing) |
| `onDataError(error, kind)` | Source read and write failures |
| `onSelectedCardsChange`, `onCollapsedColumnsChange`, `onColumnOrderChange`, `onEditingChange` | Triad callbacks with `{ source }` |

Cancellable events carry `preventDefault()` and `defaultPrevented`;
`source` is `'pointer'`, `'keyboard'`, `'touch'` or `'api'`.

## Controlled and uncontrolled state

Every piece of interactive state is a triad: a controlled prop, a
`default*` prop for uncontrolled use, and an `on*Change(value, { source })`
callback.

| State | Controlled | Uncontrolled | Callback |
| --- | --- | --- | --- |
| Selected cards | `selectedCards` | `defaultSelectedCards` | `onSelectedCardsChange` |
| Collapsed columns | `collapsedColumns` | `defaultCollapsedColumns` | `onCollapsedColumnsChange` |
| Column order | `columnOrder` | `defaultColumnOrder` | `onColumnOrderChange` |
| Open editor | `editing` | `defaultEditing` | `onEditingChange` |

The cards themselves are not a triad: a plain `data` array is copied and
the board applies its own writes to the copy, or you keep the cards in
your state and apply each `onCardChange` yourself
([editing and data](/docs/data-visualization/kanban-editing)).

```tsx
import { useState } from 'react';
import { Kanban, type KanbanKey } from '@salmonui/kanban';

const [selected, setSelected] = useState<readonly KanbanKey[]>([]);

<Kanban selection="multiple" selectedCards={selected} onSelectedCardsChange={(ids) => setSelected(ids)} /* ... */ />
```

## Accessibility

The board is one tab stop with an APG grid keyboard model (arrows, Home /
End, Enter or F2 to edit, Space to select or lift), every card is named by
its column and lane, and moves, limits and failed writes are announced in a
live region. Give every board an `aria-label` or `aria-labelledby`. See
[accessibility, RTL and localization](/docs/data-visualization/kanban-accessibility)
for the key table, the roles and `localeText`.

## Server rendering

`Kanban` is a client component (`'use client'`) that renders its full
markup on the server: columns, swimlanes, cards and, with
`virtualization`, an estimated card window that the first client render
repeats, so hydration is clean. There is no device detection; the narrow
layout is a container query
([mobile layout](/docs/data-visualization/kanban-performance)). A `@salmonui/data`
source is read after mount, so the server HTML shows the loading state;
pass an array to put the cards in the server HTML. `localeText` is plain
JSON and can come from a server component.

## Design notes

- **Data.** `data` takes an array or a `@salmonui/data` source,
  and `query` takes `{ filters, sorting }`; there is no separate query
  builder or adaptor layer, so one data contract serves every component
  ([editing and data](/docs/data-visualization/kanban-editing)).
- **Rendering.** Custom content is React: `renderCard`,
  `renderHeader`, `tooltip.render` and `renderEditor` return React nodes,
  never HTML strings. To hide the card header, add a grab handle or a
  styled footer, render that layout in `renderCard`, and set per-card
  classes with `getCardProps`.
- **No imperative data methods.** Cards and columns change when
  `data` and `columns` change; the selection is the `selectedCards` triad.
  The `ref` API only covers focus, scrolling and the editor (below).
- **Persistence.** The board stores nothing itself: to restore a
  board, save the triad values (`selectedCards`, `collapsedColumns`,
  `columnOrder`) from their callbacks and pass them back.
- **WebMCP.** The board registers no WebMCP tools. An application
  can register its own tools against the `ref` API.

## API

`ref` gives a `KanbanApi`: `element`, `focusCard(id)`, `scrollToCard(id)`,
`openEditor(id | 'new', at?)` and `closeEditor()`. Everything else is a
prop. Types are listed in the [reference](/docs/reference/kanban).
