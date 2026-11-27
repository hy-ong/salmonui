// SVG path builders for barcode symbols: dark modules merged into
// horizontal runs, one path per symbol, coordinates rounded to 0.01 so
// server and client markup are identical.

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Bars of a linear symbol: each run of `'1'` modules becomes one rectangle. `height(start, end)` lets guards grow. */
export function barsPath(modules: string, x0: number, y0: number, moduleWidth: number, height: number | ((start: number, end: number) => number)): string {
  let d = '';
  for (let i = 0; i < modules.length; ) {
    if (modules[i] !== '1') {
      i++;
      continue;
    }
    let j = i;
    while (modules[j] === '1') j++;
    const h = typeof height === 'number' ? height : height(i, j);
    d += `M${r2(x0 + i * moduleWidth)} ${r2(y0)}h${r2((j - i) * moduleWidth)}v${r2(h)}h${r2(-(j - i) * moduleWidth)}z`;
    i = j;
  }
  return d;
}

/** Dark modules of a matrix symbol, row runs merged. `skip(x, y)` clears modules (logo area). */
export function matrixPath(modules: Uint8Array, width: number, height: number, x0: number, y0: number, size: number, skip?: (x: number, y: number) => boolean): string {
  let d = '';
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; ) {
      if (!modules[y * width + x] || (skip && skip(x, y))) {
        x++;
        continue;
      }
      let e = x;
      while (e < width && modules[y * width + e] && !(skip && skip(e, y))) e++;
      d += `M${r2(x0 + x * size)} ${r2(y0 + y * size)}h${r2((e - x) * size)}v${r2(size)}h${r2(-(e - x) * size)}z`;
      x = e;
    }
  }
  return d;
}
