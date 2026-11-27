---
title: Templates and render hooks
description: Event content per view, event and cell classes and data attributes, date and cell header templates, a header indent, a date range and toolbar wrapper, custom quick info sections and a custom editor dialog with a RecurrenceEditor bound to the form.
category: calendars
---

Events show an icon, the title and the time (`renderEvent`); Month uses its
own per-view `renderEvent`. `getEventProps` adds a class and `data-kind` to
every event, and italics to travel. Friday 27 November is a holiday:
`getCellProps` tints its cells, `renderDateHeader` and `renderCellHeader`
mark it, and in Month `renderCell` labels it. The corner shows the zone
(`renderHeaderIndent`), the date range has an icon (`renderDateRange`) and
`renderToolbar` adds a line after the header items. Click an event for the
custom quick info header, content and footer. Double click an event: the
editor dialog body is your own form (`editing.renderDialog`) with a
`RecurrenceEditor` that is an ordinary controlled field of that form, and
your own header and footer.
