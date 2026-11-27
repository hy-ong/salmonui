---
title: Performance with a million rows
description: Generate up to 1,000,000 raw rows and read the measured engine time of the aggregation, a sort, a filter and a drill next to the release budgets; averages stay exact under pre-aggregation; paging is opt-in.
category: pivot-table
---

The table starts with 20,000 generated rows. Pick 1,000,000 and press
"Generate and aggregate": the data prop is replaced and the engine
re-aggregates. Each line of the timing table is the `duration` of one
`onComputeEnd` event: the engine work, without row generation and
rendering. Sort, filter and drill time their commands the same way.

The budgets are the release gates of the Performance section of the
pivot architecture notes, measured by the benchmark on reference
hardware with the engine in a Worker; this demo runs the engine on the
main thread of your browser, so expect different numbers on slower
machines.

"Average instead of sum" switches the aggregate. The engine pre-aggregates
raw rows by row × column tuple when that shrinks the work, and keeps
mergeable states, so the grand total average equals the average computed
directly over every raw row.

"Paging" turns the default virtualization off and pages rows (10 per
page) and column members (5 per page) with the Data Grid pager.
