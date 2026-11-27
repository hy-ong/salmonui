---
title: Field list with deferred update
description: A standalone PivotFieldList with folders, sorted fields, search, a hidden field and deferUpdate, where moves edit a draft model until Apply.
category: pivot-table
---

With "Defer layout update" on, checking fields, dragging them between axes
or using the "Move to" menu changes the draft only; the table updates on
Apply and Cancel discards the draft. `onBeforeFieldMove` keeps the last
value field from being removed, and the status line shows `onFieldMove`.
The Values item in an axis list moves the measure headers between columns
and rows.
