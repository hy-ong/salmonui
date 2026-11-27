// HeatMap canvas cells, a lazy chunk: one pixel per cell
// in an ImageData, scaled into the plot with smoothing off, so 1,000,000
// cells draw in one `putImageData` and one `drawImage`. Colors are resolved
// once per distinct color through the computed style (`var(--salmon-*)`).

import { resolveColor } from '../internal/viz/plot-canvas.js';

function rgba(css: string): [number, number, number, number] {
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/.exec(css);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number(m[4]);
    return [Number(m[1]), Number(m[2]), Number(m[3]), Math.round(a * 255)];
  }
  // Hex and named colors resolve exactly through the 1x1 probe canvas (`toRgba`).
  return [0, 0, 0, 0];
}

/** Resolves any CSS color to RGBA through a 1x1 canvas (color(), oklch() and friends). */
function toRgba(el: Element, css: string, ctx: CanvasRenderingContext2D, cache: Map<string, string>): [number, number, number, number] {
  const resolved = resolveColor(el, css, cache);
  const direct = rgba(resolved);
  if (direct[3] > 0 || /transparent/.test(resolved)) return direct;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = resolved;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] as number, d[1] as number, d[2] as number, d[3] as number];
}

export interface HeatCanvasInput {
  readonly columns: number;
  readonly rows: number;
  readonly colors: readonly string[];
  readonly reversedX: boolean;
  readonly reversedY: boolean;
  /** CSS size of the canvas (the plot rectangle in drawing px). */
  readonly width: number;
  readonly height: number;
}

export function drawHeatCells(canvas: HTMLCanvasElement, input: HeatCanvasInput): void {
  const { columns, rows } = input;
  if (!columns || !rows) return;
  const doc = canvas.ownerDocument;
  const probe = doc.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const src = doc.createElement('canvas');
  src.width = columns;
  src.height = rows;
  const sctx = src.getContext('2d');
  if (!pctx || !sctx) return;
  const img = sctx.createImageData(columns, rows);
  const px = img.data;
  const lut = new Map<string, [number, number, number, number]>();
  const cache = new Map<string, string>();
  for (let y = 0; y < rows; y++) {
    const ty = input.reversedY ? rows - 1 - y : y;
    for (let x = 0; x < columns; x++) {
      const c = input.colors[y * columns + x] as string;
      let v = lut.get(c);
      if (!v) lut.set(c, (v = toRgba(canvas, c, pctx, cache)));
      const o = (ty * columns + (input.reversedX ? columns - 1 - x : x)) * 4;
      px[o] = v[0];
      px[o + 1] = v[1];
      px[o + 2] = v[2];
      px[o + 3] = v[3];
    }
  }
  sctx.putImageData(img, 0, 0);
  const dpr = Math.max(1, globalThis.devicePixelRatio || 1);
  canvas.width = Math.max(1, Math.round(input.width * dpr));
  canvas.height = Math.max(1, Math.round(input.height * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
}
