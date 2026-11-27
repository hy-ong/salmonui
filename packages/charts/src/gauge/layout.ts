// Gauge geometry: a pure
// function of the props and the fixed drawing size, shared by the server and
// the client render (zero relayout). Angles are degrees clockwise from
// 12 o'clock; every coordinate is rounded to 0.01 px by the `#viz` path
// builders.

import { arcPath, n2, niceTicks, numberFormatter, polar, r2, rectPath, seriesColor, symbolPath, textWidth, type SymbolShape, type ValueFormatter } from '#viz';

export type GaugeShape = 'circular' | 'linear';
export type GaugeDirection = 'clockwise' | 'counterclockwise';
export type GaugeTickPosition = 'inside' | 'outside' | 'cross';
export type GaugePointerType = 'needle' | 'bar' | 'marker';
export type GaugeMarkerShape = 'circle' | 'rectangle' | 'triangle' | 'invertedTriangle' | 'diamond' | 'arrow' | 'invertedArrow' | 'text';
export type GaugeContainer = 'none' | 'normal' | 'thermometer' | 'rounded';

export interface GaugeRange {
  readonly id?: string | undefined;
  readonly from: number;
  readonly to: number;
  /** Band width in px, or `[start, end]` for a tapered band. Default 10. */
  readonly width?: number | readonly [number, number] | undefined;
  readonly position?: GaugeTickPosition | undefined;
  /** Data color; default the categorical palette slot. */
  readonly color?: string | undefined;
  /** Legend and tooltip text; default `from–to`. */
  readonly label?: string | undefined;
  /** Both ends become slider thumbs; `onRangeChange` reports the moved range. */
  readonly draggable?: boolean | undefined;
  /** Keyboard and drag step of the thumbs (default 1 % of the axis span). */
  readonly step?: number | undefined;
}

export interface GaugeTicks {
  /** Major tick interval; default a nice step for about 5 to 10 ticks. */
  readonly interval?: number | undefined;
  /** Minor tick interval (default none). */
  readonly minor?: number | undefined;
  readonly position?: GaugeTickPosition | undefined;
  /** Color ticks inside a range with that range's color. */
  readonly rangeColor?: boolean | undefined;
  readonly hidden?: boolean | undefined;
}

export interface GaugeLabels {
  readonly position?: 'inside' | 'outside' | undefined;
  /** Rotate labels along the arc (circular). */
  readonly rotate?: boolean | undefined;
  readonly hide?: 'first' | 'last' | undefined;
  /** Label the maximum even when it is not on the interval. */
  readonly showLast?: boolean | undefined;
  /** `'hide'` (default) drops labels that would overlap the previous one. */
  readonly overlap?: 'hide' | 'show' | undefined;
  readonly format?: Intl.NumberFormatOptions | undefined;
  readonly hidden?: boolean | undefined;
}

export interface GaugeAnnotation {
  readonly id?: string | undefined;
  /** Circular: angle in degrees (clockwise from 12 o'clock) and radius as a fraction of the axis radius. */
  readonly angle?: number | undefined;
  readonly radius?: number | undefined;
  /** Linear: position along the axis in data units, plus a pixel offset. */
  readonly value?: number | undefined;
  readonly x?: number | undefined;
  readonly y?: number | undefined;
  readonly content: unknown;
  readonly rotate?: boolean | undefined;
  /** Tooltip text (`tooltip.targets` with `'annotation'`). */
  readonly label?: string | undefined;
}

export interface GaugeAxis {
  readonly id?: string | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  /** Circular: start and end angle in degrees, clockwise from 12 o'clock. Default 225 and 135. */
  readonly startAngle?: number | undefined;
  readonly endAngle?: number | undefined;
  readonly direction?: GaugeDirection | undefined;
  /** Circular: radius as a fraction of the available radius (default 1). */
  readonly radius?: number | undefined;
  /** Linear: maximum at the start (left / top) instead of the end. */
  readonly reversed?: boolean | undefined;
  /** Linear: the side of the container the ticks and labels sit on. */
  readonly position?: 'start' | 'end' | undefined;
  /** Linear: keep the first and last label inside the drawing (`'shift'`, default) or hide them. */
  readonly edgeLabels?: 'shift' | 'hide' | undefined;
  readonly ticks?: GaugeTicks | undefined;
  readonly labels?: GaugeLabels | undefined;
  readonly ranges?: readonly GaugeRange[] | undefined;
  readonly annotations?: readonly GaugeAnnotation[] | undefined;
  /** Hide the axis line. */
  readonly line?: boolean | undefined;
  /** Label text for a value (`axisLabelRender`). */
  readonly formatLabel?: ((value: number) => string) | undefined;
}

export interface GaugePointer {
  readonly id?: string | undefined;
  /** Index of the axis it belongs to (default 0). */
  readonly axis?: number | undefined;
  readonly type?: GaugePointerType | undefined;
  readonly value?: number | undefined;
  /** Initial value of an uncontrolled draggable pointer. */
  readonly defaultValue?: number | undefined;
  /** Needle length as a fraction of the axis radius (default 0.8). */
  readonly length?: number | undefined;
  /** Needle tail as a fraction of the axis radius (default 0). */
  readonly tail?: number | undefined;
  /** Needle cap radius in px (default 6, 0 hides it). */
  readonly cap?: number | undefined;
  /** Needle base width, bar thickness or marker size in px. */
  readonly width?: number | undefined;
  readonly shape?: GaugeMarkerShape | undefined;
  /** Marker text (`shape: 'text'`). */
  readonly text?: string | undefined;
  /** Linear: placement across the container. */
  readonly placement?: 'near' | 'center' | 'far' | undefined;
  /** Circular marker / bar band relative to the axis line. */
  readonly position?: GaugeTickPosition | undefined;
  /** Data color; default text color (needle) or palette slot 1. */
  readonly color?: string | undefined;
  readonly draggable?: boolean | undefined;
  /** Keyboard step of a draggable pointer (default 1 % of the axis span). */
  readonly step?: number | undefined;
  /** Accessible name of the meter or slider. */
  readonly label?: string | undefined;
  /** Accessible value text (default the formatted value). */
  readonly valueText?: ((value: number) => string) | undefined;
  /** Custom marker content (an image, an icon) centered on the pointer position. */
  readonly render?: ((ctx: { readonly value: number; readonly x: number; readonly y: number }) => unknown) | undefined;
}

/**
 * The JSX forms of `axes` and `pointers` (same fields as an entry).
 * They render nothing: `Gauge` reads the props of its direct children, in
 * order, so `axis` indexes count `GaugeAxis` children.
 */
export function GaugeAxis(_props: GaugeAxis): null {
  return null;
}

export function GaugePointer(_props: GaugePointer): null {
  return null;
}

export interface GaugeLayoutInput {
  readonly shape: GaugeShape;
  readonly width: number;
  readonly height: number;
  readonly orientation: 'horizontal' | 'vertical';
  readonly container: GaugeContainer;
  readonly center: readonly [number, number];
  readonly rangeGap: number;
  readonly axes: readonly GaugeAxis[];
  readonly pointers: readonly GaugePointer[];
  readonly values: readonly number[];
  readonly hiddenRanges: ReadonlySet<string>;
  readonly locale?: string | undefined;
  /** Space reserved at the bottom (legend). */
  readonly bottomInset: number;
  /** Space reserved at the top (the drawn title and subtitle). */
  readonly topInset?: number | undefined;
  readonly palette?: readonly string[] | undefined;
}

export interface TickMark {
  readonly d: string;
  readonly color?: string | undefined;
  readonly minor: boolean;
}

export interface LabelMark {
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly rotate: number;
}

export interface RangeMark {
  readonly id: string;
  readonly d: string;
  readonly color: string;
  readonly label: string;
  readonly hidden: boolean;
  readonly from: number;
  readonly to: number;
  /** Tooltip anchor. */
  readonly ax: number;
  readonly ay: number;
  /** Thumb centers of the `from` and `to` ends. */
  readonly ends: readonly [number, number, number, number];
}

export interface PointerMark {
  readonly id: string;
  readonly index: number;
  readonly axis: number;
  readonly type: GaugePointerType;
  readonly value: number;
  readonly d: string;
  readonly color: string;
  readonly cap?: { readonly cx: number; readonly cy: number; readonly r: number } | undefined;
  readonly text?: { readonly x: number; readonly y: number; readonly text: string } | undefined;
  /** Handle (slider thumb, tooltip anchor) center. */
  readonly hx: number;
  readonly hy: number;
}

export interface AnnotationMark {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly rotate: number;
  readonly content: unknown;
  readonly label?: string | undefined;
}

export interface AxisMark {
  readonly index: number;
  readonly min: number;
  readonly max: number;
  readonly line: string;
  readonly ticks: readonly TickMark[];
  readonly labels: readonly LabelMark[];
  readonly ranges: readonly RangeMark[];
  readonly container?: string | undefined;
  readonly annotations: readonly AnnotationMark[];
}

export interface GaugeModel {
  readonly axes: readonly AxisMark[];
  readonly pointers: readonly PointerMark[];
}

const DEG = Math.PI / 180;
const MAJOR = 10;
const MINOR = 5;
const FONT = 12;
const PAD = 8;

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Signed sweep in degrees from start to end. */
export function sweepOf(start: number, end: number, direction: GaugeDirection): number {
  if (direction === 'clockwise') {
    const s = (((end - start) % 360) + 360) % 360;
    return s === 0 ? 360 : s;
  }
  const s = (((start - end) % 360) + 360) % 360;
  return -(s === 0 ? 360 : s);
}

export interface Circle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
  readonly start: number;
  readonly sweep: number;
  readonly min: number;
  readonly max: number;
}

export function axisRange(axis: GaugeAxis): { min: number; max: number } {
  const min = axis.min ?? 0;
  const max = axis.max ?? 100;
  return max > min ? { min, max } : { min, max: min + 1 };
}

/** Tick label text of an axis. */
const labelFmtOf = (input: GaugeLayoutInput, axis: GaugeAxis): ValueFormatter => axis.formatLabel ?? numberFormatter(input.locale, 1, axis.labels?.format ?? { maximumFractionDigits: 2 });

export function circleOf(input: GaugeLayoutInput, axis: GaugeAxis): Circle {
  const { min, max } = axisRange(axis);
  const top = input.topInset ?? 0;
  const h = input.height - input.bottomInset - top;
  const cx = input.width * input.center[0];
  const cy = top + h * input.center[1];
  const avail = Math.max(10, Math.min(cx, input.width - cx, cy - top, top + h - cy) - PAD);
  // Outside labels stay inside the drawing: the ring of label boxes (half the widest end label across) fits in `avail`.
  const fmt = labelFmtOf(input, axis);
  const room = axis.labels?.position === 'outside' && !axis.labels.hidden ? ((axis.ticks?.position ?? 'inside') === 'inside' ? 0 : MAJOR) + 4 + FONT / 2 + Math.max(FONT / 2, textWidth(fmt(min), 'sm') / 2, textWidth(fmt(max), 'sm') / 2) : 0;
  return { cx, cy, r: Math.max(10, Math.min(avail * (axis.radius ?? 1), avail - room)), start: axis.startAngle ?? 225, sweep: sweepOf(axis.startAngle ?? 225, axis.endAngle ?? 135, axis.direction ?? 'clockwise'), min, max };
}

/** Angle (degrees) of a value on a circular axis. */
export function angleOf(c: Circle, value: number): number {
  return c.start + ((clamp(value, c.min, c.max) - c.min) / (c.max - c.min)) * c.sweep;
}

/** Value at an angle (degrees, any turn) on a circular axis, clamped to the arc. */
export function valueAtAngle(c: Circle, angle: number): number {
  const turn = c.sweep > 0 ? (((angle - c.start) % 360) + 360) % 360 : (((c.start - angle) % 360) + 360) % 360;
  const span = Math.abs(c.sweep);
  let t = turn / span;
  if (turn > span) t = turn - span > (360 - span) / 2 ? 0 : 1;
  return c.min + clamp(t, 0, 1) * (c.max - c.min);
}

export interface Track {
  /** Pixel position of the minimum and maximum along the main axis. */
  readonly p0: number;
  readonly p1: number;
  /** Cross-axis center line and container thickness. */
  readonly cross: number;
  readonly thickness: number;
  readonly vertical: boolean;
  readonly min: number;
  readonly max: number;
}

export function trackOf(input: GaugeLayoutInput, axis: GaugeAxis): Track {
  const { min, max } = axisRange(axis);
  const vertical = input.orientation === 'vertical';
  const top = input.topInset ?? 0;
  const h = input.height - input.bottomInset - top;
  const along = vertical ? h : input.width;
  const across = vertical ? input.width : h;
  const inset = PAD + (vertical ? FONT : Math.max(FONT, 18));
  const thermo = input.container === 'thermometer' ? 18 : 0;
  // Vertical: the maximum at the top unless reversed; horizontal: the minimum at the left unless reversed.
  const lo = inset + (vertical ? top : thermo);
  const hi = along - inset - (vertical ? thermo - top : 0);
  const forward = vertical ? axis.reversed === true : axis.reversed !== true;
  const thickness = Math.min(24, Math.max(8, across * 0.18));
  return { p0: forward ? lo : hi, p1: forward ? hi : lo, cross: (vertical ? 0 : top) + across / 2, thickness, vertical, min, max };
}

export function positionOf(t: Track, value: number): number {
  return t.p0 + ((clamp(value, t.min, t.max) - t.min) / (t.max - t.min)) * (t.p1 - t.p0);
}

export function valueAtPosition(t: Track, p: number): number {
  const f = (p - t.p0) / (t.p1 - t.p0);
  return t.min + clamp(f, 0, 1) * (t.max - t.min);
}

const xy = (t: Track, along: number, across: number): [number, number] => (t.vertical ? [across, along] : [along, across]);

function majorTicks(axis: GaugeAxis, min: number, max: number): number[] {
  const interval = axis.ticks?.interval;
  const ticks = interval && interval > 0 ? niceTicks(min, max, 5, interval) : niceTicks(min, max, 6);
  const inside = ticks.filter((v) => v >= min - 1e-9 && v <= max + 1e-9);
  if (inside[0] !== undefined && Math.abs(inside[0] - min) > 1e-9) inside.unshift(min);
  return inside;
}

function minorTicks(axis: GaugeAxis, min: number, max: number, major: readonly number[]): number[] {
  const step = axis.ticks?.minor;
  if (!step || step <= 0) return [];
  const out: number[] = [];
  const n = Math.min(2000, Math.floor((max - min) / step + 1e-9));
  for (let i = 0; i <= n; i++) {
    const v = min + i * step;
    if (!major.some((m) => Math.abs(m - v) < step * 1e-6)) out.push(v);
  }
  return out;
}

function rangeColorAt(ranges: readonly RangeMark[], v: number): string | undefined {
  for (const r of ranges) if (!r.hidden && v >= Math.min(r.from, r.to) && v <= Math.max(r.from, r.to)) return r.color;
  return undefined;
}

function rangeWidths(range: GaugeRange): [number, number] {
  const w = range.width ?? 10;
  return typeof w === 'number' ? [w, w] : [w[0], w[1]];
}

export function rangeId(range: GaugeRange, a: number, i: number): string {
  return range.id ?? `axis${a}-range${i}`;
}

/** Annular band between `r0(t)` and `r1(t)` along an arc, tapered when the widths differ. */
function bandPath(cx: number, cy: number, a0: number, a1: number, inner0: number, inner1: number, outer0: number, outer1: number): string {
  if (Math.abs(inner0 - inner1) < 1e-6 && Math.abs(outer0 - outer1) < 1e-6) return arcPath(cx, cy, inner0, outer0, a0 * DEG, a1 * DEG);
  const steps = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 3));
  const outer: string[] = [];
  const inner: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = (a0 + (a1 - a0) * t) * DEG;
    const o = polar(cx, cy, outer0 + (outer1 - outer0) * t, a);
    const n = polar(cx, cy, inner0 + (inner1 - inner0) * t, a);
    outer.push(`${n2(o.x)},${n2(o.y)}`);
    inner.unshift(`${n2(n.x)},${n2(n.y)}`);
  }
  return `M${outer.join('L')}L${inner.join('L')}Z`;
}

function bandRadii(r: number, width: number, position: GaugeTickPosition): [number, number] {
  if (position === 'outside') return [r, r + width];
  if (position === 'cross') return [r - width / 2, r + width / 2];
  return [r - width, r];
}

/** Marker glyph path centered at (x, y) pointing along `angle` (degrees, 0 = up). */
function markerPath(shape: GaugeMarkerShape, x: number, y: number, size: number, angle: number): string {
  const s: Record<string, SymbolShape> = { circle: 'circle', rectangle: 'rectangle', diamond: 'diamond', triangle: 'triangle', invertedTriangle: 'invertedTriangle' };
  if (shape === 'arrow' || shape === 'invertedArrow') {
    const dir = (shape === 'arrow' ? angle + 180 : angle) * DEG;
    const tip = polar(x, y, size / 2, dir);
    const l = polar(x, y, size / 2, dir + 2.4);
    const r = polar(x, y, size / 2, dir - 2.4);
    const tail = polar(x, y, size / 4, dir + Math.PI);
    return `M${n2(tip.x)},${n2(tip.y)}L${n2(l.x)},${n2(l.y)}L${n2(tail.x)},${n2(tail.y)}L${n2(r.x)},${n2(r.y)}Z`;
  }
  if (shape === 'text') return '';
  return symbolPath(s[shape] ?? 'circle', x, y, size);
}

export function layoutGauge(input: GaugeLayoutInput): GaugeModel {
  const fmt = numberFormatter(input.locale, 1, { maximumFractionDigits: 2 });
  const top = input.topInset ?? 0;
  let slot = 0;
  const axes: AxisMark[] = input.axes.map((axis, ai) => {
    const { min, max } = axisRange(axis);
    const labelFmt = labelFmtOf(input, axis);
    const ranges: RangeMark[] = [];
    const ticks: TickMark[] = [];
    const labels: LabelMark[] = [];
    const annotations: AnnotationMark[] = [];
    const major = axis.ticks?.hidden ? [] : majorTicks(axis, min, max);
    const minor = axis.ticks?.hidden ? [] : minorTicks(axis, min, max, major);
    const labelValues = axis.labels?.hidden ? [] : majorTicks(axis, min, max).slice();
    if (axis.labels?.showLast && Math.abs((labelValues[labelValues.length - 1] ?? min) - max) > 1e-9) labelValues.push(max);
    if (axis.labels?.hide === 'first') labelValues.shift();
    if (axis.labels?.hide === 'last') labelValues.pop();
    const tickPos = axis.ticks?.position ?? 'inside';
    let line = '';
    let container: string | undefined;
    if (input.shape === 'circular') {
      const c = circleOf(input, axis);
      const end = c.start + c.sweep;
      if (axis.line !== false) line = arcPath(c.cx, c.cy, c.r - 1, c.r, c.start * DEG, end * DEG);
      (axis.ranges ?? []).forEach((range, i) => {
        const id = rangeId(range, ai, i);
        const [w0, w1] = rangeWidths(range);
        const pos = range.position ?? 'inside';
        const [in0, out0] = bandRadii(c.r - (pos === 'inside' ? input.rangeGap : 0), w0, pos);
        const [in1, out1] = bandRadii(c.r - (pos === 'inside' ? input.rangeGap : 0), w1, pos);
        const a0 = angleOf(c, range.from);
        const a1 = angleOf(c, range.to);
        const mid = polar(c.cx, c.cy, (out0 + in0) / 2, ((a0 + a1) / 2) * DEG);
        const e0 = polar(c.cx, c.cy, (out0 + in0) / 2, a0 * DEG);
        const e1 = polar(c.cx, c.cy, (out1 + in1) / 2, a1 * DEG);
        const color = range.color ?? seriesColor(slot++, input.palette);
        ranges.push({ id, d: bandPath(c.cx, c.cy, a0, a1, in0, in1, out0, out1), color, label: range.label ?? `${labelFmt(range.from)}–${labelFmt(range.to)}`, hidden: input.hiddenRanges.has(id), from: range.from, to: range.to, ax: mid.x, ay: mid.y, ends: [e0.x, e0.y, e1.x, e1.y] });
      });
      const tick = (v: number, len: number, isMinor: boolean) => {
        const a = angleOf(c, v) * DEG;
        const [r0, r1] = tickPos === 'outside' ? [c.r, c.r + len] : tickPos === 'cross' ? [c.r - len / 2, c.r + len / 2] : [c.r - len, c.r];
        const p = polar(c.cx, c.cy, r0, a);
        const q = polar(c.cx, c.cy, r1, a);
        ticks.push({ d: `M${n2(p.x)},${n2(p.y)}L${n2(q.x)},${n2(q.y)}`, color: axis.ticks?.rangeColor ? rangeColorAt(ranges, v) : undefined, minor: isMinor });
      };
      for (const v of major) tick(v, MAJOR, false);
      for (const v of minor) tick(v, MINOR, true);
      const outside = axis.labels?.position === 'outside';
      const lr = outside ? c.r + (tickPos === 'inside' ? 0 : MAJOR) + 4 + FONT / 2 : c.r - (tickPos === 'outside' ? 0 : MAJOR) - 6 - FONT / 2;
      const boxes: { x: number; y: number; w: number }[] = [];
      for (const v of labelValues) {
        const deg = angleOf(c, v);
        const p = polar(c.cx, c.cy, lr, deg * DEG);
        const text = labelFmt(v);
        const w = textWidth(text, 'sm');
        // Full-circle gauges: the last label sits on the first one.
        if (Math.abs(c.sweep) >= 360 && Math.abs(v - max) < 1e-9 && labelValues.length > 1) continue;
        if (axis.labels?.overlap !== 'show' && boxes.some((b) => Math.abs(b.x - p.x) < (b.w + w) / 2 + 2 && Math.abs(b.y - p.y) < FONT)) continue;
        boxes.push({ x: p.x, y: p.y, w });
        const turn = ((deg % 360) + 360) % 360;
        labels.push({ x: r2(p.x), y: r2(p.y + FONT * 0.35), text, anchor: 'middle', rotate: axis.labels?.rotate ? r2(turn > 90 && turn < 270 ? deg + 180 : deg) : 0 });
      }
      for (const [i, an] of (axis.annotations ?? []).entries()) {
        const p = polar(c.cx, c.cy, c.r * (an.radius ?? 0.5), (an.angle ?? 180) * DEG);
        annotations.push({ id: an.id ?? `axis${ai}-annotation${i}`, x: p.x, y: p.y, rotate: an.rotate ? (an.angle ?? 180) : 0, content: an.content, label: an.label });
      }
    } else {
      const t = trackOf(input, axis);
      const side = axis.position === 'start' ? -1 : 1;
      const half = t.thickness / 2;
      if (input.container !== 'none') {
        const [x0, y0] = xy(t, Math.min(t.p0, t.p1) - 4, t.cross - half);
        const len = Math.abs(t.p1 - t.p0) + 8;
        const w = t.vertical ? t.thickness : len;
        const h = t.vertical ? len : t.thickness;
        const rx = input.container === 'normal' ? 0 : half;
        let d = rx ? roundedRect(x0, y0, w, h, rx) : rectPath(x0, y0, w, h);
        if (input.container === 'thermometer') {
          const minPos = t.p0;
          const off = (t.p0 < t.p1 ? -1 : 1) * (half + 4);
          const [bx, by] = xy(t, minPos + off, t.cross);
          d += symbolPath('circle', bx, by, 2 * half + 10);
        }
        container = d;
      }
      const edge = t.cross + side * (half + 2);
      if (axis.line !== false) {
        const [ax0, ay0] = xy(t, t.p0, edge);
        const [ax1, ay1] = xy(t, t.p1, edge);
        line = `M${n2(ax0)},${n2(ay0)}L${n2(ax1)},${n2(ay1)}`;
      }
      (axis.ranges ?? []).forEach((range, i) => {
        const id = rangeId(range, ai, i);
        const [w0, w1] = rangeWidths(range);
        const pos = range.position ?? 'inside';
        const base = pos === 'inside' ? t.cross - side * half : edge + side * input.rangeGap;
        const a = positionOf(t, range.from);
        const b = positionOf(t, range.to);
        const pts: [number, number][] = [xy(t, a, base), xy(t, b, base), xy(t, b, base + side * w1), xy(t, a, base + side * w0)];
        const color = range.color ?? seriesColor(slot++, input.palette);
        const [mx, my] = xy(t, (a + b) / 2, base + (side * (w0 + w1)) / 4);
        const ends = [...xy(t, a, base + (side * w0) / 2), ...xy(t, b, base + (side * w1) / 2)] as const;
        ranges.push({ id, d: `M${pts.map(([x, y]) => `${n2(x)},${n2(y)}`).join('L')}Z`, color, label: range.label ?? `${labelFmt(range.from)}–${labelFmt(range.to)}`, hidden: input.hiddenRanges.has(id), from: range.from, to: range.to, ax: mx, ay: my, ends });
      });
      const tickBase = edge;
      const tick = (v: number, len: number, isMinor: boolean) => {
        const p = positionOf(t, v);
        const [o0, o1] = tickPos === 'cross' ? [-len / 2, len / 2] : [0, len];
        const [x0, y0] = xy(t, p, tickBase + side * o0);
        const [x1, y1] = xy(t, p, tickBase + side * o1);
        ticks.push({ d: `M${n2(x0)},${n2(y0)}L${n2(x1)},${n2(y1)}`, color: axis.ticks?.rangeColor ? rangeColorAt(ranges, v) : undefined, minor: isMinor });
      };
      for (const v of major) tick(v, MAJOR, false);
      for (const v of minor) tick(v, MINOR, true);
      // Labels stay between the drawing edges (vertical: below the title block).
      const lo = t.vertical ? top : 0;
      const along = t.vertical ? input.height - input.bottomInset : input.width;
      const boxes: { p: number; w: number }[] = [];
      labelValues.forEach((v, i) => {
        const text = labelFmt(v);
        const w = t.vertical ? FONT : textWidth(text, 'sm');
        let p = positionOf(t, v);
        const isEdge = i === 0 || i === labelValues.length - 1;
        if (isEdge && axis.edgeLabels === 'hide' && (p - w / 2 < lo || p + w / 2 > along)) return;
        p = clamp(p, lo + w / 2 + 1, along - w / 2 - 1);
        if (axis.labels?.overlap !== 'show' && boxes.some((b) => Math.abs(b.p - p) < (b.w + w) / 2 + 2)) return;
        boxes.push({ p, w });
        const off = tickBase + side * (MAJOR + 4 + (t.vertical ? 0 : FONT / 2));
        const [x, y] = xy(t, p, off);
        labels.push({ x: r2(x), y: r2(y + FONT * 0.35), text, anchor: t.vertical ? (side > 0 ? 'start' : 'end') : 'middle', rotate: 0 });
      });
      for (const [i, an] of (axis.annotations ?? []).entries()) {
        const [x, y] = xy(t, positionOf(t, an.value ?? min), t.cross);
        annotations.push({ id: an.id ?? `axis${ai}-annotation${i}`, x: x + (an.x ?? 0), y: y + (an.y ?? 0), rotate: 0, content: an.content, label: an.label });
      }
    }
    return { index: ai, min, max, line, ticks, labels, ranges, container, annotations };
  });

  const pointers: PointerMark[] = input.pointers.map((p, i) => {
    const ai = clamp(p.axis ?? 0, 0, Math.max(0, input.axes.length - 1));
    const axis = input.axes[ai] ?? {};
    const { min, max } = axisRange(axis);
    const value = clamp(input.values[i] ?? min, min, max);
    const type = p.type ?? (input.shape === 'circular' ? 'needle' : 'bar');
    const id = p.id ?? `pointer${i}`;
    const color = p.color ?? (type === 'needle' ? 'var(--salmon-text-primary)' : 'var(--salmon-chart-1)');
    if (input.shape === 'circular') {
      const c = circleOf(input, axis);
      const deg = angleOf(c, value);
      const a = deg * DEG;
      if (type === 'needle') {
        const len = c.r * (p.length ?? 0.8);
        const tail = c.r * (p.tail ?? 0);
        const w = (p.width ?? 6) / 2;
        const tip = polar(c.cx, c.cy, len, a);
        const back = polar(c.cx, c.cy, tail, a + Math.PI);
        const l = polar(c.cx, c.cy, w, a - Math.PI / 2);
        const r = polar(c.cx, c.cy, w, a + Math.PI / 2);
        const bl = { x: back.x + (l.x - c.cx), y: back.y + (l.y - c.cy) };
        const br = { x: back.x + (r.x - c.cx), y: back.y + (r.y - c.cy) };
        const d = `M${n2(tip.x)},${n2(tip.y)}L${n2(r.x)},${n2(r.y)}L${n2(br.x)},${n2(br.y)}L${n2(bl.x)},${n2(bl.y)}L${n2(l.x)},${n2(l.y)}Z`;
        const cap = p.cap ?? 6;
        return { id, index: i, axis: ai, type, value, d, color, cap: cap > 0 ? { cx: c.cx, cy: c.cy, r: cap } : undefined, hx: tip.x, hy: tip.y };
      }
      if (type === 'bar') {
        const w = p.width ?? 10;
        const [r0, r1] = bandRadii(c.r - 2, w, p.position ?? 'inside');
        const d = Math.abs(value - min) < 1e-12 ? '' : arcPath(c.cx, c.cy, r0, r1, c.start * DEG, a);
        const h = polar(c.cx, c.cy, (r0 + r1) / 2, a);
        return { id, index: i, axis: ai, type, value, d, color, hx: h.x, hy: h.y };
      }
      const size = p.width ?? 14;
      const pos = p.position ?? 'outside';
      const rr = pos === 'outside' ? c.r + size / 2 + 2 : pos === 'cross' ? c.r : c.r - size / 2 - 2;
      const m = polar(c.cx, c.cy, rr, a);
      const shape = p.shape ?? 'invertedTriangle';
      const glyphAngle = pos === 'inside' ? deg + 180 : deg;
      return { id, index: i, axis: ai, type, value, d: markerPath(shape, m.x, m.y, size, glyphAngle), color, text: shape === 'text' ? { x: m.x, y: m.y + FONT * 0.35, text: p.text ?? fmt(value) } : undefined, hx: m.x, hy: m.y };
    }
    const t = trackOf(input, axis);
    const side = axis.position === 'start' ? -1 : 1;
    const half = t.thickness / 2;
    const pos = positionOf(t, value);
    if (type === 'bar') {
      const w = Math.min(p.width ?? t.thickness - 6, t.thickness);
      const placement = p.placement ?? 'center';
      const across = placement === 'near' ? t.cross - side * (half - w / 2 - 1) : placement === 'far' ? t.cross + side * (half - w / 2 - 1) : t.cross;
      let d: string;
      const [x0, y0] = xy(t, Math.min(t.p0, pos), across - w / 2);
      const len = Math.abs(pos - t.p0);
      d = t.vertical ? rectPath(x0, y0, w, len) : rectPath(x0, y0, len, w);
      if (input.container === 'thermometer') {
        const off = (t.p0 < t.p1 ? -1 : 1) * (half + 4);
        const [bx, by] = xy(t, t.p0 + off, t.cross);
        d += symbolPath('circle', bx, by, 2 * half + 2);
      }
      const [hx, hy] = xy(t, pos, across);
      return { id, index: i, axis: ai, type, value, d, color, hx, hy };
    }
    const size = p.width ?? 14;
    // `near` is the label side of the track, `far` (default) the other side, `center` on the track.
    const placement = p.placement ?? 'far';
    const s = placement === 'near' ? side : placement === 'far' ? -side : 0;
    const [mx, my] = xy(t, pos, t.cross + s * (half + size / 2 + 2));
    // Direction toward the track (0 up, 90 right, 180 down, 270 left); a centered marker points across.
    const toward = t.vertical ? (s > 0 ? 270 : 90) : s > 0 ? 0 : 180;
    const shape = p.shape ?? 'triangle';
    const d = shape === 'triangle' || shape === 'invertedTriangle' ? arrowPath(mx, my, size, shape === 'triangle' ? toward : toward + 180) : markerPath(shape, mx, my, size, toward);
    return { id, index: i, axis: ai, type, value, d, color, text: shape === 'text' ? { x: mx, y: my + FONT * 0.35, text: p.text ?? fmt(value) } : undefined, hx: mx, hy: my };
  });
  return { axes, pointers };
}

/** Triangle centered at (x, y) whose tip points along `tip` degrees (0 up, clockwise). */
function arrowPath(x: number, y: number, size: number, tip: number): string {
  const a = tip * DEG;
  const p = polar(x, y, size / 2, a);
  const l = polar(x, y, size / 2, a + (2 * Math.PI) / 3);
  const r = polar(x, y, size / 2, a - (2 * Math.PI) / 3);
  return `M${n2(p.x)},${n2(p.y)}L${n2(l.x)},${n2(l.y)}L${n2(r.x)},${n2(r.y)}Z`;
}

function roundedRect(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, w / 2, h / 2);
  return `M${n2(x + rr)},${n2(y)}H${n2(x + w - rr)}A${n2(rr)},${n2(rr)} 0 0 1 ${n2(x + w)},${n2(y + rr)}V${n2(y + h - rr)}A${n2(rr)},${n2(rr)} 0 0 1 ${n2(x + w - rr)},${n2(y + h)}H${n2(x + rr)}A${n2(rr)},${n2(rr)} 0 0 1 ${n2(x)},${n2(y + h - rr)}V${n2(y + rr)}A${n2(rr)},${n2(rr)} 0 0 1 ${n2(x + rr)},${n2(y)}Z`;
}
