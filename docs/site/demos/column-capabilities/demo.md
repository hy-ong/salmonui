---
title: Column capabilities, locked and identity columns
description: Sorting, filtering, search, grouping, editing, resizing and reordering on for the grid and turned off per column with `sortable`, `filterable`, `searchable`, `groupable`, `editable`, `resizable` and `reorderable`; a `lockPosition` first column and an `identity` key column.
---

Each header names the capability its column turns off. Search for a
customer name: Customer is not searchable, so nothing matches. Focus the
Country header and press Alt+ArrowLeft repeatedly: it stops after Customer,
because nothing can move before the locked Order column. Double-click a row:
Order (identity) and Product (`editable: false`) stay read-only.
