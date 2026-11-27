---
title: Menu open state, keyboard and ARIA
description: A controlled MenuButton that logs every onOpenChange reason and source, can veto closing on an outside press, and reads back the trigger's ARIA and data attributes and the menu markup in the page.
category: buttons
---

Try the keys on **Fruit**: Enter, Space or ArrowDown open on the first item
and ArrowUp on the last; in the menu, arrows wrap and skip the separator and
the disabled **Durian**, Home / End jump to the ends, and typing "b" then "l"
quickly moves to **Blackberry**. Escape closes and refocuses the trigger, Tab
closes and moves on, and a press outside closes it unless **Keep open on
outside press** is checked: the controlled `open` then ignores that close, so
the menu stays open.

The readout is read from the DOM after each change: the trigger's
`aria-expanded`, `aria-controls` and `data-open`, the popup's role and label,
the roles inside it, and how many menus for this trigger exist in the page.
That count is zero while the menu is closed, because the popup is created
only when it opens.
