---
title: Keyboard, localization and right to left
description: The treegrid, axis bar toolbars, field list and dialogs by keyboard, localeText with an Intl locale, right-to-left layout, and full-screen sheets on small screens.
category: pivot-table
---

The table is a `treegrid` (compact layout): Tab moves into it, the
arrow keys move between cells, Enter or Space on a row header drills
down and up, and Enter on a value cell opens its raw rows in a dialog
that returns focus on close. The axis bar is one `toolbar` per axis
with roving focus; Enter opens a field's menu, Alt+ArrowUp and
Alt+ArrowDown reorder, Delete removes.

"French" passes a partial `localeText` catalog (keys left out keep the
English default) and `locale="fr-FR"`, which formats numbers and
currency through `Intl`. "Right to left" sets `dir="rtl"` on a wrapper:
the parts use logical properties, so the row headers, menus and
arrow keys follow.

Below 640 px the field list popup and every pivot dialog become
full-screen sheets: narrow the window, or open this page on a phone, and
press Field list.
