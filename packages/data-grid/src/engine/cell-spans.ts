// Cell span resolution for focus, selection, and editing. The core never computes spans: a renderer that draws
// them passes a `cellSpans` resolver in the grid options, and the focus,
// selection, and edit modules ask it about the cells they move to, select, or
// edit. Without a resolver (or when it answers null) every cell is 1x1 and the
// modules behave exactly as before.

/** A span block in visible coordinates: its anchor (top-left) cell and its size. */
export interface CellSpanBlock {
  /** Visible row index of the anchor (first) row. */
  readonly rowIndex: number;
  /** Visible column index (left zone, center, right zone) of the anchor column. */
  readonly columnIndex: number;
  readonly rowSpan: number;
  readonly colSpan: number;
}

/**
 * The span block covering a visible cell, or null when the cell is not part
 * of a span (a 1x1 block). Called only on user actions (moves, selection,
 * editing), never per frame; it must be cheap when nothing spans.
 */
export interface CellSpanResolver {
  (rowIndex: number, columnIndex: number): CellSpanBlock | null;
  /** False when no cell can span right now (lets range expansion skip its edge walk). */
  readonly active?: () => boolean;
}

/** Range expansion checks at most this many edge cells; larger ranges stay as given. */
export const SPAN_RANGE_LIMIT = 1024;

/** The grid `cellSpans` option, when it is a function. */
export function spanResolverOf(options: Readonly<Record<string, unknown>>): CellSpanResolver | null {
  const resolver = options['cellSpans'];
  return typeof resolver === 'function' ? (resolver as CellSpanResolver) : null;
}

export interface SpanRect {
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
}

/**
 * Grows a rectangle of visible cells until it covers every span block it
 * touches. Only edge cells are checked (a block that reaches outside crosses
 * an edge); a rectangle whose edges hold more than `SPAN_RANGE_LIMIT` cells
 * is returned unchanged.
 */
export function expandSpanRect(resolver: CellSpanResolver, rect: SpanRect): SpanRect {
  let { r0, r1, c0, c1 } = rect;
  if (resolver.active && !resolver.active()) return rect;
  for (let pass = 0; pass < 16; pass++) {
    if (2 * (r1 - r0 + 1) + 2 * (c1 - c0 + 1) > SPAN_RANGE_LIMIT) return { r0, r1, c0, c1 };
    let n0 = r0;
    let n1 = r1;
    let m0 = c0;
    let m1 = c1;
    const grow = (r: number, c: number): void => {
      const b = resolver(r, c);
      if (!b) return;
      if (b.rowIndex < n0) n0 = b.rowIndex;
      if (b.rowIndex + b.rowSpan - 1 > n1) n1 = b.rowIndex + b.rowSpan - 1;
      if (b.columnIndex < m0) m0 = b.columnIndex;
      if (b.columnIndex + b.colSpan - 1 > m1) m1 = b.columnIndex + b.colSpan - 1;
    };
    for (let c = c0; c <= c1; c++) {
      grow(r0, c);
      if (r1 !== r0) grow(r1, c);
    }
    for (let r = r0 + 1; r < r1; r++) {
      grow(r, c0);
      if (c1 !== c0) grow(r, c1);
    }
    if (n0 === r0 && n1 === r1 && m0 === c0 && m1 === c1) break;
    r0 = n0;
    r1 = n1;
    c0 = m0;
    c1 = m1;
  }
  return { r0, r1, c0, c1 };
}
