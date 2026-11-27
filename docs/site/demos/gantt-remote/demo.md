---
title: Gantt remote data
description: Tasks from a controlled data source with skeleton rows while the first read is slow, writes that apply or are rejected and reverted, a local array that is replaced through the data prop and whose wave loads its children on expand, onViewChange and the loading spinner.
category: calendars
---

The first read takes about a second: both panes show skeleton rows at the
same height (`loadingIndicator="skeleton"`). Drag a taskbar: the change is
written through the source (the log shows the write); tick "Server rejects
writes" and drag again to see it revert with `onError`. "Switch to a local
array" remounts the Gantt on an array (a source and an array are different
data modes); there, "Replace the array" passes a new array and both panes
follow (the grid reports `onViewChange`). In the local array, expand "Wave 1 (loads on expand)": its children are
requested on expand (`hasChildrenField`, `loadChildren`) and a skeleton row
fills the gap in both panes until they arrive. "setLoading" shows the
loading indicator from code.
