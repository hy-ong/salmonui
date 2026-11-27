---
title: Export and print
description: Download a chart as PNG, JPEG, SVG, CSV, XLSX or a vector PDF, print it, read it as a data URL, blob or SVG string, and combine two charts into one image or PDF page.
category: data-visualization
---

The first row calls `api.export({ format, fileName })` on the revenue
chart: images, the accessible table as CSV, XLSX through
`exportWriters.xlsx`, and a vector PDF page through `exportWriters.pdf`
(both loaders import `@salmonui/export` on first use), plus
`api.print()`.

The second row shows `api.toDataURL('png')` as a preview image,
`api.toBlob('svg')` and the synchronous `api.toSVGString()`, and
`exportVisualizations([revenue, margin], options)` from
`@salmonui/charts/chart/export`, which stacks both charts into one PNG or
places them side by side on one PDF page.
