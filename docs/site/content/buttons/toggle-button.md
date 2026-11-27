---
title: ToggleButton
description: A button with a pressed state (aria-pressed), controlled or uncontrolled, that can take part in a form through a hidden input.
category: Components
order: 20
demos: [toggle-button]
---

```tsx
import { ToggleButton } from '@salmonui/buttons/button';
import '@salmonui/buttons/button/styles.css';
```

`ToggleButton` is a pressed/unpressed button: APG Button, toggle
variant. It accepts every `Button` prop and adds the pressed triad:

| Prop | Meaning |
| --- | --- |
| `pressed` | Controlled pressed state. The component never changes it. |
| `defaultPressed` | Initial state when uncontrolled (default `false`), read once at mount and restored on form reset. |
| `onPressedChange(pressed, event)` | The proposed state; `event` is a frozen `{ source, reason }` with `source` `'pointer'`, `'keyboard'`, `'touch'` or `'api'` and `reason` `'toggle'` or `'reset'`. |
| `name`, `value` | With `name`, a hidden input carries `value` (default `"on"`) while pressed, so a plain form submission sees it. |

The button carries `aria-pressed` and the `data-pressed` styling hook. A
controlled toggle vetoes a change by not updating `pressed`; switching between
controlled and uncontrolled logs a development warning.

```tsx
const [muted, setMuted] = useState(false);
<ToggleButton pressed={muted} onPressedChange={setMuted}>Mute</ToggleButton>;
```

<!-- demo: toggle-button -->

Inside a [`ToggleButtonGroup`](/docs/buttons/toggle-button-group) a
`ToggleButton` is an item of the group instead: its `value` is required, and
the group owns the selection.

## Keyboard, accessibility and SSR

Enter and Space toggle (native `<button>` activation) and Tab moves focus.
The name comes from the content. Keep it stable ("Mute", not "Mute" /
"Unmute"): `aria-pressed` already announces the state (APG Button). `aria-pressed` and the hidden form input are in the server HTML,
so an uncontrolled `defaultPressed` button hydrates without a mismatch.

## API reference

[`ToggleButton`](/docs/reference/buttons/button/ToggleButton),
`ToggleButtonProps` and `ToggleChangeEvent` in
[`@salmonui/buttons/button`](/docs/reference/buttons/button).
