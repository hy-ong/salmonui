---
title: Tooltip
description: A short description shown on hover and keyboard focus, with twelve logical placements, delays shared through Tooltip.Provider, an arrow, pointer following and a collision boundary.
category: Overlays
order: 20
demos: [tooltip, tooltip-options]
---

`Tooltip` follows the APG Tooltip pattern: it describes its trigger, opens
on pointer hover and on keyboard focus, and closes on Escape, blur and
pointer leave. It lives in `@salmonui/overlays/tooltip` with its own
stylesheet.

```tsx
import { Tooltip } from '@salmonui/overlays/tooltip';
import '@salmonui/overlays/tooltip/styles.css';

<Tooltip content="Save the order">
  <button type="button">Save</button>
</Tooltip>;
```

<!-- demo: tooltip -->

## Attaching to the trigger

Salmon UI does not clone children. Two forms attach the tooltip:

- **Children**: the trigger is wrapped in a `<span class="salmon-tooltip-trigger">`
  with `display: contents` (no box, no layout change). Pointer and focus
  events bubble to it; its first element child is the anchor and receives
  `aria-describedby` while the tooltip is open (appended to any value it
  already has).
- **`render`**: `render={(props) => <Button {...props}>Save</Button>}`
  renders the trigger itself with the computed props (event handlers, `ref`,
  `aria-describedby`); no wrapper element.

## Opening and closing

- Pointer hover opens after `delay` (default 600 ms); pointer leave closes
  after `closeDelay` (default 100 ms). Moving the pointer onto the tooltip
  keeps it open, so its text can be read or selected (WCAG 1.4.13).
- Keyboard focus (`:focus-visible`) opens at once; blur closes. A pointer
  press on the trigger closes it.
- Escape closes the tooltip only: a surrounding dialog or popover stays
  open. The Escape listener exists only while a tooltip is open.
- Touch never opens a tooltip: long press is reserved for the
  platform. Put essential information in the label or use a
  [Popover](/docs/layout/popover).
- `disabled` never opens.

`open` / `defaultOpen` / `onOpenChange(open, { reason, source })` control it
(reasons `'hover' | 'focus' | 'blur' | 'leave' | 'escape' | 'press'`,
sources `'pointer' | 'keyboard'`); `onAfterOpen` and `onAfterClose` fire
after the content is shown and removed. With a controlled `open`, the
callback only proposes a change: apply it to open or close, or ignore it to
cancel. To open or close the tooltip from code, set `open`.

## Tooltip.Provider

`Tooltip.Provider` (also `TooltipProvider`) shares `delay` and `closeDelay`
for every tooltip inside it and adds a skip-delay window (`skipDelay`,
default 300 ms): after one tooltip closes, the next opens without waiting,
so moving along a toolbar feels immediate. Only one tooltip of a provider
is open at a time. Timers live in refs, never in React state.

## Placement

`placement` takes twelve logical values, default `'top'`: `top`,
`topStart`, `topEnd`, `bottom`, `bottomStart`, `bottomEnd`, `start`,
`startTop`, `startBottom`, `end`, `endTop`, `endBottom`. `start` / `end`
follow the inherited `dir`. The tooltip flips to the opposite side when it
does not fit and shifts to stay in the viewport, or inside
`collisionBoundary` (default the viewport). Collision handling is automatic
and deterministic, so there is no collision event, and the
position follows scroll and resize, so there is no refresh method.

- `offset`: gap in px (default 6) or `{ mainAxis, crossAxis }`.
- `arrow` (default `true`) points at the anchor's center and stays clamped
  inside the box after a shift, so its position needs no setting.
- `followCursor` positions the tooltip at the
  pointer; pointer moves write a CSS `translate` directly, never React
  state.

The tooltip uses the top layer through `popover="hint"` where supported
(it does not close open popovers), `popover="manual"` otherwise; without
the Popover API it is portaled into `container` (default: the nearest
`ThemeProvider` scope, else `document.body`).

## Content and styling

`content` is any `ReactNode`, rendered only while open. It must not hold
interactive controls; use [Popover](/docs/layout/popover) for those,
including a tooltip that opens on click or stays open. Content that loads
data
can be a component that suspends. HTML strings are not parsed.

- `className` / `style` go on the content element (`.salmon-tooltip`, with
  `data-side` and `data-placement`); `classNames` / `styles` reach the
  `content` and `arrow` parts. Width and height are CSS
  (`styles={{ content: { width: 200 } }}`); the default maximum inline size
  is 280 px.
- `contentProps` (`TooltipContentProps`) adds attributes to the content
  element, `data-*` attributes included; its
  `id` is reserved for `aria-describedby` and its `role` is always
  `tooltip`.
- One fade transition, off under `prefers-reduced-motion`.

## Not included

- One tooltip delegated over many elements by a selector is not
  offered: render one `Tooltip` per trigger. The
  Data Grid keeps its own delegated overflow tooltip.
- There is nothing to persist, and React owns the lifecycle, so
  there are no lifecycle events or destroy method.

<!-- demo: tooltip-options -->

API reference: [`@salmonui/overlays/tooltip`](/docs/reference/overlays/tooltip).

## Bundle

`@salmonui/overlays/tooltip` is 3.56 KB gzip including the positioning and
top-layer primitives (no dismiss stack or focus scope); its stylesheet is
0.52 KB.
