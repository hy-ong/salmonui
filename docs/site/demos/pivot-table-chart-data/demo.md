---
title: Pivot chart
description: Chart composed with PivotTable through usePivotChartProps; point clicks drill down and through, the chart type and the table / chart / both view are app state, and the PDF export carries the table and the chart.
category: pivot-table
---

One store feeds both parts: one series per column member and one category
per visible row member. Clicking a region column expands that region in
the table and the chart follows; clicking a country column opens drill
through for that cell. "Export PDF" passes `pivotChartImage(chartRef)` to
`exportToPdf({ chart })`, so the chart is a page after the table.
