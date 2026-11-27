---
title: SankeyChart
description: Sankey flow diagrams from @salmonui/charts/sankey-chart with horizontal or vertical layout, node and link colors, gradient links, labels, a node legend, adjacent highlight, tooltips and node and flow keyboard navigation.
category: Data Visualization
order: 60
demos: [sankey-chart-basic, sankey-chart-budget]
---

`SankeyChart` lives in `@salmonui/charts/sankey-chart`. The layout (node
columns from the longest path, iterative relaxation, link bands) is
computed without d3 and identically on the server and the client.

```tsx
import { SankeyChart } from '@salmonui/charts/sankey-chart';
import '@salmonui/charts/sankey-chart/styles.css';

<SankeyChart nodes={[{ id: 'a', label: 'Coal' }, { id: 'b', label: 'Grid' }]} links={[{ source: 'a', target: 'b', value: 30 }]} height={320} />
```

<!-- demo: sankey-chart-basic -->

## Layout and colors

`orientation` is `'horizontal'` (default) or `'vertical'`; `nodeWidth`
(default 16 px) and `nodePadding` (default 12 px) size the nodes,
`node.offset` shifts a node along its column and `curvature` (0 to 1,
default 0.5) bends the links. Links that close a cycle or name
an unknown node are dropped. Nodes take the derived palette or
`node.color` (a data color); `linkColor` is `'source'` (default),
`'target'` or `'gradient'`. `getNodeStyle`, `getLinkStyle` and
`formatLabel` restyle and relabel; `labels` is `true`, `false` or
`{ position: 'inside' | 'outside' }`. `format` and `locale` format the
values in labels, tooltips, announcements and the table.

## Interaction

Hovering a node or a link dims everything not adjacent to it
(`highlight: 'adjacent' | false`, default `'adjacent'`) and shows the
tooltip (`tooltip: { renderNode, renderLink }`). `onNodeClick(node, event)`
and `onNodeHover(node | null)` receive `{ index, id, label, value, column,
color }`; `onLinkClick(link, event)` and `onLinkHover(link | null)` receive
`{ index, source, target, value }` with both node records, and `event.source`
is `'pointer'`, `'keyboard'` or `'touch'`. The chart has no controlled
state. `legend` (`true` or `{ position, title }`) lists the nodes; hovering
an entry highlights that node's flows. `onResize`
reports the measured size, and `ref` receives the instance (`export`,
`toBlob`, `toDataURL`, `toSVGString`, `print`, `focus`).

<!-- demo: sankey-chart-budget -->

## Keyboard and accessibility

One tab stop. Arrow keys move between the nodes of a column and to the
nearest node of the next or previous column; Enter steps into the focused
node's flows (arrows cycle them) and Escape returns to the node. Enter on
a node and Enter or Space on a flow fire `onNodeClick` / `onLinkClick`;
Space on a node fires `onNodeClick` without stepping in. A polite
live region announces "Grid: 70, 3 incoming, 2 outgoing" or "Grid to Homes:
40". The accessible table lists source, target and value.

## Server rendering

The layout is pure, so the server renders the final nodes, links, labels,
legend and table. Without `height` (prop or CSS) the server renders the
nominal size and the chart relays out once after hydration (`onResize`);
tooltips and the entrance animation are client only. See
[Size, animation and RTL](/docs/data-visualization/size-animation-rtl).

Node strokes, opacity and fonts are system-owned, not props; see
[Rendering and colors](/docs/data-visualization/rendering-and-colors).
Every prop is listed in the [API reference](/docs/reference/charts/sankey-chart).
