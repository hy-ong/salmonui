---
title: Adaptive UI
description: Adaptive layout for narrow containers and touch, vertical card rows, full-screen sheets, and touch selection.
category: Adaptive UI
order: 125
demos: [adaptive]
---

`adaptive` turns on the adaptive UI. `true` is `{ target: 'both' }`,
which applies at every width. `target: 'mobile'` applies only while the grid
is narrower than `breakpoint` (640 px by default), and `target: 'desktop'`
only while it is at least that wide. The width is the grid's own container
width, not the device or the window, so a grid in a narrow sidebar adapts on
a wide screen too. The grid fills its parent's width, and `height="100%"` fills a parent with
a fixed height and follows it when the parent resizes.

```tsx
<DataGrid data={orders} columns={columns} adaptive={{ target: 'mobile', rowLayout: 'vertical' }} sorting filtering={{ ui: 'excel' }} />
```

## Server rendering

The server cannot measure a container, so it renders the mode the prop alone
gives: adaptive for `target: 'both'`, and `defaultActive` (default `false`)
for `mobile` and `desktop`. After mount the grid measures its width and
switches once if needed. Hydration always matches the server markup. If you
know the client is a phone (for example from a user-agent hint), pass
`defaultActive: true` to avoid the switch.

## Vertical rows

`rowLayout` defaults to `'horizontal'` (the desktop rows).
`rowLayout: 'vertical'` renders each record as a card with one label and
value line per visible column. Cards are drawn from the same
virtualized row window as horizontal rows, with a fixed card height of
`visible columns × rowHeight + 24 px`, so 100,000 records scroll with the
same row virtualization, paging and selection as the desktop layout.
The accessibility tree does not change. Each card is a `role="row"`, each
field is a `role="gridcell"` with the column's `aria-colindex`, and the
column headers stay in the tree, visually hidden. Arrow keys move between
fields and records as they do between cells.

In vertical mode a bar above the grid offers **Sort** and **Filter**. Sort
opens a full-screen sheet where each sortable column picks None, Ascending or
Descending. Filter lists the filterable columns; choosing one opens
its filter menu as a full-screen sheet. `api.openSortDialog()` and
`api.openFilterDialog(field?)` open them from code, and
`onBeforeAdaptiveDialogOpen` can cancel either one.

## Sheets

While adaptive, every grid dialog renders as a full-screen sheet with a
labelled close button and a focus trap. This covers the filter menu, the
column chooser, the sort sheet and the edit dialog. Menus (the
column menu, context menu and toolbar overflow) become bottom sheets with
44 px items.

## Editing

With `editing={{ mode: 'dialog' }}` the edit form fills the screen while the
grid is adaptive. The title and a 44 px **Close** button stay at the
top, **Save** and **Cancel** stay at the bottom, and the fields scroll between
them. The form is a native modal `<dialog>`: the page behind it is inert,
focus moves to the first field, Escape or Close discards the draft, and
focus returns to the cell that opened it. `editing.dialogProps.width` does
not apply to the sheet. Outside adaptive mode the same dialog is a centred
modal again.

```tsx
<DataGrid data={orders} columns={columns} adaptive={{ target: 'mobile', rowLayout: 'vertical' }} editing={{ mode: 'dialog' }} toolbar={['add', 'edit', 'delete']} />
```

Dialog editing is the editing path for vertical rows. Double-click a card (a
double-tap on touch screens), press F2 on a focused field, use the
toolbar **Edit** item on the selected record, or call `api.startEdit(rowId)`.
**Add** and `api.addRow()` open the same sheet for a new record. The cards
behind the sheet stay virtualized and keep their scroll position, so a
record deep in a 100,000-row list edits the same way as the first one, and
the card shows the saved values when the sheet closes.

## Touch

Tap selects. Swiping scrolls the records with native touch
scrolling, vertically through the cards and also sideways through the
columns of horizontal rows. A swipe never selects a record or starts a
long-press: a swipe on the grid is touch scrolling, and rows have no swipe
actions. Long-press a header to
open its column menu, or a cell to open the context menu when `contextMenu`
is set. Otherwise, long-pressing
a record with multiple selection enabled starts multi-select mode and adds
that record. After the first touch selection a **Select multiple** toggle
appears in the adaptive bar, showing the selected count. While it is on, taps
add and remove records. Toolbar items, pager buttons, group chips,
expand toggles and checkboxes get 44 px touch targets. The pager
drops its numeric buttons at narrow widths and hides the page-size label,
and the toolbar moves items that do not fit into its overflow
menu, which opens as a bottom sheet.

<!-- demo: adaptive -->

## API reference

[`DataGridAdaptive`](/docs/reference/data-grid/DataGridAdaptive) lists
the `adaptive` options,
[`DataGridAdaptiveDialogOpenEvent`](/docs/reference/data-grid/DataGridAdaptiveDialogOpenEvent)
the `onBeforeAdaptiveDialogOpen` payload, and
[`DataGridApi`](/docs/reference/data-grid/DataGridApi) the
`openSortDialog` and `openFilterDialog` methods.
