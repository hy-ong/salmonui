// Canvas mark layer, loaded as a lazy chunk. Marks are the same
// path strings the SVG layer renders (`Path2D` parses SVG path data), so the
// two renderers cannot drift. `var(--salmon-*)` colors are resolved with
// `getComputedStyle` once per draw call; the canvas is drawn at the device
// pixel ratio.

export interface CanvasMark {
  readonly d: string;
  readonly fill?: string | undefined;
  readonly stroke?: string | undefined;
  readonly strokeWidth?: number | undefined;
  readonly opacity?: number | undefined;
  readonly dash?: readonly number[] | undefined;
}

/**
 * Resolves a CSS color (including `var()`, `light-dark()` and relative
 * colors) to its computed value through a probe element next to `el`, so
 * the cascade (theme scope, color scheme) applies.
 */
export function resolveColor(el: Element, color: string, cache: Map<string, string>): string {
  if (color.startsWith('#') || !color.includes('(')) return color;
  let v = cache.get(color);
  if (v === undefined) {
    const host = el.parentElement ?? el;
    const probe = el.ownerDocument.createElement('span');
    probe.style.cssText = 'position:absolute;display:none';
    probe.style.color = color;
    host.appendChild(probe);
    v = getComputedStyle(probe).color || '#000';
    probe.remove();
    cache.set(color, v);
  }
  return v;
}

export function drawMarks(canvas: HTMLCanvasElement, marks: readonly CanvasMark[], width: number, height: number, originX = 0, originY = 0): void {
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  if (canvas.width !== w) canvas.width = w;
  if (canvas.height !== h) canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.translate(-originX, -originY);
  const colors = new Map<string, string>();
  for (const m of marks) {
    if (!m.d) continue;
    const path = new Path2D(m.d);
    ctx.globalAlpha = m.opacity ?? 1;
    if (m.fill && m.fill !== 'none') {
      ctx.fillStyle = resolveColor(canvas, m.fill, colors);
      ctx.fill(path);
    }
    if (m.stroke && m.stroke !== 'none') {
      ctx.strokeStyle = resolveColor(canvas, m.stroke, colors);
      ctx.lineWidth = m.strokeWidth ?? 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.setLineDash(m.dash ? [...m.dash] : []);
      ctx.stroke(path);
    }
  }
  ctx.globalAlpha = 1;
}
