---
title: Filter menus
description: Menu, checklist and Excel filter UIs with typed value editors, a per-column UI and operator list, a custom menu editor, a custom filter comparer, checklist search, Select All, blanks and counts, and a checklist that loads 50 values at a time, plus the filter menu open events with a cancellable before-event.
---

Switch the grid-wide UI with the select; Country always uses the checklist.

The event log shows `onBeforeFilterMenuOpen` / `onFilterMenuOpen` for every
opening; tick "Cancel the Note filter menu" to prevent the Note menu.

The Customer column has a `filterComparator` that ignores case, spaces and
hyphens: filter it with "baonguyen" to find "Bao Nguyen".
