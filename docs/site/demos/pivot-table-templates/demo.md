---
title: Cell templates and conditional formats
description: Custom value and header content, a hyperlink row header handled by onCellClick, class names per cell, tooltips, conditional format tones and box cell selection.
category: pivot-table
---

Grand total cells render bold through `renderCell`; country headers are
links through `renderHeader`, and `onCellClick` reports the click. Amounts
of 3,000 or more use the success tone and amounts under 1,800 the danger
tone (`pivotModel.conditionalFormats`). Drag or Shift+click to select a
range of cells.
