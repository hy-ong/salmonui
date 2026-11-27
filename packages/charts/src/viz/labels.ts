// Label placement and the overlap pass: axis label strategies (hide, trim, wrap,
// stagger, rotate) and a greedy collision pass for data labels. Widths come
// from the deterministic text table, so the server and client agree.

import { lineHeight, rotatedBox, textWidth, truncateText, wrapText, type FontSize } from './text.js';

export type LabelOverlap = 'none' | 'hide' | 'trim' | 'wrap' | 'stagger' | 'rotate45' | 'rotate90';

export interface AxisLabelPlan {
  /** Rotation in degrees (0, -45 or -90). */
  readonly angle: number;
  /** Lines per label (one line unless wrapped). */
  readonly lines: readonly (readonly string[])[];
  /** Labels hidden by the `hide` strategy. */
  readonly hidden: readonly boolean[];
  /** Row of each label: 0, or 1 for every other label when staggered. */
  readonly rows: readonly number[];
  /** Extent of the label block perpendicular to the axis (px). */
  readonly thickness: number;
}

/**
 * Plans horizontal axis labels centered at `positions` (px along the axis)
 * so they do not overlap. `spacing` is the room per label (band step or tick
 * distance) and caps the trim / wrap width; `maxWidth` caps rotated labels.
 */
export function planHorizontalLabels(
  labels: readonly string[],
  positions: readonly number[],
  mode: LabelOverlap | 'auto',
  options: { readonly size?: FontSize | undefined; readonly spacing?: number | undefined; readonly maxWidth?: number | undefined; readonly angle?: number | undefined } = {},
): AxisLabelPlan {
  const size = options.size ?? 'sm';
  const lh = lineHeight(size);
  const widths = labels.map((l) => textWidth(l, size));
  const n = labels.length;
  const gap = 4;
  const overlaps = (w: readonly number[], hidden?: readonly boolean[]): boolean => {
    let prevEnd = Number.NEGATIVE_INFINITY;
    for (let i = 0; i < n; i++) {
      if (hidden?.[i]) continue;
      const p = positions[i] as number;
      const half = (w[i] as number) / 2;
      if (p - half < prevEnd + gap) return true;
      prevEnd = p + half;
    }
    return false;
  };
  const one = labels.map((l) => [l] as readonly string[]);
  const none: boolean[] = labels.map(() => false);
  const zeros: number[] = labels.map(() => 0);
  if (options.angle !== undefined && options.angle !== 0) {
    const maxW = options.maxWidth ?? 120;
    const lines = labels.map((l) => [truncateText(l, maxW, size)] as readonly string[]);
    const thick = Math.max(0, ...lines.map((l) => rotatedBox(textWidth(l[0] as string, size), lh, options.angle as number).height));
    return { angle: options.angle, lines, hidden: none, rows: zeros, thickness: Math.ceil(thick) };
  }
  const resolved: LabelOverlap = mode === 'auto' ? 'hide' : mode;
  if (resolved === 'none' || !overlaps(widths)) return { angle: 0, lines: one, hidden: none, rows: zeros, thickness: lh };
  const spacing = options.spacing ?? (n > 1 ? Math.abs((positions[1] as number) - (positions[0] as number)) : 100);
  switch (resolved) {
    case 'hide': {
      // Keep every k-th label so the kept ones fit (first kept, evenly spaced).
      for (let k = 2; k <= n; k++) {
        const hidden = labels.map((_, i) => i % k !== 0);
        if (!overlaps(widths, hidden)) return { angle: 0, lines: one, hidden, rows: zeros, thickness: lh };
      }
      return { angle: 0, lines: one, hidden: labels.map((_, i) => i !== 0), rows: zeros, thickness: lh };
    }
    case 'trim': {
      const w = Math.max(8, spacing - gap);
      return { angle: 0, lines: labels.map((l) => [truncateText(l, w, size)]), hidden: none, rows: zeros, thickness: lh };
    }
    case 'wrap': {
      const w = Math.max(8, spacing - gap);
      const lines = labels.map((l) => wrapText(l, w, size, 3));
      return { angle: 0, lines, hidden: none, rows: zeros, thickness: lh * Math.max(1, ...lines.map((l) => l.length)) };
    }
    case 'stagger':
      return { angle: 0, lines: one, hidden: none, rows: labels.map((_, i) => i % 2), thickness: lh * 2 };
    case 'rotate45':
    case 'rotate90': {
      const angle = resolved === 'rotate45' ? -45 : -90;
      const maxW = options.maxWidth ?? 120;
      const lines = labels.map((l) => [truncateText(l, maxW, size)] as readonly string[]);
      const thick = Math.max(0, ...lines.map((l) => rotatedBox(textWidth(l[0] as string, size), lh, angle).height));
      return { angle, lines, hidden: none, rows: zeros, thickness: Math.ceil(thick) };
    }
  }
}

/** Hides vertical-axis labels that collide (keeps the first and every k-th). */
export function planVerticalLabels(positions: readonly number[], size: FontSize = 'sm'): boolean[] {
  const lh = lineHeight(size);
  const n = positions.length;
  for (let k = 1; k <= Math.max(1, n); k++) {
    let ok = true;
    let prev = Number.NaN;
    for (let i = 0; i < n; i += k) {
      const p = positions[i] as number;
      if (!Number.isNaN(prev) && Math.abs(p - prev) < lh) {
        ok = false;
        break;
      }
      prev = p;
    }
    if (ok) return positions.map((_, i) => i % k !== 0);
  }
  return positions.map((_, i) => i !== 0);
}

export interface LabelBox {
  /** Center x. */
  x: number;
  /** Center y. */
  y: number;
  readonly width: number;
  readonly height: number;
}

export type DataLabelOverlap = 'none' | 'hide' | 'shiftY' | 'shiftX' | 'rotate90';

/**
 * Greedy collision pass over data labels in priority order (input order):
 * a colliding label is hidden or shifted along one axis (up to three label
 * heights) inside `bounds`. Mutates and returns the visibility flags.
 */
export function resolveLabelOverlaps(boxes: LabelBox[], mode: DataLabelOverlap, bounds?: { x: number; y: number; width: number; height: number }): boolean[] {
  const visible = boxes.map(() => true);
  if (mode === 'none') return visible;
  const placed: LabelBox[] = [];
  const hits = (b: LabelBox): boolean =>
    placed.some((p) => Math.abs(p.x - b.x) * 2 < p.width + b.width && Math.abs(p.y - b.y) * 2 < p.height + b.height);
  const inside = (b: LabelBox): boolean =>
    !bounds || (b.x - b.width / 2 >= bounds.x && b.x + b.width / 2 <= bounds.x + bounds.width && b.y - b.height / 2 >= bounds.y && b.y + b.height / 2 <= bounds.y + bounds.height);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i] as LabelBox;
    if (!hits(b)) {
      placed.push(b);
      continue;
    }
    if (mode === 'shiftY' || mode === 'shiftX') {
      const step = mode === 'shiftY' ? b.height + 2 : b.width + 2;
      const ox = b.x;
      const oy = b.y;
      let done = false;
      for (const k of [-1, 1, -2, 2, -3, 3]) {
        if (mode === 'shiftY') b.y = oy + k * step;
        else b.x = ox + k * step;
        if (!hits(b) && inside(b)) {
          placed.push(b);
          done = true;
          break;
        }
      }
      if (done) continue;
      b.x = ox;
      b.y = oy;
    }
    visible[i] = false;
  }
  return visible;
}
