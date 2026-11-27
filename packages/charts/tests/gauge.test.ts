import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Gauge } from '@salmonui/charts/gauge';
import { angleOf, circleOf, layoutGauge, positionOf, sweepOf, trackOf, valueAtAngle, valueAtPosition, type GaugeLayoutInput } from '../dist/gauge/layout.js';
import { snap, stepOf, valueAtPoint } from '../dist/gauge/drag.js';
import { textWidth } from '../dist/viz/index.js';

// Gauge: pure geometry and server markup.

const render = (el: Parameters<typeof renderToString>[0]): string => renderToString(el);
const base: GaugeLayoutInput = {
  shape: 'circular', width: 240, height: 240, orientation: 'horizontal', container: 'normal', center: [0.5, 0.5], rangeGap: 0,
  axes: [{}], pointers: [], values: [], hiddenRanges: new Set(), bottomInset: 0,
};

describe('Gauge geometry', () => {
  it('angles, sweep direction, radius and center', () => {
    assert.equal(sweepOf(225, 135, 'clockwise'), 270);
    assert.equal(sweepOf(225, 135, 'counterclockwise'), -90);
    assert.equal(sweepOf(0, 0, 'clockwise'), 360);
    const c = circleOf(base, { min: 0, max: 100 });
    assert.deepEqual([c.cx, c.cy, c.r], [120, 120, 112]);
    assert.equal(angleOf(c, 0), 225);
    assert.equal(angleOf(c, 50), 360);
    assert.equal(angleOf(c, 100), 495);
    assert.equal(angleOf(c, 150), 495);
    const ccw = circleOf(base, { startAngle: 90, endAngle: 270, direction: 'counterclockwise' });
    assert.equal(angleOf(ccw, 50), 0);
    assert.equal(circleOf(base, { radius: 0.5 }).r, 56);
    assert.equal(circleOf({ ...base, center: [0.25, 0.5] }, {}).cx, 60);
    // Inverse: the 12 o'clock angle is the middle of a 225..135 arc; angles in the gap snap to the nearer end.
    assert.equal(valueAtAngle(c, 0), 50);
    assert.equal(valueAtAngle(c, 170), 100);
    assert.equal(valueAtAngle(c, 190), 0);
    // Several axes lay out independently.
    const m = layoutGauge({ ...base, axes: [{ max: 100 }, { max: 10, radius: 0.6 }] });
    assert.equal(m.axes.length, 2);
    assert.equal(m.axes[1]!.max, 10);
  });

  it('major and minor ticks, positions, range-colored ticks and label options', () => {
    const m = layoutGauge({ ...base, axes: [{ ticks: { interval: 25, minor: 5 }, ranges: [{ from: 50, to: 100, color: '#c62828' }] }] });
    const a = m.axes[0]!;
    assert.deepEqual(a.labels.map((l) => l.text), ['0', '25', '50', '75', '100']);
    assert.equal(a.ticks.filter((t) => !t.minor).length, 5);
    assert.equal(a.ticks.filter((t) => t.minor).length, 16);
    const colored = layoutGauge({ ...base, axes: [{ ticks: { interval: 25, rangeColor: true }, ranges: [{ from: 50, to: 100, color: '#c62828' }] }] });
    assert.deepEqual(colored.axes[0]!.ticks.map((t) => t.color ?? null), [null, null, '#c62828', '#c62828', '#c62828']);
    const hidden = layoutGauge({ ...base, axes: [{ ticks: { interval: 25 }, labels: { hide: 'first' } }] });
    assert.equal(hidden.axes[0]!.labels[0]!.text, '25');
    const last = layoutGauge({ ...base, axes: [{ max: 90, ticks: { interval: 40 }, labels: { showLast: true } }] });
    assert.deepEqual(last.axes[0]!.labels.map((l) => l.text), ['0', '40', '80', '90']);
    const fmt = layoutGauge({ ...base, axes: [{ ticks: { interval: 0.5 }, labels: { format: { style: 'percent' } }, max: 1 }] });
    assert.ok(fmt.axes[0]!.labels.some((l) => l.text === '50%'));
    const custom = layoutGauge({ ...base, axes: [{ ticks: { interval: 50 }, formatLabel: (v) => `${v} rpm` }] });
    assert.equal(custom.axes[0]!.labels[1]!.text, '50 rpm');
    const rotated = layoutGauge({ ...base, axes: [{ ticks: { interval: 50 }, labels: { rotate: true } }] });
    assert.equal(rotated.axes[0]!.labels[1]!.rotate, 360);
    // Dense labels are dropped instead of overlapping.
    const dense = layoutGauge({ ...base, width: 120, height: 120, axes: [{ ticks: { interval: 1 } }] });
    assert.ok(dense.axes[0]!.labels.length < 101);
    const inside = layoutGauge({ ...base, axes: [{ ticks: { interval: 50, position: 'inside' } }] }).axes[0]!.ticks[0]!.d;
    const outside = layoutGauge({ ...base, axes: [{ ticks: { interval: 50, position: 'outside' } }] }).axes[0]!.ticks[0]!.d;
    assert.notEqual(inside, outside);
  });

  it('ranges with tapered widths, colors and the palette fallback', () => {
    const m = layoutGauge({ ...base, axes: [{ ranges: [{ id: 'a', from: 0, to: 50 }, { from: 50, to: 100, width: [4, 20], color: '#123456', label: 'Hot' }] }] });
    const [a, b] = m.axes[0]!.ranges;
    assert.equal(a!.id, 'a');
    assert.equal(a!.color, 'var(--salmon-chart-1)');
    assert.equal(a!.label, '0–50');
    assert.equal(b!.color, '#123456');
    assert.equal(b!.label, 'Hot');
    assert.match(b!.d, /^M[\d.,L]+Z$/);
    const pal = layoutGauge({ ...base, palette: ['#111111', '#222222'], axes: [{ ranges: [{ from: 0, to: 1 }, { from: 1, to: 2 }, { from: 2, to: 3 }] }] });
    assert.deepEqual(pal.axes[0]!.ranges.map((r) => r.color), ['#111111', '#222222', '#111111']);
    const lin = layoutGauge({ ...base, shape: 'linear', width: 360, height: 100, axes: [{ ranges: [{ from: 20, to: 40, width: [2, 10] }] }] });
    assert.equal(lin.axes[0]!.ranges.length, 1);
  });

  it('needle, range bar and marker pointers', () => {
    const m = layoutGauge({
      ...base,
      pointers: [{ type: 'needle', length: 0.5, cap: 8 }, { type: 'bar', width: 12 }, { type: 'marker', shape: 'diamond' }, { type: 'marker', shape: 'text', text: 'Max' }],
      values: [50, 25, 75, 100],
    });
    const [needle, bar, marker, text] = m.pointers;
    // A 50 % needle on a 225..135 arc points to 12 o'clock with half the radius.
    assert.equal(Math.round(needle!.hx), 120);
    assert.equal(Math.round(needle!.hy), 120 - 56);
    assert.deepEqual(needle!.cap, { cx: 120, cy: 120, r: 8 });
    assert.match(bar!.d, /A/);
    assert.ok(marker!.d.length > 0);
    assert.equal(text!.text!.text, 'Max');
    assert.equal(layoutGauge({ ...base, pointers: [{ type: 'bar' }], values: [0] }).pointers[0]!.d, '');
    // Values clamp into the axis.
    assert.equal(layoutGauge({ ...base, pointers: [{}], values: [500] }).pointers[0]!.value, 100);
  });

  it('linear orientation, reversed axis, containers and pointer placement', () => {
    const lin: GaugeLayoutInput = { ...base, shape: 'linear', width: 360, height: 100 };
    const t = trackOf(lin, {});
    assert.ok(t.p0 < t.p1);
    assert.equal(positionOf(t, 50), (t.p0 + t.p1) / 2);
    assert.equal(valueAtPosition(t, t.p1 + 50), 100);
    assert.ok(trackOf(lin, { reversed: true }).p0 > trackOf(lin, { reversed: true }).p1);
    const v = trackOf({ ...lin, orientation: 'vertical', width: 100, height: 300 }, {});
    assert.ok(v.vertical && v.p0 > v.p1, 'vertical: the minimum at the bottom');
    for (const container of ['normal', 'rounded', 'thermometer'] as const) assert.ok(layoutGauge({ ...lin, container }).axes[0]!.container, container);
    assert.equal(layoutGauge({ ...lin, container: 'none' }).axes[0]!.container, undefined);
    assert.ok(layoutGauge({ ...lin, container: 'thermometer' }).axes[0]!.container!.includes('a'));
    const near = layoutGauge({ ...lin, pointers: [{ type: 'marker', placement: 'near' }], values: [50] }).pointers[0]!;
    const far = layoutGauge({ ...lin, pointers: [{ type: 'marker', placement: 'far' }], values: [50] }).pointers[0]!;
    assert.ok(near.hy > far.hy, 'near is the label side (below), far the other side');
    const start = layoutGauge({ ...lin, axes: [{ position: 'start' }] }).axes[0]!;
    const end = layoutGauge({ ...lin, axes: [{ position: 'end' }] }).axes[0]!;
    assert.ok(start.labels[0]!.y < end.labels[0]!.y);
    const edge = layoutGauge({ ...lin, width: 120, axes: [{ ticks: { interval: 50 }, labels: { overlap: 'show' }, edgeLabels: 'shift' }] }).axes[0]!.labels;
    assert.ok(edge[0]!.x >= 0);
    for (const shape of ['circle', 'rectangle', 'triangle', 'invertedTriangle', 'diamond', 'arrow', 'invertedArrow'] as const) {
      assert.ok(layoutGauge({ ...lin, pointers: [{ type: 'marker', shape }], values: [10] }).pointers[0]!.d.length > 0, shape);
    }
  });

  it('circular and linear annotations', () => {
    const c = layoutGauge({ ...base, axes: [{ annotations: [{ angle: 180, radius: 0.5, content: 'x' }] }] }).axes[0]!.annotations[0]!;
    assert.equal(Math.round(c.x), 120);
    assert.equal(Math.round(c.y), 176);
    const l = layoutGauge({ ...base, shape: 'linear', width: 360, height: 100, axes: [{ annotations: [{ value: 50, y: -20, content: 'Half' }] }] }).axes[0]!.annotations[0]!;
    assert.equal(l.x, positionOf(trackOf({ ...base, shape: 'linear', width: 360, height: 100 }, {}), 50));
  });

  it('drawing coordinates to a snapped pointer value', () => {
    assert.equal(valueAtPoint(base, 0, 5, 0, 100, 120, 10), 50);
    assert.equal(valueAtPoint(base, 0, stepOf({}, {}), 0, 100, 232, 120), 83);
    const lin: GaugeLayoutInput = { ...base, shape: 'linear', width: 360, height: 100 };
    const t = trackOf(lin, {});
    assert.equal(valueAtPoint(lin, 0, 1, 0, 100, (t.p0 + t.p1) / 2, 50), 50);
  });

  it('a range end is bounded by the other end; ends sit on the band', () => {
    // The start thumb of a 40..70 range cannot pass 70, the end thumb cannot pass 40.
    assert.equal(valueAtPoint(base, 0, 1, 0, 70, 232, 120), 70);
    assert.equal(valueAtPoint(base, 0, 1, 40, 100, 8, 120), 40);
    assert.equal(snap(41.3, 5, 0, 0, 100), 40);
    assert.equal(snap(99, 5, 0, 0, 70), 70);
    const m = layoutGauge({ ...base, axes: [{ ranges: [{ from: 0, to: 50, width: 10 }] }] });
    const [x0, y0, x1, y1] = m.axes[0]!.ranges[0]!.ends;
    const c = circleOf(base, {});
    // Both ends on the band middle (radius r - 5), at the 0 and 50 angles.
    assert.ok(Math.abs(Math.hypot(x0 - c.cx, y0 - c.cy) - (c.r - 5)) < 0.01);
    assert.ok(Math.abs(x1 - c.cx) < 0.01 && y1 < c.cy);
    const lm = layoutGauge({ ...base, shape: 'linear', width: 360, height: 100, axes: [{ ranges: [{ from: 25, to: 75 }] }] });
    const lt = trackOf({ ...base, shape: 'linear', width: 360, height: 100 }, {});
    assert.equal(lm.axes[0]!.ranges[0]!.ends[0], positionOf(lt, 25));
    assert.equal(lm.axes[0]!.ranges[0]!.ends[2], positionOf(lt, 75));
  });
});

describe('Gauge server markup', () => {
  it('a read-only pointer is role="meter" with value attributes; a draggable one is role="slider"', () => {
    const html = render(createElement(Gauge, { title: 'Speed', pointers: [{ value: 72, valueText: (v: number) => `${v} km/h` }, { value: 10, draggable: true, label: 'Limit' }] }));
    assert.match(html, /role="meter"[^>]*aria-label="Speed pointer 1"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"[^>]*aria-valuenow="72"[^>]*aria-valuetext="72 km\/h"/);
    assert.match(html, /role="slider" tabindex="0"[^>]*aria-label="Limit"/);
    assert.match(html, /<figure[^>]*class="salmon-viz salmon-gauge"/);
    assert.match(html, /<svg[^>]*aria-hidden="true"/);
    assert.equal(render(createElement(Gauge, { title: 'Speed', pointers: [{ value: 72 }] })), render(createElement(Gauge, { title: 'Speed', pointers: [{ value: 72 }] })));
  });

  it('a draggable range renders two slider thumbs bounded by each other', () => {
    const html = render(createElement(Gauge, { axes: [{ ranges: [{ id: 'band', from: 40, to: 70, label: 'Band', draggable: true }, { from: 70, to: 100 }] }] }));
    assert.match(html, /role="slider" tabindex="0" class="salmon-gauge-thumb" aria-label="Band start" aria-valuemin="0" aria-valuemax="70" aria-valuenow="40" aria-valuetext="40"/);
    assert.match(html, /role="slider" tabindex="0" class="salmon-gauge-thumb" aria-label="Band end" aria-valuemin="40" aria-valuemax="100" aria-valuenow="70" aria-valuetext="70"/);
    // Only draggable ranges get thumbs; a hidden range has none.
    assert.equal(html.match(/role="slider"/g)!.length, 2);
    assert.doesNotMatch(render(createElement(Gauge, { hiddenRanges: ['band'], axes: [{ ranges: [{ id: 'band', from: 40, to: 70, draggable: true }] }] })), /role="slider"/);
  });

  it('the server draws final pointer positions whether or not animated', () => {
    const props = { pointers: [{ value: 72 }, { type: 'bar' as const, value: 30 }] };
    const animated = render(createElement(Gauge, props));
    assert.equal(animated, render(createElement(Gauge, { ...props, animated: false })));
    const final = layoutGauge({ ...base, pointers: props.pointers, values: [72, 30] }).pointers;
    for (const pm of final) assert.ok(animated.includes(`d="${pm.d}"`));
  });

  it('pointers render their reactive value or defaultValue', () => {
    assert.match(render(createElement(Gauge, { pointers: [{ defaultValue: 33, draggable: true }] })), /aria-valuenow="33"/);
    assert.match(render(createElement(Gauge, { pointers: [{ value: 44 }] })), /aria-valuenow="44"/);
  });

  it('the legend lists ranges and hiddenRanges removes them', () => {
    const props = { axes: [{ ranges: [{ id: 'low', from: 0, to: 50, label: 'Low' }, { id: 'high', from: 50, to: 100, label: 'High' }] }], legend: true };
    const html = render(createElement(Gauge, props));
    assert.match(html, /class="salmon-viz-legend-marks"/);
    assert.match(html, /role="toolbar"/);
    assert.match(html, /aria-pressed="true"[^>]*><span class="salmon-visually-hidden">Low/);
    assert.match(html, /data-range="high"/);
    const hidden = render(createElement(Gauge, { ...props, hiddenRanges: ['high'] }));
    assert.doesNotMatch(hidden, /data-range="high"/);
    assert.match(hidden, /aria-pressed="false"[^>]*><span class="salmon-visually-hidden">High/);
    assert.doesNotMatch(render(createElement(Gauge, { ...props, defaultHiddenRanges: ['low'] })), /data-range="low"/);
  });

  it('annotations render React content', () => {
    const html = render(createElement(Gauge, { axes: [{ annotations: [{ angle: 180, radius: 0.4, content: createElement('strong', null, '72 km/h') }] }] }));
    assert.match(html, /class="salmon-gauge-annotation"[^>]*><strong>72 km\/h<\/strong>/);
  });

  it('linear shapes carry their orientation and container', () => {
    const html = render(createElement(Gauge, { shape: 'linear', orientation: 'vertical', container: 'thermometer', pointers: [{ value: 20 }] }));
    assert.match(html, /data-shape="linear"/);
    assert.match(html, /data-orientation="vertical"/);
    assert.match(html, /class="salmon-gauge-container"/);
  });

  it('the title block is drawn above the gauge; outside labels stay inside the drawing', () => {
    const html = render(createElement(Gauge, { title: 'Living room', subtitle: 'Drag either end of the comfort band', pointers: [{ value: 20 }] }));
    assert.match(html, /<text class="salmon-viz-title" x="8" y="[\d.]+">Living room<\/text><text class="salmon-viz-subtitle" x="8" y="[\d.]+">Drag either end of the comfort band<\/text>/);
    assert.doesNotMatch(render(createElement(Gauge, { pointers: [{ value: 20 }] })), /salmon-viz-title/);
    // The circle (and a linear track) lay out below the reserved top band.
    const plain = circleOf(base, {});
    const below = circleOf({ ...base, topInset: 40 }, {});
    assert.ok(below.cy > plain.cy && below.cy - below.r >= 40 + 8);
    const v = trackOf({ ...base, shape: 'linear', orientation: 'vertical', width: 120, height: 320, topInset: 40 }, {});
    assert.ok(Math.min(v.p0, v.p1) >= 40);
    // Outside labels at 9 and 3 o'clock: every label box is inside the 240 px drawing.
    const half = layoutGauge({ ...base, axes: [{ startAngle: 270, endAngle: 90, labels: { position: 'outside' } }] }).axes[0]!;
    assert.ok(half.labels.length >= 3);
    for (const l of half.labels) {
      const w = textWidth(l.text, 'sm') / 2;
      assert.ok(l.x - w >= 0 && l.x + w <= 240 && l.y - 12 >= 0, `${l.text} at ${l.x}, ${l.y}`);
    }
    // The radius only shrinks as far as the labels need: a small axis radius is kept.
    assert.equal(circleOf(base, { radius: 0.5, labels: { position: 'outside' } }).r, 56);
  });
  it('axis.formatLabel and the accessible table', () => {
    const html = render(createElement(Gauge, { title: 'RPM', axes: [{ formatLabel: (v: number) => `${v / 1000}k`, max: 8000, ticks: { interval: 2000 } }], pointers: [{ value: 3000, label: 'Engine' }] }));
    assert.match(html, />8k<\/text>/);
    assert.match(html, /<th scope="row">Engine<\/th><td>3,000<\/td>/);
    // DOM props and handlers reach the figure root (container pointer events).
    assert.match(render(createElement(Gauge, { 'data-track': 'rpm', onPointerMove: () => {}, pointers: [{ value: 1 }] } as never)), /<figure data-track="rpm"/);
  });
});
