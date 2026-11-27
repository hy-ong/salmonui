---
title: Large Gantt projects
description: A deterministic 5,000-task project with chained dependencies, rows and timeline cells virtualized in both panes, server-rendered initial rows, a timed critical path toggle, a reschedule of every successor and a scroll to the last task.
category: calendars
---

Scroll vertically: the grid and the chart render only the rows in view and
move together; "Count rendered chart rows" shows how few are in the DOM.
Scroll the timeline horizontally across the months: tier cells, weekend
shading and connectors are virtualized too. "Lengthen the first task"
reschedules every successor of the chain, and the critical path toggle runs
a forward and backward pass over all 5,000 tasks; the status line shows the
time to the next frame. View the page source: the first rows and the first
timeline window are in the server HTML (`timeZone` is set), and the page
hydrates without warnings.
