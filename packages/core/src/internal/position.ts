// Positioning primitive: anchors and
// collision-aware placement of a floating box next to an element or a
// virtual point. The math is pure (no DOM, testable in Node); the DOM helpers
// only touch the document when called, never at import, so the module is
// server-safe. Extracted from the Data Grid overlays (`data-grid/anchor.ts`,
// `placeBox` in `data-grid/popover.tsx`) and generalized to 12 placements.

/** Anchor in viewport coordinates (a DOMRect or a point with zero size). */
export interface AnchorRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Something a floating box can be anchored to: an element, a rect, or a virtual element. */
export type AnchorLike = Element | AnchorRect | { getBoundingClientRect(): AnchorRect };

/**
 * Side of the anchor the box sits on. `top` / `bottom` / `left` / `right` are
 * physical; `start` / `end` are the inline-start / inline-end sides
 * (left / right in LTR, mirrored in RTL).
 */
export type Side = 'top' | 'bottom' | 'left' | 'right' | 'start' | 'end';
export type PhysicalSide = 'top' | 'bottom' | 'left' | 'right';
/**
 * Alignment along the anchor edge. On `top` / `bottom` it is inline (start is
 * the left edge in LTR, the right edge in RTL); on the other sides it is block
 * (start is the top edge; never mirrored).
 */
export type Align = 'start' | 'center' | 'end';
/** `side` alone means centered: `bottom`, `bottom-start`, `bottom-end`, ... (4 physical sides x 3 alignments, plus the logical `start-*` / `end-*` aliases). */
export type Placement = Side | `${Side}-start` | `${Side}-end`;

export interface Size {
  readonly width: number;
  readonly height: number;
}

export interface PositionOptions {
  /** Preferred placement. Default `bottom-start`. */
  readonly placement?: Placement | undefined;
  /** Gap between anchor and box in px. Default 2. */
  readonly offset?: number | undefined;
  /** Minimum distance from the viewport edges in px. Default 8. */
  readonly margin?: number | undefined;
  /** Mirrors logical sides and inline alignment. Default false. */
  readonly rtl?: boolean | undefined;
  /** Moves to the opposite side when the preferred one is too small. Default true. */
  readonly flip?: boolean | undefined;
  /** Clamps the box into the viewport (both axes). Default true. */
  readonly shift?: boolean | undefined;
  /** Offset along the anchor edge in px (positive moves toward the end, mirrored in RTL on top / bottom). Default 0. */
  readonly crossOffset?: number | undefined;
  /** Collision boundary in viewport coordinates (a scrolling container's rect); default the viewport. */
  readonly boundary?: AnchorRect | undefined;
  /** Minimum distance of the arrow from the box corners in px. Default 8. */
  readonly arrowPadding?: number | undefined;
}

export interface Position {
  /** Viewport x / y of the box's top-left corner, rounded to whole pixels. */
  readonly x: number;
  readonly y: number;
  /** Resolved physical side after flipping. */
  readonly side: PhysicalSide;
  readonly align: Align;
  /** Resolved placement, physical side plus alignment (`top-end`, `left`). */
  readonly placement: `${PhysicalSide}` | `${PhysicalSide}-start` | `${PhysicalSide}-end`;
  /**
   * Room on the resolved side (`size` middleware): the largest box that fits
   * without overlapping the anchor. Components cap `max-height` / `max-width`
   * with it (a long listbox scrolls instead of overflowing).
   */
  readonly availableWidth: number;
  readonly availableHeight: number;
  /**
   * Arrow position: distance in px from the box's left edge (top / bottom
   * sides) or top edge (left / right sides) to the anchor's center, clamped
   * to the box minus `arrowPadding`, so an arrow points at the anchor even
   * after a shift.
   */
  readonly arrow: number;
}

const OPPOSITE: Readonly<Record<PhysicalSide, PhysicalSide>> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Splits a placement into its side and alignment. */
export function parsePlacement(placement: Placement): { side: Side; align: Align } {
  const dash = placement.indexOf('-');
  if (dash < 0) return { side: placement as Side, align: 'center' };
  return { side: placement.slice(0, dash) as Side, align: placement.slice(dash + 1) as Align };
}

/** The physical side of a (possibly logical) side. */
export function physicalSide(side: Side, rtl: boolean): PhysicalSide {
  if (side === 'start') return rtl ? 'right' : 'left';
  if (side === 'end') return rtl ? 'left' : 'right';
  return side;
}

/**
 * Places a box of `size` next to `anchor` inside `viewport`.
 *
 * - Flip: when the preferred side is too small, the opposite side is used if
 *   the box fits there; when it fits on neither, the side with more room.
 *   A box that fits on neither inline side (`left` / `right`) moves to the
 *   block side that fits (`bottom` first) or has more room, so the shift
 *   never pushes it back over its anchor.
 * - Shift: the box is clamped into the viewport minus `margin` on both axes.
 * - Size: `availableWidth` / `availableHeight` report the room on the
 *   resolved side.
 */
export function computePosition(anchorIn: AnchorRect, size: Size, viewportIn: Size, options: PositionOptions = {}): Position {
  // A collision boundary is the viewport moved to the boundary's origin.
  const b = options.boundary;
  const anchor = b ? { left: anchorIn.left - b.left, top: anchorIn.top - b.top, width: anchorIn.width, height: anchorIn.height } : anchorIn;
  const viewport = b ? { width: b.width, height: b.height } : viewportIn;
  const p = computeInViewport(anchor, size, viewport, options);
  return b ? { ...p, x: p.x + Math.round(b.left), y: p.y + Math.round(b.top) } : p;
}

function computeInViewport(anchor: AnchorRect, size: Size, viewport: Size, options: PositionOptions): Position {
  const rtl = options.rtl ?? false;
  const offset = options.offset ?? 2;
  const margin = options.margin ?? 8;
  const parsed = parsePlacement(options.placement ?? 'bottom-start');
  const align = parsed.align;
  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const space: Record<PhysicalSide, number> = {
    top: anchor.top - offset - margin,
    bottom: viewport.height - margin - bottom - offset,
    left: anchor.left - offset - margin,
    right: viewport.width - margin - right - offset,
  };
  const isBlock = (s: PhysicalSide): boolean => s === 'top' || s === 'bottom';
  const fits = (s: PhysicalSide): boolean => space[s] >= (isBlock(s) ? size.height : size.width);
  let side = physicalSide(parsed.side, rtl);
  if (options.flip !== false && !fits(side)) {
    const other = OPPOSITE[side];
    if (fits(other) || space[other] > space[side]) side = other;
    // Fits on neither inline side: a block side, so the shift never pushes the box over its anchor.
    if (!fits(side) && !isBlock(side)) side = fits('bottom') || space.bottom > space.top ? 'bottom' : 'top';
  }
  const cross = options.crossOffset ?? 0;
  const vertical = isBlock(side);
  // Alignment as a fraction of the free length along the anchor edge; inline alignment mirrors in RTL.
  const f = align === 'center' ? 0.5 : align === 'end' ? 1 : 0;
  let x = vertical ? anchor.left + (anchor.width - size.width) * (rtl ? 1 - f : f) + (rtl ? -cross : cross) : side === 'right' ? right + offset : anchor.left - offset - size.width;
  let y = vertical ? (side === 'bottom' ? bottom + offset : anchor.top - offset - size.height) : anchor.top + (anchor.height - size.height) * f + cross;
  if (options.shift !== false) {
    x = Math.min(Math.max(margin, x), Math.max(margin, viewport.width - margin - size.width));
    y = Math.min(Math.max(margin, y), Math.max(margin, viewport.height - margin - size.height));
  }
  const extent = vertical ? size.width : size.height;
  const pad = Math.min(options.arrowPadding ?? 8, extent / 2);
  const center = vertical ? anchor.left + anchor.width / 2 - x : anchor.top + anchor.height / 2 - y;
  return {
    x: Math.round(x),
    y: Math.round(y),
    side,
    align,
    placement: align === 'center' ? side : `${side}-${align}`,
    availableWidth: Math.max(0, vertical ? viewport.width - 2 * margin : space[side]),
    availableHeight: Math.max(0, vertical ? space[side] : viewport.height - 2 * margin),
    arrow: Math.round(Math.min(Math.max(center, pad), extent - pad)),
  };
}

/**
 * The Data Grid overlay placement (`placeBox` in `data-grid/popover.tsx`):
 * `block` is `bottom-start` with a 2 px gap, `inline` is `end-start` flush
 * with the anchor (submenus). Equal to the grid's copy whenever the box fits
 * on at least one side; when it fits on neither, this picks the roomier side
 * (a block side for `inline`).
 */
export function placeBox(anchor: AnchorRect, size: Size, viewport: Size, rtl: boolean, side: 'block' | 'inline' = 'block'): { x: number; y: number } {
  const p = computePosition(anchor, size, viewport, side === 'block' ? { rtl, placement: 'bottom-start', offset: 2 } : { rtl, placement: 'end-start', offset: 0 });
  return { x: p.x, y: p.y };
}

// ---------------------------------------------------------------------------
// DOM helpers (call from effects and event handlers only)
// ---------------------------------------------------------------------------

export function rectOf(el: Element): AnchorRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/** A virtual anchor at a point (context menus at the pointer). */
export function pointRect(x: number, y: number): AnchorRect {
  return { left: x, top: y, width: 0, height: 0 };
}

/** The current viewport rect of any anchor. */
export function anchorRect(anchor: AnchorLike): AnchorRect {
  if ('getBoundingClientRect' in anchor && typeof anchor.getBoundingClientRect === 'function') {
    const r = anchor.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }
  return anchor as AnchorRect;
}

/** Layout viewport of a document (excludes classic scrollbars). */
export function viewportOf(doc: Document): Size {
  const root = doc.documentElement;
  const win = doc.defaultView;
  return { width: root.clientWidth || win?.innerWidth || 1024, height: root.clientHeight || win?.innerHeight || 768 };
}

/** Writing direction of an element, read from the DOM at call time. */
export function isRtl(el: Element | null | undefined): boolean {
  if (!el) return false;
  const win = el.ownerDocument.defaultView;
  const style = win?.getComputedStyle(el);
  return style ? style.direction === 'rtl' : el.closest('[dir]')?.getAttribute('dir') === 'rtl';
}
