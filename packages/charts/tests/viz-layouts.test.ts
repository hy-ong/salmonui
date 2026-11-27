import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  explodeOffset,
  fillEmpty,
  findNode,
  funnelLayout,
  groupSmall,
  heatColor,
  hierarchy,
  matrixFromRecords,
  matrixFromTable,
  normalizeCells,
  pieLabels,
  pieLayout,
  sankeyLayout,
  stepColor,
  treemapLayout,
} from '../dist/viz/index.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

// Pure layouts of the accumulation, Sankey, treemap and heat map families:
// deterministic, rounded, and within the timing budgets.

const near = (a: number, b: number, eps = 0.02) => assert.ok(Math.abs(a - b) <= eps, `${a} ≈ ${b}`);

describe('viz:accumulation pie', () => {
  it('splits a full turn by value, clockwise from 12 o’clock', () => {
    const s = pieLayout([1, 1, 2]);
    assert.equal(s.length, 3);
    near(s[0]!.start, 0, 1e-9);
    near(s[2]!.end, Math.PI * 2, 1e-9);
    near(s[2]!.fraction, 0.5, 1e-9);
  });
  it('honours start and end angles (semi pie) and pad angles', () => {
    const s = pieLayout([1, 1], { startAngle: -90, endAngle: 90, padAngle: 10 });
    near(s[0]!.start, -Math.PI / 2, 1e-9);
    near(s[1]!.end, Math.PI / 2, 1e-9);
    near(s[1]!.start - s[0]!.end, (10 * Math.PI) / 180, 1e-9);
  });
  it('skips hidden, zero and empty values', () => {
    const s = pieLayout([1, 0, Number.NaN, 3], { hidden: new Set([3]) });
    assert.deepEqual(s.map((x) => x.index), [0]);
    near(s[0]!.fraction, 1, 1e-9);
  });
  it('groups small slices by percent or by count', () => {
    assert.deepEqual(groupSmall([50, 30, 5, 4, 1], { threshold: 6 }), { kept: [0, 1], grouped: [2, 3, 4], other: 10 });
    assert.deepEqual(groupSmall([5, 50, 30, 4], { threshold: 2, by: 'count' }).kept, [1, 2]);
    assert.deepEqual(groupSmall([50, 49, 1], { threshold: 2 }).grouped, [], 'one small slice is not grouped');
  });
  it('fills empty points by drop, zero or average (viz:stats)', () => {
    assert.ok(Number.isNaN(fillEmpty([1, Number.NaN, 3], 'drop')[1]!));
    assert.deepEqual([...fillEmpty([1, Number.NaN, 3], 'zero')], [1, 0, 3]);
    assert.deepEqual([...fillEmpty([1, Number.NaN, 3], 'average')], [1, 2, 3]);
  });
  it('explodes along the mid angle', () => {
    const [a] = pieLayout([1, 1]);
    assert.deepEqual(explodeOffset(a!, 10), { dx: 10, dy: 0 });
  });
  it('places outside labels in non-overlapping columns inside the bounds', () => {
    const slices = pieLayout([40, 1, 1, 1, 1, 1, 1]);
    const boxes = pieLabels(
      slices.map((slice) => ({ slice, width: 40, height: 14 })),
      { cx: 150, cy: 100, radius: 60, innerRadius: 0, position: 'outside', lineHeight: 15, bounds: { x: 0, y: 0, width: 300, height: 200 } },
    );
    const right = boxes.filter((b) => b.anchor === 'start').map((b) => b.y).sort((a, b) => a - b);
    for (let i = 1; i < right.length; i++) assert.ok(right[i]! - right[i - 1]! >= 14.99, 'one line apart');
    assert.ok(boxes.every((b) => b.connector?.length === 3));
  });
  it('puts a label inside when it fits in auto mode', () => {
    const [big] = pieLayout([10]);
    const [b] = pieLabels([{ slice: big!, width: 30, height: 14 }], { cx: 100, cy: 100, radius: 80, innerRadius: 0, lineHeight: 15, bounds: { x: 0, y: 0, width: 200, height: 200 } });
    assert.equal(b!.inside, true);
  });
  it('moves a label outside when its horizontal box would cross the outer edge near 3 o’clock', () => {
    // A 40 % slice centered near 3 o'clock: the chord is wide, but a long label runs radially.
    const slices = pieLayout([40, 60]);
    const [b] = pieLabels([{ slice: slices[0]!, width: 70, height: 14 }], { cx: 100, cy: 100, radius: 80, innerRadius: 0, lineHeight: 15, bounds: { x: 0, y: 0, width: 300, height: 200 } });
    assert.equal(b!.inside, false);
  });
});

describe('viz:accumulation funnel and pyramid', () => {
  it('stacks funnel segments top down with a neck and gaps', () => {
    const f = funnelLayout([50, 30, 20], { shape: 'funnel', width: 200, height: 204, gap: 2, neckWidth: 40, neckHeight: 40 });
    assert.equal(f.length, 3);
    near(f[0]!.top, 0);
    near(f[1]!.top - f[0]!.bottom, 2);
    near(f[2]!.bottom, 204);
    // Bottom segment ends in the neck.
    const last = f[2]!.points;
    near(Math.max(...last.map((p) => p.x)) - Math.min(...last.map((p) => p.x)), 40 + (200 - 40) * 0, 200);
    assert.ok(last.some((p) => p.x === 120));
  });
  it('makes pyramid areas proportional in area mode', () => {
    const p = funnelLayout([1, 3], { shape: 'pyramid', mode: 'area', width: 100, height: 100, gap: 0 });
    // Top triangle holds a quarter of the area: height sqrt(1/4) of the total.
    near(p[0]!.bottom, 50);
    const lin = funnelLayout([1, 3], { shape: 'pyramid', width: 100, height: 100, gap: 0 });
    near(lin[0]!.bottom, 25);
  });
  it('draws the trapezoidal funnel as equal bars by value / max joined in the gaps', () => {
    const t = funnelLayout([100, 50, 0, 25], { shape: 'funnel', variant: 'trapezoidal', width: 200, height: 320, neckWidth: 40, neckHeight: 40 });
    assert.equal(t.length, 3, 'zero values drop');
    // Default gap 10 px: (320 - 2 * 10) / 3 = 100 px per bar.
    assert.deepEqual(t.map((s) => [s.top, s.bottom]), [[0, 100], [110, 210], [220, 320]]);
    assert.deepEqual(t[0]!.points, [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }]);
    assert.deepEqual(t[1]!.points.map((p) => p.x), [50, 150, 150, 50], 'half the max is half the width, centered');
    assert.deepEqual(t[0]!.connector, [{ x: 0, y: 100 }, { x: 200, y: 100 }, { x: 150, y: 110 }, { x: 50, y: 110 }]);
    assert.equal(t[2]!.connector, undefined, 'no connector after the last bar');
    near(t[1]!.cy, 160);
    // Hidden points leave the bars and the max; an explicit gap wins.
    const h = funnelLayout([100, 50, 25], { shape: 'funnel', variant: 'trapezoidal', width: 200, height: 100, gap: 0, hidden: new Set([0]) });
    assert.deepEqual(h.map((s) => s.points[1]!.x), [200, 150]);
    assert.equal(h[0]!.bottom, 50);
    // Pyramids ignore the variant; the standard funnel has no connectors.
    const p = funnelLayout([1, 3], { shape: 'pyramid', variant: 'trapezoidal', width: 100, height: 100, gap: 0 });
    near(p[0]!.bottom, 25);
    assert.equal(p[0]!.points[0]!.x, 50);
    assert.ok(funnelLayout([1, 1], { shape: 'funnel', width: 100, height: 100 }).every((s) => s.connector === undefined));
  });
});

describe('viz:sankey', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  const links = [
    { source: 'a', target: 'c', value: 5 },
    { source: 'b', target: 'c', value: 3 },
    { source: 'c', target: 'd', value: 8 },
  ];
  it('assigns columns by longest path and sizes nodes by flow', () => {
    const l = sankeyLayout(nodes, links, { width: 300, height: 200 });
    assert.deepEqual(l.nodes.map((n) => n.column), [0, 0, 1, 2]);
    assert.equal(l.nodes[2]!.value, 8);
    // The crowded first column (a, b and one gap) fills the height: ky = (200 - 12) / 8.
    near(l.nodes[3]!.y1 - l.nodes[3]!.y0, 188, 0.05);
    near(l.nodes[3]!.x1, 300);
    assert.equal(l.links[2]!.width, 188);
    assert.match(l.links[0]!.path, /^M[\d.]+,[\d.]+C/);
  });
  it('drops unknown, empty and cycle-closing links', () => {
    const l = sankeyLayout(nodes, [...links, { source: 'd', target: 'a', value: 1 }, { source: 'x', target: 'a', value: 1 }, { source: 'a', target: 'b', value: 0 }], { width: 300, height: 200 });
    assert.deepEqual(l.dropped, [3, 4, 5]);
  });
  it('transposes for the vertical orientation and keeps nodes in the box', () => {
    const l = sankeyLayout(nodes, links, { width: 200, height: 300, orientation: 'vertical', nodePadding: 10 });
    for (const n of l.nodes) {
      assert.ok(n.x0 >= -0.01 && n.x1 <= 200.01, `x in box ${n.x0}..${n.x1}`);
      assert.ok(n.y0 >= -0.01 && n.y1 <= 300.01);
    }
    assert.ok(l.nodes[3]!.y1 > 299.9);
  });
  it('lays out 200 nodes and 1,000 links within 50 ms @perf', () => {
    const N = 200;
    const ns = Array.from({ length: N }, (_, i) => ({ id: `n${i}` }));
    const ls = Array.from({ length: 1000 }, (_, i) => {
      const s = (i * 7) % (N - 20);
      return { source: `n${s}`, target: `n${s + 1 + ((i * 13) % 19)}`, value: 1 + (i % 9) };
    });
    sankeyLayout(ns, ls, { width: 1200, height: 800 });
    const t = performance.now();
    const l = sankeyLayout(ns, ls, { width: 1200, height: 800 });
    const ms = performance.now() - t;
    console.log(`[perf] sankey layout 200 nodes 1000 links: ${ms.toFixed(2)}ms`);
    assert.equal(l.nodes.length, N);
    assertBudget(ms, 50, 'sankey layout 200 nodes 1000 links');
  });
});

describe('viz:treemap', () => {
  const flat = [
    { g: 'A', n: 'a1', w: 6 },
    { g: 'A', n: 'a2', w: 6 },
    { g: 'B', n: 'b1', w: 4 },
    { g: 'B', n: 'b2', w: 3 },
    { g: 'C', n: 'c1', w: 1 },
  ];
  const root = hierarchy(flat, { weight: (d) => d.w, key: (d) => d.n, groupBy: [(d) => d.g] });
  it('groups flat data by level and sums weights', () => {
    assert.equal(root.value, 20);
    assert.deepEqual(root.children.map((c) => [c.key, c.value]), [['A', 12], ['B', 7], ['C', 1]]);
    assert.equal(findNode(root, ['B', 'b2'])?.value, 3);
  });
  it('builds hierarchical data from a children accessor', () => {
    const tree = hierarchy([{ n: 'x', w: 0, kids: [{ n: 'y', w: 2, kids: [] }, { n: 'z', w: 3, kids: [] }] }], { weight: (d) => d.w, key: (d) => d.n, children: (d) => d.kids });
    assert.equal(tree.value, 5);
    assert.deepEqual(tree.children[0]!.path, ['x']);
  });
  it('squarifies with areas proportional to weight and no overlap', () => {
    const rects = treemapLayout(root, { width: 200, height: 100, levels: [{ gap: 0 }], leafGap: 0 });
    const leaves = rects.filter((r) => r.leaf);
    assert.equal(leaves.length, 5);
    for (const r of leaves) near(r.width * r.height, (r.node.value / 20) * 20000, 2);
    const groups = rects.filter((r) => !r.leaf);
    for (const r of groups) near(r.width * r.height, (r.node.value / 20) * 20000, 2);
    for (const r of rects) {
      const ratio = Math.max(r.width / r.height, r.height / r.width);
      assert.ok(ratio < 10, `aspect ratio ${ratio}`);
    }
  });
  it('slices and mirrors for render directions', () => {
    const rects = treemapLayout(root, { width: 200, height: 100, tiling: 'sliceHorizontal', levels: [{ gap: 0 }], leafGap: 0, maxDepth: 1 });
    assert.deepEqual(rects.map((r) => r.x), [0, 120, 190]);
    const end = treemapLayout(root, { width: 200, height: 100, tiling: 'sliceHorizontal', levels: [{ gap: 0 }], leafGap: 0, maxDepth: 1, direction: 'topEnd' });
    assert.deepEqual(end.map((r) => r.x), [80, 10, 0]);
    const rtl = treemapLayout(root, { width: 200, height: 100, tiling: 'sliceHorizontal', levels: [{ gap: 0 }], leafGap: 0, maxDepth: 1, rtl: true });
    assert.deepEqual(rtl.map((r) => r.x), [80, 10, 0]);
  });
  it('reserves header bands for groups', () => {
    const rects = treemapLayout(root, { width: 200, height: 100, tiling: 'sliceHorizontal', levels: [{ gap: 0, header: 20 }], leafGap: 0 });
    const a = rects.find((r) => r.node.key === 'A')!;
    const a1 = rects.find((r) => r.node.key === 'a1')!;
    assert.equal(a.header, 20);
    assert.ok(a1.y >= 20);
  });
  it('lays out 10,000 leaves within 30 ms @perf', () => {
    const data = Array.from({ length: 10000 }, (_, i) => ({ g: `g${i % 50}`, n: `l${i}`, w: 1 + ((i * 37) % 100) }));
    const opts = { weight: (d: (typeof data)[number]) => d.w, key: (d: (typeof data)[number]) => d.n, groupBy: [(d: (typeof data)[number]) => d.g] };
    treemapLayout(hierarchy(data, opts), { width: 1200, height: 800 });
    const t = performance.now();
    const rects = treemapLayout(hierarchy(data, opts), { width: 1200, height: 800 });
    const ms = performance.now() - t;
    console.log(`[perf] treemap layout 10000 leaves: ${ms.toFixed(2)}ms`);
    assert.equal(rects.filter((r) => r.leaf).length, 10000);
    assertBudget(ms, 30, 'treemap layout 10000 leaves');
  });
});

describe('viz:heatmap', () => {
  it('normalizes a table and records (with bubble sizes) into a row-major matrix', () => {
    const m = matrixFromTable([[1, 2, null], [3]]);
    assert.equal(m.columns, 3);
    assert.equal(m.rows, 2);
    assert.ok(Number.isNaN(m.values[2]!) && Number.isNaN(m.values[4]!));
    const r = matrixFromRecords([{ x: 'Mon', y: 'AM', v: 1, s: 9 }, { x: 'Tue', y: 'PM', v: 4, s: 2 }], (d) => d.x, (d) => d.y, (d) => d.v, (d) => d.s);
    assert.deepEqual(r.xKeys, ['Mon', 'Tue']);
    assert.equal(r.values[3], 4);
    assert.equal(r.sizes?.[0], 9);
  });
  it('normalizes per table, row or column', () => {
    const m = matrixFromTable([[0, 10], [5, 20]]);
    assert.deepEqual([...normalizeCells(m)], [0, 0.5, 0.25, 1]);
    assert.deepEqual([...normalizeCells(m, 'row')], [0, 1, 0, 1]);
    assert.deepEqual([...normalizeCells(m, 'column')], [0, 0, 1, 1]);
  });
  it('colors by gradient stops, steps or the sequential palette', () => {
    const stops = [{ value: 0, color: '#000000' }, { value: 10, color: '#ffffff' }];
    assert.equal(heatColor(5, 0.5, stops, 'gradient', false), '#808080');
    assert.equal(heatColor(5, 0.5, stops, 'steps', false), '#000000');
    assert.equal(stepColor(stops, 10), '#ffffff');
    assert.equal(heatColor(5, 1, undefined, 'gradient', false), 'var(--salmon-chart-sequential-9)');
  });
});
