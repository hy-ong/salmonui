---
title: Switch
description: An on/off switch from @salmonui/inputs/switch on a native checkbox with role="switch", a label, description and form submission.
category: Components
order: 22
demos: [switch-basics, choice-events]
---

`Switch` is an on/off toggle. It is a native
`<input type="checkbox" role="switch">` drawn as a track and a thumb,
labelled by its children through a real `<label for>`.

```tsx
import { Switch } from '@salmonui/inputs/switch';
import '@salmonui/inputs/switch/styles.css';

<Switch name="wifi" defaultChecked description="Uses mobile data when off">Wi-Fi</Switch>
```

<!-- demo: switch-basics -->

## Checked state

`checked` / `defaultChecked` / `onCheckedChange(checked, details)` with `details.source` (`'pointer'`, `'touch'`, `'keyboard'`,
`'api'`) and `details.reason` (`'toggle'` or `'reset'`). A controlled
`checked` is also the veto: ignore the proposal and the switch
stays as it is.

```tsx
const [on, setOn] = useState(false);
<Switch checked={on} onCheckedChange={(next) => (canEnable || !next) && setOn(next)}>Sync</Switch>
```

Without `checked` the switch is uncontrolled and a form reset restores
`defaultChecked`.

<!-- demo: choice-events -->

## Label

Children are the label and `labelPlacement: 'start' | 'end'` places it.
`thumbIcon` draws a decorative icon inside the thumb.

## Form submission

`name`, `value` (default `'on'`), `form` and `required` are native: an on switch submits `name=value`.

## Keyboard

| Key | Action |
| --- | --- |
| Space | Toggles the switch |
| Tab / Shift+Tab | Moves focus |

Screen readers hear "switch, on" or "off" from the native checked state and
`role="switch"`. The thumb moves with logical properties, so it
mirrors in right-to-left content. Try it in the
[keyboard demo](/demos/inputs/inputs-keyboard), and see the
[form demo](/demos/inputs/field-forms) for submission.

## SSR

The switch is a native checkbox, so the server markup is final: ids come
from `useId` and the checked state is right before hydration.

## Design notes

- there is no text inside the track: text in a fixed-width track breaks with translated strings, and `role="switch"`
  already announces the state. Use the label, a `description` that
  reflects `checked`, or `thumbIcon`.
- no toggle method: the `ref` is the native input and toggling
  is a state change of the owner. Use `setChecked((c) => !c)` on a
  controlled switch.
- no before-change event: with a controlled `checked` the owner already
  decides every change. Move the condition into `onCheckedChange` and only
  call `setChecked` when it passes.

## API

| Prop | Type | Default |
| --- | --- | --- |
| `checked`, `defaultChecked` | `boolean` | `false` |
| `onCheckedChange` | `(checked, { source, reason }) => void` | |
| `children` | `ReactNode` (label) | |
| `labelPlacement` | `'start' \| 'end'` | `'end'` |
| `thumbIcon` | `ReactNode` | |
| `name`, `value`, `form`, `required`, `disabled` | native | `value: 'on'` |
| `description`, `errorMessage`, `invalid`, `validation`, `validateOn` | see [Field](/docs/inputs/field) | |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` |
| `classNames` | `{ input, label, description, error }` | |
| `ref` | `HTMLInputElement` | |

Full signatures: [`@salmonui/inputs/switch` API reference](/docs/reference/inputs/switch).
