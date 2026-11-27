---
title: Column chooser
description: A searchable dialog that shows and hides columns, opened from the toolbar, the column menu or the API.
category: Columns
order: 15
demos: [column-chooser, column-chooser-templates]
---

The column chooser lists the columns with a checkbox each. It
opens from the toolbar `'columnChooser'` item, anchored below the button,
from the `columnChooser` column menu item, or from
`api.openColumnChooser()`. Called with a viewport point,
`api.openColumnChooser({ x, y })` opens it there; without one it opens at
the start of the grid. `columnChooser={false}` drops the `columnChooser`
item from the column menu and disables the toolbar item.

## Search

A search box above the list narrows the columns by header text.
`columnChooser={{ searchOperator }}` picks the match: `'contains'`
(default), `'startsWith'`, `'endsWith'` or `'equal'`. `searchable: false` removes the
box (`enableSearching`), `ignoreAccents: true` folds diacritics so
`categorie` finds "Catégorie" (`ignoreAccent`), and `debounce` delays the
filtering while typing (`immediateModeDelay`; Enter applies at once).

## Applying changes

In the default `mode: 'confirm'` the checkboxes are a draft: OK applies the
changes and Cancel discards them. `mode: 'immediate'`
applies every toggle at once. Either way the grid raises the cancelable
`onBeforeColumnVisibilityChange` and then `onColumnVisibilityChange` with
the hidden and shown columns, and `onBeforeColumnChooserOpen` fires before
the chooser opens with the listed `columns` (call `preventDefault()` to
keep it closed). The chooser is a labelled `role="dialog"`: focus
moves into it, Escape closes it and returns focus to the element that
opened it.

A column with `hideable: false` is left out of the list, so the chooser can
never hide it. Under
stacked headers the list is an indented tree of the groups and their
leaves; a group checkbox toggles all of its leaves.

<!-- demo: column-chooser -->

## Templates

`renderHeader` adds content above the search box and `renderFooter`
replaces the OK / Cancel buttons; `renderChooser` replaces the search box
and the list.
Each receives the listed `columns` (`field`, `header`, draft `hidden`,
`matches`, and the public `column` view), the `searchText` and
`setSearchText(text)`, `setHidden(fields, hidden)`, `apply()`, `close()`,
and `defaultContent`
(the built-in part it replaces), so a template can decorate the built-in UI
instead of rebuilding it.

<!-- demo: column-chooser-templates -->

## API reference

[`DataGridColumnChooser`](/docs/reference/data-grid/DataGridColumnChooser)
lists the `columnChooser` options and
[`DataGridColumnChooserContext`](/docs/reference/data-grid/DataGridColumnChooserContext)
the template context;
[`DataGridColumnChooserOpenEvent`](/docs/reference/data-grid/DataGridColumnChooserOpenEvent)
and [`DataGridColumnVisibilityChangeEvent`](/docs/reference/data-grid/DataGridColumnVisibilityChangeEvent)
are the event payloads, and `openColumnChooser` is on
[`DataGridApi`](/docs/reference/data-grid/DataGridApi).