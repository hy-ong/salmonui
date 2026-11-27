---
title: Server rendering cost
description: Runs React's renderToString in the browser over 100 Buttons and a closed MenuButton with 100 and 1,000 items, showing the time per render and that the closed menu's markup does not grow with its items.
category: buttons
---

The measurement loads `react-dom/server` on demand and renders the same trees
the SSR budgets gate in Node: 100 `Button`s (5 ms) and a closed `MenuButton`
with 1,000 items (2 ms). Browser timings vary with the machine and are slower
in development builds; the character counts show that a closed menu renders
only its trigger, whatever its item count.
