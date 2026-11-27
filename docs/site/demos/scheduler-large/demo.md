---
title: Large schedules and virtual scrolling
description: A Timeline Month of 1,000 people and 10,000 events that renders only the visible rows, a remote source that reads the rendered people only, scrollToResource under virtualization, a week of 1,000 events and an agenda that appends days as it scrolls.
category: calendars
---

Scroll the timeline: only the rows in view (plus `overscan`) are in the
DOM, and `getRenderedRange()` reports which. Enter a person and press
`scrollToResource` to jump to that row. Switch to "lazy loading": the
source's `read` receives the ids of the rendered people only and runs again
as you scroll, so the status line shows a few dozen people, not 1,000. The
week scenario lays out 1,000 events, and the agenda appends the next days
when you scroll to its end. The 10,000 events are generated
deterministically, so the server and the browser render the same rows.
