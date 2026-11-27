// Pure geometry of `ImageEditor` needed to render: no React,
// no DOM; the editing geometry is `transform.ts` (lazy). Spaces:
// source (the loaded bitmap), oriented (source after the 90-degree rotation
// and the flips; crop and annotations live here), output (the crop scaled to
// `resize`) and view (CSS pixels of the canvas element).

import type { ImageEditorCrop, ImageEditorTransform } from './types.js';

export interface Size {
  readonly width: number;
  readonly height: number;
}
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface Point {
  readonly x: number;
  readonly y: number;
}

export const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);
const RAD = Math.PI / 180;

/** 0, 90, 180 or 270 for any multiple of 90 (rounded). */
export function normRotation(deg: number | undefined): number {
  const r = (Math.round((deg ?? 0) / 90) * 90) % 360;
  return r < 0 ? r + 360 : r;
}

export const normStraighten = (deg: number | undefined): number => clamp(deg ?? 0, -45, 45);

/** Size of the oriented image: width and height swap at 90 and 270 degrees. */
export function orientedSize(source: Size, rotation: number | undefined): Size {
  return normRotation(rotation) % 180 ? { width: source.height, height: source.width } : source;
}

/** Scale that makes the straightened image cover its unrotated box (no empty corners). */
export function straightenScale(size: Size, deg: number): number {
  const t = Math.abs(deg) * RAD;
  if (!t || !size.width || !size.height) return 1;
  return Math.cos(t) + Math.sin(t) * Math.max(size.width / size.height, size.height / size.width);
}

/** Clamps a rect into `bounds` (0..width, 0..height) with a minimum size. */
export function clampRect(r: Rect, bounds: Size, min = 1): Rect {
  const width = clamp(r.width, Math.min(min, bounds.width), bounds.width);
  const height = clamp(r.height, Math.min(min, bounds.height), bounds.height);
  return { x: clamp(r.x, 0, bounds.width - width), y: clamp(r.y, 0, bounds.height - height), width, height };
}

/** The effective crop in oriented pixels: the transform's crop clamped, or the whole image. */
export function cropOf(transform: ImageEditorTransform, oriented: Size): ImageEditorCrop {
  const c = transform.crop;
  if (!c) return { x: 0, y: 0, width: oriented.width, height: oriented.height, shape: 'rect' };
  return { ...clampRect(c, oriented), shape: c.shape ?? 'rect' };
}

/** Output size: `resize` when set, else the crop size (rounded, at least 1). */
export function outputSize(transform: ImageEditorTransform, source: Size): Size {
  const r = transform.resize;
  if (r) return { width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) };
  const c = cropOf(transform, orientedSize(source, transform.rotation));
  return { width: Math.max(1, Math.round(c.width)), height: Math.max(1, Math.round(c.height)) };
}

/** Where the scene (size `scene`) sits in a viewport at `zoom` with `pan`. */
export interface ViewFit {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** The fitted scale times `zoom`, centered and offset by `pan` (pan clamped so the image stays in view). */
export function fitView(scene: Size, viewport: Size, zoom: number, pan: Point): ViewFit {
  if (!scene.width || !scene.height || !viewport.width || !viewport.height) return { scale: 1, x: 0, y: 0 };
  const fit = Math.min(viewport.width / scene.width, viewport.height / scene.height);
  const scale = fit * zoom;
  const p = clampPan(scene, viewport, scale, pan);
  return { scale, x: (viewport.width - scene.width * scale) / 2 + p.x, y: (viewport.height - scene.height * scale) / 2 + p.y };
}

/** Pan limits: the image can move until its edge meets the viewport edge. */
export function clampPan(scene: Size, viewport: Size, scale: number, pan: Point): Point {
  const mx = Math.max(0, (scene.width * scale - viewport.width) / 2);
  const my = Math.max(0, (scene.height * scale - viewport.height) / 2);
  return { x: clamp(pan.x, -mx, mx), y: clamp(pan.y, -my, my) };
}


export const centerOf = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
