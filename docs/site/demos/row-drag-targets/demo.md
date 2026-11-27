---
title: Drop targets and persisted order
description: A ranked list whose drops write new rank values through dataSource.write, and an inbox whose rows drop onto a custom archive element.
---

Drag a task by its grip: the log shows the one write with the moved rows
and the rank values the drop assigned. Drag an inbox row onto the archive
box: the grid moves nothing and `onRowDrop` hands the rows and the target
element to the app.
