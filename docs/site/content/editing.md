---
title: Editing
description: Row, batch, dialog and cell editing; built-in and custom editors; command column; edit methods and events; saving through the data source; edit marks; confirm prompts; the unsaved-changes guard; undo and redo.
category: Editing
order: 75
demos: [editing, editing-api, editing-server, batch-virtual, new-row]
---

Editing is one prop, `editing`: `true` for inline row editing, or settings.
`editing.edit`, `editing.add` and `editing.delete` switch the three
capabilities. Drafts, flags and errors live in the core `edit`
module, never in React state: a keystroke re-renders the edited cell only.

```tsx
<DataGrid
  data={orders}
  columns={[
    { field: 'id', header: 'Order', type: 'number', primaryKey: true },
    { field: 'customer', header: 'Customer', validation: { required: true } },
    { field: 'status', header: 'Status', editor: 'select', editorProps: { options: ['Open', 'Shipped'] } },
    { id: 'commands', header: 'Actions', commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] },
  ]}
  editing={{ mode: 'batch', confirmDelete: true, undo: true }}
  toolbar={['add', 'edit', 'delete', 'save', 'cancel']}
  onSave={(event) => console.log(event.status, event.failedRowIds)}
/>
```

## Modes

- `mode: 'row'` (default) opens an editor in every
  editable cell of the row; Enter saves the row.
- `mode: 'dialog'` edits the row in a modal form (a native `<dialog>`: focus
  trap, inert page, Escape) with a label per field.
  `editing.dialogProps` sets the title, width, class and close button;
`renderDialog`, `renderDialogHeader` and `renderDialogFooter`
  replace its parts. While the grid is adaptive the dialog is a
  full-screen sheet, which is also how vertical card rows edit (see Adaptive UI).
- `mode: 'batch'` edits one cell at a time and keeps every change, added
  row and deleted row as a draft until `save()` writes them in one request.
- `mode: 'cell'` (Salmon UI) writes each cell when its editor closes.

Added rows appear at `newRowPosition` (`top` or `bottom`) with the
columns' `defaultValue` and `editing.newRow()` values.
`column.editable: false`, the primary key on existing rows and
`editing.isCellEditable(ctx)` make cells read-only; cancel
`onBeforeEditStart` with `preventDefault()` to refuse one edit. Group
captions, group footers, aggregate rows and detail rows are not records and
never edit: Enter on a caption expands or collapses it.

Editing needs a row identity: a `column.primaryKey` column (or `getRowId`).
Without one the grid falls back to the `id` field and warns in development
on the first edit; added rows must carry a key before they save.
`editing.edit`, `editing.add` and `editing.delete` set to `false` refuse the
matching keys, toolbar items, command buttons and methods.

<!-- demo: editing -->

## Starting and ending an edit

Double click (`editOnDoubleClick`), F2, the toolbar `edit` item
 or the command column start an edit. The keyboard
works as follows: Enter saves (batch: saves the cell
and edits the cell below; Shift+Enter the cell above), Tab and Shift+Tab
move between editable cells (`tabToNextRow` continues on the next row), Insert (Ctrl+⌘+Enter on macOS) adds a row, Delete deletes the selected rows, Escape
cancels and returns focus to the cell. `confirmDelete` asks before deleting
(default off), `confirmDiscard` before discarding a batch from Cancel or a
guarded action (default on; `confirmDiscard: false` discards at once), and
`confirmSave` before a toolbar or menu Save of a batch with pending changes
(default on; `confirmSave: false`
saves at once; `api.save()` never asks). Prompt texts are the `confirmDelete`, `confirmDiscard` and
`confirmSave` locale keys. The methods
`startEdit`, `save`, `saveCell`, `cancelEdit`, `addRow`, `deleteRows`,
`updateRow`, `updateCell` and `getPendingChanges` mirror these actions;
in batch mode `save()` writes and `cancelEdit()`
discards every pending change. `applyChanges({ added, changed, deleted })`
updates many records at once without the edit lifecycle, and
`setCellValue` / `setRowData` change one cell or row silently. Each method
returns a result (`applied`, `rejected` with a reason, or `async`); while
the lazily loaded editing code is still loading, methods return `async`,
so call them from `onReady` at startup.

Each action raises a cancelable before-event and an after-event:
`onBeforeEditStart` / `onEditStart`, `onBeforeCellValueChange` /
`onCellValueChange`, `onBeforeSave` / `onSave`, `onBeforeAdd` / `onAdd`,
`onBeforeDelete` / `onDelete`, `onBeforeEditCancel` / `onEditCancel`, and
`onCommandClick`.

`onBeforeSave` fires before the write is sent to the data source and can
cancel it; `onSave` fires once the write settled. Its `status` is
`'applied'`, `'partial'`, `'rejected'` or `'error'` (`'pending'` in the
before-event), with the source's `result` (a `WriteResult`, or null), the
thrown `error` (or null) and the `failedRowIds` that keep their drafts;
`rows()` returns the written rows. A failed save or delete also fires
`onError` with `action: 'save'`.

<!-- demo: editing-api -->

## Command column

A column with `commands` renders buttons in every row and is never edited
itself:

```tsx
{ id: 'commands', header: 'Actions', commands: [{ type: 'edit' }, { type: 'delete' }, { type: 'save' }, { type: 'cancel' }] },
{ id: 'more', header: 'More', commands: [{ type: 'custom', label: 'Details' }] },
```

Edit and Delete show while the row is idle, Save and Cancel while it
edits, and `custom` buttons always. Each item takes a `label` (default:
the localized command name), an `icon`, a `title` and, for `custom`, an
`onClick({ rowId, row })`. `onCommandClick` receives `{ command, rowId,
row }` for every button first; `preventDefault()` cancels the built-in
command.

## Editors

`column.editor` picks a built-in editor: `text`, `number`, `select`,
`checkbox`, `date` or `datetime`; without it the column
type decides. `column.editorProps` configures it, for example the `select`
options, `min` / `max` / `step` of the `number` editor (ArrowUp
and ArrowDown step within the range; a typed number outside it is clamped
on save or blur), the picker range of the `date` editors, and `minLength` /
`maxLength` of the `text` editor. Lookup columns edit their key with a select of the
lookup rows and show the display value. `column.renderEditor(ctx)`
renders any editor; spread `ctx.inputProps` on the focusable
element to keep the ids, ARIA wiring and focus.

Column `validation` rules, custom validators and `editing.validateRow`
gate every save; see [Validation](/docs/data-grid/validation).

## Saving to a server

Every save (a row, a cell, or a whole batch) is one call of the data
source's `write({ added, changed, deleted })` with the rows and their
changed columns. There are no per-operation URL options: wrap
your endpoint in `write`, or use a `@salmonui/data` source, which speaks
the Salmon UI JSON protocol. While the request runs the cells carry
`data-pending`. A `partial` result applies the accepted rows and keeps the
rejected ones as drafts with the server's `cellErrors` / `rowErrors` as
messages; a thrown error or a `rejected` result keeps every draft, so the
user can fix and save again. `getEditSnapshot()` reads the
current cell and row errors.

```tsx
const source: DataSource<Order> = {
  mode: 'local',
  read: (request) => store.read(request),
  subscribe: (listener) => store.subscribe(listener),
  async write(request) {
    const { added, changed, deleted } = request;
    const response = await fetch('/api/orders/batch', { method: 'POST', body: JSON.stringify({ added, changed, deleted }) });
    return response.json(); // { version, status, changed?, cellErrors?, ... }
  },
};
```

<!-- demo: editing-server -->

Batch mode works with row and column virtualization. Drafts, delete marks and added rows are
keyed by row id in the core, so an edited row keeps its draft and marks
after it scrolls out of the DOM and back, and an open editor comes back
with its text. Enter, Shift+Enter, Tab and Shift+Tab move through the row
model, scroll the next cell into view and focus its editor when it mounts;
`save()` and `cancelEdit()` cover rows that are not rendered.

<!-- demo: batch-virtual -->

## Always-visible add row

`editing.showNewRow` keeps a blank add row at
`newRowPosition` in row mode. It shows its editors at rest and
is already in the server markup (empty cells until the editing code
loads). Type into it and press Enter, use Save, or Tab past its last cell
to write the record; a fresh blank row follows and takes focus, so entry
continues row after row. Escape clears it and returns focus to the grid;
leaving it untouched writes nothing. While another row edits, the add row
is disabled (`aria-disabled`, disabled editors). Insert, the toolbar `add`
item and `addRow(values)` fill this row instead of opening a second one;
it cannot be deleted, and it counts as an unsaved change only once a value
changed. Batch, dialog and cell modes ignore it (a development warning
says so). Under virtual scrolling it stays at `bottom` too: the added-rows
band is sticky.

<!-- demo: new-row -->

## Marks, guard and undo

Changed cells, invalid cells, pending writes, added rows and deleted rows
carry `data-dirty`, `data-invalid`, `data-pending`, `data-new` and
`data-deleted`; `getBatchPreview()` lists the diff for a review
UI. With unsaved changes, `editing.guardUnsaved` (on by default in batch
mode) asks before sorting, filtering, searching, paging or grouping
discards them, and warns on page unload. `editing.undo` records
edits for `undo()` / `redo()` and Ctrl/⌘+Z / Ctrl/⌘+Y (also
Ctrl/⌘+Shift+Z), keeping `undoLimit` entries (default 10).

## Formulas

The grid has no formula cells: a reference grammar, dependency graph and recalculation pass are
spreadsheet territory and would sit on the edit path. A value computed from
other fields of the same row is a computed column, `column.valueGetter(row)`,
which sorts, filters, groups, aggregates and exports like any column. When
the exported workbook must keep a live formula, return it from the XLSX
export `cell` hook: `cell: (ctx) => ({ formula: 'B2*C2' })`
([Export](/docs/data-grid/export); the export demo writes its Stretch column as a
formula). Cross-row or user-entered formulas belong in a spreadsheet
component.

## API reference

See [`DataGridEditing`](/docs/reference/data-grid/DataGridEditing),
[`DataGridEditColumn`](/docs/reference/data-grid/DataGridEditColumn),
[`DataGridCommandItem`](/docs/reference/data-grid/DataGridCommandItem),
[`DataGridSaveEvent`](/docs/reference/data-grid/DataGridSaveEvent) and
the edit methods of [`DataGridApi`](/docs/reference/data-grid/DataGridApi)
in the API reference.
