---
title: Tree templates
description: An org chart in DataGrid tree mode with a tree column cell template that reads ctx.tree, row props and classes per depth, a row template that keeps the toggle, detail rows that follow their tree row, row spans inside each parent, and grid lines and alternate rows.
---

The Unit cell template renders after the expand toggle and reads `ctx.tree`
(depth, children, expansion). `getRowProps` receives the same context, so
roots are bold and every row gets a title naming its level. The Site column
merges equal neighbouring values, but a merge never leaves its parent's
subtree: the Web team's Berlin cell ends at Operations, which is in Berlin
too. Turn on
the row template to wrap each row in `DataGridRow`: the tree toggle,
keyboard and ARIA attributes stay as they were.
