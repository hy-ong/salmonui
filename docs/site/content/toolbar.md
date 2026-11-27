---
title: Toolbar
description: Built-in and custom toolbar items, alignment, search, overflow, keyboard navigation and a replaceable toolbar.
category: Toolbar
order: 17
demos: [toolbar]
---

The `toolbar` prop lists the items in order. The toolbar renders as a
`role="toolbar"` element just before the `role="grid"` element, not inside
it: a grid may only own rows, so a toolbar inside it would break the grid
semantics. In DOM order the toolbar comes first, so Tab reaches the toolbar
and then the grid's single tab stop.

## Built-in items

Built-in items are plain ids: `'add'`, `'edit'`, `'delete'`,
`'save'`, `'cancel'`, `'search'`, `'print'`, `'columnChooser'`,
`'exportExcel'`, `'exportPdf'` and `'exportCsv'`, plus the Salmon UI
additions `'expandAll'` and `'collapseAll'` for groups, `'copy'` (copies the
selection), `'filterBuilder'` (opens the filter builder; needs
`filtering.builder`, see [Filtering](/docs/data-grid/filtering)), and
`'indent'` and `'outdent'` for tree rows (see [Tree Grid](/docs/data-grid/tree)).
`'search'` renders a search box bound to the grid search (it needs the
`search` prop), and `'columnChooser'` opens the column chooser below the
button.

Edit, copy, export, print and tree items run named UI commands
(`edit.add`, `clipboard.copy`, `export.csv`, `grid.print`, `tree.indent`,
...). An item is enabled when something serves
its command: a handler registered with `api.registerCommandHandler`, or a
registered module that declares it. Otherwise the item is disabled with the
reason as its tooltip.

With editing on, the edit items also follow the edit state. `'add'`, `'edit'` and `'delete'` need `editing.add`, `editing.edit`
and `editing.delete`; `'edit'` and `'delete'` also need a target row: a
selected row or cell range, or with selection off the focused body cell.
In row, dialog and cell mode an open edit disables `'add'`, `'edit'` and
`'delete'`, and only then are `'save'` (Update) and `'cancel'` enabled. In
batch mode `'save'` and `'cancel'` are enabled while there are pending
changes (edited, added or deleted rows) or a cell editor is open. These
items are `aria-disabled` and do nothing until the state changes; the
toolbar re-renders only when an item's enablement can change, never per
cell or keystroke.

```tsx
<DataGrid
  aria-label="Orders"
  data={orders}
  columns={columns}
  grouping
  toolbar={['expandAll', 'collapseAll', { id: 'columnChooser', label: 'Columns' }, 'exportCsv', 'search']}
  search
  onReady={(api) => api.registerCommandHandler('export.csv', () => { /* export */ return true; })}
/>
```

## Custom items

An item object is a `DataGridToolbarItem`: `id`, `label`, `icon`,
`title` (tooltip), `align`, `disabled` and `render` for custom content. An
object whose `id` is a built-in id keeps the built-in behavior and takes the
new label, icon, title, alignment or `disabled`. `disabled` is reactive:
pass a new value and the item updates.

Give a `render` item a `label`: it names the button (`aria-label`, so an
icon-only render stays accessible) and is the item's text in the overflow
menu. Without one the menu falls back to `title`, then the rendered text
or `aria-label`, then the id, and development builds warn once.

Items align to the `start` (default), `center` or `end` of the toolbar;
the search box defaults to `end`.

`onToolbarItemClick` reports every click with the item; calling
`event.preventDefault()` skips the built-in action. `renderToolbar` replaces
the toolbar and receives the resolved `items`, the `defaultToolbar` element
to wrap and the grid `api`.

## Overflow and keyboard

When the items do not fit, the trailing items move into a "more" menu at
the end of the toolbar; the search box always stays visible. The toolbar
measures itself and updates as the grid resizes. The toolbar is one tab stop with roving focus:
ArrowLeft and ArrowRight move between items (mirrored in RTL), and Home and
End jump to the first and last item.

<!-- demo: toolbar -->

## API reference

[`DataGridToolbarItem`](/docs/reference/data-grid/DataGridToolbarItem)
and [`DataGridToolbarItemId`](/docs/reference/data-grid/DataGridToolbarItemId)
describe the items,
[`DataGridToolbarItemClickEvent`](/docs/reference/data-grid/DataGridToolbarItemClickEvent)
the click event, [`DataGridToolbarContext`](/docs/reference/data-grid/DataGridToolbarContext)
the `renderToolbar` context, and
[`DataGridApi`](/docs/reference/data-grid/DataGridApi)
`registerCommandHandler`.