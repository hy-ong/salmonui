---
title: ButtonGroup
description: A labelled group of buttons with joined borders, a vertical orientation and group-wide variant, tone, size and disabled defaults.
category: Components
order: 30
demos: [button-group]
---

```tsx
import { Button, ButtonGroup } from '@salmonui/buttons/button';
import '@salmonui/buttons/button/styles.css';

<ButtonGroup aria-label="Clipboard" variant="outline">
  <Button>Cut</Button>
  <Button>Copy</Button>
  <Button>Paste</Button>
</ButtonGroup>;
```

`ButtonGroup` groups related buttons into one labelled control. It renders
`<div role="group">`, named by `aria-label` or `aria-labelledby`.

- `orientation`: `'horizontal'` (default) or `'vertical'`.
- `attached` (default `true`) joins borders and shares corners; `false`
  spaces the buttons.
- `variant`, `tone`, `size` and `disabled` on the group are the defaults of
  every button inside; a button's own prop wins.
  Group `disabled` also follows a surrounding `<fieldset disabled>`.
- Ghost groups (`variant="ghost"`) are supported with joined borders;
round buttons follow the Button rule (no shape props).
- The group adds no keyboard model: every button is its own tab stop and
  Enter / Space activate it. For one tab stop with arrow keys use a
  [`ToggleButtonGroup`](/docs/buttons/toggle-button-group).

- `MenuButton` and `SplitButton` can be group children, also in a vertical
  group; see
  [Split Button](/docs/buttons/split-button#in-a-button-group). The group
  inherits `dir` and uses logical CSS, so it mirrors under `dir="rtl"`.
- The group has no state and no events of its own; it renders on the server
  like any element. `.salmon-button-group` carries `data-orientation` and
  `data-attached`, and `className`, `style` and other DOM props reach the
  `<div>`.

<!-- demo: button-group -->

## Rendering

The group is a component, not a decoration applied to existing DOM after
mount, so it renders on the server like the buttons inside it.
Per-button options go on the `Button` children.

## API reference

[`ButtonGroup`](/docs/reference/buttons/button/ButtonGroup) and
`ButtonGroupProps` in [`@salmonui/buttons/button`](/docs/reference/buttons/button).
