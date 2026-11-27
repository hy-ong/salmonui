---
title: ListView icons, item attributes and single selection
description: A folder Listbox with item icons, per-item class, title and data attributes, single selection with a change log, a fixed height in items, a disabled switch and right-to-left.
category: layout
---

`getItemIcon` replaces `fields.iconCss`; `getItemProps` adds a class, a
`title` and a `data-unread` attribute to folders with unread mail (the
count is drawn from that attribute). Click a folder or focus the list and
use the arrow keys, Home / End and type-ahead: selection follows focus and
`onValueChange` reports the reason, the source and the item. The list shows
five items (`maxVisibleItems`) and is 240 px wide (`style`). "Disabled"
takes it out of the tab order; "Right to left" mirrors it.
