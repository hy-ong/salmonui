---
title: Chips from data
description: Filter chips mapped from application data with avatar and trailing content, per-chip tone, class, attributes and disabled state, a group-wide disable, a click veto through the controlled value, and single chips.
category: buttons
---

Each person in the data becomes a `ToggleButton` with a `value`, an avatar in
`iconStart` and the open count in `iconEnd`; people with more than five open
items get `tone="warning"`, and every chip carries its own `className` and
`data-person-id`. Chen is away, so that chip is `disabled`. Tab into the group,
move with the arrow keys and press Space or Enter to toggle; a pressed chip
shows a check and `aria-pressed="true"`. With **Lock selection** checked,
`onClick` still fires but the controlled `value` ignores the change.
**Starred only** and **Clear** are single chips: a chip-styled `ToggleButton`
and `Button`.
