---
title: Resource grouping options
description: Rooms and the people in them as grouped columns, dates above resources, every person under every room, shared events, custom resource headers and tooltips, people added and removed through the prop, per-person work days, a timeline work week with week, date and hour header rows, and a six-month year view.
category: calendars
---

The work week is grouped by room, then by the people of that room
(`parentId`). Tick "Dates above resources" to put the days on top
(`byDate`), or "Everyone under every room" to drop the parent rule
(`byParent: false`). "All hands" belongs to Ana and Chen: with shared
events, selecting one copy selects both. Hover a person's heading for the
role tooltip (`renderResourceTooltip`); room headings are bold
(`renderResourceHeader`). "Add Dana" and "Remove Dana" change the
`resources` prop and the columns follow; `getResources()` lists the items.
Ben works Monday to Wednesday and Chen Tuesday to Friday: "Hide each
person's days off" removes their other days. Timeline work week has three
header rows (week, date, hour, the week row rendered in italics) and Year
shows September to February (`firstMonthOfYear: 9`, `monthCount: 6`).
