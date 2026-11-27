---
title: Image editor, controlled
description: A controlled ImageEditor - resize and zoom from outside, frames, freehand drawing, image stickers from a custom toolbar item, a trimmed quick-access toolbar, image smoothing, a phone-width toolbar overflow, right to left with localized labels, and the before/after events.
category: editors
---

The transform, frame and annotations are React state. Type a width and press
Resize, or use the Resize tool (its panel keeps the aspect ratio by default);
widths over 1280 px are cancelled in `onBeforeResize`. The Zoom slider sets
`transform.zoom`; Ctrl+wheel, pinch and the Pan tool zoom and pan inside the
editor and report the committed value. Pick a frame from the list or the
Frame tool.

The toolbar is a custom list: Freehand draws on drag, Image places a picture
from a file, and the last item ("Add sticker") is a custom item whose
`onClick` adds an `image` annotation. Select an annotation to see the
quick-access toolbar, trimmed to clone, delete and z-order. Turn
`imageSmoothing` off and zoom in to see hard pixel edges.

"Phone width" narrows the editor to 360 px, so the toolbar overflows into a
More menu; touch devices get pinch zoom, two-finger pan and larger handles.
"Right to left" mirrors the toolbar and switches part of `localeText` to
Arabic. Every tool is reachable by keyboard: Tab to the toolbar, use the
arrows, and move a selected annotation with the arrow keys; operations are
announced in a live region. The log lists the events.
