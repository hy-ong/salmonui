// Polar and radar coordinates: the opt-in `polar` feature from
// `@salmonui/charts/chart/features` (`features={[polar]}`), rendered on the
// server and the client alike. The cartesian model supplies the frame, legend, summary, table
// and point texts; this module replaces the marks, the anchors and the axes
// with angle (x) and radius (y) geometry. Supported series types: line, spline
// (`curve`), area, spline area, column, range column (`lowField` /
// `highField`), scatter, and the stacking variants (`stack`).

import { arcPath, createScale, lineHeight, linePath, n2, paletteColor, polar as at, resolveDomain, stack, symbolPath, type SymbolShape } from '#viz';
import { buildModel, hideAxes, type ChartModel, type ChartSpec, type MarkLabel, type MarkPath, type SeriesModel, type ViewState } from './model.js';
import type { ChartProps } from './types.js';

const TAU = Math.PI * 2;

/** The polar layout (the cartesian model's frame, legend and texts with polar marks and axes). */
export function buildPolarModel(props: ChartProps, spec: ChartSpec, view: ViewState): ChartModel {
  const radar = props.coordinate === 'radar';
  const xo = props.xAxis ?? {};
  const yo = props.yAxis ?? {};
  // The cartesian pass without axis blocks gives the frame (title, legend) and the per-point texts.
  const base = buildModel(props, hideAxes(spec), { ...view, zoom: {} });
  const lh = lineHeight('sm');
  const p = base.plot;
  const cx = p.x + p.width / 2;
  const cy = p.y + p.height / 2;
  const R = Math.max(8, (Math.min(p.width, p.height) / 2 - lh - 6) * Math.min(1, Math.max(0.1, props.radius ?? 1)));
  const xAxis = spec.axes.get('x');
  const cats = xAxis?.categories ?? [];
  const band = xAxis?.scale === 'category' || xAxis?.scale === 'timeCategory';
  const visible = spec.series.filter((s) => !s.hidden);
  const start = ((xo.startAngle ?? 0) * Math.PI) / 180;
  const turn = xo.reversed ? -1 : 1;

  // x: one spoke per category, or the numeric extent around the full circle.
  let xLo = Number.POSITIVE_INFINITY;
  let xHi = Number.NEGATIVE_INFINITY;
  for (const s of visible) for (const v of s.x) if (Number.isFinite(v)) [xLo, xHi] = [Math.min(xLo, v), Math.max(xHi, v)];
  const n = Math.max(1, cats.length);
  const xScale = band ? null : createScale({ kind: 'linear', domain: resolveDomain(Number.isFinite(xLo) ? [xLo, xHi] : null, { min: xo.min as number | undefined, max: xo.max as number | undefined, padding: 'round', tickCount: 8, kind: 'linear' }), range: [0, TAU] });
  const angleOf = (x: number): number => start + turn * (band ? (x / n) * TAU : (xScale?.map(x) ?? 0));
  const step = band ? TAU / n : TAU / Math.max(1, Math.max(...visible.map((s) => s.x.length)));

  // y: stacks per series group, then one radial scale from the center.
  const inputs = visible.filter((s) => s.options.stack).map((s) => ({ id: s.id, values: s.y, group: `${s.type === 'column' ? 'c' : 'l'}:${s.options.stackGroup ?? ''}`, mode: s.options.stack === 'percent' ? ('percent' as const) : ('normal' as const) }));
  const stacked = inputs.length ? stack(inputs, Math.max(...visible.map((s) => s.y.length))).series : new Map<string, { y0: Float64Array; y1: Float64Array }>();
  let yLo = 0;
  let yHi = Number.NEGATIVE_INFINITY;
  for (const s of visible) {
    const st = stacked.get(s.id);
    for (const arr of [st?.y1 ?? s.y, st?.y0, s.low, s.high]) if (arr) for (const v of arr) if (Number.isFinite(v)) [yLo, yHi] = [Math.min(yLo, v), Math.max(yHi, v)];
  }
  const ys = createScale({ kind: 'linear', domain: resolveDomain(Number.isFinite(yHi) ? [yLo, yHi] : null, { min: yo.min as number | undefined, max: yo.max as number | undefined, padding: 'round', tickCount: 5, kind: 'linear' }), range: [0, R], reversed: yo.reversed });
  const rOf = (v: number) => Math.max(0, ys.map(v));

  // Grid: circles (polar) or polygons (radar) per radial tick, one spoke per category or x tick.
  const spokes = band ? cats.map((_, i) => angleOf(i)) : (xScale?.ticks(8) ?? []).filter((t) => (xScale?.map(t) ?? 0) < TAU - 1e-6).map(angleOf);
  const rTicks = ys.ticks(5);
  const ring = (r: number): string => {
    if (!radar || spokes.length < 3) return arcPath(cx, cy, 0, r, 0, TAU).replace(/Z$/, '');
    return `${spokes.map((a, i) => `${i ? 'L' : 'M'}${n2(at(cx, cy, r, a).x)},${n2(at(cx, cy, r, a).y)}`).join('')}Z`;
  };
  let grid = '';
  for (const t of rTicks) if (rOf(t) > 0) grid += ring(rOf(t));
  for (const a of spokes) grid += `M${n2(cx)},${n2(cy)}L${n2(at(cx, cy, R, a).x)},${n2(at(cx, cy, R, a).y)}`;
  const labels: MarkLabel[] = [];
  const xFmt = (i: number) => (band ? (cats[i] ?? '') : String(Math.round(i * 100) / 100));
  const yFmt = (v: number) => String(Math.round(v * 100) / 100);
  const xTicks = band ? cats.map((_, i) => i) : (xScale?.ticks(8) ?? []).filter((t) => (xScale?.map(t) ?? 0) < TAU - 1e-6);
  for (const t of xTicks) {
    const a = angleOf(t);
    const q = at(cx, cy, R + 8, a);
    const sin = Math.sin(a);
    labels.push({ key: `x${t}`, x: q.x, y: q.y + lh * 0.32 - Math.cos(a) * lh * 0.4, text: xo.formatLabel ? xo.formatLabel(band ? cats[t] : t) : xFmt(t), anchor: sin > 0.15 ? 'start' : sin < -0.15 ? 'end' : 'middle' });
  }
  for (const t of rTicks) {
    if (rOf(t) > R - lh) continue;
    const q = at(cx, cy, rOf(t), start);
    labels.push({ key: `y${t}`, x: q.x + 4, y: q.y - 3, text: yo.formatLabel ? yo.formatLabel(t) : yFmt(t), anchor: 'start' });
  }

  // Marks per series; column slots side by side within a category wedge.
  const columns = visible.filter((s) => s.type === 'column' || s.type === 'bar');
  const slots: string[] = [];
  for (const s of columns) {
    const key = s.options.stack ? `stack:${s.options.stackGroup ?? ''}` : s.id;
    if (!slots.includes(key)) slots.push(key);
  }
  const byId = new Map(base.series.map((m) => [m.id, m]));
  const series: SeriesModel[] = [];
  for (const s of spec.series) {
    const m = byId.get(s.id);
    if (!m) continue;
    const count = s.x.length;
    const px = new Float64Array(count).fill(Number.NaN);
    const py = new Float64Array(count).fill(Number.NaN);
    const marks: MarkPath[] = [];
    const st = stacked.get(s.id);
    const top = st?.y1 ?? s.high ?? s.y;
    const bottom = st?.y0 ?? s.low;
    if (!s.hidden) {
      for (let i = 0; i < count; i++) {
        const q = at(cx, cy, rOf(top[i] as number), angleOf(s.x[i] as number));
        if (Number.isFinite(top[i] as number)) [px[i], py[i]] = [q.x, q.y];
      }
      const color = s.color ?? paletteColor(s.slot);
      const curve = { curve: s.options.curve, tension: s.options.tension };
      const closed = s.options.closed !== false;
      const ring2 = (xs: Float64Array, yv: Float64Array) => (closed && xs.length > 2 ? linePath(Float64Array.from([...xs, xs[0] as number]), Float64Array.from([...yv, yv[0] as number]), curve) : linePath(xs, yv, curve));
      if (s.type === 'column' || s.type === 'bar') {
        const key = s.options.stack ? `stack:${s.options.stackGroup ?? ''}` : s.id;
        const k = Math.max(1, slots.length);
        const w = (step * (s.options.bandWidth ?? 0.7)) / k;
        const off = -((step * (s.options.bandWidth ?? 0.7)) / 2) + Math.max(0, slots.indexOf(key)) * w;
        for (let i = 0; i < count; i++) {
          const v1 = top[i] as number;
          if (!Number.isFinite(v1)) continue;
          const a = angleOf(s.x[i] as number);
          const a0 = a + turn * off;
          const a1 = a0 + turn * w;
          const r0 = rOf(bottom ? (bottom[i] as number) : 0);
          const r1 = rOf(v1);
          marks.push({ key: `w${i}`, d: arcPath(cx, cy, Math.min(r0, r1), Math.max(r0, r1), Math.min(a0, a1), Math.max(a0, a1)), fill: color, index: i, opacity: s.options.opacity });
          const q = at(cx, cy, r1, (a0 + a1) / 2);
          [px[i], py[i]] = [q.x, q.y];
        }
      } else if (s.type === 'scatter' || s.type === 'bubble') {
        const shape = ((typeof s.options.markers === 'object' ? s.options.markers.shape : undefined) ?? 'circle') as SymbolShape;
        for (let i = 0; i < count; i++) if (Number.isFinite(px[i] as number)) marks.push({ key: `p${i}`, d: symbolPath(shape, px[i] as number, py[i] as number, 8), fill: color, index: i, opacity: s.options.opacity ?? 0.85 });
      } else {
        if (s.type === 'area') {
          let inner = '';
          if (bottom) {
            const bx = Float64Array.from({ length: count }, (_, i) => at(cx, cy, rOf(bottom[i] as number), angleOf(s.x[i] as number)).x);
            const by = Float64Array.from({ length: count }, (_, i) => at(cx, cy, rOf(bottom[i] as number), angleOf(s.x[i] as number)).y);
            inner = ring2(bx.reverse(), by.reverse()).replace(/^M/, 'L');
          } else inner = `L${n2(cx)},${n2(cy)}`;
          marks.push({ key: 'area', d: `${ring2(px, py)}${closed && !bottom ? '' : inner}Z`, fill: color, opacity: s.options.opacity ?? 0.35 });
        }
        marks.push({ key: 'line', d: ring2(px, py), stroke: color, strokeWidth: 2 });
        if (s.options.markers) for (let i = 0; i < count; i++) if (Number.isFinite(px[i] as number)) marks.push({ key: `m${i}`, d: symbolPath('circle', px[i] as number, py[i] as number, 7), fill: color, stroke: 'var(--salmon-surface-base)', strokeWidth: 1, index: i, className: 'marker' });
      }
    }
    series.push({ ...m, marks, labels: [], px, py, sortedX: false });
  }
  return { ...base, axes: [], series, decor: { grid, labels }, polar: true, stackLabels: [] };
}
