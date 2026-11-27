---
title: Long menu
description: A MenuButton with 100 or 1,000 items (menus are not virtualized), showing the time from the open request to the first frame with the menu.
category: buttons
---

Open **Assign to customer** with 1,000 items: the readout shows the time from
the open request to the next frame (the budget is 100 ms for 1,000 items and
50 ms for 100; it varies with the machine and is slower in development
builds). Then hold ArrowDown or type "Customer 05" to see that highlight moves
and typeahead do not re-render the list. For long lists people pick a value
from, use a Listbox instead.
