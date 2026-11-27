---
title: Spinner
description: A CSS-only loading indicator that renders in Server Components, announces an optional label once, and covers content or a positioned parent while it loads.
category: Components
order: 50
demos: [spinner-overlay]
---

```tsx
import { Spinner } from '@salmonui/notifications/spinner';
import '@salmonui/notifications/spinner/styles.css';

<Spinner label="Loading orders" />;
```

`Spinner` is a server component: the entry has no `"use client"` directive,
no hooks and no client JavaScript, so a React Server Component can render it
directly. The ring is one CSS animation (the shared `salmon-spin` keyframes),
stopped under `prefers-reduced-motion`.

<!-- demo: spinner-overlay -->

## Label and accessibility

- With `label` the spinner is a `role="status"` element whose visually hidden
  text is the label. Render it when loading starts so the label is
  announced once.
- Without `label` the spinner is decorative (`aria-hidden="true"`). Put
  `aria-busy="true"` on the region that is loading and announce the state once
  elsewhere.

## Size, class and style

- `size`: `'sm'` (16 px), `'md'` (24 px, default), `'lg'` (32 px), or a number
  for a diameter in pixels.
- `className` and `style` reach the root; every other DOM prop (`id`,
  `data-*`, `aria-*`, handlers) is spread onto it. `ref` points at the root element.
- `indicator` replaces the built-in ring with any node, for example an inline
  SVG. The node is shown as is: it brings
  its own animation, if any, and should stop it under
  `prefers-reduced-motion`.

## Covering content

```tsx
// Covers its children while loading.
<Spinner loading={saving} label="Saving">
  <OrderForm />
</Spinner>

// Covers the nearest positioned ancestor.
<div style={{ position: 'relative' }} aria-busy={loading}>
  <Spinner overlay />
  …
</div>
```

- With `children`, the root is a wrapper `<div>` with `aria-busy` while
  `loading`. The children keep their size and layout, but they are hidden and
  `inert` (no focus, no pointer input), and the spinner is centered over them
  on a translucent scrim.
- `loading` defaults to `true`; toggle it to show and hide the spinner.
`loading={false}` renders the children alone; without children it
  renders nothing.
- `overlay` positions a standalone spinner over its nearest positioned
  ancestor.

## Design notes

There is one spinner design, colored by the theme:
Salmon UI has one visual language driven by the five theme
seeds, so a per-spinner design-system style would draw a ring that does not
match the rest of the interface; use `indicator` for a different shape.

There is no global function that changes every spinner:
it would need module-level state, which would leak
between server requests and break the React Compiler rules. An application
component such as
`function AppSpinner(props) { return <Spinner size="lg" indicator={<Logo />} {...props} />; }`
gives the same app-wide default.

API reference: [`@salmonui/notifications/spinner`](/docs/reference/notifications/spinner).
