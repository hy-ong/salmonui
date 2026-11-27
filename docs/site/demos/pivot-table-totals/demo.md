---
title: Totals, values placement and empty members
description: Grand totals and subtotals with their positions, measures on rows or columns at any level, the value header, empty members and the empty cell text, all from pivotModel.
category: pivot-table
---

Every control writes one field of the report model: `totals` (`grand`,
`grandPosition`, `sub`, `subPosition`), `valuesPlacement` (`axis`,
`index`), `showValueHeader` and `showEmptyMembers`. `emptyCellText` is a
`PivotTable` prop.

The data is sparse: India has no 2024 sales and Brazil none in 2026, so
those cells show the empty cell text. "Show empty members" lists every
country under every region. Turn "Two measures" off and "Value header with
one measure" on to keep the value header level for the single measure.
