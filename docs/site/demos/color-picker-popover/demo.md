---
title: Color picker popover and events
description: A controlled popover with a cancellable open, a cancellable mode switch, the alpha channel, value formats and the live versus committed value events in a log.
category: inputs
---

Open the picker with its trigger or with "Open the picker" (the controlled
`open` prop). Tick "Block opening" and the trigger stays closed: the
cancellable `onBeforeOpenChange` vetoes it. Use the mode switch in the
panel; with "Stay in the area" ticked `onBeforeModeChange` refuses the
palette. Change the value format: `hex` hides the alpha slider, and
unticking "Opacity" (`alpha`) hides it in every format. Drag the area: the
log shows `onValueChange` for each live pick and `onValueCommit` once you
press Apply.
