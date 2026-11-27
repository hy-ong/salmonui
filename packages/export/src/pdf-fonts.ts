// Embedded TrueType fonts for the PDF writer. Loaded with dynamic
// `import()` only when `PdfOptions.font` is set, so a Helvetica-only export
// never pays for it. Hand-written, no third-party code:
//
// - Parses a TrueType (`glyf` outlines) font or the first font of a `.ttc`
//   collection: `cmap` formats 4 and 12, `hmtx`, `loca`/`glyf`, and the
//   `init`/`medi`/`fina`/`isol` (single) and `rlig` (ligature) lookups of
//   `GSUB` for Arabic joining. Without those lookups the Arabic
//   Presentation Forms-B code points are used when the font maps them.
// - Writes a Type0 font with `Identity-H` encoding over a CIDFontType2
//   (`CIDToGIDMap /Identity`), a `/W` widths array, and a `ToUnicode` CMap,
//   so text stays searchable and copyable.
// - Subsets: only the glyphs the document uses (plus composite components)
//   are embedded, renumbered densely from 0 (`.notdef`).
// - Lays out bidirectional text with a simplified Unicode Bidirectional
//   Algorithm (strong L/R, European/Arabic numbers, neutrals, mirrored
//   brackets; no explicit embeddings or isolates) per cell.
//
// CFF-flavored OpenType fonts (`OTTO`) are rejected with an error: they
// need a CFF subsetter. GPOS (mark positioning, kerning) is not applied.

// Shared helpers come from the writer (`createEmbeddedFace`), so this chunk imports nothing at run time.
import type { PdfHelpers } from './pdf-writer.js';

let concat: PdfHelpers['concat'];
let latin1: PdfHelpers['latin1'];

/** Font file bytes. */
export type PdfFontData = Uint8Array | ArrayBuffer;

/** Embedded TrueType fonts; `bold` defaults to a stroked (synthetic) bold of `regular`. */
export interface PdfFont {
  readonly regular: PdfFontData;
  readonly bold?: PdfFontData;
}

/** @internal Text fitted into a width: the PDF string operand and its width in points. */
export interface ShownText {
  readonly s: string;
  readonly w: number;
}

/** @internal */
export interface EmbeddedFace {
  fit(text: string, width: number, size: number): ShownText | null;
  /** Writes the font objects; `type0` is the id the pages reference. */
  write(type0: number, alloc: () => number, add: (id: number, body: string) => void, stream: (id: number, data: Uint8Array, dict?: string) => Promise<void>): Promise<void>;
}

const bytesOf = (d: PdfFontData): Uint8Array => (d instanceof Uint8Array ? d : ArrayBuffer.isView(d) ? new Uint8Array((d as ArrayBufferView).buffer, (d as ArrayBufferView).byteOffset, (d as ArrayBufferView).byteLength) : new Uint8Array(d));
const hex4 = (n: number): string => n.toString(16).padStart(4, '0').toUpperCase();

// --- Unicode classes ---------------------------------------------------------

const L = 0;
const R = 1;
const EN = 2;
const N = 3;
const NSM = 4;

const isMark = (c: number): boolean =>
  (c >= 0x591 && c <= 0x5bd) || c === 0x5bf || c === 0x5c1 || c === 0x5c2 || c === 0x5c4 || c === 0x5c5 || c === 0x5c7 ||
  (c >= 0x610 && c <= 0x61a) || (c >= 0x64b && c <= 0x65f) || c === 0x670 || (c >= 0x6d6 && c <= 0x6dc) || (c >= 0x6df && c <= 0x6e4) ||
  c === 0x6e7 || c === 0x6e8 || (c >= 0x6ea && c <= 0x6ed) || (c >= 0x300 && c <= 0x36f);

function bidiClass(c: number): number {
  if ((c >= 0x30 && c <= 0x39) || (c >= 0x660 && c <= 0x669) || (c >= 0x6f0 && c <= 0x6f9)) return EN;
  if (isMark(c)) return NSM;
  if ((c >= 0x590 && c <= 0x8ff) || (c >= 0xfb1d && c <= 0xfdff) || (c >= 0xfe70 && c <= 0xfefc)) return R;
  if (c < 0x30 || (c >= 0x3a && c <= 0x40) || (c >= 0x5b && c <= 0x60) || (c >= 0x7b && c <= 0xbf) || c === 0xd7 || c === 0xf7 || (c >= 0x2000 && c <= 0x206f) || (c >= 0x3000 && c <= 0x3003)) return N;
  return L;
}

const RTL_TEXT = /[֐-ࣿיִ-﷿ﹰ-ﻼ]/;
const MIRROR: Readonly<Record<number, number>> = { 40: 41, 41: 40, 60: 62, 62: 60, 91: 93, 93: 91, 123: 125, 125: 123, 0xab: 0xbb, 0xbb: 0xab, 0x2039: 0x203a, 0x203a: 0x2039 };

// Arabic joining types: 0 none, 1 right-joining, 2 dual-joining, 3 transparent.
const JOIN_0621 = `URRRRDRDRDDDDDRRRR${'D'.repeat(21)}RDD`;
const JOIN_R_0671 = new Set([0x671, 0x672, 0x673, 0x675, 0x676, 0x677, 0x6c0, 0x6c3, 0x6c4, 0x6c5, 0x6c6, 0x6c7, 0x6c8, 0x6c9, 0x6ca, 0x6cb, 0x6cd, 0x6cf, 0x6d2, 0x6d3, 0x6d5]);
function joinType(c: number): number {
  if (isMark(c)) return 3;
  if (c >= 0x621 && c <= 0x64a) return JOIN_0621[c - 0x621] === 'U' ? 0 : JOIN_0621[c - 0x621] === 'R' ? 1 : 2;
  if (c >= 0x671 && c <= 0x6d5) return JOIN_R_0671.has(c) || (c >= 0x688 && c <= 0x699) ? 1 : c === 0x674 || c === 0x6d4 ? 0 : 2;
  return 0;
}
const SEPARATORS = new Set([44, 46, 47, 58, 0xa0, 0x66b, 0x66c]);
const TERMINATORS = new Set([35, 36, 37, 43, 45, 0xb0, 0x20ac, 0x66a]);
const ALEF = new Set([0x622, 0x623, 0x625, 0x627]);

// Arabic Presentation Forms-B: first code point (isolated form) of 0621..064A.
const PRES_B = (() => {
  const out = new Map<number, number>();
  let at = 0xfe80;
  for (let c = 0x621; c <= 0x64a; c++) {
    if (c >= 0x63b && c <= 0x640) continue;
    out.set(c, at);
    at += c === 0x621 ? 1 : joinType(c) === 1 || c === 0x649 ? 2 : 4;
  }
  return out;
})();

// --- font parsing --------------------------------------------------------------

interface Table {
  readonly o: number;
  readonly l: number;
}

interface Font {
  readonly bytes: Uint8Array;
  readonly v: DataView;
  readonly tables: Map<string, Table>;
  readonly upem: number;
  readonly numGlyphs: number;
  readonly numHMetrics: number;
  readonly longLoca: boolean;
  /** Code point to glyph id (0 when unmapped). */
  gid(cp: number): number;
  /** [isol, fina, init, medi] single substitutions. */
  readonly forms: readonly Map<number, number>[];
  readonly ligatures: Map<number, { readonly c: readonly number[]; readonly g: number }[]>;
}

function parseFont(bytes: Uint8Array): Font {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag4 = (at: number): string => String.fromCharCode(bytes[at] as number, bytes[at + 1] as number, bytes[at + 2] as number, bytes[at + 3] as number);
  let base = 0;
  if (tag4(0) === 'ttcf') base = v.getUint32(12);
  const flavor = tag4(base);
  if (flavor === 'OTTO') throw new Error('PDF font: CFF-based OpenType fonts are not supported; pass a TrueType (glyf) font.');
  const tables = new Map<string, Table>();
  const count = v.getUint16(base + 4);
  for (let i = 0; i < count; i++) {
    const r = base + 12 + i * 16;
    tables.set(tag4(r), { o: v.getUint32(r + 8), l: v.getUint32(r + 12) });
  }
  for (const t of ['head', 'hhea', 'maxp', 'hmtx', 'loca', 'glyf', 'cmap']) if (!tables.has(t)) throw new Error(`PDF font: missing the "${t}" table (a TrueType font with glyf outlines is required).`);
  const T = (t: string): Table => tables.get(t) as Table;
  const head = T('head').o;

  // cmap: prefer a full-repertoire format 12 subtable, else a BMP format 4 one.
  const cmap = T('cmap').o;
  let f12 = -1;
  let f4 = -1;
  for (let i = 0, n = v.getUint16(cmap + 2); i < n; i++) {
    const r = cmap + 4 + i * 8;
    const platform = v.getUint16(r);
    const encoding = v.getUint16(r + 2);
    const sub = cmap + v.getUint32(r + 4);
    const format = v.getUint16(sub);
    if (platform !== 0 && !(platform === 3 && (encoding === 1 || encoding === 10))) continue;
    if (format === 12 && f12 < 0) f12 = sub;
    else if (format === 4 && f4 < 0) f4 = sub;
  }
  const lookup = (cp: number): number => {
    if (f12 >= 0) {
      let lo = 0;
      let hi = v.getUint32(f12 + 12) - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const g = f12 + 16 + mid * 12;
        if (cp < v.getUint32(g)) hi = mid - 1;
        else if (cp > v.getUint32(g + 4)) lo = mid + 1;
        else return v.getUint32(g + 8) + cp - v.getUint32(g);
      }
      return 0;
    }
    if (f4 < 0 || cp > 0xffff) return 0;
    const seg2 = v.getUint16(f4 + 6);
    const ends = f4 + 14;
    let lo = 0;
    let hi = seg2 / 2 - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (v.getUint16(ends + mid * 2) < cp) lo = mid + 1;
      else hi = mid;
    }
    const s = lo * 2;
    const start = v.getUint16(ends + seg2 + 2 + s);
    if (cp < start || cp > v.getUint16(ends + s)) return 0;
    const delta = v.getUint16(ends + 2 * seg2 + 2 + s);
    const rangeAt = ends + 3 * seg2 + 2 + s;
    const range = v.getUint16(rangeAt);
    if (range === 0) return (cp + delta) & 0xffff;
    const g = v.getUint16(rangeAt + range + (cp - start) * 2);
    return g === 0 ? 0 : (g + delta) & 0xffff;
  };
  const cache = new Map<number, number>();
  const numGlyphs = v.getUint16(T('maxp').o + 4);
  const gid = (cp: number): number => {
    let g = cache.get(cp);
    if (g === undefined) {
      g = lookup(cp);
      if (g >= numGlyphs) g = 0;
      cache.set(cp, g);
    }
    return g;
  };

  // GSUB: Arabic forms (single substitution) and required ligatures.
  const forms = [new Map<number, number>(), new Map<number, number>(), new Map<number, number>(), new Map<number, number>()];
  const ligatures = new Map<number, { c: number[]; g: number }[]>();
  const gsub = tables.get('GSUB');
  if (gsub) {
    const g0 = gsub.o;
    const coverage = (at: number): number[] => {
      const out: number[] = [];
      const format = v.getUint16(at);
      const n = v.getUint16(at + 2);
      for (let i = 0; i < n; i++) {
        if (format === 1) out.push(v.getUint16(at + 4 + i * 2));
        else {
          const r = at + 4 + i * 6;
          for (let g = v.getUint16(r); g <= v.getUint16(r + 2); g++) out.push(g);
        }
      }
      return out;
    };
    const featureList = g0 + v.getUint16(g0 + 6);
    const lookupList = g0 + v.getUint16(g0 + 8);
    const wanted: Record<string, number> = { isol: 0, fina: 1, init: 2, medi: 3, rlig: 4 };
    for (let i = 0, n = v.getUint16(featureList); i < n; i++) {
      const r = featureList + 2 + i * 6;
      const slot = wanted[tag4(r)];
      if (slot === undefined) continue;
      const feature = featureList + v.getUint16(r + 4);
      for (let k = 0, m = v.getUint16(feature + 2); k < m; k++) {
        const lookupAt = lookupList + v.getUint16(lookupList + 2 + v.getUint16(feature + 4 + k * 2) * 2);
        let type = v.getUint16(lookupAt);
        for (let s = 0, sn = v.getUint16(lookupAt + 4); s < sn; s++) {
          let sub = lookupAt + v.getUint16(lookupAt + 6 + s * 2);
          if (type === 7) {
            type = v.getUint16(sub + 2);
            sub += v.getUint32(sub + 4);
          }
          const format = v.getUint16(sub);
          const cov = coverage(sub + v.getUint16(sub + 2));
          if (type === 1 && slot < 4) {
            const map = forms[slot] as Map<number, number>;
            cov.forEach((g, ci) => {
              if (!map.has(g)) map.set(g, format === 1 ? (g + v.getInt16(sub + 4)) & 0xffff : v.getUint16(sub + 6 + ci * 2));
            });
          } else if (type === 4 && slot === 4) {
            cov.forEach((g, ci) => {
              const set = sub + v.getUint16(sub + 6 + ci * 2);
              for (let j = 0, ln = v.getUint16(set); j < ln; j++) {
                const lig = set + v.getUint16(set + 2 + j * 2);
                const c: number[] = [];
                for (let q = 1, qn = v.getUint16(lig + 2); q < qn; q++) c.push(v.getUint16(lig + 2 + q * 2));
                const list = ligatures.get(g) ?? [];
                list.push({ c, g: v.getUint16(lig) });
                ligatures.set(g, list);
              }
            });
          }
          type = v.getUint16(lookupAt);
        }
      }
    }
  }
  return {
    bytes,
    v,
    tables,
    upem: v.getUint16(head + 18),
    numGlyphs,
    numHMetrics: v.getUint16(T('hhea').o + 34),
    longLoca: v.getInt16(head + 50) === 1,
    gid,
    forms,
    ligatures,
  };
}

function advance(f: Font, g: number): number {
  const h = (f.tables.get('hmtx') as Table).o;
  return f.v.getUint16(h + Math.min(g, f.numHMetrics - 1) * 4);
}

function glyphRange(f: Font, g: number): [number, number] {
  const loca = (f.tables.get('loca') as Table).o;
  const glyf = (f.tables.get('glyf') as Table).o;
  const a = f.longLoca ? f.v.getUint32(loca + g * 4) : f.v.getUint16(loca + g * 2) * 2;
  const b = f.longLoca ? f.v.getUint32(loca + g * 4 + 4) : f.v.getUint16(loca + g * 2 + 2) * 2;
  return [glyf + a, Math.max(0, b - a)];
}

/** Component glyph offsets (glyph index positions) of a composite glyph. */
function components(f: Font, g: number): number[] {
  const [at, len] = glyphRange(f, g);
  if (len < 10 || f.v.getInt16(at) >= 0) return [];
  const out: number[] = [];
  let p = at + 10;
  for (;;) {
    const flags = f.v.getUint16(p);
    out.push(p + 2 - at);
    p += 4 + (flags & 1 ? 4 : 2) + (flags & 8 ? 2 : flags & 0x40 ? 4 : flags & 0x80 ? 8 : 0);
    if (!(flags & 0x20)) return out;
  }
}

// --- subsetting ------------------------------------------------------------------

function checksum(data: Uint8Array): number {
  let sum = 0;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const n = data.length & ~3;
  for (let i = 0; i < n; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  let tail = 0;
  for (let i = n; i < data.length; i++) tail |= (data[i] as number) << (24 - 8 * (i - n));
  return (sum + tail) >>> 0;
}

/** A TrueType font holding `order` (old glyph ids; index = new id). */
function subsetFont(f: Font, order: readonly number[], newId: (old: number) => number): Uint8Array {
  const src = (t: string): Uint8Array | null => {
    const r = f.tables.get(t);
    return r ? f.bytes.slice(r.o, r.o + r.l) : null;
  };
  const n = order.length;
  const glyphs: Uint8Array[] = [];
  const loca = new Uint8Array((n + 1) * 4);
  const lv = new DataView(loca.buffer);
  const hmtx = new Uint8Array(n * 4);
  const hv = new DataView(hmtx.buffer);
  const hm = (f.tables.get('hmtx') as Table).o;
  let at = 0;
  order.forEach((old, i) => {
    const [o, len] = glyphRange(f, old);
    const data = new Uint8Array((len + 3) & ~3);
    data.set(f.bytes.subarray(o, o + len));
    const dv = new DataView(data.buffer);
    for (const c of components(f, old)) dv.setUint16(c, newId(dv.getUint16(c)));
    glyphs.push(data);
    lv.setUint32(i * 4, at);
    at += data.length;
    hv.setUint16(i * 4, advance(f, old));
    hv.setInt16(i * 4 + 2, f.v.getInt16(old < f.numHMetrics ? hm + old * 4 + 2 : hm + f.numHMetrics * 4 + (old - f.numHMetrics) * 2));
  });
  lv.setUint32(n * 4, at);
  const head = src('head') as Uint8Array;
  const headV = new DataView(head.buffer);
  headV.setUint32(8, 0);
  headV.setInt16(50, 1);
  const hhea = src('hhea') as Uint8Array;
  new DataView(hhea.buffer).setUint16(34, n);
  const maxp = src('maxp') as Uint8Array;
  new DataView(maxp.buffer).setUint16(4, n);
  const post = new Uint8Array(32);
  const postSrc = src('post');
  if (postSrc) post.set(postSrc.subarray(0, 32));
  new DataView(post.buffer).setUint32(0, 0x00030000);
  const out: [string, Uint8Array][] = [
    ['glyf', concat(glyphs, at)],
    ['head', head],
    ['hhea', hhea],
    ['hmtx', hmtx],
    ['loca', loca],
    ['maxp', maxp],
    ['post', post],
  ];
  for (const t of ['cvt ', 'fpgm', 'prep']) {
    const d = src(t);
    if (d) out.push([t, d]);
  }
  out.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const count = out.length;
  const dir = new Uint8Array(12 + count * 16);
  const dv = new DataView(dir.buffer);
  let pow = 1;
  let log = 0;
  while (pow * 2 <= count) {
    pow *= 2;
    log++;
  }
  dv.setUint32(0, 0x00010000);
  dv.setUint16(4, count);
  dv.setUint16(6, pow * 16);
  dv.setUint16(8, log);
  dv.setUint16(10, count * 16 - pow * 16);
  const parts: Uint8Array[] = [dir];
  let offset = dir.length;
  out.forEach(([tag, data], i) => {
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) dir[r + k] = tag.charCodeAt(k);
    dv.setUint32(r + 4, checksum(data));
    dv.setUint32(r + 8, offset);
    dv.setUint32(r + 12, data.length);
    const padded = new Uint8Array((data.length + 3) & ~3);
    padded.set(data);
    parts.push(padded);
    offset += padded.length;
  });
  const font = concat(parts, offset);
  const headAt = new DataView(dir.buffer).getUint32(12 + out.findIndex((t) => t[0] === 'head') * 16 + 8);
  new DataView(font.buffer).setUint32(headAt + 8, (0xb1b0afba - checksum(font)) >>> 0);
  return font;
}

// --- layout ------------------------------------------------------------------------

interface Cluster {
  /** Glyphs as subset ids, in drawing order. */
  readonly ids: readonly number[];
  /** Advance in font units. */
  readonly w: number;
  readonly cls: number;
}

/** @internal Creates the embedded face of one font file. */
export function createEmbeddedFace(data: PdfFontData, rtl: boolean, helpers: PdfHelpers): EmbeddedFace {
  ({ concat, latin1 } = helpers);
  const font = parseFont(bytesOf(data));
  const scale = 1000 / font.upem;
  const order: number[] = [0];
  const unicode: string[] = [''];
  const ids = new Map<number, number>([[0, 0]]);
  const use = (old: number, text: string): number => {
    let id = ids.get(old);
    if (id !== undefined && text && !unicode[id]) unicode[id] = text;
    if (id === undefined) {
      id = order.length;
      ids.set(old, id);
      order.push(old);
      unicode.push(text);
      const [at] = glyphRange(font, old);
      for (const c of components(font, old)) use(font.v.getUint16(at + c), '');
    }
    return id;
  };
  const glyphFor = (cp: number): number => font.gid(cp);
  const gsubForms = font.forms.some((m) => m.size > 0);

  /** Clusters of a text in logical order (marks attach to their base). */
  const shape = (text: string): Cluster[] => {
    const cps = Array.from(text, (ch) => {
      const c = ch.codePointAt(0) as number;
      return c === 9 || c === 10 || c === 13 ? 32 : c;
    });
    const out: { ids: number[]; w: number; cls: number }[] = [];
    const push = (old: number, chars: string, cls: number): void => {
      const id = use(old, chars);
      const w = advance(font, old);
      const last = out[out.length - 1];
      if (cls === NSM && last) {
        last.ids.push(id);
        last.w += w;
      } else out.push({ ids: [id], w, cls: cls === NSM ? N : cls });
    };
    const arabic = RTL_TEXT.test(text);
    const types = arabic ? cps.map(joinType) : null;
    for (let i = 0; i < cps.length; i++) {
      const c = cps[i] as number;
      const cls = bidiClass(c);
      const jt = types ? (types[i] as number) : 0;
      if (!types || jt === 0 || jt === 3) {
        push(glyphFor(c), String.fromCodePoint(c), cls);
        continue;
      }
      let p = i - 1;
      while (p >= 0 && types[p] === 3) p--;
      let n = i + 1;
      while (n < cps.length && types[n] === 3) n++;
      const joinPrev = p >= 0 && types[p] === 2;
      const next = n < cps.length ? (types[n] as number) : 0;
      // Lam-alef required ligature.
      if (c === 0x644 && n < cps.length && ALEF.has(cps[n] as number)) {
        const lam = font.forms[joinPrev ? 3 : 2]?.get(glyphFor(c)) ?? glyphFor(c);
        const alef = font.forms[1]?.get(glyphFor(cps[n] as number)) ?? glyphFor(cps[n] as number);
        const lig = font.ligatures.get(lam)?.find((x) => x.c.length === 1 && x.c[0] === alef)?.g;
        const k = [0x622, 0x623, 0x625, 0x627].indexOf(cps[n] as number);
        const pres = lig === undefined ? glyphFor(0xfef5 + k * 2 + (joinPrev ? 1 : 0)) : 0;
        if (lig !== undefined || pres) {
          const marks = cps.slice(i + 1, n);
          push(lig ?? pres, String.fromCodePoint(c, ...marks, cps[n] as number), R);
          i = n;
          continue;
        }
      }
      const joinNext = jt === 2 && (next === 1 || next === 2);
      const form = joinPrev ? (joinNext ? 3 : 1) : joinNext ? 2 : 0;
      const base = glyphFor(c);
      let g: number | undefined;
      if (gsubForms) g = (font.forms[form] as Map<number, number>).get(base);
      else {
        const pb = PRES_B.get(c);
        if (pb !== undefined) g = glyphFor(pb + (c === 0x621 ? 0 : form)) || undefined;
      }
      push(g ?? base, String.fromCodePoint(c), cls);
    }
    return out;
  };

  /** Visual order of logical clusters (simplified UBA), with mirrored brackets. */
  const reorder = (clusters: readonly Cluster[], mirrored: readonly (number | null)[]): number[] => {
    let para = rtl ? 1 : 0;
    for (const c of clusters) if (c.cls === L || c.cls === R) {
      para = c.cls;
      break;
    }
    const n = clusters.length;
    const levels = new Uint8Array(n);
    let lastStrong = para;
    const resolved = clusters.map((c) => {
      if (c.cls === L || c.cls === R) lastStrong = c.cls;
      return c.cls === EN ? (lastStrong === R ? EN : L) : c.cls;
    });
    // Number separators between numbers and terminators next to them join the number (W4, W5).
    for (let i = 0; i < n; i++) {
      if (resolved[i] !== N) continue;
      const ch = (unicode[(clusters[i] as Cluster).ids[0] as number] as string).charCodeAt(0);
      const before = resolved[i - 1];
      const after = resolved[i + 1];
      if ((SEPARATORS.has(ch) && before === EN && after === EN) || (TERMINATORS.has(ch) && (before === EN || after === EN))) resolved[i] = EN;
    }
    for (let i = 0; i < n; i++) {
      let cls = resolved[i] as number;
      if (cls === N) {
        // Neutrals between same-direction strongs (numbers count as R) take it; else the paragraph direction.
        let a = i - 1;
        while (a >= 0 && resolved[a] === N) a--;
        let b = i + 1;
        while (b < n && resolved[b] === N) b++;
        const dir = (k: number): number => (k < 0 || k >= n ? para : resolved[k] === L ? L : R);
        cls = dir(a) === dir(b) ? dir(a) : para;
      }
      levels[i] = para === 0 ? (cls === R ? 1 : cls === EN ? 2 : 0) : cls === R ? 1 : 2;
    }
    const idx = Array.from({ length: n }, (_, i) => i);
    let max = 0;
    for (const l of levels) max = Math.max(max, l);
    for (let level = max; level >= 1; level--) {
      for (let i = 0; i < n; ) {
        if ((levels[idx[i] as number] as number) < level) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && (levels[idx[j] as number] as number) >= level) j++;
        const run = idx.slice(i, j).reverse();
        for (let k = 0; k < run.length; k++) idx[i + k] = run[k] as number;
        i = j;
      }
    }
    return idx.map((i) => (levels[i] as number) % 2 === 1 && mirrored[i] != null ? -1 - (mirrored[i] as number) : i);
  };

  const cache = new Map<string, Cluster[]>();
  let ellipsis: Cluster[] | null = null;
  const fit = (text: string, width: number, size: number): ShownText | null => {
    let clusters = cache.get(text);
    if (!clusters) {
      if (cache.size >= 20_000) cache.clear();
      clusters = shape(text);
      cache.set(text, clusters);
    }
    const k = (size * scale) / 1000;
    let total = 0;
    for (const c of clusters) total += c.w;
    let shown: readonly Cluster[] = clusters;
    if (total * k > width) {
      ellipsis ??= shape(glyphFor(0x2026) ? '…' : '...');
      const dots = ellipsis.reduce((s, c) => s + c.w, 0);
      const room = width / k - dots;
      if (room <= 0) return null;
      let w = 0;
      let i = 0;
      while (i < clusters.length && w + (clusters[i] as Cluster).w <= room) w += (clusters[i++] as Cluster).w;
      shown = [...clusters.slice(0, i), ...ellipsis];
      total = w + dots;
    }
    if (!shown.length) return null;
    let hex = '<';
    if (shown.some((c) => c.cls === R || (rtl && c.cls === EN))) {
      const mirrors = shown.map((c) => {
        const u = unicode[c.ids[0] as number] as string;
        const m = u.length === 1 ? MIRROR[u.charCodeAt(0)] : undefined;
        return m === undefined ? null : use(glyphFor(m), String.fromCharCode(m));
      });
      for (const i of reorder(shown, mirrors)) {
        if (i < 0) hex += hex4(-1 - i);
        else for (const id of (shown[i] as Cluster).ids) hex += hex4(id);
      }
    } else for (const c of shown) for (const id of c.ids) hex += hex4(id);
    return { s: `${hex}>`, w: total * k };
  };

  return {
    fit,
    async write(type0, alloc, add, stream) {
      const cid = alloc();
      const descriptor = alloc();
      const file = alloc();
      const toUnicode = alloc();
      let hash = 2166136261;
      for (const g of order) hash = Math.imul(hash ^ g, 16777619) >>> 0;
      let tag = '';
      for (let i = 0; i < 6; i++) {
        tag += String.fromCharCode(65 + (hash % 26));
        hash = Math.floor(hash / 26) + i * 7919;
      }
      const name = `${tag}+${fontName(font)}`;
      const v = font.v;
      const head = (font.tables.get('head') as Table).o;
      const hhea = (font.tables.get('hhea') as Table).o;
      const os2 = font.tables.get('OS/2');
      const post = font.tables.get('post');
      const s = (n: number): number => Math.round(n * scale);
      const ascent = s(v.getInt16(hhea + 4));
      const descent = s(v.getInt16(hhea + 6));
      const capHeight = os2 && os2.l >= 90 && v.getUint16(os2.o) >= 2 ? s(v.getInt16(os2.o + 88)) : Math.round(ascent * 0.7);
      const italic = post ? v.getInt32(post.o + 4) / 65536 : 0;
      const fixed = post ? v.getUint32(post.o + 12) !== 0 : false;
      const bbox = [36, 38, 40, 42].map((o) => s(v.getInt16(head + o))).join(' ');
      add(type0, `<< /Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${toUnicode} 0 R >>`);
      const widths: string[] = [];
      for (let i = 0; i < order.length; i += 64) widths.push(order.slice(i, i + 64).map((g) => Math.round(advance(font, g) * scale)).join(' '));
      add(cid, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /DW 1000 /W [0 [${widths.join('\n')}]] /CIDToGIDMap /Identity >>`);
      add(descriptor, `<< /Type /FontDescriptor /FontName /${name} /Flags ${4 | (fixed ? 1 : 0) | (italic ? 64 : 0)} /FontBBox [${bbox}] /ItalicAngle ${Math.round(italic * 100) / 100} /Ascent ${ascent} /Descent ${descent} /CapHeight ${capHeight} /StemV 80 /FontFile2 ${file} 0 R >>`);
      const program = subsetFont(font, order, (old) => ids.get(old) ?? 0);
      await stream(file, program, `/Length1 ${program.length}`);
      // Glyphs only used as composite components are never shown and get no entry.
      const entries: string[] = [];
      unicode.forEach((u, id) => {
        if (u) entries.push(`<${hex4(id)}> <${Array.from({ length: u.length }, (_, q) => hex4(u.charCodeAt(q))).join('')}>`);
      });
      const lines: string[] = [];
      for (let i = 0; i < entries.length; i += 100) {
        const chunk = entries.slice(i, i + 100);
        lines.push(`${chunk.length} beginbfchar\n${chunk.join('\n')}\nendbfchar`);
      }
      const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${lines.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`;
      await stream(toUnicode, latin1(cmap));
    },
  };
}

/** PostScript name (name id 6) as a PDF name token. */
function fontName(f: Font): string {
  const t = f.tables.get('name');
  let out = '';
  if (t) {
    const v = f.v;
    const strings = t.o + v.getUint16(t.o + 4);
    for (let i = 0, n = v.getUint16(t.o + 2); i < n && !out; i++) {
      const r = t.o + 6 + i * 12;
      if (v.getUint16(r + 6) !== 6) continue;
      const platform = v.getUint16(r);
      const len = v.getUint16(r + 8);
      const at = strings + v.getUint16(r + 10);
      for (let k = 0; k < len; k += platform === 1 ? 1 : 2) out += String.fromCharCode(platform === 1 ? (f.bytes[at + k] as number) : v.getUint16(at + k));
    }
  }
  out = out.replace(/[^\x21-\x7e]|[()<>[\]{}/%#]/g, '');
  return out || 'EmbeddedFont';
}
