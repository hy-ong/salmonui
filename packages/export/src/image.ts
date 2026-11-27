// Image cells, shared by the XLSX and PDF writers: format sniffing
// and a store that keeps one entry per distinct image (same `Uint8Array`, or
// the same bytes in another array). Only reached when a `cell` hook returns
// an `image`; the image-free path never calls into this file.

import type { ExportImage } from '@salmonui/core/export-model';
import { crc32 } from './bytes.js';

/** @internal PNG or JPEG (declared, else sniffed from the magic bytes); null when the image cannot be embedded. */
export function imageType(image: ExportImage): 'png' | 'jpeg' | null {
  const d = image.data;
  if (!(d instanceof Uint8Array) || !(image.width > 0) || !(image.height > 0) || !Number.isFinite(image.width) || !Number.isFinite(image.height)) return null;
  if (image.type) return image.type;
  if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4e && d[3] === 0x47) return 'png';
  if (d[0] === 0xff && d[1] === 0xd8) return 'jpeg';
  return null;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** @internal One value per distinct image bytes. */
export class ImageStore<T> {
  private readonly byRef = new Map<Uint8Array, T>();
  private readonly byKey = new Map<string, { readonly data: Uint8Array; readonly value: T }[]>();

  get(data: Uint8Array, create: () => T): T {
    const hit = this.byRef.get(data);
    if (hit !== undefined) return hit;
    const key = `${data.length}:${crc32(data)}`;
    let list = this.byKey.get(key);
    let found = list?.find((e) => sameBytes(e.data, data));
    if (!found) {
      found = { data, value: create() };
      if (list) list.push(found);
      else this.byKey.set(key, (list = [found]));
    }
    this.byRef.set(data, found.value);
    return found.value;
  }
}
