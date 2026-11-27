---
title: Member, label and value filters
description: Include and exclude member filters, label and value (top N) filters from code and the member editor, a 2,500-member virtualized list, and the cancellable filter and member editor events.
category: pivot-table
---

The buttons call `pivot.setFilter('country', filter)` with each filter
shape: `{ include }`, `{ exclude }`, `{ label: { operator: 'contains' } }`
and `{ value: { measure, operator: 'top' | 'greaterThan', value } }`.

The filter icon of a field on the axis bar opens the member editor:
search, select all, include or exclude members, or switch to the label
and value filter tabs. The Customer filter field has 2,500 members; the
list is virtualized, so it opens without a node limit.

The log shows `onBeforeFilterChange` and `onFilterChange` with the
input that caused them. With "Refuse the Product member editor" on,
`onBeforeMemberEditorOpen` calls `preventDefault()` for that field.
