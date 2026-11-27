---
title: Gantt timeline and zoom
description: Hour to year timeline modes and custom month-over-fortnight tiers with a cell template, unit width and Monday week start, zoom in and out, zoom to fit, an infinite timeline, scroll to a date or task, event markers, the splitter and panes, and a pattern date format.
category: calendars
---

Pick a timeline mode (the tier presets; `timeline.renderCell` draws the
top tier in bold) or "custom tiers" for months over two-week cells rendered
by a tier `render` function; hover a tier cell for its full date. The unit width slider sets the bottom tier cell width and
weeks start on Monday. Zoom with the buttons, Ctrl+wheel over the chart or
Ctrl+Plus / Ctrl+Minus; `zoomToFit()` picks the level that shows the whole
project. Scroll to an edge of the chart, or press `extendTimeline('end')`,
and the range grows (`timeline.infinite`). `scrollToDate` and
`scrollToTask` bring a date or a task into view. Two markers label
the funding review and the marketing launch. Drag the splitter, set it to
30 % from code, or show one pane only. The grid's dates use the
`dd.MM.yyyy` pattern.
