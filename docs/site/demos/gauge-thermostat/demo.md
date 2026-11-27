---
title: Thermostat with a draggable comfort range
description: A circular gauge with triangle, diamond, text and custom-rendered marker pointers, a draggable comfort range, degree axis labels through formatLabel, animated pointer updates and root pointer events.
category: data-visualization
---

The green comfort range is a two-thumb slider: drag either end, or Tab to a
thumb and use the arrow keys, Page Up / Page Down and Home / End;
`onRangeChange` updates the controlled range. "Cooler" and "Warmer" move
the indoor marker, which transitions from its previous value (turn off
"Animate pointers" to make it jump). `axis.formatLabel` writes the degree
labels, and `onPointerEnter` / `onPointerLeave` on the root report the
pointer in the status line.
