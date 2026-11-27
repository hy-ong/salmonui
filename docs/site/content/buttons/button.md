---
title: Button
description: A native button with tones, variants, sizes, icons, icon-only metrics, press-and-hold repeat and a render prop for links, plus the rules every Buttons component shares.
category: Components
order: 10
demos: [button-basics, button-repeat, button-attributes, button-ssr-cost]
---

```tsx
import { Button } from '@salmonui/buttons/button';
import '@salmonui/buttons/button/styles.css';

<Button tone="primary" onClick={save}>Save</Button>;
```

`Button` renders a native `<button>` (APG Button). It is stateless: there is
nothing to control, and its events are the native ones (`onClick`, `onFocus`,
...) plus `onRepeat`; the pressed state lives on
[ToggleButton](/docs/buttons/toggle-button). Its label is `children`, any
React node; HTML strings are never rendered. `ref` points at
the `<button>`, so `ref.current.focus()` and `ref.current.click()` cover
imperative focus and activation; there are no component methods.

## Tones, variants and sizes

- `tone`: `'neutral'` (default), `'primary'`,
  `'success'`, `'warning'`, `'danger'`, `'info'`. The five
  non-neutral tones are the theme seeds; there is no other color input.
- `variant`: `'solid'` (default), `'outline'`, `'ghost'`,
  `'link'` and `'chip'` (see
  [Chips](/docs/buttons/chips)). Every tone and variant pair meets 4.5:1 text
  contrast in light and dark.
- `size`: `'sm'`, `'md'` (default), `'lg'`. It picks one of three
  fixed metric sets (24, 32 or 40 px tall), and the theme's
  `density: 'compact'` tightens each of them by 4 px (see
  [Density](/docs/data-grid/appearance#density)); use `size="lg"` for
  larger touch targets.

Every state is a `data-*` styling hook on `.salmon-button`: `data-variant`,
`data-tone`, `data-size`, `data-icon-only`, `data-loading`, `data-pressed`,
`data-floating`. Keyboard focus shows a `:focus-visible` ring from the
theme's focus color; `:hover` and `:active` change the fill.

<!-- demo: button-basics -->

## Icons and icon-only buttons

`iconStart` and `iconEnd` take any React node and render it as a decorative
(`aria-hidden`) part before or after the label. They are logical: in a
`dir="rtl"` container `iconStart` sits on the right. Icon
classes and fonts are not used.

`iconOnly` gives square metrics. Its props type then requires `aria-label` or
`aria-labelledby`, and a development warning names the button when both are
missing at runtime.

```tsx
<Button iconOnly aria-label="Delete" iconStart={<TrashIcon />} tone="danger" variant="ghost" />
```

## Press and hold

`repeat` turns on press-and-hold repeat. The first activation is the
native `onClick`; each repeat while the button is held calls
`onRepeat({ count, source })`. `repeat.delay` (default 400 ms) is the
hold time before the first repeat and `repeat.interval` (default 100 ms) the
time between repeats; a held Space or Enter repeats on the same timer, and
operating system key repeats are ignored. Timers live in refs and
stop on release, pointer leave, `pointercancel`, key up and blur.

<!-- demo: button-repeat -->

## Keyboard, forms and links

- Enter and Space activate, Tab moves focus: native `<button>` behavior.
Holding the key repeats when `repeat` is set.
- `type` defaults to `"button"`, so a button inside a form never submits by
  accident; pass `type="submit"` or `type="reset"` explicitly.
  `name`, `value`, `form` and `formAction` pass through.
- `disabled` is the native attribute, so `<fieldset disabled>` disables the
  button too.
- `render` swaps the element: it receives every computed prop (class
  names, `data-*`, ARIA, handlers, `ref`, children) and must spread them. On a
  non-button element `disabled` becomes `aria-disabled="true"` with an inert
  click handler; an element that is neither a link nor a button gets
  `role="button"`, `tabIndex={0}` and Enter / Space activation.

```tsx
<Button variant="link" render={(props) => <Link {...props} to="/orders" />}>Orders</Button>
```

- `title` passes through as the tooltip; a Tooltip component belongs
  to a later category.

## Shared rules

- `className` is appended after `salmon-button` and `style` is merged;
  every other DOM prop (`id`, `aria-*`, `data-*`, event handlers) goes to the
  `<button>`. Built-in handlers run after yours and are skipped when yours
  calls `event.preventDefault()`.
- State is controlled through props; the components never write storage.
There are no lifecycle events or teardown methods:
  use effects.
- Built-in strings are props with English defaults: `loadingLabel` and
  `progressLabel` here, `menuLabel` on the split button.
- Motion is one fixed CSS transition, off under `prefers-reduced-motion`; there
  is no ripple and no animation API. Theming is one theme
  with five seeds and a color scheme.
- Every component renders on the server and hydrates without warnings.
axe-core is clean in light, dark and RTL and the ARIA is native
  `<button>` semantics.

<!-- demo: button-attributes -->

## Not included

- No shape props: round and rounded-corner buttons are not offered; radius
  is system-owned and `floating` buttons are circular.
- No full-width prop: use `style={{ width: '100%' }}`.
- No icon above or below the label; compose the stack inside `children`.
- `type` defaults to `"button"`, not the HTML `"submit"`.

## Performance budgets

The Buttons families are gated by `npm run bundle:check` and their browser
and SSR specs: `@salmonui/buttons/button` is at most 3.5 KB
gzip (`Button` alone 1.55 KB) and never pulls menu, overlay or positioning
code; the Menu family is at most 9.6 KB; `@salmonui/buttons/tag-group` loads
4.15 KB first and its drag code only on the first drag. A toggle paints
within 16 ms, an arrow key in a 50-item `ToggleButtonGroup` or a 1,000-item
menu within 8 ms, and 100 `Button`s render on the server in under 5 ms; a
closed `MenuButton` renders the same markup whatever its item count.
Extracting the shared primitives kept every Data Grid budget unchanged;
the grid keeps its smaller private menu code instead of the
general primitives. The [long menu demo](/docs/buttons/menu-button#performance)
shows the open time of a 1,000-item menu on your machine, and the demo below
runs the SSR measurement in your browser.

<!-- demo: button-ssr-cost -->

## API reference

[`@salmonui/buttons/button`](/docs/reference/buttons/button): `Button`,
`ToggleButton`, `ButtonGroup`, `ToggleButtonGroup` and their types
(`ButtonProps`, `ButtonTone`, `ButtonVariant`, `ButtonSize`,
`ButtonFloatingPosition`, `ButtonRepeatOptions`, `ButtonRepeatEvent`,
`ButtonRenderProps`).
