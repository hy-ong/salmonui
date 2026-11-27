---
title: Timeline
description: A server-component ordered list of events with opposite content, custom markers, tones, disabled items, vertical or horizontal orientation, four alignments and reverse order.
category: Display
order: 20
demos: [timeline]
---

`Timeline` is an `<ol>` of events. It has list semantics (no APG pattern)
and no client code, so it renders in React Server Components. It lives in
`@salmonui/layout/timeline` with its own stylesheet.

```tsx
import { Timeline } from '@salmonui/layout/timeline';
import '@salmonui/layout/timeline/styles.css';

<Timeline
  aria-label="Order status"
  items={[
    { content: 'Ordered', opposite: '09:00', tone: 'primary' },
    { content: 'Shipped', opposite: '12:00', marker: <TruckIcon /> },
    { content: 'Delivered', disabled: true },
  ]}
/>;
```

<!-- demo: timeline -->

## Items

`items` (an array of `{ content, opposite, marker, tone, disabled,
className, key }`) and `Timeline.Item` children (`children`, `opposite`,
`marker`, `tone`, `disabled`, `className`) produce the same markup:

- `opposite` is the content on the other side of the line.
- `marker` replaces the default dot; `tone` colors
  the dot from the theme seeds.
- `disabled` mutes the item and sets `aria-disabled`.
- `renderItem(item, { index, first, last })` renders each `items` entry.
  Per-item logic belongs in `renderItem` or children; there is no
  before-render event.

## Layout

- `orientation`: `'vertical'` (default) or `'horizontal'` (scrolls inline on
  narrow screens).
- `align`: `'end'` (default, content at the inline end of the line),
  `'start'`, `'alternate'`, `'alternateReverse'`.
  Alignment is logical and mirrors with `dir`.
- `reverse` reverses the DOM order, so screen readers read the items in the
  order they are shown.

`className` and `style` reach the `<ol>`; the hooks are `.salmon-timeline`
(`data-orientation`, `data-align`), `.salmon-timeline-item` (`data-tone`),
`.salmon-timeline-opposite`, `.salmon-timeline-marker`,
`.salmon-timeline-dot` and `.salmon-timeline-content`. There is nothing to
persist, and React owns the lifecycle, so there are no lifecycle
events.

The JavaScript is 0.62 KB gzip and the stylesheet 0.79 KB.

API reference: [`@salmonui/layout/timeline`](/docs/reference/layout/timeline).
