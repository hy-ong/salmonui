---
title: Map overlays and tiles
description: GeoMap markers with shapes, size and color fields, clustering with zoom or spider expansion and dragging, bubbles, data labels, curved routes with arrows, polygons, a generic XYZ tile layer with attribution, annotations and coordinate conversion.
category: Maps
order: 20
demos: [geo-map-markers, geo-map-tiles-drag]
---

```tsx
import { GeoMap } from '@salmonui/charts/geo-map';
import '@salmonui/charts/geo-map/styles.css';

<GeoMap
  layers={[{ shapes, markers: { data: cities, labelField: 'name', shape: 'balloon', cluster: true }, routes: [{ points: [[55, -4], [36, 14]], arrows: 'end' }] }]}
  onMarkerClick={(ctx) => open(ctx.datum)}
/>;
```

Overlays belong to a layer and draw in screen space, so they keep their size
while the map zooms. Layers, projections, zoom, selection and keyboard
navigation are on the [GeoMap page](/docs/data-visualization/geo-map).

## Markers

`layer.markers` is one group or an array of groups: `data` with
`latitudeField` / `longitudeField` (default `latitude` / `longitude`),
`shape` (`circle`, `rectangle`, `triangle`, `invertedTriangle`, `diamond`,
`pentagon`, `star`, `cross`, `verticalLine`, `horizontalLine`, `balloon`),
`size` or `sizeField` scaled into `sizeRange`, `color` or `colorField`, a
`labelField` for tooltips and the table, and `render(ctx)` for any React
content (an image, an icon). `onMarkerClick(ctx)` receives the row and its
coordinates.

`markers.cluster` groups markers that share a 48 px grid cell (`cell`
changes it) into a counted cluster; clusters are recomputed per zoom level,
so they split as you zoom in. Clicking a cluster calls
`onClusterClick` and zooms into it; `expand: 'spider'` fans its markers out
on a circle around it with connector lines instead (a click elsewhere or
Escape closes it), and `expand: 'none'` keeps the view.
`cluster.render(ctx)` draws custom cluster content.

`markers.draggable` lets people move the markers of a group. A
pointer drag moves the marker with a DOM transform (never React state) and
calls `onMarkerMove({ markerId, layerId, groupId, index, datum, latitude,
longitude }, event)` once on release; the marker data is yours, so apply the
move:

```tsx
const [pins, setPins] = useState(initialPins);

<GeoMap
  layers={[{ shapes, markers: { id: 'pins', data: pins, labelField: 'name', draggable: true } }]}
  onMarkerMove={(move) => setPins((list) => list.map((p, i) => (i === move.index ? { ...p, latitude: move.latitude, longitude: move.longitude } : p)))}
/>;
```

Each draggable marker also has a focusable handle (`role="button"` with the
role description "movable marker", named by `labelField`): the arrow keys
move it 8 px per press and report each step with `event.source ===
'keyboard'`, and Enter or Space clicks it.

## Bubbles and labels

- `layer.bubbles: { valueField, radius: [min, max], shape: 'circle' |
  'square', color, colorScale }` draws one bubble per shape at its centroid,
  its area proportional to the joined value; `onBubbleClick` reports it.
- `layer.labels` (`true` or `{ field, overflow, overlap, render }`) writes a
  label at each shape's centroid: `overflow: 'hide'` drops labels wider than
  their shape, `'trim'` shortens them with an ellipsis, `overlap: 'hide'`
  (default) drops labels that collide, and `render(ctx)` draws custom content.

## Routes and polygons

- `layer.routes: [{ points, curvature, arrows: 'start' | 'end' | 'both',
  lineStyle: 'solid' | 'dashed' | 'dotted', color, width }]`.
- `layer.polygons: [{ points, color, label }]` draw filled areas from
  `[latitude, longitude]` points.

## Tiles

`layer.tiles: { url, attribution, minZoom, maxZoom, subdomains }` adds an XYZ
raster layer under the vector layers. `url` is a template with
`{z}`, `{x}`, `{y}` and optional `{s}`; `attribution` is required and always
rendered, also on the server. Tiles load on the client only (a lazy chunk
after hydration), so server HTML holds the vector layers. Follow your tile
provider's usage policy; the OpenStreetMap Foundation servers forbid heavy
use.

There is no built-in Bing or Azure Maps provider and no key flow (see the
[GeoMap page](/docs/data-visualization/geo-map#no-bundled-geo-data-or-tile-provider)):
build the provider URL, key included, in your application:

```tsx
<GeoMap
  zoom
  layers={[{
    shapes,
    tiles: {
      url: `https://tiles.example.com/{z}/{x}/{y}.png?key=${apiKey}`,
      attribution: <a href="https://tiles.example.com/terms">© Example Tiles</a>,
      maxZoom: 18,
    },
  }]}
/>;
```

<!-- demo: geo-map-tiles-drag -->

## Annotations and coordinates

- `annotations: [{ x, y, content, align: 'start' | 'center' | 'end' }]` place
  React content at drawing pixels or percentages.
- `api.toCoordinates({ x, y })` and `api.toPoint([lat, lon])` convert between
  drawing pixels and coordinates, and `onMapClick({ latitude, longitude })`
  reports the clicked position. `api.fitBounds(bounds | 'markers')`
  fits the view.

## Accessibility and events

Every marker is listed in the map's accessible table, named by its
`labelField`; draggable markers add one focusable handle each (see above).
Overlay events: `onMarkerClick(ctx)` and `onClusterClick(ctx)` with
the row or cluster members and coordinates, `onBubbleClick({ layerId, key,
value, datum })`, `onMarkerMove(move, { source, reason })` and
`onMapClick({ latitude, longitude })`. Types are in the
[API reference](/docs/reference/charts/geo-map).
