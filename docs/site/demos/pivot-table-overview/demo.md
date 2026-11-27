---
title: Pivot Table overview
description: One usePivot store drives a PivotToolbar, a PivotAxisBar, the PivotTable and a standalone PivotFieldList that stay in sync without handlers.
category: pivot-table
---

Every part reads the same `PivotController`, so dragging a field in the
field list, a field button on the axis bar or a toolbar command updates all
of them. The log lists `onPivotModelChange` actions. The table renders on
the server with the default report; menus and dialogs load on first open.
