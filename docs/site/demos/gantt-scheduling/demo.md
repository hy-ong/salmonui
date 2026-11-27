---
title: Gantt scheduling and dependencies
description: A warehouse fit-out on mapped fields with finish-to-start, start-to-start and finish-to-finish links with lags, the critical path and total float, auto and manual task modes, a constraint, an unscheduled task, the conflict dialog, project dates, durations, WBS codes and serial numbers.
category: calendars
---

The rows use `TaskID`, `Name`, `Parent`, `Begin`, `Days`, `Done`, `Deps`,
`Manual`, `Constraint` and `ConstraintOn`; `taskFields` maps them. Only
Permits has a start: every other date is derived from the links (`2FS`,
`3FS+2d`, `3SS+1d`, `4FS,5FF`) on working days, and the parent bar rolls
up its children. The inspection cannot start before 26 April
(`startNoEarlierThan`). Critical bars and connectors are marked; untick
"Critical path" to hide them. The opening party links to the parent task itself
(`parentDependencies`). Drag Plumbing two days later: its `3SS+1d` lag
becomes `3SS+3d` (`dependencyLag.updateOnTaskbarEdit`). Racking has manual dates (task mode
`custom` with the `Manual` field); with "Validate manual successors" its
link moves it too. Signage has no dates and is drawn as an unscheduled
placeholder. Drag Electrical before the end of Demolition: the conflict
dialog offers to move the task, remove the link or cancel (untick
"Conflict dialog" to move it at once through `onScheduleConflict`). Untick
"Auto schedule" to keep the data dates. The serial number, WBS and WBS
predecessor columns are presets.
