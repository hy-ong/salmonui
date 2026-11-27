---
title: Data binding and the report model
description: CSV text parsed with parseCsv into the data prop, field definitions with captions, folders and per-field capabilities, a controlled pivotModel, data replacement, refresh and the result API.
category: pivot-table
---

Edit the CSV and press "Parse CSV": `parseCsv()` turns it into raw rows
that `data` reads by reference. "Add a 2026 Japan bike sale" replaces
`data` with one appended row, which re-aggregates incrementally; "Refresh"
calls `api.refresh()`.

The report model is controlled: `pivotModel` comes from app state and
`onPivotModelChange` writes it back, so the status line follows every drag
in the axis bar. `onBeforePivotModelChange` refuses any change that takes
Region off the rows. The field definitions give captions, folders in the
field list, a hidden `id` field, and per-field flags: Region cannot be
removed or dragged, Year cannot be sorted, Units cannot be filtered.

"Read result" reads the computed matrix through `api.getResult()`
(`rowCount`, `memberAt()`, `cellAt()`).
