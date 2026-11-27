---
title: Tree expansion state
description: Flat ticket rows with initial expansion from a data field, reactive expandedRows overrides, expansion saved with persistState and getState / restoreState, an orphan and a parent cycle shown as roots, shared grid events, and tree mode winning over a grouping prop.
---

`tree.expandedField: 'open'` sets the initial expansion from the data and
`tree.expandedRows` overrides it per row from React state. `persistState`
saves the grid state, the tree expansion included, so a reload restores it;
the Save and Restore buttons do the same through `getState()` and
`restoreState()`. Check "Add an orphan and a cycle": T-9 names a missing parent and T-10 / T-11 form a cycle:
both become roots (development builds also warn). Sorting and selection
report the same events as in a flat grid, and a `grouping` prop passed next
to `tree` is ignored.
