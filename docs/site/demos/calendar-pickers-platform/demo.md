---
title: Server rendering, color scheme and timing
description: Pickers that server-render without the host locale or zone, a calendar that marks today after hydration, presets evaluated on open, a light and dark color scheme switch and input-to-paint timings for keys and popups.
category: calendars
---

View the page source: the calendar, the fields and their values are in the
server HTML, and nothing in it depends on the server's clock, locale or
zone. The calendar without a date is a sized `aria-busy` frame until
hydration, then shows the current month with today marked; the instant
field fills in after hydration in your zone. The "Last 7 days" preset is
computed when the popup opens. The site renders demos in React StrictMode,
which runs every render twice; pure renders keep the output identical.

Press arrow keys in the calendar, PageDown, Shift+PageDown, type into a
segment, open a popup with Alt+ArrowDown or hold ArrowDown in the 1,440
option list: the log shows the time from the input to the next frame (the
gates are 8 ms for keys and segments, 16 ms for month changes and 50 ms for
a popup on the reference machine). The popups are lazy chunks requested
when the browser is idle, which is how the four picker subpaths stay inside
their gzip budgets. Switch the color scheme to light or dark; emulate
`forced-colors: active` in the browser's rendering tools to see the
system-color selection, focus and today styles. The site's test suite runs
axe-core over this demo with its popups open.
