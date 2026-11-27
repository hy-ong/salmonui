---
title: Column types, ids and reading methods
description: Columns without `type` infer it from the first non-null value, ids resolve from `id`, then `field`, then a generated id with a warning, the same columns work as an array or as `<DataGridColumn>` children, text that looks like markup stays text, a function template renders rich content, and the column reading methods report ids and visible positions.
---

Press Read columns to list `api.getColumns()`. Switch the column form: the
compiled columns, their ids and inferred types stay the same. Hide Qty and
read again: `getColumnIndex('quantity')` becomes -1 and the visible
positions shift.
