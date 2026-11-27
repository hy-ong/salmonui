---
title: Nested sidebar menu
description: Three levels of controlled submenus with expand-all and collapse-all buttons, badges, a disabled link, an action item and an event log.
category: navigation
---

`expanded` is controlled here: the buttons replace the open ids, and every
toggle (pointer, keyboard, or the browser's find-in-page revealing a closed
submenu) arrives in `onExpandedChange`. Try the keyboard: Tab visits every
link and button, Up and Down move between visible items, Right opens a
submenu or enters it, Left closes it or returns to its parent. **Archive**
is disabled and skipped; **Sign out** has no `href`, so it is a button.
