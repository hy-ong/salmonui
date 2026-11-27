---
title: Tabs
description: Controlled Tabs with an icon tab, a disabled tab, a tab that onBeforeValueChange refuses, and a placement switch (top, bottom, start, end).
category: navigation
---

Click a tab or focus the list and use the arrow keys (Up and Down when the
list is vertical), Home and End. **Locked** never becomes selected because
`onBeforeValueChange` calls `preventDefault()`.
