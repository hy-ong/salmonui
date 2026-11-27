---
title: Choice events
description: Change events of RadioGroup, Radio, Checkbox and Switch with their details, radio labels before or after the control, and standalone radios grouped by a shared native name.
category: inputs
---

Pick a shipping option, click the billing radios, the checkbox and the
switch, with the mouse and with the keyboard: the log shows each change
event with its `details` (reason and source: pointer or keyboard).

The shipping radios take their labels from their children; the group puts
them before the control with `labelPlacement="start"` and the last radio
overrides it with `"end"`. The billing radios are standalone `Radio`
elements outside a `RadioGroup`: the shared native `name` makes them one
group, so arrow keys move between them and only one is checked.
