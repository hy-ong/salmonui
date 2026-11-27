// Editing geometry of `ImageEditor`: resize handles,
// ratio presets, 90-degree turns and flips of oriented coordinates, zoom
// around a point. Pure; loaded with the interaction chunk.

import { centerOf, clampPan, clampRect, fitView, type Point, type Rect, type Size } from './geometry.js';

const RAD = Math.PI / 180;
import type { ImageEditorCropRatio } from './types.js';

/** A resize handle: compass corners and edges. */
export type Handle = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
export const HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** A new size from a partial edit; with `keep`, the other side follows `aspect`. */
export function resizeKeepingAspect(current: Size, next: Partial<Size>, keep: boolean, aspect = current.width / current.height): Size {
  const w = next.width ?? current.width;
  const h = next.height ?? current.height;
  if (!keep || !(aspect > 0)) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) };
  if (next.width !== undefined && next.height === undefined) return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(w / aspect)) };
  if (next.height !== undefined && next.width === undefined) return { width: Math.max(1, Math.round(h * aspect)), height: Math.max(1, Math.round(h)) };
  return { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(w / aspect)) };
}

/** Width / height of a preset, `null` for free. */
export function ratioValue(preset: ImageEditorCropRatio): number | null {
  if (typeof preset === 'object') return preset.ratio > 0 ? preset.ratio : null;
  if (preset === 'free') return null;
  if (preset === 'square' || preset === 'circle') return 1;
  const [a, b] = preset.split(':').map(Number);
  return a && b ? a / b : null;
}

/** The largest rect of `ratio` centered in `within`, clamped into `bounds`. */
export function fitRatio(within: Rect, ratio: number | null, bounds: Size): Rect {
  if (!ratio) return clampRect(within, bounds);
  let width = within.width;
  let height = width / ratio;
  if (height > within.height) {
    height = within.height;
    width = height * ratio;
  }
  return clampRect({ x: within.x + (within.width - width) / 2, y: within.y + (within.height - height) / 2, width, height }, bounds);
}

/** Maps an oriented point through a further 90-degree turn (`dir` 1 clockwise, -1 counter-clockwise). */
export function rotatePoint90(p: Point, size: Size, dir: 1 | -1): Point {
  return dir === 1 ? { x: size.height - p.y, y: p.x } : { x: p.y, y: size.width - p.x };
}

export function flipPoint(p: Point, size: Size, axis: 'horizontal' | 'vertical'): Point {
  return axis === 'horizontal' ? { x: size.width - p.x, y: p.y } : { x: p.x, y: size.height - p.y };
}

/** The axis-aligned rect after a 90-degree turn of the oriented space. */
export function rotateRect90(r: Rect, size: Size, dir: 1 | -1): Rect {
  const a = rotatePoint90({ x: r.x, y: r.y }, size, dir);
  const b = rotatePoint90({ x: r.x + r.width, y: r.y + r.height }, size, dir);
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: r.height, height: r.width };
}

export function flipRect(r: Rect, size: Size, axis: 'horizontal' | 'vertical'): Rect {
  return axis === 'horizontal' ? { ...r, x: size.width - r.x - r.width } : { ...r, y: size.height - r.y - r.height };
}

/** Rotates `p` around `c` by `deg` clockwise (y down). */
export function rotateAround(p: Point, c: Point, deg: number): Point {
  if (!deg) return p;
  const t = deg * RAD;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}


/**
 * The box after dragging `handle` of `box` (rotated by `rotation` degrees
 * around its center) to `pointer`; the opposite corner or edge stays fixed.
 * `aspect` (width / height) locks the ratio on corner drags.
 */
export function resizeFromHandle(box: Rect, rotation: number, handle: Handle, pointer: Point, aspect: number | null = null, min = 1): Rect {
  const c = centerOf(box);
  const p = rotateAround(pointer, c, -rotation);
  const lx = p.x - c.x;
  const ly = p.y - c.y;
  const hw = box.width / 2;
  const hh = box.height / 2;
  let x0 = -hw;
  let x1 = hw;
  let y0 = -hh;
  let y1 = hh;
  if (handle.includes('e')) x1 = Math.max(lx, x0 + min);
  if (handle.includes('w')) x0 = Math.min(lx, x1 - min);
  if (handle.includes('s')) y1 = Math.max(ly, y0 + min);
  if (handle.includes('n')) y0 = Math.min(ly, y1 - min);
  if (aspect && handle.length === 2) {
    const w = x1 - x0;
    const h = y1 - y0;
    if (w / h > aspect) {
      const nw = h * aspect;
      if (handle.includes('e')) x1 = x0 + nw;
      else x0 = x1 - nw;
    } else {
      const nh = w / aspect;
      if (handle.includes('s')) y1 = y0 + nh;
      else y0 = y1 - nh;
    }
  } else if (aspect && handle.length === 1) {
    // Edge drags with a locked ratio grow the other side around the center.
    if (handle === 'e' || handle === 'w') {
      const nh = (x1 - x0) / aspect;
      y0 = -nh / 2;
      y1 = nh / 2;
    } else {
      const nw = (y1 - y0) * aspect;
      x0 = -nw / 2;
      x1 = nw / 2;
    }
  }
  const width = x1 - x0;
  const height = y1 - y0;
  const wc = rotateAround({ x: c.x + (x0 + x1) / 2, y: c.y + (y0 + y1) / 2 }, c, rotation);
  return { x: wc.x - width / 2, y: wc.y - height / 2, width, height };
}

/** The pan that keeps the viewport point `at` fixed while the zoom changes from `from` to `to`. */
export function panForZoom(scene: Size, viewport: Size, from: { zoom: number; pan: Point }, to: number, at: Point): Point {
  const v = fitView(scene, viewport, from.zoom, from.pan);
  const sx = (at.x - v.x) / v.scale;
  const sy = (at.y - v.y) / v.scale;
  const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  const scale = fit * to;
  const x = at.x - sx * scale - (viewport.width - scene.width * scale) / 2;
  const y = at.y - sy * scale - (viewport.height - scene.height * scale) / 2;
  return clampPan(scene, viewport, scale, { x, y });
}

/** Rounded copy of a rect (crop and annotation boxes are committed in whole pixels). */
export const roundRect = (r: Rect): Rect => ({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) });
