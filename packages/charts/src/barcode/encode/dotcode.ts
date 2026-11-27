// DotCode encoder (AIM ISS DotCode Rev 4.0): the Annex F
// encodation (code sets A, B, C, binary with base-259 packing, macros,
// GS1 FNC1), Reed-Solomon over GF(113) with interleaved blocks, the four
// masks and their corner-lit variants scored as in Annex A, automatic or
// `columns`-driven symbol size, and the dot placement of 5.2.3. Pure and
// deterministic.

import { gs1Codes, gs1Problem, parseGs1, type EncodeResult } from './linear.js';

export interface DotCodeOptions {
  /** Symbol width in dot columns, 5 to 200 (default automatic, about 3:2). */
  readonly columns?: number | undefined;
  /** The value is a GS1 element string. */
  readonly gs1?: boolean | undefined;
  /** Force a mask 0 to 7 (4 to 7 light the corners); default the best score. */
  readonly mask?: number | undefined;
}

export interface DotCodeSymbol {
  readonly kind: 'matrix';
  readonly width: number;
  readonly height: number;
  /** 1 for a printed dot; only positions with an even row + column sum can be dots. */
  readonly modules: Uint8Array;
  readonly quietZone: number;
  readonly mask: number;
}

// Annex C: the 9-dot pattern of each codeword value.
const PATTERNS =
  '1550ab0ad0b50d515615a16a1aa0ae0b60ba0d60da0ea12b12d13514b14d1531591651691951a51a905705b05d06b06d07509709b09d0a70b30b90cb0cd0d30d90e50e9' +
  '12e13613a14e15c16616c17217419619a1a61ac1b21b41ca1d21d405e06e07607a09e0bc0ce0dc0e60ec0f20f411711b11d12713313914716317118b18d19319' +
  '91a31b11c51c91d102f03703b03d04f06707307908f0c70e30f111e13c17818e19c1b81c61cc';
const dotPattern = (v: number): number => parseInt(PATTERNS.slice(v * 3, v * 3 + 3), 16);

const isDigit = (c: number | undefined): boolean => c !== undefined && c >= 48 && c <= 57;

/** Codewords of the message (ISO-like Annex F algorithm), with the final code set. */
export function dotCodeCodewords(src: readonly number[], gs1: boolean): { cw: number[]; mode: string } {
  const len = src.length;
  const cw: number[] = [];
  const two = (i: number) => isDigit(src[i]) && isDigit(src[i + 1]);
  const pair = (i: number) => (src[i]! - 48) * 10 + src[i + 1]! - 48;
  const datumA = (i: number) => i < len && src[i]! <= 95;
  const datumB = (i: number): number => {
    if (i >= len) return 0;
    const c = src[i]!;
    if ((c >= 32 && c <= 127) || c === 9 || c === 28 || c === 29 || c === 30) return 1;
    return c === 13 && src[i + 1] === 10 ? 2 : 0;
  };
  const aheadC = (i: number) => {
    let n = 0;
    for (; i < len && two(i); i += 2) n++;
    return n;
  };
  const tryC = (i: number) => (i < len && isDigit(src[i]) && aheadC(i) > aheadC(i + 1) ? aheadC(i) : 0);
  const aheadA = (i: number) => {
    let n = 0;
    for (; i < len && datumA(i) && tryC(i) < 2; i++) n++;
    return n;
  };
  /** Characters reachable in set B, and the codewords they take. */
  const aheadB = (i: number): [number, number] => {
    let n = 0;
    let inc: number;
    const s = i;
    for (; i < len && (inc = datumB(i)) && tryC(i) < 2; i += inc) n++;
    return [i - s, n];
  };
  const binary = (i: number) => i < len && src[i]! >= 128;
  const special = (c: number) => (c === 9 ? 97 : c === 28 ? 98 : c === 29 ? 99 : 100);
  let pos = 0;
  /** `n` set-B characters as shift codewords. */
  const shiftB = (n: number) => {
    for (let k = 0; k < n; k++, pos++) {
      const c = src[pos]!;
      if (c >= 32) cw.push(c - 32);
      else if (c === 13) cw.push(96), pos++;
      else cw.push(special(c));
    }
  };
  const shiftC = (n: number) => {
    for (let k = 0; k < n; k++, pos += 2) cw.push(pair(pos));
  };
  const upper = (c: number) => (c - 128 < 32 ? cw.push(110, c - 128 + 64) : cw.push(111, c - 128 - 32));
  let mode = 'C';
  let buf = 0;
  let bufSize = 0;
  const flush = () => {
    if (!bufSize) return;
    const digits: number[] = [];
    for (let i = 0; i <= bufSize; i++) digits.unshift(buf % 103), (buf = Math.floor(buf / 103));
    cw.push(...digits);
    buf = bufSize = 0;
  };
  const toBuf = (v: number) => {
    buf = buf * 259 + v;
    if (++bufSize === 5) flush();
  };
  let macro = 0;
  const lastEOT = src[len - 1] === 4;
  const lastRSEOT = lastEOT && len > 1 && src[len - 2] === 30;
  if (!gs1 && len >= 2 && two(0)) cw.push(107);
  else if ([9, 28, 29, 30].includes(src[0]!)) cw.push(101, src[0]! + 64), (mode = 'A'), (pos = 1);
  else if (len > 5 && src[0] === 91 && src[1] === 41 && src[2] === 62 && src[3] === 30 && lastEOT) {
    // Macro headers "[)>RS05GS", "[)>RS06GS", "[)>RS12GS" and "[)>RSnn".
    const f = (src[4] === 48 && (src[5] === 53 || src[5] === 54)) || (src[4] === 49 && src[5] === 50);
    if (len > 6 && f && src[6] === 29 && lastRSEOT) macro = src[5] === 53 ? 97 : src[5] === 54 ? 98 : 99;
    else if (!f && two(4)) macro = 100;
    if (macro) {
      cw.push(106, macro);
      mode = 'B';
      if (macro === 100) cw.push(src[4]! - 48 + 16, src[5]! - 48 + 16), (pos = 6);
      else pos = 7;
    }
  }
  while (pos < len) {
    if (pos === len - 2 && macro && macro !== 100) {
      pos += 2;
      continue;
    }
    if (pos === len - 1 && macro === 100) {
      pos++;
      continue;
    }
    if (mode === 'C') {
      if (pos + 9 < len && src[pos] === 49 && src[pos + 1] === 55 && src[pos + 8] === 49 && src[pos + 9] === 48 && [2, 3, 4, 5, 6, 7].every((k) => isDigit(src[pos + k]))) {
        // (17)YYMMDD(10): one codeword for both AIs.
        cw.push(100, pair(pos + 2), pair(pos + 4), pair(pos + 6));
        pos += 10;
      } else if (two(pos) || (gs1 && src[pos] === 29)) {
        if (src[pos] === 29) cw.push(107), pos++;
        else cw.push(pair(pos)), (pos += 2);
      } else if (binary(pos)) {
        if (isDigit(src[pos + 1])) upper(src[pos]!), pos++;
        else cw.push(112), (mode = 'X');
      } else {
        const m = aheadA(pos);
        const [n, nx] = aheadB(pos);
        if (m > n) cw.push(101), (mode = 'A');
        else if (nx >= 1 && nx <= 4) cw.push(101 + nx), shiftB(nx);
        else cw.push(106), (mode = 'B');
      }
    } else if (mode === 'B') {
      const n = tryC(pos);
      if (n >= 2) {
        if (n <= 4) cw.push(103 + n - 2), shiftC(n);
        else cw.push(106), (mode = 'C');
      } else if (gs1 && src[pos] === 29) cw.push(107), pos++;
      else if (datumB(pos) && (src[pos]! >= 32 || src[pos] === 13 || pos !== 0)) {
        const c = src[pos]!;
        if (c >= 32 && c <= 127) cw.push(c - 32);
        else if (c === 13) cw.push(96), pos++;
        else cw.push(special(c));
        pos++;
      } else if (binary(pos)) {
        if (datumB(pos + 1)) upper(src[pos]!), pos++;
        else cw.push(112), (mode = 'X');
      } else if (aheadA(pos) === 1) {
        const c = src[pos]!;
        cw.push(101, c < 32 ? c + 64 : c - 32);
        pos++;
      } else cw.push(102), (mode = 'A');
    } else if (mode === 'A') {
      const n = tryC(pos);
      if (n >= 2) {
        if (n <= 4) cw.push(103 + n - 2), shiftC(n);
        else cw.push(106), (mode = 'C');
      } else if (gs1 && src[pos] === 29) cw.push(107), pos++;
      else if (datumA(pos)) {
        const c = src[pos]!;
        cw.push(c < 32 ? c + 64 : c - 32);
        pos++;
      } else if (binary(pos)) {
        if (datumA(pos + 1)) upper(src[pos]!), pos++;
        else cw.push(112), (mode = 'X');
      } else {
        const nx = aheadB(pos)[1];
        if (nx >= 1 && nx <= 6) cw.push(95 + nx), shiftB(nx);
        else cw.push(102), (mode = 'B');
      }
    } else {
      const n = tryC(pos);
      if (n >= 2) {
        flush();
        if (n <= 7) cw.push(101 + n), shiftC(n);
        else cw.push(111), (mode = 'C');
      } else if (binary(pos) || binary(pos + 1) || binary(pos + 2) || binary(pos + 3)) toBuf(src[pos]!), pos++;
      else {
        flush();
        if (aheadA(pos) > aheadB(pos)[0]) cw.push(109), (mode = 'A');
        else cw.push(110), (mode = 'B');
      }
    }
  }
  if (mode === 'X') flush();
  return { cw, mode };
}

/** Reed-Solomon check words over GF(113), `nc` of them after the `nd` data words, in interleaved blocks (Annex B). */
export function dotCodeReedSolomon(wd: number[], nd: number, nc: number): void {
  const nw = nd + nc;
  const step = Math.ceil(nw / 112);
  for (let start = 0; start < step; start++) {
    const ND = Math.ceil((nd - start) / step);
    const NC = Math.ceil((nw - start) / step) - ND;
    // Generator prod (x - 3^i), i = 1..NC, highest degree first.
    let g = [1];
    for (let i = 1, root = 3; i <= NC; i++, root = (root * 3) % 113) {
      const n = [...g, 0];
      for (let j = 1; j < n.length; j++) n[j] = (n[j]! + 113 * 113 - root * g[j - 1]!) % 113;
      g = n;
    }
    const e = new Array<number>(NC).fill(0);
    for (let i = 0; i < ND; i++) {
      const k = (wd[start + i * step]! + e[0]!) % 113;
      for (let j = 0; j < NC - 1; j++) e[j] = (113 - ((g[j + 1]! * k) % 113) + e[j + 1]!) % 113;
      e[NC - 1] = (113 - ((g[NC]! * k) % 113)) % 113;
    }
    e.forEach((v, i) => (wd[start + (ND + i) * step] = v ? 113 - v : 0));
  }
}

/** Symbol height and width for `minArea` dot positions (5.2.2 rule 3, 3:2 when automatic). */
export function dotCodeSize(minArea: number, columns?: number): [number, number] {
  const f = Math.fround;
  if (columns) {
    let h = Math.max(5, Math.ceil(minArea / columns));
    if ((columns + h) % 2 === 0) h++;
    return [h, columns];
  }
  const fh = f(Math.sqrt(f(minArea * f(0.666))));
  const fw = f(Math.sqrt(f(minArea * f(1.5))));
  let h = Math.floor(fh);
  let w = Math.floor(fw);
  if ((w + h) % 2 === 1) {
    if (w * h < minArea) w++, h++;
  } else if (f(fh * w) < f(fw * h)) {
    w++;
    if (w * h < minArea) {
      w--, h++;
      if (w * h < minArea) w += 2;
    }
  } else {
    h++;
    if (w * h < minArea) {
      w++, h--;
      if (w * h < minArea) h += 2;
    }
  }
  return [h, w];
}

const isCorner = (x: number, y: number, h: number, w: number): boolean =>
  (x === 0 && y === 0) ||
  (h % 2 ? (x === w - 2 && y === 0) || (x === w - 1 && y === 1) : x === w - 1 && y === 0) ||
  (h % 2 ? x === 0 && y === h - 1 : (x === 0 && y === h - 2) || (x === 1 && y === h - 1)) ||
  (x === w - 2 && y === h - 1) ||
  (x === w - 1 && y === h - 2);

/** Places the dot stream (5.2.3): rows bottom-up for an odd height, columns for an even height; corners last. */
function fold(stream: readonly number[], h: number, w: number, lightCorners: boolean): Uint8Array {
  const a = new Uint8Array(h * w);
  let p = 0;
  if (h % 2) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if ((x + y) % 2 === 0 && !isCorner(x, y, h, w)) a[(h - y - 1) * w + x] = stream[p++]!;
    for (const i of [w - 2, h * w - 2, w * 2 - 1, (h - 1) * w - 1, 0, (h - 1) * w]) a[i] = stream[p++]!;
  } else {
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) if ((x + y) % 2 === 0 && !isCorner(x, y, h, w)) a[y * w + x] = stream[p++]!;
    for (const i of [(h - 1) * w - 1, (h - 2) * w, h * w - 2, (h - 1) * w + 1, w - 1, 0]) a[i] = stream[p++]!;
  }
  if (lightCorners) {
    const corners = w % 2 ? [0, w - 1, (h - 2) * w, (h - 1) * w - 1, (h - 1) * w + 1, h * w - 2] : [0, w - 2, 2 * w - 1, (h - 1) * w - 1, (h - 1) * w, h * w - 2];
    for (const i of corners) a[i] = 1;
  }
  return a;
}

/** Annex A `ScoreArray`: edge coverage minus isolated dots and empty rows / columns. */
export function dotCodeScore(a: Uint8Array, h: number, w: number): number {
  const dot = (x: number, y: number) => x >= 0 && x < w && y >= 0 && y < h && a[y * w + x] === 1;
  const penalty = (outer: number, inner: number, clear: (i: number) => boolean) => {
    let total = 0;
    let local = 0;
    for (let i = 1; i < outer - 1; i++) {
      if (clear(i)) local = local ? local * inner : inner;
      else if (local) (total += local), (local = 0);
    }
    return total + local;
  };
  const clearRow = (y: number) => {
    for (let x = y & 1; x < w; x += 2) if (dot(x, y)) return false;
    return true;
  };
  const clearCol = (x: number) => {
    for (let y = x & 1; y < h; y += 2) if (dot(x, y)) return false;
    return true;
  };
  const pen = penalty(h, w, clearRow) + penalty(w, h, clearCol);
  const edge = (n: number, start: number, at: (i: number) => boolean, scale: number): number | null => {
    let sum = 0;
    let first = -1;
    let last = -1;
    for (let i = start; i < n; i += 2) {
      if (!at(i)) continue;
      if (first < 0) first = i;
      last = i;
      sum++;
    }
    if (!sum) return null;
    return (sum + last - first) * scale;
  };
  const edges = [
    edge(w, 0, (x) => dot(x, 0), h),
    edge(w, w & 1, (x) => dot(x, h - 1), h),
    edge(h, 0, (y) => dot(0, y), w),
    edge(h, h & 1, (y) => dot(w - 1, y), w),
  ];
  if (edges.some((e) => e === null)) return -99999;
  const worst = Math.min(...(edges as number[]));
  let lonely = 0;
  for (let y = 0; y < h; y++) {
    for (let x = y & 1; x < w; x += 2) {
      if (!dot(x - 1, y - 1) && !dot(x + 1, y - 1) && !dot(x - 1, y + 1) && !dot(x + 1, y + 1) && (!dot(x, y) || (!dot(x - 2, y) && !dot(x, y - 2) && !dot(x + 2, y) && !dot(x, y + 2)))) lonely++;
    }
  }
  return worst - lonely * lonely - pen;
}

export function encodeDotCode(value: string, options: DotCodeOptions = {}): EncodeResult<DotCodeSymbol> {
  let src: number[];
  if (options.gs1) {
    const elements = parseGs1(value);
    if (!elements) return { ok: false, reason: 'GS1 DotCode needs application identifiers written as (AI)data' };
    const problem = gs1Problem(elements);
    if (problem) return { ok: false, reason: problem };
    src = gs1Codes(elements, 29);
  } else {
    src = [];
    for (let i = 0; i < value.length; i++) {
      const c = value.charCodeAt(i);
      if (c > 255) return { ok: false, reason: 'DotCode encodes ISO 8859-1 characters only' };
      src.push(c);
    }
  }
  if (!src.length) return { ok: false, reason: 'DotCode needs a value' };
  const cols = options.columns;
  if (cols !== undefined && (!Number.isInteger(cols) || cols < 5 || cols > 200)) return { ok: false, reason: 'DotCode columns must be 5 to 200' };
  const { cw, mode } = dotCodeCodewords(src, options.gs1 === true);
  let data = cw.length;
  const [h, w] = dotCodeSize(2 * (9 * (data + 3 + Math.floor(data / 2)) + 2), cols);
  if (h > 200 || w > 200) return { ok: false, reason: 'DotCode data does not fit 200 x 200 dots' };
  const dots = Math.floor((h * w) / 2);
  // Pad (5.2.1.4): latches that fill the dots the size leaves over.
  let i = data;
  while (9 * (i + 1 + 3 + Math.floor((i + 1) / 2)) + 2 <= dots) i++;
  let pad = i - data;
  if (pad && mode === 'X') cw.push(109), pad--;
  while (pad-- > 0) cw.push(106);
  data = cw.length;
  const ec = 3 + Math.floor(data / 2);
  const build = (mask: number): number[] => {
    const step = [0, 3, 7, 17][mask % 4]!;
    const m = [mask % 4, ...cw.map((c, j) => (c + j * step) % 113)];
    dotCodeReedSolomon(m, data + 1, ec);
    return m;
  };
  const place = (mask: number): Uint8Array => {
    const m = build(mask);
    const stream: number[] = [(m[0]! >> 1) & 1, m[0]! & 1];
    for (let j = 1; j < m.length; j++) {
      const p = dotPattern(m[j]!);
      for (let b = 8; b >= 0; b--) stream.push((p >> b) & 1);
    }
    while (stream.length < dots) stream.push(1);
    return fold(stream, h, w, mask >= 4);
  };
  let best = options.mask;
  if (best !== undefined && (!Number.isInteger(best) || best < 0 || best > 7)) return { ok: false, reason: 'DotCode mask must be 0 to 7' };
  if (best === undefined) {
    let high = -Infinity;
    for (let k = 0; k < 4; k++) {
      const s = dotCodeScore(place(k), h, w);
      if (s >= high) (high = s), (best = k);
    }
    if (high <= dots) {
      for (let k = 4; k < 8; k++) {
        const s = dotCodeScore(place(k), h, w);
        if (s >= high) (high = s), (best = k);
      }
    }
  }
  return { ok: true, symbol: { kind: 'matrix', width: w, height: h, modules: place(best!), quietZone: 3, mask: best! } };
}
