---
title: Dropdowns over 100,000 items
description: Select, Combobox, Select multiple with select all and the Combobox columns popup over 100,000 local items, plus twenty closed Selects sharing the same data.
category: dropdowns
---

Every dropdown here holds 100,000 items. Open a popup and scroll it fast,
hold an arrow key, or press Page Down: only the options in view plus a small
overscan are in the DOM, and each option carries `aria-setsize="100000"` and
its `aria-posinset`, so a screen reader reads "Axle 000001, 1 of 100,000".
Type in the Combobox or the Select search field: each keystroke filters all
100,000 labels, and a polite live region announces the result count. "Select
all" in the third dropdown selects every item at once; the trigger shows the
count. The columns popup renders five columns over the same rows.

The twenty closed Selects under "Twenty closed Selects" share the array: a
closed dropdown renders its trigger and value label only and adds no
document listeners, observers or timers until it opens.

The budgets these interactions are gated on (open ≤ 50 ms, one filter step
≤ 8 ms, select all ≤ 20 ms, and more) are listed on the
[accessibility and performance](/docs/dropdowns/dropdown-accessibility#performance)
page and measured by `npm run release:verify`.
