import type { Json } from './data.js';

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * True when `value` survives a JSON round trip unchanged: null, booleans,
 * finite numbers, strings, arrays, and plain objects of those. `undefined` is
 * allowed only as an object property value (it is dropped by JSON).
 */
export function isJsonValue(value: unknown): value is Json {
  return checkJson(value, 0, false);
}

function checkJson(value: unknown, depth: number, inObject: boolean): boolean {
  if (depth > 64) return false;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'undefined':
      return inObject;
    case 'object': {
      if (value === null) return true;
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) if (!checkJson(value[i], depth + 1, false)) return false;
        return true;
      }
      if (!isPlainObject(value)) return false;
      for (const key of Object.keys(value)) {
        if (!checkJson((value as Record<string, unknown>)[key], depth + 1, true)) return false;
      }
      return true;
    }
    default:
      return false;
  }
}

/** Deep copy of a JSON value with every object and array frozen. Drops `undefined` properties. */
export function freezeJsonCopy<T>(value: T): T {
  if (typeof value !== 'object' || value === null) return value;
  if (Array.isArray(value)) {
    const out = new Array<unknown>(value.length);
    for (let i = 0; i < value.length; i++) out[i] = freezeJsonCopy(value[i]);
    return Object.freeze(out) as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = freezeJsonCopy(v);
  }
  return Object.freeze(out) as T;
}

/**
 * Deterministic JSON: object keys sorted, `undefined` and functions dropped,
 * array order preserved. Used for query cache keys and serialization.
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

export function shallowEqualArrays(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return false;
  return true;
}

/** Shallow equality for selector results: `Object.is`, or same keys/items with `Object.is` values. */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a)) return Array.isArray(b) && shallowEqualArrays(a, b);
  if (Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const key of ka) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) return false;
  }
  return true;
}
