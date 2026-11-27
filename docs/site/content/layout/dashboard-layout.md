---
title: Dashboard Layout
description: A grid of draggable, resizable panels placed from a serializable layout value, with vertical compaction, static panels, container-query stacking, RTL and keyboard moves announced to screen readers, and no React render during a drag.
category: Containers
order: 30
demos: [dashboard-layout]
---

`DashboardLayout` arranges panels on a grid of columns and rows. Each panel
is a CSS grid item placed from the layout value, so the server HTML
already has the final arrangement: no measurement and no layout shift when
it hydrates. It lives in `@salmonui/layout/dashboard-layout` with its own
stylesheet.

```tsx
import { DashboardLayout, type DashboardLayoutItem } from '@salmonui/layout/dashboard-layout';
import '@salmonui/layout/dashboard-layout/styles.css';

export function Board({ saved }: { saved: DashboardLayoutItem[] }) {
  const [layout, setLayout] = useState(saved);
  return (
    <DashboardLayout
      columns={12}
      rowHeight={80}
      gap={8}
      layout={layout}
      onLayoutChange={(next) => (setLayout(next), saveBoard(JSON.stringify(next)))}
      resizable
    >
      <DashboardLayout.Panel id="sales" header="Sales">…</DashboardLayout.Panel>
      <DashboardLayout.Panel id="traffic" header="Traffic">…</DashboardLayout.Panel>
    </DashboardLayout>
  );
}
```

<!-- demo: dashboard-layout -->

## Grid

- `columns` (default 12) and `gap` in px (default 8): one value or
  `[inline, block]`.
- `rowHeight` in px, or `cellAspectRatio` (cell width / height, default 1,
  square cells) when `rowHeight` is not set. The aspect ratio is computed
  in CSS from the container width, not measured.
- `showGridLines` draws the cell lines behind the panels.

## Layout value

The layout is an array of items, `{ id, x, y, w, h, minW, maxW, minH,
maxH, static }`: `x` is the column from the inline start and `y` the row,
both 0-based; `w` and `h` are spans in cells. It is plain data and is the
serialized form: store it as JSON and pass it back as `layout` or
`defaultLayout` to restore the arrangement.

- `layout` / `defaultLayout` / `onLayoutChange(layout)`: the callback fires
  once per committed drag, resize or keyboard drop with every panel's item.
- `DashboardLayout.Panel` (also `DashboardLayoutPanel`) takes `id`,
  `header`, `children`, `className`, `style` and other div attributes. The
  `header` names the panel for assistive technology; pass `aria-label`
  when there is no text header.
- Add, remove, move or resize panels by changing `layout` and the
  children; there are no imperative panel methods. A child without an item
  gets a 1 x 1 cell at the bottom; an item without a child is ignored.
- The rendered layout is always settled: sizes are clamped to `minW` /
  `maxW` / `minH` / `maxH` and the column count, overlaps are resolved and,
  with `compact="vertical"` (the default), panels float up into free
  space. `compact={false}` keeps gaps.
- `static: true` pins an item: it is never dragged, resized or pushed by
  other panels, and is not in the tab order.

## Dragging and resizing

- `draggable` (default true) moves panels with the pointer; `dragHandle` is
  a CSS selector of the handle inside the panel, for example
  `".salmon-dashboard-panel-header"`.
  Without it the whole panel is the handle, except buttons, links and form
  fields inside it, and text in the panel cannot be selected with the
  mouse; set `dragHandle` to keep the content selectable. Give a custom
  handle `touch-action: none`.
- `resizable`: `true` adds the bottom-end corner handle, or pass the
  handles, `'top' | 'bottom' | 'start' | 'end'
  | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end'`; `start` and
  `end` follow the reading direction.
- During a drag only CSS changes: the dragged panel follows the pointer
  with a `transform`, the panels it displaces move to their new cells with
  `transform`, and a placeholder shows the drop cell. While resizing, the
  panel's size is written directly. React does not render until the drop,
  which commits the layout once (`onLayoutChange`). Escape cancels a drag.
  The only callback is `onLayoutChange` on drop; per-move drag and resize
  callbacks are not offered, so a drag never runs application code per
  frame.

## Responsive stacking

`responsive={{ stackBelow: 600 }}` stacks the panels in one column, in
layout order (top to bottom, then inline start to end), when the
dashboard is narrower than 600 px. Each panel keeps its row span. It is a container query on the
dashboard's own width, so the server HTML is right for any viewport and
nothing is measured. Stacked panels are not dragged or resized.
`stackBelow` must be at least 100. Without `responsive` the panels never
stack.

## Keyboard and accessibility

Each movable panel is a `role="group"` with `aria-roledescription="panel"`,
named by its header, and described by the keyboard instructions.

| Key | Action |
| --- | --- |
| Tab | Moves between panels and their content |
| Enter / Space | Picks the focused panel up, or drops it |
| Arrow keys | Move the picked-up panel by one cell (past a neighbour when compaction would undo the step) |
| Shift + arrow keys | Resize the picked-up panel by one cell |
| Escape | Cancels: the panel returns to where it was picked up |

Every step is announced through a polite live region ("Sales moved to row
1, column 2."); leaving the panel cancels the move. `localeText` replaces
the texts (`panel`, `instructions`, `grabbed`, `moved`, `resized`,
`dropped`, `cancelled`) with `{label}`, `{row}`, `{column}`, `{width}` and
`{height}` placeholders.

## RTL and styling

- Under `dir="rtl"` column 1 is on the right: `x` is logical, the pointer
  and the Left / Right keys follow the reading direction.
- Content is `ReactNode`, never an HTML string, so no sanitizer is needed;
  React owns the lifecycle, so there are no create or destroy events.
- `className` / `style` on `DashboardLayout` and each panel; hooks
  `.salmon-dashboard` (`data-active` while dragging, `data-stack-below`,
  `data-grid-lines`), `.salmon-dashboard-panel[data-id]` (`data-static`,
  `data-grabbed`, `data-dragging`), `.salmon-dashboard-panel-header`,
  `.salmon-dashboard-panel-content`, `.salmon-dashboard-resize[data-edge]`
  and `.salmon-dashboard-placeholder`.

The JavaScript is 4.5 KB gzip, including the layout algorithm, and the
stylesheet 1.2 KB.

API reference: [`@salmonui/layout/dashboard-layout`](/docs/reference/layout/dashboard-layout).
