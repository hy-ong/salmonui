---
title: Export, import and print
description: XLSX export with chosen fields and headers, CSV with one row per occurrence and escaped formulas, an iCalendar file with RRULE and EXDATE, iCalendar import from text or a file, and printing the rendered week.
category: calendars
---

Untick "Download files" to only preview the result. "Export Excel" writes
the title (headed "Subject"), start, end and location through the lazily
loaded XLSX writer. "Export CSV" writes one row per occurrence of the
visible week with `;` separators; the formula-looking title is escaped.
"Export iCalendar" writes the standup as one VEVENT with its RRULE and the
skipped Wednesday as EXDATE, timed events with TZID wall times. "Import
sample .ics" adds a workshop on Friday; choose your own `.ics` file to
import it. "Print" opens the browser's print dialog with the week at
27 cm wide; `onBeforePrint` and `onAfterPrint` report it.
