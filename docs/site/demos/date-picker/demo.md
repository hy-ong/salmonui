---
title: Date picker and first day of week
description: The `date` and `datetime` editors open an accessible calendar whose weekday names, week start and month heading follow the grid `locale`, with a `firstDayOfWeek` override.
---

Double-click a date cell (or focus it and press F2), then press Alt+ArrowDown
or the calendar button. Switch the locale to see the week start move (Sunday
in `en-US`, Monday in `de-DE` and `en-GB`, Saturday in `ar-EG`), Japanese era
years for `ja-JP-u-ca-japanese` and Buddhist years for `th-TH`. The
first-day-of-week menu sets `editorProps.firstDayOfWeek` on both date columns.
