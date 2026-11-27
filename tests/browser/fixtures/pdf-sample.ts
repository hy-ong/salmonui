// A tiny hand-written PDF for the PdfViewer specs:
// three pages (Letter, Letter, A5) of Helvetica text, an outline, an internal
// and an external link, and an AcroForm with a text field and a check box.
// With `password` the document is encrypted with the PDF Standard security
// handler (revision 2, 40-bit RC4), which pdf.js opens after a password prompt.
// No dependencies; `write-pdf-fixtures.ts` writes the committed files.

export interface SamplePdfOptions {
  /** User password: encrypts the document. */
  readonly password?: string;
  /** Extra pages of filler text (virtualization). */
  readonly extraPages?: number;
}

const enc = new TextEncoder();

// --- MD5 and RC4 (Standard security handler) -------------------------------------------------
function md5(data: Uint8Array): Uint8Array {
  const s = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  const k = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);
  const len = data.length;
  const padded = new Uint8Array(((len + 72) >>> 6) << 6);
  padded.set(data);
  padded[len] = 0x80;
  const bits = len * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, bits >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(bits / 2 ** 32), true);
  let [a0, b0, c0, d0] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476];
  for (let off = 0; off < padded.length; off += 64) {
    const m = Array.from({ length: 16 }, (_, i) => view.getUint32(off + i * 4, true));
    let [a, b, c, d] = [a0, b0, c0, d0];
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) [f, g] = [(b & c) | (~b & d), i];
      else if (i < 32) [f, g] = [(d & b) | (~d & c), (5 * i + 1) % 16];
      else if (i < 48) [f, g] = [b ^ c ^ d, (3 * i + 5) % 16];
      else [f, g] = [c ^ (b | ~d), (7 * i) % 16];
      const tmp = d;
      d = c;
      c = b;
      const x = (a + f + (k[i] as number) + (m[g] as number)) >>> 0;
      b = (b + ((x << (s[i] as number)) | (x >>> (32 - (s[i] as number))))) >>> 0;
      a = tmp;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }
  const out = new Uint8Array(16);
  const ov = new DataView(out.buffer);
  [a0, b0, c0, d0].forEach((v, i) => ov.setUint32(i * 4, v, true));
  return out;
}

function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 0, j = 0; i < 256; i++) {
    j = (j + (S[i] as number) + (key[i % key.length] as number)) & 255;
    [S[i], S[j]] = [S[j] as number, S[i] as number];
  }
  const out = new Uint8Array(data.length);
  for (let n = 0, i = 0, j = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + (S[i] as number)) & 255;
    [S[i], S[j]] = [S[j] as number, S[i] as number];
    out[n] = (data[n] as number) ^ (S[((S[i] as number) + (S[j] as number)) & 255] as number);
  }
  return out;
}

const PAD = Uint8Array.from([0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a]);
const padPassword = (pw: string) => {
  const out = new Uint8Array(32);
  const b = enc.encode(pw).subarray(0, 32);
  out.set(b);
  out.set(PAD.subarray(0, 32 - b.length), b.length);
  return out;
};
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

// --- Writer -------------------------------------------------------------------------------------
type Str = (s: string) => string;
interface Obj {
  readonly body: (str: Str) => string;
  readonly stream?: string;
}

const esc = (s: string) => s.replace(/[\\()]/g, (c) => `\\${c}`);

function text(lines: ReadonlyArray<readonly [number, number, number, string]>): string {
  return lines.map(([x, y, size, t]) => `BT /F1 ${size} Tf ${x} ${y} Td (${esc(t)}) Tj ET`).join('\n');
}

export function buildSamplePdf(options: SamplePdfOptions = {}): Uint8Array {
  const extra = options.extraPages ?? 0;
  const objs: Obj[] = [];
  const add = (o: Obj) => (objs.push(o), objs.length);
  const ref = (n: number) => `${n} 0 R`;

  // Reserve: 1 catalog, 2 pages, 3 font, 4 outlines.
  for (let i = 0; i < 4; i++) add({ body: () => '' });
  const pageCount = 3 + extra;
  const firstPage = 5;
  // Page objects and contents are added in order: page i -> objects firstPage + 2i (page), +1 (content).
  const pageNum = (i: number) => firstPage + 2 * i;
  const sizes = Array.from({ length: pageCount }, (_, i) => (i === 2 ? [420, 595] : [612, 792]) as [number, number]);
  const contents: string[] = [
    text([
      [72, 700, 24, 'Salmon PDF Viewer'],
      [72, 660, 14, 'The quick brown fox jumps over the lazy dog.'],
      [72, 636, 14, 'Salmon swim upstream. A salmon is a fish.'],
      [72, 612, 14, 'Go to the form'],
      [72, 588, 14, 'Visit example.com for more.'],
    ]),
    text([
      [72, 700, 20, 'Second page'],
      [72, 660, 14, 'This page has more salmon text to find.'],
      [72, 636, 14, 'Whole words: salmonberry is not a salmon.'],
    ]),
    text([
      [40, 520, 18, 'Third page: contact form'],
      [40, 480, 12, 'Full name:'],
      [40, 440, 12, 'Subscribe:'],
    ]),
    ...Array.from({ length: extra }, (_, i) => text([[72, 700, 18, `Filler page ${i + 4}`], [72, 660, 12, 'Lorem ipsum dolor sit amet.']])),
  ];
  const annots: string[][] = sizes.map(() => []);
  const fieldRefs: number[] = [];
  // Reserve page and content objects.
  for (let i = 0; i < pageCount; i++) {
    add({ body: () => '' });
    add({ body: () => '', stream: contents[i] as string });
  }
  // Links on page 1: internal (to page 3) and external.
  annots[0]!.push(ref(add({ body: () => `<< /Type /Annot /Subtype /Link /Rect [70 606 175 626] /Border [0 0 0] /Dest [${ref(pageNum(2))} /XYZ 0 595 null] >>` })));
  annots[0]!.push(ref(add({ body: (s) => `<< /Type /Annot /Subtype /Link /Rect [110 582 196 602] /Border [0 0 0] /A << /S /URI /URI ${s('https://example.com/')} >> >>` })));
  // Form fields on page 3.
  const p3 = pageNum(2);
  const name = add({ body: (s) => `<< /Type /Annot /Subtype /Widget /FT /Tx /T ${s('fullName')} /V ${s('')} /DA ${s('/Helv 12 Tf 0 g')} /F 4 /Rect [120 472 380 492] /P ${ref(p3)} /MK << /BG [1 1 1] >> >>` });
  const yes = add({ body: () => '<< /Type /XObject /Subtype /Form /BBox [0 0 16 16] /Resources << >> >>', stream: '0 g 3 3 10 10 re f' });
  const off = add({ body: () => '<< /Type /XObject /Subtype /Form /BBox [0 0 16 16] /Resources << >> >>', stream: '' });
  const box = add({ body: (s) => `<< /Type /Annot /Subtype /Widget /FT /Btn /T ${s('subscribe')} /V /Off /AS /Off /F 4 /Rect [120 434 136 450] /P ${ref(p3)} /MK << /BG [1 1 1] /BC [0 0 0] >> /AP << /N << /Yes ${ref(yes)} /Off ${ref(off)} >> >> >>` });
  fieldRefs.push(name, box);
  annots[2]!.push(ref(name), ref(box));
  // Outline: Introduction (p1), Details (p2) > Form (p3).
  const intro = objs.length + 1;
  const details = intro + 1;
  const form = intro + 2;
  add({ body: (s) => `<< /Title ${s('Introduction')} /Parent ${ref(4)} /Dest [${ref(pageNum(0))} /XYZ 0 792 null] /Next ${ref(details)} >>` });
  add({ body: (s) => `<< /Title ${s('Details')} /Parent ${ref(4)} /Prev ${ref(intro)} /Dest [${ref(pageNum(1))} /XYZ 0 792 null] /First ${ref(form)} /Last ${ref(form)} /Count 1 >>` });
  add({ body: (s) => `<< /Title ${s('Form')} /Parent ${ref(details)} /Dest [${ref(pageNum(2))} /XYZ 0 595 null] >>` });
  objs[0] = { body: () => `<< /Type /Catalog /Pages ${ref(2)} /Outlines ${ref(4)} /PageMode /UseOutlines /AcroForm << /Fields [${fieldRefs.map(ref).join(' ')}] /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${ref(3)} >> >> /NeedAppearances true >> >>` };
  objs[1] = { body: () => `<< /Type /Pages /Count ${pageCount} /Kids [${sizes.map((_, i) => ref(pageNum(i))).join(' ')}] >>` };
  objs[2] = { body: () => '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>' };
  objs[3] = { body: () => `<< /Type /Outlines /First ${ref(intro)} /Last ${ref(details)} /Count 3 >>` };
  for (let i = 0; i < pageCount; i++) {
    const [w, h] = sizes[i] as [number, number];
    const a = annots[i] as string[];
    objs[pageNum(i) - 1] = { body: () => `<< /Type /Page /Parent ${ref(2)} /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${ref(3)} >> >> /Contents ${ref(pageNum(i) + 1)}${a.length ? ` /Annots [${a.join(' ')}]` : ''} >>` };
  }

  // Encryption (Standard handler R2) when a password is given.
  const id = md5(enc.encode(`salmon-ui-pdf-fixture-${pageCount}`));
  let key: Uint8Array | null = null;
  let encryptRef = 0;
  if (options.password !== undefined) {
    const P = -44; // print, copy, fill forms
    const user = padPassword(options.password);
    const O = rc4(md5(padPassword(options.password)).subarray(0, 5), user);
    const p = new Uint8Array(4);
    new DataView(p.buffer).setInt32(0, P, true);
    key = md5(concat(user, O, p, id)).subarray(0, 5);
    const U = rc4(key, PAD);
    encryptRef = add({ body: () => `<< /Filter /Standard /V 1 /R 2 /O <${hex(O)}> /U <${hex(U)}> /P ${P} >>` });
  }
  const objectKey = (num: number) => (key ? md5(concat(key, Uint8Array.from([num & 255, (num >> 8) & 255, (num >> 16) & 255, 0, 0]))).subarray(0, 10) : null);

  const chunks: Uint8Array[] = [];
  let offset = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    offset += b.length;
  };
  push(Uint8Array.from([...enc.encode('%PDF-1.7\n%'), 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    const num = i + 1;
    offsets.push(offset);
    const k = num === encryptRef ? null : objectKey(num);
    const str: Str = (s) => (k ? `<${hex(rc4(k, enc.encode(s)))}>` : `(${esc(s)})`);
    let body = o.body(str);
    let streamBytes: Uint8Array | null = null;
    if (o.stream !== undefined) {
      streamBytes = enc.encode(o.stream);
      if (k) streamBytes = rc4(k, streamBytes);
      body = body ? body.replace(/>>\s*$/, ` /Length ${streamBytes.length} >>`) : `<< /Length ${streamBytes.length} >>`;
    }
    push(enc.encode(`${num} 0 obj\n${body}\n`));
    if (streamBytes) {
      push(enc.encode('stream\n'));
      push(streamBytes);
      push(enc.encode('\nendstream\n'));
    }
    push(enc.encode('endobj\n'));
  });
  const xref = offset;
  const rows = offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  const trailer = `<< /Size ${objs.length + 1} /Root ${ref(1)} /ID [<${hex(id)}> <${hex(id)}>]${encryptRef ? ` /Encrypt ${ref(encryptRef)}` : ''} >>`;
  push(enc.encode(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${rows}trailer\n${trailer}\nstartxref\n${xref}\n%%EOF\n`));
  return concat(...chunks);
}
