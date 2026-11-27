---
title: Skeleton
description: Placeholder text lines, circles and rectangles with the Data Grid's transform-only shimmer, rendered in Server Components and sized from the content they stand in for.
category: Components
order: 60
demos: [skeleton-card]
---

```tsx
import { Skeleton } from '@salmonui/notifications/skeleton';
import '@salmonui/notifications/skeleton/styles.css';

<div aria-busy="true">
  <Skeleton shape="circle" />
  <Skeleton lines={3} />
</div>;
```

`Skeleton` is a server component: no `"use client"` directive, no hooks and
no client JavaScript, so the placeholders are in the server HTML and there
is nothing to hydrate.

<!-- demo: skeleton-card -->

## Shapes and sizes

- `shape`: `'text'` (default, one line of text height), `'circle'`
  (40 px) or `'rect'`. A square is a `rect` with equal
  `width` and `height`.
- `lines`: several text bars; the last one is shorter.
- `width` and `height` take a number of pixels or any CSS length (`'60%'`,
  `'4rem'`) and set the logical inline and block size.

## Animation

`animation` is `'wave'` (default), `'pulse'` or `false`. The wave is
the same compositor-only transform on a pseudo-element, and the same
`salmon-data-grid-shimmer` keyframes, as the Data Grid skeleton rows: one CSS
definition for both, with no layout or paint per frame. `'pulse'` is an
opacity animation and also serves as the fade effect: a separate
fade would look alike, and one fewer keyframes set keeps the stylesheet
small. In
right-to-left pages the wave runs toward the inline end. Every
animation stops under `prefers-reduced-motion` and in forced colors, where
the bars keep a visible outline.

## Loading content

```tsx
<Skeleton loading={!user}>
  <UserCard user={user ?? placeholderUser} />
</Skeleton>
```

`loading` defaults to `true`. With children,
the skeleton takes the size of the children, which stay hidden and `inert`
while loading; `loading={false}` renders the children alone.

## Accessibility

Skeletons are always `aria-hidden` and take no `label`: a label
on every skeleton would make a screen reader read the same text many times.
Instead the loading region carries `aria-busy="true"` and one status message (a
`Spinner` with `label`, or a `Message` with `live="polite"`).

## Class, style and lifecycle

`className` and `style` reach the root `<span>`, and other DOM props are
spread onto it; `ref` is that `<span>`. Direction comes from the inherited
`dir`. There is nothing to persist:
a skeleton has no state. There is no teardown method and no mount event:
render the skeleton while loading and remove it, or pass
`loading={false}`.

API reference: [`@salmonui/notifications/skeleton`](/docs/reference/notifications/skeleton).
