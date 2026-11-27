---
title: ToggleButtonGroup
description: Single selection as an APG radio group or multiple selection as toggle buttons, with one tab stop, arrow keys mirrored in RTL and native form submission.
category: Components
order: 40
demos: [toggle-button-group]
---

```tsx
import { ToggleButton, ToggleButtonGroup } from '@salmonui/buttons/button';
import '@salmonui/buttons/button/styles.css';

<ToggleButtonGroup aria-label="Alignment" defaultValue="left">
  <ToggleButton value="left">Left</ToggleButton>
  <ToggleButton value="center">Center</ToggleButton>
  <ToggleButton value="right">Right</ToggleButton>
</ToggleButtonGroup>;
```

`ToggleButtonGroup` is a group of buttons that select like radios or
checkboxes. Its items are `ToggleButton`s with a `value`.

| `selectionMode` | Value | Semantics |
| --- | --- | --- |
| `'single'` (default) | `string \| null` | APG Radio Group: `role="radiogroup"`, items `role="radio"` with `aria-checked` |
| `'multiple'` | `readonly string[]` | `role="group"`, items with `aria-pressed` |

The selection is a triad: `value` (controlled), `defaultValue` (uncontrolled,
the initial preselection) and
`onValueChange(value, event)` with a frozen `{ source, reason }` event. A
controlled group vetoes a change by not updating `value`.

`disallowEmpty` (default `false`) keeps one value selected in single mode and
at least one in multiple mode, so a checked item cannot be unchecked.
By default clicking the selected item clears it.

The group also takes `orientation` (the arrow-key axis), `attached`
(default `true`, `false` for `variant="chip"`), and `variant`, `tone`, `size`
and `disabled` defaults for its items. Name it with `aria-label` or
`aria-labelledby`. The selection, roving tab stop and hidden inputs are in
the server HTML, so an uncontrolled group hydrates without a mismatch.

<!-- demo: toggle-button-group -->

## Keyboard

The group has one tab stop: the focused item, else the selected item, else the
first enabled one (roving tabindex).

| Key | Single | Multiple |
| --- | --- | --- |
| Tab | Moves into the group (to the checked radio) and out of it | Same |
| Arrow keys | Move focus and select, wrapping, skipping disabled items | Move focus only |
| Home / End | First / last enabled item, selected | First / last enabled item |
| Space / Enter | Select the focused item | Toggle the focused item |

ArrowLeft and ArrowRight follow the inline direction: under `dir="rtl"` they
are mirrored, and the layout uses logical CSS.

## Forms

With `name` the group renders one `<input type="hidden">` per selected value,
so `FormData`, plain form posts and server actions see the selection;
nothing is submitted while the group is `disabled`. The owning form's `reset`
restores `defaultValue` (an uncontrolled group) or proposes it with
`reason: 'reset'` (a controlled one).

## Tab order

A toggle group is one composite widget with one tab stop and arrow keys,
even in multiple mode, which keeps the Tab order short. For one tab stop per button, use separate
`ToggleButton`s in a [`ButtonGroup`](/docs/buttons/button-group).

## API reference

[`ToggleButtonGroup`](/docs/reference/buttons/button/ToggleButtonGroup) and
`ToggleButtonGroupProps` (`ToggleButtonGroupSingleProps` /
`ToggleButtonGroupMultipleProps`) in
[`@salmonui/buttons/button`](/docs/reference/buttons/button).
