---
title: Tree drag to other targets
description: Rows of a nested backlog tree dragged into another tree grid (before, after or into a row) or onto a custom archive element, with each parent's subtree travelling along in the drop payload.
---

`rowDrag.targetId` names the drop target: the sprint grid's `id`, or the
archive element's `id`. A parent takes its whole subtree into the sprint
tree, and a drop on the archive passes the rows with their descendants in
`onRowDrop`'s `rows()`, so the application decides what happens.
