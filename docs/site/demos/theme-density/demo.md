---
title: Theme density
description: The same buttons, text field, select, date picker, tabs and Data Grid under density default and compact side by side, with the measured control, row and header heights.
---

Each column is its own `ThemeProvider` scope with one setting,
`density`. The `md` button and field are 32px tall at `default` and 28px
at `compact`; the grid rows are 36px and 32px and the header 40px and
36px, with 13px cell text at `compact`. `size` still picks `sm`, `md` or
`lg` inside either density. The line under each column reads the
rendered heights.
