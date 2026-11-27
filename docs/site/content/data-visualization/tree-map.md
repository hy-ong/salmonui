---
title: TreeMap
description: Tree maps from @salmonui/charts/tree-map with grouped or hierarchical data, squarified and slice-and-dice layouts, headers, leaf labels, color scales, drill-down with breadcrumbs, selection and tree keyboard navigation.
category: Data Visualization
order: 50
demos: [tree-map-drill, tree-map-portfolio]
---

`TreeMap` lives in `@salmonui/charts/tree-map`. Flat records are grouped by
`levels: [{ groupBy }]`; hierarchical records use `childrenField`. Leaves
are weighted by `weightField`.

```tsx
import { TreeMap } from '@salmonui/charts/tree-map';
import '@salmonui/charts/tree-map/styles.css';

<TreeMap data={rows} weightField="cost" levels={[{ groupBy: 'dept' }]} leaves={{ labelField: 'team' }} height={380} />
```

<!-- demo: tree-map-drill -->

## Layout

`layout` is `'squarified'` (default), `'sliceHorizontal'`,
`'sliceVertical'` or `'sliceAuto'`; `direction` is `'topStart'`,
`'topEnd'`, `'bottomStart'` or `'bottomEnd'` (the drawing does not mirror
under `dir="rtl"`, like data axes; choose `topEnd` explicitly). Each level
takes `groupBy` (a field name or a function of the record), `gap` (px,
default 2) and `header` (`true` by default, `false` or `{ format, render,
align: 'start' | 'center' | 'end' }`).

`leaves: { labelField, format, labelPosition, labelOverflow, render, gap,
showValue }` (`gap` default 1 px; `format` is `Intl.NumberFormatOptions` or a
function of the value). `labelPosition` is one of nine positions (`'topStart'` ...
`'bottomEnd'`); `labelOverflow` is `'trim'` (ellipsis, default), `'hide'`,
`'wrapWord'` or `'wrap'`. `render(item)` lays HTML over the leaf.

## Colors

Top-level groups take the derived palette (or `palette` data colors);
`colorField` reads a data color per record, and `colorScale: { kind:
'range' | 'value' | 'opacity', field, stops }` maps a field by range start,
by exact value, or to opacity (desaturation: 30 % at the first stop value, full at the last).
`getItemStyle(item)` has the last word.

<!-- demo: tree-map-portfolio -->

## Drill-down, selection, legend

With `drill="click"` (default) a click on a group, or Enter, drills in;
Backspace and Escape drill out; `drill={false}` turns drilling off. The path
(an array of group keys from the root) is the `path` / `defaultPath` /
`onPathChange(path, { source, reason })` triad: with `path` the drill is
controlled, so the application can persist it or veto it by not applying the
change; with `defaultPath` the component keeps it. `reason` is `'drill'`,
`'breadcrumb'` or `'keyboard'`. `breadcrumbs` renders a path navigation
(`nav` > `ol` with buttons and `aria-current`, the root labelled by
`rootLabel`, default "All"); `showParentLevels` keeps the ancestors as header
bands.

```tsx
import { useState } from 'react';
import { TreeMap, type TreeMapPath } from '@salmonui/charts/tree-map';

function Costs({ rows }: { rows: readonly { dept: string; team: string; cost: number }[] }) {
  const [path, setPath] = useState<TreeMapPath>([]);
  return (
    <TreeMap
      data={rows}
      weightField="cost"
      levels={[{ groupBy: 'dept' }]}
      leaves={{ labelField: 'team' }}
      path={path}
      onPathChange={setPath}
      breadcrumbs
      height={380}
    />
  );
}
```
 `selection` (`true`
or `{ mode: 'item' | 'group', multiple }`) uses `selectedItems` /
`defaultSelectedItems` / `onSelectedItemsChange`. `legend` lists the
top-level groups; `mode: 'interactive'` highlights a group on hover.
`highlight` (default `true`), `onItemHover(item | null)`,
`onItemClick(item, event)` and the tooltip (`tooltip: true` or
`{ render(item) }`) complete the interaction; items are `TreeMapItem`s
(`path`, `label`, `value`, `depth`, `leaf`, `datum`, `color`). The root
`<figure>` also takes `onClick`, `onDoubleClick`, `onContextMenu` and
`onPointerMove`.

## Keyboard and accessibility

APG Tree View semantics: one tab stop, arrows move across the siblings of
the drilled node, Home / End to the first and last sibling, Enter drills in
(or activates a leaf), Space selects, Backspace / Escape drill out (at the
root Escape closes the tooltip); the focused item is announced. The accessible
equivalent is a nested list of the hierarchy instead of a flat table.
`title`, `subtitle` and `description` label the figure.

## Server rendering and API

The layout is a pure function of `data` and the size, so the server renders
the final markup at `width` / `height` (including a controlled or default
`path`) and hydration matches; tooltips and hover are client only.
`animated` (default `true`) runs the transition after hydration with the
opt-in `@salmonui/charts/viz-animations.css` and is off under
`prefers-reduced-motion`. `onResize` reports size changes.

`ref` receives a `TreeMapApi`: `element`, `export(options)`, `toBlob`,
`toDataURL`, `toSVGString`, `print()` and `focus()`. Every prop and type is
in the [API reference](/docs/reference/charts/tree-map).

Custom content uses render props (`leaves.render`, `header.render`,
`tooltip.render`, `getItemStyle`), not HTML string templates. `data` is a
plain array: load it through a `@salmonui/data` source or your own fetch.
Visual tokens are system-owned (see [Rendering and colors](/docs/data-visualization/rendering-and-colors)).
