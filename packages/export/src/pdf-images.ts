// PDF image XObjects for image cells, loaded by the PDF writer on
// the first image cell. JPEG passes through as `/DCTDecode`. PNG without
// alpha (gray, RGB, or palette, 1-8 bits, not interlaced) passes its IDAT
// stream through as `/FlateDecode` with the PNG predictor; a gray / RGB
// `tRNS` color becomes a color-key `/Mask`. PNG with an alpha channel, a
// palette `tRNS`, or 16-bit samples is decoded (platform
// `DecompressionStream`), unfiltered, and re-encoded as 8-bit color plus an
// `/SMask`. Interlaced PNG, or decoding without `DecompressionStream`,
// returns null and the writer prints the cell text instead.

import type { ExportImage } from '@salmonui/core/export-model';
import type { CompressionStreamLike } from './bytes.js';
// Shared helpers come from the writer (`pdfImage`), so this chunk imports nothing at run time.
import type { PdfHelpers } from './pdf-writer.js';

let concat: PdfHelpers['concat'];
let deflate: PdfHelpers['deflate'];

/** @internal An image XObject: dictionary entries (without `/Length`), data, and an optional soft mask. */
export interface PdfImage {
  readonly dict: string;
  readonly data: Uint8Array;
  readonly smask: { readonly dict: string; readonly data: Uint8Array } | null;
  /** Pixel size. */
  readonly w: number;
  readonly h: number;
}

const hex = (bytes: Uint8Array): string => {
  let s = '<';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return `${s}>`;
};

const u16 = (d: Uint8Array, i: number): number => ((d[i] as number) << 8) | (d[i + 1] as number);
const u32 = (d: Uint8Array, i: number): number => (((d[i] as number) << 24) | ((d[i + 1] as number) << 16) | ((d[i + 2] as number) << 8) | (d[i + 3] as number)) >>> 0;

/** @internal The XObject of an image cell, or null when it cannot be embedded. */
export async function pdfImage(image: ExportImage, helpers: PdfHelpers): Promise<PdfImage | null> {
  ({ concat, deflate } = helpers);
  const type = helpers.imageType(image);
  try {
    if (type === 'jpeg') return jpeg(image.data);
    if (type === 'png') return await png(image.data);
  } catch {
    // Malformed image: fall back to the cell text.
  }
  return null;
}

function jpeg(d: Uint8Array): PdfImage | null {
  let i = 2;
  while (i + 9 < d.length) {
    if (d[i] !== 0xff) return null;
    const marker = d[i + 1] as number;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      const h = u16(d, i + 5);
      const w = u16(d, i + 7);
      const comps = d[i + 9];
      const cs = comps === 1 ? '/DeviceGray' : comps === 3 ? '/DeviceRGB' : comps === 4 ? '/DeviceCMYK /Decode [1 0 1 0 1 0 1 0]' : null;
      if (!cs || !w || !h) return null;
      return { dict: `/Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace ${cs} /BitsPerComponent 8 /Filter /DCTDecode`, data: d, smask: null, w, h };
    }
    i += 2 + u16(d, i + 2);
  }
  return null;
}

const CHANNELS: Readonly<Record<number, number>> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

async function png(d: Uint8Array): Promise<PdfImage | null> {
  let w = 0;
  let h = 0;
  let depth = 0;
  let ct = -1;
  let interlace = 0;
  let plte: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  for (let i = 8; i + 8 <= d.length; ) {
    const len = u32(d, i);
    const kind = String.fromCharCode(d[i + 4] as number, d[i + 5] as number, d[i + 6] as number, d[i + 7] as number);
    const body = d.subarray(i + 8, i + 8 + len);
    if (kind === 'IHDR') {
      w = u32(body, 0);
      h = u32(body, 4);
      depth = body[8] as number;
      ct = body[9] as number;
      interlace = body[12] as number;
    } else if (kind === 'PLTE') plte = body;
    else if (kind === 'tRNS') trns = body;
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    i += 12 + len;
  }
  const colors = CHANNELS[ct];
  if (!colors || !w || !h || interlace || !idat.length || (ct === 3 && !plte)) return null;
  const rgbSpace = ct === 3 ? `[/Indexed /DeviceRGB ${(plte as Uint8Array).length / 3 - 1} ${hex(plte as Uint8Array)}]` : ct === 0 ? '/DeviceGray' : '/DeviceRGB';
  const head = `/Type /XObject /Subtype /Image /Width ${w} /Height ${h}`;
  if (depth <= 8 && ct <= 3 && !(ct === 3 && trns)) {
    // Pass-through: the zlib stream with the PNG predictor.
    let mask = '';
    if (trns && trns.length >= colors * 2) {
      for (let c = 0; c < colors; c++) {
        const v = u16(trns, c * 2);
        mask += ` ${v} ${v}`;
      }
      mask = ` /Mask [${mask.trim()}]`;
    }
    return {
      dict: `${head} /ColorSpace ${rgbSpace} /BitsPerComponent ${depth}${mask} /Filter /FlateDecode /DecodeParms << /Predictor 15 /Colors ${colors} /BitsPerComponent ${depth} /Columns ${w} >>`,
      data: concat(idat),
      smask: null,
      w,
      h,
    };
  }
  // Decode: alpha, palette transparency, or 16-bit samples.
  const raw = await inflate(concat(idat));
  if (!raw) return null;
  const bits = colors * depth;
  const bpp = Math.max(1, bits >> 3);
  const stride = Math.ceil((w * bits) / 8);
  const px = unfilter(raw, h, bpp, stride);
  if (!px) return null;
  const gray = ct === 0 || ct === 4;
  const outColors = gray ? 1 : 3;
  const color = new Uint8Array(w * h * outColors);
  const alpha = new Uint8Array(w * h);
  const max = (1 << Math.min(depth, 8)) - 1;
  const sample = (row: number, index: number): number => {
    if (depth === 16) return px[row * stride + index * 2] as number;
    if (depth === 8) return px[row * stride + index] as number;
    const bit = index * depth;
    return ((px[row * stride + (bit >> 3)] as number) >> (8 - depth - (bit & 7))) & max;
  };
  const scale = depth < 8 && ct !== 3 ? 255 / max : 1;
  let opaque = true;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      let a = 255;
      if (ct === 3) {
        const idx = sample(y, x);
        color[p * 3] = (plte as Uint8Array)[idx * 3] ?? 0;
        color[p * 3 + 1] = (plte as Uint8Array)[idx * 3 + 1] ?? 0;
        color[p * 3 + 2] = (plte as Uint8Array)[idx * 3 + 2] ?? 0;
        a = trns?.[idx] ?? 255;
      } else {
        for (let c = 0; c < outColors; c++) color[p * outColors + c] = sample(y, x * colors + c) * scale;
        if (ct >= 4) a = sample(y, x * colors + outColors);
      }
      alpha[p] = a;
      if (a !== 255) opaque = false;
    }
  }
  const packedColor = await deflate(color, 'deflate');
  const packedAlpha = opaque ? null : await deflate(alpha, 'deflate');
  return {
    dict: `${head} /ColorSpace ${gray ? '/DeviceGray' : '/DeviceRGB'} /BitsPerComponent 8${packedColor ? ' /Filter /FlateDecode' : ''}`,
    data: packedColor ?? color,
    smask: opaque ? null : { dict: `${head} /ColorSpace /DeviceGray /BitsPerComponent 8${packedAlpha ? ' /Filter /FlateDecode' : ''}`, data: packedAlpha ?? alpha },
    w,
    h,
  };
}

async function inflate(data: Uint8Array): Promise<Uint8Array | null> {
  const Ctor = (globalThis as { DecompressionStream?: new (format: 'deflate') => CompressionStreamLike }).DecompressionStream;
  if (!Ctor) return null;
  const stream = new Ctor('deflate');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) chunks.push(value);
    }
  })();
  await Promise.all([writer.write(data).then(() => writer.close()), pump]);
  return concat(chunks);
}

function unfilter(src: Uint8Array, h: number, bpp: number, stride: number): Uint8Array | null {
  if (src.length < h * (stride + 1)) return null;
  const out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const filter = src[y * (stride + 1)];
    const s = y * (stride + 1) + 1;
    const o = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? (out[o + x - bpp] as number) : 0;
      const b = y ? (out[o - stride + x] as number) : 0;
      const c = y && x >= bpp ? (out[o - stride + x - bpp] as number) : 0;
      let v = src[s + x] as number;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      } else if (filter !== 0) return null;
      out[o + x] = v;
    }
  }
  return out;
}
