import type { DataGridWarning } from './types.js';

// Bundlers replace `process.env.NODE_ENV` textually. When nothing replaces it
// and no `process` global exists (unbundled browser), the read throws and the
// default is production. The local declaration keeps the DOM- and Node-free
// lib configuration intact.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

function readDefaultDev(): boolean {
  try {
    return process.env.NODE_ENV !== 'production';
  } catch {
    return false;
  }
}

/** Development default derived from `process.env.NODE_ENV`. */
export const DEFAULT_DEV: boolean = readDefaultDev();

interface ConsoleLike {
  warn?(...args: unknown[]): void;
}

function defaultWarningHandler(warning: DataGridWarning): void {
  const console = (globalThis as { console?: ConsoleLike }).console;
  console?.warn?.(`[salmonui/grid] ${warning.message} (${warning.code}, grid "${warning.gridId}")`);
}

export type Warn = (code: string, message: string) => void;

/** Creates a per-engine warner that logs each distinct message once. */
export function createWarner(
  dev: boolean,
  gridId: string,
  handler: ((warning: DataGridWarning) => void) | undefined,
): Warn {
  if (!dev) return () => {};
  const seen = new Set<string>();
  const emit = handler ?? defaultWarningHandler;
  return (code, message) => {
    const key = `${code}\u0000${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    emit(Object.freeze({ code, message, gridId }));
  };
}
