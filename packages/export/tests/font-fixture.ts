// Synthetic TrueType fonts for the tests, built here so the tests need
// no system or bundled font. Every mapped code point gets a one-contour box
// glyph; options add a composite glyph, Arabic GSUB lookups (single
// substitution forms and a lam-alef ligature, one of them behind an
// extension lookup), Arabic Presentation Forms-B mappings, a format 12 cmap,
// and a `.ttc` wrapper. Also a small subset-font reader for assertions.

export interface TestFontOptions {
  /** Code points with a glyph (advance 500 + (cp % 7) * 50 units). */
  readonly codePoints: readonly number[];
  /** `A` + combining dot as a composite glyph for U+00C4. */
  readonly composite?: boolean;
  /** GSUB init/medi/fina/isol for 0628 beh, 0644 lam, 0645 meem, 0627 alef, plus rlig lam-alef. */
  readonly gsub?: boolean;
  /** cmap format 12 instead of format 4. */
  readonly format12?: boolean;
  /** Wrap in a `ttcf` collection header. */
  readonly collection?: boolean;
  readonly name?: string;
}

/** Glyph ids of the substituted Arabic forms, for assertions. */
export interface TestFont {
  readonly bytes: Uint8Array;
  /** Original glyph id of a code point. */
  readonly gid: ReadonlyMap<number, number>;
  /** `${cp}:${form}` (isol, fina, init, medi) and `lamalef:init|medi` to glyph id. */
  readonly forms: ReadonlyMap<string, number>;
  readonly componentGid: number;
}

class Buf {
  private readonly bytes: number[] = [];
  u8(v: number): this {
    this.bytes.push(v & 255);
    return this;
  }
  u16(v: number): this {
    return this.u8(v >> 8).u8(v);
  }
  i16(v: number): this {
    return this.u16(v & 0xffff);
  }
  u32(v: number): this {
    return this.u16((v >>> 16) & 0xffff).u16(v & 0xffff);
  }
  tag(t: string): this {
    for (const ch of t) this.u8(ch.charCodeAt(0));
    return this;
  }
  raw(b: Uint8Array | readonly number[]): this {
    for (const x of b) this.bytes.push(x);
    return this;
  }
  get length(): number {
    return this.bytes.length;
  }
  pad(n = 4): this {
    while (this.bytes.length % n) this.bytes.push(0);
    return this;
  }
  done(): Uint8Array {
    return Uint8Array.from(this.bytes);
  }
}

function box(w: number, h: number): Uint8Array {
  const b = new Buf().i16(1).i16(0).i16(0).i16(w).i16(h).u16(3).u16(0);
  for (let i = 0; i < 4; i++) b.u8(1);
  for (const x of [0, w, 0, -w]) b.i16(x);
  for (const y of [0, 0, h, 0]) b.i16(y);
  return b.pad(2).done();
}

export function buildTestFont(options: TestFontOptions): TestFont {
  const glyphs: { data: Uint8Array; adv: number }[] = [{ data: box(400, 700), adv: 500 }];
  const gid = new Map<number, number>();
  const cmap = new Map<number, number>();
  const add = (data: Uint8Array, adv: number): number => glyphs.push({ data, adv }) - 1;
  for (const cp of [...options.codePoints].sort((a, b) => a - b)) {
    if (gid.has(cp)) continue;
    const adv = 500 + (cp % 7) * 50;
    const g = add(box(adv - 50, 600 + gid.size), adv);
    gid.set(cp, g);
    cmap.set(cp, g);
  }
  let componentGid = -1;
  if (options.composite) {
    componentGid = add(box(100, 100), 0);
    const a = gid.get(0x41) ?? add(box(450, 700), 500);
    const comp = new Buf().i16(-1).i16(0).i16(0).i16(500).i16(800);
    comp.u16(0x1 | 0x2 | 0x20).u16(a).i16(0).i16(0);
    comp.u16(0x1 | 0x2).u16(componentGid).i16(200).i16(750);
    const g = add(comp.pad(2).done(), 500);
    gid.set(0xc4, g);
    cmap.set(0xc4, g);
  }
  const forms = new Map<string, number>();
  const FORM_NAMES = ['isol', 'fina', 'init', 'medi'];
  if (options.gsub) {
    for (const cp of [0x627, 0x628, 0x644, 0x645]) {
      if (!gid.has(cp)) throw new Error('gsub fixture needs 0627, 0628, 0644, 0645 in codePoints');
      for (const f of FORM_NAMES.slice(1)) {
        if (cp === 0x627 && f !== 'fina') continue;
        forms.set(`${cp}:${f}`, add(box(300, 400 + forms.size), 450));
      }
    }
    forms.set('lamalef:init', add(box(500, 700), 600));
    forms.set('lamalef:medi', add(box(520, 700), 620));
  }

  const numGlyphs = glyphs.length;
  // glyf + short loca
  const glyf = new Buf();
  const loca = new Buf();
  for (const g of glyphs) {
    loca.u16(glyf.length / 2);
    glyf.raw(g.data);
  }
  loca.u16(glyf.length / 2);
  // hmtx: the last two glyphs share the final long metric (trailing lsb array).
  const numHMetrics = Math.max(1, numGlyphs - 2);
  const lastAdv = (glyphs[numHMetrics - 1] as { adv: number }).adv;
  for (let i = numHMetrics; i < numGlyphs; i++) (glyphs[i] as { adv: number }).adv = lastAdv;
  const hmtx = new Buf();
  glyphs.forEach((g, i) => {
    if (i < numHMetrics) hmtx.u16(g.adv).i16(0);
    else hmtx.i16(0);
  });
  const head = new Buf().u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0).u16(1000).u32(0).u32(0).u32(0).u32(0).i16(0).i16(-200).i16(1000).i16(900).u16(0).u16(8).i16(2).i16(0).i16(0);
  const hhea = new Buf().u32(0x00010000).i16(800).i16(-200).i16(0).u16(800).i16(0).i16(0).i16(800).i16(1).i16(0).i16(0);
  for (let i = 0; i < 5; i++) hhea.i16(0);
  hhea.u16(numHMetrics);
  const maxp = new Buf().u32(0x00010000).u16(numGlyphs);
  for (let i = 0; i < 13; i++) maxp.u16(i === 3 ? 2 : 0);
  const post = new Buf().u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);
  const psName = options.name ?? 'SalmonTest-Regular';
  const name = new Buf().u16(0).u16(1).u16(6 + 12).u16(3).u16(1).u16(0x409).u16(6).u16(psName.length * 2).u16(0);
  for (const ch of psName) name.u16(ch.charCodeAt(0));
  // cmap
  const entries = [...cmap.entries()].sort((a, b) => a[0] - b[0]);
  const sub = new Buf();
  if (options.format12) {
    sub.u16(12).u16(0).u32(16 + entries.length * 12).u32(0).u32(entries.length);
    for (const [cp, g] of entries) sub.u32(cp).u32(cp).u32(g);
  } else {
    const segs = [...entries.filter(([cp]) => cp <= 0xffff), [0xffff, 0] as [number, number]];
    const n = segs.length;
    sub.u16(4).u16(16 + n * 8).u16(0).u16(n * 2).u16(0).u16(0).u16(0);
    for (const [cp] of segs) sub.u16(cp);
    sub.u16(0);
    for (const [cp] of segs) sub.u16(cp);
    for (const [cp, g] of segs) sub.u16(cp === 0xffff && g === 0 ? 1 : (g - cp) & 0xffff);
    for (let i = 0; i < n; i++) sub.u16(0);
  }
  const cmapT = new Buf().u16(0).u16(1).u16(3).u16(options.format12 ? 10 : 1).u32(12).raw(sub.done());

  const tables: [string, Uint8Array][] = [
    ['cmap', cmapT.done()],
    ['glyf', glyf.done()],
    ['head', head.done()],
    ['hhea', hhea.done()],
    ['hmtx', hmtx.done()],
    ['loca', loca.done()],
    ['maxp', maxp.done()],
    ['name', name.done()],
    ['post', post.done()],
  ];
  if (options.gsub) tables.push(['GSUB', gsubTable(gid, forms)]);
  tables.sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const prefix = options.collection ? 12 + 4 : 0;
  const dir = new Buf().u32(0x00010000).u16(tables.length).u16(0).u16(0).u16(0);
  let offset = prefix + 12 + tables.length * 16;
  const body = new Buf();
  for (const [tag, data] of tables) {
    dir.tag(tag).u32(0).u32(offset).u32(data.length);
    body.raw(data).pad();
    offset = prefix + 12 + tables.length * 16 + body.length;
  }
  const out = new Buf();
  if (options.collection) out.tag('ttcf').u32(0x00010000).u32(1).u32(16);
  out.raw(dir.done()).raw(body.done());
  return { bytes: out.done(), gid, forms, componentGid };
}

function gsubTable(gid: ReadonlyMap<number, number>, forms: ReadonlyMap<string, number>): Uint8Array {
  const g = (cp: number): number => gid.get(cp) as number;
  // Lookup 0..2: fina, init, medi singles (format 2); lookup 1 is wrapped in an extension; lookup 3: rlig.
  const single = (form: string): Uint8Array => {
    const pairs = [0x627, 0x628, 0x644, 0x645].filter((cp) => forms.has(`${cp}:${form}`)).map((cp) => [g(cp), forms.get(`${cp}:${form}`) as number] as const);
    pairs.sort((a, b) => a[0] - b[0]);
    const covAt = 6 + pairs.length * 2;
    const b = new Buf().u16(2).u16(covAt).u16(pairs.length);
    for (const [, s] of pairs) b.u16(s);
    b.u16(1).u16(pairs.length);
    for (const [c] of pairs) b.u16(c);
    return b.done();
  };
  const lamInit = forms.get(`${0x644}:init`) as number;
  const lamMedi = forms.get(`${0x644}:medi`) as number;
  const alefFina = forms.get(`${0x627}:fina`) as number;
  const firsts = [lamInit, lamMedi].sort((a, b) => a - b);
  // LigatureSubst format 1: coverage, ligSetCount, ligSet offsets; each set has one ligature.
  const lig = new Buf();
  const head = 6 + firsts.length * 2;
  const setSize = 4 + 6;
  lig.u16(1).u16(head + firsts.length * setSize).u16(firsts.length);
  firsts.forEach((_, i) => lig.u16(head + i * setSize));
  for (const f of firsts) lig.u16(1).u16(4).u16(f === lamInit ? (forms.get('lamalef:init') as number) : (forms.get('lamalef:medi') as number)).u16(2).u16(alefFina);
  lig.u16(1).u16(firsts.length);
  for (const f of firsts) lig.u16(f);
  const subtables = [single('fina'), single('init'), single('medi'), lig.done()];
  const lookup = (type: number, sub: Uint8Array, extension: boolean): Uint8Array => {
    const b = new Buf().u16(extension ? 7 : type).u16(0).u16(1).u16(8);
    if (extension) b.u16(1).u16(type).u32(8);
    return b.raw(sub).done();
  };
  const lookups = subtables.map((s, i) => lookup(i === 3 ? 4 : 1, s, i === 1));
  const lookupList = new Buf().u16(lookups.length);
  let at = 2 + lookups.length * 2;
  for (const l of lookups) {
    lookupList.u16(at);
    at += l.length;
  }
  for (const l of lookups) lookupList.raw(l);
  const tags = ['fina', 'init', 'medi', 'rlig'];
  const featureList = new Buf().u16(tags.length);
  tags.forEach((t, i) => featureList.tag(t).u16(2 + tags.length * 6 + i * 6));
  tags.forEach((_, i) => featureList.u16(0).u16(1).u16(i));
  const scriptList = new Buf().u16(0).done();
  const fl = featureList.done();
  return new Buf().u32(0x00010000).u16(10).u16(10 + scriptList.length).u16(10 + scriptList.length + fl.length).raw(scriptList).raw(fl).raw(lookupList.done()).done();
}

/** Reads `numGlyphs`, glyph data ranges, and table tags of a (subset) font. */
export function readFont(bytes: Uint8Array): { tags: string[]; numGlyphs: number; glyph(i: number): Uint8Array; checksumOk: boolean } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = v.getUint32(0) === 0x74746366 ? v.getUint32(12) : 0;
  const n = v.getUint16(base + 4);
  const tables = new Map<string, { o: number; l: number }>();
  for (let i = 0; i < n; i++) {
    const r = base + 12 + i * 16;
    tables.set(String.fromCharCode(...bytes.subarray(r, r + 4)), { o: v.getUint32(r + 8), l: v.getUint32(r + 12) });
  }
  const t = (k: string) => tables.get(k) as { o: number; l: number };
  const long = v.getInt16(t('head').o + 50) === 1;
  const off = (i: number): number => (long ? v.getUint32(t('loca').o + i * 4) : v.getUint16(t('loca').o + i * 2) * 2);
  let sum = 0;
  for (let i = 0; i + 4 <= bytes.length; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  return {
    tags: [...tables.keys()],
    numGlyphs: v.getUint16(t('maxp').o + 4),
    glyph: (i) => bytes.subarray(t('glyf').o + off(i), t('glyf').o + off(i + 1)),
    checksumOk: sum === 0xb1b0afba,
  };
}
