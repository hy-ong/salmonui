---
title: Menubar
description: An editor Menubar with File, Edit and View menus, an icon label, shortcut hints in entries, a submenu with an adjustable hover delay, a checkable item, a top-level command and a scrolling bar in a narrow container.
category: navigation
---

Tab to the bar, then use ArrowLeft / ArrowRight, ArrowDown to open a menu,
and ArrowLeft / ArrowRight inside a menu to move to the next one. With a
menu open, moving the pointer across the bar opens the menu under it.

**Submenu hover delay** sets `hoverDelay` (default 200 ms): hover
**Open recent** in the File menu and the submenu opens only after that
delay. The File label carries an `icon`, and the Edit entries show their
shortcut next to the text: labels and entries are any `ReactNode`.
