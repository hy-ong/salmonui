---
title: MultiColumn ComboBox templates and remote rows
description: Cell and header templates, per-cell props, a taller fixed row height, a reactive initial sort, row keyboard navigation with grid ARIA, and range reads over 100,000 remote rows.
category: dropdowns
---

The product popup draws two-line names with `renderCell`, an abbreviated
"Stock" header with `renderHeader`, and marks low stock through `cellProps`.
Every row is 44 px tall (`rowHeight`). It opens sorted by price
(`sorting.sortBy`); the buttons change the sort while it is closed or open.

Keys: Arrow Down / Up move by row (there is no cell navigation), Home / End
move the caret in the input (the editable-combobox rule), Enter picks the row, Escape and Alt+Up close, Tab and Shift+Tab close and
move focus. The input has `aria-haspopup="grid"` and `aria-activedescendant`
on the active `row`; rows carry `aria-selected` and `aria-rowindex`.

The order popup reads a remote source of 100,000 rows in ranges as you
scroll or drag the scrollbar (see the log); it never loads the whole table.
