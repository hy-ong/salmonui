---
title: Splitter
description: Resizable panes with px or percent sizes rendered on the server, min and max limits, collapsible panes, nested splitters and the APG window splitter keyboard model, with no React render during a drag.
category: Containers
order: 20
demos: [splitter, splitter-panes]
---

`Splitter` lays out panes side by side (or stacked) with draggable
separators. Panes are CSS flex items with a `flex-basis`, so the server
HTML already has the final layout: no measurement and no layout shift when
it hydrates. It lives in `@salmonui/layout/splitter` with its own
stylesheet.

```tsx
import { Splitter } from '@salmonui/layout/splitter';
import '@salmonui/layout/splitter/styles.css';

export function Workspace() {
  const [sizes, setSizes] = useState({ nav: 240 });
  return (
    <Splitter sizes={sizes} onSizesChange={setSizes} style={{ height: '100vh' }}>
      <Splitter.Pane id="nav" minSize={160} maxSize="40%" collapsible collapsedSize={48}>
        …
      </Splitter.Pane>
      <Splitter.Pane id="main">…</Splitter.Pane>
    </Splitter>
  );
}
```

<!-- demo: splitter -->

## Panes and sizes

- `Splitter.Pane` (also `SplitterPane`) children, or a `panes` array of the
  same props plus `content`; both compile to the same markup.
- Panes are addressed by `id`, not index. `sizes` / `defaultSizes` /
  `onSizesChange` hold sizes by pane id; a pane's own `defaultSize` is used
  when `sizes` has no entry. A size is px (`240` or `'240px'`) or a percent
  of the splitter (`'30%'`); panes without a size share the remaining space.
- `minSize` / `maxSize` (px or %) limit pointer and keyboard resizing and
  are also CSS limits.
- `resizable={false}` on a pane: the separator between two such panes is
  not focusable and does not move. `disabled` makes every separator inert.
- Add or remove panes by rendering or removing `Splitter.Pane` children;
there are no imperative pane methods. Store `sizes` to
  persist them.

## Resizing

During a pointer drag the separator writes `flex-basis` once per animation
frame; React does not render. `onResizeStart([idA, idB])` fires first,
`onResize(sizes)` per frame with px sizes (not for React state), and
`onSizesChange(sizes)` once on release, with each pane in its own unit (a
percent pane stays a percent). Escape cancels a drag.

The separator is a 1 px line with a 24 px touch hit area (there is
the size is not configurable). Pointer events cover mouse, touch and pen.

## Collapse

`collapsible`, `collapsed` / `defaultCollapsed` / `onCollapsedChange`,
`collapsedSize` (default 0; keep a rail visible with e.g. 48). The change
callback receives an event whose `preventDefault()` vetoes the change for
an uncontrolled pane; `onAfterCollapsedChange` fires after it was applied.
To collapse or expand from code, set the controlled `collapsed` prop on the
pane, addressed by its `id`.

<!-- demo: splitter-panes -->

## Keyboard and accessibility

APG Window Splitter: each separator is `role="separator"` with
`aria-orientation`, `aria-controls` (the pane before it), an accessible
name (`localeText.resizePane`, default "Resize") and `aria-valuenow` /
`aria-valuemin` / `aria-valuemax` as the percent of that pane.

| Key | Action |
| --- | --- |
| Left / Right (horizontal), Up / Down (vertical) | Resize by 10 px |
| Shift + arrow | Resize by 50 px |
| Home / End | The pane's minimum / maximum |
| Enter | Collapse or expand the collapsible pane |

## Nesting, RTL and styling

- Nested splitters are plain composition: a `Splitter` inside a
  `Splitter.Pane`; each separator handles its own pointer and keyboard.
- In a horizontal splitter under `dir="rtl"` the first pane is on the
  right, and pointer moves and Left / Right keys follow the reading
  direction. Reverse panes by reordering children.
- `className` / `style` on `Splitter` and on each pane; hooks
  `.salmon-splitter[data-orientation]`, `.salmon-splitter-pane[data-pane]`
  (`data-collapsed`), `.salmon-splitter-separator` (`data-dragging`,
  `data-disabled`). Content is `ReactNode`; React owns the
  lifecycle.

API reference: [`@salmonui/layout/splitter`](/docs/reference/layout/splitter).

## Bundle

The JavaScript is 2.6 KB gzip and the stylesheet 0.44 KB.
