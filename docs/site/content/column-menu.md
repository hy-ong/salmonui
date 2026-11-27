---
title: Column menu
description: A per-header menu with built-in sort, filter, group, auto-size, pin and chooser items, custom items and submenus, per-column items and keyboard access.
category: Column Resize, Reorder, Chooser, Menu
order: 14
demos: [column-menu]
---

`columnMenu` adds a menu button to every header. A column opts out with `menu: false`.

## Items

`columnMenu={true}` shows the default menu. An array lists the items in
order: built-in ids and custom `DataGridMenuItem` objects.
`autoSizeAll` fits every visible column to its header and rendered cells
in one step, like `api.autoSizeColumns()`
with no argument.

| Id | Action |
| --- | --- |
| `autoSizeAll`, `autoSize` | Fit every column, or this column, to its content; `autoSize` needs a resizable column (grid `resizable`) |
| `group`, `ungroup` | Group or ungroup by this column (needs `grouping`) |
| `sortAscending`, `sortDescending`, `clearSort` | Sort this column (needs `sorting`); `clearSort` is a Salmon UI addition |
| `filter` | Open this column's filter menu (needs `filtering`) |
| `columnChooser` | Open the column chooser |
| `pinStart`, `pinEnd`, `unpin` | Pin or unpin this column (Salmon UI addition) |

Built-in items that do not apply are left out (no sort items on a column
that cannot sort, no group items without grouping), and the item that
matches the current state, such as Sort ascending on an ascending column, is
disabled.

A custom item has an `id`, a `label` and optionally an `icon`, `disabled`
with a `disabledReason` tooltip, `checked` (rendered as a menu checkbox),
`href` to render a link, `render` for custom content, `separator: true`, or
nested `items` for a submenu.

## Events

`onBeforeColumnMenuOpen` receives the column and a mutable copy of its
items: edit `event.items` in place (`splice`, `push`, assign by
index) to hide, add or update items for that column; the event object is
frozen in development, so never reassign `event.items`. Call
`preventDefault()` to keep the menu closed.
`onBeforeColumnMenuClose` can keep it open. `onColumnMenuItemClick` reports
every built-in and custom item with the column; `preventDefault()` skips the
built-in action. `renderColumnMenu` replaces the menu and receives the
resolved items, the default menu element and `close()`.

## Keyboard

On a focused header, Shift+Alt+ArrowDown opens the menu (Alt+ArrowDown too,
when the column has no filter button). Arrow keys move between items,
ArrowRight and ArrowLeft open and close submenus, and Escape closes the menu
and returns focus to the header.

<!-- demo: column-menu -->

## API reference

[`DataGridColumnMenuItemId`](/docs/reference/data-grid/DataGridColumnMenuItemId)
lists the built-in ids and [`DataGridMenuItem`](/docs/reference/data-grid/DataGridMenuItem)
the custom item fields;
[`DataGridColumnMenuOpenEvent`](/docs/reference/data-grid/DataGridColumnMenuOpenEvent),
[`DataGridColumnMenuItemClickEvent`](/docs/reference/data-grid/DataGridColumnMenuItemClickEvent)
and [`DataGridColumnMenuContext`](/docs/reference/data-grid/DataGridColumnMenuContext)
are the event and render payloads.