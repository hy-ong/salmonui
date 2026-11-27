// Minimal ZIP writer (PKWARE APPNOTE 6.3): local headers, central directory,
// end record. Entries are deflated with the platform `CompressionStream`
// (`deflate-raw`) when available and stored otherwise. Entries are fed as a
// sequence of byte chunks, so a large worksheet is never held as one string.
// No ZIP64: an entry or archive above 4 GiB is rejected.

import { concat, crc32, createDeflater, utf8 } from './bytes.js';

interface Entry {
  readonly name: Uint8Array;
  readonly crc: number;
  readonly size: number;
  readonly compressedSize: number;
  readonly method: 0 | 8;
  readonly data: readonly Uint8Array[];
}

/** @internal Streaming input of one entry. */
export interface ZipEntryWriter {
  write(bytes: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

const LIMIT = 0xffffffff;
// 1980-01-01 00:00: fixed so identical input produces identical archives.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** @internal */
export class ZipWriter {
  private readonly entries: Entry[] = [];
  private readonly compress: boolean;

  constructor(options: { compress?: boolean } = {}) {
    this.compress = options.compress !== false;
  }

  /** Starts an entry; write its bytes, then close it before starting the next one. */
  entry(name: string): ZipEntryWriter {
    const deflater = this.compress ? createDeflater('deflate-raw') : null;
    const stored: Uint8Array[] = [];
    let crc = 0;
    let size = 0;
    return {
      write: async (bytes) => {
        crc = crc32(bytes, crc);
        size += bytes.length;
        if (deflater) await deflater.write(bytes);
        else stored.push(bytes);
      },
      close: async () => {
        let data: readonly Uint8Array[] = stored;
        let compressedSize = size;
        let method: 0 | 8 = 0;
        if (deflater) {
          const out = await deflater.close();
          data = out.chunks;
          compressedSize = out.length;
          method = 8;
        }
        if (size > LIMIT || compressedSize > LIMIT) throw new RangeError(`ZIP entry "${name}" exceeds 4 GiB.`);
        this.entries.push({ name: utf8(name), crc, size, compressedSize, method, data });
      },
    };
  }

  async add(name: string, content: string | Uint8Array): Promise<void> {
    const e = this.entry(name);
    await e.write(typeof content === 'string' ? utf8(content) : content);
    await e.close();
  }

  /** The archive bytes. */
  finish(): Uint8Array {
    const parts: Uint8Array[] = [];
    const central: Uint8Array[] = [];
    let offset = 0;
    for (const e of this.entries) {
      const local = new Uint8Array(30 + e.name.length);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true); // UTF-8 names
      lv.setUint16(8, e.method, true);
      lv.setUint16(10, DOS_TIME, true);
      lv.setUint16(12, DOS_DATE, true);
      lv.setUint32(14, e.crc, true);
      lv.setUint32(18, e.compressedSize, true);
      lv.setUint32(22, e.size, true);
      lv.setUint16(26, e.name.length, true);
      lv.setUint16(28, 0, true);
      local.set(e.name, 30);
      parts.push(local, ...e.data);

      const dir = new Uint8Array(46 + e.name.length);
      const dv = new DataView(dir.buffer);
      dv.setUint32(0, 0x02014b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, 0x0800, true);
      dv.setUint16(10, e.method, true);
      dv.setUint16(12, DOS_TIME, true);
      dv.setUint16(14, DOS_DATE, true);
      dv.setUint32(16, e.crc, true);
      dv.setUint32(20, e.compressedSize, true);
      dv.setUint32(24, e.size, true);
      dv.setUint16(28, e.name.length, true);
      dv.setUint32(42, offset, true);
      dir.set(e.name, 46);
      central.push(dir);
      offset += local.length + e.compressedSize;
      if (offset > LIMIT) throw new RangeError('ZIP archive exceeds 4 GiB.');
    }
    const dirSize = central.reduce((n, c) => n + c.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, this.entries.length, true);
    ev.setUint16(10, this.entries.length, true);
    ev.setUint32(12, dirSize, true);
    ev.setUint32(16, offset, true);
    return concat([...parts, ...central, end]);
  }
}
