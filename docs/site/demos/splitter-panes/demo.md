---
title: Splitter panes, collapse and events
description: An editor Splitter built from a panes array, with a fixed-width tool column, a collapsible outline whose collapse can be vetoed, an inspector collapsed through its controlled prop, a disabled switch, right-to-left and an event log.
category: layout
---

The Tools pane is `resizable={false}` and its separator does not move.
Focus the separator after Outline and press Enter to collapse it; check
"Lock the outline" first and `preventDefault()` vetoes the request. The
inspector button flips the inspector's controlled `collapsed` prop, so
code collapses and expands a pane by changing state. "Disabled" makes
every separator inert, and "Right to left" mirrors the panes, the pointer
and the arrow keys.
