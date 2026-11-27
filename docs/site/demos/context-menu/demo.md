---
title: Context menu
description: Right-click (or Shift+F10) a header, cell or the pager over 5,000 rows with a pinned column; the default per-target menus or a custom list with built-ins, a submenu and a custom action; per-target items and cancelation in `onBeforeContextMenuOpen`; disabled export items with a reason.
---

Select several rows, then choose "Flag or unflag rows" on one of them: the
action receives the whole selection. CSV export has a handler; PDF export
and Copy do not, so they are disabled with the reason as their tooltip.
