---
title: Spinner sizes and overlays
description: Labelled spinners in every size and a pixel diameter, a custom indicator, a form covered by a spinner while it saves, and an overlay on a positioned panel while it refreshes.
category: notifications
---

Every spinner has a `label`, so it is a `role="status"` with visually
hidden text. `size` is `'sm'`, `'md'`, `'lg'` or a diameter in pixels; the
48 px spinner is colored through `style`, and the last one replaces the
ring with an `indicator` node. Save covers the form: the wrapper is
`aria-busy` and the form is hidden and `inert` until `loading` is false,
so showing and hiding the spinner is a prop change. Refresh renders an
`overlay` spinner over the positioned panel.
