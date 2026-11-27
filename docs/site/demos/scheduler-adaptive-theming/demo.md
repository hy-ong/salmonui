---
title: Adaptive layout and theming
description: A clinic schedule that switches to the compact layout below 700 px of its own width with a view menu and one doctor at a time, resource colors mixed against the theme seeds, and events in the server-rendered HTML.
category: calendars
---

At phone and tablet width the Scheduler is narrower than its 700 px
breakpoint: the view buttons become a view menu, the time axis narrows and
the grouped week shows one doctor at a time with a doctor picker
(`selectedResourceId` / `onSelectedResourceChange`). At desktop width all
three doctors show side by side. The width is measured after hydration, so
the server renders the full layout and hydration matches. Change the
primary seed: the header, selection and focus colors follow, while each
doctor's events keep their resource color, mixed against the surface
(`--salmon-scheduler-event-color`). View the page source: with `date`,
`view` and `timeZone` set, the events are in the server HTML; today is
marked only after hydration.
