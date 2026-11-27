---
title: Drill through with editing
description: Double-click a value cell or press Enter on it to open its raw rows in a DataGrid dialog; edits, additions and deletions write through and re-aggregate the pivot.
category: pivot-table
---

The dialog lists at most 50 rows (`drillThrough={{ maxRows: 50 }}`) and has
a column chooser. Edit an amount and save: `onDataChange` returns the new
raw rows, the demo stores them as its `data`, and the pivot re-aggregates
without a full recompute.
