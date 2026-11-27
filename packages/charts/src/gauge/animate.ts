// Pointer transition of `Gauge`: a lazy chunk the gauge
// loads after commit, never on the server. The rendered markup already holds
// the final values; each frame lays the pointers out at the eased values and
// writes their path data and text straight to the DOM (no React state). The
// last frame writes exactly what React rendered. `layoutGauge` is passed in
// so the chunk shares no module with the entry (no extra split chunk).

import type { GaugeLayoutInput, GaugeModel } from './layout.js';

const DURATION = 600;

/** Tweens the pointers from `from` to `input.values`; returns a cancel function. */
export function animatePointers(svg: SVGSVGElement, input: GaugeLayoutInput, from: readonly number[], layoutGauge: (input: GaugeLayoutInput) => GaugeModel, onFrame: (shown: readonly number[]) => void): () => void {
  const groups = svg.querySelectorAll('.salmon-gauge-pointer');
  // Pointer geometry only depends on the axis frame: skip ticks, labels, ranges and annotations per frame.
  const frameInput = { ...input, axes: input.axes.map((a) => ({ ...a, ticks: { hidden: true }, labels: { hidden: true }, ranges: undefined, annotations: undefined })) };
  const win = svg.ownerDocument.defaultView!;
  const start = win.performance.now();
  let raf = 0;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / DURATION);
    const e = 1 - (1 - t) ** 3;
    const shown = input.values.map((v, i) => (from[i] ?? v) + (v - (from[i] ?? v)) * e);
    layoutGauge({ ...frameInput, values: shown }).pointers.forEach((pm, i) => {
      const g = groups[i];
      if (!g) return;
      g.querySelector('path')?.setAttribute('d', pm.d);
      const text = g.querySelector('text');
      if (text && pm.text) {
        text.setAttribute('x', String(pm.text.x));
        text.setAttribute('y', String(pm.text.y));
        // Keep React's text node: only its value changes.
        if (text.firstChild) text.firstChild.nodeValue = pm.text.text;
      }
    });
    onFrame(shown);
    if (t < 1) raf = win.requestAnimationFrame(step);
  };
  raf = win.requestAnimationFrame(step);
  return () => win.cancelAnimationFrame(raf);
}
