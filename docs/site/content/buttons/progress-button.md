---
title: Progress Button
description: The progress button as Button props - a loading spinner that keeps focus and a progress fill driven by the application's real progress.
category: Recipes
order: 50
demos: [progress-button]
---

A progress button is a `Button` with `loading` and `progress`; every other
Button member applies unchanged.

## Loading

`loading` shows a spinner, sets `aria-busy="true"` and `aria-disabled="true"`
and ignores activation, but keeps the button focusable so keyboard users do not
lose their place. `loadingLabel` (default `"Loading"`) is appended
to the accessible name as visually hidden text. The spinner takes the
`iconStart` slot (centered on an icon-only button) and scales with `size`;
`spinner` replaces the graphic.

## Progress

`progress={n}` (0 to 100) draws a fill from inline-start, sets `data-progress`
and one inline custom property, and appends `progressLabel(n)` (default
`"n%"`) to the name as hidden text. A button's children are
presentational, so there is no `progressbar` role inside it. `progress`
without `loading` shows only the fill, with no spinner.
Changing `children` or any style prop during progress is an ordinary
re-render.

<!-- demo: progress-button -->

## Design notes

- No timed, simulated progress: there is no duration, no start / stop
  methods and no progress lifecycle events. The application's own async code
  sets `loading` and `progress` from its real work. Enter and Space are plain activation; there is no
  built-in progress for Escape to stop.
- The spinner's position and width are fixed by the button metrics;
content animations are not offered.
- The fill always runs along the inline axis; vertical and top-edge fills
  are not offered.
