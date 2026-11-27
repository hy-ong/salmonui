---
title: RangeSelector as a chart navigator
description: A RangeSelector with an area, line or step-line series and period buttons drives a chart's zoom range; it reports the range live while dragging and commits it on release, and works from the keyboard.
category: data-visualization
---

Drag a thumb or the selected band, click the track, or pick a period
(`periods`, an APG radio group ending at the data end). The value is
controlled: `onValueChange` reports the range at most once per frame while
dragging (shown live below) and `onValueCommit` commits it on release;
the demo then passes it to the chart as `zoomRange={{ x: value }}`.

From the keyboard, Tab to a thumb (`role="slider"`) or the band (a third
slider that moves both) and use the arrows, PageUp / PageDown, Shift and
Home / End. The selected band and thumbs take the `primary` seed and the
dimmed regions the surface. Switch the background series between
`'area'`, `'line'` and `'stepLine'`.
