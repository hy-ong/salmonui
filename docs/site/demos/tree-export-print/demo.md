---
title: Tree export, print and copy
description: A bill of materials in tree mode exported to Excel with outline levels, CSV with a depth column and PDF with indentation, either the expanded rows or every row, a server export of the same tree and state, print with indentation, and copy that adds ancestors or descendants.
---

Exports write the tree in visible pre-order. "Expanded" writes the rows you
see; "All" writes every row, and the Excel file keeps parents that are
collapsed in the grid collapsed in its outline (`outlineCollapsed`). The
server export runs `exportToResponse` from `@salmonui/data-grid/engine/export-server`
with the same `tree` options and the grid state, so its file matches the
client export; this static site runs it in the browser tab. Copy widens the
selected rows by `tree.copyMode`.
