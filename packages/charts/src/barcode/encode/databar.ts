// GS1 DataBar encoders (ISO/IEC 24724): Omnidirectional,
// Truncated, Stacked, Stacked Omnidirectional, Limited, Expanded and
// Expanded Stacked (`segmentsPerRow`). Element widths come from the
// combinatorial `getRSSwidths` of ISO/IEC 24724 Annex B; the checksum weights
// are the powers of 3 modulo 79, 89 and 211 (Tables 5, 7 and 14). Pure and
// deterministic.

import { gs1Codes, gs1Problem, mod10Check, parseGs1, type EncodeResult } from './linear.js';
import type { RowsSymbol } from '../rows.js';

export type DataBarVariant = 'omnidirectional' | 'truncated' | 'stacked' | 'stackedOmnidirectional' | 'limited' | 'expanded' | 'expandedStacked';

export interface DataBarOptions {
  readonly variant?: DataBarVariant | undefined;
  /** Expanded Stacked: symbol characters (segments) per row, even, 2 to 22 (default 4). */
  readonly segmentsPerRow?: number | undefined;
}

const fail = (reason: string): { ok: false; reason: string } => ({ ok: false, reason });

function combins(n: number, r: number): number {
  let v = 1;
  for (let i = 1; i <= r; i++) v = (v * (n - r + i)) / i;
  return Math.round(v);
}

/** ISO/IEC 24724 Annex B `getRSSwidths`: the element widths of value `val` over `n` modules. */
export function dataBarWidths(val: number, n: number, elements: number, maxWidth: number, noNarrow: boolean): number[] {
  const widths: number[] = [];
  let narrowMask = 0;
  for (let bar = 0; bar < elements - 1; bar++) {
    let w = 1;
    let sub = 0;
    for (narrowMask |= 1 << bar; ; w++, narrowMask &= ~(1 << bar)) {
      sub = combins(n - w - 1, elements - bar - 2);
      if (noNarrow && !narrowMask && n - w - (elements - bar - 1) >= elements - bar - 1) sub -= combins(n - w - (elements - bar), elements - bar - 2);
      if (elements - bar - 1 > 1) {
        let less = 0;
        for (let mxw = n - w - (elements - bar - 2); mxw > maxWidth; mxw--) less += combins(n - w - mxw - 1, elements - bar - 3);
        sub -= less * (elements - 1 - bar);
      } else if (n - w > maxWidth) sub--;
      val -= sub;
      if (val < 0) break;
    }
    val += sub;
    n -= w;
    widths.push(w);
  }
  widths.push(n);
  return widths;
}

/** Odd and even element widths of a character, interleaved (odd first). */
function charWidths(odd: number, even: number, nOdd: number, nEven: number, elements: number, maxWidth: number, noNarrow: boolean): number[] {
  const o = dataBarWidths(odd, nOdd, elements, maxWidth, noNarrow);
  const e = dataBarWidths(even, nEven, elements, 9 - maxWidth, !noNarrow);
  return o.flatMap((w, i) => [w, e[i]!]);
}

/** Module string of element widths, starting with a space (`bar` false) or a bar. */
function expand(widths: readonly number[], bar = false): string {
  let s = '';
  for (const w of widths) (s += (bar ? '1' : '0').repeat(w)), (bar = !bar);
  return s;
}

const pow3 = (i: number, mod: number): number => {
  let v = 1;
  while (i-- > 0) v = (v * 3) % mod;
  return v;
};

const digit = (s: string, i: number): boolean => s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57;

/** The 13 digits of a GTIN (without check digit) from `0950110153001`, `09501101530003` or `(01)09501101530003`. */
function gtin13(value: string): string | { reason: string } {
  const v = value.startsWith('(01)') ? value.slice(4) : value;
  if (!/^\d{13,14}$/.test(v)) return { reason: 'GS1 DataBar encodes a GTIN: 13 or 14 digits, optionally after (01)' };
  if (v.length === 14 && mod10Check(v.slice(0, 13)) !== Number(v[13])) return { reason: 'invalid GTIN check digit' };
  return v.slice(0, 13);
}

const gtinText = (d13: string): string => `(01)${d13}${mod10Check(d13)}`;

// ---------------------------------------------------------------- Omnidirectional family (Tables 1, 2, 4)

const OMN_GSUM = [0, 161, 961, 2015, 2715, 0, 336, 1036, 1516];
const OMN_T = [1, 10, 34, 70, 126, 4, 20, 48, 81];
const OMN_MODULES = [12, 10, 8, 6, 4, 5, 7, 9, 11, 4, 6, 8, 10, 12, 10, 8, 6, 4];
const OMN_WIDEST = [8, 6, 4, 3, 1, 2, 4, 6, 8];
const OMN_FINDER = ['38211', '35511', '33711', '31911', '27411', '25611', '23811', '15711', '13911'];

/** The 46 element widths of a DataBar Omnidirectional symbol and its right check value. */
function omnElements(d13: string): { widths: number[]; right: number } {
  const val = Number(d13);
  const left = Math.floor(val / 4537077);
  const right = val % 4537077;
  const chars = [Math.floor(left / 1597), left % 1597, Math.floor(right / 1597), right % 1597];
  const w = chars.map((d, i) => {
    const outside = i % 2 === 0;
    let g = outside ? 0 : 5;
    while (g < (outside ? 4 : 8) && d >= OMN_GSUM[g + 1]!) g++;
    const v = d - OMN_GSUM[g]!;
    const div = Math.floor(v / OMN_T[g]!);
    const mod = v % OMN_T[g]!;
    return charWidths(outside ? div : mod, outside ? mod : div, OMN_MODULES[g]!, OMN_MODULES[g + 9]!, 4, OMN_WIDEST[g]!, !outside);
  });
  let checksum = 0;
  w.forEach((cw, i) => cw.forEach((x, j) => (checksum += pow3(8 * i + j, 79) * x)));
  checksum %= 79;
  if (checksum >= 8) checksum++;
  if (checksum >= 72) checksum++;
  const finder = (c: number) => [...OMN_FINDER[c]!].map(Number);
  const cl = Math.floor(checksum / 9);
  const cr = checksum % 9;
  const widths = [1, 1, ...w[0]!, ...finder(cl), ...w[1]!.reverse(), ...w[3]!, ...finder(cr).reverse(), ...w[2]!.reverse(), 1, 1];
  return { widths, right: cr };
}

/** Separator over (or under) a stacked omnidirectional row: complement, with the finder 13 modules alternated (ISO/IEC 24724 5.3.2.2). */
function omnSeparator(row: string, finderStart: number, value3: boolean): string {
  const s = [...row].map((m, i) => (i >= 4 && i < 46 && m === '0' ? '1' : '0'));
  let latch = true;
  for (let i = finderStart; i < finderStart + 13; i++) {
    if (value3) s[i] = i === finderStart + 10 ? '1' : '0';
    else if (row[i] === '0') (s[i] = latch ? '1' : '0'), (latch = !latch);
    else (s[i] = '0'), (latch = true);
  }
  return s.join('');
}

function encodeOmni(value: string, variant: DataBarVariant): EncodeResult<RowsSymbol> {
  const d13 = gtin13(value);
  if (typeof d13 !== 'string') return fail(d13.reason);
  const text = gtinText(d13);
  const { widths, right } = omnElements(d13);
  if (variant === 'omnidirectional' || variant === 'truncated') {
    return { ok: true, symbol: { kind: 'rows', rows: [expand(widths)], rowHeights: [variant === 'truncated' ? 13 : 33], quietZone: 1, text, showText: true } };
  }
  const top = expand(widths.slice(0, 23)) + '10';
  const bottom = '10' + expand(widths.slice(23), true);
  if (variant === 'stacked') {
    // ISO/IEC 24724 5.3.2.1: a space over equal modules of different colors, alternating otherwise.
    const sep = ['0'];
    for (let i = 1; i < 50; i++) {
      if (i >= 46) sep.push('0');
      else if (top[i] === bottom[i]) sep.push(top[i] === '0' ? '1' : '0');
      else sep.push(sep[i - 1] === '1' ? '0' : '1');
    }
    sep[1] = sep[2] = sep[3] = '0';
    return { ok: true, symbol: { kind: 'rows', rows: [top, sep.join(''), bottom], rowHeights: [5, 1, 7], quietZone: 1, text, showText: true } };
  }
  const middle = [...'0'.repeat(50)].map((_, i) => (i >= 5 && i < 46 && i % 2 === 1 ? '1' : '0')).join('');
  return {
    ok: true,
    symbol: { kind: 'rows', rows: [top, omnSeparator(top, 18, false), middle, omnSeparator(bottom, 19, right === 3), bottom], rowHeights: [33, 1, 1, 1, 33], quietZone: 1, text, showText: true },
  };
}

// ---------------------------------------------------------------- Limited (Tables 6, 7, Annex C)

const LTD_GSUM = [0, 183064, 820064, 1000776, 1491021, 1979845, 1996939];
const LTD_T = [28, 728, 6454, 203, 2408, 1, 16632];
const LTD_MODULES = [17, 13, 9, 15, 11, 19, 7];
const LTD_WIDEST = [6, 5, 3, 5, 4, 8, 1];
// Annex C: the 89 check character patterns, 14 element widths each.
const LTD_CHECK =
  '111111111133111111111112321111111111133111111111121132111111111212311111111113113111111112111132111111121112311111111212113111' +
  '111113111131111112111111321111121111123111111211121131111112121111311111131111113111121111111132111211111112311112111112113111' +
  '121112111131111212111111311113111111113111111111112123111111111122221111111111232111111111122122111111111222211111111113212111' +
  '111112112122111111121122211111111212212111111113112121111112111121221111121111222111111211122121111112121121211111131111212111' +
  '121111112122111211111122211112111112212111121112112121111212111121211113111111212111111111113113111111111132121111111112311211' +
  '111211113112111211111131121111111121112311111111211222111111112113211111111122112211111211211122111112112112211111121122112111' +
  '111212211121111113112111211112111121112211121111211221111212112111211111112111112311111121111222111111211113211111112112112211' +
  '111121121221111111221111221112112111112211121121111221111211211211211112112211112111121221111121111311211111211111211111112311' +
  '112111111222111121111113211111211112112211112111121221111121111311211111211211112211112112111221111122111111221121111111122211' +
  '2111111113211121111112112211211111121221112111111311211121111211122111211112121121112112111112211121111111221211';

function encodeLimited(value: string): EncodeResult<RowsSymbol> {
  const d13 = gtin13(value);
  if (typeof d13 !== 'string') return fail(d13.reason);
  if (d13 > '1999999999999') return fail('GS1 DataBar Limited encodes GTINs below 2000000000000 (leading 0 or 1)');
  const val = Number(d13);
  const pairs = [Math.floor(val / 2013571), val % 2013571].map((v) => {
    let g = 6;
    while (g > 0 && v < LTD_GSUM[g]!) g--;
    v -= LTD_GSUM[g]!;
    return charWidths(Math.floor(v / LTD_T[g]!), v % LTD_T[g]!, LTD_MODULES[g]!, 26 - LTD_MODULES[g]!, 7, LTD_WIDEST[g]!, false);
  });
  let checksum = 0;
  for (let i = 0; i < 14; i++) checksum += pow3(i, 89) * pairs[0]![i]! + pow3(14 + i, 89) * pairs[1]![i]!;
  checksum %= 89;
  const check = [...LTD_CHECK.slice(checksum * 14, checksum * 14 + 14)].map(Number);
  const widths = [1, 1, ...pairs[0]!, ...check, ...pairs[1]!, 1, 1, 5];
  return { ok: true, symbol: { kind: 'rows', rows: [expand(widths)], rowHeights: [10], quietZone: 1, text: gtinText(d13), showText: true } };
}

// ---------------------------------------------------------------- Expanded (Tables 8, 10, 14..16)

const EXP_GSUM = [0, 348, 1388, 2948, 3988];
const EXP_T = [4, 20, 52, 104, 204];
const EXP_MODULES = [12, 10, 8, 6, 4];
const EXP_WIDEST = [7, 5, 4, 3, 1];
const EXP_FINDER = ['18411', '11481', '36411', '11463', '34611', '11643', '32811', '11823', '26511', '11562', '22911', '11922'];
// Table 16: finder sequences by symbol length (finder numbers in base 13).
const EXP_SEQUENCE = ['12', '143', '1638', '1a385', '1a387c', '1a389cb', '12345678', '1234567a9', '1234567abc', '1234587a9cb'];

const NUM = 1;
const ALNUM = 2;
const ISO = 3;
const ALNUM_PUNCT = '*,-./';
const ISO_PUNCT = '!"%&\'()*+,-./:;<=>?_ ';

/** General-purpose field character class (ISO/IEC 24724 7.2.5.5); FNC1 (29) counts as numeric. */
function gfType(s: string, i: number): number {
  const c = s[i]!;
  if (c === '\x1d' || digit(s, i)) return NUM;
  if ((c >= 'A' && c <= 'Z') || ALNUM_PUNCT.includes(c)) return ALNUM;
  if ((c >= 'a' && c <= 'z') || ISO_PUNCT.includes(c)) return ISO;
  return 0;
}

const gfNext = (s: string, i: number, n: number, a: number, b = -1): boolean => {
  if (i + n > s.length) return false;
  for (let j = i; j < i + n; j++) if (gfType(s, j) !== a && gfType(s, j) !== b) return false;
  return true;
};

/** The binary string of an Expanded symbol and its symbol character count (ISO/IEC 24724 7.2.5). */
export function dataBarExpandedBits(src: string, segmentsPerRow = 0): { bits: string; chars: number } | string {
  let bits = '0';
  const add = (v: number, n: number) => (bits += v.toString(2).padStart(n, '0'));
  const int = (i: number, n: number): number => (/^\d+$/.test(src.slice(i, i + n)) && i + n <= src.length ? Number(src.slice(i, i + n)) : -1);
  const date = (i: number): number => {
    const [y, m, d] = [int(i, 2), int(i + 2, 2), int(i + 4, 2)];
    return y < 0 || m <= 0 || m > 12 || d < 0 || d > 31 ? -1 : y * 384 + (m - 1) * 32 + d;
  };
  const len = src.length;
  if (len > 77) return 'GS1 DataBar Expanded holds at most 77 characters';
  let method = len >= 16 && src.startsWith('01') ? 1 : 2;
  if (len >= 20 && method === 1 && src[2] === '9' && src[16] === '3') {
    const weight = int(20, 6);
    const ok = weight >= 0 && weight <= 99999;
    const dated = len === 34 && src[26] === '1' && '1357'.includes(src[27]!) && date(28) >= 0;
    if (len >= 26 && src[17] === '1' && src[18] === '0' && ok) {
      if (len === 26) method = src[19] === '3' && weight <= 32767 ? 3 : 7;
      else if (dated) method = 6 + Number(src[27]);
    } else if (len >= 26 && src[17] === '2' && src[18] === '0' && ok) {
      if (len === 26) method = (src[19] === '2' && weight <= 9999) || (src[19] === '3' && weight <= 22767) ? 4 : 8;
      else if (dated) method = 7 + Number(src[27]);
    } else if (src[17] === '9' && src[19]! >= '0' && src[19]! <= '3') {
      if (src[18] === '2') method = 5;
      else if (len >= 23 && src[18] === '3' && int(20, 3) >= 0) method = 6;
    }
  }
  let read: number;
  if (method === 1) add(4, 3), (read = 16);
  else if (method === 2) add(0, 4), (read = 0);
  else if (method <= 4) add(method + 1, 4), (read = 26);
  else if (method === 5) add(0x30, 7), (read = 20);
  else if (method === 6) add(0x34, 7), (read = 23);
  else add(56 + method - 7, 7), (read = len);
  for (let i = 0; i < read; i++) if (!digit(src, i) && src[i] !== '\x1d') return 'the compressed field of GS1 DataBar Expanded is numeric';
  const item = () => {
    for (let i = 3; i < 15; i += 3) add(int(i, 3), 10);
  };
  if (method === 1) add(Number(src[2]), 4), item();
  else if (method === 3 || method === 4) item(), add(int(20, 6) + (method === 4 && src[19] === '3' ? 10000 : 0), 15);
  else if (method === 5 || method === 6) {
    item();
    add(Number(src[19]), 2);
    if (method === 6) add(int(20, 3), 10);
  } else if (method >= 7) {
    item();
    add(Number(src[19] + src.slice(21, 26)), 20);
    add(len === 34 ? date(28) : 38400, 16);
  }
  // General-purpose data compaction (7.2.5.5.1 to 7.2.5.5.3).
  const gf = src.slice(read);
  let mode = NUM;
  let last = '';
  for (let i = 0; i < gf.length; ) {
    const t = gfType(gf, i);
    if (!t) return `GS1 DataBar Expanded cannot encode "${gf[i]}"`;
    const c = gf[i]!;
    if (mode === NUM) {
      if (i < gf.length - 1) {
        if (t !== NUM || gfType(gf, i + 1) !== NUM) add(0, 4), (mode = ALNUM);
        else {
          const v = (x: string) => (x === '\x1d' ? 10 : Number(x));
          add(11 * v(c) + v(gf[i + 1]!) + 8, 7);
          i += 2;
        }
      } else if (t !== NUM) add(0, 4), (mode = ALNUM);
      else (last = c), i++;
    } else if (c === '\x1d') add(15, 5), (mode = NUM), i++;
    else if (mode === ALNUM) {
      if (t === ISO) add(4, 5), (mode = ISO);
      else if (gfNext(gf, i, 6, NUM) || (i + 5 >= gf.length && gfNext(gf, i, gf.length - i, NUM) && gf.length - i >= 4)) add(0, 3), (mode = NUM);
      else if (digit(gf, i)) add(c.charCodeAt(0) - 43, 5), i++;
      else if (c >= 'A' && c <= 'Z') add(c.charCodeAt(0) - 33, 6), i++;
      else add(ALNUM_PUNCT.indexOf(c) + 58, 6), i++;
    } else {
      let none = true;
      for (let j = i; j < Math.min(gf.length, i + 10); j++) if (gfType(gf, j) === ISO) none = false;
      if (none && gfNext(gf, i, 4, NUM)) add(0, 3), (mode = NUM);
      else if (none && gfNext(gf, i, 5, ALNUM, NUM)) add(4, 5), (mode = ALNUM);
      else if (digit(gf, i)) add(c.charCodeAt(0) - 43, 5), i++;
      else if (c >= 'A' && c <= 'Z') add(c.charCodeAt(0) - 1, 7), i++;
      else if (c >= 'a' && c <= 'z') add(c.charCodeAt(0) - 7, 7), i++;
      else add(ISO_PUNCT.indexOf(c) + 232, 8), i++;
    }
  }
  const count = (): number => {
    let n = Math.ceil(bits.length / 12) + 1;
    if (segmentsPerRow && n % segmentsPerRow === 1) n++;
    return Math.max(4, n);
  };
  let chars = count();
  if (last) {
    const room = 12 * (chars - 1) - bits.length;
    if (room >= 4 && room <= 6) add(Number(last) + 1, 4);
    else add(Number(last) * 11 + 10 + 8, 7);
    chars = count();
  }
  if (bits.length > 252) return 'GS1 DataBar Expanded holds at most 21 data characters';
  let pad = 12 * (chars - 1) - bits.length;
  if (mode === NUM && pad > 0) add(0, 4), (pad -= 4);
  for (; pad > 0; pad -= 5) add(4, 5);
  bits = bits.slice(0, 12 * (chars - 1));
  if (method === 1 || method === 2 || method === 5 || method === 6) {
    const at = method === 1 ? 2 : method === 2 ? 3 : 6;
    bits = bits.slice(0, at) + (chars & 1 ? '1' : '0') + (chars > 14 ? '1' : '0') + bits.slice(at + 2);
  }
  return { bits, chars };
}

const expChar = (v: number): number[] => {
  let g = 0;
  while (g < 4 && v >= EXP_GSUM[g + 1]!) g++;
  const x = v - EXP_GSUM[g]!;
  return charWidths(Math.floor(x / EXP_T[g]!), x % EXP_T[g]!, EXP_MODULES[g]!, 17 - EXP_MODULES[g]!, 4, EXP_WIDEST[g]!, true);
};

/** Separator between Expanded Stacked rows: complement, with the finders alternated (ISO/IEC 24724 7.2.8). */
function expSeparator(row: string, cols: number, special: number, leftToRight: boolean, oddLast: boolean, latch: { v2: boolean }): string {
  const s = [...row].map((m, j) => (j >= 4 + special && j < row.length - 4 ? (m === '1' ? '0' : '1') : '0'));
  let space = false;
  const at = (i: number) => {
    if (row[i] === '1') (s[i] = '0'), (space = false);
    else (s[i] = space ? '0' : '1'), (space = !space);
  };
  for (let j = 0; j < cols; j++) {
    let k = 49 * j + 19 + special;
    if (leftToRight) for (let i = latch.v2 ? 2 : 0; i < (latch.v2 ? 15 : 13); i++) at(i + k);
    else {
      if (oddLast) k -= 17;
      for (let i = latch.v2 ? 14 : 12; i >= (latch.v2 ? 2 : 0); i--) at(i + k);
    }
    latch.v2 = !latch.v2;
  }
  return s.join('');
}

function encodeExpanded(value: string, stacked: boolean, segmentsPerRow: number): EncodeResult<RowsSymbol> {
  const elements = parseGs1(value);
  if (!elements) return fail('GS1 DataBar Expanded needs application identifiers written as (AI)data');
  const problem = gs1Problem(elements);
  if (problem) return fail(problem);
  const text = elements.map((e) => `(${e.ai})${e.data}`).join('');
  const src = String.fromCharCode(...gs1Codes(elements, 29));
  if (stacked && (!Number.isInteger(segmentsPerRow) || segmentsPerRow < 2 || segmentsPerRow > 22 || segmentsPerRow % 2)) {
    return fail('GS1 DataBar Expanded Stacked segmentsPerRow must be an even number from 2 to 22');
  }
  const encoded = dataBarExpandedBits(src, stacked ? segmentsPerRow : 0);
  if (typeof encoded === 'string') return fail(encoded);
  const { bits, chars } = encoded;
  const data = chars - 1;
  const widths: number[][] = [];
  for (let i = 0; i < data; i++) widths.push(expChar(parseInt(bits.slice(12 * i, 12 * i + 12), 2)));
  // Check character (7.2.6): weights by the finder each character sits beside.
  const sequence = [...EXP_SEQUENCE[Math.floor((chars - 1) / 2) - 1]!].map((c) => parseInt(c, 13));
  let checksum = 0;
  widths.forEach((w, i) => {
    const f = sequence[Math.floor((i + 1) / 2)]!;
    const row = i % 2 ? 2 * f - 3 : 2 * f - 2;
    w.forEach((x, j) => (checksum += x * pow3(8 * row + j, 211)));
  });
  const check = expChar(211 * (chars - 4) + (checksum % 211));
  const blocks = Math.ceil(chars / 2);
  const width = blocks * 5 + chars * 8 + 4;
  const el = new Array<number>(width).fill(0);
  sequence.forEach((f, i) => [...EXP_FINDER[f - 1]!].forEach((x, j) => (el[21 * i + 10 + j] = Number(x))));
  check.forEach((x, i) => (el[i + 2] = x));
  widths.forEach((w, i) => w.forEach((x, j) => (i % 2 ? (el[((i - 1) / 2) * 21 + 23 + j] = x) : (el[(i / 2) * 21 + 15 + j] = w[7 - j]!))));
  if (!stacked) {
    el[0] = el[1] = el[width - 2] = el[width - 1] = 1;
    return { ok: true, symbol: { kind: 'rows', rows: [expand(el)], rowHeights: [34], quietZone: 1, text, showText: true } };
  }
  const cols = segmentsPerRow / 2;
  const stackRows = Math.ceil(blocks / cols);
  const rows: string[] = [];
  const heights: number[] = [];
  const latch = { v2: false };
  let block = 0;
  for (let r = 1; r <= stackRows; r++) {
    const n = Math.min(cols, blocks - block);
    const special = r === stackRows && n !== cols && r % 2 === 0 && cols % 2 === 0 && n % 2 === 1 ? 1 : 0;
    const ltr = cols % 2 === 1 || r % 2 === 1 || special === 1;
    const sub = new Array<number>(2 + 21 * n + 2).fill(0);
    sub[0] = special ? 2 : 1;
    sub[1] = 1;
    for (let b = 0; b < n; b++, block++) {
      for (let j = 0; j < 21; j++) {
        const i = 2 + block * 21 + j;
        if (i >= width) continue;
        if (ltr) sub[2 + b * 21 + j] = el[i]!;
        else sub[2 + (20 - j) + (n - 1 - b) * 21] = el[i]!;
      }
    }
    sub[sub.length - 2] = sub[sub.length - 1] = 1;
    const row = expand(sub, !(r % 2 === 1 || special === 1));
    if (r > 1) {
      // Middle separator, then the bottom separator over this row (reads the latch, never writes it).
      const middle = [...'0'.repeat(49 * cols)].map((_, j) => (j >= 5 && j % 2 === 1 ? '1' : '0')).join('');
      rows.push(middle, expSeparator(row, n, special, ltr, r === stackRows && data % 2 === 0, { v2: latch.v2 }));
      heights.push(1, 1);
    }
    rows.push(row);
    heights.push(34);
    if (r !== stackRows) {
      // Top separator (below this row); the shared v2 latch carries to the next row's bottom separator.
      const below = expSeparator(row, n, 0, ltr, false, latch);
      rows.push(below);
      heights.push(1);
    }
  }
  return { ok: true, symbol: { kind: 'rows', rows, rowHeights: heights, quietZone: 1, text, showText: true } };
}

export function encodeDataBar(value: string, options: DataBarOptions = {}): EncodeResult<RowsSymbol> {
  const variant = options.variant ?? 'omnidirectional';
  if (variant === 'limited') return encodeLimited(value);
  if (variant === 'expanded' || variant === 'expandedStacked') return encodeExpanded(value, variant === 'expandedStacked', options.segmentsPerRow ?? 4);
  if (variant === 'omnidirectional' || variant === 'truncated' || variant === 'stacked' || variant === 'stackedOmnidirectional') return encodeOmni(value, variant);
  return fail(`unknown GS1 DataBar variant ${String(variant)}`);
}
