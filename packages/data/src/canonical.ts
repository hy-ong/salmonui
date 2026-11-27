/**
 * Deterministic JSON: object keys sorted, `undefined` and functions dropped,
 * array order preserved. Byte-identical to `stableStringify` of `@salmonui/core/data`, so
 * `serializeDataGridQuery` here and in the core produce the same cache keys.
 */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonical(value)) ?? 'null';
}

function canonical(value: unknown): unknown {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'function' || v === undefined ? null : canonical(v)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v === undefined || typeof v === 'function') continue;
    out[key] = canonical(v);
  }
  return out;
}
