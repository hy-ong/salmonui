---
title: Data Grid API and keyboard hooks
description: The imperative grid instance and custom keyboard handling.
category: Methods and Commands
order: 110
demos: [grid-api, grid-internals]
---

The grid exposes an imperative instance through its ref, through
`onReady(api)` after the first commit, and to components rendered inside
the grid (templates, toolbar content) through `useDataGridApi()`. It reads
the rows of the current view; resolves a row, a row from any
element inside it, or a cell by ids; returns the data source and
the primary-key fields; scrolls to a row or a column; and
moves keyboard focus to the grid or a specific cell. Every method
works by row id and column id, so it is independent of virtualization and
of the current sort. The generated [API reference](/docs/reference) lists
the signature of every exported symbol, including the full `DataGridApi`.

Scrolling: `api.scrollToRow(rowId, { align })` and
`api.scrollToColumn(field, { align })` bring a row or a center column into
view (`align` is `'nearest'` by default, or `'start'`, `'center'`,
`'end'`; pinned columns are always in view). `api.scrollTo({ top, left })`
scrolls by offset:
`top` is the offset of the first body row in px (row `i` of a fixed
36 px grid starts at `36 * i`, also beyond the browser's height limit,
where the grid compresses the scroll range), `left` is the offset of the
center columns from the inline start (positive in RTL too). An omitted
axis keeps its position and both are clamped to the scroll range.
`api.getRenderedRange()` returns the rendered row and column ranges.

Rows by position: `api.getRowIdAt(index)` returns the id of the row at a
position of the current view and
`api.getRowIndex(rowId)` is its inverse; `api.getRow(rowId)` returns the
row data. `api.getRowInfo(target)` takes a row id or any element inside a
row (a cell or custom template content) and
returns the row, its index, the field of the cell and the row and cell
elements. `api.getRowElement(rowId)` and `api.getCellElement(rowId,
field)` return the rendered elements; outside the rendered (virtualized)
window they return `null`, as does the `element` of `getRowInfo`.

Every key pressed in the grid first reaches a key handler with the bound
command and the focused cell; the handler can suppress the built-in
behavior: the `onKeyDown(ctx)` prop receives the
`command`, the `context`, the focused `rowId` and `field` and the
`nativeEvent`, and `ctx.preventDefault()` suppresses the binding;
`api.registerKeyHandler(command, handler, { priority })` adds a handler for
one command and returns its unregister function. The `keyBindings` prop
rebinds built-in commands to other key combinations
(`{ 'selection.selectAll': ['Mod+Shift+L'] }`); the default table is
`DEFAULT_KEY_BINDINGS`.

```tsx
<DataGrid
  data={orders}
  columns={columns}
  keyBindings={{ 'selection.selectAll': ['Mod+Shift+L'] }}
  onKeyDown={(ctx) => {
    if (ctx.command === 'edit.delete' && !confirm('Delete?')) ctx.preventDefault();
  }}
/>
```

`api.setLoading(true)` / `api.setLoading(false)` show and hide the loading
indicator, and `api.refresh()` re-reads the data with the current
query; headers and columns need no refresh method because they
render from props. Both are shown
on the [data sources](/docs/data-grid/data-sources) page.

<!-- demo: grid-api -->

## Elements, engine, modules and commands

The grid renders one element tree. `api.element` is the root;
`api.getPartElement(part)` returns the first rendered element of a part
(`'header'`, `'body'`, `'pager'`, `'toolbar'`, ...) and
`api.getHeaderElement(field)` a header cell. The grid is one
`role="grid"` tree with no separate header, content or frozen tables
([Accessibility](/docs/data-grid/accessibility)), so there are no
per-table getters: use `getPartElement('header')`,
`getPartElement('body')` and `getPartElement('pager')`. Row
and cell elements are `null` outside the rendered window: call
`scrollToRow` first, or read the data with `getRow`.

`api.engine` is the core engine behind the grid. Custom renderers read
`engine.getCellSnapshot(rowId, columnId)` and subscribe to one cell or one
row with `engine.subscribeCell` / `engine.subscribeRow`; the listener runs
only when that cell or row changes, never for the rest of the grid.

Every state change is a plain, serializable command (`{ type: 'sort.set',
... }`). `engine.dispatch(command)` applies one and returns a result;
`engine.onCommand` reports each applied command, so a test or a support
tool can record a session and replay it on another grid. The demo
records sorting and the custom module's command, resets the grid and
replays them. For development tooling, the initial-only `recordCommands`
prop keeps that log in the engine (`api.engine.getCommandLog()`), and
`instrument` exposes store counters (`api.engine.getInstrumentation()`);
both are off by default and cost nothing then.

Features need no registration: a feature is on when its prop is
set, and the grid loads its code on demand, so only the features in use
are downloaded. To bundle feature code with the page instead of
loading it later, pass it to the optional `features` prop (see
[Performance](/docs/data-grid/performance#what-a-grid-downloads)).
`modules` adds extra core modules for custom features. The demo's `minAmount` module declares one
command (`minAmount.set`) and a `filter` stage of the query pipeline.

Unmounting `DataGrid` releases everything it created. An engine created
outside `DataGrid`
with `createDataGridEngine` belongs to its owner, who calls `dispose()`; a
disposed engine stops notifying and rejects further commands.

<!-- demo: grid-internals -->

## API reference

[`DataGridApi`](/docs/reference/data-grid/DataGridApi) lists every
method, [`DataGridKeyDownContext`](/docs/reference/data-grid/DataGridKeyDownContext)
the key hook context, and
[`DataGridEngine`](/docs/reference/data-grid/engine/DataGridEngine) the core
engine.
