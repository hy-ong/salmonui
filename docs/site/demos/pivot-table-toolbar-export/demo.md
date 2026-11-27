---
title: Toolbar, export and saved reports
description: The built-in toolbar items plus a custom item, Excel, CSV and PDF export and print with cancellable export events, a saved report list over getState and restoreState, and persistState.
category: pivot-table
---

The `toolbar` prop lists built-in items (field list, totals menus,
subtotals and grand totals, formatting, export, expand and collapse all)
and one custom item, "New report", with its own `onClick`. The export
menu and the buttons above call `api.exportToExcel()`,
`api.exportToCsv()`, `api.exportToPdf()` and `api.print()`; Excel and PDF
load the writers of `@salmonui/export/pivot` on first use
(`exportWriters`), CSV and print need none. The log shows `onExport`;
with "Cancel exports" on, `onBeforeExport` cancels them.

The report bar is the report management recipe: Save stores
`api.getState()` under a name, Load passes it to `api.restoreState()`,
Rename and Delete edit the list. A real app keeps the list in its own
storage.

`persistState={{ id: 'docs-toolbar-export', version: '1' }}` saves the
model in `localStorage` on every change: change the report and reload
the page to see it restored.
