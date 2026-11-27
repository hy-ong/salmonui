---
title: Tooltip placement, control and events
description: A controlled Tooltip opened from a button with a log of its open change requests, placement, offset and arrow controls, a pointer-following tooltip, a collision boundary, a wide tooltip, a tooltip with extra attributes rendered into a chosen container, and right-to-left.
category: layout
---

"Save status" is controlled: hovering or focusing it only proposes a change
through `onOpenChange`, and the demo applies it unless "Allow hover and
focus to open" is off, which cancels the open. The button next to it
opens and closes the tooltip from code through the controlled `open`. The pointer area uses `followCursor`; the Boundary tooltip flips
and shifts inside its bordered box (`collisionBoundary`). "Shipping" is
260 px wide through `styles.content`, the status tooltip is bold through
`style`, and "Right to left" resolves `start` / `end` against `dir`.

"Delete draft" adds a `data-variant` attribute through `contentProps`,
which the site stylesheet colors as a
warning, and renders into an italic element through `container`: the
tooltip is still in the top layer, but it inherits the container's styles.
