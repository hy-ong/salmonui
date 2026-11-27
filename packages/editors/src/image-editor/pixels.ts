// Pixel fallback of the CSS filter functions for Canvas
// 2D contexts without `ctx.filter`. Pure: works on RGBA byte arrays. Color
// functions follow the Filter Effects matrices (sRGB) and are folded into one
// affine matrix per run; `blur` is three box-blur passes (a Gaussian
// approximation). Loaded lazily, only where `ctx.filter` is missing.

import type { FilterOp } from './adjust.js';

/** 3x4 affine color matrix (rows r, g, b; last column the offset in 0..1) plus an alpha factor. */
interface ColorMatrix {
  readonly m: number[];
  alpha: number;
}

const identity = (): ColorMatrix => ({ m: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0], alpha: 1 });

/** `b` after `a`: returns the matrix of applying `a` first. */
function then(a: number[], b: readonly number[]): number[] {
  const r: number[] = [];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 4; j++) {
      let v = j === 3 ? b[i * 4 + 3]! : 0;
      for (let k = 0; k < 3; k++) v += b[i * 4 + k]! * a[k * 4 + j]!;
      r.push(v);
    }
  }
  return r;
}

function matrixOf(op: FilterOp): number[] | null {
  const v = op.v;
  switch (op.fn) {
    case 'brightness':
      return [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0];
    case 'contrast': {
      const o = 0.5 - 0.5 * v;
      return [v, 0, 0, o, 0, v, 0, o, 0, 0, v, o];
    }
    case 'saturate':
      return [0.213 + 0.787 * v, 0.715 - 0.715 * v, 0.072 - 0.072 * v, 0, 0.213 - 0.213 * v, 0.715 + 0.285 * v, 0.072 - 0.072 * v, 0, 0.213 - 0.213 * v, 0.715 - 0.715 * v, 0.072 + 0.928 * v, 0];
    case 'hue-rotate': {
      const t = (v * Math.PI) / 180;
      const c = Math.cos(t);
      const s = Math.sin(t);
      return [
        0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928, 0,
        0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283, 0,
        0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072, 0,
      ];
    }
    case 'sepia': {
      const g = 1 - Math.min(1, Math.max(0, v));
      return [0.393 + 0.607 * g, 0.769 - 0.769 * g, 0.189 - 0.189 * g, 0, 0.349 - 0.349 * g, 0.686 + 0.314 * g, 0.168 - 0.168 * g, 0, 0.272 - 0.272 * g, 0.534 - 0.534 * g, 0.131 + 0.869 * g, 0];
    }
    case 'grayscale': {
      const g = 1 - Math.min(1, Math.max(0, v));
      return [0.2126 + 0.7874 * g, 0.7152 - 0.7152 * g, 0.0722 - 0.0722 * g, 0, 0.2126 - 0.2126 * g, 0.7152 + 0.2848 * g, 0.0722 - 0.0722 * g, 0, 0.2126 - 0.2126 * g, 0.7152 - 0.7152 * g, 0.0722 + 0.9278 * g, 0];
    }
    case 'invert': {
      const a = Math.min(1, Math.max(0, v));
      const k = 1 - 2 * a;
      return [k, 0, 0, a, 0, k, 0, a, 0, 0, k, a];
    }
    default:
      return null;
  }
}

function applyMatrix(data: Uint8ClampedArray, cm: ColorMatrix): void {
  const m = cm.m;
  const o0 = m[3]! * 255;
  const o1 = m[7]! * 255;
  const o2 = m[11]! * 255;
  const alpha = cm.alpha;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // Each op clamps in CSS; one folded matrix clamps once (differences stay within a few levels for presets).
    data[i] = m[0]! * r + m[1]! * g + m[2]! * b + o0;
    data[i + 1] = m[4]! * r + m[5]! * g + m[6]! * b + o1;
    data[i + 2] = m[8]! * r + m[9]! * g + m[10]! * b + o2;
    if (alpha !== 1) data[i + 3] = data[i + 3]! * alpha;
  }
}

/** Box radius whose three passes approximate a Gaussian of standard deviation `sigma`. */
export const boxRadius = (sigma: number): number => Math.max(0, Math.round((Math.sqrt(4 * sigma * sigma + 1) - 1) / 2));

function boxPass(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 4 : w * 4;
  const div = 2 * r + 1;
  for (let line = 0; line < lines; line++) {
    const base = horizontal ? line * w * 4 : line * 4;
    for (let c = 0; c < 4; c++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += src[base + Math.min(len - 1, Math.max(0, k)) * step + c]!;
      for (let x = 0; x < len; x++) {
        dst[base + x * step + c] = sum / div;
        const add = Math.min(len - 1, x + r + 1);
        const sub = Math.max(0, x - r);
        sum += src[base + add * step + c]! - src[base + sub * step + c]!;
      }
    }
  }
}

/** Gaussian-like blur in place: three horizontal and vertical box passes. */
export function blurPixels(data: Uint8ClampedArray, width: number, height: number, sigma: number): void {
  const r = boxRadius(sigma);
  if (!r || !width || !height) return;
  const tmp = new Uint8ClampedArray(data.length);
  for (let pass = 0; pass < 3; pass++) {
    boxPass(data, tmp, width, height, r, true);
    boxPass(tmp, data, width, height, r, false);
  }
}

/** Applies the op list in order to RGBA pixels in place. */
export function applyFilterOps(data: Uint8ClampedArray, width: number, height: number, ops: readonly FilterOp[]): void {
  let cm: ColorMatrix | null = null;
  const flush = (): void => {
    if (cm) applyMatrix(data, cm);
    cm = null;
  };
  for (const op of ops) {
    if (op.fn === 'blur') {
      flush();
      blurPixels(data, width, height, op.v);
      continue;
    }
    const acc: ColorMatrix = cm ?? identity();
    if (op.fn === 'opacity') acc.alpha *= Math.min(1, Math.max(0, op.v));
    else {
      const m = matrixOf(op);
      // Folded without the per-op clamp of CSS: one pass over the pixels instead of one per op.
      if (m) acc.m.splice(0, 12, ...then(acc.m, m));
    }
    cm = acc;
  }
  flush();
}

/** Pixelates RGBA pixels in place with square blocks of `size`. */
export function pixelatePixels(data: Uint8ClampedArray, width: number, height: number, size: number): void {
  const s = Math.max(1, Math.round(size));
  if (s === 1) return;
  for (let by = 0; by < height; by += s) {
    for (let bx = 0; bx < width; bx += s) {
      const ex = Math.min(width, bx + s);
      const ey = Math.min(height, by + s);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * width + x) * 4;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          a += data[i + 3]!;
          n++;
        }
      }
      for (let y = by; y < ey; y++) {
        for (let x = bx; x < ex; x++) {
          const i = (y * width + x) * 4;
          data[i] = r / n;
          data[i + 1] = g / n;
          data[i + 2] = b / n;
          data[i + 3] = a / n;
        }
      }
    }
  }
}
