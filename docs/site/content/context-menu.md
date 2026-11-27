---
title: Context menu
description: A right-click and Shift+F10 menu for headers, cells, rows, group captions and the pager, with built-in and custom items and per-target control.
category: Context Menu
order: 16
demos: [context-menu]
---

`contextMenu` replaces the browser menu inside the grid. `contextMenu={true}`
shows a default menu per target: auto-size, group, sort and pin items on
headers; edit, copy and export items on cells; page items on the pager.

## Items

An array lists the items in order for every target: built-in ids
and custom `DataGridMenuItem` objects.

- Columns: `autoSize`, `autoSizeAll`, `sortAscending`, `sortDescending`,
  `group`, `ungroup`, `pinStart`, `pinEnd`, `unpin`.
- Rows: `edit`, `delete`, `save`, `cancel`, `copy`.
- Export: `exportExcel`, `exportPdf`, `exportCsv`.
- Pager: `firstPage`, `previousPage`, `nextPage`, `lastPage` (need `paging`).

Built-ins that cannot apply to the target are dropped, for example `edit`,
`delete` and `copy` on a header or the pager, and sort and pin items on the
pager. Page items apply to every target while paging is on; the demo keeps
them on the pager through `onBeforeContextMenuOpen`. Custom items take the
same fields as column menu items (`id`, `label`, `icon`, `disabled`,
`targets`, `href`), with nested `items` for submenus. A submenu
opens when the pointer rests on its item for a moment (200 ms hover
intent) and closes when the pointer rests on a sibling; crossing a sibling
on the way into the submenu keeps it open. From the keyboard, ArrowRight
opens it (ArrowLeft in RTL) and ArrowLeft or Escape closes it.

Edit, copy and export items run UI commands. Without a handler for the
command (`api.registerCommandHandler`) or a module that declares it, the item
is disabled and its tooltip says which feature is missing.

## Targets and events

The menu opens for a header, a cell, a row, a group caption or the pager.
`onBeforeContextMenuOpen` receives that target as a descriptor
(`{ kind: 'cell', rowId, field }`, `{ kind: 'header', field }`, ...) and a
mutable copy of the items: edit `event.items` in place (`splice`,
`push`) to change the menu for this target (the event object is frozen in
development, so never reassign `event.items`), or call `preventDefault()` to keep it closed.
`onBeforeContextMenuClose` can keep it open.

`onContextMenuItemClick` reports the item, the target and `rowIds`: the
target row, or the whole selection when the target row is selected, with
`rows()` to read the row objects. `preventDefault()` skips the built-in
action. `renderContextMenu` replaces the menu and receives the `target`,
the resolved `items`, the `defaultMenu` element and `close()`.

The target is resolved from the row and column ids of the clicked element,
so the menu works the same on virtualized rows and pinned columns.
Shift+F10 and the ContextMenu key open it for the focused cell, header or
group caption, and on a focused pager button for the `pager` target;
Escape closes it and returns focus to that element.

<!-- demo: context-menu -->

## API reference

[`DataGridContextMenuItemId`](/docs/reference/data-grid/DataGridContextMenuItemId)
lists the built-in ids, [`DataGridMenuItem`](/docs/reference/data-grid/DataGridMenuItem)
the custom item fields and
[`DataGridContextMenuTarget`](/docs/reference/data-grid/DataGridContextMenuTarget)
the target descriptors;
[`DataGridContextMenuOpenEvent`](/docs/reference/data-grid/DataGridContextMenuOpenEvent)
and [`DataGridContextMenuItemClickEvent`](/docs/reference/data-grid/DataGridContextMenuItemClickEvent)
are the event payloads.