---
title: Toolbar overflow
description: One toolbar switching between overflow into a menu, a scrolling strip and extra rows, with a priority item and an item that always lives in the menu.
category: navigation
---

Narrow the toolbar: in `menu` mode the last items move into the menu behind
the "more" button (**Find** has a higher `overflowPriority` and stays
longer, **Settings** is always there). Choosing an entry runs the hidden
button's own `onClick`.
