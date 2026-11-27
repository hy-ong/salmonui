---
title: Performance
description: What the grid re-renders, how to observe it in development, and the budgets that gate every release.
category: Performance
order: 35
demos: [render-counts]
---

Performance comes first in Salmon UI: every performance
budget is a release gate, asserted on a
developer or reference machine by `npm run release:verify` (there is no
hosted CI), and a behavior that cannot meet one ships opt-in or not at
all. Virtualization,
scaled scrolling and the server-rendered range are on the
[virtualization](/docs/data-grid/virtualization) page; this page covers what one
interaction re-renders.

## Compiled columns

Columns compile once per stable definition identity (Structural
Budgets, "Column compile count for a stable `columns` prop identity": 1 for
the component lifetime). Keep `columns` at module scope or in a memo: a
parent re-render then passes the same identity, and the grid re-renders no
header and no cell. Reactive fields (`hidden`, numeric `width`, `pinned`,
order) are applied as runtime state when they change, and a changed
definition recompiles only that column. The compile count itself is gated
by the core unit test that reads `engine.getInstrumentation()`
(`createDataGridEngine({ instrument: true })`); on `DataGrid`, the initial-only
`instrument` prop does the same (`api.engine.getInstrumentation()`), and
leaving it off costs nothing.

## One million local rows

A `data` array of 1,000,000 rows needs no special mode.
Two budgets gate it: the client mount to the first painted viewport
of the 1M × 20 `million` fixture takes at most 500 ms in a production
build, and engine creation plus the first viewport read at most 500 ms and
10 ms. Rows are never copied or wrapped, and only the rendered window is
read. The [One million rows demo](/demos/data-grid/million-rows) on the
[virtualization](/docs/data-grid/virtualization) page mounts that data set and
scrolls it end to end.

## Selection and focus

Data Grid state lives in the core engine store; React components subscribe to
narrow slices. Moving the focus re-renders at most the old and the new cell
(the demo's arrow-key moves commit nothing at all), and toggling one row's
selection re-renders that row's cells plus the select-all header cell,
never the rest of the grid (Structural Budgets, "Cells re-rendered
on focus move" ≤ 2 and "Cells re-rendered on single-row selection toggle").
The selection toggle itself is O(1) in the core (Timing Budgets,
Interaction).

## What a grid downloads

A grid downloads only the features its props turn on. A plain
`<DataGrid data columns />` loads the base grid (rendering, virtualization,
sorting, filtering, selection, keyboard), which the Minimal app budget
(Bundle Budgets) caps at 110 KB gzip of initial JS with React and React DOM
excluded. Setting `grouping`, `paging`, `search`,
`toolbar`, `aggregates`, `renderDetail` or `childGrid`, a lookup column, and
the other feature props loads that feature's code on demand; each one has
its own size budget.

- Server rendering is unchanged: the server has every feature's code, so the
  HTML is complete, and hydration keeps it on screen until the browser has
  loaded the features it needs.
- A grid rendered only in the browser shows a placeholder of its own size
  (`aria-busy`) for that one download.
- Editors, menus, dialogs, export and print load later, on first use.

To skip the wait, pass the features to the optional `features` prop. It
bundles them with your page; it does not enable anything, so the feature
props are still required:

```tsx
import { grouping, paging } from '@salmonui/data-grid/features';

<DataGrid data={orders} columns={columns} grouping paging features={[grouping, paging]} />;
```

Leaving `features` out never disables a feature; the feature's code is then
loaded on demand instead.

## Observing renders in development

Development builds call `globalThis.__SALMON_UI_DEVTOOLS__.onCommit(commit)`
after every grid commit with the re-rendered cell, row and header ids
(`DataGridDevtoolsCommit`); production builds never reference the hook. The
demo installs it in an effect and shows the totals since the last reset in
a separate component, so counting never re-renders the grid.

<!-- demo: render-counts -->

## API

`instrument`, `recordCommands` and `features` are on
[`DataGridProps`](/docs/reference/data-grid/DataGridProps); the
feature values come from
[`@salmonui/data-grid/features`](/docs/reference/data-grid/features).
