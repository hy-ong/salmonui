---
title: Stepper
description: Stepper and Step show progress through a sequence as an ordered list, with keyboard-selectable steps, linear mode, read-only mode, orientation, label placement, statuses and custom step rendering.
category: Stepper
order: 10
demos: [stepper-basics, stepper-vertical, stepper-events]
---

```tsx
import { Step, Stepper } from '@salmonui/navigation/stepper';
import '@salmonui/navigation/stepper/styles.css';

const [step, setStep] = useState(0);

<Stepper aria-label="Checkout" value={step} onValueChange={setStep} linear>
  <Step label="Account" description="Sign in" />
  <Step label="Billing" optional />
  <Step label="Confirm" invalid={errors.confirm} />
</Stepper>
```

`@salmonui/navigation/stepper` is self-contained: it imports no other family, and
its stylesheet needs only the theme variables. The Stepper is an indicator:
which content a step shows is up to the page (or a `Tabs` with a hidden tab
list).

## Steps

Each `Step` has `label`, `description`, `icon` (replaces the step
number), `optional` (shows "Optional"), `disabled`, `invalid` (marks
a step whose fields fail validation; the Stepper does not validate) and
`status`. `className` and `style` reach the `<li>`, other attributes too; on
`Stepper` they reach the `<ol>`, which is also the `ref`. Steps are
the direct children of `Stepper` (arrays are fine).

## Active step and events

`value` / `defaultValue` / `onValueChange` hold the 0-based active step.
A click or Enter / Space on a step calls `onStepClick({ index,
source })`, then `onBeforeValueChange({ value, previousValue,
source })`, whose `preventDefault()` cancels the change, then
`onValueChange(value, { source })`. Without `value` the Stepper is uncontrolled and starts at
`defaultValue` (default `0`); with `value`, as in the example above, only
the prop moves the active step.

The Stepper has no next, previous, reset or refresh methods: the
active step is a prop, so methods would let the Stepper and the application
state disagree, and the connectors are CSS that never needs a refresh. Next
and previous buttons set `value` (`step + 1`, `step - 1`, `0` to reset).

## Status and connectors

Without `status`, a step before the active one is `completed`, the active
one `inProgress` and later ones `notStarted`. The status is the
`data-status` attribute: the indicator shows a check when completed and `!`
when invalid, and the connector line after a completed step is filled, all
in CSS.

## Modes

- `linear`: only earlier steps and the next one are selectable;
  later steps are `aria-disabled`.
- `readOnly`: the steps are plain content, not buttons.
- `orientation: 'horizontal' | 'vertical'` and
  `labelPlacement: 'top' | 'bottom' | 'start' | 'end'` (default
  `'bottom'` horizontally and `'end'` vertically). `start` and `end` are
  logical and follow `dir`.
- There is no step type prop: the `Step` content already says what
  a step shows. Omit `label` for indicator-only steps; for label-only steps,
  hide the indicator with CSS on `.salmon-stepper-indicator` or use
  `renderStep`; omit `icon` for the numbered indicator.

## Custom rendering

`renderStep(context)` replaces the content of every step. The
context is `{ index, status, active, label, description, icon, optional,
invalid, disabled }`; it is called during render for each step, so it also
covers per-step render customization without a separate event. A `Step` with children renders those instead, for one step.

## Keyboard and ARIA

The Stepper renders an `<ol>`; the active step has `aria-current="step"`.
Selectable steps are buttons with one tab stop:

| Key | Action |
| --- | --- |
| ArrowRight / ArrowLeft (horizontal, mirrored in RTL), ArrowDown / ArrowUp (vertical) | Next / previous enabled step |
| Home / End | First / last enabled step |
| Enter, Space | Select the focused step |

Disabled steps are `aria-disabled` and skipped by the arrow keys. Completed
and invalid steps include a visually hidden "Completed" / "Error" text.

## Locale

`localeText` overrides `{ optional, invalid, completed }`; the defaults are
`STEPPER_DEFAULT_LOCALE_TEXT`.

## Styling

`.salmon-stepper` (`data-orientation`, `data-label-placement`,
`data-readonly`), `.salmon-stepper-step` (`data-status`, `data-active`,
`data-invalid`, `data-optional`, `data-disabled`),
`.salmon-stepper-step-button`, `.salmon-stepper-indicator`,
`.salmon-stepper-text`, `.salmon-stepper-label`,
`.salmon-stepper-description`, `.salmon-stepper-optional`. The connector is
the step's `::after`.

## Step tooltips

A step tooltip, plain or templated, is a `Tooltip` from `@salmonui/overlays/tooltip` around the step's trigger. `Step`
`render` receives the trigger props the Stepper computed (`type`,
`className`, `tabIndex`, `aria-disabled`, `onClick`, `children`); spread
them, then the Tooltip's trigger props:

```tsx
import { Step, Stepper } from '@salmonui/navigation/stepper';
import { Tooltip } from '@salmonui/overlays/tooltip';
import '@salmonui/navigation/stepper/styles.css';
import '@salmonui/overlays/tooltip/styles.css';

<Stepper aria-label="Checkout">
  <Step
    label="Cart"
    render={(step) => <Tooltip content="Review the items in your cart" render={(tip) => <button {...step} {...tip} />} />}
  />
  <Step label="Address" render={(step) => <button {...step} title="Where we ship to" />} />
</Stepper>
```

The trigger props hold no focus or pointer handlers (the Stepper tracks
focus on the step's `<li>`), so the two sets never collide. The Tooltip
shows on hover and keyboard focus and closes on Escape, blur or leaving the
step; its content is any `ReactNode`, so a template is just markup. The
Stepper does not import the Tooltip: a Stepper without tooltips does not
pay for one. For a zero-cost hint, put a native `title` on the trigger (as
on "Address"). In a read-only Stepper the trigger is a `<span>` that is not
focusable, so its tooltip appears on hover only; put essential information
in the `description`.

## Server rendering

The Stepper reads no layout: statuses, connectors and the roving tab stop
follow from the props, so the server markup equals the client tree and
hydrates without warnings.

## API reference

[`@salmonui/navigation/stepper`](/docs/reference/navigation/stepper): `Stepper`,
`Step`, `STEPPER_DEFAULT_LOCALE_TEXT` and the context, event and locale
types.
