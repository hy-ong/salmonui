---
title: Gantt baselines, labels and templates
description: A conference plan with planned baselines and a baseline template, owner and progress labels, an indicator, taskbar, baseline and connector tooltips, custom taskbar, parent and milestone templates, per-task taskbar props, row and taskbar heights and root class and style.
category: calendars
---

Each task shows its planned dates as a baseline bar under the taskbar,
drawn by `renderBaseline`; Ticket sales runs past its plan. Labels put the
owner before the bar, the title inside it and the progress after it. The
speaker lineup carries an indicator on 12 May (hover it for its tooltip)
and a red outline from `getTaskbarProps` because its `risk` is high; every
bar gets `data-risk`. Hover a taskbar, a baseline or a connector for its
tooltip (`onBeforeTooltipOpen` reports the kind). Untick "Custom taskbar
templates" for the built-in bars, summary bar and diamond milestone: their
parts (`.salmon-gantt__taskbar`, `__progress`, `__summary`, `__milestone`,
`__baseline`, `__connector`) take their colors from the theme seeds. The
row height select changes the row and taskbar heights in both panes.
