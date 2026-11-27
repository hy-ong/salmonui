// PDF417 encoder (ISO/IEC 15438): Text, Byte and Numeric
// compaction (automatic selection as in the ISO reference algorithm),
// Reed-Solomon error correction over GF(929) at levels 0 to 8, row
// indicators, the three codeword clusters, column and row selection, and
// Compact PDF417 (one-module stop bar, no right row indicator). Pure and
// deterministic. Imported only by `Pdf417` (`@salmonui/charts/barcode/pdf417`).

import type { EncodeResult } from './linear.js';
import type { RowsSymbol } from '../rows.js';

export type Pdf417Compaction = 'auto' | 'text' | 'numeric' | 'byte';
export type Pdf417ErrorCorrection = 'auto' | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface Pdf417Options {
  readonly compaction?: Pdf417Compaction | undefined;
  /** Error correction level: `2^(level + 1)` codewords; `'auto'` (default) is the ISO recommended minimum. */
  readonly errorCorrection?: Pdf417ErrorCorrection | undefined;
  /** Data columns, 1 to 30 (default automatic). */
  readonly columns?: number | undefined;
  /** Rows, 3 to 90 (default automatic). */
  readonly rows?: number | undefined;
  /** Compact PDF417 (truncated): no right row indicator, one-module stop bar. */
  readonly compact?: boolean | undefined;
  /** Row height in modules (default 3, the ISO minimum). */
  readonly rowHeightRatio?: number | undefined;
}

// Codeword bar-space patterns of clusters 0, 3 and 6 (ISO/IEC 15438 Annex A).
// Each pattern is 8 element widths (1 to 6, 17 modules, bar first); the
// patterns of a cluster are enumerated in a fixed order (loops w3, w2, w4, w5,
// w6, w7 from outer to inner; the cluster number fixes w1) and the table stores, per codeword, the
// zigzag-coded gap to the previous codeword's index in that order as a base-45
// varint over 90 printable characters.
const TABLE =
  '########%(#%(#######%0#######,###*%########%####%%##########*######(###%##########%%%########%%####%%############%########%%%##########%%%*%' +
  '%%%.##########%,#######%%(#####%%##%b@#############c.##c-c.##c-###c.##c-#%c,##c-c.##c-###c0c1c,#c/c0#c/##c0c1c2c1############%cN##cIcH#cIcJc' +
  'KcJcIcJ#cK#cL####cIcJ#cK#cLcKcL###cKcLcMcNcM#############d9##d4d5##d4###d7#d6##d7#d6d7#d6##d9d8###########dK##dFdG#dH#dIdHdIdJdK#dJ%#(%%e(#e' +
  ')%#e%####%####%%%########%%####%#cO############d;##d8d7#d8d9d:d9d8#d9d:d;d<d9##d8d9d:##d;d:d;d<d;#d:d;d<d=#d<]A##########^)##^%^&^(^&^%###^)' +
  '#^(#^)e(##dPe###q$^&##^%##q*q)^)#^(q,##e$e%#q)^)#^(#q.e&e(e&e(q-^+^,########^=##^8^9^:##^;^:^;^<^=^<r&##e5e6#qK^9#e8qM#qPqO^;e:e9e:#e7e8qO^;' +
  'e:r#^=e:r%######^I#^F^G#^F##^I^Hr?#eCeD#r8^G#^F#r=r<^I^H^I^H#%%^O##eNeM^PrKeMeL(#%######%#############dL####%####e4##e1e2e3e2e1###e4#e3#e4##' +
  'e3e4#e3##e6#e5e6e5]I########^-#^*^)#^*#^+^*^+^,^-^,r$#eEeDeE^(^)#eFqK#qNqM^+eHeGeH#eEeFqM^+eHqO^-eHeG^,V/#####V:#V7#V8V7##V:V9cP#^6^7#cIV8#V' +
  '7#cNcMV:V9x&#f#f$#r6^7#cIV8#r;wM#cNcMx$f%f&r:^9cMV:V9####VB#V?##VBVAd3#^>^?d.V@^Ad0VBVAx?#f,#^>^?f/x8V@^Ad0VBVAd3d2%##VFVE#d;^DVE#xK(#%%%%%%' +
  '###e=(#####eN#eK#eJeK####eNeMeN#eK##eNeMeNeM]G%%#^$^##]P]O##^$^#r/f,f+#r(]Pf+r*]Pf-r,^$f-f,f-r,^$^#UN%#V(V&##V(V&c2#^*#V$V%^-c/V(V&wD#f2#^*^' +
  '+f5w=V%^-c/V(r?f4^,V&R/%R4R3R4R3W=V+V,W:R4R3dK^0^1c7V,W:######################################################%#######%#####################' +
  '#############################%##########################################################################################%#####(#############' +
  '#################################%#######^H#########%_2##_-_._/##_0_/_0_1_2_1_2##_-_.#_/#_0_/_0_1_2_1_2##_-_.#_/#_0_/_0_1_2_1_2##_-_.#_/#_0_' +
  '/_0_1_2##_/_0_1_2_1_2_1########_B#_?_@#_?##_B_A_B#_?_@#_?##_B_A_B#_?_@#_?##_B_A_B#_?_@#_?##_B_A_B_A_B_A######_N#_K##_N_M_N#_K_L_M_N_M_N#_K##' +
  '_N_M_N#_K_L_M_N_M_N_M###`&`%`&`%`&`%`&`%`&`%`&`%`&`%`&`%#`)`(`)`(`)`(`&########################################^2########^C#^@^A#^@##^C^B^C#' +
  '^@^A#^@##^C^B^C#^@^A#^@##^C^B^C#^@^A#^@##^C^B^C^B^C^BU6########UG##UB##UEUDUEUD#cF#^L^McA#cDcCUGUFcF#^L^McAUE^OcCUGUFcF#^L^McAUE^OcCUGUFcF#^' +
  'L^McAUE^OcCUGUFcF^NUF#####V##UNUOUN#d)_&_(d%V#UPd)_&_(d%V#UPd)_&_(d%V#UPd)_&_(d%V#UP###V*V)d1_)V)d1_)V)d1_)V)d1_)V)#d3######################' +
  '###^######^/#^,^-^.^/^.^/#^,^-^.^/^.^/#^,^-^.^/^.^/#^,^-^.^/^.^/^.U,#####U7#U4U5U4#bI^4^5bFU7U6bI^4^5bFU7U6bI^4^5bFU7U6bI^4^5bFU7U6J#####R(#' +
  'R$#R(R&VBU<R&d)^6U<R&d)^6U<R&d)^6U<R&d)^6U<R&###R.R-###d7%##############]C##]H]G]H]G]H]G]H]G]H]G]H]G]H]G]H]GU*##U/U.b)]IU.b)]IU.b)]IU.b)]IU.' +
  'R$###R,R+2#####=<=<####ED###d1#####]=]<];]<];]<];U(R1#H###ON2#####=<=<####ED##RNR&#H###ON#############(##########%#########################%' +
  '##########%##############################################################%#################%##########################V7#############W$##VMV' +
  'N#VO#VPVOVPW#W$W#W$##VMVNVMVNVO#W$W#W$#VOVPVO#W$W#W$W#W$W#W$W#W$#VO###########W9#W6W7#W6##W9W8W9#W6#W9W8W9W8W9W8W9W8W9W8########WI#WFWGWHWIW' +
  'HWIWH######X(X&X(X&####X0X/##X4#######################W2###########WI#WFWG#WF##WIWHWI#WF#WIWHWIWHWIWHWIWHWI[B#############U9##U4U5#U6#U7U6U7' +
  'U8U9U8]B#X)X*]=U7X,]?U9U8]BX+U8############V##UNUO#UN##V#UP^9X7X8^6V#UP#########V6#V3V4V5V6V5_%X?V5######VBVAVBVA####VJVI##_D#####%#####X-##' +
  '######X>#X;X<X=X>X=X>X=V3###########VJ#VGVH#VGVHVIVJVI_DXIXJ_AVJVITK#############U9##U4U5#U6#U7U6U7U8U9U8[E#W,W-[@U7W/[BU9U8dGY#W.U8########' +
  '####V##UNUO#UN##V#UP]<W:W;]9V#UP#########V6#V3V4V5V6V5^)WBV5######VBVAVBVA####VJVIfK####XO#####Y-Y,Y-Y,W:########WK#WHWIWJWKWJa0Y4WJV3######' +
  '#####VJ#VGVH#VG##VJVI_#X)X*^NVJVITK########U/##U*U+#U,#U-U,U-U.U/U.[;#W,W-[6U-W/[8U/U.cJX1W.U.######U;#U8U9#U8##U;U:]%W:W;[PU;U:####UC#U@UAU' +
  'BUCUB]6WBUB##UGUFUGUFm>#Y8###Y?Y>X/#####X:X9X:X9W:########WK#WH##WKWJ`=XAWJU.#####U9#U6#U7U6U7U8U9U8]@X)X*]=U9U8RC###RJ#RGRHRIRJRIW;#U>U?W6R' +
  'HUAW8RJRI_JX1U@RI##RNRMRNRMWCUDUEW@RNRM#RPROWGUFROh&#XE###XLXKX/#####X:X9X:X9U8###U?#U<##U?U>^1XAU>R?#RBRARBRAW5UBUCW2RBRA#RDRCW9UDRC`1#XE##' +
  '#XLXKU<#U?U>U?U>R=';

let patterns: Uint32Array | undefined;

/** The 3 x 929 codeword patterns as 17-bit values (bit 16 = first module), cluster-major. */
export function pdf417Patterns(): Uint32Array {
  if (patterns) return patterns;
  const out = new Uint32Array(2787);
  let pos = 0;
  for (let k = 0; k < 3; k++) {
    const cand: number[] = [];
    const w = [0, 0, 0, 0, 0, 0, 0, 0];
    for (w[2] = 1; w[2] <= 6; w[2]++) for (w[1] = 1; w[1] <= 6; w[1]++) for (w[3] = 1; w[3] <= 6; w[3]++) for (w[4] = 1; w[4] <= 6; w[4]++)
      for (w[5] = 1; w[5] <= 6; w[5]++) for (w[6] = 1; w[6] <= 6; w[6]++) {
        // The cluster fixes w1 (mod 9) given the other bars: one candidate at most.
        w[0] = ((w[2]! - w[4]! + w[6]! + 3 * k + 17) % 9) + 1;
        const w7 = 17 - w[0] - w[1]! - w[2]! - w[3]! - w[4]! - w[5]! - w[6]!;
        if (w[0] > 6 || w7 < 1 || w7 > 6) continue;
        let p = 0;
        w[7] = w7;
        for (let e = 0; e < 8; e++) for (let m = 0; m < w[e]!; m++) p = (p << 1) | (e % 2 === 0 ? 1 : 0);
        cand.push(p);
      }
    let prev = -1;
    for (let i = 0; i < 929; i++) {
      let n = 0;
      let c: number;
      while ((c = code(TABLE.charCodeAt(pos++))) >= 45) n = n * 45 + c - 45;
      n = n * 45 + c;
      prev += 1 + (n & 1 ? -((n + 1) >> 1) : n >> 1);
      out[k * 929 + i] = cand[prev]!;
    }
  }
  return (patterns = out);
}

/** Alphabet index of a table character (35..126 without `'` and `\`). */
const code = (c: number): number => c - 35 - (c > 39 ? 1 : 0) - (c > 92 ? 1 : 0);

// Text Compaction sub-modes (ISO/IEC 15438 Table 4): values 0..29 per character.
const MIXED = '0123456789&\r\t,:#-.$/+%*=^';
const PUNCT = ';<>@[\\]_`~!\r\t,:\n-.$/"|*()?{}\'';
const ALPHA = 0;
const LOWER = 1;
const MIX = 2;
const PUN = 3;

const isDigit = (c: number): boolean => c >= 48 && c <= 57;
const isText = (c: number): boolean => (c >= 32 && c <= 126) || c === 9 || c === 10 || c === 13;
const mixedIndex = (c: number): number => (c === 32 ? 26 : MIXED.indexOf(String.fromCharCode(c)));
const punctIndex = (c: number): number => PUNCT.indexOf(String.fromCharCode(c));

/** Two punctuation-only characters in a row: latch to Punctuation instead of shifting. */
const punctNext = (b: readonly number[], i: number, end: number): boolean => i + 1 < end && punctIndex(b[i + 1]!) >= 0 && mixedIndex(b[i + 1]!) < 0;

/** Text Compaction of `bytes[start, end)` from sub-mode `sub`; returns the new sub-mode. */
function encodeText(bytes: readonly number[], start: number, end: number, sub: number, out: number[]): number {
  const v: number[] = [];
  for (let i = start; i < end; ) {
    const c = bytes[i]!;
    const upper = (c >= 65 && c <= 90) || c === 32;
    const lower = (c >= 97 && c <= 122) || c === 32;
    if (sub === ALPHA) {
      if (upper) v.push(c === 32 ? 26 : c - 65), i++;
      else if (lower) v.push(27), (sub = LOWER);
      else if (mixedIndex(c) >= 0) v.push(28), (sub = MIX);
      else if (punctNext(bytes, i, end)) v.push(28, 25), (sub = PUN);
      else v.push(29, punctIndex(c)), i++;
    } else if (sub === LOWER) {
      if (lower) v.push(c === 32 ? 26 : c - 97), i++;
      else if (upper && i + 1 < end && bytes[i + 1]! >= 65 && bytes[i + 1]! <= 90) v.push(28, 28), (sub = ALPHA);
      else if (upper) v.push(27, c - 65), i++;
      else if (mixedIndex(c) >= 0) v.push(28), (sub = MIX);
      else if (punctNext(bytes, i, end)) v.push(28, 25), (sub = PUN);
      else v.push(29, punctIndex(c)), i++;
    } else if (sub === MIX) {
      if (mixedIndex(c) >= 0) v.push(mixedIndex(c)), i++;
      else if (upper) v.push(28), (sub = ALPHA);
      else if (lower) v.push(27), (sub = LOWER);
      else if (punctNext(bytes, i, end)) v.push(25), (sub = PUN);
      else v.push(29, punctIndex(c)), i++;
    } else if (punctIndex(c) >= 0) v.push(punctIndex(c)), i++;
    else v.push(29), (sub = ALPHA);
  }
  if (v.length % 2) v.push(29);
  for (let i = 0; i < v.length; i += 2) out.push(v[i]! * 30 + v[i + 1]!);
  return sub;
}

/** Byte Compaction (latch 924 for a multiple of 6 bytes, 901 otherwise; 6 bytes per 5 codewords). */
function encodeBytes(bytes: readonly number[], start: number, end: number, out: number[]): void {
  out.push((end - start) % 6 === 0 ? 924 : 901);
  let i = start;
  for (; i + 6 <= end; i += 6) {
    let t = 0;
    for (let j = 0; j < 6; j++) t = t * 256 + bytes[i + j]!;
    const g: number[] = [];
    for (let j = 0; j < 5; j++) g.unshift(t % 900), (t = Math.floor(t / 900));
    out.push(...g);
  }
  for (; i < end; i++) out.push(bytes[i]!);
}

/** Numeric Compaction: groups of 44 digits, each as base 900 of `1` followed by the digits. */
function encodeNumeric(bytes: readonly number[], start: number, end: number, out: number[]): void {
  for (let i = start; i < end; i += 44) {
    let digits = [1];
    for (let j = i; j < Math.min(end, i + 44); j++) digits.push(bytes[j]! - 48);
    const g: number[] = [];
    while (digits.length) {
      const q: number[] = [];
      let r = 0;
      for (const d of digits) {
        r = r * 10 + d;
        const x = Math.floor(r / 900);
        if (q.length || x) q.push(x);
        r %= 900;
      }
      g.unshift(r);
      digits = q;
    }
    out.push(...g);
  }
}

const digitRun = (b: readonly number[], i: number): number => {
  let n = 0;
  while (i + n < b.length && isDigit(b[i + n]!)) n++;
  return n;
};

/** Text characters from `i`, stopping before a run of 13 or more digits. */
function textRun(b: readonly number[], i: number): number {
  let n = i;
  while (n < b.length) {
    const d = digitRun(b, n);
    if (d >= 13) break;
    if (d > 0) {
      n += d;
      continue;
    }
    if (!isText(b[n]!)) break;
    n++;
  }
  return n - i;
}

/** Bytes from `i`, stopping before 13 digits or 5 text characters. */
function byteRun(b: readonly number[], i: number): number {
  let n = i;
  while (n < b.length && digitRun(b, n) < 13 && textRun(b, n) < 5) n++;
  return Math.max(1, n - i);
}

/** Data codewords (without the length descriptor) of `bytes` in a compaction mode. */
export function pdf417DataCodewords(bytes: readonly number[], compaction: Pdf417Compaction = 'auto'): number[] | string {
  const out: number[] = [];
  if (compaction === 'numeric') {
    if (!bytes.every(isDigit)) return 'numeric compaction encodes digits only';
    out.push(902);
    encodeNumeric(bytes, 0, bytes.length, out);
    return out;
  }
  if (compaction === 'byte') {
    encodeBytes(bytes, 0, bytes.length, out);
    return out;
  }
  if (compaction === 'text') {
    if (!bytes.every(isText)) return 'text compaction encodes printable ASCII, tab, CR and LF only';
    encodeText(bytes, 0, bytes.length, ALPHA, out);
    return out;
  }
  // Automatic (ISO/IEC 15438 Annex: 13 digits go numeric, 5 text characters go text, else bytes).
  let mode = 900;
  let sub = ALPHA;
  for (let i = 0; i < bytes.length; ) {
    const d = digitRun(bytes, i);
    // 13 digits, or a value of more than 5 digits only (shorter than text).
    if (d >= 13 || (d > 5 && d === bytes.length)) {
      out.push(902);
      encodeNumeric(bytes, i, i + d, out);
      (mode = 902), (sub = ALPHA), (i += d);
      continue;
    }
    const t = textRun(bytes, i);
    if (t >= 5 || (t > 0 && i + t === bytes.length && mode === 900)) {
      if (mode !== 900) out.push(900), (mode = 900), (sub = ALPHA);
      sub = encodeText(bytes, i, i + t, sub, out);
      i += t;
      continue;
    }
    const n = byteRun(bytes, i);
    if (n === 1 && mode === 900) {
      out.push(913, bytes[i]!);
      i++;
      continue;
    }
    encodeBytes(bytes, i, i + n, out);
    (mode = 901), (i += n);
  }
  return out;
}

/** Reed-Solomon error correction codewords over GF(929) (ISO/IEC 15438 Annex: generator roots 3^1..3^k). */
export function pdf417ErrorCodewords(data: readonly number[], level: number): number[] {
  const k = 2 << level;
  // Generator coefficients, lowest degree first, of prod (x - 3^i).
  let g = [1];
  for (let i = 1, root = 3; i <= k; i++, root = (root * 3) % 929) {
    const n = new Array<number>(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      n[j + 1] = (n[j + 1]! + g[j]!) % 929;
      n[j] = (n[j]! + 929 - ((g[j]! * root) % 929)) % 929;
    }
    g = n;
  }
  const e = new Array<number>(k).fill(0);
  for (const d of data) {
    const t = (d + e[k - 1]!) % 929;
    for (let j = k - 1; j > 0; j--) e[j] = (e[j - 1]! + 929 - ((t * g[j]!) % 929)) % 929;
    e[0] = (929 - ((t * g[0]!) % 929)) % 929;
  }
  return e.map((x) => (929 - x) % 929).reverse();
}

const START = '11111111010101000';
const STOP = '111111101000101001';

export function encodePdf417(value: string, options: Pdf417Options = {}): EncodeResult<RowsSymbol> {
  const bytes: number[] = [];
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c > 255) return { ok: false, reason: 'PDF417 encodes ISO 8859-1 characters only' };
    bytes.push(c);
  }
  if (!bytes.length) return { ok: false, reason: 'PDF417 needs a value' };
  const data = pdf417DataCodewords(bytes, options.compaction ?? 'auto');
  if (typeof data === 'string') return { ok: false, reason: data };
  const n = data.length + 1;
  const ecOption = options.errorCorrection ?? 'auto';
  const level = ecOption === 'auto' ? (n <= 40 ? 2 : n <= 160 ? 3 : n <= 320 ? 4 : 5) : ecOption;
  if (!Number.isInteger(level) || level < 0 || level > 8) return { ok: false, reason: 'PDF417 error correction level must be 0 to 8' };
  const ec = 2 << level;
  const total = n + ec;
  if (total > 928) return { ok: false, reason: `PDF417 holds at most 928 codewords (needs ${total})` };
  const ratio = options.rowHeightRatio ?? 3;
  if (!(ratio > 0)) return { ok: false, reason: 'PDF417 rowHeightRatio must be positive' };
  let cols = options.columns;
  let rows = options.rows;
  if (cols !== undefined && (!Number.isInteger(cols) || cols < 1 || cols > 30)) return { ok: false, reason: 'PDF417 columns must be 1 to 30' };
  if (rows !== undefined && (!Number.isInteger(rows) || rows < 3 || rows > 90)) return { ok: false, reason: 'PDF417 rows must be 3 to 90' };
  if (cols === undefined && rows === undefined) {
    // The column count whose symbol is closest to a 2:1 width to height.
    let best = Infinity;
    for (let c = 1; c <= 30; c++) {
      const r = Math.max(3, Math.ceil(total / c));
      if (r > 90) continue;
      const score = Math.abs(Math.log(((17 * c + 69) / (r * ratio)) / 2));
      if (score < best) (best = score), (cols = c);
    }
    if (cols === undefined) return { ok: false, reason: 'PDF417 data does not fit' };
  }
  if (cols === undefined) cols = Math.ceil(total / rows!);
  if (rows === undefined) rows = Math.max(3, Math.ceil(total / cols));
  if (cols > 30 || rows > 90 || rows * cols < total) return { ok: false, reason: `PDF417 data does not fit ${rows} rows x ${cols} columns` };
  const cw = [rows * cols - ec, ...data];
  while (cw.length < rows * cols - ec) cw.push(900);
  cw.push(...pdf417ErrorCodewords(cw, level));
  const table = pdf417Patterns();
  const pattern = (cluster: number, v: number): string => table[cluster * 929 + v]!.toString(2);
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const k = r % 3;
    const base = 30 * Math.floor(r / 3);
    const lri = [(rows - 1) / 3, level * 3 + ((rows - 1) % 3), cols - 1];
    const left = base + Math.floor(lri[k]!);
    const right = base + Math.floor(lri[(k + 2) % 3]!);
    let row = START + pattern(k, left);
    for (let c = 0; c < cols; c++) row += pattern(k, cw[r * cols + c]!);
    row += options.compact ? '1' : pattern(k, right) + STOP;
    out.push(row);
  }
  return { ok: true, symbol: { kind: 'rows', rows: out, rowHeights: out.map(() => ratio), quietZone: 2, text: value, columns: cols, level } };
}
