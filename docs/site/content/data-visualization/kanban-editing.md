---
title: Kanban editing and data
description: The card editor with field lists, validation and a custom form, add buttons, the editing triad, onCardChange for every write, plain arrays versus @salmonui/data sources with optimistic writes, loading and error states.
category: Kanban
order: 220
demos: [kanban-editing]
---

A [Kanban](/docs/data-visualization/kanban) board writes four kinds of
change: `add`, `update`, `delete` and `move`.
Each one is reported to `onCardChange` first and can be cancelled; where it
lands depends on what `data` is.

<!-- demo: kanban-editing -->

## Card editor

`editor` turns on the built-in editor. It is a lazy chunk rendered in a modal native `<dialog>` (Layout's
`Dialog` replaces the shell when it lands, without a prop change). Double
click a card, or press Enter or F2 on a focused card, to edit it.

`editor={true}` edits the card fields: the header field (required), the
content field (when `card.contentField` is set), the column and, with
swimlanes, the lane. A field list replaces them:

```tsx
<Kanban
  editor={{
    fields: [
      { field: 'title', label: 'Title', kind: 'text', required: true },
      { field: 'notes', label: 'Notes', kind: 'textarea' },
      { field: 'status', label: 'Status', kind: 'select', options: [{ value: 'todo', label: 'To do' }, { value: 'done', label: 'Done' }] },
      { field: 'points', label: 'Points', kind: 'number', validate: (v) => (typeof v === 'number' && v >= 0 ? null : 'Must be 0 or more') },
    ],
  }}
  /* ... */
/>
```

| Field option | Meaning |
| --- | --- |
| `field`, `label` | The card field to edit and its label |
| `kind` | `'text'`, `'select'`, `'number'` or `'textarea'` |
| `options` | `{ value, label }` choices of a `select` field |
| `required`, `validate(value, draft)` | Validation; `validate` returns a message or `null` |

`select` fields write the option's value with its type (numbers stay
numbers); `number` fields write a number, or `null` when empty. Saving
validates every field, shows the messages next to the fields
(`aria-invalid`, `aria-describedby`) and focuses the first invalid one.
Escape or **Cancel** closes without a change, **Delete** removes the card,
and focus returns to the card.

`renderEditor(ctx)` renders your own form inside the dialog; `ctx` has
`card` (the card or the new draft), `isNew`, `save(next)`, `cancel()` and
`delete()`.

The editor's open state is a triad: `editing` / `defaultEditing` /
`onEditingChange`, with a card id, `'new'` or `null`. From code,
`ref.current.openEditor(id)` edits a card and `openEditor('new', {
columnKey, swimlaneKey })` opens a draft in a cell (default: the first
column).

## Adding cards

`addButton: true` on a column shows an **Add card** button at the end of
each of its cells. A click calls
`onCardAdd({ columnKey, swimlaneKey, source })`; unless it calls
`preventDefault()`, the board opens the editor with a new draft for that
cell. `newCard(at)` builds the draft (default: `{ id: 'new-<n>',
[columnField], [swimlanes.field] }`). It is called once, when the editor
opens for a new card (never during render); derive the id from state and
advance it when the `add` change is reported.

```tsx
const [nextId, setNextId] = useState(100);

<Kanban
  newCard={(at) => ({ id: nextId, title: '', status: at.columnKey })}
  onCardChange={(e) => e.kind === 'add' && setNextId((n) => n + 1)}
  /* ... */
/>
```

## onCardChange

`onCardChange(event)` runs before every write: editor saves (`update`, `add`), deletes from the editor or an
external drop target (`delete`), moves (`move`) and drops between boards
(`delete` on the source, `add` on the target). `event.card` is the first
new value (the deleted card for `delete`), `event.cards` all of them,
`event.previous` the old values. `preventDefault()` cancels the write.

There are no imperative add, update or delete methods: to change cards
from code, pass a new `data` array (or write through the data source).

## Plain arrays

With an array, the board copies `data` into its own state and applies
writes to that copy. A new `data` identity replaces the copy, so to own the
data, either update your array from the events (and pass the new array), or
cancel each change and apply it yourself:

```tsx
<Kanban
  data={tasks}
  onCardChange={(e) => {
    e.preventDefault();
    setTasks((list) => applyChange(list, e)); // your reducer
  }}
  /* ... */
/>
```

## Data sources

`data` also accepts a `@salmonui/data` source, or any object with the same
`read` / `write` / `subscribe` contract. The board reads it after mount and again
on each `subscribe` event, merging `query` (`{ filters, sorting }`) into the
read request. Keep the source and the `query` object stable (create them
once, or memoize them): a new identity reads again.

```tsx
const [source] = useState(() => createTicketSource());
<Kanban data={source} getCardId={(t) => t.id} columnField="status" onDataError={(err, kind) => report(err, kind)} />
```

Writes are optimistic: the board shows the change at once and calls
`source.write` with the added, changed or deleted rows (moves carry a
`moved` placement, so local sources keep the card order). When the write is
rejected (`status: 'rejected'`) or fails, the board restores the previous
cards, announces `writeError` and calls `onDataError(error, 'write')`. A failed read shows `loadError` and calls
`onDataError(error, 'read')`.

## Loading

While the first read is pending the board is `aria-busy` with
`data-state="loading"` and shows `loading` text in its status region
`loading` forces the state from outside, for example while your own fetch
runs; `loading={false}` hides it. There are no data-binding events: the
application starts the reads, or the source reports them through
`subscribe`.
