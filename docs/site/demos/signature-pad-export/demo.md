---
title: Signature export and loading
description: SignaturePad stroke widths and velocity, a background color and image, a controlled value with api.load, api.clear and api.isEmpty, PNG and JPEG data URLs and blobs with or without the background, and strokes redrawn on resize.
category: inputs
---

Draw with the stroke sliders at different settings: fast strokes get
thinner as `velocity` rises, between `minStrokeWidth` and
`maxStrokeWidth`. Change the `backgroundColor` and toggle the signature-line
`backgroundImage`.

The pad is controlled: `onValueChange` reports each action and the PNG data
URL, and "Set value to null" clears it from the owner. "Load sample" calls
`api.load()` with an image; `api.clear()` and `api.isEmpty()` report the
state. The export buttons call `api.toDataURL('image/png' | 'image/jpeg')`
and `api.toBlob()`; uncheck "Export with background" to export the strokes
alone (the checkerboard shows through the transparent PNG).

Uncheck "Wide pad" after drawing: the strokes are the source of truth and
are redrawn at the new size and at the screen's `devicePixelRatio`.
