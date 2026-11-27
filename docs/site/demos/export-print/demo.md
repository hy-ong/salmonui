---
title: Export and print
description: Excel, PDF and CSV export of 10,000 grouped rows with stacked headers, aggregates, lookup text, templates, hidden columns, selected rows, detail blocks, a second grid in the same workbook, an embedded PDF font and a server export route; writers load on demand; print of every row of the scope.
---

The toolbar and the cell context menu run the built-in export and print
commands. The Excel and PDF writers download only when first used; watch the
network panel. Focus a cell and press Ctrl+P (Cmd+P) to print the grid.

The second button row shows the export options: select rows with Ctrl or
Shift click and export only them, add the hidden Note column, give the
templated Status column its text and an image, write detail blocks, put
both grids into one workbook, pick a `.ttf` file to embed it in the PDF, or
let the `/api/export` endpoint (`docs/site/lib/demo-api.ts`: a Next.js
route handler on a server, the browser tab on the static site) build the
same view from `getState()`. The Targets grid merges repeated regions and
writes a formula.
