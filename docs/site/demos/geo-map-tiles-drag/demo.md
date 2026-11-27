---
title: Tile layer and draggable markers
description: A GeoMap with an XYZ tile layer and its required attribution under vector regions, plus delivery stops you drag with the pointer or move with the arrow keys, reported by onMarkerMove.
category: data-visualization
---

The tile layer uses a URL template with `{z}`, `{x}` and `{y}`; here every
tile is a small SVG that prints its own coordinates, so you can watch the
zoom level and tile grid change as you zoom (wheel, pinch or the zoom
buttons). In an application, point `url` at your tile provider and pass its
attribution. Tiles load on the client only; the server HTML holds the
regions, the markers and the attribution.

Drag a stop, or Tab to its handle and press the arrow keys: `onMarkerMove`
fires once on release (or per key press) with the new latitude and
longitude, and the demo writes them back to its marker data.
