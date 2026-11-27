---
title: Tree data sources
description: One catalog tree over five data sources - an offline source that loads once, a controlled source that answers each read by parentRowId with paged roots, nested envelopes that load whole subtrees, the @salmonui/data JSON source over the reference server handler with server filtering and aggregates, and infinite scroll over blocks of root rows with skeleton rows.
---

The event log lists every read. Offline loads once and then works locally.
Controlled receives `request.parentRowId` for the roots (`null`, paged with
`pageBy: 'root'`) and for each expanded row; nested envelopes return whole
subtrees, so no child reads follow. The server source sends the query with
root and child reads: a filter or search returns the matches with their
ancestors, and the footer sum is a server aggregate over every depth.
Infinite scroll starts collapsed, reads blocks of 50 roots, shows a skeleton
row while a parent's children load, and keeps selection by id and cell edits
across blocks.
