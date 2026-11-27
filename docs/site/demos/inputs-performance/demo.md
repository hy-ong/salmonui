---
title: Inputs render cost
description: Render counters around text, number and masked fields show that typing re-renders only the edited field, a Slider drag and a signature stroke run without React renders, and the QueryBuilder subpath loads as its own chunk only when used.
category: inputs
---

Each badge counts the commits of the component around a field. Type into
the uncontrolled text, number and masked fields: no badge moves, because a
keystroke re-renders only the field itself. Type into the controlled field:
only its owner's badge counts up, and the read-out shows the time from the
input event to the commit.

Drag the slider thumb and draw a signature stroke. The read-out counts
pointer moves against Slider renders (counted inside `renderTick`) and
signature value changes: the thumb, fill and value label move through CSS
variables and the strokes go straight to the canvas. While you drag, the
pointer-move count climbs and the Slider render count stays flat; the
Slider renders again only when the drag ends, and the signature reports one
change per stroke. (Development builds render every component twice, so
the counts start at 2 there.)

Open the browser's network panel and press "Load the QueryBuilder subpath":
the component arrives as a separate chunk at that moment. Every
`@salmonui/<category>/<family>` subpath is its own entry with its own JavaScript
and CSS budget in `npm run bundle:check`, so a page pays only for the
families it imports.
