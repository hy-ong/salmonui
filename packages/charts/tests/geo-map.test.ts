import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { GeoMap } from '@salmonui/charts/geo-map';
import { boundsOf, centroidOf, clusterPoints, featuresOf, fitBounds, geoPath, geometryContains, invert, projection, tilesFor, type GeoFeatureCollection, type ProjectionName } from '../dist/viz/index.js';
import { frameOf, layoutLayer, layoutMarkers, markerGlyph, routePath, scaleColor, toScreen } from '../dist/geo-map/model.js';
import { tileUrl } from '../dist/geo-map/tiles.js';

// GeoMap: projections, GeoJSON paths, clustering, the layer model and
// server markup. The GeoJSON below is hand-written test data.

const render = (el: Parameters<typeof renderToString>[0]): string => renderToString(el);
const NAMES = ['Northwest', 'North', 'Northeast', 'West', 'Central', 'East', 'Southwest', 'South', 'Southeast'];
const REGIONS: GeoFeatureCollection = {
  type: 'FeatureCollection',
  features: NAMES.map((name, i) => {
    const lon0 = -10 + (i % 3) * 10;
    const lat1 = 60 - Math.floor(i / 3) * 10;
    return { type: 'Feature', id: `r${i}`, properties: { name, area: i }, geometry: { type: 'Polygon', coordinates: [[[lon0, lat1], [lon0 + 10, lat1], [lon0 + 10, lat1 - 10], [lon0, lat1 - 10], [lon0, lat1]]] } };
  }),
};
const POP = NAMES.map((region, i) => ({ region, population: [12, 30, 8, 45, 60, 22, 5, 18, 40][i]!, status: i % 2 ? 'odd' : 'even' }));
const CITIES = [
  { name: 'Alpha', latitude: 55, longitude: -4 },
  { name: 'Beta', latitude: 54.9, longitude: -3.9 },
  { name: 'Gamma', latitude: 45, longitude: 6 },
];

describe('Projections', () => {
  it('every projection maps the origin to the origin and round-trips through its inverse', () => {
    const names: ProjectionName[] = ['mercator', 'equirectangular', 'miller', 'eckert3', 'eckert5', 'eckert6', 'winkelTripel', 'aitoff'];
    for (const name of names) {
      const p = projection(name);
      const [x0, y0] = p(0, 0);
      assert.ok(Math.abs(x0) < 1e-12 && Math.abs(y0) < 1e-12, name);
      for (const [lon, lat] of [[30, 40], [-120, -35], [170, 70]] as const) {
        const [x, y] = p(lon, lat);
        const [ilon, ilat] = invert(name, x, y);
        assert.ok(Math.abs(ilon - lon) < 1e-5 && Math.abs(ilat - lat) < 1e-5, `${name} ${lon},${lat} -> ${ilon},${ilat}`);
      }
    }
    // Known values: Mercator y at 45 degrees is ln(tan(67.5 degrees)); Miller is 1.25 ln(tan(pi/4 + 0.4 phi)); equirectangular in radians.
    assert.ok(Math.abs(projection('mercator')(0, 45)[1] - 0.881373587) < 1e-8);
    assert.ok(Math.abs(projection('miller')(0, 45)[1] - 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * (Math.PI / 4)))) < 1e-12);
    assert.deepEqual(projection('equirectangular')(180, 90), [Math.PI, Math.PI / 2]);
    // Eckert IV-family width: the Eckert V equator spans 2 * 2π / sqrt(2 + π).
    assert.ok(Math.abs(projection('eckert5')(180, 0)[0] - (2 * Math.PI) / Math.sqrt(2 + Math.PI)) < 1e-12);
    // Mercator clamps the poles.
    assert.ok(Number.isFinite(projection('mercator')(0, 90)[1]));
  });

  it('GeoJSON paths, bounds, fitting, centroids and containment', () => {
    const feats = featuresOf(REGIONS);
    assert.equal(feats.length, 9);
    assert.equal(featuresOf({ type: 'Point', coordinates: [1, 2] }).length, 1);
    const d = geoPath(feats[0]!.geometry, (x, y) => [x, -y]);
    assert.equal(d, 'M-10,-60L0,-60L0,-50L-10,-50L-10,-60Z');
    assert.equal(geoPath({ type: 'MultiLineString', coordinates: [[[0, 0], [1, 1]], [[2, 2], [3, 3]]] }, (x, y) => [x, y]), 'M0,0L1,1M2,2L3,3');
    const b = boundsOf(feats.map((f) => f.geometry), (x, y) => [x, y])!;
    assert.deepEqual(b, { x0: -10, y0: 30, x1: 20, y1: 60 });
    const fit = fitBounds(b, 300, 300, 0);
    assert.equal(fit.scale, 10);
    assert.deepEqual(centroidOf(feats[4]!.geometry, (x, y) => [x, y]), [5, 45]);
    assert.ok(geometryContains(feats[4]!.geometry, 5, 45));
    assert.ok(!geometryContains(feats[4]!.geometry, 15, 45));
  });
});

describe('Clustering and tiles', () => {
  it('grid clustering merges points that share a cell', () => {
    const c = clusterPoints([{ x: 1, y: 1, index: 0 }, { x: 10, y: 5, index: 1 }, { x: 100, y: 100, index: 2 }], 48);
    assert.equal(c.length, 2);
    assert.deepEqual(c[0]!.members, [0, 1]);
    assert.deepEqual([c[0]!.x, c[0]!.y], [5.5, 3]);
    assert.equal(clusterPoints(Array.from({ length: 10000 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100), index: i })), 50).length, 4);
  });

  it('XYZ tile ranges and URL templates', () => {
    const t = tilesFor(512, 0, 0, 512, 512);
    assert.equal(t.z, 1);
    assert.equal(t.tiles.length, 4);
    assert.deepEqual(t.tiles[3], { x: 1, y: 1, px: 256, py: 256 });
    // Longitudes wrap.
    assert.equal(tilesFor(256, 128, 0, 256, 256).tiles[0]!.x, 0);
    assert.equal(tileUrl('https://{s}.tile.test/{z}/{x}/{y}.png', 3, 4, 5, ['a', 'b']), 'https://b.tile.test/3/4/5.png');
  });
});

describe('GeoMap model', () => {
  const frame = frameOf({ layers: [{ shapes: REGIONS }], activeBase: 0, projection: 'equirectangular', width: 400, height: 400 }, invert);

  it('the fitted frame converts both ways', () => {
    const [x, y] = frame.toBase(5, 45);
    assert.deepEqual([Math.round(x), Math.round(y)], [200, 200]);
    const [lon, lat] = frame.fromBase(x, y);
    assert.ok(Math.abs(lon - 5) < 1e-9 && Math.abs(lat - 45) < 1e-9);
    const planar = frameOf({ layers: [{ shapes: REGIONS, geometry: 'planar' }], activeBase: 0, projection: 'mercator', width: 400, height: 400 }, invert);
    assert.ok(planar.toBase(-10, 30)[1] < planar.toBase(-10, 60)[1], 'planar y grows downwards');
    // Tile layers force Web Mercator.
    assert.equal(frameOf({ layers: [{ shapes: REGIONS, tiles: { url: 'x', attribution: 'a' } }], activeBase: 0, projection: 'aitoff', width: 400, height: 400 }, invert).projection, 'mercator');
  });

  it('data join and range, value and opacity color scales', () => {
    const m = layoutLayer({ shapes: REGIONS, data: POP, dataKey: 'region', colorScale: { kind: 'range', field: 'population', stops: [{ from: 0, to: 20, color: '#aaa' }, { from: 20, to: 100, color: '#333' }] } }, 0, frame, new Set(), new Set());
    assert.equal(m.shapes.find((s) => s.name === 'Central')!.fill, '#333');
    assert.equal(m.shapes.find((s) => s.name === 'Northwest')!.fill, '#aaa');
    assert.equal((m.shapes.find((s) => s.name === 'Central')!.datum as { population: number }).population, 60);
    const v = layoutLayer({ shapes: REGIONS, data: POP, dataKey: 'region', colorScale: { kind: 'value', field: 'status', stops: [{ value: 'odd', color: '#f00' }] } }, 0, frame, new Set(), new Set());
    assert.equal(v.shapes.find((s) => s.name === 'North')!.fill, '#f00');
    assert.equal(scaleColor({ kind: 'opacity', field: 'x', color: '#00f', opacity: [0.2, 1] }, 50, [0, 100]).opacity, 0.6);
    // Stops without a color take the palette; hidden legend stops drop their shapes.
    const p = layoutLayer({ shapes: REGIONS, data: POP, dataKey: 'region', colorScale: { kind: 'range', field: 'population', stops: [{ from: 0, to: 20 }, { from: 20, to: 100 }] } }, 0, frame, new Set(), new Set([1]));
    assert.equal(p.shapes.length, 4);
    assert.equal(p.shapes[0]!.fill, 'var(--salmon-chart-1)');
    // Feature properties work without data.
    assert.equal(layoutLayer({ shapes: REGIONS, colorScale: { kind: 'range', field: 'area', stops: [{ from: 8, to: 9, color: '#0f0' }] } }, 0, frame, new Set(), new Set()).shapes[8]!.fill, '#0f0');
  });

  it('getShapeStyle and markers.getStyle', () => {
    const m = layoutLayer({ shapes: REGIONS, getShapeStyle: (ctx) => (ctx.name === 'East' ? { fill: '#123' } : ctx.name === 'West' ? { hidden: true } : undefined) }, 0, frame, new Set(), new Set());
    assert.equal(m.shapes.find((s) => s.name === 'East')!.fill, '#123');
    assert.equal(m.shapes.find((s) => s.name === 'West'), undefined);
    const mk = layoutMarkers({ data: CITIES, getStyle: (c) => (c.index === 2 ? { fill: '#abc' } : undefined) }, 'g', frame, { k: 1, cx: 200, cy: 200 }, 400, 400);
    assert.equal(mk.markers[2]!.fill, '#abc');
  });

  it('markers with shapes, size and color fields; clusters split as the map zooms in', () => {
    const view = { k: 1, cx: 200, cy: 200 };
    const r = layoutMarkers({ data: CITIES, shape: 'diamond', labelField: 'name' }, 'g', frame, view, 400, 400);
    assert.equal(r.markers.length, 3);
    assert.equal(r.markers[0]!.label, 'Alpha');
    for (const shape of ['circle', 'rectangle', 'triangle', 'invertedTriangle', 'diamond', 'pentagon', 'star', 'cross', 'verticalLine', 'horizontalLine', 'balloon'] as const) assert.ok(markerGlyph(shape, 10, 10, 10).length > 0, shape);
    const sized = layoutMarkers({ data: [{ latitude: 40, longitude: 0, v: 1, c: '#111' }, { latitude: 50, longitude: 0, v: 3 }], sizeField: 'v', sizeRange: [10, 30], colorField: 'c' }, 'g', frame, view, 400, 400);
    assert.deepEqual(sized.markers.map((m) => m.size), [10, 30]);
    assert.equal(sized.markers[0]!.fill, '#111');
    const near = layoutMarkers({ data: CITIES, cluster: true }, 'g', frame, view, 400, 400);
    assert.equal(near.clusters.length, 1);
    assert.equal(near.clusters[0]!.count, 2);
    const zoomed = layoutMarkers({ data: CITIES, cluster: true }, 'g', frame, { k: 200, cx: frame.toBase(-4, 55)[0], cy: frame.toBase(-4, 55)[1] }, 400, 400);
    assert.equal(zoomed.clusters.length, 0);
  });

  it('a spider-expanded cluster fans its markers out on a circle with connector lines', () => {
    const view = { k: 1, cx: 200, cy: 200 };
    const group = { data: CITIES, cluster: { expand: 'spider' as const } };
    const closed = layoutMarkers(group, 'g', frame, view, 400, 400);
    assert.equal(closed.clusters.length, 1);
    const c = closed.clusters[0]!;
    // Keyed by the first member (data index 0): the cluster is replaced by its two markers.
    const open = layoutMarkers(group, 'g', frame, view, 400, 400, c.members[0]);
    assert.equal(open.clusters.length, 0);
    const fanned = open.markers.filter((m) => m.spoke);
    assert.deepEqual(fanned.map((m) => m.index).sort(), [0, 1]);
    for (const m of fanned) {
      assert.deepEqual(m.spoke, [c.x, c.y]);
      assert.equal(Math.round(Math.hypot(m.x - c.x, m.y - c.y)), 24);
      assert.ok(m.d.startsWith('M'));
    }
    // The fanned markers keep their data position; the other marker is untouched.
    assert.equal(fanned[0]!.latitude, CITIES[fanned[0]!.index]!.latitude);
    assert.equal(open.markers.find((m) => m.index === 2)!.spoke, undefined);
  });

  it('routes bend by their curvature', () => {
    assert.equal(routePath([[0, 0], [10, 0]], 0), 'M0,0L10,0');
    assert.equal(routePath([[0, 0], [10, 0]], 0.5), 'M0,0Q5,5 10,0');
  });

  it('the view transform zooms around its center', () => {
    assert.deepEqual(toScreen({ k: 2, cx: 100, cy: 100 }, 200, 200, 110, 90), [120, 80]);
  });
});

describe('GeoMap server markup', () => {
  const layers = [{ shapes: REGIONS, data: POP, dataKey: 'region', colorScale: { kind: 'range' as const, field: 'population', stops: [{ from: 0, to: 30, color: '#9ecae1', label: 'Low' }, { from: 30, to: 100, color: '#08519c', label: 'High' }] }, markers: { data: CITIES, labelField: 'name' } }];

  it('one focusable map group, a visible title, an accessible table and identical markup', () => {
    const html = render(createElement(GeoMap, { title: 'Population', subtitle: '2026', layers }));
    assert.match(html, /<figure[^>]*class="salmon-viz salmon-geo-map"/);
    assert.match(html, /role="group" aria-roledescription="map" aria-label="Population"[^>]*tabindex="0"/);
    assert.match(html, /class="salmon-geo-map-title">Population</);
    assert.match(html, /class="salmon-geo-map-subtitle">2026</);
    assert.match(html, /<th scope="row">Central<\/th><td>60<\/td>/);
    assert.match(html, /<th scope="row">Alpha<\/th><td>55, -4<\/td>/);
    assert.equal(render(createElement(GeoMap, { title: 'Population', layers })), render(createElement(GeoMap, { title: 'Population', layers })));
  });

  it('base layers are alternatives through activeLayer; overlays draw over the active one', () => {
    const two = [{ id: 'a', shapes: REGIONS }, { id: 'b', shapes: { type: 'FeatureCollection' as const, features: REGIONS.features.slice(0, 2) } }, { id: 'o', kind: 'overlay' as const, polygons: [{ points: [[50, 0], [45, 5], [40, 0]] as const }] }];
    const a = render(createElement(GeoMap, { layers: two }));
    assert.match(a, /data-layer="a"/);
    assert.doesNotMatch(a, /data-layer="b"/);
    assert.match(a, /data-layer="o"/);
    const b = render(createElement(GeoMap, { layers: two, activeLayer: 'b' }));
    assert.match(b, /data-layer="b"/);
    assert.equal([...b.matchAll(/data-target="shape"/g)].length, 2);
    assert.match(render(createElement(GeoMap, { layers: two, defaultActiveLayer: 'b' })), /data-layer="b"/);
  });

  it('selectedShapes marks shapes', () => {
    const html = render(createElement(GeoMap, { layers, selectedShapes: ['Central'] }));
    assert.match(html, /data-key="layer0:Central" data-selected=""/);
    assert.match(render(createElement(GeoMap, { layers, defaultSelectedShapes: ['East'] })), /data-key="layer0:East" data-selected=""/);
  });

  it('a tile layer renders its attribution on the server and its tiles only on the client', () => {
    const html = render(createElement(GeoMap, { layers: [{ shapes: REGIONS, tiles: { url: 'https://tiles.test/{z}/{x}/{y}.png', attribution: createElement('a', { href: 'https://example.org' }, '© Example') } }] }));
    assert.match(html, /class="salmon-geo-map-attribution"><a href="https:\/\/example.org">© Example<\/a>/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /data-projection="mercator"/);
  });

  it('bubbles, labels, routes and polygons', () => {
    const html = render(createElement(GeoMap, {
      layers: [{ shapes: REGIONS, data: POP, dataKey: 'region', bubbles: { valueField: 'population', radius: [2, 20] }, labels: { overflow: 'hide' }, routes: [{ points: [[55, -4], [45, 6]], arrows: 'end', lineStyle: 'dashed' }], polygons: [{ points: [[50, 0], [45, 5], [40, 0]], color: '#f00' }] }],
    }));
    assert.equal([...html.matchAll(/class="salmon-geo-map-bubble"/g)].length, 9);
    assert.match(html, /<circle class="salmon-geo-map-bubble"[^>]*r="20"/);
    assert.match(html, /class="salmon-geo-map-label"[^>]*>Central</);
    assert.match(html, /class="salmon-geo-map-route"[^>]*stroke-dasharray="6 4"[^>]*marker-end=/);
    assert.match(html, /class="salmon-geo-map-polygon"[^>]*fill="#f00"/);
    const squares = render(createElement(GeoMap, { layers: [{ shapes: REGIONS, data: POP, dataKey: 'region', bubbles: { valueField: 'population', shape: 'square' } }] }));
    assert.match(squares, /<rect class="salmon-geo-map-bubble"/);
    // Narrow shapes hide their labels with overflow: 'hide' and trim them with 'trim'.
    const small = render(createElement(GeoMap, { width: 90, height: 90, layers: [{ shapes: REGIONS, labels: { overflow: 'hide' } }] }));
    assert.doesNotMatch(small, /class="salmon-geo-map-label"[^>]*>Northwest</);
    assert.match(render(createElement(GeoMap, { width: 120, height: 120, layers: [{ shapes: REGIONS, labels: { overflow: 'trim', overlap: 'show' } }] })), />[A-Za-z]+…</);
    const custom = render(createElement(GeoMap, { layers: [{ shapes: REGIONS, labels: { render: (ctx: { name: string }) => createElement('b', null, ctx.name.toUpperCase()) } }] }));
    assert.match(custom, /class="salmon-geo-map-label-content"[^>]*><b>CENTRAL<\/b>/);
  });

  it('the legend lists color-scale stops, markers or bubbles', () => {
    const html = render(createElement(GeoMap, { layers, legend: true }));
    assert.match(html, /role="toolbar" aria-label="Legend"/);
    assert.match(html, /<span class="salmon-visually-hidden">Low<\/span>/);
    assert.match(render(createElement(GeoMap, { layers, legend: { source: 'markers', mode: 'list' } })), /<span class="salmon-visually-hidden">Markers 1<\/span>/);
  });

  it('legend positions reserve the map area; float overlays it', () => {
    const clip = (legend: unknown) => /<clipPath[^>]*><rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(render(createElement(GeoMap, { layers, legend } as never)))!.slice(1).map(Number) as [number, number, number, number];
    const [, , w0, h0] = clip(undefined);
    assert.deepEqual([w0, h0], [600, 400]);
    const [bx, by, bw, bh] = clip(true);
    assert.ok(bx === 0 && by === 0 && bw === 600 && bh < 400);
    const [tx, ty, tw, th] = clip({ position: 'top' });
    assert.ok(tx === 0 && ty > 0 && tw === 600 && ty + th === 400);
    const [sx, sy, sw, sh] = clip({ position: 'start' });
    assert.ok(sx > 0 && sy === 0 && sx + sw === 600 && sh === 400);
    const [ex, , ew] = clip({ position: 'end' });
    assert.ok(ex === 0 && ew < 600);
    assert.deepEqual(clip({ position: 'float', x: 20, y: 30 }), [0, 0, 600, 400]);
    // The legend marks follow the position: on the start side, the first symbol sits left of the map.
    const start = render(createElement(GeoMap, { layers, legend: { position: 'start' } }));
    assert.match(start, /role="toolbar" aria-label="Legend"/);
    const float = render(createElement(GeoMap, { layers, legend: { position: 'float', x: 20, y: 30 } }));
    assert.match(float, /class="salmon-viz-legend-marks"[^]*?x="20"/);
  });

  it('draggable markers get a keyboard handle each; others do not', () => {
    const html = render(createElement(GeoMap, { layers: [{ shapes: REGIONS, markers: [{ id: 'pins', data: CITIES, labelField: 'name', draggable: true }, { id: 'fixed', data: CITIES }] }] }));
    assert.equal(html.match(/class="salmon-geo-map-handle"/g)!.length, 3);
    assert.match(html, /role="button" tabindex="0" class="salmon-geo-map-handle" aria-label="Alpha" aria-roledescription="movable marker" style="left:[\d.]+%;top:[\d.]+%"/);
  });

  it('annotations place React content', () => {
    const html = render(createElement(GeoMap, { layers, annotations: [{ x: '50%', y: 20, content: createElement('b', null, 'Note'), align: 'start' }] }));
    assert.match(html, /class="salmon-geo-map-annotation" data-align="start" style="left:50%;top:5%"><b>Note<\/b>/);
  });

  it('zoom shows the toolbar; view sets the transform', () => {
    const html = render(createElement(GeoMap, { layers, zoom: true, view: { center: [45, 5], zoom: 2 } }));
    assert.match(html, /role="toolbar" aria-label="Zoom"/);
    assert.match(html, /scale\(2\)/);
    // The buttons draw SVG glyphs in currentColor, not font characters.
    const buttons = [...html.matchAll(/<button[^>]*class="salmon-geo-map-toolbar-button"[^>]*>(.*?)<\/button>/g)].map((m) => m[1]!);
    assert.equal(buttons.length, 3);
    for (const b of buttons) assert.match(b, /^<svg viewBox="0 0 16 16"[^>]*stroke="currentColor"[^>]*aria-hidden="true"><path d="M[^"]+"><\/path><\/svg>$/);
  });
});
