// Thumb math of `Gauge` (pointers, range ends): drawing
// coordinates to a value, the step and snapping shared with the keyboard.
// Static: a lazy chunk cost more in loader code than it saved.

import { axisRange, circleOf, clamp, trackOf, valueAtAngle, valueAtPosition, type GaugeAxis, type GaugeLayoutInput } from './layout.js';

/** The thumb step: `step`, or 1 % of the axis span. */
export function stepOf(p: { readonly step?: number | undefined }, axis: GaugeAxis): number {
  const { min, max } = axisRange(axis);
  return p.step && p.step > 0 ? p.step : (max - min) / 100;
}

/** Snaps to the step grid from `min`, clamped to `[lo, hi]`. */
export function snap(v: number, step: number, min: number, lo: number, hi: number): number {
  return clamp(Math.round((Math.round((v - min) / step) * step + min) * 1e9) / 1e9, lo, hi);
}

export function valueAtPoint(input: GaugeLayoutInput, axisIndex: number, step: number, lo: number, hi: number, x: number, y: number): number {
  const axis = input.axes[axisIndex] ?? {};
  let v: number;
  if (input.shape === 'circular') {
    const c = circleOf(input, axis);
    v = valueAtAngle(c, (Math.atan2(x - c.cx, c.cy - y) * 180) / Math.PI);
  } else {
    const t = trackOf(input, axis);
    v = valueAtPosition(t, t.vertical ? y : x);
  }
  // Snap to the keyboard step so dragged values are as clean as typed ones.
  return snap(v, step, axisRange(axis).min, lo, hi);
}
