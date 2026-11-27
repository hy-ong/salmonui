// `@salmonui/charts/sparkline/canvas`: the opt-in canvas mark layer
// of `Sparkline`. Passed as `canvasRenderer`, it draws the very mark elements
// the SVG layer would render (paths through `Path2D`, bars, markers), so the
// two renderers cannot drift; bands, the axis line and labels stay SVG. A
// separate entry rather than a lazy chunk: `/sparkline` stays a few
// kilobytes for grid cells and never carries a loader for it. Colors
// (`var(--salmon-*)` or data colors) are resolved through the computed style
// once per distinct value; the canvas is drawn at the device pixel ratio.

import type { ReactElement } from 'react';
import type { SparklineCanvasRenderer } from './types.js';

type MarkProps = {
  readonly className?: string;
  readonly style?: { readonly fill?: string; readonly stroke?: string };
  readonly d?: string;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly r?: number;
};

function resolver(canvas: HTMLCanvasElement): (color: string) => string {
  const cache = new Map<string, string>();
  return (color) => {
    if (!color.includes('(')) return color;
    let v = cache.get(color);
    if (v === undefined) {
      const probe = canvas.ownerDocument.createElement('span');
      probe.style.color = color;
      (canvas.parentNode ?? canvas.ownerDocument.body).appendChild(probe);
      v = getComputedStyle(probe).color || '#000';
      probe.remove();
      cache.set(color, v);
    }
    return v;
  };
}

/** Draws the sparkline marks (`<path>`, `<rect>`, `<circle>` elements) on `canvas`, sized `width` x `height` drawing px. */
export const sparklineCanvas: SparklineCanvasRenderer = (canvas, marks, width, height) => {
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const color = resolver(canvas);
  for (const mark of marks as readonly ReactElement<MarkProps>[]) {
    const p = mark.props;
    const fill = p.style?.fill;
    ctx.globalAlpha = 1;
    if (mark.type === 'path' && p.d) {
      const path = new Path2D(p.d);
      if (p.className?.includes('area')) {
        ctx.globalAlpha = 0.25;
        ctx.fillStyle = color(fill ?? '#000');
        ctx.fill(path);
      } else {
        ctx.strokeStyle = color(p.style?.stroke ?? '#000');
        ctx.lineWidth = 1.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke(path);
      }
    } else if (mark.type === 'rect') {
      ctx.fillStyle = color(fill ?? '#000');
      ctx.fillRect(p.x ?? 0, p.y ?? 0, p.width ?? 0, p.height ?? 0);
    } else if (mark.type === 'circle') {
      ctx.fillStyle = color(fill ?? '#000');
      ctx.beginPath();
      ctx.arc(p.cx ?? 0, p.cy ?? 0, p.r ?? 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
};
