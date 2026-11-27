// Blob helper. The package compiles without the DOM lib, so the
// platform `Blob` is read structurally from `globalThis`.

interface BlobCtor {
  new (parts: readonly unknown[], options?: { type?: string }): unknown;
}

/** Wraps an export file in a platform `Blob`; throws where `Blob` is unavailable. */
export function toBlob(file: { readonly data: Uint8Array | string; readonly mimeType: string }): unknown {
  const Blob = (globalThis as { Blob?: BlobCtor }).Blob;
  if (!Blob) throw new Error('toBlob: Blob is not available in this runtime.');
  return new Blob([file.data], { type: file.mimeType });
}
