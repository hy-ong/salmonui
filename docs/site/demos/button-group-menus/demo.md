---
title: Button groups with menus and RTL
description: A MenuButton and a SplitButton inside a ButtonGroup, a SplitButton in a vertical group, and a toggle group and a button group inside a right-to-left container.
category: buttons
---

The group's `variant` applies to the nested `MenuButton` and `SplitButton`
too. The vertical group stacks a `SplitButton` with plain buttons. In the
right-to-left container both groups inherit `dir`: their order, joined
corners and menu placement mirror without any extra prop, and in the toggle
group ArrowLeft moves to the next item.
