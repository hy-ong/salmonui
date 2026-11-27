// Point-in-polygon (even-odd rule) for lasso selection and polygon shapes.
// Its own module so a lazy chunk (the chart interaction controller) that
// needs it does not share a module with the entry chunk.

/** Even-odd point-in-polygon; `polygon` is a flat [x0, y0, x1, y1, ...] list. */
export function pointInPolygon(x: number, y: number, polygon: ArrayLike<number>): boolean {
  let inside = false;
  const n = polygon.length >> 1;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i * 2] as number;
    const yi = polygon[i * 2 + 1] as number;
    const xj = polygon[j * 2] as number;
    const yj = polygon[j * 2 + 1] as number;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
