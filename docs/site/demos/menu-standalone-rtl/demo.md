---
title: Standalone menu and RTL menus
description: A Menu rendered in place without a button, and a MenuButton with a submenu inside a right-to-left container whose popup and submenu mirror.
category: buttons
---

The **Account** menu is a `Menu` in the page: one tab stop, then arrow keys,
typeahead and ArrowRight into **Theme**, with `onAction` as on a
`MenuButton`. In the right-to-left container, the popup of **ملف** aligns to
its right edge (`bottom-start` is logical) and ArrowLeft opens the
**تصدير** submenu on the left side.
