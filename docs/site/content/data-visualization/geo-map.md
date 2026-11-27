---
title: GeoMap
description: Maps from your own GeoJSON with eight projections, base and overlay layers, data joins and color scales, a legend, tooltips, shape selection, zoom and pan, keyboard navigation and an accessible table.
category: Maps
order: 10
demos: [geo-map-choropleth]
---

```tsx
import { GeoMap } from '@salmonui/charts/geo-map';
import '@salmonui/charts/geo-map/styles.css';

<GeoMap
  title="Population"
  layers={[{ shapes: regionsGeoJson, data: rows, dataKey: 'region', colorScale: { kind: 'range', field: 'population', stops } }]}
  zoom
  tooltip
/>;
```

The component is named `GeoMap` because `Map` shadows the JavaScript global.
The drawing is `width` x `height` px (default 600 x 400) and scales to its
container through `viewBox`. Layers can also be written as `<GeoMapLayer>`
children (same props), read when `layers` is absent.

## No bundled geo data or tile provider

`GeoMap` bundles neither map shapes nor a map provider integration; you
pass both in.

- **Shape data.** Salmon UI ships no geo data in
  any package, because geo data has its own licenses and update cycle and
  would put megabytes into a component package. Pass any GeoJSON
  `FeatureCollection`, `Feature` or geometry as `shapes`: use GeoJSON files
  you already have, or Natural Earth (public domain). Convert TopoJSON to GeoJSON in your application.
- **Bing and Azure Maps.** There is no `getBingUrlTemplate()` and
  no subscription key flow: provider APIs change and retire (Bing Maps for
  Enterprise is being retired), and keys and terms belong to the
  application. Build the provider's XYZ URL, key included, in your
  application and pass it as
  [`layer.tiles.url`](/docs/data-visualization/geo-map-overlays#tiles) with
  the provider's `attribution`.

## Layers

`layers` is an array. Layers with `kind: 'base'` (the default) are
alternatives: one is shown, chosen with the triad `activeLayer` /
`defaultActiveLayer` / `onActiveLayerChange` (default the first base layer).
Layers with `kind: 'overlay'` draw over it. `shapes` takes GeoJSON;
`geometry: 'planar'` reads coordinates as plain x / y for seat maps and floor
plans. The drawing is fitted to the active layer, or to `fitTo`
(`'markers'` or `[[lat, lon], [lat, lon]]`).

## Projections

`projection` is `'mercator'` (default), `'equirectangular'`, `'miller'`,
`'eckert3'`, `'eckert5'`, `'eckert6'`, `'winkelTripel'` or `'aitoff'`,
computed without d3-geo and inverted for `api.toCoordinates`. A map
with a tile layer always uses Web Mercator.

## Data and colors

- `data`, `dataKey` and `shapeKey` join rows to shapes: a row matches the
  feature whose `properties[shapeKey]` (default `name`) equals
  `row[dataKey]`. Fields may be paths (`'stats.population'`) and
  fall back to the feature properties.
- `colorScale: { kind: 'range' | 'value' | 'opacity', field, stops }`: range
  stops take `from` / `to`, value stops take `value`, and an opacity scale
  takes `color` and `opacity: [min, max]` across the field's extent; stops
  without a color take the categorical palette. `color` and
  `palette` fill shapes without a scale. Colors you pass are data colors and
  are used as given.
- `getShapeStyle(ctx)` returns `{ fill, stroke, opacity, hidden }` for any
  shape, `markers.getStyle(ctx)` the same for markers.

## Interaction

- `tooltip` shows the hovered shape, marker, bubble or cluster with its
  joined value; `tooltip.trigger: 'click'` waits for a click and
  `tooltip.render(ctx)` replaces the content.
- Selection is on by default (single); `selection={{ multiple: true }}` keeps
  several, `selection={false}` turns it off. The triad `selectedShapes` /
  `defaultSelectedShapes` / `onSelectedShapesChange` holds shape keys, and
  `highlight` (default on) shades the hovered shape.
- `zoom` turns on wheel, double-click, two-finger pinch and keyboard zoom
  plus a zoom toolbar; `zoom: { wheel, doubleClick, pinch, selection, min,
  max, toolbar }` switches each part (`selection` is off by default: Shift +
  drag draws a rectangle and the map zooms to it). `fitTo` and
  `api.fitBounds(bounds | 'markers')` frame the map. `pan` (default
  on with zoom) drags the map and Ctrl+arrows move it. The triad `view` /
  `defaultView` / `onViewChange` holds `{ center: [lat, lon], zoom }` and
  fires once per committed step: drag, pinch and selection frames move the
  drawing with DOM transforms only, and the release commits one view.
`api.panBy(direction)` pans from code.
- `legend` lists the color-scale stops of the active layer (`source:
  'shapes'`, default), the marker groups (`'markers'`) or the bubbles
  (`'bubbles'`); `mode: 'interactive'` (default) toggles the items and
  `'list'` only lists them. `position` is `'bottom'` (default),
  `'top'`, `'start'` or `'end'`, which reserve room beside the map, or
  `'float'`, which draws the legend over the map at `x` / `y` (px).
- `title` and `subtitle` are drawn over the map.

## Controlled state and events

`view`, `activeLayer` and `selectedShapes` are each controlled (pass the
value and its `on...Change`) or uncontrolled (pass `default...` or nothing).
Change callbacks receive the new value and `{ source, reason }`, where
`source` is `'pointer'`, `'keyboard'`, `'touch'` or `'api'`:

```tsx
import { useState } from 'react';
import { GeoMap, type GeoMapView } from '@salmonui/charts/geo-map';

const [view, setView] = useState<GeoMapView>({ center: [50, 10], zoom: 1 });

<GeoMap layers={layers} zoom view={view} onViewChange={(next) => setView(next)} />;
```

`onShapeClick({ layerId, key, name, datum })` and `onMapClick({ latitude,
longitude })` report clicks; the overlay events (`onMarkerClick`,
`onClusterClick`, `onMarkerMove`, `onBubbleClick`) are on the
[overlays page](/docs/data-visualization/geo-map-overlays).

`ref` receives a `GeoMapApi`: `element`, `fitBounds`, `panBy`,
`toCoordinates`, `toPoint`, `export({ format, fileName, scale })`, `toBlob`,
`toDataURL`, `toSVGString`, `print` and `focus`.

## Server rendering

The shapes, overlays, legend, title and accessible table render on the
server with the same markup as the first client render. The tile layer and
the entrance transition start after hydration, so server HTML holds the
vector layers only.

## Accessibility

The map is one tab stop (`role="group"` with the role description "map"): arrows move between shapes in reading order, Home / End jump to the
first and last, Enter or Space selects, `+` / `-` / `0` zoom, Ctrl+arrows pan,
Escape closes the tooltip and an open spider cluster. Draggable markers add
one tab stop each (see the overlays page). The focused shape is announced in a polite live
region and outlined; a visually hidden table lists every shape with its
joined value and every marker (`showDataTable` shows it).

The [overlays page](/docs/data-visualization/geo-map-overlays) covers
markers, clusters, bubbles, labels, routes, polygons, tiles, annotations and
coordinate conversion, including draggable markers and spider clusters.

The zoom buttons are a small `role="toolbar"` of three buttons with roving
focus and the Toolbar keyboard model, built into GeoMap rather than taken
from the Navigation `Toolbar`, which would add about 3 KB to the map's
initial bundle for three buttons.

All props and types are in the
[API reference](/docs/reference/charts/geo-map).
