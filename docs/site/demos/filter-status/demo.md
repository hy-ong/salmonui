---
title: Filter status and filtered rows
description: The pager's filter status message for the filter row (on by default, switchable with filtering.showStatus) and getFilteredRows() reading the filtered rows across every page.
---

The pager lists the applied filters under its controls, including the
initial ones in the server render. "Read filtered rows" calls
`getFilteredRows()`, which returns every row that passes the filters in sort
order, not just the current page.
