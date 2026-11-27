---
title: Pinned columns and sticky rows
description: Columns pinned to the start or end, or fixed in place (`pinned: 'center'`), by definition, by the reactive `pinnedColumns` count or at runtime from the column menu, Alt+Shift+Arrow keys and `api.pinColumn`, plus `stickyRows` and `stickyBottomRows` over 2,000 virtualized rows.
---

Order is pinned to the start and Amount to the end in the column
definitions, and Product is fixed (`pinned: 'center'`): scroll right and it
travels with its slot, then stays after Order while the other columns scroll
beneath it. Drag a header to reorder it: a column never leaves its zone.
