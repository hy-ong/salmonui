---
title: Skeleton profile card
description: A loading profile card built from text, circle and rectangle skeletons with sizes in pixels and percent, a skeleton sized from the button it stands in for, the wave, pulse or no animation, and right-to-left.
category: notifications
---

The card section is `aria-busy` while it loads; the skeletons themselves
are `aria-hidden`. The avatar is `shape="circle"`, the name and role are
text bars with `width` and `height`, the picture is a `rect`, the bio is
`lines={3}` (the last line shorter), and the two icons are 32 px squares.
The Follow placeholder wraps the real button: it takes the button's size
while `loading` and renders the button alone when loading finishes;
`style` rounds it. "Animation" switches between `'wave'`, `'pulse'` and
`false`; under reduced motion every animation stops. "Right to left" runs
the wave toward the inline end.
