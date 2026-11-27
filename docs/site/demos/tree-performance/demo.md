---
title: Tree performance
description: Generate the 50,000-row or the 1,000,000-row benchmark tree and read the measured time of grid creation, expand and collapse, a 100,000-row cascade, sibling sort, an ancestors filter, indent and outdent next to the tree mode release budgets.
---

Nothing is timed on the server or on load: the page renders a 36-row
preview of the same generator (depth 3) so the tree is visible before a
run. Pick a fixture and press "Generate and measure": the demo builds the
rows of the benchmark fixture (the `hierarchy` tree of 50,000 rows, depth
4, or `tree-large` of 1,000,000 rows, depth 6, flat `parentId`, the same
generator and seed), mounts a fully expanded `DataGrid` in tree mode and
runs each step through the public API, replacing the preview. Row
generation is app work and is excluded from every timing.

Engine steps time the API call plus the snapshot read that computes the
view (`api.engine.getSnapshot()`), without React rendering: collapse and
expand all, one branch, a cascade check of root `t0` (about 100,000
descendants on `tree-large`), sibling sort on a number column and a
`contains` filter with `filterMode: 'ancestors'`. The first sort extracts
its keys (cold); the later ones reuse them (warm). Indent and outdent are
timed to painted: the call runs at the start of a frame and the end marker
is a task after that frame's rendering. Grid creation is timed from the
data change to `onReady`.

Each budget is defined on one fixture, as in the Tree mode section of the
performance architecture notes; a time measured on the other fixture is
shown for reference. The cold sort and filter budgets compare with the same
query on a flat grid, which this demo does not run. The budgets are gated
on reference hardware by `npm run release:verify`; your browser in
development mode will be slower. The bundle budget of tree mode
is verified by `npm run bundle:check`, not by a demo.
