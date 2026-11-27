---
title: Tree Grid
description: DataGrid tree mode for hierarchical data. Nested or flat self-referential rows, expansion, tree keys, filter and paging modes, checkbox cascade, child summaries, drag and indent, and lazy remote children.
category: Tree Grid
order: 165
demos: [tree-basic, tree-templates, tree-state, tree-flat-filter, tree-aggregates, tree-checkbox, tree-indent, tree-drag-targets, tree-remote, tree-data-sources, tree-export-print, tree-rtl-locale, tree-large, tree-performance]
---

A tree grid is `DataGrid` with the `tree` option: the same component,
engine, columns and API, with rows indented by depth in one column.
A second component would
repeat every Data Grid prop, event, method and docs page and ship a second
renderer, so the tree is a row model of the one grid instead. No
`TreeGrid` alias is exported. Tree mode is opt-in: a grid without `tree` loads none of the tree code.

## Enabling tree mode

Nested rows keep their children in an array field. `tree` (or
`tree={{ childrenField: 'children' }}`) reads them; the nested rows are taken by reference, never
copied:

```tsx
import { DataGrid } from '@salmonui/data-grid';
import '@salmonui/data-grid/styles.css';

const plan = [
  { id: 'plan', name: 'Planning', hours: 2, children: [{ id: 'scope', name: 'Scope', hours: 4 }] },
  { id: 'launch', name: 'Launch', hours: 2 },
];

<DataGrid data={plan} columns={columns} tree />
```

Flat self-referential rows name their parent's row id in a field
(`idMapping` + `parentIdMapping`). The row id comes from
`getRowId` or the `primaryKey` column; a missing, `null` or unknown parent
id makes a root:

```tsx
<DataGrid data={employees} columns={columns} getRowId={(row) => row.id} tree={{ parentIdField: 'managerId' }} />
```

Orphans (an unknown parent id) become roots and cycles break at the first
repeated id, each with a development warning. `tree` is read when
the grid is created; its options (`filterMode`, `expandedRows`,
`checkbox`, ...) are reactive afterwards.

<!-- demo: tree-basic -->

## The tree column

The hierarchy shows in the first visible data column, or in the column
named by `tree.column` (field or column id);
it follows reordering, pinning and hiding. Its cells hold the
expand toggle (`DataGridTreeToggle`, class `.salmon-data-grid-tree-toggle`)
and an indentation of 1.25rem per depth through `padding-inline-start`.
Rows carry `data-depth`, `data-expanded` and `data-has-children`
for styles, and `getRowProps(row, index, ctx)`
receives `ctx.tree`.

`column.renderCell(ctx)` on the tree column renders after the toggle, and
`ctx.tree` carries `{ depth, hasChildren, expanded, loadStatus }`.
Row templates (`renderRow`) compose `DataGridRow`, `DataGridCell` and
`DataGridTreeToggle`. Detail rows (`renderDetail`) follow their
tree row and hide with it.

<!-- demo: tree-templates -->

## Expansion

| Option | Behavior |
| --- | --- |
| `defaultExpanded: true` (default) | Every parent starts expanded. |
| `defaultExpanded: false` | Every parent starts collapsed. |
| `defaultExpanded: n` | Parents at depths below `n` start expanded. |
| `expandedField: 'isExpanded'` | Initial expansion from a boolean data field (`expandStateMapping`). |
| `expandedRows: { [rowId]: boolean }` | Reactive overrides over the default (*Salmon*). |

Methods return a `DataGridActionResult`:

```ts
api.expandAllTreeRows();           // expandAll()
api.collapseAllTreeRows();         // collapseAll()
api.expandTreeLevel(0);            // expandAtLevel(level); 0 is the roots
api.collapseTreeLevel(1);          // collapseAtLevel(level)
api.expandTreeRows(['a', 'b']);    // expandByKey(key)
api.collapseTreeRows('a');         // collapseByKey(key)
api.toggleTreeRow('a', false);     // expandRow / collapseRow (ids, not elements)
```

`onBeforeTreeToggle` runs before a row expands or collapses and
`preventDefault()` cancels it; a
bulk toggle (expand or collapse all, a level) runs it once per rendered
parent that would change, and one cancel cancels the whole command;
`onTreeToggle` follows (`expanded` / `collapsed`). Both receive
`{ rowId, row, expanded, depth, lazy, source }` with `source` `'pointer'`,
`'keyboard'` or `'api'`. Expansion is keyed by row id, so it
survives sorting, filtering, paging and data updates, and it is
part of the grid state (see [State, RTL and adaptive](#state-rtl-and-adaptive)).

<!-- demo: tree-state -->

`api.getTreeRow(rowId)` returns `{ rowId, depth, parentId, hasChildren,
childCount, expanded, loadStatus, posinset, setsize, context, visible }`
`api.getChildRows(rowId)` the kept children in
view order (`null` for the roots), and `api.getVisibleRows()` the visible
rows.

## Keyboard and accessibility

The grid root is `role="treegrid"` in tree mode. Rows carry `aria-level`
(depth + 1), `aria-posinset` and `aria-setsize` from the tree index (correct
for virtualized rows too), and parents carry `aria-expanded`; the toggle
has no `aria-expanded` of its own, so the state is announced once.

| Keys | Behavior |
| --- | --- |
| Ctrl+Shift+ArrowDown / ArrowUp (⌘ on macOS) | Expand / collapse the focused row |
| Ctrl+ArrowDown / ArrowUp (⌘ on macOS) | Expand / collapse every row |
| Enter or Space on the toggle | Toggle the row |
| ArrowRight on the tree cell of a collapsed parent | Expand (WAI-ARIA treegrid) |
| ArrowLeft on the tree cell of an expanded parent | Collapse; on a collapsed parent or a leaf, move to the parent row |
| Alt+Shift+ArrowRight / ArrowLeft | Indent / outdent the focused or selected rows (*Salmon*) |

The ArrowRight / ArrowLeft tree keys apply when the tree column is the
first visible column; ArrowRight and ArrowLeft keep their cell-move meaning
everywhere else. The key commands are
`tree.expandFocused`, `tree.collapseFocused`, `tree.indent` and
`tree.outdent`; Ctrl+ArrowDown / ArrowUp are the shared
`group.expandAll` / `group.collapseAll` commands, which expand or collapse
every tree row in tree mode. `keyBindings` can rebind all of them. A
polite live region announces "{row} expanded, {count} children",
"{row} collapsed", "Loading children" and "Could not load children".
The texts are `localeText` keys: `treeExpand`, `treeCollapse`,
`treeExpanded`, `treeCollapsed`, `treeLoading`, `treeLoadError`,
`treeRetry`, `treeLevel`, `indent` and `outdent`. See
[Accessibility](/docs/data-grid/accessibility) for the rest of the grid.

## Sorting, filtering and searching

Sorting orders siblings within each parent; a row never moves under another
parent. Filtering and search keep rows by `tree.filterMode`:

| `filterMode` | Rows kept |
| --- | --- |
| `'ancestors'` (default) | Matches and their ancestor chain |
| `'descendants'` | Matches and their subtrees |
| `'both'` | Matches, their ancestors and their subtrees |
| `'none'` | Matches only, re-parented to their nearest kept ancestor |

Rows kept only as context carry `data-tree-context` and are dimmed. A
filter never changes the expansion state: a match inside a collapsed
parent stays hidden until the parent expands, so call `expandTreeRows` from
`onFilterChange` to reveal matches. Excel and checkbox filter
lists count matching rows of every depth.

<!-- demo: tree-flat-filter -->

## Paging

`tree.pageBy: 'all'` (default) pages the visible rows; `'root'` pages root
rows with their subtrees.
Expanding or collapsing re-pages without a remote read.

```tsx
<DataGrid data={rows} columns={columns} tree={{ parentIdField: 'parentId', pageBy: 'root' }} paging={{ pageSize: 10 }} />
```

## Checkboxes and selection

`tree.checkbox: true` adds a checkbox after the toggle (column
`showCheckbox`). The checkbox state is the row selection, so
`api.getSelectedRows()`, `api.getSelectedRowIds()` and
`api.selectRows(rowIds)` replace `getCheckedRecords`,
`getCheckedRowIndexes` and `selectCheckboxes`, and
`onBeforeSelectionChange` / `onSelectionChange` report `target: 'checkbox'`
(`checkboxChange`).

| `checkbox.cascade` | Behavior |
| --- | --- |
| `false` (default) | The checkbox selects its row only |
| `true` | A parent selects or deselects its whole subtree |
| `'filtered'` | The cascade reaches only rows the filter keeps |

A subtree toggle is one range command over the tree, not one event per
row. A partly selected parent shows the indeterminate state
(`aria-checked="mixed"`), derived from descendant counts, never stored per
row. Selection is id-based: collapsing a parent never deselects
its rows, and a cascade reaches hidden descendants.

<!-- demo: tree-checkbox -->

## Aggregates and child summaries

Footer aggregates cover the kept rows of every depth.
`renderChildFooter` on an aggregate adds a child summary row under each
expanded parent, over its descendants; `renderFooter` and `renderChildFooter` are the footer templates.
An aggregate with only `renderChildFooter` does not show in the
grid footer.

```tsx
<DataGrid
  data={plan}
  columns={columns}
  tree
  aggregates={[{ columns: [{ field: 'hours', type: 'sum', renderChildFooter: ({ formatted }) => <>Subtotal {formatted.sum}</> }] }]}
/>
```

<!-- demo: tree-aggregates -->

## Editing

Cell, row, dialog and batch editing, the command column and validation
work in a tree; editing the tree column keeps the toggle, and
batch editing works with row virtualization.
`editing.newRowPosition` places added rows:

| `newRowPosition` | Added row |
| --- | --- |
| `'top'` (default), `'bottom'` | First or last root |
| `'above'`, `'below'` | Sibling before or after the focused row |
| `'child'` | Last child of the focused row |

An added row joins its parent: `WriteRequest.added` carries its `parentId`
and the local source inserts it into the tree. Deleting a parent
deletes its subtree: `api.deleteRows(rowIds)` writes every descendant id in
`WriteRequest.deleted`.

## Drag, indent and outdent

`rowDrag` in tree mode drops before a row (top quarter), into it (middle
half) or after it (bottom quarter). Dragging a parent moves its
subtree; dropping a row into itself or its own descendant is invalid with
reason `'descendant'`. `onRowDragStart`, `onRowDrag`,
`onBeforeRowDrop` (cancel) and `onRowDrop` report `position` (`'before'`,
`'after'`, `'into'`) and `parentId`; `api.moveRows(rowIds, { targetRowId,
position })` replaces `reorderRows`. Selection and a primary key
column are not required. `rowDrag.targetId` drops into another
grid and onto custom targets with the subtrees in the payload.

`api.indentRows(rowIds)` makes rows the last children of their previous
sibling and `api.outdentRows(rowIds)` makes them siblings after their
parent; the toolbar items `'indent'` and `'outdent'` are disabled when the
focused row cannot move. Alt+Shift+ArrowRight / ArrowLeft is the
keyboard alternative. Flat data writes the changed parent id
field, so a remote source can persist the move.

```tsx
<DataGrid data={steps} columns={columns} tree={{ parentIdField: 'parentId' }} rowDrag toolbar={['indent', 'outdent']} />
```

The toolbar and context menu work as in a flat grid, plus the tree items.

<!-- demo: tree-indent -->

<!-- demo: tree-drag-targets -->

## Remote and lazy children

Rows whose children load on demand name a boolean field in
`tree.hasChildrenField`. Such a row
renders collapsed with a toggle, on the server and the client alike, and
its children load on the first expand:

- Local data: `tree.loadChildren({ rowId, row, signal })` returns the
  children (or a promise of them); they join the data under the row.
- A remote data source (`mode: 'remote'`): the grid reads `read({
  parentRowId: null })` for the roots and `read({ parentRowId })` on
  expand. Items are tree envelopes `{ kind: 'tree', row, parentId,
  hasChildren, childCount, children }`; children are cached per parent
  until the query changes. `createJsonDataSource` from `@salmonui/data`
  sends the parent on the wire, and the reference handler
  (`@salmonui/data/server`) serves tree levels with a `parentField`.

The grid wires a remote source through `createRemoteTree(source, {
getRowId, onError })` from `@salmonui/data-grid/engine/tree-remote`, loaded only when a remote source is in tree mode; call it
yourself only when you build an engine without `DataGrid`. Envelopes that
carry `children` load whole subtrees at once (`loadChildOnDemand: false`), remote nested data is accepted, and the query (filter,
search, sort) travels with root and child reads, so a server that returns
matches with their ancestor chain keeps a lazy tree filtered.
`pageBy: 'root'` pages roots on the server. `createOfflineDataSource`,
`createControlledDataSource` with `request.parentRowId`
 and server
aggregates (`DataSourceResult.aggregates`) work in tree mode.

While children load, the toggle shows a spinner, the row carries
`aria-busy` and `api.getTreeRow(rowId).loadStatus` is `'loading'`; then
`'loaded'`, or `'error'` after a failed read, which calls `onError` with
`action: 'treeChildren'` and the `rowId`. Clicking the toggle again or
`api.reloadTreeChildren(rowId)` retries (*Salmon*). Rows of a
lazy parent being loaded can show skeleton rows
(`virtualization.skeletonRows`).

<!-- demo: tree-remote -->

<!-- demo: tree-data-sources -->

## Export, print and copy

Exports write the tree view: Excel rows get an outline level per
depth (clamped at 7), PDF indents the tree column, and CSV writes rows in
visible pre-order. `tree: 'expanded'` (default) exports the visible rows;
`tree: 'all'` exports every kept row regardless of expansion:

```ts
await api.exportToExcel({ tree: 'all', outlineCollapsed: true }); // collapsed parents stay collapsed in Excel
await api.exportToCsv({ tree: 'all', treeDepthColumn: 'Level' });  // adds a depth column (true: "Depth")
```

Server export runs the same model with depths. `print()` prints
the expanded view with indentation, or every row with `printing={{ tree:
'all' }}` or `print({ tree: 'all' })`. `tree.copyMode` widens
`api.copy()` and Ctrl+C with the copied rows' ancestors (`'ancestors'`,
default), descendants, both, or none. See [Export](/docs/data-grid/export) and
[Print](/docs/data-grid/print).

<!-- demo: tree-export-print -->

## State, RTL and adaptive

`persistState`, `api.getState()` and `api.restoreState()` include the tree
expansion as `tree.expandedRows`. With `dir="rtl"` the
indentation, the chevron, ArrowRight / ArrowLeft and the indent keys mirror.
Adaptive vertical rows show the toggle and "Level n" in each
card instead of the indentation, with a 44 × 44 px toggle target.

<!-- demo: tree-rtl-locale -->

## With other features

Tree mode keeps the rest of the grid: columns and column chrome (templates,
types, formats, lookup columns, resize, reorder, auto-fit, pinning, column
menu and chooser, stacked headers), row and column spans (a row
span ends at a parent boundary), lookup columns and validation,
templates and theming, globalization, and
every shared Data Grid method and event. Row virtualization is
always on over the tree view, with no per-row materialization, and it works
with checkboxes, detail and row templates, batch editing, cell selection
and variable heights. Column virtualization keeps the toggle on the tree column.
Infinite scroll loads blocks of root rows and allows a
collapsed initial state: with a remote source and
`infiniteScroll={{ blockSize, initialBlocks, threshold }}` the first read
asks for `initialBlocks` blocks of root rows (`read({ parentRowId: null,
range })`) and scrolling near the last tree row reads the next block.
Children still load on expand. Expansion, detail rows, editing and
`selectRows` by id keep working across block loads. `cache`, `maxBlocks`,
`initialResult` and `api.engine.infiniteScroll` do not apply in tree mode;
blocks are appended as they land.

`tree` does not combine with `grouping` or `childGrid`: `tree` wins and a development warning names the ignored
prop. Use `renderDetail` for detail rows under tree rows.

<!-- demo: tree-large -->

## Server rendering

Tree mode renders on the server: nested and flat rows, the toggle, the
indentation and the treegrid ARIA attributes are in the server markup, so
hydration does not change them. Lazy parents (`hasChildrenField`) render
collapsed with a toggle and never load children on the server; child reads,
the key handlers and the skeleton row start after mount. `persistState`
reads its storage only after mount, so a restored expansion applies after
hydration, not in the server markup.

## Virtualization and data updates

- There is no separate DOM virtualization mode: rows are always
  DOM-virtualized with one model, and buffer sizes, DOM pools and scroll
  throttling are internal, held to the scroll budgets. Tune the overscan
  with `virtualization.rowOverscan`, and use `estimatedRowHeight` for
  measured, variable row heights.
- There is no immutable mode: the engine always applies data
  changes as id-keyed row deltas, so a mode switch would only add a slower
  default. Keep stable row ids (`getRowId`), which tree mode needs anyway;
  `setRowData`, `setCellValue` and new `data` arrays are diffed by row id.

## API reference

The `tree` prop is [`DataGridTree`](/docs/reference/data-grid/DataGridTree),
the tree methods are [`DataGridTreeApi`](/docs/reference/data-grid/DataGridTreeApi)
on [`DataGridApi`](/docs/reference/data-grid/DataGridApi), the row info
is [`DataGridTreeRowInfo`](/docs/reference/data-grid/DataGridTreeRowInfo),
the toggle events are
[`DataGridTreeToggleEvent`](/docs/reference/data-grid/DataGridTreeToggleEvent),
`ctx.tree` is [`DataGridTreeContext`](/docs/reference/data-grid/DataGridTreeContext),
and row templates use
[`DataGridTreeToggle`](/docs/reference/data-grid/DataGridTreeToggle).

## Performance

The tree index is built once per data identity in typed arrays (no per-row
objects) and patched on row changes: a move, indent or outdent splices the
moved subtree into the index instead of rebuilding it. The visible rows
are a list of ranges, so expanding or collapsing a branch and every scroll
lookup are independent of the row count. The budgets
are: index build of 50,000 rows ≤ 25 ms, one branch ≤ 16 ms, expand all
≤ 60 ms, a cascade over 100,000 descendants ≤ 16 ms, sibling sort and
`'ancestors'` filter of 1,000,000 rows within 1.2 × the flat budgets once
the sort keys are cached (and within 1.86 × the same query on a flat grid
from cold), indent, outdent or a drop `into` a row of a million-row tree
≤ 16 ms to painted, and the flat scroll budgets on a fully expanded
million-row tree. The demo below generates either benchmark tree and
shows each measured time next to its budget.

<!-- demo: tree-performance -->

The tree code is a prop-gated chunk (`@salmonui/data-grid/engine/tree`
≤ 13.1 KB, the `tree` render feature with it ≤ 20.5 KB gzip); the Minimal
`DataGrid` app does not grow. Bundle size has no demo: it is
verified by `npm run bundle:check` (`tooling/checks/bundle-size.mjs`) in
`npm run release:verify`. See [Performance](/docs/data-grid/performance).
