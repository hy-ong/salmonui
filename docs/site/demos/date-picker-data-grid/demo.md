---
title: DatePicker as a Data Grid editor
description: Date and date-time columns that edit with the public DatePicker through datePickerEditor, with min, max, first day of week, week numbers, disabled weekends and a time window passed as column editorProps.
category: calendars
---

Double click (or press Enter on) a Due cell: the editor is the full
`DatePicker`, bounded to December 2026 through June 2027, weeks start on
Monday with week numbers, and weekends are disabled; these come from the
column's `editorProps`. The Review column edits date and time in UTC with a
15-minute list between 08:00 and 18:00. Enter saves, Escape cancels; inside
the open popup Escape only closes the popup. The editor comes from its own
subpath (`@salmonui/calendars/date-picker/data-grid`), so a grid that does not
use it loads none of it.
