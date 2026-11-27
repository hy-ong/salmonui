// Byte-level helpers shared by the XLSX and PDF writers: UTF-8 encoding,
// CRC-32, platform deflate through `CompressionStream` (browsers and Node
// 22+; no third-party code), and time slicing. The package compiles without
// the DOM lib, so platform globals are read structurally from `globalThis`.

/** @internal */
export interface ByteChunks {
  readonly chunks: Uint8Array[];
  readonly length: number;
}

interface TextEncoderLike {
  encode(input: string): Uint8Array;
}

interface StreamWriterLike {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

interface StreamReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}

/** @internal */
export interface CompressionStreamLike {
  readonly writable: { getWriter(): StreamWriterLike };
  readonly readable: { getReader(): StreamReaderLike };
}

type CompressionStreamCtor = new (format: 'deflate' | 'deflate-raw') => CompressionStreamLike;

const encoder: TextEncoderLike | null = (() => {
  const Ctor = (globalThis as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  return Ctor ? new Ctor() : null;
})();

/** @internal UTF-8 bytes of a string. */
export function utf8(text: string): Uint8Array {
  if (encoder) return encoder.encode(text);
  const out: number[] = [];
  for (let i = 0; i < text.length; i++) {
    let c = text.charCodeAt(i);
    if (c >= 0xd800 && c < 0xdc00 && i + 1 < text.length) {
      const d = text.charCodeAt(i + 1);
      if (d >= 0xdc00 && d < 0xe000) {
        c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
        i++;
      }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

/** @internal Bytes of a string whose code units are all below 256 (PDF syntax). */
export function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 255;
  return out;
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256 * 8);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  // Slicing-by-8 tables.
  for (let n = 0; n < 256; n++) {
    let c = t[n] as number;
    for (let k = 1; k < 8; k++) {
      c = (t[c & 255] as number) ^ (c >>> 8);
      t[k * 256 + n] = c;
    }
  }
  return t;
})();

/** CRC-32 (IEEE) of `data`, continuing from `crc` (0 to start). */
export function crc32(data: Uint8Array, crc = 0): number {
  const t = CRC_TABLE;
  let c = ~crc;
  let i = 0;
  const n = data.length;
  const end8 = n - (n & 7);
  for (; i < end8; i += 8) {
    c ^= (data[i] as number) | ((data[i + 1] as number) << 8) | ((data[i + 2] as number) << 16) | ((data[i + 3] as number) << 24);
    c =
      (t[7 * 256 + (c & 255)] as number) ^
      (t[6 * 256 + ((c >>> 8) & 255)] as number) ^
      (t[5 * 256 + ((c >>> 16) & 255)] as number) ^
      (t[4 * 256 + (c >>> 24)] as number) ^
      (t[3 * 256 + (data[i + 4] as number)] as number) ^
      (t[2 * 256 + (data[i + 5] as number)] as number) ^
      (t[256 + (data[i + 6] as number)] as number) ^
      (t[data[i + 7] as number] as number);
  }
  for (; i < n; i++) c = (t[(c ^ (data[i] as number)) & 255] as number) ^ (c >>> 8);
  return ~c >>> 0;
}

/** @internal Concatenates chunks. */
export function concat(chunks: readonly Uint8Array[], length?: number): Uint8Array {
  const total = length ?? chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

/** @internal True when the platform offers `CompressionStream` with the format. */
export function canCompress(format: 'deflate' | 'deflate-raw'): boolean {
  const Ctor = (globalThis as { CompressionStream?: CompressionStreamCtor }).CompressionStream;
  if (!Ctor) return false;
  try {
    new Ctor(format);
    return true;
  } catch {
    return false;
  }
}

/** @internal Incremental compressor over the platform `CompressionStream`. */
export interface Deflater {
  write(bytes: Uint8Array): Promise<void>;
  /** Flushes and returns the compressed bytes. */
  close(): Promise<ByteChunks>;
}

/** @internal A streaming deflater, or null when the platform has none. */
export function createDeflater(format: 'deflate' | 'deflate-raw'): Deflater | null {
  const Ctor = (globalThis as { CompressionStream?: CompressionStreamCtor }).CompressionStream;
  if (!Ctor || !canCompress(format)) return null;
  const stream = new Ctor(format);
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) {
        chunks.push(value);
        length += value.length;
      }
    }
  })();
  let pending: Promise<void> = Promise.resolve();
  return {
    write(bytes) {
      // Writes are not awaited one by one (that would round-trip per chunk); backpressure is bounded by the caller's batch size.
      pending = writer.write(bytes);
      return pending;
    },
    async close() {
      await pending;
      await writer.close();
      await pump;
      return { chunks, length };
    },
  };
}

/** @internal Compresses one buffer (zlib `deflate` for PDF streams); null without platform support. */
export async function deflate(bytes: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array | null> {
  const d = createDeflater(format);
  if (!d) return null;
  await d.write(bytes);
  const out = await d.close();
  return concat(out.chunks, out.length);
}

/** Awaited between time slices. Default: a macrotask (`setTimeout(0)`). */
export type YieldFn = () => Promise<void>;

/** @internal */
export const defaultYield: YieldFn = () => {
  const timer = (globalThis as { setTimeout?: (fn: () => void, ms: number) => unknown }).setTimeout;
  return timer ? new Promise((resolve) => void timer(resolve, 0)) : Promise.resolve();
};

/** @internal Time slicer: `due()` is true once the current slice ran `sliceMs`; `pause()` yields and starts a new slice. */
export function createSlicer(sliceMs: number, yieldFn: YieldFn): { due(): boolean; pause(): Promise<void> } {
  let started = Date.now();
  return {
    due: () => Date.now() - started >= sliceMs,
    async pause() {
      await yieldFn();
      started = Date.now();
    },
  };
}
