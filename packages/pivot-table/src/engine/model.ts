// Pivot report model defaults and stable serialization. Plain JSON in, frozen plain JSON out.
import type { PivotModel, PivotModelInput, PivotTotals } from './types.js';

const TOTALS: PivotTotals = Object.freeze({ grand: 'both', grandPosition: 'end', sub: true, subPosition: 'auto' });
const PLACEMENT = Object.freeze({ axis: 'columns', index: -1 } as const);
const EMPTY: readonly never[] = Object.freeze([]);
const NONE = Object.freeze({});

/** The normalized default model: every field present, nothing placed. */
export const DEFAULT_PIVOT_MODEL: PivotModel = Object.freeze({
  rows: EMPTY,
  columns: EMPTY,
  values: EMPTY,
  filters: EMPTY,
  filterBy: NONE,
  sort: NONE,
  valueSort: null,
  groups: NONE,
  calculatedFields: EMPTY,
  formats: NONE,
  conditionalFormats: EMPTY,
  expanded: EMPTY,
  totals: TOTALS,
  valuesPlacement: PLACEMENT,
  showEmptyMembers: false,
  showValueHeader: false,
});

const freezeDeep = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) freezeDeep(v);
    Object.freeze(value);
  }
  return value;
};

const clone = <T>(value: T): T => (value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T));

/**
 * Fills every default of a report model. The result is deeply frozen plain
 * JSON; normalizing a normalized model returns an equal model.
 */
export function normalizePivotModel(input: PivotModelInput = {}): PivotModel {
  const d = DEFAULT_PIVOT_MODEL as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(d)) {
    const v = (input as Record<string, unknown>)[key];
    out[key] = v === undefined ? d[key] : clone(v);
  }
  out.totals = { ...TOTALS, ...(input.totals ?? {}) };
  out.valuesPlacement = { ...PLACEMENT, ...(input.valuesPlacement ?? {}) };
  out.showEmptyMembers = input.showEmptyMembers === true;
  out.showValueHeader = input.showValueHeader === true;
  return freezeDeep(out) as unknown as PivotModel;
}

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value).sort()) {
      const v = (value as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = sortKeys(v);
    }
    return out;
  }
  return value;
};

/** Key-sorted JSON of a model with its default-valued fields omitted (stable cache and URL key). */
export function stableStringifyModel(model: PivotModel | PivotModelInput): string {
  const n = normalizePivotModel(model);
  const d = DEFAULT_PIVOT_MODEL as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(n)) {
    const s = JSON.stringify(sortKeys(v));
    if (s !== JSON.stringify(sortKeys(d[k]))) out[k] = v;
  }
  return JSON.stringify(sortKeys(out));
}
