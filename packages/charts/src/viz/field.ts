// Record field access: a field name or a `'price.close'` dotted
// path over plain records, and numeric coercion of numbers and Date
// instances. The single implementation: `internal/viz/fields.ts` re-exports
// it for the React parts, `/sparkline` imports it from `#viz` directly.

/** The value at a field or dotted path, or undefined. */
export function readField(datum: unknown, path: string | undefined): unknown {
  if (datum === null || typeof datum !== 'object' || !path) return undefined;
  // One property read on the common hit (a 1,000,000-row chart reads every field); `in` only for undefined.
  const own = (datum as Record<string, unknown>)[path];
  if (own !== undefined || path in datum) return own;
  let v: unknown = datum;
  for (const k of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v;
}

/** Numbers and Date instances (epoch ms); anything else is NaN (an empty point). */
export const toNumber = (v: unknown): number => (typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Number.NaN);
